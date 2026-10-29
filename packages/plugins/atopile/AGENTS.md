# @taucad/atopile

## Responsibility

atopile EDA kernel for Tau: .ato circuits compiled by atopile and rendered to 3D boards, schematic and PCB SVG, with BOM exports

- Nx project: `atopile`
- Project root: `packages/plugins/atopile`
- Placement: `packages/plugins`
- Capabilities: `kernel`
- Host target: `node`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/atopile.plugin.ts`
- `src/atopile.kernel.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint atopile
pnpm nx test atopile --watch=false
pnpm nx typecheck atopile
pnpm nx build atopile
pnpm nx pkgcheck atopile
pnpm nx size atopile
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

- Spike status: the kernel spawns `python/atopile_worker.py` under a caller-supplied CPython 3.14 with atopile 0.15.x; no Tau host lists it yet.
- Kernel tests that need atopile run only when `TAU_ATOPILE_PYTHON` names that interpreter; the IR-to-circuit tests always run.
- `fixtures/divider` is a placed, picker-free project (atomic parts, committed KiCad layout); only `UNI_ROYAL_0402WGF1002TCE` keeps its STEP model to bound repository size.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
