# @taucad/revisions-ui

## Responsibility

Tau UI app revisions feature: the History graph layout and view, revision timeline styles, the revision region and name popover, entry titles and the revision compute worker, none of which read app state

- Nx project: `revisions-ui`
- Project root: `apps/libs/revisions-ui`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled; tests run in jsdom, as they did in `apps/ui`
- Tags: `scope:ui, type:app-lib, layer:feature`

## Entrypoints

- `package.json` exports: one subpath per module under `src/` (a `*.worker.ts` entry has none), pinned by `src/exports.test.ts`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint revisions-ui
pnpm nx test revisions-ui --watch=false
pnpm nx typecheck revisions-ui
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

- Layer `feature`: never import `apps/ui` (`#components/*`, `#hooks/*`, `#lib/*`, `#routes/*`, `#environment.config`). A module moves here only when everything it imports, tests included, is already a package or an app-lib.
- Lib-internal imports use `#<path>.js`; `package.json` maps `#*` to `./src/*`, and TypeScript and Vite resolve `.js` to the `.ts`/`.tsx` source.
- `machines/revision-compute.ts` starts `revision-compute.worker.ts` with `new Worker(new URL(...))` from the app's file-manager worker; `apps/ui/vite.config.ts` admits it through its `../libs/*/src/**/*.worker.ts` optimizer entry. A `*.worker.ts` entry has no subpath.
- `apps/ui/vite.config.ts` applies the React Compiler to `src/**`, and `apps/ui/app/styles/global.css` scans it with `@source`, as when these files lived in `apps/ui/app`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
