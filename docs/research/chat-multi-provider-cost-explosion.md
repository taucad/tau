---
title: 'Chat Multi-Provider Cost Explosion: Cross-Provider Stocktake and Architectural Recommendations'
description: 'Cross-provider audit (Anthropic, OpenAI, Google Vertex AI) of LangGraph chat threads quantifying per-turn state growth, per-provider cost mechanics, and the full set of architectural defects driving unexpected bills.'
status: active
created: '2026-05-20'
updated: '2026-05-20'
category: investigation
related:
  - docs/research/chat-cancelled-message-cache-explosion.md
  - docs/research/chat-model-cost-forensics.md
  - docs/research/chat-edit-message-metadata-stripping.md
  - docs/research/chat-followup-message-swallow.md
  - docs/research/gemini-prompt-cache-busting.md
  - docs/research/resumable-chat-streams.md
  - docs/research/chat-metadata-first-class-architecture.md
  - docs/research/context-injection-architecture.md
  - docs/policy/context-engineering-policy.md
---

# Chat Multi-Provider Cost Explosion: Cross-Provider Stocktake and Architectural Recommendations

Cross-provider forensic audit of Tau's LangGraph chat thread state, quantifying how each contributing defect inflates cost on Anthropic, OpenAI, and Google Vertex AI. Supersedes the single-provider analysis in [`chat-cancelled-message-cache-explosion.md`](./chat-cancelled-message-cache-explosion.md) by adding the cross-provider stocktake the prior doc deferred.

## Executive Summary

We audited **21 multi-turn chat threads** across the three production providers using the live `langgraph.checkpoints` table:

- 11 Anthropic threads (Claude Opus 4.7, Sonnet 4.6)
- 4 OpenAI threads (GPT-5.5)
- 6 Google Vertex AI threads (Gemini 2.5 Pro)

**Every single thread exhibits the same defect:** the `messages` channel state grows **triangularly** with the number of user turns, where turn N contains 1+2+…+N copies of unique user messages (and proportional duplicates of past assistant turns and tool outputs). The mechanism — `@ai-sdk/langchain`'s `toBaseMessages` stripping client message IDs and LangGraph's `messagesStateReducer` falling back to fresh-UUID-append because no IDs match — is provider-agnostic.

The **billing impact differs per provider** because each provider's caching semantics are different. All three providers automatically cache prompt prefixes, but at different rates, thresholds, and observed hit ratios:

| Provider                          | Caching mode                                                                                                                | Tau wiring                                                           | Observed cache-read ratio (samples)                    | Duplicate cost impact                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Anthropic**                     | Manual `cache_control` (5-min ephemeral; 1-hr beta)                                                                         | `PromptCaching` middleware sets breakpoint on last message           | ~83% (keychain Opus 4.7)                               | Duplicates appended at the tail are billed at the **cache-write** rate (1.25× input); stable prefix benefits from cache reads at 0.1×                                                                                                  |
| **OpenAI**                        | Automatic for prompts ≥1024 tokens, ~5-10 min                                                                               | Middleware is a no-op (cache_control would be rejected)              | ~82% (GPT-5.5 thread)                                  | Duplicates served from the implicit cache at **0.1×** input rate. Cheap per token, but still consumes the context window and elongates tool loops.                                                                                     |
| **Google Vertex AI (Gemini 2.5)** | **Implicit context caching enabled by default** on Vertex AI; tokens that hit the cache are billed at 10% of standard input | Middleware is a no-op (Gemini auto-caches with no Tau wiring needed) | 15% – 57% (varies; mean ~37% across 4 sampled threads) | Duplicates served from implicit cache at **0.1×** when the prefix matches; the lower hit ratio vs Anthropic/OpenAI is itself a _symptom_ of Tau's prefix-instability bug (F1) since implicit caching is sensitive to prefix divergence |

The duplication bug therefore hurts **all three providers**; it does not single Gemini out as previously stated in earlier drafts of this analysis. The relative damage is:

- **Anthropic**: dups are explicitly cache-written (16% of input cost in the keychain sample). R1 reclaims this.
- **OpenAI**: dups are cache-read at 0.1× — small per token, but they reduce the available context window and lengthen tool loops.
- **Gemini**: dups partially miss implicit cache because the duplicated content shifts the prefix; R1 stabilises the prefix and lifts the observed cache-read ratio.

We also identified **six independent secondary cost amplifiers** that compound the primary duplication bug, including: image base64 re-transmitted across turns, per-turn re-generated system reminders that shift the cached prefix tail, mid-conversation provider switching that flushes the per-provider cache, cancelled-stream input writes that never get rolled back, missing tool-output deduplication in `mergeCheckpointTail`, and absent cache-miss telemetry.

The architecturally correct fix — subject to the strategic constraint that the wire contract stays orchestrator-agnostic (no LangGraph-specific delta protocol) — is **R1: round-trip the existing UI `msg_…` ids through `toBaseMessages`** so that LangGraph's `messagesStateReducer` matches by id and replaces in place rather than appending. This is a 1–2 day change local to the LangGraph adapter, captures the entire model-cost win that a delta-only wire would have captured (both produce the same final `messages` channel state), and leaves the full-history wire intact so the API can swap orchestrators later. Without it, every provider continues to pay for re-injection in proportion to its own caching efficiency, and Gemini's implicit-cache hit ratio remains depressed by the prefix instability the bug creates.

