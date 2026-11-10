# @taucad/ui-core

## Responsibility

Tau UI app core utilities, constants, workers and services that read no app state

- Nx project: `ui-core`
- Project root: `apps/libs/ui-core`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled; tests run in node, and a suite that renders opts into jsdom
- Tags: `scope:ui, type:app-lib, layer:data-access`

## Entrypoints

- `package.json` exports: one subpath per module under `src/`, pinned by `src/exports.test.ts`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint ui-core
pnpm nx test ui-core --watch=false
pnpm nx typecheck ui-core
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

- Layer `data-access`: never import `apps/ui` (`#components/*`, `#hooks/*`, `#lib/*`, `#environment.config`), and never a `layer:feature` or `layer:ui` library (`ui-kit`, `chat-ui`, `project-workspace`, the wave D libraries). A module moves here only when everything it imports, tests included, is already a package or an app-lib of this layer or below.
- Lib-internal imports use `#<path>.js`; `package.json` maps `#*` to `./src/*`, and TypeScript and Vite resolve `.js` to the `.ts` source.
- Code that reads `import.meta.env`, `window.ENV`, the build-time globals in `apps/ui/vite-environment.d.ts`, or that a Vite alias, the server entry or a script names by path stays in the app.
- Tests run in node; a suite that needs the DOM starts with `// @vitest-environment jsdom`. `vitest.setup.ts` installs jest-dom, cleanup and the realm-safe `TextEncoder` that jsdom suites need.
- `apps/ui/vite.config.ts` applies the React Compiler to `src/**`, and `apps/ui/app/styles/global.css` scans it with `@source`, as when these files lived in `apps/ui/app`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
