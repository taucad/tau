# @taucad/api-agent-observability

## Responsibility

API agent observability: evidence admission, delivery, erasure and the model-invocation recorder, with telemetry purposes

- Nx project: `api-agent-observability`
- Project root: `apps/libs/api-agent-observability`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:api, type:app-lib, layer:feature, api:agent-observability`

## Entrypoints

- `package.json` subpath exports (`./<path>` → `src/<path>.ts`)
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint api-agent-observability
pnpm nx test api-agent-observability --watch=false
pnpm nx typecheck api-agent-observability
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

- Holds `app/api/agent-observability` and `app/api/telemetry-purposes`: evidence admission, the outbox and Langfuse delivery, erasure and expiry, the scorecard, the model-invocation recorder and observer, and the telemetry-purpose consent service, controller and module (under `./telemetry-purposes/*`). The README is the Langfuse-plane guide that lived beside the code.
- Allowed API dependencies (`api:agent-observability` lint constraint): `billing`, `llm-gateway`, `hosts`, `auth`, `database`, `lifecycle`, `core`, `observability`. Billing reaches the recorder only through the gateway's `invocationEvidenceRecorderToken`, which `apps/api/app/composition/model-invocation.module.ts` binds; `auth-extensions.module.ts` binds account erasure.
- The evidence fixture ships as `./testing/evidence.fixture`. Suites that need the app's `HttpExceptionFilter` (`evidence-ingress.controller`, `telemetry-purpose.controller`) or project deletion from `api-git-core` (`evidence-erasure.integration`) stay in `apps/api`; the integration suites need PostgreSQL (`DATABASE_URL`).
