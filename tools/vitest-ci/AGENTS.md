# @taucad/vitest-ci

## Responsibility

Shared Vitest reporter list and the CI test outcome recorder for every Tau test target

- Nx project: `vitest-ci`
- Project root: `tools/vitest-ci`
- Placement: `tools`
- Build mode: tsdown ESM build enabled
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:tool`

## Entrypoints

- `src/test-reporters.ts` (`@taucad/vitest-ci`): `testReporters`, the list every Vitest config uses
- `src/outcome-reporter.ts` (`@taucad/vitest-ci/outcome-reporter`): `OutcomeReporter` and the outcome row schema
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint vitest-ci
pnpm nx test vitest-ci --watch=false
pnpm nx typecheck vitest-ci
pnpm nx build vitest-ci
pnpm nx size vitest-ci
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [tools AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
