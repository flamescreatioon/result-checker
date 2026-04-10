"""
Department Results Extractor
============================
Extracts student results from scanned PDF files using OCR
and saves the output to Excel (.xlsx) and CSV files.

Requirements:
    pip install pdf2image pytesseract pandas openpyxl
    sudo apt install tesseract-ocr poppler-utils   (Linux)
    brew install tesseract poppler                  (macOS)

Usage:
    python extract_results.py --folder ./pdfs --output results.xlsx
"""

import os
import re
import json
import urllib.request
import urllib.error
import argparse
import pandas as pd
from pathlib import Path
from PIL import Image, ImageOps, ImageFilter

try:
    from pdf2image import convert_from_path
    from pdf2image.exceptions import PDFInfoNotInstalledError
except ImportError:
    raise ImportError("Run: pip install pdf2image")

try:
    import pytesseract
except ImportError:
    raise ImportError("Run: pip install pytesseract")


IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def resolve_poppler_path() -> str | None:
    """Best-effort Poppler bin discovery for Windows installations."""
    if os.name != "nt":
        return None

    env_path = os.environ.get("POPPLER_PATH")
    if env_path and Path(env_path).exists():
        return env_path

    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        return None

    winget_packages = Path(local_app_data) / "Microsoft" / "WinGet" / "Packages"
    if not winget_packages.exists():
        return None

    for pkg_dir in sorted(winget_packages.glob("oschwartz10612.Poppler_*"), reverse=True):
        for poppler_root in sorted(pkg_dir.glob("poppler-*"), reverse=True):
            bin_dir = poppler_root / "Library" / "bin"
            if (bin_dir / "pdfinfo.exe").exists():
                return str(bin_dir)

    return None

def pdf_to_images(pdf_path: str, dpi: int = 300):
    """Convert every page of a PDF to a PIL image."""
    print(f"  → Rendering pages at {dpi} DPI …")
    poppler_path = resolve_poppler_path()
    try:
        return convert_from_path(pdf_path, dpi=dpi, poppler_path=poppler_path)
    except PDFInfoNotInstalledError as exc:
        raise RuntimeError(
            "Poppler is required by pdf2image. On Windows, install via winget: "
            "winget install --id oschwartz10612.Poppler -e, then set POPPLER_PATH "
            "to Poppler's Library\\bin folder if needed."
        ) from exc


def load_image_path(image_path: str):
    """Load a single image file as a one-item page list."""
    with Image.open(image_path) as image:
        return [image.copy()]


def preprocess_image(image):
    """Apply lightweight preprocessing to improve OCR on noisy scans."""
    gray = ImageOps.grayscale(image)
    try:
        boosted = ImageOps.autocontrast(gray)
        denoised = boosted.filter(ImageFilter.MedianFilter(size=3))
        # Hard threshold often improves tabular OCR consistency.
        binary = denoised.point(lambda x: 255 if x > 165 else 0, mode="1")
        return binary.convert("L")
    except Exception:
        # Fallback path for very large or problematic pages.
        return gray


def ocr_data(image, psm: int = 6, min_conf: int = 35) -> dict:
    """Run Tesseract OCR and return token-level metadata for parsing."""
    config = f"--oem 3 --psm {psm}"
    try:
        data = pytesseract.image_to_data(
            image,
            config=config,
            output_type=pytesseract.Output.DICT,
            timeout=45,
        )
    except (RuntimeError, pytesseract.TesseractError):
        return {
            "text": [],
            "left": [],
            "top": [],
            "width": [],
            "height": [],
            "conf": [],
            "line_num": [],
            "block_num": [],
            "par_num": [],
        }

    cleaned = {
        "text": [],
        "left": [],
        "top": [],
        "width": [],
        "height": [],
        "conf": [],
        "line_num": [],
        "block_num": [],
        "par_num": [],
    }

    n = len(data.get("text", []))
    for i in range(n):
        text = (data["text"][i] or "").strip()
        if not text:
            continue
        try:
            conf = int(float(data["conf"][i]))
        except (ValueError, TypeError):
            continue
        if conf < min_conf:
            continue

        cleaned["text"].append(text)
        cleaned["left"].append(int(data["left"][i]))
        cleaned["top"].append(int(data["top"][i]))
        cleaned["width"].append(int(data["width"][i]))
        cleaned["height"].append(int(data["height"][i]))
        cleaned["conf"].append(conf)
        cleaned["line_num"].append(int(data["line_num"][i]))
        cleaned["block_num"].append(int(data["block_num"][i]))
        cleaned["par_num"].append(int(data["par_num"][i]))

    return cleaned


