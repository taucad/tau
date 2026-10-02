# AGENTS.md

## Commands

```bash
pnpm nx run @@CREATE_REPO_slug@@:quality
pnpm nx run @@CREATE_REPO_slug@@:test
pnpm nx run @@CREATE_REPO_slug@@:build
pnpm nx run @@CREATE_REPO_slug@@:validate-pack
```

## Architecture

@@CREATE_REPO_architecture-summary@@

## Conventions

- ESM-only public API through package exports.
- Keep `unbundle: true`; binary URL resolution depends on relative output.
- Public exports require stable JSDoc and consumer-shape tests.
- GitHub Actions is the sole npm publisher.
- Every compatibility check mark maps to a CI job.
- Admission changes are explicit budget or benchmark-identity diffs.

## Skills

| Skill                          | When to use                                      |
| ------------------------------ | ------------------------------------------------ |
| `release-@@CREATE_REPO_slug@@` | Auditing or preparing a reviewed package release |
