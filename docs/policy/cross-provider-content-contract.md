---
title: 'Cross-Provider Content Contract Policy'
description: 'Persistence and API rules for LangChain V1 standard assistant content blocks across model providers'
status: active
created: '2026-05-02'
updated: '2026-05-31'
related:
  - docs/policy/interrupted-tool-call-contract.md
  - docs/research/cross-provider-thinking-block-portability.md
  - docs/research/langchain-v1-tool-call-roundtrip-regression.md
  - docs/policy/testing-policy.md
---

# Cross-Provider Content Contract Policy

Prescriptive rules for how the Tau API represents assistant reasoning and other structured content when users switch between LLM providers mid-thread.

## Rationale

Provider-native content blocks (for example Anthropic extended-thinking `thinking`, `redacted_thinking`, and cache-control `compaction` payloads) are valid only at that provider's HTTP boundary. LangGraph checkpoints serialize whatever shape the active `BaseChatModel` emitted. Without a single interchange format, replaying history to another provider causes hard failures (for example Google Gemini rejecting `type: "thinking"` during message formatting).

LangChain 1.x defines **V1 standard content blocks** (`{ type: "reasoning", reasoning, signature? }`, tool-call blocks, multimodal blocks). With `outputVersion: "v1"`, models persist portable reasoning; each provider's formatter re-emits native shapes only when appropriate.

This policy binds the API to that regime and names the one middleware repair surface for legacy checkpoints.

## Rules

### 1. Prefer V1 standard outputs on every supported chat model

All chat model classes constructed in `apps/api/app/api/providers/provider.service.ts` MUST set `outputVersion: "v1"` once the provider's LangChain integration supports the V1 translator for that stack.

**Why**: New turns land in Postgres checkpoints in a shape every other provider adapter understands.

### 2. `createCrossProviderContentNormalizerMiddleware` is the sole legacy repair site

Inbound `wrapModelCall` MUST normalize persisted foreign shapes before provider formatting:

- Anthropic-native `thinking` → V1 `reasoning` (preserve `signature` only when the **target** provider is Anthropic).
- `redacted_thinking` and Anthropic `compaction` blocks → `{ type: "non_standard", value: <original> }`.
- Strip non-portable `signature` / `thoughtSignature` fields from `reasoning` blocks when the target provider is not Anthropic.
- **Target `vertexai`**: strip tool-call content blocks (`tool_use`, `tool_call`, `tool_call_chunk`, `input_json_delta`, `server_tool_use`) from `AIMessage.content`. Google reads `message.tool_calls` only; content blocks of those types throw `CrossProviderContentError` before the API is contacted.
- **Target `anthropic`**: heal empty `tool_call` / `tool_use` block args from the matching `message.tool_calls` entry (streaming merge can leave `args: ''` while `tool_calls` holds the parsed object).
- **Target `openai`**: (a) heal empty `tool_call` block args from `message.tool_calls` — the Responses v1 converter formats tool calls from the content block (`convertFunctionCall` reads `tool_call.args`), so empty args would emit an invalid `arguments: ""`; (b) drop `reasoning` blocks that lack a valid id (see Rule 6); (c) rewrite each V1 assistant `text` block into a `non_standard` block whose value is the native Responses item `{ type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }`, and set `response_metadata.model_provider = "openai"`. Tool-call content blocks are **kept** (the Responses v1 converter builds `function_call` items from them, never from `message.tool_calls`).
  - The OpenAI Responses v1 converter (`convertStandardContentMessageToResponsesInput`) always emits `input_text` for `text` blocks regardless of role, which the API rejects for the assistant role. Its only verbatim passthrough is the `non_standard` branch, gated by `isResponsesMessage` (`model_provider === "openai"`). This rewrite keeps the load-bearing `output_version: "v1"` flag intact (no clearing) and routes the assistant text through that sanctioned passthrough. `model_provider` normalization to the active target is the documented gate enabling native-item passthrough; its only effect in the send path is to enable the `non_standard` branch. Because flipping it also un-gates foreign `non_standard` wrappers (Anthropic `redacted_thinking` / `compaction`, which are not valid Responses items), those are dropped here — matching the prior effective behaviour where the gate already discarded them for OpenAI targets.