R1 alone collapses duplicate-cost on normal turns, but it does **not** by itself fix the cancellation/edit scenarios documented in F7 — those require explicit state surgery on the server because the client's history changes shape (messages get omitted) rather than just gaining new entries. The architectural pattern that handles every cancel/edit/replay scenario uniformly is **client-as-truth-bearer thread-state reconciliation**: on every submission, the server diffs its persisted `messages` channel against the client's submitted history (matched by id, courtesy of R1) and uses `RemoveMessage` / `updateState` to make the _visible projection_ of persisted state equal to the client's tail before invoking the graph on the resulting delta. The persisted state remains the superset — client-truth messages **plus** server-injected durable reminders (interrupt-recovery, agent-safeguards, token-usage, snapshot-context, skills/memory) interleaved at the byte positions they were originally injected and never mutated thereafter. Reminders are pure server bookkeeping with explicit `additional_kwargs.tau_internal` tags so the reconciliation diff skips them when comparing to client truth; the cache prefix stays byte-identical across turns because no historical byte ever changes; and the model retains durable conversational memory of every reminder it has ever seen — matching Claude Code's production pattern (`repos/claude-code/src/utils/messages.ts` `INTERRUPT_MESSAGE` / `wrapInSystemReminder` / `SYNTHETIC_MESSAGES`). This single mechanism subsumes the special-case "fork on cancel" patch originally proposed for R3, naturally handles partial-cancel-keep-the-stub semantics (the client just includes the cancelled assistant in its next submission), and respects the user's mental model that the UI's IndexedDB-backed history is the source of truth for what the conversation contains. R1 and the reconciliation pattern (R3 in its revised form) are now treated as a single coordinated P0 change — R1 is the precondition that makes id-keyed diffing possible.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Findings](#findings)
  - [F1: Triangular state growth across all providers](#f1-triangular-state-growth-across-all-providers)
  - [F2: Provider-specific billing impact](#f2-provider-specific-billing-impact)
  - [F3: Tool-output duplication is the dominant byte contributor](#f3-tool-output-duplication-is-the-dominant-byte-contributor)
  - [F4: Image base64 re-transmission inflates wire and storage cost](#f4-image-base64-re-transmission-inflates-wire-and-storage-cost)
  - [F5: System reminders mutate every turn](#f5-system-reminders-mutate-every-turn)
  - [F6: Provider switch flushes the cache](#f6-provider-switch-flushes-the-cache)
  - [F7: Cancelled-stream input writes persist](#f7-cancelled-stream-input-writes-persist)
  - [F8: `mergeCheckpointTail` does not dedupe](#f8-mergecheckpointtail-does-not-dedupe)
  - [F9: Provider-aware usage metadata is missing for re-injected messages](#f9-provider-aware-usage-metadata-is-missing-for-re-injected-messages)
  - [F10: Several middlewares regenerate reminder bytes per turn instead of persisting once](#f10-several-middlewares-regenerate-reminder-bytes-per-turn-instead-of-persisting-once)
- [Architectural reframe: client-as-truth-bearer state reconciliation](#architectural-reframe-client-as-truth-bearer-state-reconciliation)
- [Recommendations](#recommendations)
- [Open Questions](#open-questions)
- [Code Examples](#code-examples)
- [Appendix A: Per-thread state growth tables](#appendix-a-per-thread-state-growth-tables)
- [Appendix B: Verification queries](#appendix-b-verification-queries)

## Problem Statement

The keychain forensic in [`chat-cancelled-message-cache-explosion.md`](./chat-cancelled-message-cache-explosion.md) (Appendix D) showed that a single "fix it" user turn cost $3.24 because 76 newly-injected messages were billed as Anthropic cache writes. The user asked whether the defect is provider-specific and what _all_ the cost-explosion mechanisms are. This document answers both:

1. **Is duplication universal?** Yes. Triangular growth was observed in all 21 sampled threads across 3 providers.
2. **Does it cost the same?** No. Cost translation differs sharply: Anthropic ≈ 1.25× per duplicate, OpenAI ≈ 0.1× per duplicate, Gemini ≈ 1.0× per duplicate (no caching).
3. **What else compounds the cost?** Eight additional defects, listed below.

The aim is a single coordinated set of architectural changes that close the bug class for every provider rather than patching one at a time.

## Methodology

- **Database**: `postgresql://dev_user:dev_password@localhost:5432/tau_dev`, schema `langgraph`
- **Tools**: direct SQL against `langgraph.checkpoints` / `langgraph.checkpoint_blobs`, Node analysis scripts in `/tmp/analyze-threads.js` and `/tmp/analyze-growth.js`
- **Sampling**: top 25 threads by checkpoint count with ≥3 user inputs; 21 selected for full message-blob decode after filtering threads with no model invocations
- **Provider attribution**: `response_metadata.model_provider` on each `AIMessage` / `AIMessageChunk`. Dominant provider per thread used as the label; mixed-provider threads called out explicitly
- **Cost reconstruction**: sum of `usage_metadata.input_tokens` / `output_tokens` / `input_token_details.cache_read` / `input_token_details.cache_creation` across all populated AI messages, multiplied by the Tau catalog rates in `apps/api/app/api/models/model.constants.ts`
- **Source audit**: `apps/api/app/api/chat/` (controller, middleware, utils), `@ai-sdk/langchain` in `node_modules`, `@langchain/langgraph@1.3.0` `messagesStateReducer`, provider docs for Anthropic, OpenAI, and Google Vertex AI

## Findings

### F1: Triangular state growth across all providers

State at the _N_-th user input checkpoint contains the union of all prior user submissions because every submission goes through `toBaseMessages` (strips IDs) → `messagesStateReducer` (assigns fresh UUIDs and appends because no IDs match).

For each thread, the `HumanMessage` count at the _N_-th input checkpoint matches **N(N+1)/2** within sampling noise:

| Provider        | Thread (suffix) | User turns | Expected HMs (N(N+1)/2) |               Observed HMs |
| --------------- | --------------- | ---------: | ----------------------: | -------------------------: |
| anthropic       | `gUow7ccbHo`    |          5 |                      15 | **13** (1 turn pre-empted) |
| anthropic       | `neQa4wKZlW`    |         10 |                      55 |        **45** (within 18%) |
| anthropic       | `uC6Im8QQfE`    |          5 |                      15 |                     **10** |
| anthropic       | `goadbL7F0f`    |          7 |                      28 |                     **21** |
| openai          | `vjY2cgF6vW`    |          8 |                      36 |                     **27** |
| openai          | `0pMrGKOa1M`    |          5 |                      15 |                     **13** |
| google-vertexai | `KXSRxbCQWB`    |          8 |                      36 |                     **22** |
| google-vertexai | `zK6hLNgsQ3`    |          7 |                      28 |                     **21** |
| google-vertexai | `SYLpdD1jlk`    |          5 |                      15 |                     **10** |

The under-shoot vs perfect-triangular comes from turns that re-used identical text (collapsing by content) and from clients that occasionally trim history client-side before submitting. The growth _shape_ is identical across all providers.

Total messages (including AI + tool entries) grow faster still because each assistant UIMessage expands to _(1 + N tool parts)_ BaseMessages:

| Thread                      | Turns | Final msgs |   bytes |
| --------------------------- | ----: | ---------: | ------: |
| `gUow7ccbHo` (anthropic)    |     5 |        261 | 1.92 MB |
| `neQa4wKZlW` (anthropic)    |    10 |        500 | 1.95 MB |
| `uC6Im8QQfE` (anthropic)    |     5 |        436 | 3.78 MB |
| `vjY2cgF6vW` (openai/mixed) |     8 |        638 | 3.55 MB |
| `KXSRxbCQWB` (gemini)       |     8 |        580 | 3.39 MB |
| `zK6hLNgsQ3` (gemini)       |     7 |        428 | 3.50 MB |

### F2: Provider-specific billing impact

Each provider's caching is wired differently, and Tau's `createPromptCachingMiddleware` only inserts cache markers for Anthropic:

```ts
// apps/api/app/api/chat/middleware/prompt-caching.middleware.ts:292
if (targetProvider !== 'anthropic') {
  return createMiddleware({
    name: 'PromptCaching',
    async wrapModelCall(request, handler) {
      return handler(request); // ← no-op for OpenAI and Vertex AI
    },
  });
}
```

Observed cache ratios from `response_metadata.usage` aggregates (Gemini's `cache_read` _is_ surfaced as `usage_metadata.input_token_details.cache_read` on Vertex AI — the earlier "0%" claim in an earlier draft of this doc was wrong):

| Thread       | Provider             | Σ input tok | Σ cache_read | Σ cache_creation |     Read% | Create% |
| ------------ | -------------------- | ----------: | -----------: | ---------------: | --------: | ------: |
| `gUow7ccbHo` | anthropic / Opus 4.7 |   2 808 453 |    2 342 682 |          461 094 |     83.4% |   16.4% |
| `0pMrGKOa1M` | openai / GPT-5.5     |   2 978 039 |    2 454 016 |         0 (auto) |     82.4% |      0% |
| `KXSRxbCQWB` | gemini / Vertex 2.5  |   2 691 204 |    1 538 322 |                0 | **57.2%** |      0% |
| `zK6hLNgsQ3` | gemini / Vertex 2.5  |   2 815 029 |    1 073 970 |          527 876 |     38.2% |   18.8% |
| `SYLpdD1jlk` | gemini / Vertex 2.5  |   1 950 153 |      706 330 |                0 |     36.2% |      0% |
| `X2Df4iiAIE` | gemini / Vertex 2.5  |   1 642 684 |      241 547 |                0 |     14.7% |      0% |

Reading the user-visible cost screen:

| Provider               | Per-duplicate token billing (when cache hits) | Per-duplicate when cache misses                | Why                                                                                                                                                                                                                                                          |
| ---------------------- | --------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anthropic              | 0.1× input (cache read)                       | **1.25× input** (cache write, 5-min ephemeral) | Cache breakpoint moves to the new tail every turn; injected duplicates beyond the prior breakpoint are written, not read.                                                                                                                                    |
| OpenAI                 | 0.1× input (auto cache read)                  | 1.0× input                                     | Implicit cache covers the conversation prefix after the 1024-token threshold. Cold prefixes (e.g. after provider switch) miss.                                                                                                                               |
| Gemini (Vertex AI 2.5) | 0.1× input (implicit auto cache read)         | 1.0× input                                     | Implicit caching is enabled by default and observable as `input_token_details.cache_read`. The lower mean hit ratio (~37% vs ~82% for OpenAI/Anthropic) reflects how aggressively the duplication bug shifts the cached prefix, _not_ an absence of caching. |

All three providers cache. The duplication bug damages each in proportion to (a) the provider's per-token rate, (b) how sensitive its caching is to prefix instability, and (c) what fraction of the tail content the duplicates occupy in any given turn. The Gemini hit-ratio variance across threads (14.7% – 57.2%) directly tracks how chaotic the prefix evolution is — threads with more tool-heavy turns shift the prefix more on every submission and bleed cache-hits.

The per-provider cost reductions claimed for R1 in the Recommendations table below are _the share of each provider's input cost that comes from the duplicated portion of state_. R1 reclaims that share by collapsing duplicates at the reducer boundary; the _absolute_ savings come both from removing the explicit cache-write portion (Anthropic) and from stabilising the prefix so implicit caches hit more reliably (OpenAI and especially Gemini). The percentage figures are bounded above by F1's triangular-growth proportion, which itself grows quadratically with turn count.

### F3: Tool-output duplication is the dominant byte contributor

`ToolMessage` entries dominate the state in tool-heavy CAD sessions. Decoded ratios:

| Thread                   | Tool msgs | Unique tool content | Duplication |
| ------------------------ | --------: | ------------------: | ----------: |
| `gUow7ccbHo` (anthropic) |       121 |                 ~40 |    **3.0×** |
| `KXSRxbCQWB` (gemini)    |       272 |                  40 |    **6.8×** |
| `0pMrGKOa1M` (openai)    |        65 |                  31 |    **2.1×** |
| `neQa4wKZlW` (anthropic) |       224 |                 ~50 |    **4.5×** |

The mechanism mirrors `HumanMessage` duplication: the client's UI history at turn N contains every prior assistant turn with all `output-available` tool parts; `toBaseMessages` expands each `output-available` tool part into a fresh `ToolMessage` BaseMessage; `messagesStateReducer` cannot dedupe because the ID is fresh; the message is appended. Tool result strings in CAD sessions are large (kernel responses, file contents), and the duplicate copies shift the cached prefix on every turn — depressing implicit-cache hit ratios on all three providers (most visibly on Gemini in F2's data, where one thread's cache-read ratio drops to 14.7%).

### F4: Image base64 re-transmission inflates wire and storage cost

Images are stored as structured `image_url` content blocks inside `HumanMessage.content` arrays (verified for the "fix it" turn: `[ text(800B), image_url(281 563 B), text(25B) ]`). When the client re-submits the UI history on every turn, the **entire base64 payload travels the wire again** and is **re-written to postgres `checkpoint_blobs`** with a fresh ID.

Image bytes-in-state grew across turns for `KXSRxbCQWBueYOLQTynzn` (gemini):

| Step | Content KB |  Image KB |
| ---- | ---------: | --------: |
| 3    |        287 |       287 |
| 109  |        695 |       574 |
| 399  |      1 228 |       861 |
| 451  |      1 778 |     1 149 |
| 463  |      2 322 |     1 436 |
| 467  |      2 858 |     1 723 |
| 471  |      3 394 | **2 010** |

By turn 7, the thread holds **2 MB of base64 image content in postgres**, of which roughly 1.5 MB is duplicates. The token-level cost is bounded by each provider's vision token model (Anthropic ~1500 tokens per image, OpenAI per-tile, Gemini per-token), but the **wire-transmission cost** is uncapped: every turn submits the full base64 from UI → API → postgres → provider, even though the original image was already uploaded on the turn it was attached.

### F5: System reminders mutate every turn

`injectSnapshotContext` prepends a `<system-reminder>` block to the last user message on every request. The block contains the file tree with sizes — every file write changes the bytes. Empirical comparison on the keychain thread (chars):

| Step           | Reminder length |
| -------------- | --------------: |
| 198 (T1 done)  |             398 |
| 290 (T2 done)  |             749 |
| 328 (T3 done)  |             762 |
| 342 (T5 input) |             763 |

Crucially, the system reminder is only injected into the _last_ user message of each request, so older user messages keep their original reminders — the cached prefix is _not_ invalidated by this on its own. The amplification here is more subtle:

- On every turn, the new tail (i.e. the latest reminder + new user text) is **always cache-write content** because it has never been seen before.
- This is intrinsic and not a bug per se. It does mean that even with R1 implemented, the cache-write fraction will floor at one reminder block (~500–800 B) per turn, plus the new user text. That's small but worth measuring.
- It also means **the last-message cache breakpoint set by `PromptCaching` middleware is always covering content that will never be read again** (because next turn shifts the breakpoint forward). The middleware is effectively writing a one-shot cache entry per turn. This is the standard Anthropic incremental-cache idiom; not a defect, but the cost lives in the duplication finding (F1/F3), not here.

### F6: Provider switch flushes the cache

Thread `chat_vjY2cgF6vWALxmBggDrf7` (the "openai 8-turn" thread by dominant provider) shows 47 OpenAI runs followed by 3 Anthropic runs at the end:

```
First 5 AI providers: openai, openai, openai, openai, openai
Last 5 AI providers:  undefined, undefined, undefined, undefined, anthropic
```

The final Anthropic AIMessageChunk reports:

```json
{
  "cache_creation_input_tokens": 241549,
  "cache_read_input_tokens": 0,
  "input_tokens": 241552
}
```

**Zero cache reads.** The provider switch resulted in a 241 K-token cold write on the very first Anthropic invocation, because Anthropic and OpenAI maintain independent prompt caches and there was no Anthropic-side cache for this thread yet. At Opus 4.7 cache-write rates (Tau catalog: $6.25/M; Anthropic list: $18.75/M) that single call cost **$1.51 – $4.53** in input alone.

Tau does not warn users that switching providers mid-conversation invalidates the cache. The UI exposes the model picker per-message; no telemetry or copy currently surfaces the cost implication.

### F7: Cancelled-stream input writes persist

Documented in detail in [`chat-cancelled-message-cache-explosion.md`](./chat-cancelled-message-cache-explosion.md) Finding #2. Summarising for completeness:

- LangGraph commits the `input` checkpoint **before** model invocation.
- If the user cancels the stream (Ctrl+C / Esc / network drop), the committed input is _not_ rolled back.
- On the next turn, the cancelled message is part of state and is included in the prompt to the model.
- The user perceives this as a "ghost message" — the assistant references content the user thought they cancelled.

Provider-agnostic: the bug is in Tau's cancellation handling, not in any provider. **Fully closed by the reconciliation pattern in R3** (revised): the client's next submission omits the cancelled message (empty cancel) or includes it explicitly (partial cancel), and reconciliation makes server state match either way.

### F8: `mergeCheckpointTail` does not dedupe

`apps/api/app/api/chat/utils/merge-checkpoint-tail.ts` only patches the _last assistant message's_ `output-available` parts based on checkpoint tool outputs. It does **not** dedupe earlier messages, and it does not remove tool messages that already exist in state. The function's contract is correct (it splices missing tool outputs into a single assistant turn), but combined with `toBaseMessages` stripping IDs, the result is that **every tool message the merge step would have stitched in is also re-injected as a fresh `ToolMessage` by the reducer.**

This is provider-agnostic and compounds F3. **Becomes vestigial after R3** (revised) — under client-as-truth-bearer reconciliation the client's submitted assistant tail already carries authoritative tool outputs, and the splice step exists only to paper over the duplication symptom of F1.

### F9: Provider-aware usage metadata is missing for re-injected messages

`AIMessage` objects that originated from a provider invocation carry `response_metadata.model_provider` and `usage_metadata.input_tokens` etc. When the client re-submits the same content on the next turn, `toBaseMessages` constructs a fresh `AIMessage({ content })` with empty `response_metadata` and empty `usage_metadata`. Inspecting `chat_vjY2cgF6vWALxmBggDrf7`:

- 47 AI messages with `response_metadata.model_provider = 'openai'`
- 3 AI messages with `response_metadata.model_provider = 'anthropic'`
- **258 AI messages with empty `response_metadata` and empty `usage_metadata`** — these are the re-injected duplicates

For the Gemini thread `chat_KXSRxbCQWBueYOLQTynzn`:

- 21 with `'google-vertexai'`
- 265 empty

This breaks **all downstream cost telemetry**. Any "cost per session" dashboard that sums `usage_metadata` is undercounting by 5–6×, and any per-provider mix dashboard is wrong because the duplicates have no provider tag. Telemetry-driven alerting cannot fire on this bug class.

### F10: Several middlewares regenerate reminder bytes per turn instead of persisting once

The architecturally correct pattern for any server-injected reminder — established by Claude Code (`repos/claude-code/src/utils/messages.ts`) and required by both implicit (Gemini, OpenAI) and explicit (Anthropic `cache_control`) caching mechanisms — is: **inject the reminder once at the turn it applies to, persist it into `state.messages` via the reducer, never regenerate or relocate its bytes on subsequent turns**. The reminder rides the conversation forever in the byte-position it was first written. Implicit caches hash top-down, so any byte-deletion or byte-mutation in prior-turn positions invalidates the prefix from that point onward; explicit `cache_control` markers anchor cache entries to the exact byte sequence up to the marker, so removing or shifting prior-turn bytes makes the entry un-readable.

Tau has five middlewares in this space. Two follow the correct pattern; three break it in different ways:

| Middleware                                                      | Pattern today                                                                                                                                     | Correct? | Defect                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `interruptRecoveryMiddleware`                                   | `beforeModel` returns `{ messages: [reminder] }` → reducer appends to state                                                                       | ✅       | None — reminder is persisted with a byte-deterministic body and dedup state on a separate key. Mirrors Claude Code's `createUserInterruptionMessage` (`messages.ts:546-560`) durability pattern.                                                                                                                                                                                                 |
| `agentSafeguardsMiddleware`                                     | Same `beforeModel` reducer-append pattern                                                                                                         | ✅       | None — same shape as interrupt-recovery.                                                                                                                                                                                                                                                                                                                                                         |
| `tokenUsageContextMiddleware`                                   | `wrapModelCall` prepends a fresh `HumanMessage` to `request.messages[0]` every turn; never persisted to state                                     | ❌       | Bytes at position 0 mutate every turn (used/total/remaining all change) → Gemini's top-down hash misses the entire prefix. Single largest Gemini cache-bust documented in [`gemini-prompt-cache-busting.md`](./gemini-prompt-cache-busting.md) Finding 1.                                                                                                                                        |
| `injectSnapshotContext` (controller-side, not yet a middleware) | Rewrites the last `HumanMessage`'s content in place to wrap with `<system-reminder>…filesystem snapshot…</system-reminder>${userText}`            | ◐        | Bytes ARE persisted (the wrap lives in `HumanMessage.content` after the reducer writes it), and once persisted they stay byte-stable — so cache is preserved for already-wrapped turns. The defect is structural: the wrap is performed by the controller, not by a proper middleware, so it cannot participate in the standard middleware lifecycle (telemetry, state-schema, lifecycle hooks). |
| `clientContextMiddleware` (skills/memory)                       | Mutates `SystemMessage` and prepends a memory `HumanMessage` to `messages[0]` whenever the agent reads `.tau/AGENTS.md` or `.tau/skills/` content | ❌       | The memory-prepend mutates `messages[0]` bytes when memory content changes mid-session — same Gemini hash-invalidation as the token-usage middleware. The `SystemMessage` mutation rotates Gemini's `systemInstruction` hash on every memory write.                                                                                                                                              |

Verified on `chat_gUow7ccbHoTjUt3mOQwet` step 198: the latest `HumanMessage.content` begins `<system-reminder>` and contains a full file-tree snapshot before the user's actual prompt — confirming `injectSnapshotContext` persists its wrap (the cache-stable behaviour). The threads where `tokenUsageContextMiddleware` is in use show per-turn byte drift at position 0, confirming the prepend defect.

Two harms from the three defective patterns:

1. **Cache-prefix poisoning**. Gemini's top-down hash invalidates everything past the mutated position; OpenAI's implicit cache misses past the divergence; Anthropic's explicit markers anchored on prior-turn positions stop being readable. The 14.7%–57.2% Gemini cache-read variance documented in F2 directly tracks how aggressively these mutations shift the prefix.
2. **Reconciliation hostility**. The client's submitted `HumanMessage` content is "fix it"; what the server stores depends on which middleware ran. ID-based diffing (R1) resolves this for content-wrapped messages (the id matches even if content is wrapped), but per-turn-regenerated reminders that are never persisted have no id to anchor against — they re-mint a fresh body every turn and never enter the cacheable history.

The architecturally correct fix is to align the three defective middlewares with the two correct ones: every reminder injects via `beforeModel` + reducer-append, with a deterministic body, a stable id (`${kind}::${anchor}`), and an explicit `additional_kwargs.tau_internal = { kind, ... }` tag so the reconciliation diff can skip it when comparing to client truth. Once persisted, reminder bytes never mutate. This matches:

- **Claude Code**: `INTERRUPT_MESSAGE` / `INTERRUPT_MESSAGE_FOR_TOOL_USE` are durable `UserMessage`s in the transcript; `wrapInSystemReminder` (`messages.ts:3097`) tags content for the `<system-reminder>` smoosh pass; the UI hides them from display but they ride every API request forever (`transcriptSearch.ts:13-15`, `UserTextMessage.tsx:83`).
- **Pi reference**: monolithic `systemPrompt` per session, never mutated mid-session (`repos/pi/packages/coding-agent/src/core/system-prompt.ts`). Tau cannot adopt this directly because the reminder content is genuinely per-turn (interrupt cause, doom-loop count, snapshot at the moment of the user's prompt), but the _byte-stability invariant_ is the same — once written, never mutated.

See [Open Questions / Resolved Decisions](#open-questions) below for the exact migration shape per middleware.

## Architectural reframe: client-as-truth-bearer state reconciliation

The findings above describe nine separate ways that Tau's per-turn flow produces incorrect server state: ID stripping causes duplication (F1, F3), cancelled inputs persist (F7), `mergeCheckpointTail` does not dedupe (F8), images re-serialise (F4), server augmentation pollutes the checkpoint (F10), and so on. Each finding has its own narrow fix, but they share a single root cause: **the server treats every submission as a forward-only append to its persisted state**, with no mechanism for the client to indicate that prior state should be amended, truncated, or replaced.

The architectural reframe is to invert that assumption: **the client owns the conversation's authoritative history; the server's job is to reconcile its persisted `messages` channel to match the client's submitted history on every turn before invoking the graph.** This is the same conceptual model LangChain's `useStream` enforces via a delta wire and server-side ownership; Tau achieves the same end with an orchestrator-agnostic full-history wire by performing the diff server-side.

### Why this is the correct framing for Tau

The user's stated mental model maps cleanly:

- **Normal turn**: client sends full history including a new user message. Server diff is `+1` (the new message); reconciliation is a no-op; graph runs the new turn.
- **Empty cancel** (`restoreCancelledDraft`): the user cancels before any assistant content streams; the UI omits the cancelled user message from the next submission. Server diff finds that the cancelled message was in persisted state but is absent from client truth → `RemoveMessage` removes it. From the model's perspective, the cancelled turn never happened.
- **Partial cancel** (`applyStoppedRequest`): the user cancels after partial assistant content (text and/or tool_calls) has streamed; the UI keeps both the user message and the partial assistant message in its local history. The client's next submission therefore contains both, and reconciliation keeps them in persisted state. The model sees the partial assistant content on the next turn and can build on it. **This matches the legitimate user expectation that a partially-streamed answer is real content they may want to reference, not invisible exhaust.**
- **User edits a prior message after cancellation**: the UI truncates its local history at the edit point — both the cancelled message and any partial assistant response are removed from the client's view. The next submission contains the edited message at that position with no descendants. Server diff finds N messages in persisted state past the edit point that are absent from client truth → `RemoveMessage` removes all of them in one `updateState` call; the edited message is the only delta fed to the graph.
- **Regenerate from message K**: identical to "edit prior message" in shape — the client truncates and resubmits. No special server-side codepath needed.
- **Page reload mid-session**: the client rehydrates from IndexedDB, then submits the next turn against possibly-stale server state. Reconciliation corrects any drift before the new turn runs.

Every user-visible cancellation/edit operation reduces to the same primitive: "make the persisted tail equal to the client's tail, then invoke on the delta". Tau does not need a separate fork-on-cancel codepath, a separate edit-truncation codepath, or a separate regenerate codepath — they are all the same operation.

### Algorithm sketch

The diff operates on the **visible projection** of server state — everything the user sees in the UI. Reminders carrying `additional_kwargs.tau_internal` are skipped when matching against client truth, but they are subject to removal when they live in the tail past the divergence point (the conversational event they were documenting is being wiped, so the reminder goes with it).

```ts
// apps/api/app/api/chat/utils/reconcile-thread-state.ts (new)
import { RemoveMessage, type BaseMessage } from '@langchain/core/messages';
import type { CompiledStateGraph } from '@langchain/langgraph';

function isReminder(m: BaseMessage): boolean {
  return Boolean(m.additional_kwargs?.tau_internal);
}

export async function reconcileThreadState(
  graph: CompiledStateGraph,
  threadId: string,
  clientMessages: BaseMessage[], // already converted by toBaseMessagesWithIds (R1)
): Promise<{ delta: BaseMessage[]; removedIds: string[] }> {
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  const serverMessages: BaseMessage[] = snapshot.values.messages ?? [];

  // Build the visible projection: server state with reminders filtered out, preserving
  // index back-references so we can map projection cursor → server full-state cursor.
  const visibleIndexes: number[] = [];
  for (let i = 0; i < serverMessages.length; i++) {
    if (!isReminder(serverMessages[i])) visibleIndexes.push(i);
  }

  // Longest common prefix matched by id over the visible projection.
  let visCursor = 0;
  while (
    visCursor < visibleIndexes.length &&
    visCursor < clientMessages.length &&
    serverMessages[visibleIndexes[visCursor]].id != null &&
    serverMessages[visibleIndexes[visCursor]].id === clientMessages[visCursor].id
  ) {
    visCursor++;
  }

  // First server full-state index past the common visible prefix. Everything from here
  // to the end of server state — visible AND reminders — is past the divergence and gets
  // RemoveMessaged (reminders die with the turn they documented).
  const firstOrphanIdx = visCursor < visibleIndexes.length ? visibleIndexes[visCursor] : serverMessages.length;

  const orphans = serverMessages.slice(firstOrphanIdx);
  if (orphans.length > 0) {
    await graph.updateState(
      { configurable: { thread_id: threadId } },
      { messages: orphans.map((m) => new RemoveMessage({ id: m.id! })) },
    );
  }

  // Everything past the prefix in client truth is the delta to feed into graph.stream.
  return {
    delta: clientMessages.slice(visCursor),
    removedIds: orphans.map((m) => m.id!),
  };
}
```

The controller then invokes `graph.stream({ messages: delta }, { configurable: { thread_id } })` with the delta rather than the full history. Middlewares that own state keys anchored on removed message ids run a `pruneAfterReconciliation(removedIds)` step (see OQ10) before the next model call so dedup/safeguard signals stay consistent with the new state. With stable ids (R1), reconciliation, and persisted-byte-stable reminders, the `messages` channel state is always exactly client-truth + historical reminders — no triangular growth, no ghost messages, no orphan tool calls, and the cacheable prefix stays byte-identical from turn to turn for the entire region before the new tail.

### Prerequisites this depends on

1. **R1 (stable ID round-tripping)** is non-negotiable. Without ids, the diff has no key to match on. Content-based diffing is brittle and breaks under any whitespace or formatting change.
2. **F10 fix — reminder middlewares must persist once and never mutate.** Both the reconciliation diff and the cache-stability invariant require that any byte the provider has ever seen at position K stays at position K, byte-identical, on every subsequent turn. Concrete rules:
   - **Every reminder injects via `beforeModel` + reducer-append into `state.messages`.** This persists the reminder at the natural position (end of the turn that produced it) and lets it ride every subsequent request unchanged. This is already the pattern `interruptRecoveryMiddleware` and `agentSafeguardsMiddleware` use; `tokenUsageContextMiddleware` and `clientContextMiddleware` must migrate to it.
   - **Reminder bodies are byte-deterministic** (no timestamps, monotonic counters, run identifiers, or UUIDs in the body) — already the cache-safety contract documented in `interrupt-recovery.middleware.ts` lines 18–28. Apply the same contract to every reminder.
   - **Reminders must NEVER mutate after they're persisted.** A middleware that wants to express "the file tree has changed since turn K" emits a _new_ reminder at turn N; it does not rewrite turn K's persisted reminder.
   - **Reminders carry an explicit `additional_kwargs.tau_internal = { kind, anchor }` tag** so the reconciliation diff can build the visible projection by filtering them out. `kind` discriminates the middleware (`interrupt-recovery` / `safeguards` / `token-usage` / `snapshot` / `skills-memory`); `anchor` identifies what the reminder is keyed on (parent AIMessage id, turn index, etc.). See OQ9.
   - **Reminder ids are deterministic** (`${kind}::${anchor}`) so the reducer dedupes correctly if the same reminder ever fires twice in the same turn. See OQ11.
   - **Pre-existing threads** (where `injectSnapshotContext` content-wrapped the user message before persistence) require no migration. The wrapped bytes are already byte-stable in state; the reconciliation diff matches by id and is content-agnostic. The new `SnapshotContextMiddleware` (OQ4) takes over for new turns only; historical turns keep their content-wrapped form. See OQ13.
   - **For Anthropic**, `promptCachingMiddleware`'s current "breakpoint on the last message" placement is correct under the persistence model — the last message of turn N (wrapped user message or a turn-N reminder) becomes byte-stable middle-of-prefix content on turn N+1 and is read at 0.1× input rate. The cache_control marker on the new turn-N+1 last message anchors a longer cached entry. No change needed. See OQ6.
3. **Deterministic ToolMessage ids.** R1 derives them as `${assistantMessageId}::tool::${toolCallId}` so the same client tool result reconciles against the same server `ToolMessage`. Without determinism, every reconciliation would treat tool results as orphans.
4. **Cascading state-key cleanup on reconciliation removal.** When `RemoveMessage` strips a message from state, any middleware-owned state-key that anchors on the removed message must also clear its stale entries. Without this, the dedup/safeguard signals leak across edits and produce surprising behaviour on the next turn. See OQ10 for the concrete scenario.

A per-thread serialisation lock at the controller is **not required** because the algorithm produces the same byte-stable history regardless of which of two near-concurrent submissions wins the race — see OQ7 for the reasoning.

### Edge cases worth calling out for planning

- **Cancelled `tool_use` without matching `tool_result`** is **already handled** by `messageContentSanitizerMiddleware.insertSyntheticToolResults` (`apps/api/app/api/chat/middleware/message-content-sanitizer.middleware.ts:134`). The middleware runs in `wrapModelCall`, scans the message tail for AIMessages whose `tool_calls` have no following matching `ToolMessage`, and inserts a synthetic `ToolMessage({ status: 'error', content: '{"errorCode":"USER_INTERRUPTED",…}' })` per orphan. This composes correctly with reconciliation: the synthetic tool_result lives only in the outgoing request, never in state, so it does not pollute persisted history or the next turn's prefix. No additional work required for this edge case — call it out in the R3 implementation tests to ensure the integration is exercised end-to-end.
  - UI side: `finalizeInterruptedToolParts` (`apps/ui/app/utils/chat.utils.ts`) writes the cancelled tool parts as `output-error` parts which arrive on the API as `ToolMessage(status: 'error', content: '{"errorCode":"USER_INTERRUPTED",…}')` — so in practice the synthetic-injection path only fires when the cancel happens before the UI's stream handler runs the finalisation step (e.g. true network drop, not a UI-initiated stop). Both paths produce the same wire format; the Anthropic / OpenAI / Vertex invariants are preserved.
- **Reminders past the divergence are removed together with the turn they documented**. If the user edits message K, the visible projection's common prefix ends at K-1; everything from K onwards (visible messages AND any reminders interleaved at positions K..end) gets RemoveMessaged. The reasoning is semantic: a reminder like "the previous turn was interrupted" references a turn that no longer exists, so keeping it would confuse the model. Reminders _before_ the divergence point are preserved byte-identically, keeping the cache warm for the unchanged region.
- **Empty delta after reconciliation**: a "retry" button that resubmits the existing history with no edits produces zero delta. The controller should treat zero-delta as a replay of the last assistant turn — invoking the graph with `null` input from the latest checkpoint (standard LangGraph time-travel replay). The reducer does not run; the model is re-invoked on the existing state.
- **Reconciliation as a no-op on first turn**: when `serverMessages` is empty, the common prefix is length 0, delta equals the full client submission, no `RemoveMessage` calls fire. Identical to today's first-turn behaviour.
- **State growth post-reconciliation**: orphan checkpoints (the ones that contained the now-removed messages) survive in `langgraph.checkpoints` until garbage-collected — `RemoveMessage` forks the head; it does not delete history rows. This is consistent with LangGraph Platform's `cancel(action='interrupt')` semantics. Deferred to a follow-up; see OQ8.
- **`mergeCheckpointTail` becomes vestigial**: under reconciliation, the client's submitted assistant tail is already authoritative including tool outputs (because the UI tracks them via the existing `output-available` parts). The middleware's job — splicing checkpoint tool outputs into the latest assistant — only existed to paper over the ID-loss + reducer-append duplication. After R1 + reconciliation it can be deleted, simplifying the controller.
- **Observability**: the reconciliation step itself emits a metric (`chat.reconciliation.removed_count`, `chat.reconciliation.delta_count`, `chat.reconciliation.reminder_removed_count`) so we can confirm post-deploy that cancel/edit flows produce the expected removal counts and that normal turns reconcile cleanly (delta = 1, removed = 0).

### Where this leaves the prior recommendations

- **R3 (fork-on-cancel via `update_state`)** as originally drafted is **superseded by reconciliation**. The new R3 generalises to "per-submission visible-projection reconciliation against client truth, with reminders persisted byte-stable and removed only when their documenting turn is wiped". Same primitive (`updateState` + `RemoveMessage`), broader scope, simpler controller.
- **R1** keeps its scope but is now a strict precondition for R3 — they ship together.
- **F7** (cancelled-stream input writes persist) is fully closed by reconciliation: cancelled inputs do not survive because the client's next submission omits them and reconciliation enforces that.
- **F8** (`mergeCheckpointTail` does not dedupe) becomes irrelevant — the merge step is removed.
- **F10** is on the critical path: the three defective reminder middlewares (`tokenUsageContextMiddleware`, `clientContextMiddleware`, the controller-side `injectSnapshotContext`) migrate to the `beforeModel` + reducer-append pattern as part of R3.
- **R2 (image blob references), R4 (provider-switch warning), R5 (message-count cap), R6 (telemetry), R7 (telemetry fix-up), R8 (useStream)** are unaffected and ship independently.

## Recommendations

**Strategic constraint**: the wire contract must remain orchestrator-agnostic — Tau keeps full-history-on-the-wire so the API can swap LangGraph for an alternative orchestrator (Mastra, Inngest, CrewAI, custom) without breaking the client. This rules out delta-only payloads as a recommendation (see "Rejected option" below); the fix must therefore land **inside** the LangGraph adapter, not at the protocol boundary.

| #      | Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Priority               | Effort         | Impact                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **R1** | Round-trip message IDs through `toBaseMessages` (Tau-local wrapper that preserves UI `msg_…` ids)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **P0**                 | Low (1–2 d)    | Eliminates the duplication-cost contribution across all three providers per F2: Anthropic drops the explicit cache-write share (∼16% of input cost in keychain); OpenAI's implicit cache hits a longer stable prefix; Gemini's implicit-cache hit ratio rises from the observed 15–57% mean toward parity with the other providers                                                                     |
| R2     | Reference uploaded images by content-addressable blob id (`tau://blob/<id>`) instead of resending base64                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P1                     | Medium         | Cuts wire bandwidth + postgres state size; removes the per-turn re-serialisation of inline image base64 from every UI submission (F4)                                                                                                                                                                                                                                                                  |
| **R3** | Per-submission visible-projection reconciliation against client truth: `updateState` + `RemoveMessage` diff against the client's submitted history matched by id, with reminders persisted byte-stable in state and removed only when their documenting turn is wiped. Replaces the originally-proposed fork-on-cancel patch with a single primitive that handles cancel / edit / regenerate / replay uniformly. Includes the F10 fixes (migrate `tokenUsageContextMiddleware` and `clientContextMiddleware` to the `beforeModel` + reducer-append pattern; extract `injectSnapshotContext` into a proper `SnapshotContextMiddleware`), the `additional_kwargs.tau_internal` tagging scheme (OQ9), deterministic reminder ids (OQ11), and the cascading state-key cleanup hook (OQ10). | **P0** (ships with R1) | Medium (3–5 d) | Closes F7 (ghost messages), retires F8 (`mergeCheckpointTail` becomes vestigial), respects partial-cancel user intent, makes edit-on-prior-message correctly remove the now-orphan tail from server state, and resolves the Gemini cache-bust documented in [`gemini-prompt-cache-busting.md`](./gemini-prompt-cache-busting.md) by aligning every reminder middleware on the byte-stability invariant |
| R4     | Provider-switch UI warning on the model picker (mid-conversation switch invalidates the per-provider cache)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | P2                     | Low            | Mitigates F6's one-shot cold-cache cost (~$1.51–$4.53 observed) while preserving the strategic single-thread switching feature                                                                                                                                                                                                                                                                         |
| R5     | Cap thread message count; auto-summarise when N > threshold; expose "compact conversation" UI affordance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | P2                     | Medium         | Bounds the worst case; defence-in-depth after R1                                                                                                                                                                                                                                                                                                                                                       |
| R6     | Per-turn cost telemetry capturing `cache_creation` / `cache_read` / `output_tokens` / provider; alert when cache-write ratio >50% on non-first turn                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | P2                     | Low            | Makes regressions visible across providers                                                                                                                                                                                                                                                                                                                                                             |
| R7     | Restore provider/usage metadata on re-injected messages (or exclude reinjected from cost dashboards)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | P2                     | Low            | Fixes the 5–6× telemetry undercount in F9 (largely resolved by R1, but defence-in-depth)                                                                                                                                                                                                                                                                                                               |
| R8     | Long-term: evaluate `@langchain/react`'s `useStream` only if the LangGraph-coupling decision is ever revisited                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | P3                     | High           | Listed for completeness; **out of scope under the current strategic constraint**                                                                                                                                                                                                                                                                                                                       |

### R1 (P0): Round-trip message IDs

Tau already mints UI message IDs with `idPrefix.message` (`msg_…`). The fix is to add a Tau-local wrapper that replaces `@ai-sdk/langchain`'s `toBaseMessages` so the `id` field is set on every constructed `HumanMessage` / `AIMessage` / `ToolMessage`. The wire contract does not change; the change is local to the LangGraph integration:

```ts
// apps/api/app/api/chat/utils/to-base-messages-with-ids.ts (new)
import { HumanMessage, AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { isToolPart, type MyUIMessage } from '@taucad/chat';

export function toBaseMessagesWithIds(messages: MyUIMessage[]): BaseMessage[] {
  const out: BaseMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push(new HumanMessage({ id: m.id, content: extractUserContent(m.parts) }));
      continue;
    }
    if (m.role === 'assistant') {
      out.push(
        new AIMessage({
          id: m.id,
          content: extractAssistantText(m.parts),
          tool_calls: extractToolCalls(m.parts),
        }),
      );
      for (const p of m.parts) {
        if (isToolPart(p) && p.state === 'output-available') {
          out.push(
            new ToolMessage({
              id: `${m.id}::tool::${p.toolCallId}`, // stable derived id
              tool_call_id: p.toolCallId,
              content: typeof p.output === 'string' ? p.output : JSON.stringify(p.output),
            }),
          );
        }
      }
    }
  }
  return out;
}
```

With stable IDs round-tripping, `messagesStateReducer` matches existing entries by ID and **replaces in place** (`merged[index] = m`) rather than appending. The reducer's documented dedupe path engages and the input-step state stops growing super-linearly. Verification: after R1 lands, the `HumanMessage` count at step N should equal `min(N, 1 + cancellations)`, not `N(N+1)/2`.

**Why this is sufficient (and equivalent to a delta-only wire for model cost):** the model-pricing pathway depends only on the final `messages` channel state passed to the provider. Both "client sends 1 message via delta wire" and "client sends N messages with stable IDs that the reducer dedupes" produce the _same_ final state. Anthropic's cache breakpoints, OpenAI's auto-cache prefix, and Gemini's implicit-cache prefix all see the identical prompt either way. R1 captures the entire model-cost benefit while keeping the wire orchestrator-agnostic.

**Edit/regenerate caveat:** with R1 alone, a client-side edit submits the new message at the same `msg_…` id will replace in place — good. But truncating the conversation (e.g. "regenerate from message 3, discard 4 and 5") requires either explicit `RemoveMessage` instructions from the client OR a server-side "client history is shorter than state → truncate state to match" rule. Track as a follow-up.

**Upstream status — no fix exists or is likely.** Checked against `@ai-sdk/langchain@2.0.181` (Tau's installed version) and `main` at commit `08cdf6ae` (May 2026). Upstream `toBaseMessages` is:

```ts
// packages/langchain/src/adapter.ts @ main — unchanged across all 2.x releases
export async function toBaseMessages(messages: UIMessage[]): Promise<BaseMessage[]> {
  const modelMessages = await convertToModelMessages(messages); // id stripped here
  return convertModelMessages(modelMessages); // rebuilds without id
}
```

The ID loss happens at the **AI SDK Core** boundary, not in the LangChain adapter. From the AI SDK Core docs for `convertToModelMessages`:

> The function signature accepts `messages: Array<Omit<UI_MESSAGE, 'id'>>` — meaning the input parameter explicitly omits the `id` property. This is intentional because `convertToModelMessages` transforms UI messages (which include IDs for application state) into `ModelMessage` objects (which represent only the state needed for model processing).

`ModelMessage` is **deliberately ID-less by design** as the provider-facing format. Every adapter that goes through `convertToModelMessages` inherits the loss. There is no `preserveIds` option, no open issue, and no PR proposing one. Adding one would require either adding `id` to `ModelMessage` (a breaking change affecting every provider adapter) or a new `toBaseMessagesFromUI(messages)` overload in `@ai-sdk/langchain` that bypasses `convertToModelMessages` entirely.

The closest related upstream activity — [vercel/ai#11415](https://github.com/vercel/ai/issues/11415) closed by [#11417](https://github.com/vercel/ai/pull/11417) on 2026-01-05 ("do not re-emit executed tool calls") — fixes a different bug in the **output direction** (`toUIMessageStream` filtering historical tool events from the streaming reply). That ships in newer @ai-sdk/langchain releases but does nothing for Tau because our bug is the **input direction** (client → server submit). The two fixes are orthogonal.

**Consequence**: the Tau-local `toBaseMessagesWithIds` wrapper is not a temporary workaround pending an upstream release — it bypasses an intentional AI-SDK Core design choice that is unlikely to change. Optional follow-up: file an upstream issue at vercel/ai documenting the LangGraph-reducer-dedupe interaction so a tracking thread exists, then move on with the local fix.

### R2 (P1): Reference uploaded images by ID

Today, image attachments live inline as base64 inside `HumanMessage.content`. On every subsequent turn the base64 is re-serialised and shipped. Replace inline base64 with a server-side reference:

1. UI uploads image → server stores in `blob_ref` table (already exists) → returns `blob_id`
2. UI submits message with `{ type: 'image_url', image_url: { url: 'tau://blob/<blob_id>' } }`
3. API resolves `tau://blob/<id>` URIs to native provider image-block format just before model invocation (per provider)
4. The image is materialised exactly once per provider invocation; subsequent turns reference the same `blob_id` so postgres state is small

This is a net win for storage (postgres rows shrink from 1.9 MB to ~10 KB) and for wire bandwidth (~280 KB per re-submission removed). R1 deduplicates the `HumanMessage` itself but does **not** shrink the image bytes once a single image-bearing message is in state; this recommendation closes that gap.

### R3 (P0, ships with R1): Per-submission state reconciliation against client truth

R3 generalises the originally-proposed fork-on-cancel patch into the canonical primitive that handles cancel / edit / regenerate / replay uniformly. The full mechanism is documented in the [Architectural reframe](#architectural-reframe-client-as-truth-bearer-state-reconciliation) section above; the recommendation here captures the implementation scope.

**Scope of R3 v1**:

1. New `apps/api/app/api/chat/utils/reconcile-thread-state.ts` implementing the visible-projection diff documented in the architectural reframe's algorithm sketch.
2. `ChatController.streamAgentResponse` invokes reconciliation immediately after `prepareMessages` returns and before `graph.stream`, then calls `pruneAfterReconciliation(removedIds)` on every middleware that registers the hook.
3. The three F10-defective middlewares migrate to the persisted-byte-stable pattern:
   - `tokenUsageContextMiddleware` → `beforeModel` + reducer-append (OQ1)
   - `clientContextMiddleware` → `beforeAgent`-based freeze of skills/memory into `state._frozenClientContext` (OQ5); the `wrapModelCall` half sources from state, never from disk
   - `injectSnapshotContext` → extracted into a new `SnapshotContextMiddleware` that fires `beforeModel` + reducer-append (OQ4)
4. Every reminder middleware (`interruptRecovery`, `agentSafeguards`, `tokenUsage`, `snapshot`, `clientContext`) writes its reminders with `additional_kwargs.tau_internal = { kind, anchor, version }` (OQ9) and ids `tau::reminder::${kind}::${anchor}` (OQ11).
5. Middlewares with state keys anchored on message ids (`interruptRecovery._interruptReminderFiredFor`, any `agentSafeguards` state keyed on parent AIMessage id, etc.) implement `pruneAfterReconciliation(removedIds)` hooks per OQ10.
6. `apps/api/app/api/chat/utils/merge-checkpoint-tail.ts` is **deleted** (becomes vestigial under reconciliation).
7. `R6` telemetry adds `chat.reconciliation.removed_count`, `chat.reconciliation.delta_count`, `chat.reconciliation.reminder_removed_count` counters so post-deploy verification confirms normal turns reconcile cleanly (delta = 1, removed = 0).
8. Live-API integration test exercises a double-turn submission (cancel + edit) against a real provider key and asserts (a) no duplicate user messages survive in `state.messages`, (b) the visible projection matches the client's submitted history exactly, (c) pre-divergence reminder bytes are byte-identical between turn N and turn N+1 (cache-stability check).

R3 ships together with R1 — the two are inseparable because reconciliation requires the stable ids R1 provides.

### R4 (P2): Provider-switch UI warning

Mid-conversation provider switches flush the per-provider prompt cache (F6) and re-price the first turn at full rate (observed: $1.51–$4.53 one-shot cost on the OpenAI→Anthropic switch in `chat_vjY2cgF6vWALxmBggDrf7`). **The switching itself is a deliberate product feature** — users can compare model outputs within the same thread without losing context, and any hard block would break that. The fix is informational, not gating:

Surface a single sentence on the model picker when the user is about to switch providers (not when picking the initial model on a fresh chat):

> Switching provider mid-conversation discards the per-provider cache and the next turn will be priced at the full input rate. The conversation history is preserved.

Cheap to ship; preserves the switching feature; lets users decide whether the cost is worth the comparison. R6's telemetry should also break out cost-per-turn so users can see the spike attributable to the switch in their billing dashboard.

### R5 (P2): Message-count bounds

Cap thread messages at e.g. 200 (or 50K tokens estimated). On overflow:

- Server-side: invoke a summariser sub-graph that collapses tool outputs older than N turns into a single `system` summary
- UI: show a "compact this conversation" affordance with a preview of what will be folded

This is a defence-in-depth measure for users who _do_ run very long sessions; R1 already prevents quadratic growth.

### R6 (P2): Per-turn cost telemetry

Emit OTEL metrics keyed by `(thread_id, turn_idx, provider, model)`:

- `chat.tokens.input.uncached`
- `chat.tokens.input.cache_read`
- `chat.tokens.input.cache_write`
- `chat.tokens.output`
- `chat.cost.usd`
- `chat.state.message_count`
- `chat.state.message_byte_count`

Alert when `cache_write / (cache_read + cache_write) > 0.5` on any non-first turn — this is the signal that the prefix has diverged unexpectedly. Post-R1 this should be rare; pre-R1 it will fire on every turn and confirm the bug surface.

### R7 (P2): Telemetry fix-up for re-injected messages

After R1 lands, re-injected messages will preserve their original ids and the reducer will replace in place, so `response_metadata` written by the original provider call is retained automatically. Until R1 ships (and as a defensive safety net afterwards), either:

- Carry `response_metadata.model_provider` through `toBaseMessagesWithIds` so reconstructed `AIMessage`s remain attributable; or
- In cost-dashboard queries, exclude AI messages with empty `usage_metadata` to avoid the 5–6× undercount (current dashboards over-attribute to the dominant provider and under-count total cost — F9)

### R8 (P3): Long-term — re-evaluate `useStream` if the strategic constraint changes

`@langchain/react`'s `useStream` implements the delta protocol natively (server is the source of truth; clients submit a single message; the hook hydrates from server state). It would remove the entire bug class but **couples the wire contract to LangGraph**, conflicting with the current strategic constraint of orchestrator portability. Listed only so this option is on the record; do not pursue unless the LangGraph-coupling decision is explicitly revisited.

### Rejected option: delta-only wire payload

Earlier drafts of this analysis proposed replacing the wire contract with `{ chatId, parentMessageId, newMessage }` (the canonical LangGraph idiom). It is **rejected** on strategic grounds: the current full-history wire is orchestrator-agnostic, and Tau's API must retain the freedom to swap LangGraph for an alternative orchestrator (Mastra, Inngest, CrewAI, custom) without breaking the client.

For model cost specifically, a delta-only wire and R1 (round-tripped ids + reducer dedupe) produce **identical** final state and therefore identical provider prompts — both engage the same Anthropic cache breakpoints, the same OpenAI auto-cache, and the same Gemini implicit cache. The only material differences are (a) wire bandwidth (a few KB vs the full UI history) and (b) postgres `checkpoint_writes` row size for the `__input__` step. Neither is a model cost. R1 captures the entire model-cost win while leaving the protocol shape untouched.

### Rejected option: block provider-switch within a single thread

Earlier drafts proposed disabling the model picker after the first model call (or hard-rejecting submissions where `agentConfig.provider !== thread.dominantProvider`) to prevent the F6 cache-flush cost. It is **rejected** on product grounds: single-thread provider switching is a deliberate Tau feature — users can compare outputs from different models within the same conversation without re-uploading attachments or re-explaining context. A hard block would break that flow.

The cost surprise (F6) is real, but the correct mitigation is informational rather than gating: R4 surfaces the cache-flush cost on the model picker so users can make an informed choice. R6's per-turn telemetry then makes the actual switch-attributable cost visible after the fact.

### Rejected option: transient tail-only reminder injection

An interim draft of this analysis proposed moving every reminder middleware to `wrapModelCall` and appending a transient `HumanMessage` at the tail of `request.messages` per turn (reminders never persisted to state). It is **rejected** on cache-stability grounds. Reminders that hit the provider become part of the cached prefix from that turn onward; removing them on the next turn changes the byte sequence at their former position, invalidating every cached prefix entry that included them. This applies to Anthropic `cache_control` (which anchors to exact prior byte sequences), OpenAI implicit caching (top-down prefix match), and Gemini implicit caching (top-down prefix hash) equally — no caching mechanism on any of the three providers tolerates byte-deletion from prior-turn prefixes.

The architecturally correct pattern, validated against Claude Code's production transcript layer (`repos/claude-code/src/utils/messages.ts:546-560` `createUserInterruptionMessage`; `messages.ts:3097` `wrapInSystemReminder`; `transcriptSearch.ts:13-15` and `UserTextMessage.tsx:83` UI/API decoupling), is for reminders to persist into state byte-stable forever and ride every subsequent request unchanged. The UI handles display-time filtering (Tau already does this via `finalizeInterruptedToolParts` writing `output-error` parts with `errorCode: 'USER_INTERRUPTED'` that the UI renders as cancelled, while the API persists them as durable `ToolMessage` content). See [F10](#f10-several-middlewares-regenerate-reminder-bytes-per-turn-instead-of-persisting-once) and [Architectural reframe](#architectural-reframe-client-as-truth-bearer-state-reconciliation) for the full reasoning.

## Open Questions

All thirteen design questions raised during the multi-pass reframe of this doc have been resolved. The numbering is retained for stable cross-references in future work; the **Decision** column captures the agreed direction. OQ10 and OQ12 carry concrete scenarios to motivate the implementation requirements they impose.

| #        | Topic                                                                    | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OQ1**  | `tokenUsageContextMiddleware` — drop or migrate?                         | **Migrate to `beforeModel` + reducer-append.** The reminder persists into `state.messages` byte-stable from the turn it fires onward, rather than being prepended fresh to `messages[0]` every turn. Body stays deterministic (the `used / total / remaining` triple at the moment of injection). Pi's drop-entirely option was considered and rejected — the reminder is genuinely useful conversational signal for the agent's own context-budget reasoning. Closes the smoking-gun documented in [`gemini-prompt-cache-busting.md`](./gemini-prompt-cache-busting.md) Finding 1.                                                                                                                                                                                                                                                                                                                                                    |
| **OQ2**  | `interruptRecoveryMiddleware` — migration shape?                         | **Keep as-is.** Already on the correct pattern (`beforeModel` returns `{ messages: [reminder], _interruptReminderFiredFor: [...] }`; reducer persists). The cache-safety contract documented in lines 18–28 of the middleware is the canonical example R3 references for every other middleware to mirror.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **OQ3**  | `agentSafeguardsMiddleware` — migration shape?                           | **Keep as-is.** Same pattern as OQ2 — correct already.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OQ4**  | `injectSnapshotContext` — keep controller-side or extract to middleware? | **Extract to a proper `SnapshotContextMiddleware`.** Lifts the snapshot-injection logic out of the controller into a named middleware that fires `beforeModel`, persists the snapshot reminder via the reducer (using deterministic ids and the `tau_internal` tag), and participates in the standard middleware lifecycle (telemetry, state-schema, lifecycle hooks). For symmetry with the other four reminder middlewares. Pre-existing threads keep their content-wrapped form (see OQ13); the new middleware only governs new turns.                                                                                                                                                                                                                                                                                                                                                                                              |
| **OQ5**  | `clientContextMiddleware` (skills/memory) — freeze at session start?     | **Freeze at session start.** Architecturally correct LangChain mechanism: a `beforeAgent` hook that reads skills/memory **once** on first invocation, writes the snapshot into a middleware-owned state key (e.g. `state._frozenClientContext: { skills: string, memory: string }`), and short-circuits on subsequent invocations (`if (state._frozenClientContext) return {};`). The `wrapModelCall` half of the middleware then sources its content exclusively from `state._frozenClientContext`, never touching disk. Mirrors pi's monolithic-systemPrompt pattern (`repos/pi/packages/coding-agent/src/core/system-prompt.ts`). Mid-session refresh is deferred — if/when it becomes a product requirement, the implementation will emit a fresh `client-context` reminder via `beforeModel` reducer-append at the turn the user requests refresh, leaving prior turns' frozen content byte-stable.                               |
| **OQ6**  | Anthropic `cache_control` breakpoint placement                           | **Keep current behaviour** (`cache_control: { type: 'ephemeral' }` on the last message). Under the persistence model the last message of turn N becomes byte-stable middle-of-prefix content on turn N+1, so the breakpoint anchors a cacheable region that IS read on the next turn at 0.1× input rate. The original concern (the breakpoint anchoring a transient reminder) does not apply because reminders now persist; they're not transient.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OQ7**  | Per-thread serialisation lock                                            | **No lock needed.** The reconciliation algorithm guarantees the byte-stability invariant under any interleaving: previously-written bytes are never mutated (`RemoveMessage` forks the head rather than rewriting prior checkpoints; appended content lives in distinct postgres rows). Concurrent submissions on the same thread (rare in practice — Tau's chat UX serialises via `chat.stop()` before sending the next message; only edge cases like two browser tabs, page-reload-during-stream, or stop-signal-network-drop can race) may produce surprising merged state where both submissions' deltas land, but the _cache prefix_ is byte-identical from every observer's perspective and no historical byte is corrupted. UX surprises (one user intent clobbering another) are accepted as the cost of avoiding lock complexity at this stage. Revisit if production telemetry surfaces real concurrent-submission problems. |
| **OQ8**  | Orphan checkpoint GC                                                     | **Deferred.** `RemoveMessage` forks the head; orphan checkpoint rows accumulate in `langgraph.checkpoints` / `langgraph.checkpoint_blobs` until a periodic GC job prunes them. Out of scope for R3 v1; tracked as a follow-up. Storage growth is bounded by edit/cancel frequency and is many orders of magnitude smaller than the duplication-bytes R1 already eliminates, so this is a hygiene concern not a cost driver.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **OQ9**  | Explicit `additional_kwargs.tau_internal` tag                            | **Yes.** Every reminder carries `additional_kwargs.tau_internal = { kind, anchor, version }` where `kind ∈ { 'interrupt-recovery', 'safeguards', 'token-usage', 'snapshot', 'skills-memory' }`, `anchor` identifies the conversational event it documents (parent AIMessage id, turn index, etc.), and `version` is a single integer that ratchets when a middleware's body format changes (so future format evolution is non-breaking for historical reminders). The reconciliation diff's `isReminder(m)` predicate is the sole consumer of this tag; downstream code must NOT branch on it.                                                                                                                                                                                                                                                                                                                                         |
| **OQ10** | Cascading state-key cleanup                                              | **Required.** See scenario below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **OQ11** | Deterministic reminder ids                                               | **Yes.** Format: `tau::reminder::${kind}::${anchor}` (e.g. `tau::reminder::interrupt-recovery::ai_abc123`). Stable across re-runs so the reducer dedupes correctly if the same reminder ever fires twice; inspectable in transcripts and traces; greppable in logs. No random UUIDs in reminder identity.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **OQ12** | Concurrent submission snapshot divergence                                | **Benign under the persistence model.** See scenario below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **OQ13** | Pre-existing thread migration                                            | **No migration.** Threads created before R3 ships have their snapshot reminders embedded inside `HumanMessage.content` (the `<system-reminder>…</system-reminder>userText` content-wrap pattern from the legacy `injectSnapshotContext`). The reconciliation diff matches by id and is content-agnostic, so these threads continue to work without backfill. The new `SnapshotContextMiddleware` (OQ4) governs new turns going forward; legacy turns retain their wrapped-content form. This avoids touching bytes that providers have already cached for those threads.                                                                                                                                                                                                                                                                                                                                                               |

### OQ10 scenario — why cascading state-key cleanup is required

`agentSafeguardsMiddleware` (and similarly any future safeguard middleware) tracks repeated-error / doom-loop state across turns. Suppose the middleware maintains a state key:

```ts
state._safeguardErrorWindow = {
  parentAiMessageId: 'ai_turn5',
  errorCount: 3,
  lastReminderSig: 'sig_abc',
};
```

This says "the last three tool calls under AIMessage `ai_turn5` errored, and we already fired safeguard reminder `sig_abc` for this window." On the next turn, the middleware consults this state and may decide "we're already in a doom loop, refuse further calls to the same tool."

Now the user edits the user message that preceded `ai_turn5`, abandoning that entire conversational branch. Reconciliation RemoveMessages everything from that user message onward — including `ai_turn5`, all its child ToolMessages, and any reminders interleaved there. Server state's `messages` channel no longer contains `ai_turn5`.

**Without cascading cleanup**, `state._safeguardErrorWindow.parentAiMessageId` still points at `ai_turn5`, which is now an orphan. The middleware on the next turn reads stale state, concludes "we're still in the doom loop we were in two turns ago," and suppresses tool calls the user actually wants to make. The agent appears broken until the user starts a fresh chat or somehow triggers a different state-clearing path.

**With cascading cleanup**, the reconciliation step exposes `removedIds: string[]` to every middleware via a documented `pruneAfterReconciliation(removedIds)` hook (run after `RemoveMessage` writes but before `graph.stream` resumes). Each middleware audits its own state keys and clears entries whose anchor is in `removedIds`:

```ts
agentSafeguardsMiddleware.pruneAfterReconciliation = (removedIds) => {
  if (
    state._safeguardErrorWindow?.parentAiMessageId &&
    removedIds.includes(state._safeguardErrorWindow.parentAiMessageId)
  ) {
    return { _safeguardErrorWindow: undefined };
  }
  return {};
};
```

Same pattern for `interruptRecoveryMiddleware._interruptReminderFiredFor` (entries are signature hashes of parent AIMessages; clear any whose anchor parent is removed), the future `clientContextMiddleware._frozenClientContext` (unaffected — bound to session, not to messages), and any other state-keys middlewares introduce. The hook is the contract; implementations are middleware-local.

### OQ12 scenario — concurrent submission snapshot divergence is benign

"Concurrent submissions" here means two POST requests for the same `chat_id` arriving at the API within milliseconds of each other — **not** LangGraph's parallel tool-call execution, which is a within-turn graph-execution concern that is unrelated and already correct. Tau's chat UI normally prevents concurrent submissions (the in-flight stream blocks new submits until `chat.stop()` completes), but three edge cases can race:

1. Two browser tabs open to the same chat, both sending submissions.
2. User reloads the page mid-stream and resubmits before the abort propagates.
3. Network drops the `stop()` signal but the next submission goes through.

Worked scenario:

- Server state S0 contains turns 1–5.
- Submission A arrives with client-truth `[..., u5_edited]` (user edited turn 5).
- Submission B arrives with client-truth `[..., u5, ai5, u6]` (user sent a normal follow-up — unaware of A's edit).
- Both controllers compute a filesystem snapshot for their `SnapshotContextMiddleware`. A's snapshot is taken at time t_A; B's at t_B = t_A + 30ms. If a kernel tool wrote to the filesystem in those 30ms, the two snapshots differ in body.
- A reconciles against S0: visible-projection diff says remove turn-5-onward (`u5, ai5, REM_snap_5, …`), append `u5_edited`. A's `beforeModel` writes `REM_snap_A` (with body computed at t_A) via reducer-append.
- B reconciles against S0 (read happened before A's write committed): same diff says remove turn-5-onward, append `u6`. B's `beforeModel` writes `REM_snap_B` (with body computed at t_B) via reducer-append.
- Postgres serialises the two `updateState` writes. Final state contains both A's and B's deltas merged.

This is weird from a user-intent standpoint — both A and B "happened" — but from the byte-stability and cache-prefix standpoint it is fine:

- All bytes written by either submission remain byte-stable from that point onward.
- The two distinct snapshot reminders (`REM_snap_A`, `REM_snap_B`) have distinct ids (different `anchor` because their parent user messages differ) so the reducer doesn't merge or mutate them.
- Provider caches stay warm for everything before the divergence (turns 1–4).
- Next turn's prefix is `[turns 1–4, u5_edited, REM_snap_A, …, u6, REM_snap_B, …]` — byte-identical to whatever the providers most recently cached.

The user experience is suboptimal (one of A or B's intents will appear to have "lost"), but the system is consistent and the cache is healthy. R6's per-turn telemetry will surface concurrent-submission rates and let us decide later whether to add OQ7-style locking based on real production data rather than speculation.

## Code Examples

### Triangular growth proof per provider

```bash
# Anthropic — keychain thread
for step in 198 290 328 342; do
  docker exec tau-postgres psql -U dev_user -d tau_dev -tA -c "
    SELECT 'step=$step', length(cb.blob), jsonb_array_length(convert_from(cb.blob,'UTF8')::jsonb)
    FROM   langgraph.checkpoint_blobs cb
    JOIN   langgraph.checkpoints c ON cb.thread_id = c.thread_id
    WHERE  c.thread_id='chat_gUow7ccbHoTjUt3mOQwet'
      AND  c.metadata->>'step'='$step'
      AND  cb.channel='messages'
      AND  cb.version=(c.checkpoint->'channel_versions'->>'messages');"
done
# step=198 → 47 msgs, step=290 → 112, step=328 → 185, step=342 → 261
```

## Diagrams

### State-growth flow (per turn) — today (pre-R3)

```
client UI history (N messages)
  ↓
[toBaseMessages]    — strips ids
  ↓
N BaseMessages (fresh uuids)
  ↓
[mergeCheckpointTail] — patches assistant tool parts; does NOT dedupe
  ↓
graph.stream(input)
  ↓
[messagesStateReducer]
  ↓
state = prev_state ⊕ append(BaseMessages)     // ← duplication compounds
  ↓
provider invocation
  ├─ anthropic → cache_control breakpoint on last msg (manual)
  ├─ openai    → automatic prompt cache (≥1024 tok prefix)
  └─ gemini    → implicit context cache (Vertex AI 2.5, default-on)
```

### Reconciliation flow (per turn) — post-R3 target

```
client UI history (N user-visible messages, ids round-tripped via R1)
  ↓
[toBaseMessagesWithIds] — preserves msg_… ids on user / assistant / tool entries
  ↓
N BaseMessages with stable ids
  ↓
[reconcileThreadState]
  │
  ├─ read server state (client-visible msgs + persisted reminders interleaved)
  ├─ build visible projection by filtering additional_kwargs.tau_internal
  ├─ longest-common-prefix by id (client truth vs visible projection)
  ├─ RemoveMessage(orphans) ← every server-state entry past the divergence
  │                            (both visible messages AND reminders interleaved
  │                             beyond that point — they document a wiped turn)
  └─ delta = client messages past the prefix
  ↓
[middleware.pruneAfterReconciliation(removedIds)]  ← cascading state-key cleanup
  ↓
graph.stream({ messages: delta })
  ↓
[messagesStateReducer]                              ← appends delta to state
  ↓
[middlewares.beforeModel]                           ← reminder middlewares fire
  │                                                   here, reducer-appends each
  │                                                   reminder with deterministic
  │                                                   id and tau_internal tag
  ↓
state = [..., delta..., reminder_K_for_turn_N, ...]  ← byte-stable from now on
  ↓
provider invocation
  ├─ anthropic → cache_control breakpoint on last msg
  ├─ openai    → automatic prompt cache
  └─ gemini    → implicit context cache
  ↓
all three caches READ the entire prior-conversation prefix (byte-stable),
  WRITE only the new tail (delta + this turn's reminders + this turn's AI output)
```

### Cost mapping per provider

```
duplicate token at tail of prompt
├─ anthropic → cache_write at the moving breakpoint (1.25× input)        ← Tau pays this explicitly
├─ openai    → cache_read after 2nd request (0.1× input)                 ← cheap per token
└─ gemini    → cache_read when prefix matches (0.1× input);              ← duplication shifts the
              cache miss when prefix shifts (1.0× input)                    prefix and depresses hit ratio
```

## Appendix A: Per-thread state growth tables

See `/tmp/growth-detail.json` for the full machine-readable dump. Per-thread tables in the parent doc Appendix D ([`chat-cancelled-message-cache-explosion.md`](./chat-cancelled-message-cache-explosion.md)) cover the keychain thread; below are representative growth curves per provider, taken from the live data:

**Anthropic — `chat_neQa4wKZlWBDYKRMQJlcS`** (10 turns):

| Step | Total msgs | H/uniq | Content KB | Dup H |
| ---- | ---------: | :----: | ---------: | ----: |
| 41   |         11 |  1/1   |         21 |     0 |
| 99   |         37 |  3/2   |        110 |     1 |
| 141  |         74 |  6/3   |        245 |     3 |
| 199  |        126 |  10/4  |        465 |     6 |
| 241  |        189 |  15/5  |        734 |    10 |
| 251  |        254 |  21/6  |        999 |    15 |
| 309  |        334 |  28/7  |      1 319 |    21 |
| 319  |        416 |  36/8  |      1 633 |    28 |
| 329  |        500 |  45/9  |      1 946 |    36 |

**OpenAI — `chat_vjY2cgF6vWALxmBggDrf7`** (8 turns, switched to Anthropic at end):

| Step | Total msgs | H/uniq | Content KB | Img KB | Dup H |
| ---- | ---------: | :----: | ---------: | -----: | ----: |
| 209  |         54 |  1/1   |        295 |      0 |     0 |
| 267  |        124 |  3/2   |        647 |      0 |     1 |
| 325  |        210 |  6/3   |      1 138 |     26 |     3 |
| 383  |        312 |  10/3  |      1 747 |    116 |     7 |
| 401  |        419 |  15/4  |      2 348 |    205 |    11 |
| 405  |        528 |  21/5  |      2 949 |    294 |    16 |
| 415  |        638 |  27/5  |      3 550 |    383 |    22 |

**Gemini — `chat_KXSRxbCQWBueYOLQTynzn`** (8 turns):

| Step | Total msgs | H/uniq | Content KB |    Img KB | Dup H |
| ---- | ---------: | :----: | ---------: | --------: | ----: |
| 3    |          1 |  1/1   |        287 |       287 |     0 |
| 109  |         27 |  2/2   |        695 |       574 |     0 |
| 399  |        128 |  7/6   |      1 228 |       861 |     1 |
| 451  |        239 |  10/7  |      1 778 |     1 149 |     3 |
| 463  |        354 |  14/8  |      2 322 |     1 436 |     6 |
| 467  |        467 |  18/9  |      2 858 |     1 723 |     9 |
| 471  |        580 |  22/9  |      3 394 | **2 010** |    13 |

Note Gemini's image bytes reach 2 MB by turn 7 with no cache to amortise them — F4 + F2 combined is the worst case in the dataset.

## Appendix B: Verification queries

```sql
-- Per-input-step state growth for any thread
SELECT c.metadata->>'step'                                    AS step,
       c.checkpoint->>'ts'                                    AS ts,
       length(cb.blob)                                        AS msg_blob_bytes,
       jsonb_array_length(convert_from(cb.blob,'UTF8')::jsonb) AS msg_count
FROM   langgraph.checkpoints c
JOIN   langgraph.checkpoint_blobs cb ON cb.thread_id = c.thread_id
WHERE  c.thread_id = :thread_id
  AND  c.metadata->>'source' = 'input'
  AND  cb.channel = 'messages'
  AND  cb.version = (c.checkpoint->'channel_versions'->>'messages')
ORDER  BY (c.metadata->>'step')::int;

-- Provider mix per thread (count of AI messages by provider)
WITH msgs AS (
  SELECT jsonb_array_elements(convert_from(cb.blob,'UTF8')::jsonb) AS m
  FROM   langgraph.checkpoint_blobs cb
  WHERE  cb.thread_id = :thread_id
    AND  cb.channel = 'messages'
)
SELECT coalesce(m->'kwargs'->'response_metadata'->>'model_provider', 'undefined') AS provider,
       count(*)                                                                    AS msgs
FROM   msgs
WHERE  m->'id' ->> -1 IN ('AIMessage','AIMessageChunk')
GROUP  BY provider
ORDER  BY msgs DESC;

-- Duplicate HumanMessage content within the latest checkpoint
WITH last_ckpt AS (
  SELECT cb.blob
  FROM   langgraph.checkpoints c
  JOIN   langgraph.checkpoint_blobs cb ON cb.thread_id = c.thread_id
  WHERE  c.thread_id = :thread_id
    AND  cb.channel = 'messages'
    AND  cb.version = (c.checkpoint->'channel_versions'->>'messages')
  ORDER  BY (c.metadata->>'step')::int DESC
  LIMIT  1
)
SELECT substring(m->'kwargs'->>'content' for 80) AS preview,
       count(*)                                  AS copies
FROM   last_ckpt,
       jsonb_array_elements(convert_from(blob,'UTF8')::jsonb) AS m
WHERE  m->'id' ->> -1 = 'HumanMessage'
GROUP  BY preview
HAVING count(*) > 1
ORDER  BY copies DESC;

-- Provider switch detector (any thread that ever used >1 provider)
WITH ai AS (
  SELECT cb.thread_id,
         jsonb_array_elements(convert_from(cb.blob,'UTF8')::jsonb) AS m
  FROM   langgraph.checkpoint_blobs cb
  WHERE  cb.channel = 'messages'
)
SELECT thread_id,
       array_agg(DISTINCT m->'kwargs'->'response_metadata'->>'model_provider') AS providers
FROM   ai
WHERE  m->'id' ->> -1 IN ('AIMessage','AIMessageChunk')
  AND  m->'kwargs'->'response_metadata'->>'model_provider' IS NOT NULL
GROUP  BY thread_id
HAVING count(DISTINCT m->'kwargs'->'response_metadata'->>'model_provider') > 1;
```

## References

- Anthropic prompt caching: <https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching>
- OpenAI implicit prompt caching: <https://platform.openai.com/docs/guides/prompt-caching>
- Google Vertex AI context caching: <https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview>
- LangGraph state reducers: <https://langchain-ai.github.io/langgraph/concepts/low_level/#reducers>
- LangGraph time-travel (fork / replay): <https://docs.langchain.com/oss/javascript/langgraph/use-time-travel>
- LangGraph cancel actions (interrupt / rollback): <https://docs.langchain.com/langsmith/cancel-run>
- LangGraph open issue on stream-cancel persistence: <https://github.com/langchain-ai/langgraph/issues/5672>
- `@langchain/react` `useStream`: <https://langchain-ai.github.io/langgraph/cloud/how-tos/use_stream_react/>
- Claude Code transcript-layer reference implementation (durable reminders / interrupt sentinels): `repos/claude-code/src/utils/messages.ts` (`INTERRUPT_MESSAGE` lines 207-209, `wrapInSystemReminder` line 3097, `createUserInterruptionMessage` lines 546-560, `SYNTHETIC_MESSAGES` lines 302-307); `repos/claude-code/src/utils/transcriptSearch.ts` lines 13-15 (UI/API decoupling)
- Pi reference (monolithic systemPrompt, no per-turn injection): `repos/pi/packages/coding-agent/src/core/system-prompt.ts`
- Prior research: [`chat-cancelled-message-cache-explosion.md`](./chat-cancelled-message-cache-explosion.md), [`chat-model-cost-forensics.md`](./chat-model-cost-forensics.md), [`chat-edit-message-metadata-stripping.md`](./chat-edit-message-metadata-stripping.md), [`gemini-prompt-cache-busting.md`](./gemini-prompt-cache-busting.md), [`context-injection-architecture.md`](./context-injection-architecture.md)
