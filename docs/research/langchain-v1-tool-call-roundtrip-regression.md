---
title: 'LangChain v1 tool_call round-trip regression after AI SDK / langchain dep bumps'
description: 'Smoking-gun root cause for chat breaking across Anthropic, Google, and OpenAI after commit c7e71fc: three V1 content-block round-trip bugs in the bumped LangChain packages, all triggered by outputVersion v1 on every provider.'
status: active
created: '2026-05-28'
updated: '2026-05-31'
category: investigation
related:
  - docs/research/cross-provider-thinking-block-portability.md
  - docs/research/langchain-v1-output-version-strategic-review.md
---

# LangChain v1 tool_call round-trip regression after AI SDK / langchain dep bumps

Investigation of why chat broke across all model providers after dependency bump commit `c7e71fc6`, root-causing three distinct provider-side bugs all triggered by a single shared design choice: every `Chat<Provider>` instance is constructed with `outputVersion: 'v1'`.

## Executive Summary

After commit `c7e71fc690636518d43f22483c18c8cbb6ac576c` (May 27 2026), the second turn of any tool-using conversation fails on Anthropic (`tool_use.input: Input should be an object`), Google (`Content block of type "tool_call" is not portable to the Google provider`), and OpenAI (`Invalid value: 'input_text'. Supported values are: 'output_text' and 'refusal'`). The errors are different but share one root: each provider's V1 content-block round-trip path in the bumped LangChain packages mishandles the V1 `tool_call` / `text` blocks emitted by `castStandardMessageContent` for assistant messages. Because we set `outputVersion: 'v1'` on every chat model in `apps/api/app/api/providers/provider.service.ts`, every checkpoint replay on turn 2+ trips one of these bugs.

**These are intra-provider self-round-trip failures, not cross-provider portability failures.** All three reproduction transcripts (Haiku→Haiku, Flash→Flash, GPT-4.1→GPT-4.1) stayed on a single provider end-to-end. The upstream Google error message — `"…from another provider was replayed without normalization"` — is misleading: `CrossProviderContentError` is thrown unconditionally on any V1 `tool_call` block reaching `messageContentComplexToPart`, even when the producing model is Google itself.

**Implemented (2026-05-31):** R1–R3 and R5 land in the existing `createCrossProviderContentNormalizerMiddleware` as target-aware healers (not a separate `OutputVersionV1Roundtrip` middleware). The operation is the same as reasoning portability — rewrite `AIMessage.content` at `wrapModelCall` before the active provider's converter — so a second middleware would only duplicate wiring.

**Roll-forward attempt (2026-05-31) — BLOCKED; resolved no-fork via middleware.** A request to remove the `omitOutputVersion` band-aid by upgrading to "versions where these V1 round-trip bugs are fixed upstream" was investigated and found to be impossible: **no such version exists, on npm or in unreleased upstream `main`.** All three bugs are still live in the installed `@latest` packages, in `langchain-ai/langchainjs` `main` (HEAD `1503c9bea`, 2026-05-27, 68 commits ahead of the fork base), and in every `next`/`dev`/`alpha`/`rc` dist-tag. The only OpenAI fix in flight is an open, conflicting, unmerged PR.

The user then chose to **avoid forking** and keep the fix in our middleware, replacing the disputed `omitOutputVersion` with an architecturally-honest transform that **preserves `output_version: 'v1'`**. The OpenAI healer now rewrites assistant `text` blocks into the converter's own sanctioned `non_standard` passthrough (a native Responses `output_text` message item) and normalizes `response_metadata.model_provider` to `'openai'` so that passthrough fires. See [Roll-forward resolution](#roll-forward-resolution-2026-05-31) for the full evidence and the chosen approach. The three healers remain the policy-mandated sole repair surface; `omitOutputVersion` has been deleted.

## Roll-forward resolution (2026-05-31)

> **Verdict: a clean roll-forward is BLOCKED — the fixed versions do not exist.** The user's directive was "omitting the output version is the wrong approach, we need to roll forward" to "versions where these V1 round-trip bugs are fixed upstream." Direct verification against npm and the upstream `langchain-ai/langchainjs` source shows that **none of the three bugs is fixed in any published release, in any pre-release dist-tag, or in current upstream `main`.** There is nowhere forward to roll to. Per the project rule "never fabricate version numbers — verify on npm," this section records the evidence rather than guessing a target.

### What "current" means

