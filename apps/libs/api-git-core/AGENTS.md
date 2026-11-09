# @taucad/api-git-core

## Responsibility

API git storage core: the repository store, the storage worker, routing, admission and forwarding

- Nx project: `api-git-core`
- Project root: `apps/libs/api-git-core`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:api, type:app-lib, layer:feature, api:git-core`

## Entrypoints

- `package.json` subpath exports (`./<path>` → `src/<path>.ts`)
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint api-git-core
pnpm nx test api-git-core --watch=false
pnpm nx typecheck api-git-core
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

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.

- Holds `app/api/git/{store,worker,routing,admission,forwarding}`, the root git modules they need, the catalog-preview key and writer, `project-deletion` and tau-storage's `storage-environment.config`. Entrypoints are narrow subpaths named after their files; there is no root barrel.
- `api:git-core` may depend on `object-storage`, `database`, `redis`, `lifecycle`, `core`, `observability`; never on `api-git-mirror`, projects, publications or the app. The app wires `GitRepositoryService` into forwarding (`apps/api/app/api/git/forwarding/`).
- Store integration and conformance suites need MinIO, lease suites PostgreSQL; `vitest.config.ts` reads `apps/api/.env` after `api-core/.env.test`.
- The module-graph boundary tests stay in the app (`storage-boundary.test.ts`, `delete-reachability.test.ts`) and name files here as `../libs/api-git-core/src/...`.
