# @taucad/agent-observability

## Responsibility

Shared agent evidence contract and portable Pi telemetry adapter

- Nx project: `agent-observability`
- Project root: `libs/agent-observability`
- Placement: `libs`
- Build mode: tsdown ESM build enabled
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:lib`

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint agent-observability
pnpm nx test agent-observability --watch=false
pnpm nx typecheck agent-observability
pnpm nx build agent-observability
pnpm nx size agent-observability
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [libs AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
