# @taucad/planetary-gearbox

## Responsibility

The authored 34-part planetary gearbox showcase: frozen tessellation, manifest validation, kinematics and assembly order

- Nx project: `planetary-gearbox`
- Project root: `apps/libs/planetary-gearbox`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:ui, type:app-lib, layer:util`

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint planetary-gearbox
pnpm nx test planetary-gearbox --watch=false
pnpm nx typecheck planetary-gearbox
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

- `assets/` is frozen data: change it only by re-running the export scripts in `apps/www/scripts`, then update `apps/www/asset-provenance.json`.
- Consumers: `apps/www` (copies the geometry assets into `dist/_www/assets`), `apps/ui` (`app/components/geometry/gearbox`).

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
