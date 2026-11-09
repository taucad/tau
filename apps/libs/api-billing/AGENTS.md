# @taucad/api-billing

## Responsibility

API billing: credit ledger, payments, Stripe and billing commands

- Nx project: `api-billing`
- Project root: `apps/libs/api-billing`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:api, type:app-lib, layer:feature, api:billing`

## Entrypoints

- `src/index.ts`
- `package.json`
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint api-billing
pnpm nx test api-billing --watch=false
pnpm nx typecheck api-billing
pnpm nx run api-billing:test:billing-foundation
pnpm nx run api-billing:formal
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

- The foundation suites (`src/*.foundation.test.ts`, `src/testing/billing-foundation.test.ts`, the two Stripe adapter suites) run only through `test:billing-foundation`, whose launcher owns a disposable PostgreSQL 17; the default `test` target excludes them and `src/testing/**`. Six suites spawn `apps/api/dist/billing-command.js`, so the target depends on `api:build:billing-command`; `src/cli/billing-command.ts` is that command's body.
- Children the suites fork through tsx read `tsconfig.spec.json`, which therefore lists every source-consumed `api-*` library billing loads.
- `specs/GatewayInvocation*` are this library's formal models; `specs/GatewayInvocation/drift.json` hashes slices of `src/billable-model-invocation.service.ts`.
