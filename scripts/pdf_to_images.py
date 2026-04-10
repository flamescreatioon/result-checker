"""
PDF to Images Converter
=======================
Converts one PDF or all PDFs in a folder into per-page images.

Requirements:
    pip install pdf2image pillow

Usage examples:
    python pdf_to_images.py --input ./pdfs --output ./pdfs/images
    python pdf_to_images.py --input ./pdfs/sample.pdf --dpi 300 --format png
    python pdf_to_images.py --input ./pdfs --start-page 1 --end-page 3
"""

import argparse
import os
import re
from pathlib import Path

from pdf2image import convert_from_path
from pdf2image.exceptions import PDFInfoNotInstalledError


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


def render_pdf_pages(pdf_path: Path, dpi: int, first_page: int | None, last_page: int | None):
    poppler_path = resolve_poppler_path()
    kwargs = {
        "dpi": dpi,
        "poppler_path": poppler_path,
    }
    if first_page is not None:
        kwargs["first_page"] = first_page
    if last_page is not None:
        kwargs["last_page"] = last_page

    try:
        return convert_from_path(str(pdf_path), **kwargs)
    except PDFInfoNotInstalledError as exc:
        raise RuntimeError(
            "Poppler is required by pdf2image. Install it with winget: "
            "winget install --id oschwartz10612.Poppler -e --source winget "
            "--accept-source-agreements --accept-package-agreements. "
            "If needed, set POPPLER_PATH to Poppler's Library\\bin folder."
        ) from exc


def convert_pdf(
    pdf_path: Path,
    output_dir: Path,
    dpi: int,
    image_format: str,
    start_page: int | None,
    end_page: int | None,
) -> int:
    pages = render_pdf_pages(pdf_path, dpi=dpi, first_page=start_page, last_page=end_page)

    output_dir.mkdir(parents=True, exist_ok=True)
    stem = safe_name(pdf_path.stem)
    ext = "jpg" if image_format == "jpeg" else image_format

    for i, page in enumerate(pages, start=1):
        page_index = (start_page - 1 + i) if start_page else i
        out_name = f"{stem}_p{page_index:03d}.{ext}"
        out_path = output_dir / out_name

        if image_format == "jpeg":
            # JPEG does not support alpha channels.
            page = page.convert("RGB")
            page.save(out_path, format="JPEG", quality=95)
        else:
            page.save(out_path, format=image_format.upper())

    return len(pages)


def collect_pdf_paths(input_path: Path) -> list[Path]:
    if input_path.is_file() and input_path.suffix.lower() == ".pdf":
        return [input_path]
    if input_path.is_dir():
        return sorted(input_path.glob("*.pdf"))
    return []


def safe_name(value: str) -> str:
    """Make a filesystem-safe name for Windows output paths."""
    cleaned = re.sub(r'[<>:"/|?*]', '_', value)
    cleaned = cleaned.rstrip(" .")
    return cleaned or "page"


def parse_args():
    parser = argparse.ArgumentParser(description="Convert PDF files to page images")
    parser.add_argument("--input", required=True, help="PDF file or folder containing PDF files")
    parser.add_argument("--output", default="./images", help="Output folder for image files")
    parser.add_argument("--dpi", type=int, default=300, help="Render DPI (default: 300)")
    parser.add_argument("--format", choices=["png", "jpeg", "tiff"], default="png", help="Image format (default: png)")
    parser.add_argument("--start-page", type=int, default=None, help="First page number to export (1-based)")
    parser.add_argument("--end-page", type=int, default=None, help="Last page number to export (1-based)")
    return parser.parse_args()


def main():
    args = parse_args()

    input_path = Path(args.input)
    output_root = Path(args.output)

    if args.dpi < 72:
        raise ValueError("--dpi must be at least 72")
    if args.start_page is not None and args.start_page < 1:
        raise ValueError("--start-page must be >= 1")
    if args.end_page is not None and args.end_page < 1:
        raise ValueError("--end-page must be >= 1")
    if args.start_page and args.end_page and args.start_page > args.end_page:
        raise ValueError("--start-page cannot be greater than --end-page")

    pdf_files = collect_pdf_paths(input_path)
    if not pdf_files:
        raise FileNotFoundError(f"No PDF files found from input: {input_path}")

    total_pages = 0
    print(f"Found {len(pdf_files)} PDF(s)")

    for pdf in pdf_files:
        target_dir = output_root / safe_name(pdf.stem) if input_path.is_dir() else output_root
        print(f"Converting: {pdf.name}")
        pages_written = convert_pdf(
            pdf_path=pdf,
            output_dir=target_dir,
            dpi=args.dpi,
            image_format=args.format,
            start_page=args.start_page,
            end_page=args.end_page,
        )
        total_pages += pages_written
        print(f"  Wrote {pages_written} image(s) to {target_dir}")

    print(f"Done. Total images written: {total_pages}")


if __name__ == "__main__":
    main()