**Why**: Checkpoints written before Rule 1 shipped, or emitted by providers still on v0 shapes, must not wedge a thread. Tool-call blocks are both cross-provider hazards (Anthropic `tool_use` replayed to Google) and intra-provider V1 round-trip hazards (empty args on Anthropic and OpenAI, `input_text` on OpenAI). The OpenAI rewrite is a deliberate, no-fork middleware band-aid: the upstream `input_text`-for-assistant bug is unfixed in the latest released `@langchain/openai` and on `main` (the roll-forward to a fixed version was blocked — see the research doc), so we repair at the one centralized site rather than forking the package or clearing `output_version`.

### 3. No provider-shape branching in UI or agent tools

Clients render AI SDK / `MyUIMessage` parts only. They MUST NOT attempt to rewrite LangChain provider-native blocks or heal cross-provider errors.

**Why**: Correctness is owned by the API pipeline (normalizer + sanitizers + LangChain formatters). Duplicating logic in the UI guarantees drift.

### 4. Signatures stay provider-symmetric

Thinking signatures are opaque to other providers. The normalizer preserves them **only** when the active target model is Anthropic; otherwise they are omitted from `reasoning` blocks.

**Why**: Matches upstream `_formatStandardContent` gating and avoids leaking unusable cryptographic material across vendors.

### 5. Reasoning traces are dropped on cross-provider hops, not text-downgraded

When switching away from a provider that produced reasoning, downstream requests MUST NOT synthesize fake user-visible prose from reasoning payloads. Portable `reasoning` blocks may be ignored or mapped to provider-specific thought channels by the active formatter.

**Why**: Prevents accidental disclosure patterns and keeps telemetry/tool semantics honest.

### 6. Replayed OpenAI Responses items never carry an empty-string `id`

Every item emitted to the OpenAI Responses API MUST carry either a valid `id`/`call_id` (matching `[A-Za-z0-9_-]+`) or none at all. An empty-string `id` is rejected (`400 Invalid 'input[n].id': ''`).

The one place this leaks is `reasoning`: `convertResponsesMessageToAIMessage` persists an OpenAI reasoning item as a lossy V1 `{ type: "reasoning", reasoning }` block that **drops the real `rs_` id** (the full item is retained only in `additional_kwargs.reasoning`). On replay, `convertReasoningBlock` hardcodes `id: block.id ?? ""` with no hook to omit it, so an id-less block becomes a reasoning item with `id: ""`. Because a reasoning item is only validly replayable carrying its original id, the normalizer **drops `reasoning` blocks that lack a valid id** for the OpenAI target (reasoning blocks that do carry a valid id pass through unchanged). This is consistent with Rule 5: reasoning traces are dropped across turns, never fabricated or downgraded.

**Why**: An id-less reasoning content block carries no replayable reasoning state (no id, no encrypted content) — only summary text. Synthesizing a reasoning item from it (with an empty or omitted id) is either rejected by the API or a fabricated trace. Dropping it is the only honest, non-fork repair, and it keeps `output_version: "v1"` intact.

## Scope

**In scope**: `apps/api` chat agent construction, LangChain middleware ordering, provider configuration.

**Out of scope**: UI persistence of `MyUIMessage` parts (already normalized by API responses), offline checkpoint migrations (normalizer handles reads), upstream LangChain releases.

## Verification

- Unit: `apps/api/app/api/chat/middleware/cross-provider-content-normalizer.middleware.test.ts`
- Hermetic replay: `apps/api/app/api/chat/cross-provider-tool-call-replay.test.ts` (opus-style `tool_use` history → `vertexai`; Anthropic empty-args heal; OpenAI same- and cross-provider replay asserted against the real `convertMessagesToResponsesInput` payload — assistant `output_text` not `input_text`, `output_version` preserved, healed `function_call.arguments`, and **no emitted item carries an empty `id`/`call_id`** for a reasoning + text + tool_calls turn)
- Optional real-LLM: `apps/api/app/testing/cross-provider-thinking.integration.test.ts` (`describe.skip` in CI)

## References

- Investigation: `docs/research/cross-provider-thinking-block-portability.md`
- LangChain V1 standard content overview: [LangChain standard message content](https://blog.langchain.com/standard-message-content/)
- Related persistence contract: `docs/policy/interrupted-tool-call-contract.md`
