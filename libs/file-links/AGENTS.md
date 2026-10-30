# @taucad/file-links

## Responsibility

Signed download links for the Tau files service: HMAC-SHA256 link signing and verification on WebCrypto, shared by the API and the files Worker

- Nx project: `file-links`
- Project root: `libs/file-links`
- Placement: `libs`
- Build mode: tsdown ESM build enabled
- React mode: disabled with Node test environment
- Tags: `scope:shared, type:lib`

## Entrypoints

- `src/index.ts`: path grammar, keys, signing and verifying
- `src/vectors.ts` (`./vectors`): golden vectors from `src/vectors.json`, for tests in this library, `apps/api` and `apps/files`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint file-links
pnpm nx test file-links --watch=false
pnpm nx typecheck file-links
pnpm nx build file-links
pnpm nx size file-links
```

## Local maintenance

Read every applicable ancestor before editing this project:

- [root AGENTS](../../AGENTS.md)
- [libs AGENTS](../AGENTS.md)

Then follow the [AGENTS policy](../../docs/policy/agents-md-policy.md), the [project README](./README.md), and these owners:

- [Create Package workflow](../../.agents/skills/create-package/SKILL.md)
- [Learning maintenance](../../.agents/skills/update-agent-memory/SKILL.md)
- [Workspace project policy](../../docs/policy/workspace-project-policy.md)
- [Testing policy](../../docs/policy/testing-policy.md)

Keep this file limited to verified local entrypoints, invariants and checks. Put cross-project standards in their policy owner and repeatable procedures in a shared skill.

## Project notes

- WebCrypto only (`globalThis.crypto.subtle`): the Worker bundles this library, so no Node import may enter `src/` outside tests. `tsconfig.lib.json` sets `types: []` to keep it so.
- The canonical message and the URL format are a cross-deploy contract with tau-cloud's deployed Worker. Change them only with a new version line (`tau-files-v2`), and regenerate `src/vectors.json` from an independent HMAC, never from this library.

Record durable project-specific facts here after verifying them in current source. Keep task progress in its existing execution record. Route learning candidates through the learning-maintenance owner above, promoting broader rules to their narrowest canonical owner.
