# @taucad/heif

## Responsibility

HEIC/HEIF image transcoder for @taucad/runtime

- Nx project: `heif`
- Project root: `packages/plugins/heif`
- Placement: `packages/plugins`
- Capabilities: `transcoder`
- Host target: `browser`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/heif.plugin.ts`
- `src/heif.transcoder.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint heif
pnpm nx test heif --watch=false
pnpm nx typecheck heif
pnpm nx build heif
pnpm nx pkgcheck heif
pnpm nx size heif
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [packages AGENTS](../../AGENTS.md)
- [packages/plugins AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Plugin workflow](../../../.agents/skills/create-plugin/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Runtime architecture policy](../../../docs/policy/runtime-architecture-policy.md)
- [Library API policy](../../../docs/policy/library-api-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- `libheif-js` (LGPL-3.0) is an external dependency, never bundled. Import only its non-bundled glue `libheif-js/libheif-wasm/libheif.js`; never the base64-inlined `libheif-bundle.*` (invariant I7, pinned by `heif.vite-build.test.ts`).
- `libheif.wasm` is an `on-use` implementation asset with a pinned SHA-256 in `src/heif-decoder.ts`. A `libheif-js` bump changes that pin, `src/fixtures/golden.json`, the transcoder `version`, and `libheifRelease` in `scripts/src/update-open-source-notices.mts` (the exact libheif and libde265 sources) in one change.
- Admission reads the HEIC `ispe` through `@taucad/utils/image-probe` before libheif loads; output encoding is `encodeRasterImage` from `@taucad/image/raster`, never a second encoder.
- The desktop app keeps `libheif-*.wasm` unpacked beside the ASAR (`apps/desktop/scripts/runtime-stage.mts`).

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
