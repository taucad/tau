# @taucad/viewer

## Responsibility

Tau's interactive CAD viewer: the React Three Fiber canvas, graphics machines and model controls.

- Nx project: `viewer`
- Project root: `packages/viewer`
- Placement: `packages`
- Build mode: tsdown ESM build enabled
- React mode: React components with a jsdom test environment (`vitest.setup.ts`)
- Tags: `scope:shared, type:package`

## Entrypoints

- `package.json` `exports`: one subpath per module the app consumes; no root entry
- `src/environment/viewer-environment.tsx`: the embedder seam (theme, accent, backend, switches, debug bridge)
- `src/model-viewer.tsx`: the standalone viewer
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint viewer
pnpm nx test viewer --watch=false
pnpm nx typecheck viewer
pnpm nx build viewer
pnpm nx pkgcheck viewer
pnpm nx size viewer
pnpm nx test:e2e viewer # Chromium suites
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [packages AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)
- [Library API policy](../../docs/policy/library-api-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.

- Nothing here imports `apps/**`. Application state reaches the viewer only through `ViewerEnvironmentProvider`, `ExactMeasurementProvider` and component props. Embedders must also mount `KeyboardProvider` (`@taucad/ui/components/keyboard`): the kinematics drag controls bind Escape unconditionally.
- Internal imports name `.ts` modules `#path.js` and `.tsx` modules `#path.jsx` (the recorded `tools/pkgcheck.ts` exception).
- Graphics changes follow `docs/policy/graphics-backend-policy.md`; shader sites stay registered in `apps/ui/app/components/geometry/shader-policy.ts`.
