# Agent host

`@taucad/agent-host` owns portable, browser-safe CAD-agent execution, lifecycle, and the durable session log. Keep provider orchestration, UI state, and application-framework composition in their hosts. Consume shared wire and tool contracts from `libs/chat`. Follow `docs/policy/library-api-policy.md`, `docs/policy/chat-request-config-policy.md`, `docs/policy/context-engineering-policy.md`, and `docs/policy/typescript-policy.md`.

## Operational invariants

- Keep the host schema-driven and environment-portable, with explicit ownership and idempotent disposal. Do not expose application-only dependencies through public exports.
- The chat protocol is orchestrator-agnostic and carries complete messages; reject delta-only request payloads.
- `test_model` delegates to the browser GeoSpec runner and its worker-owned runtime. Missing source files remain test failures.
- Preserve exact previously invoked skill content during replay; metadata-only skill history requires a fresh `use_skill` call before applying the skill.
- The CAD agent invokes `export_geometry` only for an explicit export request. Agent-authored visible labels use Title Case words with spaces; source identifiers preserve their native casing.

## Scripted model tests

Implement deterministic model fixtures through the host's `ModelTransport` and yield typed `ModelStreamEvent` values. Drive replay from the durable event log and provider-message roles; do not depend on a provider SDK's runtime class identity.

Validate with `pnpm nx lint agent-host`, `pnpm nx test agent-host --watch=false`, `pnpm nx typecheck agent-host`, and `pnpm nx build agent-host`. Run `pnpm nx run agent-host:test:browser` for browser execution.