def normalize_ocr_text(text: str) -> str:
    """Normalize common OCR artifacts before strict parsing."""
    text = text.replace("|", "/")
    text = text.replace("\\", "/")
    text = text.replace("€", "E")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def build_lines_from_data(data: dict) -> list[str]:
    """Reconstruct text lines from OCR token metadata."""
    grouped: dict[tuple[int, int, int], list[tuple[int, str]]] = {}
    for i, token in enumerate(data.get("text", [])):
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        grouped.setdefault(key, []).append((data["left"][i], token))

    lines = []
    for _, items in grouped.items():
        items_sorted = sorted(items, key=lambda x: x[0])
        line = " ".join(tok for _, tok in items_sorted).strip()
        if line:
            lines.append(normalize_ocr_text(line))
    return lines


def is_likely_valid_row(row: dict) -> bool:
    """Accept only rows with enough structured evidence."""
    reg_ok = bool(row.get("Reg No")) and bool(re.search(r"\d", row["Reg No"]))
    # Require at least one meaningful field besides Reg No.
    has_course = bool(row.get("Course Code"))
    has_grade = bool(row.get("Grade"))
    has_score = bool(row.get("Score"))
    name_len_ok = len(row.get("Student Name", "").strip()) >= 4
    return reg_ok and (has_course or has_grade or has_score or name_len_ok)


