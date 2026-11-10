# @taucad/api-projects

## Responsibility

API projects and publications: the project registry, previews, deletion, collaboration and project access, and publishing

- Nx project: `api-projects`
- Project root: `apps/libs/api-projects`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:api, type:app-lib, layer:feature, api:projects`

## Entrypoints

- `package.json` subpath exports (`./<path>` → `src/<path>.ts`)
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint api-projects
pnpm nx test api-projects --watch=false
pnpm nx typecheck api-projects
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

- Holds `app/api/{projects,publications,collaboration}` and the `commercialEntitlementsKey` port (`./entitlements/commercial-entitlements`): registry, previews, deletion requests, collaborators, invitations, `ProjectAccessService`/`ProjectAccessModule`, publishing, the materializer, publication deletion and viewer identity. The git-side fixture `lease-git-runner.fixture` ships as `./testing/lease-git-runner.fixture`.
- Nest modules composing these stay in `apps/api`: `ProjectsModule`, `PublicationsModule` and `CollaborationModule` import the app's `GitModule`, and `CommercialEntitlementsModule` binds the entitlements port to billing.
- Repository leases are a port: `PublicationsService` injects `publicationRepositoryLeasesKey` (`./publications/repository-leases`, also owning `ReadLease`). `GitRepositoryService` implements `PublicationRepositoryLeases`, and the app's `PublicationsModule` binds the token to it.
- Allowed API dependencies (`api:projects` constraint): `git-core`, `object-storage`, `auth`, `database`, `email`, `redis`, `testing`, `core`, `observability`. It may not import `api-git-mirror`, so suites composing publications with maintenance jobs (`publication-deletion.integration`, `git/maintenance/{blob-collector,project-deletion}`) stay in `apps/api`, as do HTTP suites needing the app's `HttpExceptionFilter`.
