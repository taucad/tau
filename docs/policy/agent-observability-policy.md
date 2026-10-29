---
title: 'Agent Observability Policy'
description: 'Observability acceptance for agent capabilities and dependency upgrades, native telemetry reuse, privacy, failure isolation and outcome evidence.'
status: active
created: '2026-10-29'
updated: '2026-10-29'
related:
  - docs/policy/context-engineering-policy.md
  - docs/policy/testing-policy.md
  - docs/policy/npm-policy.md
  - docs/policy/library-api-policy.md
---

# Agent Observability Policy

Internal reference for changes to first-party agent capabilities, harnesses, model transports and their telemetry; ACP integrations are outside this instrumentation program.

## Rationale

A dependency's telemetry API does not prove that Tau's execution path emits useful evidence. Agent upgrades must preserve execution semantics and observable coverage together, while new upstream fields must never silently broaden collection or reuse permissions.

## Rules

### 1. Make observability part of capability acceptance

For each new or changed agent capability, identify the owning execution boundary, expected lifecycle, terminal outcomes, timing and usage semantics, applicable permission and evidence of user value. Update the coverage matrix and its meaningful synthetic checks in the same change. A capability with no applicable telemetry must record why; absence is not success.

Cover affected model calls, tools, parallel work, approvals, compaction, retries, cancellations, recovery and auxiliary generations. Do not require instrumentation of an unused upstream feature. Preserve a distinction between implemented coverage, source-inspected support and production qualification.

### 2. Reuse native contracts at the actual execution path

Prefer supported Pi telemetry contracts and native emitters when their semantics fit. Verify that Tau calls the instrumented layer; a provider codec, custom stream function or bare agent loop may bypass it. Use existing lifecycle events and committed Tau facts for gaps. Do not introduce another public observer framework or replace the harness solely to acquire tracing without a demonstrated gap and an approved API design.

Use OpenTelemetry as the shared representation. Keep Pi-to-OTel and OTel-to-destination mappings explicit and versioned. Keep native schema versions, Tau semantic versions and supplier protocol versions distinct. Never treat developing GenAI conventions as a frozen standard.

### 3. Qualify upgrades as behavior changes

Upgrade the Pi packages Tau actually uses as one compatible set through the workspace package manager. Record exact direct and resolved versions. Inspect changed telemetry schemas, event types, provider/transcript contracts, retry defaults and browser entrypoints.

Before accepting an upgrade, run affected type, unit, browser and build checks. Preserve provider-specific replay metadata, system prompts, tool definitions, structured input, usage categories, refusal codes and cancellation. Add a regression for each observed compatibility defect. Distinguish synthetic provider fixtures from credentialed provider acceptance.

Pin a coverage expectation for the installed native schema. A changed schema or event vocabulary requires review, not automatic export of new fields. Review the changed surface rather than snapshotting irrelevant implementation details.

### 4. Keep execution independent of telemetry

Telemetry must not change callback invocation count, return values, rejection identity, tool effects, billing, cancellation, durable log order or recovery. Do not await exporters in model/tool execution. Use bounded queues and explicit overflow/loss accounting; isolate exporter failures and bounded shutdown from execution.

An adapter must preserve Pi's synchronous callback invocation and asynchronous settlement contract. Catch recording failures separately from application failures: never retry an application callback because telemetry failed. Test throwing, rejecting, stalled, overflow and late-recording paths. Keep recording methods inert after settlement where required by the contract.

### 5. Apply purpose and destination controls before collection

Keep account-linked task summaries and trace content independently opt-in and off by default. Existing anonymous telemetry permission authorizes neither. Unknown actor, plan, source rights or shared-project rights deny capture or reuse for the affected purpose. Public embedders explicitly opt in.

Allowlist each field for each destination. Native telemetry is input to this policy, not an authorization bypass. Bounded error messages, tool names, model identifiers and provider response IDs can still contain sensitive or high-cardinality data. General logs, Grafana, Sentry and alerts do not inherit trace-content permission. Never export arbitrary attributes, baggage, exception text, prompts, tool arguments or results through a generic fallback.

Pro source content is permanently excluded from training and reusable evaluation or prompt-optimization datasets, including after downgrade, copying, compaction and derivation. Free source reuse also requires explicit purpose authorization and rights. Separately authorized operational diagnosis must remain scoped; it does not establish reuse eligibility.

### 6. Preserve authority and identity across boundaries

Treat host facts and incoming trace context as untrusted at API ingress. Server authority binds actor, project, current purpose and financial attribution. Trace IDs and baggage are correlation, never authentication. Validate sizes and allowed keys before forwarding context across browser, worker, process and API boundaries.

Verify projection bytes before deduplication and compare the complete lineage with server-owned source facts; validating only the ancestors the client chose to list is insufficient. Scoped diagnosis requires an explicit source set.

Preserve original source, semantic fact, projection and delivery identities separately. Replay and merged device history must not repeat tool effects, increase turns or renew retention. Tau's final committed tool outcome overrides a provisional Pi event; the server ledger owns financial truth.

### 7. Measure what the signal actually means

Keep first normalized chunk, first text delta and user-visible first output separate. A normally ended or cancelled span does not prove task success. Preserve unknown, redacted, dropped, sampled and unsupported states and their population denominators.

Count one actual supplier attempt once; distinguish logical model operations, provider attempts, retries, deferred polls, turns and user tasks. Do not add client cost estimates to authoritative billing as separate usage. Record outcome evidence and calibrated evaluation separately from mechanical termination.

### 8. Bound retention and operational delivery

Apply the approved 180-day history window to original eligible evidence, with expiry processing within 24 hours after that window. Propagate expiry and erasure to pending delivery, media, derivatives, datasets and restored copies. Never renew old content by retry, replay or a new projection timestamp. Document supplier backup residuals and exceptional-loss limits.

Keep vendor credentials server-side. Qualify retry ownership, partial acknowledgement, ambiguous delivery, deduplication, scores/media, reads/exports and limits against the selected supplier protocol before activating dependent behavior. Do not claim exactly-once delivery from an HTTP success or silently resend ambiguous completed observations. Preserve purge capability when collection/export is stopped.

### 9. Separate implementation readiness from activation

A reviewed architecture may authorize default-deny implementation while supplier and rollout gates remain open. Production activation requires deployed acceptance and approved notice, access, region, budget, retention and recovery commitments recorded in the canonical go-live checklist. A local mock or upstream conformance suite cannot close those gates.

Enforce these semantic rules with boundary and compatibility tests, plus review of the capability coverage matrix. An AST lint rule cannot establish lifecycle completeness, rights or outcome truth; do not substitute a token annotation for evidence.

## References

- [Context engineering](context-engineering-policy.md)
- [Testing](testing-policy.md)
- [Dependency and packaging](npm-policy.md)
- [Public API design](library-api-policy.md)
- [Pi telemetry contract](https://github.com/earendil-works/pi/tree/main/packages/telemetry)