def parse_results_table(lines: list[str]) -> list[dict]:
    """
    Parse OCR text into a list of row-dicts.

    Typical results-sheet columns (adapt as needed):
        Reg No | Student Name | Course Code | Score | Grade

    The parser looks for lines that start with something that looks like
    a registration/matriculation number, e.g.:
        2021/1234   John Doe   CSC301   72   B
        CSC/2020/001  Jane Doe  ...
    """
    rows = []

    # Common formats: 2021/12345 | CSC/2021/001 | U2021/1234
    reg_pattern = re.compile(
        r"\b([A-Z]{0,5}\s?/?\s?\d{4}\s?/?\s?\d{3,6})\b",
        re.IGNORECASE,
    )
    course_pattern = re.compile(r"\b[A-Z]{2,4}\d{3}\b", re.IGNORECASE)
    score_pattern = re.compile(r"\b(100|[1-9]?\d)\b")
    grade_pattern = re.compile(r"\b([ABCDEFX])\b", re.IGNORECASE)

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Skip obvious header/footer noise
        if any(kw in line.lower() for kw in ["page", "federal", "university", "department", "faculty", "session", "semester"]):
            continue

        match = reg_pattern.search(line)
        if not match:
            continue

        # Split everything after the reg number into remaining fields
        reg_no = re.sub(r"\s+", "", match.group(1).upper())
        after_reg = line[match.end():].strip()

        if not after_reg:
            continue

        # Pull known structured items first, then infer name from remainder.
        courses = course_pattern.findall(after_reg)
        score_match = score_pattern.search(after_reg)
        grade_match = grade_pattern.search(after_reg)
        score = score_match.group(1) if score_match else ""
        grade = grade_match.group(1).upper() if grade_match else ""
        course_code = courses[0].upper() if courses else ""

        cleaned = course_pattern.sub(" ", after_reg)
        if score:
            cleaned = re.sub(rf"\b{re.escape(score)}\b", " ", cleaned, count=1)
        if grade:
            cleaned = re.sub(rf"\b{re.escape(grade)}\b", " ", cleaned, count=1, flags=re.IGNORECASE)
        cleaned = re.sub(r"[^A-Za-z\s'-]", " ", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        student_name = cleaned

        candidate = {
            "Reg No":       reg_no,
            "Student Name": student_name,
            "Course Code":  course_code,
            "Score":        score,
            "Grade":        grade,
            "Source PDF":   "",   # filled in by caller
        }
        if is_likely_valid_row(candidate):
            rows.append(candidate)

    return rows


def parse_openrouter_json(content: str) -> list[dict]:
    """Parse JSON (or fenced JSON) returned by an LLM into list-of-dicts."""
    text = (content or "").strip()
    if not text:
        return []

    # Handle common fenced output: ```json ... ```
    fenced = re.search(r"```(?:json)?\s*(.*?)\s*```", text, flags=re.IGNORECASE | re.DOTALL)
    if fenced:
        text = fenced.group(1).strip()

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Best effort: find first JSON array region.
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1 or end <= start:
            return []
        try:
            parsed = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return []

    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


def extract_with_openrouter(lines: list[str], model: str, api_key: str, timeout: int = 60) -> list[dict]:
    """Use OpenRouter to convert noisy OCR lines into structured result rows."""
    if not lines:
        return []

    # Keep context bounded to reduce cost and avoid request limits.
    joined_lines = "\n".join(lines[:260])

    system_prompt = (
        "You extract university results table rows from noisy OCR text. "
        "Return ONLY a JSON array. No markdown, no commentary. "
        "Each row must use these keys exactly: "
        "Reg No, Student Name, Course Code, Score, Grade. "
        "If a field is unavailable, use an empty string."
    )
    user_prompt = (
        "OCR lines:\n"
        f"{joined_lines}\n\n"
        "Output format example:\n"
        "["
        "{\"Reg No\":\"2021/12345\",\"Student Name\":\"Jane Doe\",\"Course Code\":\"CSC301\",\"Score\":\"72\",\"Grade\":\"B\"}"
        "]"
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0,
    }

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        print(f"     OpenRouter request failed: {exc}")
        return []

    try:
        response_json = json.loads(body)
        content = response_json["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return []

    raw_rows = parse_openrouter_json(content)

    normalized_rows = []
    for row in raw_rows:
        candidate = {
            "Reg No": str(row.get("Reg No", "")).strip().upper(),
            "Student Name": str(row.get("Student Name", "")).strip(),
            "Course Code": str(row.get("Course Code", "")).strip().upper(),
            "Score": str(row.get("Score", "")).strip(),
            "Grade": str(row.get("Grade", "")).strip().upper(),
            "Source PDF": "",
        }
        if is_likely_valid_row(candidate):
            normalized_rows.append(candidate)

    return normalized_rows


def dedupe_rows(rows: list[dict]) -> list[dict]:
    """Deduplicate rows by a stable composite key while preserving order."""
    seen: set[tuple[str, str, str, str, str]] = set()
    out: list[dict] = []
    for row in rows:
        key = (
            str(row.get("Reg No", "")).strip().upper(),
            str(row.get("Student Name", "")).strip().upper(),
            str(row.get("Course Code", "")).strip().upper(),
            str(row.get("Score", "")).strip(),
            str(row.get("Grade", "")).strip().upper(),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def pick_best_rows(prepped_image, psm_values: list[int], min_conf: int) -> tuple[list[dict], dict, int]:
    """Run multiple OCR modes and keep the parse with highest valid-row count."""
    best_rows: list[dict] = []
    best_data: dict = {}
    best_psm = psm_values[0]

    for psm in psm_values:
        data = ocr_data(prepped_image, psm=psm, min_conf=min_conf)
        lines = build_lines_from_data(data)
        rows = parse_results_table(lines)
        if len(rows) > len(best_rows):
            best_rows = rows
            best_data = data
            best_psm = psm

    return best_rows, best_data, best_psm


def save_debug_artifacts(debug_dir: Path, pdf_name: str, page_no: int, image, lines: list[str], data: dict, used_psm: int):
    """Write per-page debug files to help parser tuning."""
    debug_dir.mkdir(parents=True, exist_ok=True)
    stem = f"{Path(pdf_name).stem}_p{page_no:03d}"

    image_path = debug_dir / f"{stem}_preprocessed.png"
    text_path = debug_dir / f"{stem}_ocr_lines.txt"
    boxes_path = debug_dir / f"{stem}_ocr_boxes.csv"

    image.save(image_path)
    text_path.write_text("\n".join(lines), encoding="utf-8")

    if data.get("text"):
        pd.DataFrame(data).to_csv(boxes_path, index=False)


def process_page_images(
    pages,
    source_name: str,
    debug: bool = False,
    debug_dir: Path | None = None,
    min_conf: int = 35,
    use_openrouter: bool = False,
    openrouter_model: str = "openai/gpt-4o-mini",
    openrouter_api_key: str = "",
) -> pd.DataFrame:
    """OCR a sequence of page images and return extracted result rows."""
    all_rows = []

    for i, img in enumerate(pages, start=1):
        print(f"  → OCR page {i}/{len(pages)} …")
        prepped = preprocess_image(img)
        rows, best_data, used_psm = pick_best_rows(prepped, psm_values=[4, 6, 11], min_conf=min_conf)
        parser_name = "rules"

        if use_openrouter and openrouter_api_key:
            llm_rows = extract_with_openrouter(
                lines=build_lines_from_data(best_data),
                model=openrouter_model,
                api_key=openrouter_api_key,
            )
            if len(llm_rows) >= len(rows):
                rows = llm_rows
                parser_name = "openrouter"

        if debug and debug_dir is not None:
            lines = build_lines_from_data(best_data)
            save_debug_artifacts(debug_dir, source_name, i, prepped, lines, best_data, used_psm)

        for row in rows:
            row["Source PDF"] = source_name
            row["OCR PSM"] = used_psm
            row["Parser"] = parser_name
        all_rows.extend(rows)
        print(f"     {len(rows)} record(s) found on page {i}")

    return pd.DataFrame(all_rows)


# ── Core Pipeline ─────────────────────────────────────────────────────────────

def process_pdf(
    pdf_path: str,
    debug: bool = False,
    debug_dir: Path | None = None,
    min_conf: int = 35,
    max_pages: int | None = None,
    use_openrouter: bool = False,
    openrouter_model: str = "openai/gpt-4o-mini",
    openrouter_api_key: str = "",
) -> pd.DataFrame:
    """OCR a scanned PDF and return a DataFrame of extracted results."""
    filename = os.path.basename(pdf_path)
    print(f"\nProcessing: {filename}")

    images = pdf_to_images(pdf_path, dpi=300)
    if max_pages is not None and max_pages > 0:
        images = images[:max_pages]
    return process_page_images(
        pages=images,
        source_name=filename,
        debug=debug,
        debug_dir=debug_dir,
        min_conf=min_conf,
        use_openrouter=use_openrouter,
        openrouter_model=openrouter_model,
        openrouter_api_key=openrouter_api_key,
    )


def process_image_file(
    image_path: str,
    debug: bool = False,
    debug_dir: Path | None = None,
    min_conf: int = 35,
    use_openrouter: bool = False,
    openrouter_model: str = "openai/gpt-4o-mini",
    openrouter_api_key: str = "",
) -> pd.DataFrame:
    """OCR a single image file and return extracted result rows."""
    filename = os.path.basename(image_path)
    print(f"\nProcessing image: {filename}")

    pages = load_image_path(image_path)
    return process_page_images(
        pages=pages,
        source_name=filename,
        debug=debug,
        debug_dir=debug_dir,
        min_conf=min_conf,
        use_openrouter=use_openrouter,
        openrouter_model=openrouter_model,
        openrouter_api_key=openrouter_api_key,
    )


def process_folder(
    folder: str,
    output: str,
    debug: bool = False,
    min_conf: int = 35,
    max_pages: int | None = None,
    use_openrouter: bool = False,
    openrouter_model: str = "google/gemma-4-31b-it:free",
    openrouter_api_key: str = "",
):
    """Process all PDFs and image files in a folder and write combined results."""
    input_dir = Path(folder)
    pdf_files = sorted(input_dir.glob("*.pdf"))
    image_files = sorted([path for path in input_dir.iterdir() if path.suffix.lower() in IMAGE_EXTENSIONS])

    if not pdf_files and not image_files:
        print(f"No PDF or image files found in '{folder}'")
        return

    print(f"Found {len(pdf_files)} PDF(s) and {len(image_files)} image(s) in '{folder}'")

    openrouter_api_key = (openrouter_api_key or "").strip() or os.environ.get("OPENROUTER_API_KEY", "").strip()
    if use_openrouter and not openrouter_api_key:
        print("⚠  --use-openrouter was provided but no OpenRouter API key was found.")
        print("   Pass --openrouter-api-key or set OPENROUTER_API_KEY.")
        print("   Falling back to local rule-based parsing only.")
        use_openrouter = False

    debug_dir = Path(folder) / "debug_ocr" if debug else None

    all_dfs = []
    for pdf_path in pdf_files:
        df = process_pdf(
            str(pdf_path),
            debug=debug,
            debug_dir=debug_dir,
            min_conf=min_conf,
            max_pages=max_pages,
            use_openrouter=use_openrouter,
            openrouter_model=openrouter_model,
            openrouter_api_key=openrouter_api_key,
        )
        all_dfs.append(df)

    for image_path in image_files:
        df = process_image_file(
            str(image_path),
            debug=debug,
            debug_dir=debug_dir,
            min_conf=min_conf,
            use_openrouter=use_openrouter,
            openrouter_model=openrouter_model,
            openrouter_api_key=openrouter_api_key,
        )
        all_dfs.append(df)

    combined = pd.concat(all_dfs, ignore_index=True) if all_dfs else pd.DataFrame()
    if not combined.empty:
        combined = pd.DataFrame(dedupe_rows(combined.to_dict(orient="records")))

    if combined.empty:
        print("\n⚠  No results were extracted. Check that your PDFs contain student data.")
        print("   Tip: Look at raw_ocr_sample.txt to see what Tesseract is reading.")
        return

    # ── Save outputs ──────────────────────────────────────────────────────────
    output_path = Path(output)
    xlsx_path = output_path.with_suffix(".xlsx")
    csv_path  = output_path.with_suffix(".csv")

    combined.to_excel(xlsx_path, index=False)
    combined.to_csv(csv_path, index=False)

    print(f"\n✅  Done! {len(combined)} total records extracted.")
    print(f"    Excel → {xlsx_path}")
    print(f"    CSV   → {csv_path}")

    # Quick preview
    print("\nPreview (first 5 rows):")
    print(combined.head().to_string(index=False))


def save_raw_ocr_sample(path: str):
    """
    Save raw OCR text from the first available PDF page or image.
    Useful for debugging the parser if extraction looks wrong.
    """
    input_path = Path(path)

    if input_path.is_file() and input_path.suffix.lower() in IMAGE_EXTENSIONS:
        pages = load_image_path(str(input_path))
        sample_name = input_path.name
    elif input_path.is_file() and input_path.suffix.lower() == ".pdf":
        pages = pdf_to_images(str(input_path), dpi=300)
        sample_name = input_path.name
    else:
        pdf_files = sorted(input_path.glob("*.pdf"))
        image_files = sorted([item for item in input_path.iterdir() if item.suffix.lower() in IMAGE_EXTENSIONS]) if input_path.exists() else []
        if pdf_files:
            pages = pdf_to_images(str(pdf_files[0]), dpi=300)
            sample_name = pdf_files[0].name
        elif image_files:
            pages = load_image_path(str(image_files[0]))
            sample_name = image_files[0].name
        else:
            return

    if not pages:
        return

    prepped = preprocess_image(pages[0])
    data = ocr_data(prepped, psm=6, min_conf=0)
    lines = build_lines_from_data(data)
    raw = "\n".join(lines)
    sample_path = input_path.parent / "raw_ocr_sample.txt" if input_path.is_file() else input_path / "raw_ocr_sample.txt"
    sample_path.write_text(raw, encoding="utf-8")
    print(f"\n📄 Raw OCR sample saved to: {sample_path}")
    print("   Use this to fine-tune the parser if results look incorrect.\n")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Extract student results from scanned PDFs")
    parser.add_argument("--folder", default="./pdfs",    help="Folder containing PDF files (default: ./pdfs)")
    parser.add_argument("--input", default="", help="Optional file or folder to process instead of --folder")
    parser.add_argument("--output", default="results",   help="Output filename without extension (default: results)")
    parser.add_argument("--debug",  action="store_true", help="Save per-page OCR debug artifacts for tuning")
    parser.add_argument("--min-conf", type=int, default=35, help="Minimum OCR confidence to keep token (default: 35)")
    parser.add_argument("--max-pages", type=int, default=None, help="Optional limit of pages per PDF (for faster tuning)")
    parser.add_argument("--use-openrouter", action="store_true", help="Use OpenRouter to improve row extraction from noisy OCR text")
    parser.add_argument("--openrouter-model", default="openai/gpt-4o-mini", help="OpenRouter model (default: openai/gpt-4o-mini)")
    parser.add_argument("--openrouter-api-key", default="", help="OpenRouter API key (overrides OPENROUTER_API_KEY env var)")
    args = parser.parse_args()

    if args.debug and args.max_pages == 1:
        save_raw_ocr_sample(args.input or args.folder)

    target = args.input or args.folder
    target_path = Path(target)
    if target_path.is_file() and target_path.suffix.lower() in IMAGE_EXTENSIONS:
        df = process_image_file(
            str(target_path),
            debug=args.debug,
            debug_dir=Path(target_path.parent) / "debug_ocr" if args.debug else None,
            min_conf=args.min_conf,
            use_openrouter=args.use_openrouter,
            openrouter_model=args.openrouter_model,
            openrouter_api_key=args.openrouter_api_key,
        )

        if not df.empty:
            output_path = Path(args.output)
            xlsx_path = output_path.with_suffix(".xlsx")
            csv_path = output_path.with_suffix(".csv")
            df.to_excel(xlsx_path, index=False)
            df.to_csv(csv_path, index=False)
            print(f"\n✅  Done! {len(df)} total records extracted.")
            print(f"    Excel → {xlsx_path}")
            print(f"    CSV   → {csv_path}")
            print("\nPreview (first 5 rows):")
            print(df.head().to_string(index=False))
        else:
            print("\n⚠  No results were extracted from the image.")
        return

    if target_path.is_file() and target_path.suffix.lower() == ".pdf":
        df = process_pdf(
            str(target_path),
            debug=args.debug,
            debug_dir=Path(target_path.parent) / "debug_ocr" if args.debug else None,
            min_conf=args.min_conf,
            max_pages=args.max_pages,
            use_openrouter=args.use_openrouter,
            openrouter_model=args.openrouter_model,
            openrouter_api_key=args.openrouter_api_key,
        )
        if not df.empty:
            output_path = Path(args.output)
            xlsx_path = output_path.with_suffix(".xlsx")
            csv_path = output_path.with_suffix(".csv")
            df.to_excel(xlsx_path, index=False)
            df.to_csv(csv_path, index=False)
            print(f"\n✅  Done! {len(df)} total records extracted.")
            print(f"    Excel → {xlsx_path}")
            print(f"    CSV   → {csv_path}")
            print("\nPreview (first 5 rows):")
            print(df.head().to_string(index=False))
        else:
            print("\n⚠  No results were extracted from the PDF.")
        return

    process_folder(
        target,
        args.output,
        debug=args.debug,
        min_conf=args.min_conf,
        max_pages=args.max_pages,
        use_openrouter=args.use_openrouter,
        openrouter_model=args.openrouter_model,
        openrouter_api_key=args.openrouter_api_key,
    )


if __name__ == "__main__":
    main()