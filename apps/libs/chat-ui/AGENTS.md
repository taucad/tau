# @taucad/chat-ui

## Responsibility

Tau UI app chat presentation, composer and transport building blocks

- Nx project: `chat-ui`
- Project root: `apps/libs/chat-ui`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled with jsdom test setup
- Tags: `scope:ui, type:app-lib, layer:feature`

## Entrypoints

- `package.json` exports: one subpath per module under `src/`, pinned by `src/exports.test.ts`
- `project.json` (`formal:lean` over `specs/lean`)

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint chat-ui
pnpm nx test chat-ui --watch=false
pnpm nx typecheck chat-ui
pnpm nx run chat-ui:formal:lean
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

- Never import `apps/ui` (`#components/*`, `#hooks/*`, `#lib/*`, `#environment.config`). Code that needs app state (project, file manager, models, env, auth, `lib/xstate.lib`) stays in the app or takes that state as a prop, callback or context value.
- Lib-internal imports use `#<path>.js`; `package.json` maps `#*` to `./src/*`, and TypeScript and Vite resolve `.js` to the `.ts` or `.tsx` source.
- `apps/ui/vite.config.ts` applies the React Compiler to `src/**`, and `apps/ui/app/styles/global.css` scans it with `@source`, as when these files lived in `apps/ui/app`.
- `apps/ui/specs/message-queue` hashes `src/db/chat-message-queue-store.ts` and `src/components/chat-message-queue-view.tsx`; after editing them, regenerate with `FORMAL_UPDATE=1` and the message-queue conformance test.
- Moving `src/utils/new-chat-execution.ts` or its Lean model moves both: the differential test reads `specs/lean/corpus`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
