# Maintainer Guide

## Pull requests

Require `ci-gate`, a Version Plan for shipped changes, and reviewable admission
edits for byte or timing regressions. Zero approvals is the solo-maintainer
ruleset; revisit it when a second maintainer joins.

## Release

Version Plans drive releases. After every successful `main` CI run with
pending plans, `release-pr.yml` regenerates the release commit through
`release:prepare --from-plans` as `tau-release-bot` and force-updates the
standing pull request on `release/next`; with none pending it closes the pull
request. Review it and squash-merge it with the title unchanged; that is the
entire release act. Do not push to `release/next` or enable auto-merge on it.

GitHub Actions owns npm OIDC publication, provenance, registry verification,
tags, GitHub Releases, and Vercel deployment. Do not publish from a workstation.

Manual fallback when the bot is broken: on a fresh branch off `main`, run
`pnpm release:prepare -- <version> --dry-run` and then the real run, commit
only generated release files as `chore(release): @@CREATE_REPO_slug@@ v<version>`,
and open the pull request yourself.

## Registry administration

Every package in the fixed release group has one npm Trusted Publisher:
repository `taucad/@@CREATE_REPO_slug@@`, workflow filename `ci.yml`, publish
allowed, no environment. npm matches the filename exactly; a provenance-signed
publish that fails with `E404` means the binding names another workflow. Audit
bindings with `npm trust list <package> --json` and never replace a correct one.
Publishing access requires two-factor authentication and disallows tokens.

Trust binds only to an existing package. Reserving a name is an operator act:
publish a manifest-only `0.0.0` placeholder under the `bootstrap` tag, then bind
the publisher. npm also points `latest` at the placeholder until the first real
release moves it.

## Repository operations

The `tau-cloud` stack manages repository rules (squash-only merges titled from
the pull request, `ci-gate` required), secret scanning, push protection,
private vulnerability reporting, and the `release-pr` environment that holds
the `tau-release-bot` credentials.
