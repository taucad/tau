---
title: 'LangChain outputVersion v1 strategic review: rollback vs roll-forward'
description: 'Strategic assessment of setting outputVersion v1 on every provider: why the v1 standard-content path is structurally lossy for provider-specific signed/opaque data, how mature v1 is upstream, which failures are universal vs emergent from our ai-sdk hybrid, and whether to roll back to default v0.'
status: active
created: '2026-06-01'
updated: '2026-06-01'
category: comparison
related:
  - docs/research/langchain-v1-tool-call-roundtrip-regression.md
  - docs/policy/cross-provider-content-contract.md
---

# LangChain outputVersion v1 strategic review: rollback vs roll-forward

A decision-grade comparison of whether to keep `outputVersion: 'v1'` on every `Chat<Provider>` instance (plus our growing stack of middleware healers) or revert to the library default `v0`, judged on correctness, reasoning fidelity, cross-provider support, maintenance burden, upstream risk, and reversibility.

## Executive Summary

We set `outputVersion: 'v1'` on every provider in `provider.service.ts`. That single flag is the trigger for **four** distinct send-path failures (Anthropic empty `tool_use.input`, Google `CrossProviderContentError` on `tool_call` blocks, OpenAI assistant `input_text`, OpenAI reasoning `id: ''`) plus a fifth, quieter regression: **the v1 path silently drops the reasoning `rs_` id and `encrypted_content` that the legacy path replays correctly**, degrading reasoning-model accuracy.

The core finding is structural, not incidental: **the v1 standard-content-block model is a lossy projection for any provider-specific signed/opaque artifact** (reasoning ids, encrypted reasoning, thinking signatures, tool-call ids, cache markers). The full fidelity survives only in `additional_kwargs` / `response_metadata`, which the v1 emitters do not consult — whereas every v0 emitter does. Upstream confirms this is an immature, opt-in surface: `outputVersion` **defaults to `v0`**, v1 standard-content support exists in only four packages (Google is explicitly excluded), and the canonical OpenAI fix has sat as an **open, conflicting PR for ~4 months**.

The decisive architectural point is that **our hybrid pipeline already discards rich content blocks at every HTTP boundary**: `@ai-sdk/langchain`'s `toBaseMessages` → `convertAssistantContent` has no reasoning branch and flattens assistant turns to a plain string + `tool_calls`. So across user turns we capture almost none of v1's cross-provider rich-content portability benefit, while within a single run (one provider, no switching) v1's portability is not needed at all — we pay v1's full cost and bank little of its value.

**Verdict: roll back to `v0` (P0).** It is a one-flag-per-provider change on the _current_ package set (no downgrade, no fork), it natively eliminates all four send-path bugs and natively restores reasoning fidelity, and it lets us retire the healer stack once cross-provider normalization is re-validated on v0. Keep v1 only if a concrete, measured cross-provider rich-content feature is shown to depend on it — which current evidence does not support.

## Table of Contents

- Problem Statement
- Background: what `outputVersion: 'v1'` is and how mature it is
- Findings
  - F1: Why v1 drops reasoning when v0 preserves it (source-level)
  - F2: The v1 standard-content model is structurally lossy for opaque data
  - F3: Upstream intent & maturity — v1 is opt-in beta with known, stale gaps
  - F4: Universality — which failures are everyone's vs emergent from our stack
  - F5: The architecture paradox — our UI round-trip neutralizes v1's benefit
  - F6: Does v0 natively avoid all four bugs? (verification)
- Options Comparison
- Recommendations
- Trade-offs & Risks
- References
- Appendix

## Problem Statement

The user asks, with an explicit prior toward rollback: _is the v1 reasoning loss (and the broader four-bug class) a sign that we should stop setting `outputVersion: 'v1'` and wait for the standard-content format to mature upstream, or should we keep v1 and maintain our middleware band-aids?_ Answering requires four things the previous regression doc did not settle:

1. A **source-level "why"** for the reasoning id/`encrypted_content` loss, generalized across providers.
2. The **upstream intent and maturity** of v1 — neglect or roadmap?
3. Whether these are **universal** LangChain bugs or **emergent** from our ai-sdk hybrid.
4. A **rollback-vs-roll-forward verdict** with a comparison matrix, pressure-tested adversarially.

