---
title: 'Parallel Tool Output Interleaving'
description: 'Architectural fix for the Pregel superstep barrier that batches all parallel tool outputs together and prevents Cursor-style eager per-tool dispatch.'
status: draft
created: '2026-05-07'
updated: '2026-05-07'
category: architecture
related:
  - docs/research/agent-loop-safeguards.md
  - docs/research/eager-tool-dispatch-poc.md
---

# Parallel Tool Output Interleaving

How to deliver Cursor-style per-tool eager dispatch where each parallel tool call's `tool-output-available` chunk emits the moment its own RPC settles — even while the LLM is still streaming the next tool call's args — instead of all outputs landing together at the end of the LangGraph tools superstep.

> **Status (2026-05-07):** the eager-dispatch architecture below has been empirically validated end-to-end. Three deterministic POCs at [`apps/api/app/api/chat/eager-dispatch/`](../../apps/api/app/api/chat/eager-dispatch/) confirm callback wiring (R1), eager invocation without backpressure (R2), and wire-side ordering through `toUIMessageStream` (R3). Verdict: **GO**. See [`eager-tool-dispatch-poc.md`](eager-tool-dispatch-poc.md) for per-POC findings and the three production refinements.

## Executive Summary

A live Anthropic Haiku 4.5 trace creating three parallel `lipsum*.txt` files shows the LLM streaming tool 1's args (102 ms), tool 2's args (643 ms), and tool 3's args sequentially across a 745 ms window. **A new `setTimingObserver` hook on `HeadlessChatRpcService` proves the bottleneck is not RPC dispatch**: all three `rpc-invoked` events fire at the same instant (+5958 ms, spread = 0 ms across tools), all three `rpc-resolved` events fire at the same instant (work = 0 ms each against the in-memory FS), and all three `tool-input-available` / `tool-output-available` chunks land together at +5972 ms. None of the tools' outputs land while the LLM is still streaming subsequent tools, even though tool 1's args were finalized at +4898 ms (1074 ms before its RPC was even invoked, and 1080 ms before its output was emitted).