| Package                           | Installed           | npm `latest`        | Conclusion                                                               |
| --------------------------------- | ------------------- | ------------------- | ------------------------------------------------------------------------ |
| `@langchain/openai`               | `1.4.7`             | `1.4.7`             | already on latest                                                        |
| `@langchain/anthropic`            | `1.4.0`             | `1.4.0`             | already on latest                                                        |
| `@langchain/core`                 | `1.1.48`            | `1.1.48`            | already on latest                                                        |
| `@langchain/langgraph`            | `1.3.2`             | `1.3.2`             | already on latest                                                        |
| `langchain`                       | `1.4.2`             | `1.4.2`             | already on latest                                                        |
| `@langchain/google-common` (fork) | `2.1.33`            | `2.1.31` (upstream) | fork is **ahead** of upstream npm                                        |
| `@ai-sdk/langchain`               | `2.0.181` (patched) | `2.0.200`           | newer exists, **orthogonal** (reasoning-leak adapter, not V1 round-trip) |
| `ai`                              | `6.0.191`           | `6.0.193`           | newer exists, **orthogonal**                                             |

The `c7e71fc6` "bump" was a lockfile re-resolution, not a catalog edit: the catalog ranges (`@langchain/anthropic ^1.3.28`, `@langchain/core ^1.1.44`, `@langchain/openai ^1.4.5`, `@langchain/langgraph ^1.3.0`, `langchain ^1.4.0`, `ai ^6.0.99`) already permit the 1.4.x line via caret resolution, so `pnpm install` floated to the current `@latest` set. **We are already at the newest published code.**

No pre-release channel helps either — `npm view <pkg> dist-tags` shows `next`/`alpha` pointing at the _older_ `1.0.0-alpha.x` line and `dev` at timestamped snapshots that predate `latest`:

- `@langchain/openai`: `next`/`alpha` = `1.0.0-alpha.3`, `dev` = `1.3.0-dev-…`, `latest` = `1.4.7`
- `@langchain/anthropic`: `next`/`alpha` = `1.0.0-alpha.2`, `dev` = `1.4.0-dev-…`, `latest` = `1.4.0`
- `@langchain/core`: `next`/`alpha` = `1.0.0-alpha.7`, `dev` = `1.1.43-dev-…`, `latest` = `1.1.48`

### The three bugs are still present in unreleased upstream `main`

Verified by reading `upstream/main` (`langchain-ai/langchainjs` HEAD `1503c9bea`, 2026-05-27) in `repos/langchainjs`, 68 commits ahead of the current fork base. Providers moved to `libs/providers/` upstream.

1. **OpenAI** — `libs/providers/langchain-openai/src/converters/responses.ts`, `convertStandardContentMessageToResponsesInput`: the `text` branch still calls `pushMessageContent([{ type: "input_text", text: block.text }], …)` unconditionally, regardless of `messageRole`. The function's own JSDoc example even encodes the buggy output: `{ type: "message", role: "assistant", content: [{ type: "input_text", … }] }`. Installed mirror: `dist/converters/responses.js:787` (V1 entry at `:909`; buggy JSDoc at `:638`).
2. **Anthropic** — `libs/providers/langchain-anthropic/src/utils/standard.ts`, `_formatStandardContent`: still emits `tool_use.input = block.args` (installed `dist/utils/standard.js:108-112`) and the signature is still `(message: BaseMessage)` with **no `toolCalls` parameter** — the JS↔Python parity gap is unclosed. The empty-`args` upstream cause is also unchanged: `@langchain/core` `messages/base.ts:568` `getMergeableTypeBase` strips the `_delta` suffix, so a `tool_use` block (base `tool_use`) and an `input_json_delta` block (base `input_json`) are _deliberately_ kept separate — commit `ef78bc6a2 fix(core): keep content block types separate when merging chunks (#10790)` makes that non-merge intentional. The core Anthropic block translator (`messages/block_translators/anthropic.ts:348-356`) reads `block.input` directly for the `tool_call` cast.
3. **Google** — fork `libs/providers/langchain-google-common/src/utils/gemini.ts`, `messageContentComplexToPart`: cases are `text/image_url/media/reasoning/thinking/input_audio/image/video/audio/file/text-plain`; a V1 `tool_call`/`tool_use` block hits `default: throw new CrossProviderContentError(...)` (installed `dist/utils/gemini.js:339`). Upstream `main` is identical except it throws a generic `Error` and lacks the fork's `thinking` case — still **no `tool_call` case**. `roleMessageToContent` reads `message.tool_calls` separately, so tool calls are double-represented (once, fatally, as a content block; once, correctly, via `tool_calls`). The `CrossProviderContentError` class is a fork invention (`cd92cc738 fix(google): portable thinking blocks + CrossProviderContentError`).

### Upstream fix status (per-provider)

