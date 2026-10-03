# Contributing

## Local checks

1. Install dependencies with `npm install` from the repository root.
2. Copy the environment examples and provide local values as described in the
   README.
3. Run `npm run build` before opening a pull request.
4. Run `npm run version:check` to verify the release version format.

Do not commit environment files, database URLs, student records, uploads, PDFs,
OCR output, or other private data. The `.gitignore` rules protect these files,
but contributors remain responsible for reviewing staged changes.

## Branches and commits

Create a short-lived branch from `main`. Use Conventional Commit-style messages:

- `feat: add result export`
- `fix: handle missing semester`
- `docs: clarify Vercel setup`
- `chore: update dependencies`

Use `feat!:` or add a `BREAKING CHANGE:` footer when a change is incompatible
with existing API or user behavior.

## Pull requests

Keep each pull request focused, explain the user impact, and include the checks
you ran. At least one reviewer should approve changes before merging to `main`.
Do not commit directly to a protected `main` branch.
