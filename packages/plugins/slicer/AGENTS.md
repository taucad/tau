# @taucad/slicer

## Responsibility

FFF slicing to Bambu gcode.3mf with a reference engine and a tau-slicer-service client

- Nx project: `slicer`
- Project root: `packages/plugins/slicer`
- Placement: `packages/plugins`
- Capabilities: `transcoder`
- Host target: `browser`
- Build mode: tsdown ESM build enabled

## Entrypoints

- `src/index.ts`
- `src/slicer.plugin.ts`
- `src/slicer.transcoder.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint slicer
pnpm nx test slicer --watch=false
pnpm nx typecheck slicer
pnpm nx build slicer
pnpm nx pkgcheck slicer
pnpm nx size slicer
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

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
