# @taucad/ui-kit

## Responsibility

Tau UI app presentational components and icons with no feature dependencies

- Nx project: `ui-kit`
- Project root: `apps/libs/ui-kit`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: enabled with jsdom test setup
- Tags: `scope:ui, type:app-lib, layer:ui`

## Entrypoints

- `package.json` exports: one subpath per module under `src/components`, `src/icons`, `src/utils`, plus the generated icon type and sprites; pinned by `src/exports.test.ts`
- `project.json` (`generate-svg-sprite` target)

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint ui-kit
pnpm nx test ui-kit --watch=false
pnpm nx typecheck ui-kit
pnpm nx run ui-kit:generate-svg-sprite
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

- Layer `ui`: never import `apps/ui` (`#components/*`, `#hooks/*`, `#lib/*`, `#environment.config`) or a feature/data-access lib. Take app state (theme, cookies, analytics, attachments, router state) as props or leave the component in the app.
- `apps/ui/vite.config.ts` applies the React Compiler to `src/**`, as it did when these files lived in `apps/ui/app`; `data-table.tsx` keeps `'use no memo'`.
- `src/icons/generated/*` is written by `generate-svg-sprite`; never edit it by hand. `libs/tau-examples` logo generators write into `src/icons/raw`.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
