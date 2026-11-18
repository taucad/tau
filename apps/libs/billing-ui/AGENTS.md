# @taucad/billing-ui

## Responsibility

Tau UI app billing feature: plan, credits and usage pieces that read no app state

- Nx project: `billing-ui`
- Project root: `apps/libs/billing-ui`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled with jsdom test setup
- Tags: `scope:ui, type:app-lib, layer:feature`

## Entrypoints

- `package.json` exports: one subpath per module under `src/`, pinned by `src/exports.test.ts`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint billing-ui
pnpm nx test billing-ui --watch=false
pnpm nx typecheck billing-ui
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

- Layer `feature`: never import `apps/ui`. What moved, what stays in the app and why: see the [README](./README.md).

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
