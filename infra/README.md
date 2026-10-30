# Local infrastructure

`pnpm infra:up` starts Tau's default PostgreSQL, Redis, object storage, and observability services.

Published host ports bind to `127.0.0.1`. Other machines on the network cannot reach them. Containers on the Compose network still reach each other by service name.

## Local Langfuse

`pnpm langfuse:up` starts a local Langfuse, separate from the default stack, so you can see the agent evidence your local API delivers. `pnpm infra:up` does not start it. Open <http://localhost:6200> and sign in as `dev@tau.local` with password `tau-langfuse-dev`. To use your own, set `LANGFUSE_LOCAL_EMAIL` and `LANGFUSE_LOCAL_PASSWORD` before the first start. The first start creates one organization, one project (`tau-local-agent`) and its key pair.

It runs its own Postgres, ClickHouse and Redis, none with a published port. Events and media go to the shared MinIO's `langfuse` bucket. Every credential is a local-only default. `pnpm langfuse:down` stops it. `pnpm infra:reset` also deletes its data.

To deliver to it, set these in `apps/api/.env`:

```bash
TAU_OBSERVABILITY_NOTICE_VERSION=local-dev
TAU_OBSERVABILITY_PAYLOAD_KEY=<generate: openssl rand -base64 32 | tr '+/' '-_' | tr -d '='>
TAU_OBSERVABILITY_DELIVERY_ENABLED=true
LANGFUSE_BASE_URL=http://localhost:6200
LANGFUSE_PUBLIC_KEY=pk-lf-tau-local
LANGFUSE_SECRET_KEY=sk-lf-tau-local-dev-secret
```

Every purpose is off until your account grants it. No settings screen exists yet, so grant purposes from the browser console while signed in to the local UI. The `noticeVersion` must match `TAU_OBSERVABILITY_NOTICE_VERSION`:

```js
await fetch('http://localhost:4000/v1/telemetry-purposes', {
  method: 'PUT',
  credentials: 'include',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ noticeVersion: 'local-dev', decisions: [{ purpose: 'summary', granted: true }] }),
});
```

Add `content` or `feedback` the same way to capture them too. Runs then appear in the local project once the delivery worker drains the backlog.
