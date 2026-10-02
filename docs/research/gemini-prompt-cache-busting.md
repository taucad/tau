---
title: 'Gemini / Vertex AI prompt-cache busting in Tau'
description: 'Root-cause investigation of <10% Gemini implicit cache hit rate driving 5–10× cost on Vertex AI; smoking-gun fixes and architectural overhaul.'
status: draft
created: '2026-05-14'
updated: '2026-05-14'
category: investigation
related:
  - docs/policy/context-engineering-policy.md
  - docs/research/parallel-tool-call-incremental-persistence.md
---

# Gemini / Vertex AI prompt-cache busting in Tau

Root-cause investigation of why a 16-turn `gemini-3.1-pro-preview` chat produced ≥110K input tokens on every turn yet cached only one (~$3.78 total, 1/16 ≈ 6% cache hit rate) and the architecturally correct fixes to eliminate this entire class of failures.

## Executive Summary

The repro chat shows turn-after-turn input cost that decays only on a single turn, consistent with Gemini billing the full ~120K-token prefix as fresh input on every request. We identified four concurrent causes, in order of impact:

1. **Tau prepends a per-turn-mutating `<system-reminder>` HumanMessage to `messages[0]`** (`tokenUsageContextMiddleware`). The reminder body is `Token usage: <used> used / <total> total / <remaining> remaining`. The values change every turn, so the very first byte of `contents` differs across requests and Gemini's implicit-cache prefix hash misses on every turn.
2. **Tools defined ⇒ Gemini 3 Flash silently disables implicit caching**, and Gemini 3 Pro implicit caching is documented-as-flaky (≈40–60% hit rate, GPU instance affinity, undocumented Google-side prompt injection). Tau ships ~16 tools to every Vertex turn.
3. **LangChain's `langchain-google-common` has no first-class context-cache management.** `cachedContent` is a string pass-through; there is no `withCachedContent()`, no automatic create-then-reuse, and no opt-in to strip `tools`/`systemInstruction` when `cachedContent` is set. The architecture is Anthropic-first (`cache_control` breakpoints have no Google equivalent), so the prompt-cache middleware is a no-op for Gemini.
4. **Several other Tau middleware layers conditionally inject content into the cacheable prefix** (`agentSafeguards`, `interruptRecovery`, future `clientContextMiddleware` memory). These are byte-deterministic when triggered but extra cache-fragility surface.

