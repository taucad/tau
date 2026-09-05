# API Application

The API owns HTTP authentication, billing, persistence, publication, model catalog and the authenticated LLM gateway. Portable CAD-agent execution belongs to `packages/agent-host`; the browser host composes it in `apps/ui`.

## Local Rules

- Keep `POST /v1/chat` limited to `project_name` and `commit_name`. Reject `cad` placement there; CAD requests use the browser/daemon host transport described by [Chat Request Config Policy](../../docs/policy/chat-request-config-policy.md).
- Preserve provider payload bytes at the LLM gateway. Provider-specific prompt projection and stream normalization belong to the portable host codecs; follow [Cross-Provider Content Contract Policy](../../docs/policy/cross-provider-content-contract.md).
- Preserve the byte-exact Stripe webhook body on the scoped `/v1/auth/stripe/webhook` parser. Do not route it through the catch-all JSON reserialization path.
- Keep `/health/live` process-local. `/health/ready` checks Redis, PostgreSQL, memory, the public object-store probe, and the private publication bucket.
- Define Drizzle schema changes in `app/database/` and generate migrations with `pnpm db:generate`; do not hand-author migration SQL.
- Register each injectable in its owning Nest module. Keep the AppModule compile guard when changing module wiring.
- Use shared schemas and error shapes at transport boundaries; do not duplicate `@taucad/chat` request types in API DTOs.

Detailed interruption semantics live in [Interrupted Tool-Call Contract Policy](../../docs/policy/interrupted-tool-call-contract.md). Publication, billing, auth, and storage incident history remains in its owning research and tests rather than this always-loaded file.

## Checks

Use `pnpm nx lint api`, `pnpm nx test api --watch=false`, `pnpm nx typecheck api`, and `pnpm nx build api` as appropriate to the change.

## Integration-test prerequisites

`vitest.integration.config.ts` owns `app/testing/**`; the default test target excludes it. Use the existing `test:models` target for that configuration and select the relevant suite. Pin import-time environment in `vi.hoisted` before ConfigModule loads; app-factory options are too late for webhook configuration snapshots.

When using `ioredis-mock`, flush its shared keyspace when creating the test harness. `mockDeep` covers the declared `query.*.find*` members; stub Drizzle `update().set().where()` chains explicitly. If asymmetric values inside `objectContaining` trigger unsafe-assignment diagnostics, inspect typed mock calls or assert a literal call instead of casting away the type check.

Object-store namespace prefixes live in `app/storage/storage.constants.ts`. Public content and private publication storage have distinct authorization and readiness requirements; read [infrastructure instructions](../../infra/AGENTS.md) for the current bucket/CDN contract.

## Model catalog and publication

- Keep model-catalog names and descriptions concise, factual, and aligned with peer entries; describe the practical use case instead of adding marketing copy.
- Accept publication source snapshots without requiring successful geometry. Do not add a server-rendered GLB/glTF preview sidecar or geometry-success precondition to publishing.
