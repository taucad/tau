# @taucad/publish-ui

## Responsibility

Tau UI app publish feature: publication access and recipient-email components that read no app state

- Nx project: `publish-ui`
- Project root: `apps/libs/publish-ui`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled; tests run in jsdom, as they did in `apps/ui`
- Tags: `scope:ui, type:app-lib, layer:feature`

## Entrypoints

- `package.json` exports: one subpath per module under `src/`, pinned by `src/exports.test.ts`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint publish-ui
pnpm nx test publish-ui --watch=false
pnpm nx typecheck publish-ui
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
- `@taucad/share` stays the React-free sharing data layer (`scope:shared`, consumed by `apps/api`); publish UI lives here and imports it.
- App services arrive by injection (props, context or factory arguments), never by import.
- Lib-internal imports use `#<path>.js`; `package.json` maps `#*` to `./src/*`, and TypeScript and Vite resolve `.js` to the `.ts`/`.tsx` source.
- `apps/ui/vite.config.ts` applies the React Compiler to `src/**`, and `apps/ui/app/styles/global.css` scans it with `@source`, as when these files lived in `apps/ui/app`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
