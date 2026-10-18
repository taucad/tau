# @taucad/smlibpy

## Responsibility

Native SMLibPy kernel for Tau

- Nx project: `smlibpy`
- Project root: `packages/plugins/smlibpy`
- Placement: `packages/plugins`
- Capabilities: `kernel`
- Host target: `python`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/smlibpy.plugin.ts`
- `src/smlibpy.kernel.ts`
- `src/native.ts`
- `src/smlibpy.schemas.ts`
- `tau-plugin.json`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint smlibpy
pnpm nx test smlibpy --watch=false
pnpm nx typecheck smlibpy
pnpm nx build smlibpy
pnpm nx pkgcheck smlibpy
pnpm nx size smlibpy
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [packages AGENTS](../../AGENTS.md)
- [packages/plugins AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Plugin workflow](../../../.agents/skills/create-plugin/SKILL.md)
- [Create Kernel workflow](../../../.agents/skills/create-kernel/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Runtime architecture policy](../../../docs/policy/runtime-architecture-policy.md)
- [Library API policy](../../../docs/policy/library-api-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.

- Every runtime lists `smlibpy()` before `build123d()`: `smlibpyDetectPattern` (`src/smlibpy.constants.ts`) claims a `.py` entry only when a top-level line imports `smlibpy`. The UI's catalog row comes after Build123d's so extension-only lookups still pick Build123d.
- The worker writes a `TAUSMLB1` mesh bundle (`python/worker.py`), and `src/smlibpy-bundle.ts` reads it; `src/smlibpy-gltf.ts` builds the GLB in TypeScript, following `@taucad/smlib`'s converter. Change both sides together and bump the kernel version.
- The model contract (`ShapeConfig`, `Model`, materials, `mechanism`) is SMLib's (`@taucad/smlib/model`) as plain Python data, normalized in `python/smlibpy_materials.py` and `python/smlibpy_mechanisms.py`.
- `python/tests` requires 100% line and branch coverage (`nx run smlibpy:test-python`); `tau-plugin.json`, the SBOM and `project/` are generated (`generate-tau-plugin`, `generate-project-template`) and excluded from oxfmt.
- `tau-plugin.golden.json` stays `{}` until a `smlibpy-tau-plugin.yml` dispatch records golden receipts.
