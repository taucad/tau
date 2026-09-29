# @taucad/warehouse

## Responsibility

Editable parametric mechanical parts with portable geometry specifications

- Nx project: `warehouse`
- Project root: `packages/warehouse`
- Placement: `packages`
- Build mode: tsdown ESM build enabled
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:package`

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint warehouse
pnpm nx test warehouse --watch=false
pnpm nx typecheck warehouse
pnpm nx build warehouse
pnpm nx pkgcheck warehouse
pnpm nx size warehouse
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [packages AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)
- [Library API policy](../../docs/policy/library-api-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
