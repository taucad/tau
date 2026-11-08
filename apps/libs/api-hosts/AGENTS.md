# @taucad/api-hosts

## Responsibility

API host devices, cloud hosts and host relay

- Nx project: `api-hosts`
- Project root: `apps/libs/api-hosts`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:api, type:app-lib, layer:feature, api:hosts`

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint api-hosts
pnpm nx test api-hosts --watch=false
pnpm nx typecheck api-hosts
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [apps AGENTS](../../AGENTS.md)
- [apps/libs AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
