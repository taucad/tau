---
name: create-core
description: Create or update a small publishable @taucad/*-core support package under packages/core. Use when multiple public packages need dependency-light implementation helpers that do not belong to a domain package or runtime plugin. Agents should select this skill autonomously when that ownership boundary is clear.
---

# Create Core Package

Use a core package only for small dependency-light helpers shared by multiple
published packages. Prefer the owning domain package when one capability owns
the code, and `/create-plugin` for runtime capabilities.

## Create

Inspect `tools/workspace-plugin/src/generators/core/schema.json`, then use the
only supported scaffold:

```bash
pnpm nx g @taucad/workspace-plugin:core <name> \
  --packageName=@taucad/<name>-core \
  --description="<one-line description>"
```

Update an existing package in place. Do not rerun the generator.

New core projects also receive `AGENTS.md` and exact `CLAUDE.md` import files
from the shared instruction template. The starter uses `packageName` without
`@taucad/` as the Nx identity, even when the directory `name` differs, and lists
the core entrypoint and inferred Nx checks. Maintain the local AGENTS after
creation; never rerun the full creator over an existing project.

## Complete and Verify

Implement only the requested public helpers, add `@public` JSDoc and behavioral
tests, derive dependencies from imports, and keep app/React/plugin code out.
Run install when dependencies change, then lint, test, typecheck, build,
pkgcheck, packed-artifact, size, README, and Apache-2.0 provenance checks. Do
not stop at the generated baseline.