**In scope:** the strategic direction for `outputVersion`. **Out of scope:** implementing either option (no code changes in this investigation); the four individual bug fixes are already documented and shipped in `langchain-v1-tool-call-roundtrip-regression.md`.

## Background: what `outputVersion: 'v1'` is and how mature it is

`outputVersion` selects what gets stored in `AIMessage.content`:

- **`v0` (default):** provider-specific native format in `content`; `.contentBlocks` lazily parses it into the standard format on demand.
- **`v1`:** the standardized `contentBlocks` format is stored _in_ `content`.

Source (`@langchain/core` `language_models/chat_models.ts`, [upstream main](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-core/src/language_models/chat_models.ts)): `outputVersion?: MessageOutputVersion` with `@default "v0"`; opt-in via constructor or `LC_OUTPUT_VERSION=v1`.

Maturity signals (all upstream):

| Signal                   | Evidence                                                                                                                                                                                                                                                            | Implication                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Default is `v0`          | core `@default "v0"`                                                                                                                                                                                                                                                | v1 is opt-in, not the recommended baseline                             |
| Partial provider support | [What's new in LangChain v1](https://docs.langchain.com/oss/javascript/releases/langchain-v1): standard content blocks land only in `langchain`, `@langchain/core`, `@langchain/anthropic`, `@langchain/openai`; _"Broader support for content blocks is planned."_ | **Google is not a supported v1 provider** — yet we set v1 on Vertex    |
| Wiring was broken        | Issue [#10476](https://github.com/langchain-ai/langchainjs/issues/10476) (CLOSED): `castStandardMessageContent` was _not_ called in the `_generateUncached` streaming-aggregation branch, so `createAgent` users silently never got `output_version` set            | v1 shipped before it was consistently applied                          |
| Flagship fix is stale    | Issue [#9879](https://github.com/langchain-ai/langchainjs/issues/9879) (OPEN since 2026-01-27); PR [#9907](https://github.com/langchain-ai/langchainjs/pull/9907) (OPEN, `mergeable: CONFLICTING`, last touched 2026-02-09)                                         | The headline assistant-`input_text` bug has no merged fix ~4 months on |

## Findings

### F1: Why v1 drops reasoning when v0 preserves it (source-level)

Verified against installed `@langchain/openai@1.4.7` (`dist/converters/responses.js`).

**The converter splits the reasoning item on the way _in_.** When an OpenAI reasoning item is received, `convertResponsesMessageToAIMessage` stores the _full_ item (id, summary, and `encrypted_content` when present) in `additional_kwargs`, but pushes only a **lossy, id-less** block into V1 content:

```js
// responses.js:273-279
} else if (item.type === "reasoning") {
    additional_kwargs.reasoning = item;                 // full item: { id:'rs_…', summary, encrypted_content? }
    const reasoningText = item.summary?.map(s => s.text).filter(Boolean).join("");
    if (reasoningText) content.push({ type: "reasoning", reasoning: reasoningText });  // NO id, NO encrypted_content
```

**The v1 emitter re-reads only the lossy block on the way _out_.** `convertStandardContentMessageToResponsesInput` → `convertReasoningBlock` hardcodes an empty id and never looks at `additional_kwargs`:

```js
// responses.js:754-758
const reasoningItem = { type: 'reasoning', id: block.id ?? '', summary }; // block.id is undefined → ""
```

```js
// responses.js:790-792 — v1 path only ever sees the lossy content block
} else if (block.type === "reasoning") { yield* flushMessage(); yield convertReasoningBlock(block); }
```

**The v0 (legacy) emitter does it correctly** — it reads `additional_kwargs.reasoning` and replays the id (+ `encrypted_content` when ZDR), exactly as designed by upstream commit [#9743](https://github.com/langchain-ai/langchainjs/commit/0870ca0719dacd8a555b3341e581d6c15cd6faf3):

```js
// responses.js:966-978 — legacy assistant path (bypassed when output_version === 'v1' at :909)
const reasoning = additional_kwargs?.reasoning;
const hasEncryptedContent = !!reasoning?.encrypted_content;
// ZDR off → include reasoning ids so OpenAI references its stored copy; ZDR on → require encrypted_content.
if (reasoning && (!zdrEnabled || hasEncryptedContent)) {
  input.push(convertReasoningSummaryToResponsesReasoningItem(reasoning)); // spreads ...reasoning → keeps id + encrypted_content
}
```

The single line `if (output_version === "v1") return convertStandardContentMessageToResponsesInput(lcMsg);` (`:909`) is what routes us _around_ the correct path. **v1 is strictly less capable than v0 for reasoning replay.**

### F2: The v1 standard-content model is structurally lossy for opaque data

The reasoning loss is not an isolated bug — it is the **same shape** as the other three failures. In every case, a provider-specific artifact that has no first-class slot in the standard `ContentBlock` schema is either dropped or defaulted to a sentinel on the v1 emit path, while v0 carries it natively:

| Provider artifact                         | Lives correctly in (v0 source) | v1 standard block                | v1 emit result                                        | Evidence                                                     |
| ----------------------------------------- | ------------------------------ | -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| OpenAI reasoning id + `encrypted_content` | `additional_kwargs.reasoning`  | `{type:'reasoning', reasoning}`  | `id: ''` (rejected) / signature lost                  | responses.js:274 vs :756                                     |
| OpenAI tool-call args                     | `message.tool_calls`           | `{type:'tool_call', args}`       | `arguments: ''` unless healed                         | responses.js:765-769                                         |
| Anthropic tool-use input                  | `message.tool_calls`           | `{type:'tool_use', input}`       | `input: ''` (rejected)                                | anthropic `standard.js`; v1 path `message_inputs.js:208-210` |
| Anthropic thinking **signature**          | native `thinking.signature`    | `{type:'reasoning', signature?}` | only carried if we re-attach it (our middleware does) | normalizer `normalizeContentBlock` :71-87                    |
| Tool/assistant message ids                | `message.id`, `tool_call_id`   | merged into blocks               | id-less or `''`                                       | responses.js:756/768/776                                     |

The pattern: **the standard schema models _human-meaningful_ content (text, images, reasoning summaries) well, but treats provider-specific _machine_ state (signed blobs, opaque ids, encrypted continuity tokens) as second-class.** That state is exactly what providers require on replay. v0 keeps the native envelope intact, so the native emitter always has what it needs; v1 flattens to the lowest common denominator and relies on each provider's v1 emitter to faithfully reconstruct the envelope — which, today, none of them do completely. This is a **design tension inherent to a single cross-provider content format**, not a set of incidental typos; the typos (id `??  ""`, missing `toolCalls` arg) are symptoms.

### F3: Upstream intent & maturity — v1 is opt-in beta with known, stale gaps

Intent is real and on a roadmap: v1 exists to give _"provider-agnostic"_, _"type-safe"_, _"backward-compatible"_ access to reasoning traces, citations, and built-in tools via one `contentBlocks` API ([What's new in LangChain v1](https://docs.langchain.com/oss/javascript/releases/langchain-v1)). But it is **explicitly partial and opt-in**:

- Default `v0`; broader provider support _"planned"_; **Google not yet supported** for content blocks.
- The headline send-path bug (#9879, assistant `input_text`) has an **open, conflicting, ~4-month-stale** PR (#9907) and no merged fix in any published version or upstream `main` (per the companion regression doc's version audit).
- No upstream PR threads `message.tool_calls` into the Anthropic v1 formatter, and none adds a `tool_call` case to `@langchain/google-common` — the Anthropic and Google gaps are **unacknowledged in code**.
- A core wiring bug (#10476) meant `createAgent` users didn't even _get_ v1 until recently — evidence the surface shipped ahead of integration testing.

**Conclusion:** the gaps are a mix of _known-but-unprioritized_ (OpenAI) and _not-yet-built_ (Anthropic tool args, Google, reasoning id round-trip). This is a maturing beta, not a finished contract. "Wait for it to mature" is a defensible engineering posture.

### F4: Universality — which failures are everyone's vs emergent from our stack

| Failure mode                            | Universal (any v1 user)                        | Emergent (our hybrid) | Basis                                                                                 |
| --------------------------------------- | ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| OpenAI assistant `input_text`           | **Yes**                                        | —                     | #9879 repro is a plain two-message chat, no ai-sdk, no LangGraph                      |
| OpenAI reasoning `id: ''`               | **Yes** (any v1 reasoning replay within a run) | amplified             | converter splits id unconditionally (F1)                                              |
| Anthropic `tool_use.input: ''`          | **Yes** (v1 + streamed tool call)              | —                     | streaming merge gap + v1 formatter ignores `tool_calls`                               |
| Google `CrossProviderContentError`      | **Yes** (v1 + any `tool_call` block to Google) | —                     | Google is not a v1-supported provider at all                                          |
| Reasoning **dropped across user turns** | partially                                      | **Mostly ours**       | `@ai-sdk/langchain` `convertAssistantContent` has no reasoning branch (F5)            |
| Orphaned tool calls on replay           | —                                              | **Ours / bridge**     | vercel/ai [#11415](https://github.com/vercel/ai/issues/11415); we carry a local patch |

So the **four send-path bugs are universal v1 defects** — anyone setting `outputVersion: 'v1'` and replaying assistant messages hits them. What is _emergent_ from our architecture is the **cross-turn reasoning loss** and the **bridge's tool-call re-emission**, which stem from the `@ai-sdk/langchain` UI round-trip, not from v1 per se. Rolling back v1 fixes the universal four; the emergent two are orthogonal (and partly argue _for_ rollback — see F5).

### F5: The architecture paradox — our UI round-trip neutralizes v1's benefit

v1's reason to exist is cross-provider portability of rich content blocks across turns. Our pipeline defeats that at every HTTP boundary:

- The agent is invoked with `{ messages }` rebuilt from **client UI messages**; `mergeCheckpointTail` only splices tool _outputs_, then `toBaseMessages(...)` runs.
- `@ai-sdk/langchain` `toBaseMessages` → `convertAssistantContent` handles **only `text` and `tool-call`** parts and emits `new AIMessage({ content: textParts.join(""), tool_calls })` — **no reasoning branch, no `additional_kwargs`, no `output_version`**. Rich blocks (reasoning, signatures, encrypted content) are gone before the cross-provider middleware even runs.
- The server→UI stream (our patched adapter) sends reasoning only as plain `reasoning-delta` _text_; the `rs_` id and `encrypted_content` never reach the client.

Consequences for the v0/v1 decision:

1. **Across user turns**, the conversation that reaches any provider is already flattened to text + tool_calls regardless of `outputVersion`. v1's stored-format portability buys **nothing** here, because the rich blocks don't survive the UI boundary.
2. **Within a single run** (tool loop), messages stay native in LangGraph state — but a run never switches provider, so cross-provider portability is **not needed**; v1 only adds the four bugs.
3. Therefore we are in the worst quadrant: **full v1 cost (universal send-path bugs within runs), near-zero v1 benefit (cross-provider rich-content portability, which our UI round-trip already discards).**

This is the strongest single argument for rollback: the feature v1 sells is one our own hybrid architecture has already opted out of.

### F6: Does v0 natively avoid all four bugs? (verification)

Rollback means **removing the `outputVersion: 'v1'` flag** so the library default `v0` applies — **on the current `1.4.x` package set** (no downgrade, no fork; the v0 code paths below are all in the installed packages).

| Bug                                        | v0 native behavior                                                                                                                                                  | Source evidence                                                                               | Healer needed under v0? |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| Anthropic empty `tool_use.input`           | v0 path calls `_formatContent(message, message.tool_calls)` — threads parsed args                                                                                   | `@langchain/anthropic@1.4.0` `message_inputs.js:225,238` (v1 branch at :208 is the buggy one) | **No**                  |
| Google `tool_call` throw                   | v0 stores native content; tool calls go via `roleMessageToContent` reading `message.tool_calls`; no `tool_call` content block reaches `messageContentComplexToPart` | `@langchain/google-common@2.1.33` `gemini.js:372,375-380`                                     | **No**                  |
| OpenAI assistant `input_text`              | v0 legacy assistant path emits `output_text`                                                                                                                        | `@langchain/openai@1.4.7` `responses.js:991-1016`                                             | **No**                  |
| OpenAI reasoning `id: ''` / lost signature | v0 replays full reasoning item from `additional_kwargs.reasoning` (id + `encrypted_content`)                                                                        | `responses.js:966-978` (commit #9743)                                                         | **No**                  |

**All four are natively correct on v0, and reasoning fidelity — the user's accuracy concern — is restored for free.** The catch is not in the send path; it is that v0 stores _native_ content, so our cross-provider thinking/reasoning normalization (which today rewrites assuming v1 blocks) must be **re-validated and likely adjusted** for v0 (it can still read the uniform view via `.contentBlocks`, which v0 lazily parses). That re-validation is the real cost of rollback — a different normalization surface, not zero.

## Options Comparison

| Dimension                   | ROLLBACK to v0 (drop the flag)                                                                                   | ROLL-FORWARD (keep v1 + healers)                                                                       | HYBRID (v1 OpenAI-only, v0 Google)                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Correctness (send path)** | High — 4 bugs vanish natively                                                                                    | Medium — correct only while 4+ healers track upstream                                                  | Mixed — removes Google bug, keeps OpenAI/Anthropic v1 risk |
| **Reasoning fidelity**      | High — id + encrypted_content replayed by v0 natively                                                            | Low→Medium — needs `additional_kwargs` recovery healer (not yet built; current code _drops_ reasoning) | Provider-dependent                                         |
| **Cross-provider support**  | Adequate — portability already runs through our middleware + flattened UI messages; re-validate normalizer on v0 | Theoretically best, **practically unrealized** (F5)                                                    | Fragmented; two code paths to reason about                 |
| **Maintenance burden**      | Low after migration — retire healer stack; one flag removed                                                      | High — ≥4 healers + reasoning recovery + per-bump re-verification of every provider's v1 path          | Highest — must maintain both regimes and the routing logic |
| **Upstream risk**           | Low — v0 is the mature, default, well-exercised path                                                             | High — depends on stale PRs (#9907 ~4mo) and unbuilt Anthropic/Google v1 fixes                         | High — still exposed on the v1 legs                        |
| **Reversibility**           | High — re-add the flag to return to v1 once upstream matures                                                     | High — delete healers when upstream lands                                                              | Medium — unwinding the split is itself work                |

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                  | Priority | Effort | Impact |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| S1  | **Roll back: remove `outputVersion: 'v1'` from all four provider constructors** in `provider.service.ts` (default → v0), staying on current `1.4.x` packages. No downgrade, no fork.                                                                                                                                                    | P0       | Low    | High   |
| S2  | **Re-validate cross-provider normalization on v0** before/with S1: confirm `createCrossProviderContentNormalizerMiddleware` (thinking↔reasoning, signatures) still functions when `content` is provider-native; adjust to read `.contentBlocks` where it currently assumes stored v1 blocks. This is the load-bearing risk of rollback. | P0       | Medium | High   |
| S3  | **Add a hermetic v0 two-turn + provider-switch regression** (Anthropic→OpenAI, OpenAI reasoning replay within a run) asserting the real converter output has no `input_text` on assistant role, no empty `id`, healed tool args — proving the healers are unnecessary on v0.                                                            | P0       | Medium | High   |
| S4  | **Stage the healer retirement**: once S2/S3 pass, delete `rewriteAssistantTextForOpenai`, `dropUnreplayableReasoningForOpenai`, `healEmptyToolCallArgs`, and `stripToolCallBlocksForGoogle` (keep only any genuinely v0-relevant normalization). Track in the regression doc.                                                           | P1       | Medium | Medium |
| S5  | **If S2 reveals a hard v1 dependency** (a measured cross-provider rich-content feature that v0 cannot serve through the middleware), keep v1 _only on that provider_ and document the dependency; otherwise do not keep v1.                                                                                                             | P1       | Low    | Medium |
| S6  | **Record the decision in `cross-provider-content-contract.md`**: v0 is the default; `outputVersion: 'v1'` is reintroduced only when (a) upstream emits role-aware `output_text`, threads `tool_calls` into the Anthropic v1 formatter, adds a Google `tool_call` case, and round-trips reasoning ids, and (b) a feature needs it.       | P1       | Low    | Medium |
| S7  | **Watch upstream**: subscribe to #9879/#9907 and file the missing Anthropic/Google v1 issues so re-adoption has a tracked trigger.                                                                                                                                                                                                      | P2       | Low    | Low    |

## Trade-offs & Risks

**Why rollback is favored (pressure-tested):** the user's instinct is correct _for our architecture specifically_. v1 is an immature, opt-in beta whose one concrete promise — cross-provider rich-content portability — is neutralized by our `@ai-sdk/langchain` UI round-trip (F5). We pay its universal four-bug tax within every run and recover essentially none of its cross-turn benefit. v0 is the default, mature, well-exercised path that natively fixes all four bugs _and_ the reasoning-accuracy regression that prompted this whole thread.

**The honest cost of rollback (do not understate):** v0 stores provider-native content, so the cross-provider normalizer — which currently assumes v1 standard blocks — must be re-validated and likely adjusted (S2). This is real work and the one place rollback could regress the cross-provider switching feature if done carelessly. It is bounded (one middleware + `.contentBlocks` lazy parsing exists as the uniform read view) and gated by S3 tests, but it is not free. Rollback trades "many small upstream-coupled healers" for "one focused, in-repo normalization re-validation."

**When roll-forward would win:** if we measured that (a) users frequently switch providers mid-thread _and_ (b) preserving the prior provider's signed thinking/reasoning across that switch materially improves output _and_ (c) that signal survives our UI boundary — then v1's stored standard format would be worth its tax. Current evidence supports none of the three; the UI boundary alone defeats (c).

**Reversibility cuts both ways and favors acting now:** re-adding `outputVersion: 'v1'` is a one-line-per-provider change. So rollback is low-regret: we can return to v1 the moment upstream closes #9907 and ships the Anthropic/Google/reasoning fixes, _and_ a feature actually needs it.

## References

- Companion root-cause doc: `docs/research/langchain-v1-tool-call-roundtrip-regression.md` (the four bugs, version audit, healer implementations)
- Policy: `docs/policy/cross-provider-content-contract.md`
- LangChain v1 release notes (standard content blocks, partial provider support): https://docs.langchain.com/oss/javascript/releases/langchain-v1
- `outputVersion` reference (`@default "v0"`): https://reference.langchain.com/javascript/langchain-openai/BaseChatOpenAIFields/outputVersion
- Issue #9879 — ChatOpenAI `input_text` on assistant content (OPEN): https://github.com/langchain-ai/langchainjs/issues/9879
- PR #9907 — map assistant content blocks to `output_text` (OPEN, CONFLICTING): https://github.com/langchain-ai/langchainjs/pull/9907
- PR #9886 — superseded predecessor (CLOSED): https://github.com/langchain-ai/langchainjs/pull/9886
- Issue #10476 — v1 not applied in streaming-aggregation branch (CLOSED): https://github.com/langchain-ai/langchainjs/issues/10476
- Commit #9743 — encrypted reasoning in ZDR responses input (the v0 reasoning-replay path): https://github.com/langchain-ai/langchainjs/commit/0870ca0719dacd8a555b3341e581d6c15cd6faf3
- vercel/ai #11415 — `toBaseMessages` orphaned AIMessages / historical tool-call re-emission: https://github.com/vercel/ai/issues/11415
- vercel/ai #12703 — `baseMessagesToUIMessages` / `stateSnapshotToUIMessages` (forward-direction reasoning handling being added): https://github.com/vercel/ai/pull/12703
- OpenAI encrypted reasoning items / ZDR continuity background: https://www.marketingscoop.com/ai/openai-encrypted-reasoning-items-how-stateless-reasoning-works-for-zdr-workflows/

## Appendix — provider-by-provider: v1 cost vs v0 native

| Provider                          | v1 send-path defect                                                                          | Our v1 healer (current)                                                                                                            | v0 native behavior                                                                              | Net of rollback                             |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| OpenAI                            | `input_text` on assistant; reasoning `id: ''`; reasoning signature/encrypted_content dropped | `rewriteAssistantTextForOpenai` + `dropUnreplayableReasoningForOpenai` + `healEmptyToolCallArgs` + `normalizeToolMessageForOpenai` | `output_text` emitted; reasoning replayed from `additional_kwargs` with id (+encrypted_content) | Remove 3–4 healers; gain reasoning fidelity |
| Anthropic                         | `tool_use.input: ''`                                                                         | `healEmptyToolCallArgs`                                                                                                            | `_formatContent(msg, msg.tool_calls)` threads args                                              | Remove 1 healer                             |
| Google (Vertex)                   | `CrossProviderContentError` on `tool_call` block (Google is not a v1 provider)               | `stripToolCallBlocksForGoogle`                                                                                                     | native content + `message.tool_calls`; no offending block                                       | Remove 1 healer                             |
| Cerebras/Together (OpenAI-compat) | inherits OpenAI v1 defects                                                                   | shared OpenAI healers                                                                                                              | shared OpenAI v0 paths                                                                          | inherits OpenAI gain                        |
