# @taucad/smlib

## Responsibility

SMLib kernel plugin for Tau

- Nx project: `smlib`
- Project root: `packages/plugins/smlib`
- Placement: `packages/plugins`
- Capabilities: `kernel`
- Host target: `browser`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/smlib.plugin.ts`
- `src/smlib.kernel.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint smlib
pnpm nx test smlib --watch=false
pnpm nx typecheck smlib
pnpm nx build smlib
pnpm nx pkgcheck smlib
pnpm nx size smlib
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

- `@classcad/smlibwasm` is pinned exactly in the pnpm catalog; a bump changes meshes and snapshots, so bump this kernel's `version` with it.
- Its shape constructors are functions (`Box(...)`, `Pos(...).mul(...)`), not classes; `Mesh` is the one class authors construct.
- Bodies are tessellated whole so faces share boundary samples; face groups come from the contiguous per-face triangle runs (`findFaceRuns`). A Part whose body mesh is open falls back to per-face meshes when those close better (0.3.4 leaves a moved torus's seam open).
- Edges and wires are sampled into `DrawingEntry` polylines at evaluation, so drawings survive the msgpack handle snapshot; bodies snapshot losslessly through `toSmb`/`fromSmb`.
- Library tracing wraps values built in `user-main` (shapes have no private fields); the tracer unwraps `main`'s result before the kernel reads it.
