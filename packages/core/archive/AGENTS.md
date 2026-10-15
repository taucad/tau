# @taucad/archive-core

## Responsibility

Verified archive acquisition and tar, zip and wheel readers for Tau payloads

- Nx project: `archive-core`
- Project root: `packages/core/archive`
- Placement: `packages/core`
- Package kind: publishable dependency-light core support
- Build mode: tsdown ESM build enabled
- Host target: browser

## Entrypoints

- `src/index.ts`: browser-safe readers, integrity and `fetchVerified`
- `src/node.ts`: the `./node` entry, `writeArchiveEntries`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint archive-core
pnpm nx test archive-core --watch=false
pnpm nx typecheck archive-core
pnpm nx build archive-core
pnpm nx pkgcheck archive-core
pnpm nx size archive-core
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../../AGENTS.md)
- [packages AGENTS](../../AGENTS.md)

Then follow the [AGENTS policy](../../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Core workflow](../../../.agents/skills/create-core/SKILL.md)
- [Learning maintenance](../../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../../docs/policy/workspace-project-policy.md)
- [Library API policy](../../../docs/policy/library-api-policy.md)
- [Testing policy](../../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- The root entry imports no Node built-in; `src/index.test.ts` guards the payload. Keep filesystem code in `src/node.ts`.
- Readers refuse with `ArchiveError` and never repair an entry; callers pass every cap.
- Test archives are built in `src/archive-builders.fixture.ts`; `src/fixtures/*.whl` are real wheels pinned by sha256.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
