# @taucad/project-library

## Responsibility

Tau UI app project library: the library machines, service and commands, its storage calls and observations, and the project manager provider and listing hooks, composed from the files and chat features

- Nx project: `project-library`
- Project root: `apps/libs/project-library`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled; tests run in jsdom
- Tags: `scope:ui, type:app-lib, layer:feature, ui:project-library`

## Entrypoints

- `package.json` exports: one subpath per module under `src/`; pinned by `src/exports.test.ts`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint project-library
pnpm nx test project-library --watch=false
pnpm nx typecheck project-library
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

- Layer L2 (`ui:project-library`): `eslint.config.mjs` names the UI app libraries it may depend on (`chat-ui`, `files-ui`, `ui-core`, `ui-kit`). Never import `apps/ui`, another L2 library or `agent-host-ui`.
- The three library machines and `runtime/project-library{,-commands,-workspace}.ts` and `hooks/project-manager-provider.tsx` are reviewed sources of `apps/ui/specs/library-catalog`: a change goes through `LibraryCatalog.tla` first, then adds a new `LibraryCatalog/reviews/<yyyy-mm-dd>-<slug>.md` (formal verification policy rule 12); `FORMAL_UPDATE=1` re-pins the machines' alphabets in `drift.json`.
- App services arrive by injection (`ProjectLibraryServices`, `ProjectCommandsServices`, `ProjectManagerServices`), never by import; the app's bindings are `apps/ui/app/runtime/project-library.ts`, `hooks/use-project-manager.tsx` and `hooks/use-projects.ts`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