The eigenquestion is **"how do we break out of LangGraph's Pregel BSP barrier so a per-tool RPC can dispatch the moment that tool's args finalize, with its `tool-output-available` chunk landing on the wire before the next tool's args have finished streaming?"** The fix is **eager dispatch from inside a tool-agnostic callback handler attached to the chat model** — detect per-tool args finalization via two provider-protocol-guaranteed signals (index advance in `tool_call_chunks` for non-last tools; `handleLLMEnd`'s parsed `AIMessage.tool_calls[]` for the last tool), invoke the standard `tool.invoke({ ...toolCall, type: 'tool_call' }, runtimeConfig)` exactly the way `ToolNode` would (so the tool's own `func` runs end-to-end — including its RPC if it has one — with zero per-tool branching in the handler), push the resulting `ToolMessage` onto LangGraph's canonical `'tools'` stream channel using the same payload shape as native `StreamToolsHandler` (introduced in `@langchain/langgraph@1.2.0` via [PR #1984](https://github.com/langchain-ai/langgraphjs/pull/1984)), and short-circuit the later `ToolNode` execution via `wrapToolCall` middleware so it returns the cached result instantly. The two design corrections that make this architecturally clean are **(a) the handler invokes `tool.invoke()` not `chatRpcService.sendRpcRequest()` directly — domain knowledge stays inside each tool**, and **(b) the trigger uses only protocol-level signals (S2 index advance, S3 stream end), never partial-JSON parsing or Zod-schema heuristics, because optional schema fields and `parsePartialJson`-based `AIMessageChunk.tool_calls` both mis-fire on intermediate inputs**. End-to-end this preserves the standard four-event lifecycle per tool, retains real parallel RPC execution, requires no UI-layer cadence, and overlaps the entire tool-execution window with the LLM's continued streaming of later tool calls. The prior-art sweep (issue [#4653](https://github.com/langchain-ai/langgraph/issues/4653) — open since May 2025; PR #1984 — merged Feb 2026) confirms upstream recognises the timing problem but has not shipped a barrier-bypass; this architecture is novel work that is a strong upstream-contribution candidate.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Eigenquestion](#eigenquestion)
- [Methodology](#methodology)
- [Findings](#findings)
- [Recommendations](#recommendations)
- [Implementation Blueprint](#implementation-blueprint)
- [Trigger timing — does the RPC fire as soon as the input is available?](#trigger-timing--does-the-rpc-fire-as-soon-as-the-input-is-available)
- [Trade-offs](#trade-offs)
- [Code Examples](#code-examples)
- [References](#references)

## Problem Statement

The standard streaming lifecycle for a single tool call is `tool-input-start` → N × `tool-input-delta` → `tool-input-available` → (RPC dispatches) → `tool-output-available`. When N tool calls run in parallel, the canonical UX (Cursor, Claude Code) interleaves all events in one stream so a fast tool's output can land while the LLM is still streaming a slower tool's input. Our chat shows a different pattern: every parallel tool's output flips to "complete" simultaneously, regardless of when individual args finalize.

### Captured live evidence (Anthropic Haiku 4.5, 3× `create_file` parallel)

The test merges `tool-input-*` / `tool-output-available` SSE chunks with three RPC-lifecycle events captured from a `setTimingObserver` hook on `HeadlessChatRpcService` (`invoked` → `dispatched` → `resolved`). The merged trace is unambiguous:

```text
   1484ms  start-step
   4796ms  input-start      tool 1 (lipsum1.txt)
   4898ms  input-start      tool 2 (lipsum2.txt)         ← tool 1 args fully streamed in 102ms
   5541ms  input-start      tool 3 (lipsum3.txt)         ← tool 2 args fully streamed in 643ms
   5958ms  rpc-invoked      tool 1 (create_file)         ← all three RPCs invoked at the SAME instant
   5958ms  rpc-invoked      tool 2 (create_file)
   5958ms  rpc-invoked      tool 3 (create_file)
   5958ms  rpc-resolved     tool 1                       ← memFs is sub-millisecond, work=0ms
   5958ms  rpc-resolved     tool 2
   5958ms  rpc-resolved     tool 3
   5972ms  input-available  tool 1, 2, 3                 ← all three SSE chunks batched together
   5972ms  finish-step                                   ← agent superstep ends
   5972ms  start-step                                    ← tools superstep begins
   5972ms  output-available tool 1, 2, 3                 ← all three batched
   6803ms  finish-step
```

Per-tool alignment summary:

| File          | input-available | rpc-invoked | rpc-resolved | output-available | RPC work |
| ------------- | --------------- | ----------- | ------------ | ---------------- | -------- |
| `lipsum1.txt` | 5972 ms         | 5958 ms     | 5958 ms      | 5972 ms          | 0 ms     |
| `lipsum2.txt` | 5972 ms         | 5958 ms     | 5958 ms      | 5972 ms          | 0 ms     |
| `lipsum3.txt` | 5972 ms         | 5958 ms     | 5958 ms      | 5973 ms          | 0 ms     |

`rpc-invoked spread: 0 ms` and `rpc-resolved spread: 0 ms` across all three tools. Captured by `apps/api/app/testing/parallel-tool-call.integration.test.ts` (`records eager-dispatch timing baseline for parallel create_file calls`), Anthropic Haiku 4.5, in-memory `memFs`. RPC dispatch against the in-memory FS settles in <1 ms per call; the wall-clock cost is entirely the LLM's args-streaming time + Pregel superstep barrier.

#### Three things this trace eliminates

1. **Server-side RPC serialization** — `rpc-invoked spread: 0 ms` proves all three RPCs invoke concurrently from `HeadlessChatRpcService.sendRpcRequest`, with no awaits or queues between them.
2. **RPC duration as a hidden cost** — `rpc-resolved` happens in the same millisecond as `rpc-invoked` (memFs writes settle in <1 ms), so even if a real Socket.IO RPC adds ~10–50 ms latency, that latency is bounded and parallel — not the cause of the 5972 ms barrier.
3. **The AI-SDK adapter as a batcher** — the 14 ms gap between `rpc-resolved@5958` and `output-available@5972` is just the next adapter tick, not a queue. The whole batch lands together because every RPC was dispatched at the same superstep boundary.

The smoking gun is that **Anthropic emitted three distinct `input-start` events at 4796 / 4898 / 5541 ms** — a real 745 ms streaming window — yet **all three `rpc-invoked` events fired together at 5958 ms**, ~1162 ms after tool 1's args were already fully streamed. The Pregel BSP barrier serializes the entire parallel set onto a single dispatch tick at the end of the agent superstep.

### What "good" looks like (Cursor-style target)

```text
   t=2974ms  tool 1 input-start
   t=3300ms  tool 1 input-deltas streaming...
   t=3404ms  tool 1 input-available    → RPC 1 dispatches
   t=3405ms  tool 1 output-available   ← lands BEFORE tool 2 input-start
   t=3404ms  tool 2 input-start
   t=4400ms  tool 2 input-deltas streaming...
   t=4455ms  tool 2 input-available    → RPC 2 dispatches
   t=4456ms  tool 2 output-available   ← lands BEFORE tool 3 input-start
   t=4455ms  tool 3 input-start
   t=5700ms  tool 3 input-deltas streaming...
   t=5730ms  tool 3 input-available    → RPC 3 dispatches
   t=5731ms  tool 3 output-available
```

By tool 3's input-start, tool 1 is already shown as complete in the UI. By tool 3's input-available, tools 1 and 2 are both complete. The user sees the panel light up incrementally as each tool finishes, never as a synchronous batch flip.

The user's screenshot of the live chat (`lipsum3.txt` mid-stream while `lipsum1.txt` and `lipsum2.txt` still spin) makes the regression obvious: 3-5 s per tool of LLM streaming, but no completed status arrives for any of them until the very end.

## Eigenquestion

> **How do we break out of LangGraph's Pregel BSP superstep barrier so a per-tool RPC dispatches the moment its args finalize during LLM streaming, with `tool-output-available` landing on the wire before the next tool's `tool-input-start`?**

This reframes prior attempts ("add a queue", "fix the adapter") into the actual architectural blocker: the React-agent + ToolNode graph runs the agent and tools in **separate Pregel supersteps**, so by definition no tool can start executing until the agent's full AI message is finalized. The fix has to bypass that ordering, not throttle around it.

## Methodology

| Source                                                                                                                                                | What was checked                                                                                                                     | Conclusion                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Live Anthropic Haiku 4.5 e2e capture (added to `parallel-tool-call.integration.test.ts`)                                                              | Wall-clock timestamps for `tool-input-start`/`-delta`/`-available` and `tool-output-available` across 3 parallel `create_file` calls | All inputs and outputs cluster at superstep boundaries; no per-tool interleaving                                                                       |
| `repos/langchainjs/libs/langchain/src/agents/ReactAgent.ts`                                                                                           | `createAgent` graph wiring, `Send` fan-out per tool call, `wrapToolCall` middleware availability                                     | Agent and ToolNode are separate Pregel nodes; `wrapToolCall` is the supported per-task interception point                                              |
| `repos/langchainjs/libs/providers/langchain-anthropic/src/utils/message_outputs.ts`                                                                   | Anthropic `content_block_start`/`input_json_delta`/`content_block_stop` translation                                                  | `tool_call_chunks` are emitted incrementally during streaming with `id` set on the start chunk and `args` set on subsequent deltas                     |
| `repos/langgraphjs/libs/langgraph-core/src/pregel/index.ts:2322-2333`                                                                                 | `streamMode: 'custom'` writer wiring                                                                                                 | `config.writer(chunk)` pushes directly to the user-facing stream via `stream.push([ns, 'custom', chunk])` — already enabled in our chat controller     |
| `repos/langgraphjs/libs/langgraph-core/src/pregel/messages.ts`                                                                                        | `StreamMessagesHandler` per-task `_emit` semantics                                                                                   | Per-chain-end emission already synchronous; the bottleneck is not in the messages-mode emission, it is in the agent→tools superstep ordering           |
| `repos/langchainjs/libs/langchain-core/src/callbacks/dispatch/index.ts`                                                                               | `dispatchCustomEvent` API                                                                                                            | Available from `@langchain/core/callbacks/dispatch`; emits into the `streamMode: 'custom'` channel from inside any node's runtime                      |
| `repos/ai/packages/langchain/src/utils.ts:1108-1326`                                                                                                  | `toUIMessageStream` messages-mode handling                                                                                           | Already emits `tool-output-available` synchronously per ToolMessage when one arrives via the messages channel — the pipeline does not batch on its own |
| Tau in-tree: `apps/api/app/api/chat/chat.controller.ts:148`, `chat-rpc.service.ts:236-291`, `apps/ui/app/services/chat-rpc-socket.service.ts:307-309` | Whether our SSE pipeline or RPC layer adds any serialization                                                                         | All pure pass-through / fire-and-forget — no per-chat mutex, no batching transform                                                                     |

## Findings

### Finding 1: The bug is the Pregel agent→tools superstep barrier, not timing or transport

The captured timestamps prove it: with three parallel tool calls, all three `tool-input-available` chunks land at exactly the same millisecond (+5730 ms in the trace), and all three `tool-output-available` chunks land at exactly the same millisecond too. There is no per-tool variance. The chunks are **mathematically simultaneous on the wire**, which can only happen if they are commit-points of the same Pregel state transition, not independent per-task emissions.

In the standard ReAct graph (`repos/langchainjs/libs/langchain/src/agents/ReactAgent.ts`), the agent node and tools node are separate Pregel nodes. The agent node streams the LLM and emits AIMessage chunks; once the LLM turn ends, Pregel finalises the agent superstep, fires the `values` event (which is what the AI SDK adapter uses to emit `tool-input-available`), and then dispatches the conditional edge to the tools node for the next superstep. The tools node fans out N `Send`-spawned tasks, each running one tool, and emits ToolMessages at the end of that superstep. **There is no way for a tool's RPC to dispatch — let alone finish — while the agent superstep is still running.**

This is a fundamental property of the BSP model: Pregel by design only commits state at superstep boundaries. The batching is correct given that architecture; the architecture is wrong for the UX we want.

### Finding 2: Tool-input args finalization is detectable mid-stream via two protocol-guaranteed signals; partial-JSON / schema-validation triggers are unsafe

The Anthropic provider emits `tool_call_chunks` for every `content_block_delta` with an `input_json_delta` (`repos/langchainjs/libs/providers/langchain-anthropic/src/utils/message_outputs.ts:178-181`). The first chunk for each tool call carries the `id` (from `content_block_start`); subsequent chunks carry incremental `args` strings.

**Critical gap discovered while validating the trigger design:** the LangChain Anthropic provider has **no `content_block_stop` branch** in `_makeMessageChunkFromAnthropicEvent`. The provider sees the upstream `content_block_stop` event, but `_makeMessageChunkFromAnthropicEvent` returns `null` (no chunk emitted) for that event type. The chunk stream therefore loses the provider's authoritative "this block is done" signal between `content_block_start`-of-block-N and `content_block_start`-of-block-N+1. Any per-tool finalization detection has to operate on the surviving signals.

The surviving signals from the chunk stream are:

| #   | Signal                                             | Provider invariant                                                                                                                                                                                                                                                             | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Args parse against the tool's Zod input schema** | None — relies on the schema rejecting intermediate parses                                                                                                                                                                                                                      | ❌ **Rejected.** A schema with optional fields silently accepts a partial input (e.g. `{ targetFile: 'x.txt', codeEdit: 'hello' }` parses cleanly even when the LLM was about to add `description: 'Adding hello'`). Same problem applies to consulting `AIMessageChunk.tool_calls`, which is built via `parsePartialJson` (`repos/langchainjs/libs/langchain-core/src/messages/utils.ts:555`) — the parser tolerates truncation by construction. |
| S2  | **Index advance in `tool_call_chunks`**            | Anthropic, OpenAI, Google all stream content blocks strictly sequentially: `content_block_stop`-of-N is emitted before `content_block_start`-of-N+1. So when the chunk stream surfaces `tool_call_chunks[*].index === N+1`, every chunk for index N has already been received. | ✅ **Recommended primary trigger** for tools 1..N-1. No JSON parsing, no schema validation, just monotonic-index detection.                                                                                                                                                                                                                                                                                                                       |
| S3  | **Stream ends** (`handleLLMEnd`)                   | The LLM has finished emitting; the AIMessage handed to `handleLLMEnd` has fully-parsed `tool_calls[]` (canonical post-stream consolidation, not the chunk-time `parsePartialJson` form).                                                                                       | ✅ **Required** for the LAST tool in the batch (S2 cannot fire for it because no further block follows). Read `output.generations[0][0].message.tool_calls` and dispatch any tool that S2 didn't already catch.                                                                                                                                                                                                                                   |

**The trigger fires only on S2 or S3.** S1 is rejected because (a) the user's optional-field concern is real and unbounded across the tool registry, (b) `parsePartialJson` based variants share the same flaw, (c) there is no eagerness benefit — S2 fires within sub-millisecond of when S1 _would_ have fired correctly because Anthropic emits `content_block_stop` and `content_block_start` for the next block in the same SSE flush. The "miss" of dropping S1 is at most one provider-side serialization gap (≪1 ms), and we trade that for protocol-level correctness.

For the captured live trace, the projected trigger times under (S2 + S3) are:

| Tool          | Args fully streamed (Anthropic-side)         | Trigger via | Projected `tool-invoked` |
| ------------- | -------------------------------------------- | ----------- | ------------------------ |
| `lipsum1.txt` | ~4898 ms (when tool 2's first chunk arrives) | S2          | ~4898 ms                 |
| `lipsum2.txt` | ~5541 ms (when tool 3's first chunk arrives) | S2          | ~5541 ms                 |
| `lipsum3.txt` | ~5972 ms (stream end)                        | S3          | ~5972 ms                 |

vs today's `rpc-invoked = 5958 ms` for all three. Tool 1 dispatches **~1060 ms earlier**; tool 2 dispatches **~417 ms earlier**; tool 3 dispatches at the same time as today. Tools 1's and 2's outputs land on the wire well before tool 3's args even finish streaming.

**Upstream contribution opportunity.** The cleanest possible signal would be Anthropic's own `content_block_stop`. A small upstream PR adding a `content_block_stop` branch to `_makeMessageChunkFromAnthropicEvent` (emitting an empty `AIMessageChunk` with `tool_call_chunks: [{ index, finalized: true }]` or equivalent) would let downstream consumers detect single-tool finalization without inferring it from a subsequent block. This is a strict superset of S2 and would also let S2 keep working untouched.

### Finding 3: `@langchain/langgraph@1.2.0+` ships a canonical `tools` stream mode that gives us a clean per-tool emission channel — without it, the `custom` channel is the fallback

This is the most important finding from the prior-art sweep. **LangGraph PR [#1984](https://github.com/langchain-ai/langgraphjs/pull/1984)** ("feat: add tools stream mode for tool lifecycle events", merged 2026-02-25) introduces a first-class `'tools'` `streamMode` that emits typed `on_tool_start` / `on_tool_event` / `on_tool_end` / `on_tool_error` events keyed by `toolCallId`. The implementation lives in `repos/langgraphjs/libs/langgraph-core/src/pregel/stream.ts` as `StreamToolsHandler extends BaseCallbackHandler`, automatically attached when `streamMode` includes `'tools'`. Wire format (verified in source):

```typescript
this.streamFn([ns, 'tools', { event: 'on_tool_start', toolCallId, name, input }]);
// ... handleToolEvent / handleToolEnd / handleToolError have the same shape
// with `data` / `output` / `error` payload keys respectively.
```

The Python equivalent is `StreamToolCallHandler` (`langgraph.pregel._tools`); the JS sibling exists from `@langchain/langgraph@1.2.0` onward (we are pinned to `^1.1.5` today, so a catalog bump is a precondition).

**Two reasons this dramatically simplifies our implementation vs the `custom` channel approach:**

1. **Wire format already aligns with consumer conventions.** The `@ai-sdk/langchain` adapter handles `on_tool_start` / `on_tool_end` events (`repos/ai/packages/langchain/src/adapter.ts:248-283`) and converts them directly to `tool-input-start` / `tool-output-available` UI message chunks. Even though the adapter doesn't yet route `streamMode: 'tools'` chunks (only `messages` / `values` / `custom` / `streamEvents` paths), adding a `case 'tools':` branch in our chat controller pipeline is ~10 LOC vs the bespoke `data-eager-tool-output` envelope + custom transform we'd otherwise need.
2. **Future-proof.** When upstream `@ai-sdk/langchain` adds native `case 'tools':` support (very likely follow-up to PR #1984), our chat-controller-side adapter goes away entirely.

**However**, the native `StreamToolsHandler` is attached to ToolNode, so its `handleToolStart` only fires AFTER `tool.invoke(...)` is called — which is still inside the tools superstep AFTER the agent superstep ends. The Pregel BSP barrier is unchanged by `tools` mode. **The `tools` mode solves the wire-format problem; it does not solve the eager-dispatch problem.**

**Recommendation**: keep the eager-dispatch callback handler attached to the chat model (Finding 2 + Implementation Blueprint §2), but have it emit onto the same `'tools'` channel using the same payload shape as native `StreamToolsHandler`. From the consumer's perspective, our eagerly-emitted `on_tool_start` events are indistinguishable from native ones. Fallback: if the catalog bump to `1.2.x` is deferred, the `'custom'` channel at `repos/langgraphjs/libs/langgraph-core/src/pregel/index.ts:2322-2333` is still wired and the original `dispatchCustomEvent` approach works — just gnarlier.

### Finding 4: The eager handler must invoke `tool.invoke()`, never the RPC service directly

A first-cut design had the eager handler call `chatRpcService.sendRpcRequest({ chatId, toolCallId, rpcName, args })` directly inside the trigger sequence. This is architecturally wrong because it (a) hardcodes domain knowledge of the RPC dispatch path into the eager handler, (b) forces the handler to filter "RPC tools" vs "non-RPC tools" (e.g. computational, reasoning, or pure-server tools), and (c) duplicates the dispatch logic that already lives inside each tool's `func` — any change to error handling, retry, or RPC envelope would need to be mirrored in two places.

The correct call is the same one `ToolNode.runTool` makes (`repos/langchainjs/libs/langchain/src/agents/nodes/ToolNode.ts:359`):

```typescript
const output = await tool.invoke(
  { ...toolCall, type: 'tool_call' },
  {
    ...config,
    config,
    toolCallId: toolCall.id!,
    state: config.configurable?.__pregel_scratchpad?.currentTaskInput,
    signal: mergeAbortSignals(this.signal, config.signal),
  },
);
```

The handler doesn't know — and doesn't need to know — what the tool does internally. For `tool-create-file.ts`, `func` reaches into `runtime.configurable.chatRpcService` and dispatches the RPC; for a hypothetical `tool-compute-bbox` that does pure server-side math, `func` just runs the math. Both paths are eagerly dispatched, both produce a `ToolMessage`, both feed the cache that `wrapToolCall` reads from. **One generic `tool.invoke()` call subsumes every tool the agent has registered.** Adding a new tool requires zero changes in the handler.

The handler is constructed per agent.graph.stream call with three references: the tools array (same one passed to `createAgent`), the LangGraph `'tools'`-channel writer (a closure over `runStream.push`), and the base `RunnableConfig` (carrying `configurable.chatRpcService`, `configurable.thread_id`, the signal, etc.). Internal state (per-toolCallId accumulator, in-flight `tool.invoke` promise, cached `ToolMessage`) is encapsulated in a `Map` on the handler instance; nothing leaks into shared state across requests.

### Finding 5: `wrapToolCall` middleware is the natural ToolNode short-circuit, and provably cannot block tool-input delta streaming

`langchain@1.2.34` ships a `wrapToolCall` middleware hook (`repos/langchainjs/libs/langchain/src/agents/middleware/types.ts:173-178`) invoked from `ToolNode.runTool` (`repos/langchainjs/libs/langchain/src/agents/nodes/ToolNode.ts:412-414`) per Pregel task with `(request, handler)`. If we cache eager-dispatched results keyed by `toolCallId`, `wrapToolCall` can return the cached `ToolMessage` synchronously, so ToolNode finishes its superstep instantly without re-executing the tool. The graph remains structurally unchanged, the persisted state remains identical to the non-eager path, and only the timing of `tool-output-available` chunks shifts onto the wire earlier.

**There is a recurring concern that `wrapToolCall` blocks tool-input delta tokens from streaming. The architecture rules this out structurally**, and the historical evidence has a different root cause:

| Concern                                                                                                       | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "`wrapToolCall` buffered the AIMessage chunks before deltas could ship to the wire"                           | `ToolNode.runTool` is the body of the **tools Pregel node** (`ToolNode.run` at `:489` is the task body), and the agent and tools nodes are **separate Pregel supersteps** in `createAgent`'s graph. The agent superstep finishes streaming all `tool_call_chunks` for the current turn (chunks reach the consumer via the `messages` channel as they are yielded) **before** the conditional edge dispatches to the tools node. By the time `wrapToolCall` is invoked, the deltas for that turn have already been emitted on the wire. The only way `wrapToolCall` can "delay" a delta is for the **next** agent turn's chunks (because tools-superstep duration delays the next agent-superstep start) — never the current turn's. |
| "We tried `wrapToolCall` in the past and tool deltas stopped streaming"                                       | The likely root cause is upstream issue [langchainjs #9814](https://github.com/langchain-ai/langchainjs/issues/9814), closed Jan 2026, where the Anthropic API by default **buffers complete key-value pairs** internally and emits all `input_json_delta` events at once after the tool input is fully generated (12-second pauses observed on long string fields). The fix is the `fine-grained-tool-streaming-2025-05-14` beta header on the Anthropic client. **Tau already enables this beta** at `apps/api/app/api/providers/provider.service.ts:90-93`, so the symptom cannot reproduce in the current codebase.                                                                                                             |
| "Three `wrapToolCall` middlewares are already wired in production — does that prove the structural argument?" | Yes — `chat.service.ts:125-157` registers `toolErrorHandlerMiddleware`, `createToolOffloadingMiddleware`, and `createTranscriptMiddleware`, all of which use `wrapToolCall` (`apps/api/app/api/chat/middleware/tool-offloading.middleware.ts:131`, `tool-error-handler.middleware.ts`, `transcript.middleware.ts`). Anthropic delta streaming works correctly in production today; if `wrapToolCall` blocked deltas the chat would be visibly broken on every Anthropic turn. The eager-dispatch middleware adds one more entry to the same chain.                                                                                                                                                                                  |

**The streaming-blocking risk is not in `wrapToolCall` — it is in `handleLLMNewToken`.** That callback is awaited per-chunk by `runManager.handleLLMNewToken` (a `Promise.all` over registered handlers). If our `EagerToolDispatchHandler.handleLLMNewToken` were to `await tool.invoke(...)` inside the body, it would gate every subsequent `tool_call_chunk` on the tool finishing — defeating the whole architecture. The implementation discipline is strict and explicit:

```typescript
// CORRECT — kick off, do not await; the handler returns immediately
handleLLMNewToken(_token, _idx, _runId, _parentRunId, _tags, fields): void {
  // ... accumulation, S2 detection ...
  if (shouldDispatch) {
    this.dispatchTool(toolCallId, toolName, parsedArgs); // sync method that stores Promise on entry
  }
  // returns synchronously; LLM stream continues without backpressure
}

// WRONG — awaiting blocks every subsequent chunk
async handleLLMNewToken(...): Promise<void> {
  if (shouldDispatch) {
    await this.dispatchTool(...); // ← blocks LLM stream until tool finishes; do NOT do this
  }
}
```

The handler return type is `void` (synchronous); `dispatchTool` stores the in-flight `Promise<ToolMessage>` on `entries.get(toolCallId).invokePromise` for `wrapToolCall` to await later. **No synchronous await between the LLM chunk and the tool invocation — only fire-and-forget.**

### Finding 6: The AI SDK adapter already maps `on_tool_start` / `on_tool_end` events to UI chunks

`@ai-sdk/langchain` `processLangGraphEvent` handles `on_tool_start` and `on_tool_end` events in its `streamEvents`-v2 case (`repos/ai/packages/langchain/src/adapter.ts:248-283`):

```typescript
case 'on_tool_start': {
  controller.enqueue({
    type: 'tool-input-start',
    toolCallId: runId,
    toolName: name,
    dynamic: true,
  });
  break;
}
case 'on_tool_end': {
  controller.enqueue({
    type: 'tool-output-available',
    toolCallId: runId,
    output,
  });
  break;
}
```

The mapping is `on_tool_start → tool-input-start`, `on_tool_end → tool-output-available`. The current code uses `event.run_id` as `toolCallId`, which is the LangChain run identifier — not the LLM-issued tool_call_id. For per-tool correlation in the UI, we either (a) emit our eager events into the `'tools'` channel with the LLM tool_call_id and add a small chat-controller-side `case 'tools':` branch that maps `payload.toolCallId` (not `run_id`) to the chunk's `toolCallId`, or (b) contribute upstream so the adapter prefers `payload.toolCallId` over `event.run_id` when present. Option (a) is the first-cut path; option (b) is the natural follow-up.

### Finding 7: Issue #4653 confirms upstream's recognition of the underlying timing issue (open since 2025-05-12)

LangGraph issue [#4653](https://github.com/langchain-ai/langgraph/issues/4653) ("When invoking a graph of an agent with tools with `messages` streaming mode, the tool is executed before returning the generated chunks") documents the same Pregel barrier behaviour we observed. Author `@aielawady`'s minimal repro shows `Called the sum_two_ints function` printing **before** the first `AIMessageChunk` is yielded by `graph.invoke(..., stream_mode="messages")`. The issue is labeled `bug`, `agents`, `external` and remains open as of 2026-03-24. Three independent reports (issue authors `@aielawady`, `@JasonChen280`, `@xuzexin-hz`, `@Kigstn`, `@vivindeena`) confirm the regression manifests under multiple model providers (OpenAI GPT-4.1, DeepSeek-V3, GPT-4o). No upstream fix has shipped — PR #1984's `tools` mode is the closest movement toward a solution but addresses event SHAPE, not BARRIER.

### Finding 8: No prior eager-dispatch architecture exists in upstream LangGraph/LangChain/AI-SDK

A targeted search of the LangGraph, LangChain, and AI-SDK repositories surfaces no merged PRs, open PRs, RFCs, or discussions proposing an architecture that bypasses the agent superstep barrier to dispatch tool calls during LLM streaming. The closest patterns are:

| Source                                                                                                               | Pattern                                                                                          | Solves the barrier?                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| LangGraph PR #1984 (`tools` mode)                                                                                    | Per-tool lifecycle events, attached to ToolNode                                                  | No — events fire inside the tools superstep                                          |
| LangGraph PR #2000 (tools-mode example)                                                                              | Async-generator tools that `yield` partial output during execution                               | No — only mid-execution streaming, args finalization is still post-barrier           |
| LangChain `streamEvents` v2                                                                                          | `on_tool_start` / `on_tool_end` callback events                                                  | No — same callback infrastructure as `tools` mode, fires inside tools superstep      |
| LangGraph issue [#1289](https://github.com/langchain-ai/langgraphjs/issues/1289) (createReactAgent + parallel tools) | Closed without code fix; workaround is to disable `parallel_tool_calls`                          | No — disables parallelism entirely                                                   |
| LangChain PR [#32664](https://github.com/langchain-ai/langchain/pull/32664) (`chunk_position: "last"`)               | Tags the final aggregate chunk so consumers can detect args-finalization                         | Adjacent — gives consumers a per-tool finalization signal but doesn't drive dispatch |
| Cursor's published harness blog posts                                                                                | Five-layer architecture (Interface / Orchestration / Execution / Verification / Output); no code | N/A — no implementation details on stream interleaving                               |

**Implication**: the eager-dispatch architecture proposed here is a novel pattern relative to upstream's current capabilities. The `tools` channel is a clean wire format we can plug into; the trigger logic (callback on `handleLLMNewToken` + S1/S2/S3 detection) is where the actual barrier-breaking happens, and that piece is ours to invent. This architecture is a strong candidate for an upstream contribution to either `@langchain/langgraph` (a `streamMode: 'eager-tools'` extension) or `@ai-sdk/langchain` (per-tool args-finalization detector in the messages-mode path).

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Priority | Effort          | Impact                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R1  | Land the new e2e timing-baseline test (`records eager-dispatch timing baseline for parallel create_file calls`) so the regression is captured in CI before any fix attempts                                                                                                                                                                                                                                                                                                                     | P0       | Done in this PR | Provides the regression metric to flip when the fix lands                                                               |
| R2  | Bump the `@langchain/langgraph` catalog pin from `^1.1.5` to `^1.2.x` to unlock the canonical `tools` stream mode (PR #1984). Verify no breaking changes by running the existing parallel-tool-call deterministic test + integration tests.                                                                                                                                                                                                                                                     | P0       | 30 min          | Replaces the gnarly `dispatchCustomEvent` envelope with a typed first-class channel                                     |
| R3  | Implement eager-dispatch architecture per the [Implementation Blueprint](#implementation-blueprint) — tool-agnostic callback handler on the chat model that calls `tool.invoke()` (NOT `chatRpcService.sendRpcRequest` directly), trigger via S2 (index advance) + S3 (`handleLLMEnd`) only — no schema-validation heuristics, `wrapToolCall` middleware short-circuit, chat-controller `case 'tools':` branch on the LangGraph stream emitting the same payload shape as `StreamToolsHandler`. | P0       | 1-2 days        | Fixes the root cause; preserves real parallelism; matches Cursor/Claude Code UX; zero per-tool branching in the handler |
| R4  | After R3 lands, flip the test's "soft baseline" assertions into hard assertions: `expect(currentOutput.t).toBeLessThan(nextInput.t)` for every parallel tool call. Catches future regressions of the eager path.                                                                                                                                                                                                                                                                                | P1       | 30 min          | Locks in the desired behaviour                                                                                          |
| R5  | Investigate whether the timing-baseline test's per-RPC duration of <1 ms is still representative of production with real network latency. Consider a parallel-test variant that introduces a synthetic 200 ms delay in each tool to make the timing visualization meaningful for slower environments.                                                                                                                                                                                           | P2       | 1 h             | Tightens the test's signal-to-noise ratio                                                                               |
| R6  | Once the eager-dispatch handler is stable in apps/api, propose it as an upstream contribution to `@ai-sdk/langchain` as a `case 'tools':` branch in `processLangGraphEvent` (uses `payload.toolCallId` for correlation — currently the adapter falls back to `event.run_id`). Deletes our local chat-controller-side branch once accepted.                                                                                                                                                      | P3       | 1 day           | Removes local divergence; benefits the wider ecosystem                                                                  |

Explicitly **rejected** (carry-over from prior iterations of this doc):

- Server-side cadence/drain queue (overengineered, adds artificial latency)
- `wrapToolCall` per-chat mutex (sacrifices real parallelism for animation)
- UI-side reveal queue with enforced gap (hides reality, diverges from persisted state)

## Implementation Blueprint

Five components, in order:

### 1. Eager-dispatch state per agent run

A `Map<toolCallId, EagerToolEntry>` lives inside an `EagerToolDispatchHandler` instance for the duration of a single `agent.graph.stream(...)` call. Tracks the in-flight `tool.invoke` promise and the cached `ToolMessage` once it settles. Note: there is no `argsAccumulator` field on the public state shape — args accumulation is an internal implementation detail of the handler, not part of the contract `wrapToolCall` reads.

```typescript
// apps/api/app/api/chat/eager-dispatch/state.ts
interface EagerToolEntry {
  toolCallId: string;
  toolName: string;
  invokePromise: Promise<ToolMessage | Command>;
  result?: ToolMessage | Command; // populated when invokePromise settles
}
```

### 2. Tool-agnostic callback handler hooked onto the chat model

`EagerToolDispatchHandler extends BaseCallbackHandler` is constructed per `agent.graph.stream(...)` call with three references — the tools array, the LangGraph `'tools'`-channel writer (closure over `runStream.push`), and the base `RunnableConfig` carrying `configurable.chatRpcService`/`configurable.thread_id`/`signal`. The handler holds no per-tool branching: every tool the agent registers is dispatched the same way.

The handler subscribes to two callbacks:

- **`handleLLMNewToken(_token, _idx, _runId, _parentRunId, _tags, fields)`** — fires per `AIMessageChunk` during the LLM stream. Implementation:
  1. For each `tool_call_chunks[k]` in `fields?.chunk?.message`, capture `id`/`name` on the first chunk for that `index` (cache by `index → { toolCallId, toolName }`) and append `args ?? ''` to a per-`index` string accumulator (internal — not on `EagerToolEntry`).
  2. **S2 trigger — index advance**: if any `tool_call_chunks[k].index` exceeds `maxSeenIndex`, every prior `index` whose entry has not been dispatched is now provider-guaranteed final. For each such prior index, run `JSON.parse(accumulator)` (which now MUST succeed because the provider closed the block) and call `dispatchTool(toolCallId, toolName, parsedArgs)`.
- **`handleLLMEnd(output, _runId)`** — fires when the LLM stream completes. Read `output.generations[0][0].message.tool_calls[]` (the canonical post-stream consolidated array, not the chunk-time `parsePartialJson` form) and call `dispatchTool(toolCall.id, toolCall.name, toolCall.args)` for any tool not already dispatched. **S3 trigger.**

**`dispatchTool(toolCallId, toolName, args)`** — idempotent per `toolCallId`, first signal wins:

```typescript
private dispatchTool(toolCallId: string, toolName: string, args: unknown): void {
  if (this.entries.has(toolCallId)) return;

  const tool = this.tools.find((t) => t.name === toolName);
  if (!tool) return; // unknown tool — fall through to ToolNode's invalid-tool handling

  // Emit on_tool_start synchronously, before kicking off the invocation.
  this.toolsWriter([
    this.namespace,
    'tools',
    { event: 'on_tool_start', toolCallId, name: toolName, input: args },
  ]);

  const invokePromise = tool
    .invoke(
      { name: toolName, args, id: toolCallId, type: 'tool_call' },
      {
        ...this.baseConfig,
        toolCallId,
        signal: this.baseConfig.signal,
      },
    )
    .then((output) => {
      const result =
        ToolMessage.isInstance(output) || isCommand(output)
          ? (output as ToolMessage | Command)
          : new ToolMessage({
              name: toolName,
              content: typeof output === 'string' ? output : JSON.stringify(output),
              tool_call_id: toolCallId,
            });

      const entry = this.entries.get(toolCallId);
      if (entry) entry.result = result;

      this.toolsWriter([
        this.namespace,
        'tools',
        { event: 'on_tool_end', toolCallId, name: toolName, output: result },
      ]);

      return result;
    });

  this.entries.set(toolCallId, { toolCallId, toolName, invokePromise });
}
```

**Why this is tool-agnostic**: the handler never imports `chatRpcService`, never touches `rpcName`, never branches by `toolName`. The tool's own `func` (e.g. `apps/api/app/api/tools/tools/tool-create-file.ts:30-52`) reaches into `runtime.configurable.chatRpcService` and dispatches the RPC if it has one; tools that don't use RPC just run their `func` body. The handler is a strict superset of `ToolNode.runTool`'s execution path, just lifted earlier in time.

The handler is wired in the chat controller, not at module load:

```typescript
// chat.controller.ts (sketch)
const eagerHandler = new EagerToolDispatchHandler({
  tools: agent.tools,
  toolsWriter: (chunk) => runStream.push(chunk), // closure over LangGraph stream
  baseConfig: {
    configurable: { thread_id: chatId, chatRpcService },
    signal: req.signal,
  },
});

await agent.graph.stream(input, {
  ...baseConfig,
  callbacks: [eagerHandler],
  streamMode: ['values', 'messages', 'tools'],
  configurable: {
    ...baseConfig.configurable,
    eagerHandler, // exposed so wrapToolCall can read entries
  },
});
```

### 3. `wrapToolCall` middleware short-circuit

```typescript
// apps/api/app/api/chat/middleware/eager-dispatch.middleware.ts
const eagerDispatchMiddleware: AgentMiddleware = {
  name: 'eager-dispatch',
  wrapToolCall: async (request, handler) => {
    const eagerHandler = request.runtime.config?.configurable?.eagerHandler as EagerToolDispatchHandler | undefined;
    const entry = eagerHandler?.entries.get(request.toolCall.id);

    if (entry?.result) {
      return entry.result; // already settled — return cached value synchronously
    }

    if (entry?.invokePromise) {
      return await entry.invokePromise; // eager invocation in flight — await it
    }

    return handler(request); // not eagerly dispatched (e.g. unknown tool, S2/S3 missed) — fall through
  },
};
```

Wired into `chat.service.ts` agent middleware list **before** `agent-safeguards`, so a successfully eager-dispatched tool never re-enters the safeguards retry path. The middleware reads the handler instance directly from `runtime.config.configurable.eagerHandler` rather than a separate state map — single source of truth for the in-flight `invokePromise` and the cached `result`.

### 4. Emit on the canonical `tools` channel (LangGraph 1.2.0+)

After R2 lands the catalog bump, the chat controller's `streamMode` becomes `['values', 'messages', 'tools']` (drop `'custom'` — it is no longer needed). The handler's `dispatchTool` (Implementation Blueprint §2) writes directly to the `'tools'` channel using the **same payload shape as native `StreamToolsHandler`** (`repos/langgraphjs/libs/langgraph-core/src/pregel/stream.ts:222-264`).

The wire emission is two `toolsWriter([ns, 'tools', { ... }])` calls per tool — `on_tool_start` synchronously before `tool.invoke`, and `on_tool_end` from the `.then()` of the invocation promise. **Neither call references `chatRpcService` or any tool-specific dispatch concept**: the handler is generic. Whatever the tool's `func` does (RPC, computation, both) determines the eventual `output`. From the consumer's perspective, our eager `on_tool_start` / `on_tool_end` events are indistinguishable from native ones produced by `StreamToolsHandler`.

A small chat-controller transform converts `tools`-mode chunks to AI-SDK UI chunks (until upstream `@ai-sdk/langchain` ships `case 'tools':` per R6). The whole transform fits in ~25 lines:

```typescript
// apps/api/app/api/chat/utils/tools-mode-transform.ts
export function createToolsModeTransform(): TransformStream<RawLangGraphChunk, UIMessageChunk> {
  return new TransformStream({
    transform([_ns, mode, payload]: StreamChunk, controller) {
      if (mode !== 'tools') {
        controller.enqueue(payload as UIMessageChunk);
        return;
      }

      if (payload.event === 'on_tool_start') {
        controller.enqueue({
          type: 'tool-input-available',
          toolCallId: payload.toolCallId,
          toolName: payload.name,
          input: payload.input,
        });
      } else if (payload.event === 'on_tool_end') {
        controller.enqueue({
          type: 'tool-output-available',
          toolCallId: payload.toolCallId,
          output: payload.output,
        });
      }
      // on_tool_event and on_tool_error are no-ops for our use case
    },
  });
}
```

The transform also de-duplicates `tool-input-available` / `tool-output-available` chunks that the late `values`-mode emission would otherwise produce for already-eager-dispatched tools:

```typescript
      // Also: suppress the redundant late `tool-input-available` and
      // `tool-output-available` that the values/messages handlers will emit
      // at superstep end for eagerly-dispatched tools (they were already
      // emitted via the tools channel earlier).
      if (chunk.type === 'tool-input-available' || chunk.type === 'tool-output-available') {
        if (alreadyEmittedFromTools.has(chunk.toolCallId)) {
          return;
        }
      }

      controller.enqueue(chunk);
    },
  });
}
```

Inserted in the `chat.controller.ts` pipeline **before** `createStaticToolTransform` so dynamic-flag stripping still applies to the synthetic chunks.

### 5. Adapter integration

`@ai-sdk/langchain`'s `processLangGraphEvent` (`repos/ai/packages/langchain/src/utils.ts:1000`) currently has cases for `'custom'`, `'messages'`, and `'values'` — not `'tools'`. Two integration paths:

- **First cut (zero upstream coupling)**: the local transform in §4 runs the LangGraph stream BEFORE `toUIMessageStream`, so `tools`-mode chunks are translated to UI chunks before they hit the adapter.
- **Upstream contribution (R6)**: open a PR adding `case 'tools':` to `processLangGraphEvent` that mirrors the local transform; once merged, our local transform shrinks to a no-op or vanishes.

A small win either way: the `streamEvents`-v2 path in the adapter (`adapter.ts:248-283`) already handles `on_tool_start` / `on_tool_end` events, but it uses `event.run_id` for the chunk's `toolCallId` rather than the LLM-issued tool_call_id on the payload. The PR for `case 'tools':` should set chunk `toolCallId` from `payload.toolCallId` (the LLM-issued id) so per-tool correlation in the UI works correctly.

### Trigger timing — does the tool fire as soon as the input is available?

**Short answer: yes, with one critical clarification.** The phrase "input is available" has two meanings:

| Meaning                                                                | When it happens                                                                                                                                        | Can the trigger fire off it?                                                                                                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A.** The wire-side SSE chunk `tool-input-available` for that tool    | Today: at agent superstep end. Post-fix: synthetically emitted as a side effect of `dispatchTool` (the `on_tool_start` push to the `'tools'` channel). | No — the chunk itself is **emitted by** the trigger, not consumed by it. Reading from the SSE stream to decide when to dispatch would re-introduce the superstep barrier. |
| **B.** The args JSON for that tool has finished streaming from the LLM | Detected mid-stream via S2 (index advance) for tools 1..N-1 and S3 (`handleLLMEnd`) for tool N, inside `EagerToolDispatchHandler`.                     | Yes — this is the actual trigger.                                                                                                                                         |

The eager-dispatch architecture fires `tool.invoke()` the moment **B** happens. The `on_tool_start` push and the `tool.invoke()` call run synchronously in the same callback tick (no `await` between them), so the gap between the wire-side `tool-input-available` chunk and `tool-invoked` is **sub-millisecond** — exactly the headless `Δ ≈ 0 ms` we already see in the baseline trace, but now lifted out of the superstep boundary and onto the per-tool-args-finalized boundary.

What the timeline looks like for tool 1 in the captured trace:

```text
   4796ms  tool 1 input-start                (Anthropic content_block_start)
     ...   (Anthropic streams input_json_deltas — accumulator fills)
   4898ms  tool 2 input-start arrives        ← S2 trigger: tool 1's args are protocol-final
   4898ms  on_tool_start tool 1              ← toolsWriter push (synchronous, 'tools' channel)
   4898ms  tool-input-available  tool 1      ← chat-controller transform (synchronous)
   4898ms  tool.invoke(toolCall) tool 1      ← handler dispatch (same tick) → tool's func runs RPC
   4899ms  rpc-resolved          tool 1      ← memFs work = 0 ms; real socket would add ~10–30 ms
   4899ms  on_tool_end tool 1                ← toolsWriter push (synchronous, 'tools' channel)
   4899ms  tool-output-available tool 1      ← chat-controller transform (synchronous)
```

Compared with today's `tool-input-available@5972ms` → `rpc-invoked@5958ms` → `tool-output-available@5972ms` (where `rpc-invoked` actually slightly precedes the SSE chunk because both are downstream of the same superstep dispatch), the post-fix trace decouples each tool's lifecycle from the others entirely. Tool 1's invocation is in flight while tool 2's args are still streaming, and tool 1's output lands on the wire before tool 3's `input-start` even arrives.

#### Why only S2 + S3 (and never schema validation)

| Trigger                           | Fires for                                                                     | Provider invariant                                                                                                                                                                                           | Correctness risk                                                                                                                                                                                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S2 — index advance**            | Tools 1..N-1                                                                  | Anthropic/OpenAI/Google emit `content_block_stop`-of-N before `content_block_start`-of-(N+1). When the chunk stream surfaces `tool_call_chunks[*].index === N+1`, every chunk for index N has been received. | None — it is a strict consequence of the wire protocol.                                                                                                                                                                                                                                  |
| **S3 — `handleLLMEnd`**           | Tool N (the last)                                                             | Stream is complete; `output.generations[0][0].message.tool_calls[]` is the canonical post-stream-consolidated array.                                                                                         | None — by definition no more chunks can arrive.                                                                                                                                                                                                                                          |
| **S1 — Zod schema validation** ❌ | Would fire mid-stream when the partial accumulator first satisfies the schema | None — relies on a heuristic.                                                                                                                                                                                | **High.** Optional fields make `{ targetFile: 'x', codeEdit: 'hi' }` schema-valid even when the LLM is about to add `description`. Same flaw applies to consulting `AIMessageChunk.tool_calls`, which is built via `parsePartialJson` (`libs/langchain-core/src/messages/utils.ts:555`). |

**S2 has zero latency cost vs S1.** Anthropic emits `content_block_stop`-of-N and `content_block_start`-of-(N+1) within the same SSE flush; LangChain surfaces the `index === N+1` chunk on the next callback tick. So S2 fires within sub-millisecond of when S1 would have fired _correctly_. We trade nothing for protocol-level safety.

**S3 timing for the last tool.** `handleLLMEnd` fires when the LLM stream completes, which is still ~6 ms before the agent superstep finalizes (the gap between `handleLLMEnd` and Pregel's `values` event commit) and ~14 ms before today's `tool-input-available` chunk lands on the wire. Modest, but free, and never wrong.

**Edge case — single-tool calls**: only S3 fires (no next block to advance the index). This is fine; a single tool has nothing to interleave with, and S3 still gives the head start above.

**Edge case — JSON parse failure on S2**: if `JSON.parse(accumulator)` throws when the index advances, that is a provider/protocol violation (the block was supposedly closed but the args weren't valid JSON). Skip eager dispatch and let `ToolNode.runTool` handle it via its standard `ToolInputParsingException` path. No new failure modes introduced.

### Test target after the fix lands

The integration test's "soft baseline" assertions flip to:

```typescript
// For every consecutive pair (n, n+1) of parallel tools (using the original
// LLM tool order, not arrival order on the wire):
const nthOutput = outputAvailable.find((o) => o.toolCallId === inputStart[n].toolCallId);
const nextInputStart = inputStart[n + 1];
expect(nthOutput.t, `Tool ${n} output should land before tool ${n + 1}'s input-start (eager dispatch)`).toBeLessThan(
  nextInputStart.t,
);

// Plus an RPC-side assertion: each rpc-invoked is observed at the same tick
// as its tool's `tool-input-available` chunk (Δ < 5 ms), proving no per-tool
// queue is forming inside the eager handler.
for (const r of rpcEvents.filter((e) => e.stage === 'invoked')) {
  const matchingInputAvailable = inputAvailable.find((i) => i.toolCallId === r.toolCallId);
  expect(Math.abs(matchingInputAvailable.t - r.t)).toBeLessThan(5);
}
```

When the fix is correct, these assertions pass. The current `inputSpread < 50ms` / `outputSpread < 50ms` assertions are the inverse — they pass today and would fail after the fix, so they get inverted at the same time.

## Trade-offs

| Dimension                          | Today (Pregel BSP)                                                                                                                                   | After eager dispatch                                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-tool input-available emission  | Batched at agent superstep end                                                                                                                       | Streaming, per-tool, as args finalize                                                                                                                                                                                                                                              |
| Per-tool output-available emission | Batched at tools superstep end                                                                                                                       | Streaming, per-tool, as RPC settles                                                                                                                                                                                                                                                |
| Real parallel RPC execution        | Yes (within tools superstep)                                                                                                                         | Yes (across LLM stream + tool dispatch)                                                                                                                                                                                                                                            |
| RPC-to-LLM-streaming overlap       | None (sequential supersteps)                                                                                                                         | Full overlap — RPC k runs during tools k+1..N input streaming                                                                                                                                                                                                                      |
| Persisted `messages[]` shape       | AIMessage + ToolMessage[]                                                                                                                            | Identical (wrapToolCall short-circuits, ToolMessages still committed)                                                                                                                                                                                                              |
| Resume/reconnect                   | Standard                                                                                                                                             | Standard (eager state lives only for the single `graph.stream(...)` call; on reconnect, agent re-runs and state is rebuilt)                                                                                                                                                        |
| Tool-input delta streaming         | Anthropic deltas already stream character-by-character via `fine-grained-tool-streaming-2025-05-14` (already enabled at `provider.service.ts:90-93`) | **Unchanged** — handler is `handleLLMNewToken(...): void` (sync return, fire-and-forget on `tool.invoke`); never awaits inside the chunk path; `wrapToolCall` runs in a separate Pregel superstep so it can only delay the _next_ agent turn, not block deltas of the current turn |
| Implementation complexity          | N/A                                                                                                                                                  | Medium (5 components, all isolated to apps/api/app/api/chat/ + provider.service.ts hook)                                                                                                                                                                                           |
| Upstream coupling                  | None new                                                                                                                                             | Depends on `streamMode: 'tools'` (LangGraph 1.2.0+) and `wrapToolCall` (langchain 1.2+) — both stable, GA APIs                                                                                                                                                                     |

## Code Examples

### The deterministic probe that proved per-task emission already works in isolation

```typescript
// Probe with 4 tools sleeping 100/300/500/700 ms under createAgent + toUIMessageStream
// produced this output:
//   +158ms  output toolCallId=call_a   (sleep 100ms)
//   +357ms  output toolCallId=call_b   (sleep 300ms)
//   +558ms  output toolCallId=call_c   (sleep 500ms)
//   +756ms  output toolCallId=call_d   (sleep 700ms)
// — i.e. emission timing IS per-task once the tools superstep starts.
// The bug is that the tools superstep can't start until the agent superstep ends.
```

### The captured live trace (current behaviour, with RPC instrumentation)

```text
  4796ms  input-start      tool 1
  4898ms  input-start      tool 2
  5541ms  input-start      tool 3
  5958ms  rpc-invoked      tool 1, 2, 3   (spread = 0ms — Pregel barrier)
  5958ms  rpc-resolved     tool 1, 2, 3   (spread = 0ms — memFs work = 0ms)
  5972ms  input-available  tool 1, 2, 3   (all batched)
  5972ms  finish-step
  5972ms  start-step
  5972ms  output-available tool 1, 2, 3   (all batched)
```

Captured at `apps/api/app/testing/parallel-tool-call.integration.test.ts:records eager-dispatch timing baseline for parallel create_file calls`. RPC events come from a `setTimingObserver` hook on `HeadlessChatRpcService` (`invoked` / `dispatched` / `resolved`).

### Target trace after the fix

```text
  4796ms  input-start      tool 1
  4898ms  input-start      tool 2                  ← S2 trigger fires for tool 1
  4898ms  input-available  tool 1                  ← emitted on the 'tools' channel
  4898ms  tool.invoke      tool 1                  ← handler runs tool 1's func (RPC dispatches inside)
  4899ms  rpc-resolved     tool 1
  4899ms  output-available tool 1                  ← lands BEFORE tool 3's input-start
  5541ms  input-start      tool 3                  ← S2 trigger fires for tool 2
  5541ms  input-available  tool 2
  5541ms  tool.invoke      tool 2
  5542ms  rpc-resolved     tool 2
  5542ms  output-available tool 2                  ← lands BEFORE tool 3's input-available
  5972ms  handleLLMEnd                             ← S3 trigger fires for tool 3
  5972ms  input-available  tool 3
  5972ms  tool.invoke      tool 3
  5973ms  rpc-resolved     tool 3
  5973ms  output-available tool 3
  5974ms  finish-step                              ← agent superstep ends
  5974ms  start-step                               ← tools superstep begins
  5975ms  finish-step                              ← tools superstep ends instantly (wrapToolCall short-circuit)
```

## References

### Local code

- `apps/api/app/testing/parallel-tool-call.integration.test.ts` — live timing-baseline test (records the regression)
- `apps/api/app/api/chat/chat.controller.ts:148` — `streamMode: ['values', 'messages', 'custom']` (becomes `['values', 'messages', 'tools']` after R2)
- `apps/api/app/api/chat/chat-rpc.service.ts:236-291` — concurrent `emitWithAck` per RPC (no batching)
- `apps/ui/app/services/chat-rpc-socket.service.ts:307-309` — fire-and-forget browser RPC dispatch
- `apps/api/app/api/tools/tools/tool-create-file.ts:30-52` — example tool whose `func` encapsulates RPC dispatch — the eager handler invokes this via `tool.invoke()` exactly like `ToolNode` would
- Related: `docs/research/parallel-tool-call-durability.md` (the prior `maxConcurrency=1` regression)

### Upstream source

- `repos/langgraphjs/libs/langgraph-core/src/pregel/stream.ts:185-280` — `StreamToolsHandler` (the `'tools'` stream-mode emitter; copy this payload shape)
- `repos/langgraphjs/libs/langgraph-core/src/pregel/index.ts:2322-2333` — `streamMode: 'custom'` writer wiring (the fallback transport)
- `repos/langgraphjs/libs/langgraph-core/src/pregel/messages.ts:76-244` — `StreamMessagesHandler.handleChainEnd` per-task emission
- `repos/langchainjs/libs/langchain/src/agents/ReactAgent.ts:813-831` — `Send` fan-out per tool call (one Pregel task per tool)
- `repos/langchainjs/libs/langchain/src/agents/nodes/ToolNode.ts:290-395` — `runTool` / `baseHandler`: the canonical `tool.invoke({ ...toolCall, type: 'tool_call' }, runtimeConfig)` pattern the eager handler mirrors
- `repos/langchainjs/libs/langchain/src/agents/middleware/types.ts:173-178` — `wrapToolCall` middleware contract
- `repos/langchainjs/libs/providers/langchain-anthropic/src/utils/message_outputs.ts:1-260` — full `_makeMessageChunkFromAnthropicEvent`; **note the absence of any `content_block_stop` branch** — the surviving signals to the chunk stream are S2 (index advance) only
- `repos/langchainjs/libs/providers/langchain-anthropic/src/utils/message_outputs.ts:178-181` — Anthropic `input_json_delta` → `tool_call_chunks`
- `repos/langchainjs/libs/langchain-core/src/messages/utils.ts:540-560` — `AIMessageChunk.tool_calls` populated via `parsePartialJson` — confirms why partial-JSON triggers (S1 and equivalents) are unsafe
- `repos/ai/packages/langchain/src/utils.ts:1000-1326` — `processLangGraphEvent` (cases `'custom'`, `'messages'`, `'values'`; no `'tools'` yet)
- `repos/ai/packages/langchain/src/adapter.ts:248-283` — `streamEvents`-v2 `on_tool_start` / `on_tool_end` → UI chunk mapping (uses `event.run_id`, missing the LLM `toolCallId` from the payload)

### Prior-art GitHub issues and PRs

| Source                                                                                                                                                                                                       | Status                                                                     | Relevance                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [langgraphjs PR #1984](https://github.com/langchain-ai/langgraphjs/pull/1984) — feat: add tools stream mode for tool lifecycle events                                                                        | **Merged** 2026-02-25, shipped in `@langchain/langgraph@1.2.0`             | Adds `streamMode: 'tools'` + `StreamToolsHandler`. We adopt the wire format.                                                                                                                                                                                |
| [langgraphjs PR #2000](https://github.com/langchain-ai/langgraphjs/pull/2000) — tool progress example for new tools stream mode                                                                              | Merged                                                                     | Reference for async-generator tools that yield `on_tool_event`.                                                                                                                                                                                             |
| [langgraph issue #4653](https://github.com/langchain-ai/langgraph/issues/4653) — tool executes before chunks returned in `messages` mode                                                                     | **Open** since 2025-05-12                                                  | Confirms upstream recognises the same Pregel barrier behaviour we hit. No fix shipped.                                                                                                                                                                      |
| [langgraphjs issue #1289](https://github.com/langchain-ai/langgraphjs/issues/1289) — createReactAgent does not support parallel tool callings in streaming mode                                              | Closed 2025-09-11; no code fix, workaround is `parallel_tool_calls: false` | Disabling parallelism is not acceptable for our UX.                                                                                                                                                                                                         |
| [langgraph issue #45](https://github.com/langchain-ai/langgraph/issues/45) — Parallel tool calling and LLM token streaming                                                                                   | Closed; suggests `ToolExecutor.batch()` workaround                         | Pre-dates current `Send` fan-out architecture.                                                                                                                                                                                                              |
| [langgraph issue #6714](https://github.com/langchain-ai/langgraph/issues/6714) — cannot correlate subgraph namespace with parent tool_call_id when streaming with subgraphs=True                             | Open                                                                       | Adjacent: confirms toolCallId correlation has known gaps in the streaming path.                                                                                                                                                                             |
| [langchain PR #32664](https://github.com/langchain-ai/langchain/pull/32664) — parse `tool_call_chunks` in content in aggregated stream                                                                       | Merged                                                                     | Adds optional `chunk_position: "last"` so consumers can detect args-finalization. Adjacent to S1/S2/S3.                                                                                                                                                     |
| [langchainjs issue #10153](https://github.com/langchain-ai/langchainjs/issues/10153) — `_streamResponseChunks` does not pass chunk to `handleLLMNewToken`, breaking tool call streaming                      | Open                                                                       | Validates the `handleLLMNewToken(_, _, _, _, _, fields?.chunk)` signature path we depend on.                                                                                                                                                                |
| [langchainjs issue #9814](https://github.com/langchain-ai/langchainjs/issues/9814) — `@langchain/anthropic` is not streaming tool call delta. They are returned in one go after LLM finished generating args | Closed Jan 2026                                                            | **Likely root cause of any prior "wrapToolCall blocks deltas" experience.** Anthropic API default-buffers complete key-value pairs; fix is the `fine-grained-tool-streaming-2025-05-14` beta header. Already enabled in Tau at `provider.service.ts:90-93`. |
| [Anthropic fine-grained tool streaming docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)                                                                      | Active                                                                     | Beta header semantics and per-tool `eager_input_streaming: true` opt-in. Tau already opts in via the `betas` array on `ChatAnthropic`.                                                                                                                      |
| [langchainjs issue #34660](https://github.com/langchain-ai/langchain/issues/34660) — OpenAI Responses API: no chunk contains entire function_call definition                                                 | Open                                                                       | Highlights provider-specific gotchas in `tool_call_chunks` stream — confirms why S1 must validate against the per-tool schema, not just structural JSON parsing.                                                                                            |
| [LangChain `StreamToolCallHandler` reference (Python)](https://reference.langchain.com/python/langgraph/pregel/_tools/StreamToolCallHandler)                                                                 | Active                                                                     | Python equivalent of the JS `StreamToolsHandler`. Mirrors the wire format.                                                                                                                                                                                  |
| [Cursor harness blog posts](https://cursor.com/blog/continually-improving-agent-harness)                                                                                                                     | Public                                                                     | Five-layer architecture description, no source-level details on stream interleaving. Confirms eager dispatch is a UX expectation, not just our preference.                                                                                                  |

**Conclusion of the sweep**: the closest upstream movement is PR #1984's `'tools'` stream mode (canonical wire format we should adopt), but no PR or merged code path bypasses the agent superstep barrier. The eager-dispatch handler is our own contribution, with R6 as the natural upstream follow-up to `@ai-sdk/langchain`.