| Provider  | Fix in flight?        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Released? |
| --------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| OpenAI    | Yes, but **unmerged** | Issue [#9879](https://github.com/langchain-ai/langchainjs/issues/9879) (OPEN, 2026-01-27, "ChatOpenAI cannot handle AIMessage with contentBlock type `text`"); PR [#9907](https://github.com/langchain-ai/langchainjs/pull/9907) "fix(openai): map assistant content blocks to output_text" — **OPEN, `mergeable: CONFLICTING`, last touched 2026-02-09**, ~3.5 months stale; supersedes closed [#9886](https://github.com/langchain-ai/langchainjs/pull/9886) | No        |
| Anthropic | No                    | No PR threads `message.tool_calls` into `_formatStandardContent` (the JS parity fix for Python's `_convert_from_v1_to_anthropic(..., tcs, ...)`). Closest historical PR `#7943` (merged 2025) handles tools with _no_ args — a different case                                                                                                                                                                                                                  | No        |
| Google    | No                    | No upstream PR adds V1 `tool_call` content-block handling; the throw is masked locally by the fork                                                                                                                                                                                                                                                                                                                                                             | No        |

### The third option: a `non_standard` passthrough that keeps `output_version: 'v1'`

The earlier framing — "there is no third option that keeps `output_version` and produces `output_text`" — was **incomplete**. A precise re-read of the installed converter (`@langchain/openai@1.4.7` `dist/converters/responses.js`) found one:

- The v1 converter (`convertStandardContentMessageToResponsesInput`) always emits `input_text` for `text` blocks (`:781`), with no role awareness. **But** it has exactly one verbatim-passthrough branch: `non_standard` (`:846` — `} else if (block.type === "non_standard" && isResponsesMessage) { yield* flushMessage(); yield block.value; }`). It yields `block.value` directly as a top-level `ResponsesInputItem`.
- That branch is gated by `isResponsesMessage` (`:644` — `AIMessage.isInstance(message) && message.response_metadata?.model_provider === "openai"`). The only other `model_provider` reads (`:226`, `:446`) are in the **response → AIMessage** direction (the package stamps `"openai"` on messages it emits — which is why same-provider replay already has it). So in the **send path**, `model_provider` has exactly one effect: enabling the `non_standard` branch.

Therefore the fix is a content-block rewrite, no fork, `output_version` untouched:

1. Rewrite each assistant `text` block → `{ type: "non_standard", value: { type: "message", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] } }`. (The value must be a _complete_ message item, not a bare `output_text` content part, because `non_standard` is yielded as a top-level item. The shape mirrors the converter's own legacy assistant path.)
2. Set `response_metadata.model_provider = "openai"` so `isResponsesMessage` is true for cross-provider replays (whose `model_provider` is e.g. `"anthropic"`); same-provider replays already satisfy it.
3. Drop foreign `non_standard` wrappers (Anthropic `redacted_thinking` / `compaction`) — flipping the gate would otherwise emit their invalid values verbatim. They were already discarded for OpenAI by the gate, so this preserves behaviour.
4. Keep `tool_call` blocks (the v1 converter builds `function_call` items only from them, never from `message.tool_calls`) and heal their empty args from `message.tool_calls` — `convertFunctionCall` (`:765`) reads `tool_call.args`, so an empty `args` becomes an invalid `arguments: ""`.

### Decision (2026-05-31): no-fork middleware band-aid

- **Chosen.** Implement the `non_standard` `output_text` rewrite above in `createCrossProviderContentNormalizerMiddleware`; delete `omitOutputVersion` and its `rebuildAiMessage` omit-path. Keep `stripToolCallBlocksForGoogle` and the empty-args heal (now applied for Anthropic **and** OpenAI). This satisfies the user's two hard constraints: **no fork**, and **`output_version: 'v1'` is never cleared**. Tests assert the real `convertMessagesToResponsesInput` payload (assistant `output_text`, never `input_text`).
- **Rejected — fork-and-repack (`@taucad/langchain-openai` + `@taucad/langchain-anthropic`).** The true "fix at source", but the user explicitly abandoned forking: it would expand the forked-tarball surface from 2 to ~4–5 packages, require rebasing the fork ~68 commits onto current `main`, and add a per-package build/repack + lockfile + integration-revalidation pipeline. Not warranted for a bug that a small, well-understood middleware transform handles.
- **Rejected — upstream the fixes.** Revive/rebase PR #9907 and file the Anthropic + Google PRs. Cleanest long-term, but no ETA; prod cannot wait on it. The healers stay regardless.

This is a deliberate band-aid, documented as such: it lives at the one policy-mandated repair site, it uses the converter's own sanctioned escape hatch rather than a hack, and it can be retired wholesale once an upstream release emits role-aware `output_text` for v1 assistant content.

> **Strategic follow-up (2026-06-01):** whether to keep `outputVersion: 'v1'` + these healers at all, or roll back to the library default `v0` (which natively avoids all four bugs and restores reasoning fidelity), is assessed in [`langchain-v1-output-version-strategic-review.md`](./langchain-v1-output-version-strategic-review.md). That review recommends rollback for our hybrid architecture.

### Fourth failure mode (2026-05-31): empty-`id` reasoning item on OpenAI replay

After the `output_text` rewrite shipped, a GPT-5.5 multi-turn-with-tool-calls thread surfaced a closely-related OpenAI failure on the follow-up request:

```
400 Invalid 'input[2].id': ''. Expected an ID that contains letters, numbers, underscores, or dashes,
but this value contained additional characters.
```

**Root cause (verified against installed `@langchain/openai@1.4.7`):** the offending item is a **reasoning item**, and it is the _only_ `id`-bearing item the v1 path emits (`function_call` / `function_call_output` use `call_id`; message items carry no `id`).

1. GPT-5.5 emits a reasoning item (`rs_…`) in turn 1.
2. `convertResponsesMessageToAIMessage` (`responses.js:273`) persists it as a lossy V1 block `{ type: 'reasoning', reasoning: <summaryText> }` — the real `rs_` id is **dropped** (the full item is kept only in `additional_kwargs.reasoning`, `:274`).
3. On the follow-up, the normalizer keeps the reasoning block; `convertStandardContentMessageToResponsesInput` calls `convertReasoningBlock` (`:739`), which hardcodes `id: block.id ?? ""` (`:756`) — with no hook to omit the field. An id-less block therefore yields `{ type: 'reasoning', id: '', summary: [...] }`.
4. OpenAI rejects the empty `id`.

This is a **same-provider** (openai→openai) regression as well as cross-provider; the V1 reasoning block never carries an id once the converter has stored it.

**Fix (no-fork, middleware):** drop `reasoning` blocks that lack a valid id (`/^[\w-]+$/`) for the OpenAI target — `dropUnreplayableReasoningForOpenai`. The standard path cannot omit the id, and a reasoning item is only validly replayable carrying its original id + encrypted content (which the V1 block does not preserve), so an id-less reasoning block is unreplayable; dropping it is the honest repair (consistent with Rule 5: reasoning is dropped across turns, not downgraded). Reasoning blocks that _do_ carry a valid id pass through unchanged. `output_version: 'v1'` stays intact. The "omit the id but keep the item" alternative was rejected: it requires reconstructing the reasoning item through `non_standard`, and an id-less reasoning item is a fabricated trace (and may itself be rejected). The regression test asserts that **every** emitted Responses item has a valid-or-absent `id`/`call_id`.

## Problem Statement

Three live screenshots and exported transcripts captured by the user, all on the second model turn after a single tool call:

| Provider                     | Error surface                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `anthropic-claude-haiku-4.5` | `400 messages.1.content.1.tool_use.input: Input should be an object` (`req_011CbTnL9Lf9B4oTaCc19nnr`) |
| `google-gemini-3.5-flash`    | `Content block of type "tool_call" is not portable to the Google provider`                            |
| `openai-gpt-4.1`             | `400 Invalid value: 'input_text'. Supported values are: 'output_text' and 'refusal'`                  |

All three were single-prompt sessions ("a cube"). The first model response (text + tool call) reaches the client; the failure is on the immediately-following request that includes the freshly-checkpointed assistant message in `messages[1]`.

## Methodology

1. Reproduced the Anthropic failure deterministically with `pnpm nx run api:test:models -- --testNamePattern=multi-turn` against `TEST_MODEL_ID=anthropic-claude-haiku-4.5`. Two tests fail (`should emit usage, transcript, and compaction data in a multi-turn conversation`, `should complete multi-turn tool execution without errors`) with the exact `tool_use.input` error from the user's screenshot.
2. Diffed `pnpm-workspace.yaml` and `package.json` at `c7e71fc6` to enumerate the bumped LangChain / AI SDK versions.
3. Walked the message lifecycle from `_makeMessageChunkFromAnthropicEvent` (streaming concat) → `castStandardMessageContent` (V1 cast) → `_formatStandardContent` (round-trip on turn 2) inside the installed packages under `node_modules/.pnpm`.
4. Cross-referenced the upstream `langchain-ai/langchain` (Python) `_convert_from_v1_to_anthropic` implementation to confirm the missing-`tcs`-argument shape is a JS/Python parity gap, not intended behavior.

## Bumped versions in commit `c7e71fc6`

| Package                  | Before     | After      |
| ------------------------ | ---------- | ---------- |
| `@langchain/anthropic`   | `^1.3.28`  | `^1.4.0`   |
| `@langchain/core`        | `^1.1.44`  | `^1.1.48`  |
| `@langchain/openai`      | `^1.4.5`   | `^1.4.7`   |
| `@langchain/classic`     | `^1.0.32`  | `^1.0.34`  |
| `@langchain/langgraph`   | `^1.3.0`   | `^1.3.2`   |
| `langchain`              | `^1.4.0`   | `^1.4.2`   |
| `ai`                     | `^6.0.99`  | `^6.0.191` |
| `@ai-sdk/openai`         | `^3.0.33`  | `^3.0.65`  |
| `@ai-sdk/cerebras`       | `^2.0.34`  | `^2.0.54`  |
| `@ai-sdk/react`          | `^3.0.101` | `^3.0.193` |
| `@ai-sdk/provider-utils` | `^4.0.15`  | `^4.0.27`  |

`@langchain/google-vertexai` (catalog `^2.1.20`) is unchanged in version, but its peer `@langchain/google-common@2.1.33` (forked into `tarballs/`) is built against `@langchain/core@1.1.48` and so picks up the V1 castings emitted by the new core.

## Findings

### Finding 1 — Anthropic: `_formatStandardContent` does not consult `message.tool_calls`, surfacing `tool_use.input: ""`

The V1 path in `@langchain/anthropic@1.4.0`'s `dist/utils/message_inputs.js`:

```js
// Line 208 — V1 path, no toolCalls argument
if (AIMessage.isInstance(message) && message.response_metadata?.output_version === 'v1')
  return { role, content: _formatStandardContent(message) };

// Legacy v0 path further down passes message.tool_calls
const formattedContent = _formatContent(message, message.tool_calls);
```

`_formatStandardContent` (in `dist/utils/standard.js`) walks `message.contentBlocks` and emits Anthropic-native blocks with no toolCall recovery:

```js
// dist/utils/standard.js:108-113
else if (block.type === 'tool_call')
  result.push({
    type: 'tool_use',
    id: block.id ?? '',
    name: block.name,
    input: block.args, // <-- pass-through; no fallback to message.tool_calls
  });
```

**Why `block.args` is empty.** During Anthropic streaming, `_makeMessageChunkFromAnthropicEvent` emits two block kinds at the same `content_block.index`:

```js
// dist/utils/message_outputs.js
// content_block_start (tool_use)
{ index, type: 'tool_use', id, name, input: '' }
// content_block_delta (input_json_delta) — repeated
{ index, type: 'input_json_delta', input: '<partial>' }
```

`@langchain/core@1.1.48`'s `mergeContent`/`_mergeLists` finds a candidate by index, then bails when types disagree:

```js
// dist/messages/base.js:257-264
function getMergeableTypeBase(type) {
  return type.endsWith('_delta') ? type.slice(0, -6) : type;
}
function hasMismatchedMergeableType(left, right) {
  // 'tool_use' base = 'tool_use'; 'input_json_delta' base = 'input_json' → mismatch
  return getMergeableTypeBase(left.type) !== getMergeableTypeBase(right.type);
}
```

So the streamed assistant message ends up with **two coexisting blocks** at the same index (`tool_use` with `input: ''` and `input_json_delta` with the streamed partial JSON). When `castStandardMessageContent` later calls the `ChatAnthropicTranslator`:

```js
// @langchain/core/dist/messages/block_translators/anthropic.js:220-227
} else if (_isContentBlock(block, 'tool_use') && _isString(block.name) && _isString(block.id)) {
  yield { type: 'tool_call', id: block.id, name: block.name, args: block.input };
}
```

it reads `block.input` directly (still `''`) and yields the V1 `tool_call` block with `args: ''`. The proper parsed args are only present on `message.tool_calls` (collapsed from `tool_call_chunks`), but the translator never consults that field.

On turn 2, that `tool_call` block round-trips through `_formatStandardContent` as `tool_use.input: ''`, which the Anthropic API rejects: `messages.1.content.1.tool_use.input: Input should be an object`.

**Python parity gap.** The upstream Python implementation at `langchain_anthropic/chat_models.py` already does the right thing — it constructs a `tcs` (tool calls) array from `message.tool_calls` and passes it into `_convert_from_v1_to_anthropic`:

```python
# Python — feeds tool_calls into the v1 converter
tcs = [{ 'type': 'tool_call', 'name': tc['name'], 'args': tc['args'], 'id': tc.get('id') }
       for tc in message.tool_calls]
messages[idx] = message.model_copy(update={
  'content': _convert_from_v1_to_anthropic(message.content, tcs, message.response_metadata.get('model_provider')),
})
```

The JS `_formatStandardContent` signature only takes `message`, never `toolCalls`. This is a JS-side regression that landed between `1.3.28` and `1.4.0` when the V1 path was wired up.

### Finding 2 — Google: `messageContentComplexToPart` throws on V1 `tool_call` blocks (even from Google itself)

The user's reproduction transcript stayed on Google Gemini 3.5 Flash for both turns; the upstream error string `"from another provider was replayed without normalization"` is just the constructor boilerplate of `CrossProviderContentError` and is misleading. The error fires unconditionally any time a V1 `tool_call` block reaches `messageContentComplexToPart`, regardless of which model produced it.

`@langchain/google-common@2.1.33` (built against `@langchain/core@1.1.48`) has no `tool_call` case in its content-block dispatcher:

```js
// dist/utils/gemini.js:308-340
async function messageContentComplexToPart(content) {
  switch (content.type) {
    case 'text': /* ... */
    case 'image_url': /* ... */
    case 'media': /* ... */
    case 'reasoning': /* ... */
    case 'thinking': /* ... */
    case 'input_audio': /* ... */
    case 'image': /* ... */
    case 'video': /* ... */
    case 'audio': /* ... */
    case 'file': /* ... */
    case 'text-plain': /* ... */
    default:
      throw new CrossProviderContentError(String(content.type));
  }
}
```

V1 standard `tool_call` blocks fall through to the `default` and throw `CrossProviderContentError`, with the exact message the user saw. This adapter assumes assistant tool calls are exclusively carried via `message.tool_calls`, but the AIMessage constructor in `@langchain/core@1.1.48` actively reconciles `tool_calls` ↔ V1 `tool_call` content blocks:

```js
// @langchain/core/dist/messages/ai.js:51-72 — constructor coercion
if (initParams.response_metadata?.output_version === 'v1') {
  initParams.contentBlocks = initParams.content;
  initParams.content = void 0;
}
if (initParams.contentBlocks !== void 0 && initParams.tool_calls) {
  // Backfills V1 tool_call blocks from tool_calls and vice versa
  ...
}
```

The result: any AIMessage that round-trips through LangGraph state with `output_version: 'v1'` carries `tool_call` content blocks, which Google then refuses.

### Finding 3 — OpenAI: V1 `text` blocks are emitted as `input_text` regardless of message role

`@langchain/openai@1.4.7`'s Responses API converter at `dist/converters/responses.js`:

```js
// Line 909 — V1 path
if (responseMetadata?.output_version === 'v1') return convertStandardContentMessageToResponsesInput(lcMsg);
```

Inside `convertStandardContentMessageToResponsesInput`, the `text` branch always emits `input_text`:

```js
// Line 781-789
for (const block of message.contentBlocks)
  if (block.type === 'text') {
    pushMessageContent([{ type: 'input_text', text: block.text }], phase);
  }
```

OpenAI's Responses API requires assistant content blocks to use `output_text` or `refusal`; `input_text` is only valid for user / developer roles. For an assistant message that contains text + a tool call (which is the exact shape after V1 normalization of a Claude / GPT-4 first-turn response), this produces `input_text` payloads on the assistant role, and the API rejects with `Invalid value: 'input_text'`.

The legacy v0 path at line 980 does the right thing — it explicitly emits `output_text` when the role is assistant — but the V1 path was added later without role awareness.

### Finding 4 — All three failures share `outputVersion: 'v1'` as the trigger

`apps/api/app/api/providers/provider.service.ts` sets `outputVersion: 'v1'` on every provider class:

```ts
// Lines 60-153 — every provider opt-in
new ChatOpenAI({ useResponsesApi: true, outputVersion: 'v1', ...options })   // OpenAI
new ChatAnthropic({ ...options, outputVersion: 'v1', betas: [...] })          // Anthropic
new ChatVertexAI({ ...options, outputVersion: 'v1', location: 'global', ... })// Google Vertex
new ChatOpenAI({ outputVersion: 'v1', ...options })                            // Cerebras (OpenAI-compat)
```

The original motivation (per `.cursor/rules/learned-runtime.mdc`) was cross-provider thinking-block portability — having every model emit standardized `{type:'reasoning', reasoning, signature}` blocks so checkpoints survive provider hops. That worked against `@langchain/*@1.3.x`. The bump to `@langchain/anthropic@1.4.0` + `@langchain/core@1.1.48` introduced the three V1 round-trip regressions documented above without flipping any flags on our side.

### Finding 5 — Tool-call healers belong in the same target-aware normalizer (implemented)

`apps/api/app/api/chat/middleware/cross-provider-content-normalizer.middleware.ts` is the sole repair site for both reasoning portability and tool-call portability. It rewrites:

- `thinking` ↔ `reasoning`
- `redacted_thinking` / `compaction` → `non_standard`
- `ToolMessage` content `text` → `input_text` / `image_url` → `input_image` (OpenAI Responses)
- **vertexai**: strip tool-call content blocks (Google uses `message.tool_calls` only)
- **anthropic**: heal empty `tool_call` / `tool_use` args from `message.tool_calls`
- **openai**: heal empty `tool_call` args, then rewrite V1 assistant `text` → native Responses `output_text` via `non_standard` passthrough + `model_provider: 'openai'` (keeps `output_version: 'v1'`)

The original plan proposed a separate `OutputVersionV1Roundtrip` middleware because the three failures also reproduce on single-provider replay. Consolidating into one middleware avoids duplicate `wrapModelCall` wiring; target gating (`targetProvider === 'vertexai' | 'anthropic' | 'openai'`) keeps each healer narrowly scoped.

## Reproduction

```bash
TEST_MODEL_ID=anthropic-claude-haiku-4.5 \
pnpm nx run api:test:models -- --testNamePattern="multi-turn"
```

Both `Middleware Integration ... should emit usage, transcript, and compaction data in a multi-turn conversation` and `Model Integration ... should complete multi-turn tool execution without errors` fail with `400 messages.1.content.<n>.tool_use.input: Input should be an object`.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                               | Priority | Effort | Impact | Status                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Heal `tool_call` / `tool_use` blocks whose `args`/`input` are empty by recovering from `message.tool_calls` when target is Anthropic or OpenAI.                                                                                                                                                      | P0       | Low    | High   | Done — `healEmptyToolCallArgs` (Anthropic + OpenAI) in cross-provider normalizer                                                                                 |
| R2  | Strip tool-call content blocks from `AIMessage.content` when target is `vertexai` (Google reads `message.tool_calls` only).                                                                                                                                                                          | P0       | Low    | High   | Done — `stripToolCallBlocksForGoogle`                                                                                                                            |
| R3  | Rewrite V1 assistant `text` → native Responses `output_text` (via `non_standard` passthrough + `model_provider: 'openai'`) when target is OpenAI, **without** clearing `output_version`. Replaces the deleted `omitOutputVersion` band-aid.                                                          | P0       | Low    | High   | Done — `rewriteAssistantTextForOpenai`                                                                                                                           |
| R4  | File / track upstream issues (LangChain.js): `_formatStandardContent` should accept `toolCalls`; `convertStandardContentMessageToResponsesInput` should emit role-aware `output_text`; `@langchain/google-common` should accept V1 `tool_call` blocks. Retire healer cases when upstream fixes land. | P1       | Medium | Medium | Open — OpenAI tracked by issue #9879 + **unmerged** PR #9907; no Anthropic/Google PR exists (see [Roll-forward resolution](#roll-forward-resolution-2026-05-31)) |
| R7  | Remove `omitOutputVersion` without forking. **Resolved**: chose the no-fork `non_standard` `output_text` rewrite (keeps `output_version: 'v1'`); fork-and-repack and upstream-PR options rejected.                                                                                                   | P1       | Low    | High   | Done — see [Decision (2026-05-31)](#decision-2026-05-31-no-fork-middleware-band-aid)                                                                             |
| R8  | Drop OpenAI `reasoning` blocks lacking a valid id (the converter persists reasoning without its `rs_` id, then re-emits `id: ''` which the API rejects). Ensure every emitted Responses item has a valid-or-absent `id`/`call_id`.                                                                   | P0       | Low    | High   | Done — `dropUnreplayableReasoningForOpenai`; see [Fourth failure mode](#fourth-failure-mode-2026-05-31-empty-id-reasoning-item-on-openai-replay)                 |
| R5  | Hermetic two-turn replay regression (normalizer + sanitizer pipeline, no live keys).                                                                                                                                                                                                                 | P1       | Medium | Medium | Done — `apps/api/app/api/chat/cross-provider-tool-call-replay.test.ts`                                                                                           |
| R6  | Document `outputVersion: 'v1'` as load-bearing in policy so future bumps re-verify V1 round-trip paths per provider.                                                                                                                                                                                 | P2       | Low    | Medium | Partial — `docs/policy/cross-provider-content-contract.md` Rule 1                                                                                                |

Note: rolling **backward** to `@langchain/anthropic@1.3.28` is **not** recommended — it would reintroduce other fixes that landed in 1.4.0 (Anthropic 1.0 betas, fine-grained tool streaming) and re-create the cross-provider-thinking gap that motivated `outputVersion: 'v1'` in the first place.

## Code Examples

### Sketch of R1 — heal Anthropic V1 `tool_call` args from `message.tool_calls`

```ts
// In a new createOutputVersionV1RoundtripMiddleware (NOT the cross-provider normalizer)
function healV1ToolCallArgs(message: AIMessage): AIMessage {
  if (!Array.isArray(message.content)) return message;
  if (message.response_metadata?.output_version !== 'v1') return message;
  if (!message.tool_calls?.length) return message;

  let mutated = false;
  const next = message.content.map((block) => {
    if (!isRecord(block) || block.type !== 'tool_call') return block;
    const args = (block as { args?: unknown }).args;
    const needsHeal =
      args === '' ||
      args === undefined ||
      (typeof args === 'object' && args !== null && Object.keys(args).length === 0);
    if (!needsHeal) return block;
    const match = message.tool_calls!.find((tc) => tc.id === (block as { id?: string }).id);
    if (!match) return block;
    mutated = true;
    return { ...block, args: match.args };
  });
  if (!mutated) return message;
  return new AIMessage({ ...message, content: next as typeof message.content });
}
```

### Sketch of R2 — drop V1 `tool_call` content blocks for Google target

```ts
function stripV1ToolCallBlocksForGoogle(message: AIMessage): AIMessage {
  if (!Array.isArray(message.content)) return message;
  const next = message.content.filter(
    (block) => !isRecord(block) || (block.type !== 'tool_call' && block.type !== 'tool_call_chunk'),
  );
  if (next.length === message.content.length) return message;
  return new AIMessage({ ...message, content: next as typeof message.content });
}
```

### Sketch of R3 — rewrite assistant V1 text to native `output_text` for OpenAI (no `output_version` clearing)

```ts
function rewriteAssistantTextForOpenai(message: AIMessage): AIMessage {
  if (!Array.isArray(message.content)) return message;
  if (message.response_metadata?.output_version !== 'v1') return message;
  if (!message.content.some((b) => isRecord(b) && b.type === 'text' && typeof b.text === 'string')) {
    return message; // no input_text hazard; leave model_provider untouched
  }
  const next: unknown[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer.length > 0) {
      // non_standard value is yielded verbatim as a top-level Responses item,
      // so it must be a complete message item — not a bare output_text part.
      next.push({
        type: 'non_standard',
        value: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: buffer, annotations: [] }],
        },
      });
    }
    buffer = '';
  };
  for (const block of message.content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      buffer += block.text;
      continue;
    }
    if (isRecord(block) && block.type === 'non_standard') continue; // drop foreign wrappers once model_provider flips
    flush();
    next.push(block); // keep tool_call / reasoning for the v1 converter
  }
  flush();
  // model_provider === 'openai' is the gate (isResponsesMessage) that enables the non_standard branch.
  return new AIMessage({
    ...message,
    content: next,
    response_metadata: { ...message.response_metadata, model_provider: 'openai' },
  });
}
```

These are sketches — the production version should preserve `tool_calls`, `usage_metadata`, `id`, `additional_kwargs`, and `response_metadata` exactly as the existing `normalizeAiMessage` helper already does.

## Trade-offs

| Approach                                                                   | Pros                                                              | Cons                                                                                             |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Extend `CrossProviderContentNormalizer` with target-aware healers (chosen) | One `wrapModelCall` site, matches policy Rule 2, ships R1–R3 + R5 | Lives in our repo until upstream catches up; needs unwinding per healer when upstream fixes land |
| Separate `OutputVersionV1Roundtrip` middleware (deferred)                  | Splits naming for "intra" vs "cross" concerns                     | Duplicate wiring; same operation as reasoning normalizer                                         |
| Drop `outputVersion: 'v1'` on every provider                               | Sidesteps every V1 path                                           | Re-introduces cross-provider thinking-block portability bugs documented in our learned-runtime   |
| Pin LangChain back to `1.3.x`                                              | Restores known-good behavior                                      | Loses Anthropic 1.0 / fine-grained streaming and forces resolving the rest of the bumped graph   |
| Wait for upstream fix                                                      | Cleanest long-term                                                | No ETA; keeps prod broken                                                                        |

The chosen path unblocks production today: target gating keeps each healer scoped while preserving a single policy-mandated repair surface.

## References

- Reproducing test: `apps/api/app/testing/model-integration.test.ts` (`should complete multi-turn tool execution without errors`)
- `apps/api/app/api/providers/provider.service.ts` — every `outputVersion: 'v1'` site
- `apps/api/app/api/chat/middleware/cross-provider-content-normalizer.middleware.ts` — extension point for R1–R3
- Upstream Python parity reference: [`libs/partners/anthropic/langchain_anthropic/chat_models.py @ 93947dce`](https://github.com/langchain-ai/langchain/blob/93947dcea8356eeab47da8ddbeabefc86b612029/libs/partners/anthropic/langchain_anthropic/chat_models.py)
- Related historical commits: `langchain-ai/langchainjs#10117` (V1 tool_call backfill on empty content), `langchain-ai/langchain#23915` (no-arg tool streaming)
- Related learning: `.cursor/rules/learned-runtime.mdc` — original `outputVersion: 'v1'` decision

## Appendix — failure-by-provider matrix

| Layer                                                  | Anthropic                                       | Google (Vertex / GenAI)                                              | OpenAI (Responses)                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| First-turn streaming                                   | ✓ works (chunks render)                         | ✓ works                                                              | ✓ works                                                                                                         |
| Stream → AIMessage v1 cast                             | `tool_call` block emitted with `args: ''`       | `tool_call` block emitted (args may be correct here)                 | `text` block emitted                                                                                            |
| LangGraph checkpoint write                             | ✓                                               | ✓                                                                    | ✓                                                                                                               |
| Turn 2 message build (`_formatStandard…` / equivalent) | `tool_use.input: ''` re-emitted                 | `messageContentComplexToPart` throws on `tool_call` block            | `input_text` re-emitted on assistant role                                                                       |
| Provider API response                                  | `400 tool_use.input: Input should be an object` | `CrossProviderContentError` thrown locally before hitting Google API | `400 Invalid value: 'input_text'`                                                                               |
| Self-heal hook in this repo                            | `healEmptyToolCallArgs` (R1)                    | `stripToolCallBlocksForGoogle` (R2)                                  | `healEmptyToolCallArgs` + `dropUnreplayableReasoningForOpenai` + `rewriteAssistantTextForOpenai` (R1 + R8 + R3) |
