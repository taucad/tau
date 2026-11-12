---
title: 'Cross-Provider Content Contract Policy'
description: 'Portable assistant history, provider-boundary projection, and lossless reasoning/tool metadata across supported model providers'
status: active
created: '2026-05-02'
updated: '2026-11-10'
related:
  - docs/policy/interrupted-tool-call-contract.md
  - docs/policy/chat-request-config-policy.md
  - docs/research/cross-provider-thinking-block-portability.md
  - docs/research/provider-reasoning-replay-contract.md
  - docs/research/langchain-v1-tool-call-roundtrip-regression.md
  - docs/policy/testing-policy.md
  - docs/research/project-chat-draft-persistence-blueprint.md
---

# Cross-Provider Content Contract Policy

Tau stores portable agent events and projects them to a provider's native wire format only at the model boundary. CAD execution runs in `packages/agent-host`; `apps/libs/api-llm-gateway` authenticates and proxies model requests without becoming the owner of assistant-message conversion.

## Rationale

Provider-native thinking blocks, signatures, response item IDs, and tool-call encodings cannot be replayed blindly to another provider. Earlier API middleware repaired LangChain checkpoints after persistence. That middleware and checkpoint architecture no longer serves CAD turns. The current contract preserves a provider-neutral transcript plus explicitly labeled native metadata, then lets the selected portable-host codec perform the final projection.

## Rules

### 1. Persist the portable event-log shape

Store assistant history as `ProviderMessage` and event-log records from `packages/agent-host/src/log/event-types.ts`. Preserve stable event IDs, roles, portable content, tool-call identity, and `ProviderMessageMetadata` when translating to or from the Pi runtime.

Do not persist an SDK model object, LangChain message instance, or provider HTTP body as the canonical thread record.

Persist user attachments by reference. The durable block is `{ type: 'file-ref', path, mimeType, byteLength?, filename? }` (`FileRefContentBlock`), where `path` is `attachments/<64 hex>.<jpg|png|webp|gif|pdf>` relative to the chat directory. Write `byteLength` only when the producer knows it; never fabricate one. Keep reading the legacy inline `{ type: 'image', mimeType, data }` block forever, and never rewrite existing rows into the new shape.

### 2. Keep provider-native metadata labeled and lossless

Preserve signed reasoning payloads, provider response item IDs, and other native replay metadata under their provider-labeled metadata channel. A cross-provider turn may omit native metadata that the target cannot consume, but must not erase it from the durable source record.

Never fabricate, rewrite, or transplant a cryptographic signature between providers. The codec for the provider that issued the signature owns its replay.

Persist assistant text and reasoning exactly as the provider wrote them. A signed reasoning block is bound to those bytes and to every byte before it, so a stored rewrite is an edit that every later request replays. Normalise for display in the renderer (`normalizeLatexDelimiters`), never in the log.

### 3. Project only at the selected provider boundary

Select the honest provider wire in `packages/agent-host/src/transport/gateway-model-transport.ts` before network I/O:

- Anthropic uses the Anthropic codec;
- OpenAI Responses uses the OpenAI Responses codec;
- OpenAI-compatible providers use the compatible chat-completions codec only when the catalog declares that wire.

Reject unsupported provider/wire combinations before fetch. Do not silently fall back to another provider contract.

Materialisation and the pi `onPayload` document rewrite are the only seam where references become bytes, under this rule and Rule 4:

- `materializeAttachments` (`packages/agent-host/src/harness/session-record.ts`) turns each user `file-ref` into a transient copy before history hydration and before each new user turn enters the request, and before the ACP prompt is built (`packages/host/src/acp/run.ts`). An image becomes a base64 pi `image` block. A PDF becomes a standalone sentinel text block (`documentSentinel`) plus an entry in the request's `documents` side table; ACP receives it as a `resource` block with a base64 `blob`. Absent bytes omit the block and log a warning; they never throw.
- `rewriteDocuments` (`packages/agent-host/src/transport/document-payload.ts`) runs in `onPayload` for every adapter call and replaces each standalone sentinel with the wire's native block at the same position: Anthropic `document`, OpenAI Responses `input_file`, OpenAI Completions `file`. On Anthropic, it carries over the prompt-cache `cache_control` marker.
- **Sentinel invariant.** A sentinel never reaches a provider. A standalone sentinel without a side-table entry, or any sentinel sequence left after the rewrite, fails the request with `INVALID_REQUEST` before `fetch`. A sentinel embedded in larger text, such as compaction output that serialises history, becomes the neutral marker `[attached document: <filename>]`, or `[attached document]` when no name is known, and is never thrown.
- Never patch `@earendil-works/pi-ai` for a wire need. Extend it on its `fetch` and `onPayload` seams. Vertex AI Gemini thought and signature mapping lives in `packages/agent-host/src/transport/vertex-completions-shim.ts`.

### 4. Normalize prompt blocks without mutating durable history

Provider projection may remove empty blocks or content scopes unsupported by the target. Perform that normalization, including attachment materialisation, on the outbound projection. Keep the event log unchanged so a later provider can still use the original portable or native metadata.

For OpenAI-compatible providers that expose `reasoning_content`, preserve its round trip through the portable metadata channel. For Anthropic, preserve signed thinking and native tool blocks when the replay remains on the model that minted them and Rule 9 holds.

