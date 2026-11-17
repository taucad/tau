# @taucad/cadmpeg

## Responsibility

SOLIDWORKS, CATIA, Inventor, Fusion, FreeCAD and Rhino import and native export for @taucad/runtime, powered by cadmpeg

- Nx project: `cadmpeg`
- Project root: `packages/plugins/cadmpeg`
- Placement: `packages/plugins`
- Capabilities: `kernel, transcoder`
- Host target: `browser`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/cadmpeg.plugin.ts`
- `src/cadmpeg.kernel.ts`
- `src/cadmpeg.transcoder.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint cadmpeg
pnpm nx test cadmpeg --watch=false
pnpm nx typecheck cadmpeg
pnpm nx build cadmpeg
pnpm nx pkgcheck cadmpeg
pnpm nx size cadmpeg
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
