# Versioning and Releases

The root `package.json` is the release source of truth. The current application
version is `1.0.0`.

## Version format

This project uses Semantic Versioning: `MAJOR.MINOR.PATCH`.

- Increment **PATCH** for backwards-compatible bug fixes and documentation-only
  maintenance releases.
- Increment **MINOR** for backwards-compatible functionality.
- Increment **MAJOR** for breaking API, configuration, or user-facing changes.

Pre-release versions may use the standard suffix, such as `1.1.0-rc.1`.

## Release procedure

1. Start from an up-to-date, clean `main` branch.
2. Add user-facing changes under `Unreleased` in `CHANGELOG.md`.
3. Run `npm run build` and `npm run version:check`.
4. Choose the release increment and run one command:

   ```sh
   npm run release:patch
   npm run release:minor
   npm run release:major
   ```

   `npm version` updates the root package files, creates a release commit, and
   creates an annotated tag such as `v1.0.1`.
5. Move the `Unreleased` notes into a dated version heading in `CHANGELOG.md`,
   commit that change if it was not included in the release commit, and push the
   branch and tags:

   ```sh
   git push origin main --follow-tags
   ```

6. Create the matching GitHub Release from the tag and use the changelog entry
   as the release notes. Deploy only after the GitHub release is published.

## Verification

`npm run version:check` verifies that the root version conforms to Semantic
Versioning. It does not create a tag or publish anything.
