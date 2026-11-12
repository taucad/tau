# @taucad/preferences

## Responsibility

The person record on the device: section schemas, merge rules and setup suggestions shared by the Tau app and, with account sync, the API

- Nx project: `preferences`
- Project root: `apps/libs/preferences`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:app-lib, layer:util`

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint preferences
pnpm nx test preferences --watch=false
pnpm nx typecheck preferences
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
