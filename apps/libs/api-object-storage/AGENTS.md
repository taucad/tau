# @taucad/api-object-storage

## Responsibility

API object storage: the S3 driver, signed file links and storage accounting

- Nx project: `api-object-storage`
- Project root: `apps/libs/api-object-storage`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:api, type:app-lib, layer:feature, api:object-storage`

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint api-object-storage
pnpm nx test api-object-storage --watch=false
pnpm nx typecheck api-object-storage
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

- `src/object-storage.service.test.ts` needs MinIO and reads `TAU_S3_*` from `apps/api/.env` (loaded after `api-core/.env.test` in `vitest.config.ts`); without MinIO its 19 store round-trips fail with `ECONNREFUSED`, as they do under `api:test`.
- Never import git (`api-git-core`, `api-git-mirror`): git depends on this library. The lint constraint `api:object-storage` allows only `billing`, `database`, `redis`, `core` and `observability`.
- Process entries import the narrowest subpath: the module-graph tests in `apps/api/app/*-app.test.ts`, `app/delete-reachability.test.ts` and `app/api/git/forwarding/storage-boundary.test.ts` assert what each entry reaches, and the root barrel is only the driver for that reason.
