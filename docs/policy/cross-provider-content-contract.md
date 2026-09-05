---
title: 'Cross-Provider Content Contract Policy'
description: 'Portable assistant history, provider-boundary projection, and lossless reasoning/tool metadata across supported model providers'
status: active
created: '2026-05-02'
updated: '2026-09-05'
related:
  - docs/policy/interrupted-tool-call-contract.md
  - docs/policy/chat-request-config-policy.md
  - docs/research/cross-provider-thinking-block-portability.md
  - docs/research/langchain-v1-tool-call-roundtrip-regression.md
  - docs/policy/testing-policy.md
---

# Cross-Provider Content Contract Policy

Tau stores portable agent events and projects them to a provider's native wire format only at the model boundary. CAD execution runs in `packages/agent-host`; `apps/api/app/api/llm` authenticates and proxies model requests without becoming the owner of assistant-message conversion.

## Rationale

Provider-native thinking blocks, signatures, response item IDs, and tool-call encodings cannot be replayed blindly to another provider. Earlier API middleware repaired LangChain checkpoints after persistence. That middleware and checkpoint architecture no longer serves CAD turns. The current contract preserves a provider-neutral transcript plus explicitly labeled native metadata, then lets the selected portable-host codec perform the final projection.

## Rules

### 1. Persist the portable event-log shape

Store assistant history as `ProviderMessage` and event-log records from `packages/agent-host/src/log/event-types.ts`. Preserve stable event IDs, roles, portable content, tool-call identity, and `ProviderMessageMetadata` when translating to or from the Pi runtime.

Do not persist an SDK model object, LangChain message instance, or provider HTTP body as the canonical thread record.

### 2. Keep provider-native metadata labeled and lossless

Preserve signed reasoning payloads, provider response item IDs, and other native replay metadata under their provider-labeled metadata channel. A cross-provider turn may omit native metadata that the target cannot consume, but must not erase it from the durable source record.

Never fabricate, rewrite, or transplant a cryptographic signature between providers. The codec for the provider that issued the signature owns its replay.

### 3. Project only at the selected provider boundary

Select the honest provider wire in `packages/agent-host/src/transport/gateway-model-transport.ts` before network I/O:

- Anthropic uses the Anthropic codec;
- OpenAI Responses uses the OpenAI Responses codec;
- OpenAI-compatible providers use the compatible chat-completions codec only when the catalog declares that wire.

Reject unsupported provider/wire combinations before fetch. Do not silently fall back to another provider contract.

### 4. Normalize prompt blocks without mutating durable history

Provider projection may remove empty blocks or content scopes unsupported by the target. Perform that normalization on the outbound projection. Keep the event log unchanged so a later provider can still use the original portable or native metadata.

For OpenAI-compatible providers that expose `reasoning_content`, preserve its round trip through the portable metadata channel. For Anthropic, preserve signed thinking and native tool blocks when the replay remains on Anthropic.

### 5. Keep tool calls structurally paired

Preserve each tool-call ID, name, JSON input, and result pairing across codec translation. Do not infer a different call from display text, position alone, or a provider-private block when the portable call record exists. Treat a provider-supplied tool-call ID as unique within one model invocation and preserve that ID across every streamed chunk for the same call. Never reuse one call ID for distinct calls.

Interrupted or incomplete pairs follow [Interrupted Tool-Call Contract Policy](interrupted-tool-call-contract.md).

### 6. Keep the API gateway byte-transparent

`apps/api/app/api/llm` may authenticate, authorize, meter, select an allowed upstream, and validate the response media type. It must pass the selected provider request and SSE response without performing CAD transcript conversion or rewriting content blocks.

Strip SDK-only, browser-only, authentication, cookie, and hop-by-hop headers at the browser-host gateway boundary. Never forward user credentials to a model provider.

### 7. Keep provider selection separate from execution placement

Model provider and model identity select the model codec. The `execution` discriminator in the CAD request selects `tau`, `acp`, or `paseo` placement. Do not derive one from the other or use an HTTP API placement to revive the removed server-side CAD graph.

### 8. Test exact replay obligations

Contract tests must cover same-provider replay, cross-provider replay, tool-call pairing, and provider metadata preservation. Include at least:

- OpenAI-compatible `reasoning_content` round trips;
- Anthropic signed thinking and native tool blocks;
- rejection of unsupported wires before fetch;
- preservation of the durable event log after target-specific projection.

Use fixture structure assertions and captured wire requests; snapshots alone are insufficient for these invariants.

## Ownership

- Portable message and event schema: `packages/agent-host/src/log/event-types.ts`
- Runtime hydration and extraction: `packages/agent-host/src/harness/session-record.ts`
- Provider selection and codecs: `packages/agent-host/src/transport/gateway-model-transport.ts`
- Normalized model stream port: `packages/agent-host/src/waist/ports.ts`
- Authenticated byte proxy: `apps/api/app/api/llm`
