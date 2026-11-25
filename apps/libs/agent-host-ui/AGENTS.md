# @taucad/agent-host-ui

## Responsibility

Tau UI app agent-host adapters: the agent protocol over the UI app domains, for the agent-host and file-manager workers

- Nx project: `agent-host-ui`
- Project root: `apps/libs/agent-host-ui`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:ui, type:app-lib, layer:feature, ui:agent-host-ui`

## Entrypoints

- `package.json` exports: one subpath per module under `src/lib` and `src/workers`; pinned by `src/exports.test.ts`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint agent-host-ui
pnpm nx test agent-host-ui --watch=false
pnpm nx typecheck agent-host-ui
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

- Layer L3 (`ui:agent-host-ui`): `eslint.config.mjs` names the UI app libraries it may depend on. Never import `apps/ui`; the worker entries that compose these adapters stay there.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
