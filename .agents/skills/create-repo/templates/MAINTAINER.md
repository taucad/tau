# Maintainer Guide

## Pull requests

Require `ci-gate`, a Version Plan for shipped changes, and reviewable admission
edits for byte or timing regressions. Zero approvals is the solo-maintainer
ruleset; revisit it when a second maintainer joins.

## Release

1. Inspect pending Version Plans and registry state.
2. Run `pnpm release:prepare -- <version> --dry-run`.
3. Prepare the release on `release/@@CREATE_REPO_slug@@-v<version>`.
4. Commit only generated release files as
   `chore(release): @@CREATE_REPO_slug@@ v<version>`.
5. Open and merge the release pull request after `ci-gate` passes.

GitHub Actions owns npm OIDC publication, provenance, registry verification,
tags, GitHub Releases, and Vercel deployment. Do not publish from a workstation.

## Repository operations

Repository rules, secret scanning, push protection, and private vulnerability
reporting are managed through the `tau-cloud` stack. The npm Trusted
Publisher is bound to `taucad/@@CREATE_REPO_slug@@` and `.github/workflows/ci.yml`.