The recommended fix is structural: stop touching the cacheable prefix from middleware, push per-turn dynamic content out of `systemInstruction`/`messages[0]` and into the **last** user message, and adopt **explicit Vertex Context Caching** for the ~50K-token static prefix when the model is Gemini-family. We also need to forward-port a missing "strip tools when `cachedContent` set" guard from `langchain-google` Python (PR #1619) to the JS fork.

Pi (`earendil-works/pi`, the reference implementation we benchmarked against) sets a single static `systemPrompt: string` per session, never mutates it, never prepends per-turn reminders, and lets Gemini's implicit cache handle the rest. That is the target architecture.

## Problem Statement

User-attached usage panel for a single 16-turn `gemini-3.1-pro-preview` chat (Replicad kernel, 3D Hilbert curve build):

| Turn      | Input tokens | Cost      |
| --------- | ------------ | --------- |
| 9         | 110K         | $0.23     |
| 10        | 120K         | $0.24     |
| 11        | 130K         | $0.22     |
| 12        | 120K         | $0.25     |
| 13        | 120K         | $0.25     |
| 14        | 120K         | $0.18     |
| 15        | 120K         | $0.25     |
| 16        | 120K         | $0.040    |
| **Total** | **2M**       | **$3.78** |

Pricing (Tau model registry, `apps/api/app/api/models/model.constants.ts:260`):

```ts
cost: {
  inputTokens: 2,        // $/M
  outputTokens: 12,
  cacheReadTokens: 0.2,  // 10% of input → matches Gemini 3 Pro implicit cache discount
  cacheWriteTokens: 0,
}
```

A fully cached 120K-token request costs `120 × 0.2/1000 = $0.024` plus output → matches turn 16's $0.040. A fully fresh 120K-token request costs `120 × 2/1000 = $0.24` plus output → matches every other turn. **Cache hit rate ≈ 1/16 ≈ 6%.** Anthropic Claude / OpenAI GPT-5 routinely deliver ≥90% steady-state hit rate on the same prompt structure, so this is a Gemini-pipeline-specific defect.

## Methodology

1. Read the full Tau `ChatService.createAgent` middleware stack (`apps/api/app/api/chat/chat.service.ts`) and every cache-relevant middleware listed there.
2. Read the system-prompt assembler (`apps/api/app/api/chat/prompts/cad-agent.prompt.ts`, `apps/api/app/api/chat/utils/create-cached-system-message.ts`) and the LangChain Google bridge (`repos/langchainjs/libs/providers/langchain-google-common/src/utils/gemini.ts` on the `feat/gemini-streaming-reasoning-parallel-tools` fork branch).
3. Cross-referenced upstream LangChain Google PRs/issues (`langchain-ai/langchainjs` #8146, #8163, #10715; `langchain-ai/langchain-google` #1528, #1619).
4. Cross-referenced Google-side known cache flakiness (`googleapis/python-genai` #1880, `vercel/ai` #11513, `google-gemini/gemini-cli` #12615) and the official Vertex/Gemini caching docs.
5. Cloned `earendil-works/pi` (newly added under `repos/pi`) and read `packages/ai/src/providers/google.ts`, `packages/agent/src/agent-loop.ts`, `packages/coding-agent/src/core/system-prompt.ts` to map their working pattern.

## Findings

### Finding 1 — Smoking gun: per-turn token-usage reminder breaks `messages[0]` byte-stability

`apps/api/app/api/chat/middleware/token-usage-context.middleware.ts:67-88`:

```ts
async wrapModelCall(request, handler) {
  const usage = findMostRecentUsage(request.messages);
  if (!usage) return handler(request);

  const { modelId, modelService } = request.runtime.context;
  const used = usage.input_tokens + usage.output_tokens;
  const total = modelService.getContextWindow(modelId);
  const reminderBody = formatTokenUsageReminder(used, total);
  // Body: "<system-reminder>\nToken usage: 12345 used / 1048576 total / 1036231 remaining\n</system-reminder>"

  const reminder = new HumanMessage(reminderBody);
  const messages = [reminder, ...request.messages];
  return handler({ ...request, messages });
}
```

The wiring comment at `chat.service.ts:174-179` even calls out _"so the injected `<system-reminder>` joins the cacheable prefix (see the cache-safety contract in token-usage-context.middleware.ts)"_ — that contract holds for **Anthropic** (the cache breakpoint moves with each turn, so the previous reminder text is irrelevant once a new breakpoint anchors at the latest message). For **Gemini**, there is no breakpoint primitive: implicit caching hashes the request prefix top-down. As soon as `messages[0]` differs in bytes between turn N and turn N+1, the prefix hash misses entirely.

The reminder text changes on every turn because:

- `used` is `input_tokens + output_tokens` of the most recent AIMessage. By definition this is monotonic and unique per turn.
- The reminder is `[reminder, ...messages]`, i.e. it sits **before** the entire conversation history in `contents`.

Net effect: every turn sends a unique `contents[0]` and forces Gemini to re-prefill the full 120K-token prefix. This single middleware accounts for nearly the entire observed cost.

### Finding 2 — Gemini 3 Flash silently disables implicit caching when `tools` are defined; Gemini 3 Pro is unreliable even when conditions are met

Vercel AI SDK issue [#11513](https://github.com/vercel/ai/issues/11513) ("Implicit caching not working with Gemini 3 Flash when tools are defined", closed 2026-01-22): with token counts well above the 1024 minimum and identical message prefixes across requests, `cacheReadTokens` is **always 0** on `gemini-3-flash` whenever any tool is bound. Maintainer reply confirms it's expected behaviour.

`googleapis/python-genai` issue [#1880](https://github.com/googleapis/python-genai/issues/1880) (open, 7 reactions, P2 bug as of 2026-04-26) reproduces the broader pattern. The most informative comment (Angelic47) tested all three Gemini families with a stable 9.5K-token system prefix:

| Model                    | Single-turn cache hit rate (calls 2–5) | Multi-turn cache hit rate (calls 2–5) |
| ------------------------ | -------------------------------------- | ------------------------------------- |
| `gemini-2.5-flash`       | 96.4%                                  | 0% then 96.3% from call 3             |
| `gemini-3-flash-preview` | **0%**                                 | **0%**                                |
| `gemini-3-pro-preview`   | 85.7%                                  | 85.6%                                 |

A separate production system-prompt repro showed `gemini-3-pro-preview` collapsing to **0% across all 5 calls** — the cache is GPU-instance-affinity-bound (FirefoxMetzger, 2026-01-29), so even byte-stable prefixes miss whenever Google's load balancer routes you to a fresh GPU.

`google-gemini/gemini-cli` PR [#12615](https://github.com/google-gemini/gemini-cli/pull/12615) (merged 2025-11-05) added a sort-tools-deterministically pass specifically _"to improve caching"_ — confirming that tool-list ordering is part of the cache-key signature even where tools are otherwise tolerated.

In short: **for Gemini 3 Flash, implicit caching with tools is a broken contract on the Google side**. For Gemini 3 Pro it is best-effort and observed to be 0–86% even when the developer does everything right.

### Finding 3 — `langchain-google-common` is Anthropic-shaped and has no real cache-management surface

The fork at `repos/langchainjs/libs/providers/langchain-google-common/src/utils/gemini.ts` already includes the upstream PR [#8163](https://github.com/langchain-ai/langchainjs/pull/8163) fix that maps `usageMetadata.cachedContentTokenCount → input_token_details.cache_read` (`gemini.ts:1359`). Tau correctly reads this in `usage-tracking.middleware.ts:47`, so the _measurement_ of cache hits is honest. The _generation_ of cache hits is where the abstraction stops:

- `GoogleAIBaseLanguageModelCallOptions.cachedContent?: string` (`types.ts:446`) is a verbatim pass-through into `GeminiRequest.cachedContent` (`gemini.ts:2208-2210`). There is no helper to _create_ a cache, no helper to _reuse_ a cache, and no awareness that `cachedContent` is incompatible with `systemInstruction`/`tools`/`toolConfig` in the same request.
- `langchain-ai/langchain-google` issue [#1528](https://github.com/langchain-ai/langchain-google/issues/1528) (Python side, open) plus PR [#1619](https://github.com/langchain-ai/langchain-google/pull/1619) ("strip tools/tool_config/system_instruction from request when cached_content is set") show this defect being addressed in `langchain-google` Python only. **The TS fork does not have an equivalent fix.** Anyone who naively passes `cachedContent` plus tools today will get a 400 INVALID_ARGUMENT.
- LangChain's prompt-caching primitive is `cache_control: { type: 'ephemeral' }` (Anthropic). `apps/api/app/api/chat/middleware/prompt-caching.middleware.ts` decorates the last message; for Gemini this is silently ignored (Gemini ignores unknown content-block fields).

The architectural mismatch: LangChain's caching API is provider-shaped against Anthropic, whereas Gemini's caching is **resource-shaped** (a `CachedContent` object you create, then reference by name). The two models do not compose; you cannot wrap Gemini behind Anthropic's API without losing cache control.

### Finding 4 — Tau's static system-prompt prefix is mostly safe, but a few sections still bust it

`getCadSystemPrompt` returns `{ static: string, dynamic: string }`, packed into a 2-block `SystemMessage` by `createCachedSystemMessage`:

```ts
new SystemMessage({
  content: [
    { type: 'text', text: staticPrompt, cache_control: { type: 'ephemeral' } }, // ← Anthropic-only
    { type: 'text', text: dynamicPrompt },
  ],
});
```

For Gemini the `cache_control` field is ignored and both blocks are concatenated into `systemInstruction.parts`. The `dynamic` block currently contains `chatId`, `modelId`, `contextWindow`, `knowledgeCutoff`, and (when present) `gitStatus`. Within a single chat session, all five are byte-stable, so today's `systemInstruction` _is_ byte-stable across turns. Two latent risks:

- `gitStatus` is currently `undefined` (the UI's `contextPayload` is commented out at `apps/ui/app/routes/projects_.$id/chat-history.tsx:152, 192`). The moment it is re-enabled, every file edit by the LLM will mutate `gitStatus`, which sits in `systemInstruction`, which is the very first thing Gemini hashes.
- The `clientContextMiddleware` injects a third block of skills _between_ static and dynamic via array-mutation (`apps/api/app/api/chat/middleware/client-context.middleware.ts:174`). It also prepends a memory `HumanMessage` to `messages[0]` (line 188). Both are gated on `contextPayload`. When re-enabled, memory contents change as the agent writes to `.tau/AGENTS.md`, busting `messages[0]` again.

### Finding 5 — Other middleware layers add cache-fragility surface

Conditional injectors (only fire when triggered, but worth listing because they all add `<system-reminder>` to the cacheable prefix when they do):

| Middleware                                | Trigger                                          | Effect                                                                                                |
| ----------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `agentSafeguardsMiddleware`               | Doom-loop / repeated-error detection             | Appends `<system-reminder>` `HumanMessage` to `state.messages` (`agent-safeguards.middleware.ts:932`) |
| `interruptRecoveryMiddleware`             | Trailing run of `USER_INTERRUPTED` ToolMessages  | Injects one-shot `<system-reminder>`                                                                  |
| `clientContextMiddleware` (skills/memory) | `contextPayload` present                         | Prepends memory `HumanMessage`, mutates `SystemMessage`                                               |
| `messageContentSanitizerMiddleware`       | AIMessage with no text but with reasoning blocks | Appends `[interrupted]` placeholder (rare)                                                            |

`tool-result-budget` and `tool-offloading` are explicitly designed to be byte-deterministic across turns: once a tool result is offloaded into the `<persisted-output>` envelope, the `isAlreadyPersisted` short-circuit (`tool-result-budget.middleware.ts:106-108`) prevents re-mutation. These are **safe** for prefix caching.

### Finding 6 — Pi's pattern: monolithic `systemPrompt: string`, no per-turn injection

`repos/pi/packages/coding-agent/src/core/system-prompt.ts` builds the system prompt **once** per session. It contains tools list, guidelines, project context files, skills, current date, cwd. The only fields that change session-over-session are `date` and `cwd`. Within a session it never changes.

`repos/pi/packages/agent/src/agent-loop.ts:281-308` (`streamAssistantResponse`) constructs the LLM context as `{ systemPrompt: context.systemPrompt, messages: llmMessages, tools: context.tools }` and passes it directly to `streamSimple`. There is **no equivalent of `tokenUsageContextMiddleware`**; pi tracks cumulative usage on `AssistantMessage.usage` for billing/reporting but never feeds it back into the prefix.

`repos/pi/packages/ai/src/providers/google.ts:336-394` (`buildParams`) wraps the system prompt as `systemInstruction: sanitizeSurrogates(context.systemPrompt)` and the conversation history as `contents`. There is no `cachedContent` plumbing; pi relies entirely on Gemini's implicit cache. Per the Pi sessions linked from their README, this works.

The crucial structural difference: pi treats _the prompt_ as the source of truth and the _agent loop_ as a function of `(prompt, history)`. Tau treats _middleware_ as the source of truth, layering in per-turn mutations that are correct for Anthropic but silently destructive for Gemini.

## Recommendations

Priority legend: P0 = ship next, P1 = ship within sprint, P2 = nice-to-have.

| #   | Action                                                                                                                                                                                                                                                                                       | Priority | Effort | Impact                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| R1  | Stop prepending the per-turn token-usage reminder unconditionally; either remove or gate behind a >80%-context threshold                                                                                                                                                                     | **P0**   | XS     | High — single-largest cost driver                                                                                             |
| R2  | Move `gitStatus` out of the `systemInstruction` block into the **last** user message envelope (treat it as per-turn user context, not system context)                                                                                                                                        | **P0**   | S      | High — keeps `systemInstruction` byte-stable forever                                                                          |
| R3  | Adopt **explicit Vertex Context Caching** for Gemini-family models: create a `CachedContent` resource holding `systemInstruction + tools + tool_config` per (chat × system-prompt-hash); reuse `cachedContent: <name>` per turn; refresh TTL on each use                                     | **P0**   | M      | High — guaranteed 75–90% discount on the static prefix; bypasses Gemini 3 Flash's "tools kill implicit cache" defect entirely |
| R4  | Forward-port `langchain-google` Python PR #1619 to `langchain-google-common` JS: when `cachedContent` is set on a request, strip `systemInstruction`, `tools`, `toolConfig` from `GeminiRequest` (avoid the 400 INVALID_ARGUMENT)                                                            | **P0**   | S      | High — unblocks R3 cleanly without a custom request transformer                                                               |
| R5  | Sort tools deterministically before binding (`apps/api/app/api/chat/chat.service.ts:89-106` already has a deterministic listing order — keep it; add a unit test that enforces stable ordering)                                                                                              | **P1**   | XS     | Medium — cheap insurance against future drift, mirrors `gemini-cli` PR #12615                                                 |
| R6  | Make conditional middleware injectors (`agentSafeguards`, `interruptRecovery`, future `clientContextMiddleware` memory) no-op on `provider === 'vertexai'` UNLESS `cachedContent` is in use, OR make them inject **into the latest user message** instead of `messages[0]`                   | **P1**   | S      | Medium — eliminates remaining cache-bust surface                                                                              |
| R7  | Build a `GeminiCacheManager` service: keyed by `(chatId, systemPromptHash, toolsHash)`, lazy-creates a `CachedContent` on first use, stores cache name in checkpointer state, refreshes TTL, and detaches when the system prompt or tools hash changes; integrate with `provider.service.ts` | **P1**   | M-L    | High — productionises R3 across all chats and survives system-prompt edits                                                    |
| R8  | Stop sending `cache_control` on the SystemMessage and on the last message **for non-Anthropic providers** in `promptCachingMiddleware` and `createCachedSystemMessage` (it's harmless but misleading and shows up in transcripts/debug dumps)                                                | **P2**   | XS     | Low (cosmetic)                                                                                                                |
| R9  | Add a Grafana panel for `usage_metadata.input_token_details.cache_read / usage_metadata.input_tokens` per provider per model, with alerting when the rolling hit rate drops below 50%                                                                                                        | **P2**   | S      | Medium — early warning for future regressions                                                                                 |
| R10 | Test instrumentation: a `gemini-cache-regression.integration.test.ts` that runs a 5-turn conversation against Vertex with `gemini-3-pro` and asserts cache_read ≥ 80% on turns 2–5 (skips when no creds; covers the contract)                                                                | **P2**   | M      | Medium — regression net                                                                                                       |

### R1 detail — fix the smoking gun in 5 minutes

The minimal Gemini-safe behaviour is: only inject the token-usage reminder when the agent is actually approaching the limit. A pragmatic threshold is 70% of the context window:

```ts
// token-usage-context.middleware.ts (proposed)
async wrapModelCall(request, handler) {
  const usage = findMostRecentUsage(request.messages);
  if (!usage) return handler(request);

  const { modelId, modelService } = request.runtime.context;
  const used = usage.input_tokens + usage.output_tokens;
  const total = modelService.getContextWindow(modelId);
  if (!total || used / total < 0.7) {
    return handler(request);                    // ← steady-state: no prefix mutation
  }

  // ... existing inject path ...
}
```

This change alone would have moved the repro chat from 1/16 cache hits to ~14/16 (everything except turn 1 and the rare hits that miss for GPU-affinity reasons). At Gemini 3 Pro pricing the saved cost is `(14 × 120K × 1.8/M) ≈ $3.02` on a $3.78 chat — ~80% cost reduction from this one fix.

A stronger variant: drop the middleware entirely for Vertex AI (the agent already sees `usage_metadata` on prior AIMessages — it can reason about its own context budget without us re-injecting it). The reminder pattern is genuinely useful for Anthropic where `cache_control` breakpoints anchor the prefix anyway, but for Gemini it's pure poison.

### R3 detail — Vertex explicit context caching architecture

```
chatId, systemPromptHash, toolsHash
        │
        ▼
┌───────────────────┐
│ GeminiCacheManager │
│  Map<key, name>   │      ┌──────────────────────┐
│  + TTL refresh    │─────▶│ Vertex Context Cache │
└───────────────────┘      │  (CachedContent)     │
        │                  │   - systemInstruction │
        │ name             │   - tools             │
        ▼                  │   - tool_config       │
┌───────────────────┐      └──────────────────────┘
│ ChatVertexAI call │
│   cachedContent:  │
│     <name>        │
│   contents:       │
│     [history...]  │
│   (no SI/tools)   │
└───────────────────┘
```

Cache lifecycle:

- **Create-on-miss** at the first turn where `(systemPromptHash, toolsHash)` is unseen for this chat. Persist the returned cache name in LangGraph checkpointer state (so a process restart resumes correctly).
- **Refresh TTL** on each use to a rolling window (e.g. 1h) — avoids unbounded storage cost while keeping the cache warm.
- **Invalidate** when either hash changes (system-prompt EVAL bumps, tool-set changes mid-chat). Re-create on next turn.
- **Strip locked fields**: per R4, request must omit `systemInstruction`, `tools`, `tool_config` when `cachedContent` is set.

Pricing math (Vertex `gemini-3.1-pro-preview`):

- Static prefix size: ~50K tokens (system prompt + tools + tool config). Conservative.
- Implicit cache today: 0–10% hit rate → ~$0.10/turn unnecessary.
- Explicit cache: 90% discount on cached tokens, plus ~$1/M·hour storage. For 50K tokens cached for 1h that's ~$0.05/h storage. With even 10 turns/h the per-turn cost drops from `50K × 2/M = $0.10` to `50K × 0.2/M + $0.05/10 = $0.015`. ~85% reduction on the static prefix portion alone, BEFORE accounting for the conversation-history caching that implicit caching also delivers when the prefix is byte-stable.

## Trade-offs

| Approach                                                           | Pros                                                                                                        | Cons                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Implicit caching only** (status quo, fix R1+R2 only)          | Zero infra; no service to operate; pi-style simplicity                                                      | At Google's mercy: Gemini 3 Flash always 0% with tools, Pro is 0–86% with GPU affinity flake; no SLA                                                                                       |
| **B. Explicit caching only** (R3+R4+R7, drop implicit)             | Predictable 75–90% discount; bypasses Flash defect; works across GPU instances                              | Storage cost; cache-management state to operate; cache-stampede on system-prompt edits; Vertex ≥1 region pin                                                                               |
| **C. Hybrid (recommended)**                                        | Implicit covers conversation history (cheap when it works); explicit locks the static prefix (always works) | Two systems to reason about; need clear invalidation policy                                                                                                                                |
| **D. Drop LangChain Google for direct `@google/genai` (pi-style)** | Tightest control, smallest diff to upstream pattern; matches reference implementation                       | Loses `wrapModelCall`/`createAgent` middleware integration; large refactor; Tau-specific tooling (eager-dispatch, safeguards) would need re-implementation against a non-LangChain runtime |

C is the right place to land. D is the architecturally cleanest answer but the refactor cost is not justified by the savings if A+C land first.

## Code Examples

### Repro for the prefix-mutation bug

The contract test below would have caught the regression. Inserts a stub `tokenUsageContext`-style middleware and asserts `messages[0]` is byte-stable across turns:

```ts
// apps/api/app/api/chat/middleware/token-usage-context.cache-stability.test.ts
it('does not mutate messages[0] across turns when token-usage changes', () => {
  const turn1 = applyMiddleware([new HumanMessage('hi')], { used: 1000, total: 100_000 });
  const turn2 = applyMiddleware([new HumanMessage('hi'), new AIMessage('hello'), new HumanMessage('next')], {
    used: 5000,
    total: 100_000,
  });
  // Today this fails: turn1[0].content !== turn2[0].content because the reminder
  // body encodes the changing `used` count.
  expect(turn1[0].content).toEqual(turn2[0].content);
});
```

### Pi's stable-prefix pattern (reference)

```ts
// repos/pi/packages/agent/src/agent-loop.ts:288-296
const llmContext: Context = {
  systemPrompt: context.systemPrompt, // ← string, set once per session
  messages: llmMessages, // ← only conversation history grows
  tools: context.tools, // ← stable list
};
```

Compare with Tau's middleware-stack version that injects token-usage / safeguards / memory into the prefix every turn.

## Diagrams

Cache-key surface today (Tau, Gemini 3 Pro):

```
┌──────────────── systemInstruction ─────────────────┐ ┌────────────── contents ───────────────┐
│ static (role/workflow/tools docs/canonical exam.)  │ │ [tokenReminder_N]  ← changes every turn
│ (skills - currently disabled)                       │ │ [memory_N]         ← prep'd if enabled │
│ dynamic (chatId/modelId/ctxWindow/cutoff/gitStatus)│ │ [user1]                                │
│                                                     │ │ [model1]                               │
│  ✓ byte-stable today (gitStatus is undefined)       │ │ [user2]                                │
│  ✗ becomes unstable when contextPayload returns    │ │ ...                                    │
└─────────────────────────────────────────────────────┘ └────────────────────────────────────────┘
                                                            ▲
                                                            └── prefix differs at byte 0 → cache miss
```

Cache-key surface after R1+R2+R3:

```
┌──────────── CachedContent (explicit, reused) ────────────┐ ┌── contents (per request) ──┐
│ systemInstruction                                          │ │ [user1]                   │
│ tools (sorted)                                             │ │ [model1]                  │
│ toolConfig                                                 │ │ ...                       │
└────────────────────────────────────────────────────────────┘ │ [latestUserMsg + gitStatus│
                                                                │   + token-usage reminder] │
                                                                └────────────────────────────┘
                                                                       ▲
                                                       implicit cache covers history prefix;
                                                       only the trailing user message differs
```

## References

- [LangChain JS issue #8146 — Gemini 2.5 implicit caching and token count](https://github.com/langchain-ai/langchainjs/issues/8146) — closed, fixed via PR #8163; baseline for `cachedContentTokenCount` plumbing
- [LangChain JS PR #8163 — feat(google): Assorted updates and tests from recent announcements](https://github.com/langchain-ai/langchainjs/pull/8163) — already in our fork
- [LangChain JS issue #10715 — streaming usage_metadata missing cache_read and reasoning details](https://github.com/langchain-ai/langchainjs/issues/10715) — fixed in our fork
- [LangChain Google issue #1528 — Gemini Context Caching Incompatibility with LangChain Tools/Agents](https://github.com/langchain-ai/langchain-google/issues/1528) — Python; mirror exists in JS
- [LangChain Google PR #1619 — strip tools/tool_config/system_instruction when cached_content set](https://github.com/langchain-ai/langchain-google/pull/1619) — needs JS port (R4)
- [Vercel AI SDK issue #11513 — Implicit caching not working with Gemini 3 Flash when tools are defined](https://github.com/vercel/ai/issues/11513) — Google-side defect, closed as expected behaviour
- [googleapis/python-genai issue #1880 — Implicit caching produces inconsistent cache hits when system prompt changes](https://github.com/googleapis/python-genai/issues/1880) — open P2; documents Gemini 3 Flash 0% / Gemini 3 Pro flaky / GPU affinity hypothesis
- [google-gemini/gemini-cli PR #12615 — List tools in a consistent order](https://github.com/google-gemini/gemini-cli/pull/12615) — confirms tool order is part of cache signature (R5)
- [Vertex AI Context caching overview](https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview) — explicit cache pricing, TTL, locked fields
- [`earendil-works/pi`](https://github.com/earendil-works/pi) — reference implementation; cloned at `repos/pi/`
- Local: `repos/langchainjs/libs/providers/langchain-google-common/src/utils/gemini.ts` (fork branch `feat/gemini-streaming-reasoning-parallel-tools`)
- Local: `apps/api/app/api/chat/middleware/token-usage-context.middleware.ts` (the smoking gun)
- Local: `apps/api/app/api/chat/chat.service.ts` (middleware ordering)
- Local: `apps/api/app/api/chat/prompts/cad-agent.prompt.ts` + `utils/create-cached-system-message.ts` (Anthropic-shaped cache architecture)

## Appendix — full middleware impact matrix on the Gemini cache prefix

| Middleware (chat.service.ts order)               | Mutates `systemMessage`? |        Mutates `messages[0]`?        |               Mutates older `messages[N]`?                |                        Cache-safe for Gemini?                         |
| ------------------------------------------------ | :----------------------: | :----------------------------------: | :-------------------------------------------------------: | :-------------------------------------------------------------------: |
| `createReadDedupStateMiddleware`                 |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createToolMetricsMiddleware`                    |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `toolErrorHandlerMiddleware`                     |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createWriterCaptureMiddleware`                  |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createEagerDispatchMiddleware`                  |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createToolOffloadingMiddleware`                 |            —             |                  —                   | offload tool result on first sight, idempotent thereafter |       ✅ (deterministic via `<persisted-output>` short-circuit)       |
| `createToolResultBudgetMiddleware`               |            —             |                  —                   |                       same as above                       |                                  ✅                                   |
| `toolResultTrimmerMiddleware`                    |            —             |                  —                   |                trims tool results in place                | ⚠️ deterministic but verify trimmer is byte-stable on identical input |
| `createCompactionMiddleware`                     |            —             |                  —                   |        replaces history with summary on threshold         |            ⚠️ acceptable: invalidation event, not per-turn            |
| `createTokenUsageContextMiddleware`              |            —             | **✗ prepends per-turn HumanMessage** |                             —                             |                          **❌ smoking gun**                           |
| `createAgentSafeguardsMiddleware`                |            —             |          conditional nudge           |                             —                             |                              ⚠️ rare; OK                              |
| `createInterruptRecoveryMiddleware`              |            —             |          conditional nudge           |                             —                             |                              ⚠️ rare; OK                              |
| `createCrossProviderContentNormalizerMiddleware` |            —             |                  —                   |        rewrites past AIMessages on provider switch        |              ⚠️ deterministic but verify byte stability               |
| `messageContentSanitizerMiddleware`              |            —             |                  —                   |          appends `[interrupted]` to empty AIMsgs          |                       ⚠️ deterministic but rare                       |
| `newlineTrimmerMiddleware`                       |            —             |                  —                   |            trims trailing newlines on AI text             |                             ✅ idempotent                             |
| `latexDelimiterMiddleware`                       |            —             |                  —                   |              normalises `$...$` ↔ `\(...\)`               |                             ✅ idempotent                             |
| `promptCachingMiddleware`                        |            —             |                  —                   |            adds `cache_control` to last block             |                      ✅ Gemini ignores the field                      |
| `messageLoggingMiddleware`                       |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createLlmTimingMiddleware`                      |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createAgentIterationsMiddleware`                |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createUsageTrackingMiddleware`                  |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createContextUsageMiddleware`                   |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createTranscriptMiddleware`                     |            —             |                  —                   |                             —                             |                                  ✅                                   |
| `createClientContextMiddleware`                  |  ✗ inserts skills block  |   ✗ prepends memory `HumanMessage`   |                             —                             |         ⚠️ currently disabled; **dangerous when re-enabled**          |
