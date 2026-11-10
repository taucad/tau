# @taucad/project-workspace

## Responsibility

Tau UI app project workspace: route-private components, hooks and project-open logic

- Nx project: `project-workspace`
- Project root: `apps/libs/project-workspace`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled with jsdom test setup
- Tags: `scope:ui, type:app-lib, layer:feature`

## Entrypoints

- `package.json` exports: one subpath per module under `src/components`, `src/hooks` and `src/utils`; pinned by `src/exports.test.ts`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint project-workspace
pnpm nx test project-workspace --watch=false
pnpm nx typecheck project-workspace
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

- Layer `feature`: never import `apps/ui` (`#components/*`, `#hooks/*`, `#lib/*`, `#routes/*`, `#environment.config`). A module moves here only when everything it imports, tests included, is already a package or an app-lib; the route modules and everything still bound to app state stay in `apps/ui/app/routes/w.$workspace.$project`.
- Never import React Router generated route types (`+types/*`); `typegen` stays with `apps/ui`.
- Chat modules belong to `chat-ui`, not here.
- `apps/ui/vite.config.ts` applies the React Compiler to `src/**`, and `apps/ui/app/styles/global.css` scans it with `@source`, as when these files lived in `apps/ui/app`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
