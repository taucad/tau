# @taucad/api-git-mirror

## Responsibility

API git mirror and maintenance: the off-site mirror, restore drills, purge and lifecycle jobs

- Nx project: `api-git-mirror`
- Project root: `apps/libs/api-git-mirror`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:api, type:app-lib, layer:feature, api:git-mirror`

## Entrypoints

- `package.json` subpath exports (`./<path>` → `src/<path>.ts`)
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint api-git-mirror
pnpm nx test api-git-mirror --watch=false
pnpm nx typecheck api-git-mirror
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

- Holds `app/api/git/{mirror,maintenance}`: the off-site mirror worker, restore and drills, purge, blob collection and the maintenance worker. The app's `mirror-command.ts` and `maintenance-command.ts` import the jobs, and `GitRepositoryService` reads only `./mirror/watermark`; the images still build from `apps/api` (`build:mirror-command`, `build:maintenance-command`).
- Allowed API dependencies (`api:git-mirror` lint constraint): `git-core`, `object-storage`, `database`, `core`. No other API library may depend on this one.
- Publication reference release is a port: `purgeDeletedProject(s)` take `releasePublicationReferences`, which the maintenance entry binds to the app's `publication-deletion.ts`.
- The suites that grep application sources live in the app (`apps/api/app/maintenance-isolation.test.ts`); the integration suites need PostgreSQL and MinIO with Object Lock, read from `apps/api/.env` after `api-core/.env.test`.
