# @taucad/agent-observability

Private first-party contracts for agent evidence and a portable Pi 1.4 → OpenTelemetry adapter. The public `@taucad/agent-host` package does not depend on this library. Import the named subpath; the root intentionally exports nothing.

- `contract`: version 1 strict evidence schema and bounded UTF-8 parsing.
- `identity`: source, semantic and projection keys, canonical digests and comparison.
- `authority`: pure purpose admission against **server-resolved** authority and complete original source lineage; operational field projection.
- `pi-telemetry`: native `TelemetryContext`, explicit W3C propagation, links and metrics with bounded recording and failure isolation.
- `telemetry-policy`: exact signal/field vocabularies; unknown fields and arbitrary error text are omitted.

## Admission order

Parse bounded bytes with `parseEvidence`, verify `verifyEvidenceDigest`, resolve authenticated current `EvidenceAuthority`, then call `authorizeEvidence` for the specific purpose. Only then may the owning service compare/deduplicate and transact its receipt/outbox. Repeat authority checks at send and reuse. A digest proves byte consistency, not truth or permission. Never construct authority maps from the submitted envelope. Complete lineage is required to prevent omitted Pro ancestors from becoming eligible Free content.

Unknown/shared rights deny. Summary and content permissions are independent. The [agent observability policy](../../docs/policy/agent-observability-policy.md#5-apply-purpose-and-destination-controls-before-collection) permits training and reusable evaluation only with explicit current purpose authorization and verified source rights; paid plans default off. Content captured without that opt-in stays excluded after plan changes, compaction, copying or derivation.

The current `authorizeEvidence` implementation is stricter: it requires exclusively verified Free lineage for training and reusable evaluation and refuses all Pro lineage, even with a current account grant. Its source proofs do not yet establish capture-time opt-in. Keep that denial until a separately reviewed source-proof implementation can enforce the policy; an account-purpose grant alone must never bypass it. Diagnostic admission additionally requires a scoped source set. Original server-proven expiry is at most 180 days and cannot be renewed by delivery or projection. HTTP decompression, request concurrency, durable receipts, media verification, redaction and supplier erasure belong to their later service owners.

## Native adapter

Supply a trusted bounded OTel tracer and optional meter. `enabled` and `metricsEnabled` independently default to false and are captured at construction. No global provider, exporter, network client or vendor credential is installed. The default policy carries only closed metadata; it does not capture prompts or arbitrary model/tool names. A custom policy is trusted composition code subject to the same review obligations, never a client setting.

Pass `adapter.context` to the existing Pi `Models` telemetry option. Raw provider codecs do not emit native model spans. Retain the adapter through native settlement: `stream.result()` can resolve before Pi finalizes usage. Call `stop()` on teardown or permission revocation; it ends telemetry without aborting application work. Construct a new adapter for an authorized policy epoch. W3C propagation is correlation only; ingress must authorize cross-boundary linkage.

Limits: 128 active spans, depth 16, 32 attributes, 64 events, 16 links, 16 array members, 128-character reviewed strings, 32 instruments, 60-second span lifetime. Expiry/shutdown marks incomplete spans `truncated` and leaves OTel status unset. Local `stats()` reports active/dropped/failures/expired. Composition owns a bounded SDK exporter queue and its delivery/loss counters; these adapter counters do not claim downstream receipt. Tune lifetime/segment budgets only against the qualification corpus, retaining explicit truncation. No synchronous adapter can preempt an infinite loop in a supplied same-realm SDK.

## Verification and integration scope

`pnpm nx test agent-observability --watch=false` runs the upstream 14-case adapter conformance suite, privacy/identity/authority/fault tests and a real synthetic Pi Models request. `pnpm nx test:e2e agent-observability` runs all 35 Tau-owned contract, authority, fault, privacy and Models cases in Chromium. The 14 upstream conformance cases stay in Node because their test runner imports `node:assert/strict`. Typecheck, lint, build and size are Nx targets.

T03 implements and qualifies this contract/adapter. Product host/API capture, authenticated storage/delivery, Langfuse mapping and production activation remain later blueprint tasks. See [the research blueprint](../../docs/research/tau-agent-observability-research-blueprint.md).
