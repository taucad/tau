---
name: release-@@CREATE_REPO_slug@@
description: Audits or prepares reviewed @@CREATE_REPO_npm-name@@ releases. Use only when a maintainer explicitly invokes /release-@@CREATE_REPO_slug@@.
disable-model-invocation: true
argument-hint: '[status | prepare <version> | submit <version>]'
---

# Release @@CREATE_REPO_npm-name@@

GitHub Actions is the sole owner of npm publication, provenance, tags, GitHub
Releases, and Vercel deployment.

## Modes

- `status`: inspect package, Version Plans, open release pull requests, recent
  `ci.yml` runs, npm versions/provenance, GitHub releases, and Vercel state.
- `prepare <version>`: validate and generate release files locally, then stop
  without committing or pushing.
- `submit <version>`: prepare on `release/@@CREATE_REPO_slug@@-v<version>`, validate, commit,
  push, and open one pull request.

Reject other arguments.

## Prepare or submit

1. Require clean `main`, `HEAD == origin/main`, a Version Plan, stable exact
   SemVer, and no conflicting open release pull request.
2. Run `pnpm release:prepare -- <version> --dry-run`.
3. For submit, create `release/@@CREATE_REPO_slug@@-v<version>`.
4. Run `pnpm release:prepare -- <version>`.
5. Require changes only to `package.json`, `pnpm-lock.yaml`, `CHANGELOG.md`, and
   consumed `.nx/version-plans/*.md` files.
6. Run `pnpm nx run @@CREATE_REPO_slug@@:quality` and `git diff --check`.
7. For submit, commit exactly `chore(release): @@CREATE_REPO_slug@@ v<version>`, push, and
   open a pull request describing the package, version, plan, and validations.

## Boundaries

- Never run `npm publish`, create tags/releases, deploy, or change settings.
- Never mix source changes into a release pull request.
- Never publish from a feature branch or force-push `main`.
- Never edit generated changelog text without reconciling the Version Plan.
