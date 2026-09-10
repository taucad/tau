# @taucad/configuration-core

## Responsibility

Standard Schema configuration manifests and admission

- Nx project: `configuration-core`
- Project root: `packages/core/configuration`
- Placement: `packages/core`
- Package kind: publishable dependency-light core support
- Build mode: tsdown ESM build enabled
- Host target: browser

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint configuration-core
pnpm nx test configuration-core --watch=false
pnpm nx typecheck configuration-core
pnpm nx build configuration-core
pnpm nx pkgcheck configuration-core
pnpm nx size configuration-core
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [packages AGENTS](../../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Core workflow](../../../.agents/skills/create-core/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Library API policy](../../../docs/policy/library-api-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