### 5. Keep tool calls structurally paired

Preserve each tool-call ID, name, JSON input, and result pairing across codec translation. Do not infer a different call from display text, position alone, or a provider-private block when the portable call record exists. Treat a provider-supplied tool-call ID as unique within one model invocation and preserve that ID across every streamed chunk for the same call. Never reuse one call ID for distinct calls.

Interrupted or incomplete pairs follow [Interrupted Tool-Call Contract Policy](interrupted-tool-call-contract.md).

### 6. Keep the API gateway byte-transparent

`apps/libs/api-llm-gateway` may authenticate, authorize, meter, select an allowed upstream, and validate the response media type. It must pass the selected provider request and SSE response without performing CAD transcript conversion or rewriting content blocks. Request-shape validation (`apps/api/app/api/billing/billable-model-request.ts`) admits exactly the content blocks the codecs emit. That includes the three document blocks, each strict, with base64 PDF data bounded to 16 MiB and an optional `cache_control` on the Anthropic block. Images are bounded to 4 MiB, other strings to 4,000,000 characters, and the serialized request to 32,000,000 bytes. The transport keeps the newest attachments within 24,000,000 base64 characters per request (`fitAttachmentBudget` in `packages/agent-host/src/transport/document-payload.ts`) and replaces older ones with `[attachment omitted: <name>]`, so a chat whose history holds more attachment bytes than one request can carry keeps working.

Strip SDK-only, browser-only, authentication, cookie, and hop-by-hop headers at the browser-host gateway boundary. Never forward user credentials to a model provider.

### 7. Keep provider selection separate from execution placement

Model provider and model identity select the model codec. The `execution` discriminator in the CAD request selects `tau`, `acp`, or `paseo` placement. Do not derive one from the other or use an HTTP API placement to revive the removed server-side CAD graph.

### 8. Test exact replay obligations

Contract tests must cover same-provider replay, cross-provider replay, tool-call pairing, and provider metadata preservation. Include at least:

- OpenAI-compatible `reasoning_content` round trips;
- Anthropic signed thinking and native tool blocks;
- rejection of unsupported wires before fetch;
- preservation of the durable event log after target-specific projection;
- each document wire shape, and a sentinel leak or missing side-table entry failing before fetch;
- Rule 9 on every wire family: stale reasoning left out under a changed prefix, the durable rows byte-identical after projection.

Use fixture structure assertions and captured wire requests; snapshots alone are insufficient for these invariants.

### 9. Replay native reasoning only under the prefix that minted it

A provider binds native reasoning (a thinking block, a reasoning item, a tool call's thought signature) to the request prefix it was produced under: the model, the system text, the tool definitions and every earlier message. Anthropic refuses a replayed block whose prefix changed; other providers drop it or ignore it.

- **Stamp every generation request.** `stampPrefix` (`packages/agent-host/src/transport/prefix-stamp.ts`) computes a chained digest of that prefix, with native reasoning left out, and the reply's row persists it as `metadata.prefix`.
- **One rule, in the transport, the same on every wire.** A same-model assistant row replays its native reasoning only when the chain at its position equals the digest the row recorded. Every other same-model row, and a row with no stamp, is sent without it. Another model's row stays under Rule 2.
- **Leave stale reasoning out; do nothing else to it.** Never render it as text, and never change the durable row.
- **Do not strip by cause.** Compaction, clearing, a mode change or a new feature that edits history adds no strip of its own. The digest sees the change, whatever made it.
- **Move the epoch with the rules.** Bump `prefixCodecEpoch` when the digest's composition, the codec version or the replay rule changes, so rows stamped under other rules stop matching.
- **Provider controls are catalog facts, read per model.** `support.reasoning.replayBinding` says the provider takes the control over a mismatched block: the transport asks it to drop and report in production and to refuse in every live suite. `support.reasoning.effortInTranscript` says the provider reads the reasoning level from the transcript. A client sends either form only for a row that declares it. These two are the only per-provider differences in the replay path.
- **A provider-reported drop is a defect.** The rule leaves a stale block out before the provider sees it. A reported drop is recorded as an `unsanctioned` prefix break ([Context Engineering Policy](context-engineering-policy.md), cache rule 8).

**Why**: A replay refused for a changed prefix fails the turn, and resuming repeats it. A rule keyed on the prefix itself needs no knowledge of what changed it, so a future edit cannot bring the failure back.

## Ownership

- Portable message and event schema: `packages/agent-host/src/log/event-types.ts`
- Runtime hydration and extraction: `packages/agent-host/src/harness/session-record.ts`
- Provider selection and codecs: `packages/agent-host/src/transport/gateway-model-transport.ts`
- Prefix stamp and replay rule: `packages/agent-host/src/transport/prefix-stamp.ts`; stamp vocabulary: `packages/agent-host/src/log/prefix-stamp.ts`
- Document rewrite and Vertex response shim: `packages/agent-host/src/transport/document-payload.ts`, `packages/agent-host/src/transport/vertex-completions-shim.ts`
- Normalized model stream port: `packages/agent-host/src/waist/ports.ts`
- Authenticated byte proxy: `apps/libs/api-llm-gateway`
