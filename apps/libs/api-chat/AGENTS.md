# @taucad/api-chat

## Responsibility

API chat: the chat controller, service, DTOs and the chat exception filter

- Nx project: `api-chat`
- Project root: `apps/libs/api-chat`
- Placement: `apps/libs`
- Build mode: source-consumed; no build target
- React mode: disabled with Node test environment
- Tags: `scope:api, type:app-lib, layer:feature, api:chat`

## Entrypoints

- `package.json` subpath exports (`./<path>` → `src/<path>.ts`)
- `project.json`

## Commands

Run from the workspace root. These are available project targets; generation does not claim they have passed.

```bash
pnpm nx lint api-chat
pnpm nx test api-chat --watch=false
pnpm nx typecheck api-chat
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

- Holds `app/api/chat`: the chat controller, service, DTOs, the chat exception filter and `./utils/*` (abort tracking, error normalisation, image parts). The app's `api.module.ts` imports `ChatModule`, and `api-unhandled-rejection-handler.ts` reads `./utils/chat-abort`.
- Allowed API dependencies (`api:chat` lint constraint): `billing` (tests only: the billing-backed suites build `BillingModule`), `llm-gateway`, `auth`, `core`, `observability`. The funded-refusal retry bounds the filter reads (`fundedRetryAfterSeconds`) live in `api-llm-gateway`, which the app's `HttpExceptionFilter` reads too.
