---
title: 'Parallel Tool Call Incremental Persistence'
description: 'Why parallel tool-call results vanish when a chat stream is interrupted, why multiple write-file RPCs hit the browser concurrently, what LangGraph/AI SDK already offer in May 2026, and a layered plan that bounds in-flight RPCs and flushes each result the moment it settles.'
status: draft
created: '2026-05-06'
updated: '2026-05-06'
category: investigation
related:
  - docs/research/interrupted-tool-call-validation-failure.md
  - docs/research/chat-error-persistence-stale-display.md
  - docs/research/concurrent-chat-streams-agents-panel.md
  - docs/research/agent-loop-safeguards.md
---

# Parallel Tool Call Incremental Persistence

Investigates why a turn that emits many parallel `create_file` / `edit_file` tool calls "loses" the work the LLM has already paid for when the stream is interrupted (multiple write spinners appear concurrently in the chat UI, then disappear together on interrupt), audits May-2026 prior art across LangChain.js, LangGraph.js, the Vercel AI SDK (`@ai-sdk/workflow` `WorkflowAgent`), deepagentsjs and Cline, and proposes a layered fix that **(a) bounds the in-flight RPC count via LangGraph `maxConcurrency`** so file writes settle in serial completion order even when the LLM emits them as one parallel batch, and **(b) flushes each tool result the instant its RPC settles** so partial progress survives any interrupt class, instead of waiting for the AI SDK `onFinish` callback that may never fire.

## Executive Summary

Tau already runs the May-2026 best-of-class building blocks: `langchain@^1.2.27`'s `createAgent` defaults to `version: "v2"`, which fans out every parallel tool call to its own `Send` task; LangGraph's PostgresSaver records per-task pending writes so server-side state is partially durable mid-superstep; deepagentsjs's `write_file`/`edit_file` tools delegate to Tau's `TauRpcBackend` which awaits each Socket.IO `emitWithAck` individually. **None of that helps the user-visible chat.** The lossage is concentrated in three seams downstream of those guarantees:

1. **No concurrency cap on the Pregel runner.** `apps/api/app/api/chat/chat.controller.ts:134` calls `agent.graph.stream(...)` without `maxConcurrency`. The Pregel runner (`repos/langgraphjs/libs/langgraph-core/src/pregel/runner.ts:310`) defaults to `maxConcurrency ?? tasks.length` — i.e. unbounded — so all `Send`-fanned-out write tool tasks start at once. The user observes this directly as multiple concurrent loading spinners on `shaft.ts` / `handle.ts` / `trigger.ts` writes in the chat. **All N RPCs are in flight in the same window**, so any interruption inside that window loses results from every still-pending task — even though the architecture allows per-task durability.
2. **UI persistence is `onFinish`-bound.** `chat-session-store.ts` only calls `queuePersist` from the persistence machine's `applyFinishedRequest` / `applyStoppedRequest` / `applyResumedRequest` emits. The AI SDK `Chat.messages` array is updated incrementally on every `tool-output-available` chunk via `~registerMessagesCallback`, but that callback wakes UI listeners only — it never queues a write. If `onFinish` never fires (browser tab closed, hard navigate, network disconnect, server crash, SSE connection reset), every successful tool result that arrived inside the live `Chat.messages` is gone the moment the session is GC'd. Files written to IndexedDB by the RPC survive; the chat history that proves they were written does not.
3. **`finalizeInterruptedToolParts` over-corrects.** The interrupt finalizer in `apps/ui/app/utils/chat.utils.ts` indiscriminately demotes any non-`output-available` tool part to `output-error: USER_INTERRUPTED`. Because UI persistence is the source of truth on the next request (the API rebuilds LangGraph state from the request body, not from its own checkpoint tail), this overrides the LangGraph checkpoint's successful tool messages on retry, the LLM re-issues identical tool calls, and the wasteful re-execution the user is complaining about kicks in.

The Vercel AI SDK's `run-tools-transformation.ts` is the canonical reference for the inner loop (kick off tool execution, _don't_ await, enqueue the result the instant the promise resolves). LangGraph's `tasks` stream mode and per-task pending writes are the canonical reference for the outer loop. Vercel's `@ai-sdk/workflow` `WorkflowAgent` (April 2026) makes each tool execution a "discrete durable step" that survives crashes — the same architectural shape Tau wants without rewriting onto Workflows. The composite fix is therefore: **cap the Pregel runner at `maxConcurrency: 1` (or 2-3) for write-mode chats so RPCs settle in completion order**, **flush every settled milestone to IndexedDB the instant it lands**, **maintain a tool-call-id-keyed ledger of settled RPCs** (the same pattern Cline adopted in `cline/cline#8036` after their own parallel-tool-tracking bug), and **prefer the LangGraph checkpoint tail over UI-supplied tail** when they disagree on a retry.

## Problem Statement

> When a large number of files are being edited in a single turn and the stream ends, all file changes get lost which is wasteful.
> — User, May 2026

### Symptom

A typical failure case (reproduced in screenshots attached by the user):

1. User asks the agent to scaffold a multi-part design ("Decompose litter-grabber into shaft, handle, trigger, head, jaws, pads").
2. The model emits 5–10 parallel `edit_file` / `create_file` tool calls in one assistant turn.
3. Tool calls fan out, RPCs hit the browser, files materialise in IndexedDB.
4. Stream is interrupted before the assistant turn completes (user clicks Stop, network glitch, tab refresh, dev-server reload, deploy roll-over).
5. On the next user message ("continue"), the LLM re-emits the same tool calls — overwriting / re-creating the files it already wrote a turn earlier.

The user-visible cost is paid twice: the user is billed for two rounds of `~$1.40` token usage (visible in the screenshot), the LLM does the geometry decomposition twice, and any local edits the user made between the two turns are clobbered by the second write.

### Why this is the headline complaint and not the related "Interrupted Tool Call Validation Failure"

The earlier research doc `docs/research/interrupted-tool-call-validation-failure.md` (April 2026) covered the schema-level edge case where a Zod-strict input on `output-error` rejected partial-input tool parts at the API gate. That work landed (`R1`–`R4` shipped) and the chat now accepts those parts. But it stopped at the validation seam — it did not address the durability gap that comes one layer up. The current complaint is downstream: even when the schema accepts the part, the part should never have been written as `USER_INTERRUPTED` because the underlying tool RPC actually succeeded.

## Methodology

1. Mapped the end-to-end tool execution path: `LLM → @ai-sdk/langchain toUIMessageStream → langchain createAgent v2 → Send fan-out → ToolNode → deepagents.write_file → TauRpcBackend.write → ChatRpcService.sendRpcRequest → Socket.IO emitWithAck → browser RpcHandlers.writeFile → fileManager → IndexedDB`.
2. Read the streaming-side counterpart: `Browser AI SDK Chat → ~registerMessagesCallback → ChatSessionStore listeners` and `chatPersistenceMachine.requestLifecycle → applyFinishedRequest → queuePersist → IndexedDB`.
3. Cross-checked May-2026 upstream behaviour by reading source in the cloned repos (`repos/langchainjs`, `repos/langgraphjs`, `repos/ai`, `repos/deepagentsjs`, `repos/cline`) and reviewing the canonical PRs (`langchain-ai/langgraph#3126`, `langchain-ai/langgraphjs#1498`, `langchain-ai/langgraph#6722`).
4. Pulled the May-2026 LangGraph persistence docs (`docs.langchain.com/oss/javascript/langgraph/persistence`) and the `Send` reference (`reference.langchain.com/python/langgraph/types/Send`) for the canonical recovery semantics.
5. Surveyed peer agents (Cline's "exactly one tool per assistant message" prompt-level workaround, AI SDK `run-tools-transformation.ts` per-tool enqueue, Claude Code's `toolResultStorage` ledger) to identify alternative architectures and rule out anti-patterns.

## Findings

### Finding 1: Pregel runner has no concurrency cap — every `Send` task starts simultaneously

The screenshots attached by the user show two and three loading spinners on `shaft.ts`, `handle.ts`, `trigger.ts` etc. at the same time, mid-stream. That is not a rendering artefact — it is the literal scheduler behaviour. `repos/langgraphjs/libs/langgraph-core/src/pregel/runner.ts:304-328`:

```304:328:repos/langgraphjs/libs/langgraph-core/src/pregel/runner.ts
    while (
      (startedTasksCount === 0 || Object.keys(executingTasksMap).length > 0) &&
      tasks.length
    ) {
      for (
        ;
        Object.values(executingTasksMap).length <
          (maxConcurrency ?? tasks.length) && startedTasksCount < tasks.length;
        startedTasksCount += 1
      ) {
        const task = tasks[startedTasksCount];

        executingTasksMap[task.id] = _runWithRetry(
          task,
          retryPolicy,
          { [CONFIG_KEY_CALL]: call?.bind(thisCall, this, task) },
          signals?.composedAbortSignal
        ).catch((error) => {
          /* … */
        });
      }
```

The fallback is `maxConcurrency ?? tasks.length` — when unset, the loop kicks off every `Send` task in lockstep. Tau never sets `maxConcurrency`:

```134:154:apps/api/app/api/chat/chat.controller.ts
const stream = await agent.graph.stream(
  { messages },
  {
    configurable: { thread_id: chatId, /* … */ },
    signal: abortController.signal,
    streamMode: ['values', 'messages', 'custom'],
    callbacks: [ttftHandler],
    context: { /* … */ },
    recursionLimit: 2000,
  },
);
```

Combined with v2 Send fan-out (Finding 2), the result is:

```
LLM emits 5 parallel write_file tool_calls in one assistant message
  │
  ▼
ReactAgent v2: emit Send(TOOLS_NODE_NAME, …) ×5
  │
  ▼
Pregel runner.tick() — maxConcurrency unset → starts all 5 ToolNode tasks at once
  │       │       │       │       │
  ▼       ▼       ▼       ▼       ▼
TauRpcBackend.write × 5  (concurrent socket.emitWithAck)
  │       │       │       │       │
  ▼       ▼       ▼       ▼       ▼
fileManager.writeFile × 5  (browser parallel writes to IndexedDB)
```

This is the root cause of the symptom in the screenshots, and it amplifies every other failure mode: when 5 RPCs are in flight simultaneously, an interrupt closes the SSE channel before _any_ of the corresponding `tool-output-available` chunks land, so all 5 are demoted (Finding 4) and re-issued on retry.

LangGraph upstream is well aware of this risk class. `langchain-ai/langgraph#7412` (filed May 2026, still open) reports that when one parallel tool errors, sibling completed results are discarded by `Promise.all`/`asyncio.gather` semantics — the same architectural shape that bites Tau. `langchain-ai/langgraph#7417` (May 2026) reports tool calls >180 s being silently re-executed from checkpoint while the original is still running. Setting `maxConcurrency: 1` (or 2-3) is the canonical mitigation: the LLM keeps emitting parallel `tool_calls` (preserving prompt-cache prefix semantics, low input-token cost, and the LLM's planning context), but the agent executes them in completion order at the harness level — so any interrupt loses at most one in-flight tool, not all of them.

This finding does **not** advocate disabling parallel tool calls at the LLM provider (`disable_parallel_tool_use`/`parallel_tool_calls: false`); that approach is rejected in Finding 8 as unnecessarily expensive when LangGraph already provides a runner-level knob.

### Finding 2: Tau already uses LangGraph's "v2" Send fan-out — this is **not** the bug

`langchain@1.2.27` (`repos/langchainjs/libs/langchain/src/agents/ReactAgent.ts:170`) defaults `#toolBehaviorVersion = "v2"`. v2 routes parallel tool calls through `Send`:

```164:172:repos/langchainjs/libs/langchain/src/agents/ReactAgent.ts
  #toolBehaviorVersion: "v1" | "v2" = "v2";
```

```820:832:repos/langchainjs/libs/langchain/src/agents/ReactAgent.ts
      const regularToolCalls = lastMessage.tool_calls.filter(
        (toolCall) => !toolCall.name.startsWith("extract-")
      );

      if (regularToolCalls.length === 0) {
        return exitNode;
      }

      return regularToolCalls.map(
        (toolCall) =>
          new Send(TOOLS_NODE_NAME, { ...state, lg_tool_call: toolCall })
      );
```

This is precisely the architecture introduced upstream in `langchain-ai/langgraph#3126` (Jan 2025, Python) and ported to JS in `langchain-ai/langgraphjs#1498` (Aug 2025). With v2 fan-out, every tool call becomes a separate task within the same superstep. Per the LangGraph persistence docs (May 2026):

> In addition to super-step checkpoints, LangGraph also persists writes at the node (task) level. As each node within a super-step finishes, its outputs are written to the checkpointer's `checkpoint_writes` table as task entries linked to the in-progress checkpoint. These per-task writes are what enable pending writes recovery: if another node in the same super-step fails, the successful nodes' writes are already durable and don't need to be re-run on resume.

So **the LangGraph state is durable per-tool**. If 3 of 5 parallel tool calls complete and the 4th errors, the 3 are written to `checkpoint_writes` and replay-skipped on resume. This part of the system is correct.

### Finding 3: UI persistence only fires on AI SDK `onFinish` — the smoking gun

`apps/ui/app/services/chat-session-store.ts:426-432` is where every successful chat write is funnelled:

```typescript
const finishedSubscription = persistenceActorRef.on('applyFinishedRequest', ({ messages }) => {
  const sanitized = finalizeInterruptedToolParts(messages);
  if (sanitized !== messages) {
    chat.messages = sanitized;
  }
  persistenceActorRef.send({ type: 'queuePersist', messages: sanitized });
});
```

`applyFinishedRequest` is emitted from `chatPersistenceMachine.requestLifecycle` only on `requestFinished` — which itself fires from AI SDK's `Chat.onFinish` callback (`chat-session-store.ts:374`):

```typescript
onFinish({ messages, isAbort, isError }) {
  persistenceActorRef.send({ type: 'requestFinished', messages, isAbort, isError });
},
```

Two corollaries:

1. **No incremental persistence during streaming.** The AI SDK's `~registerMessagesCallback` (lines 459-471) updates `Chat.messages` on every `tool-output-available`, `text-delta`, `reasoning-delta`, etc. — but only notifies UI listeners. It does not call `queuePersist`. The persistence machine's `pendingMessages` stays `undefined` until `onFinish` fires.
2. **`flushNow` is empty if nothing was queued.** `<GlobalChatFlushGuard>` (`apps/ui/app/components/global-chat-flush-guard.tsx:33-42`) wires `useFlushOnClose` to send `flushNow` to every session, but the persistence machine's `flushNow` handler only bypasses the 100 ms debounce on `pending` state — there is no transition out of `idle`. If `queuePersist` was never sent, `flushNow` is a no-op.

The failure scenarios this enables, in order of how often they're seen in production:

| Scenario                                          | `onFinish` fires? | Tool RPC actually succeeded? | Result in IndexedDB |
| ------------------------------------------------- | ----------------- | ---------------------------- | ------------------- |
| User clicks Stop                                  | yes (isAbort)     | partially                    | partial             |
| API errors mid-stream (rate-limit, provider 5xx)  | yes (isError)     | partially                    | partial             |
| Network disconnect, browser comes back online     | eventually        | partially                    | partial-or-none     |
| Tab close mid-stream                              | **no**            | partially                    | **none**            |
| Hard navigation mid-stream                        | **no**            | partially                    | **none**            |
| Browser crash, OS sleep                           | **no**            | partially                    | **none**            |
| Fly.io rolls the API mid-stream (deploy, restart) | **no** (timeout)  | partially                    | **none**            |
| User opens a second chat window mid-stream        | yes               | yes                          | full                |

The bottom four rows are the user's "all file changes get lost" complaint. The files exist on disk (RPC settled before the catastrophe) — but the chat record that would have told the LLM not to redo them is missing.

### Finding 4: `finalizeInterruptedToolParts` clobbers the right answer when the wrong answer arrives later

`apps/ui/app/utils/chat.utils.ts:409-445` (called from every `applyFinishedRequest` / `applyStoppedRequest` / `applyResumedRequest` listener) walks the last assistant message and demotes every tool part that is still `input-streaming` or `input-available` into `output-error: USER_INTERRUPTED`. There is no check whether the underlying RPC has settled.

Race window:

```
t0   browser:   tool-input-available arrives, Chat.messages[N].parts[i] = {state:'input-available', input: {...}}
t1   server:    RPC dispatches, browser writes file, RPC ack returns
t2   server:    LangGraph emits ToolMessage in messages stream
t3   wire:      transport drops between t2 and the browser receiving the chunk
t4   browser:   onFinish fires with isAbort=true (browser saw the disconnect)
t5   browser:   finalizeInterruptedToolParts demotes part[i] → output-error: USER_INTERRUPTED
t6   browser:   queuePersist persists the demoted part to IndexedDB
t7   user:      "continue"
t8   server:    receives messages with USER_INTERRUPTED part, messageContentSanitizer
                injects synthetic error tool_result, agent re-issues the tool call
t9   server:    file written **again** — wasteful, possibly clobbering user edits
```

The smoking-gun line is `t5`: the part says "interrupted" but the RPC had already settled at `t2`. The client cannot tell the difference because nothing on the browser side ever recorded "RPC for `toolCallId=X` returned successfully" except the eventually-lost SSE chunk.

The April-2026 fix moved the partial input under `rawInput`, which is the right schema move, but the demotion itself still throws away ground truth.

### Finding 5: Vercel AI SDK has the canonical inner-loop pattern

`repos/ai/packages/ai/src/generate-text/run-tools-transformation.ts:320-358`:

```typescript
toolInputs.set(toolCall.toolCallId, toolCall.input);

if (tool.execute != null && toolCall.providerExecuted !== true) {
  const toolExecutionId = generateId();
  outstandingToolResults.add(toolExecutionId);

  // Note: we don't await the tool execution here (by leaving out 'await' on recordSpan),
  // because we want to process the next chunk as soon as possible.
  executeToolCall({
    toolCall,
    tools,
    /* … */
    onPreliminaryToolResult: (result) => {
      toolResultsStreamController!.enqueue(result);
    },
  })
    .then((result) => {
      toolResultsStreamController!.enqueue(result);
    })
    .catch((error) => {
      toolResultsStreamController!.enqueue({ type: 'error', error });
    })
    .finally(() => {
      outstandingToolResults.delete(toolExecutionId);
      attemptClose();
    });
}
```

Key properties:

- **Fire and continue** — the tool call's promise is not awaited inside the main reducer loop, so other chunks (more tool calls, text deltas) keep flowing.
- **Per-result enqueue** — every settled tool call enqueues its result onto a dedicated `toolResultsStream` the moment it settles, in completion order rather than emission order.
- **Outstanding-set close** — the stream is only closed when both the upstream model stream finishes AND every outstanding tool execution has settled. Aborts therefore observe partial results rather than zero results.
- **`onPreliminaryToolResult`** — even single tools can stream incremental sub-results via `executeTool`'s async iterable.

This is the design Tau's UI persistence layer should mirror at the next layer up: every settled tool result should be promptly committed to durable storage, not held in volatile `Chat.messages`.

### Finding 6: LangGraph has `streamMode: "tasks"` for per-task UI signals

`repos/langgraphjs/libs/langgraph-core/src/pregel/types.ts:23-30`:

```typescript
export type StreamMode = 'values' | 'updates' | 'messages' | 'checkpoints' | 'tasks' | 'custom';
```

`tasks` emits two events per task: a `StreamTasksCreateOutput` ({id, name, input, triggers}) when the task starts and a `StreamTasksResultOutput` ({id, name, result}) when it finishes. Combined with v2 fan-out, every parallel tool call shows up as its own task pair. The task `id` is stable across the create/result pair so the UI can reconcile preliminary tool-input-available parts with the durable result.

Tau currently uses `streamMode: ['values', 'messages', 'custom']` (`apps/api/app/api/chat/chat.controller.ts:145`) — `tasks` is not requested, so the UI never sees per-task lifecycle events.

### Finding 7: LangGraph `durability: "sync"` is opt-in but cheap for write-heavy turns

`repos/langgraphjs/libs/langgraph-core/src/pregel/types.ts:307-314`:

```typescript
/**
 * Whether to checkpoint during the run (or only at the end/interruption).
 * - `"async"`: Save checkpoint asynchronously while the next step executes (default).
 * - `"sync"`: Save checkpoint synchronously before the next step starts.
 * - `"exit"`: Save checkpoint only when the graph exits.
 * @default "async"
 */
durability?: Durability;
```

Default `"async"`: per-task pending writes are committed to Postgres concurrently with the next step. Under sustained load with a slow checkpointer this can leave a window where the in-memory state has tool messages that the database does not. `"sync"` closes the window at the cost of an extra Postgres round trip per task. For an agent doing 10 file writes that round trip is dwarfed by the LLM stream itself, but for a small read-heavy turn it's perceptible (~5-15 ms per task on Tau's `tau-prod-us` Fly app).

### Finding 8: Provider-level `parallel_tool_calls: false` is _too coarse_ — Cline learned this the hard way

LLM providers expose explicit toggles for forcing one-tool-per-response generation:

| Provider                                     | Option name                                                        | Source                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Anthropic                                    | `tool_choice.disable_parallel_tool_use: true`                      | `repos/ai/packages/anthropic/src/anthropic-prepare-tools.ts:300-345`                |
| OpenAI / Together / Groq / Mistral / Alibaba | `parallel_tool_calls: false`                                       | `repos/ai/packages/openai/src/chat/openai-chat-options.ts:75`                       |
| LangChain (all of above)                     | `parallel_tool_calls: boolean` on `BaseChatModel.invocationParams` | `repos/langchainjs/libs/providers/langchain-openai/src/chat_models/base.ts:130-134` |

Tau's `apps/api/app/api/providers/provider.service.ts` does not pass any of these — every model is allowed to emit parallel tool calls. Setting these to `false` would make the LLM produce **one** tool call per assistant turn, which trivially fixes the concurrency-based loss class.

**This is not the right knob.** Cline initially adopted exactly this approach (`trinity` variant: "EXACTLY ONE tool per assistant message"), then walked it back in `cline/cline#8020` (May 2026: "feat: add experimental parallel tool calling support") with a runtime `enableParallelToolCalling` flag — finally followed by `cline/cline#8036` ("Fix parallel tool calling by tracking tool use via call_id"). The post-mortem in those PRs maps directly onto what Tau already feels:

- **Latency multiplier.** A 5-file decomposition becomes 5 round trips with 5 separate Anthropic prompt-cache misses on the multi-MB system prompt prefix. On Tau's typical 8-12 k token system prompt, a single re-priming costs ~0.5-1.0 USD on Sonnet 4.x — multiply by 5 and the user pays 5× the prior single-turn bill.
- **Loss of LLM planning context.** The CAD geometry decomposition workflow specifically benefits from the LLM having the full part list in its working set when it emits `shaft.ts → handle.ts → trigger.ts → head.ts → jaws.ts → pads.ts` in one batch; serialising forces the LLM to "rediscover" the part list each turn.
- **Per-tool checkpointing storm.** Cline's PR #8020 explicitly moved checkpointing from per-tool to per-response _because_ the per-tool case produced excessive checkpoints during parallel execution. Tau's PostgresSaver has the same property under v2 Send fan-out.

The cleaner answer (and the one Cline + WorkflowAgent both converge on) is to **let the LLM emit parallel tool calls but bound the harness's execution concurrency**. LangGraph already exposes `maxConcurrency` for exactly this (Finding 1); the LLM round-trip cost is paid once, the prompt cache prefix is preserved, and the agent's RPCs settle in completion order.

### Finding 9: AI SDK `WorkflowAgent` (April 2026) is the upstream-canonical "durable parallel tools"

Vercel published `@ai-sdk/workflow` (`WorkflowAgent`, 1.0.0-beta.5, April 2026) specifically for this problem class. Per the AI SDK docs (`ai-sdk.dev/v7/docs/agents/workflow-agent`):

> Each tool execution is a discrete, observable step. … Tool execution survives process restarts and crashes. Failed steps can retry from the last checkpoint rather than restarting from scratch.

`WorkflowAgent` runs inside Vercel Workflows, where each tool call is materialised as a workflow step, persisted before execution, and resumable post-crash. This is the same architectural shape Tau wants — but adopting `WorkflowAgent` would mean rewriting `apps/api/app/api/chat/` off LangGraph, off deepagentsjs (which the team has invested in for sub-agent orchestration, file-tool middleware, and checkpoint compaction), and onto Vercel Workflows infrastructure. Out of scope for the current investigation, but worth flagging as the canonical answer in the broader ecosystem and as a contingency if LangGraph durability fails to close the gap after R1-R5 land.

The reverse is also informative: even Vercel — who own AI SDK and could have made `streamText`/`ToolLoopAgent` durable — chose to introduce a separate agent class because the in-memory runtime is not the right place for durability. LangGraph already has the durable runtime; Tau just needs to wire the harness flags correctly.

### Finding 10: deepagents `write_file` returns a `Command` when the backend is state-backed — not Tau's case

`repos/deepagentsjs/libs/deepagents/src/middleware/fs.ts:497-526`:

```typescript
const result = await resolvedBackend.write(file_path, content);

if (result.error) {
  return result.error;
}

const message = new ToolMessage({
  content: `Successfully wrote to '${file_path}'`,
  tool_call_id: config.toolCall?.id as string,
  name: 'write_file',
  metadata: result.metadata,
});

if (result.filesUpdate) {
  return new Command({
    update: { files: result.filesUpdate, messages: [message] },
  });
}

return message;
```

`Command` updates merge into LangGraph state via reducers (the in-memory `files` channel). Tau's `TauRpcBackend.write` (`apps/api/app/api/chat/tau-rpc-backend.ts:148-163`) returns `filesUpdate: null`, deliberately marking the filesystem as external to LangGraph state. So the file content does not enter the agent's checkpoint — only the success `ToolMessage` does. That's the correct architecture for Tau (the browser owns the FS), but it means **the agent's checkpoint contains the success message but no proof-of-write artifact**. If anything strips the success message before the next request, the LLM has no signal that the write actually happened.

### Finding 11: API rebuilds state from request body, not checkpoint tail

`apps/api/app/api/chat/chat.controller.ts:134-155`:

```typescript
const stream = await agent.graph.stream(
  { messages }, // ← request body, not checkpoint
  {
    configurable: { thread_id: chatId /* … */ },
    signal: abortController.signal,
    streamMode: ['values', 'messages', 'custom'],
    /* … */
  },
);
```

The first arg is the new input, which `messagesStateReducer` merges into the existing checkpoint state. Because the UI's IndexedDB-backed messages are the wire-truth for every retry/regenerate/edit, any divergence between the LangGraph checkpoint (which has the successful tool result) and the UI's persisted messages (which has `output-error: USER_INTERRUPTED`) is resolved in favour of the UI: the orphan-call sanitiser sees an outstanding `tool_call` with no matching `tool_result`, fabricates a synthetic `USER_INTERRUPTED` `ToolMessage`, and the LLM sees "this tool was interrupted, please retry".

This is the architectural multiplier on Finding 4: the UI's stale write of `output-error` actively undoes any per-task pending writes the LangGraph checkpoint had recorded.

## Trade-offs

| Approach                                                                                           | Pros                                                                                                                                                                                                                | Cons                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cap `maxConcurrency` on `agent.graph.stream(...)`** (recommended R0)                             | LLM keeps emitting parallel tool calls (prompt-cache prefix preserved, planning context intact); harness executes them in completion order; one in-flight RPC at a time means at most one task is lost on interrupt | Cumulative wall time grows linearly with tool count when tools are I/O-bound (browser file writes are sub-100 ms each, so a 5-file batch grows from ~100 ms to ~500 ms — acceptable trade for durability); needs a sensible default (1-3) per chat mode |
| **Provider-level `disable_parallel_tool_use`/`parallel_tool_calls: false`**                        | Trivial wiring                                                                                                                                                                                                      | Forces 1-tool-per-turn at the LLM level — 5× LLM round trips, 5× prompt-cache prefix re-priming, 5× cost; loses the LLM's batched planning context (rejected per Finding 8)                                                                             |
| **Persist on every `tool-output-available` / `text-end` / `reasoning-end` chunk** (recommended R1) | Cheapest path; matches AI SDK's per-tool-result design philosophy; survives tab close                                                                                                                               | ~3-10 extra debounced IndexedDB writes per turn; tiny risk of write storms during very long tool-call bursts (mitigated by the existing 100 ms persist debounce)                                                                                        |
| **RPC ledger consulted by interrupt finalizer** (recommended R2)                                   | Fixes "interrupt label clobbers settled tool" specifically; matches Cline's `call_id`-keyed tracking from `cline/cline#8036`                                                                                        | Needs new browser-side ledger keyed by toolCallId; only useful if R1 also lands                                                                                                                                                                         |
| **API-side checkpoint-tail merge** (recommended R3)                                                | Backstops total UI loss (cleared site data, browser switch); `messageContentSanitizer` keeps acting as defence-in-depth                                                                                             | ~120 LOC + `checkpointer.getTuple()` per request adds ~5-15 ms to every chat turn                                                                                                                                                                       |
| **Switch `durability: "sync"` for the chat agent** (recommended R4)                                | Closes the API-side window between task completion and Postgres commit                                                                                                                                              | ~10 ms latency per task (5-50 tasks × 10 ms ≈ 500 ms cumulative on a big decomposition); doesn't help the UI gap on its own                                                                                                                             |
| **Drive UI from LangGraph checkpoint instead of UI's IndexedDB**                                   | Single source of truth, eliminates stale-overrides class                                                                                                                                                            | Massive refactor; loses offline-friendliness; replaces a working IndexedDB cache with a per-load Postgres dependency                                                                                                                                    |
| **Adopt Cline's "one tool per turn" prompt rule** (rejected per Finding 8)                         | Zero infrastructure changes                                                                                                                                                                                         | Kills parallelism, multiplies latency, undermines prompt cache, fights every other Tau system-prompt section; Cline themselves walked this back in `cline/cline#8020`                                                                                   |
| **Migrate to `@ai-sdk/workflow` `WorkflowAgent`** (rejected per Finding 9)                         | Each tool execution is a discrete durable workflow step out-of-the-box                                                                                                                                              | Rewrite of `apps/api/app/api/chat/` off LangGraph + deepagentsjs; loses sub-agent middleware investment; introduces Vercel Workflows infrastructure dependency                                                                                          |
| **Abandon LangGraph and run AI SDK `streamText` directly**                                         | AI SDK's run-tools-transformation already does the right thing                                                                                                                                                      | Loses checkpointer, deepagents middleware, LangGraph subagent orchestration; rewrite of `apps/api/app/api/chat`                                                                                                                                         |

The recommended composite is a layered defence: harness concurrency cap (R0) + incremental UI persistence (R1) + an RPC ledger that survives finalizer demotion (R2) + checkpoint-tail merge on the API (R3). Server-side `durability: "sync"` (R4) and `streamMode: 'tasks'` propagation (R5) are reinforcements. R0 is the single highest-leverage change because it shrinks the window of in-flight tool calls from N to 1, eliminating the "all spinners disappear together" symptom even before the persistence layer changes land.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Priority | Effort           | Impact                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- | ------------------------------------------------------ |
| R0  | **Cap LangGraph harness concurrency to 1 (or 2-3) for chat agents.** Pass `maxConcurrency: 1` to `agent.graph.stream(...)` in `apps/api/app/api/chat/chat.controller.ts:134`. The Pregel runner serializes `Send`-fanned-out tool tasks at the harness level, so the LLM keeps emitting parallel `tool_calls` (preserves prompt-cache prefix, low input-token cost) but the agent dispatches one RPC at a time and emits each `tool-output-available` chunk in completion order. Eliminates the "5 spinners visible at once → all 5 lost on interrupt" symptom. Behind a `TAU_LANGGRAPH_TOOL_CONCURRENCY` env var (default 1) so we can dial up later if telemetry shows tail-latency regression on read-heavy chats. **Single highest-leverage change.** | **P0**   | ~5 LOC + env     | High — eliminates the user-visible concurrency symptom |
| R1  | **Wire `~registerMessagesCallback` to `queuePersist` for "milestone" parts.** In `apps/ui/app/services/chat-session-store.ts:459`, add a per-chat dirty bit that flips whenever the latest message's parts include a _new_ `tool-output-available`, `tool-output-error`, `text-end`, or `reasoning-end` since the last persist. When the bit flips, send `{ type: 'queuePersist', messages: chat.messages }` to the persistence actor. The 100 ms debounce in `chatPersistenceMachine` already coalesces bursts. Stops Scenario 4-7 (tab close, hard navigate, OS sleep, deploy) from losing settled tool results.                                                                                                                                        | **P0**   | ~40 LOC          | High — primary fix                                     |
| R2  | **RPC ledger that the finalizer respects.** Maintain a per-chat `Map<toolCallId, RpcOutcome>` populated inside `apps/ui/app/hooks/rpc-handlers.ts` whenever a `writeFile` / `editFile` / `appendFile` / `deleteFile` RPC settles successfully. Mutate `finalizeInterruptedToolParts` (`apps/ui/app/utils/chat.utils.ts:409`) to consult the ledger before demoting a part: if the ledger has a successful outcome for `part.toolCallId`, write the part as `output-available` with the ledger's output instead of `output-error: USER_INTERRUPTED`. Closes Finding 4's race window. Ledger entries auto-expire 60 s after the matching `applyFinishedRequest` to prevent unbounded growth.                                                                | **P0**   | ~80 LOC + tests  | High — eliminates wasteful re-execution                |
| R3  | **API-side: prefer LangGraph checkpoint tail over UI-supplied tail when they disagree.** In `apps/api/app/api/chat/chat.controller.ts:233 (prepareMessages)`, when the request body's last assistant message contains `tool_call`s whose `toolCallId`s match successful `ToolMessage`s already in the checkpoint, replace the body's tail with the checkpoint's tail before reducing into state. Use `checkpointer.getTuple({ configurable: { thread_id: chatId } })` to read the existing checkpoint. Backstops R1+R2 for the case where the browser's IndexedDB lost the result entirely (e.g. clearing site data). The existing `messageContentSanitizerMiddleware` keeps acting as the defence-in-depth gate.                                         | **P1**   | ~120 LOC + tests | Medium — backstop for total UI loss                    |
| R4  | **Set `durability: "sync"` on `agent.graph.stream(...)` for write-heavy chats.** Pass `durability: 'sync'` in the `streamAgentResponse` options when the request mode is `agent` (as opposed to `ask`). Keeps the per-task pending writes durable in Postgres before the next task starts, so an API process crash mid-superstep doesn't lose tool results. Latency cost: ~10 ms per task. Behind a `TAU_LANGGRAPH_DURABILITY` env var defaulting to `sync`, falling back to `async` if Postgres p99 commit latency regresses past 100 ms.                                                                                                                                                                                                                | **P2**   | ~5 LOC + env     | Medium — protects against API crashes                  |
| R5  | **Surface per-task lifecycle to the UI.** Add `'tasks'` to `streamMode` and pipe the new task events through `toUIMessageStream` so the UI sees `tool-input-available` synchronously with the LangGraph task start, not just when the `messages` mode dribbles out the eventual `ToolMessage`. Useful as a faster signal for Activity-section "Exploring..." spinners, and gives the UI a stable `taskId` to anchor the R2 ledger to even before any RPC fires. Optional, lands cleanly only after R1+R2.                                                                                                                                                                                                                                                 | **P2**   | ~60 LOC          | Low (now), Medium (future per-tool UX)                 |
| R6  | **Add a regression test that simulates `applyStoppedRequest` arriving before a settled `tool-output-available` chunk.** New test in `apps/ui/app/services/chat-session-store.test.ts` that injects a `Chat.messages` update with one settled tool result and one streaming tool input, then dispatches `dispatchStop` followed by `applyStoppedRequest`. Asserts: (a) the settled tool's `output-available` part is preserved verbatim in the persisted messages, (b) the streaming part is demoted to `output-error: USER_INTERRUPTED` with `rawInput` set, (c) IndexedDB sees a write before any `flushNow`. Covers the user's exact scenario.                                                                                                          | **P0**   | ~120 LOC         | High — locks in R1+R2                                  |
| R7  | **Document the contract** in `docs/policy/context-engineering-policy.md` (or a new `docs/policy/tool-call-durability-policy.md`): "every settled tool result is durably persisted to IndexedDB _before_ the next stream chunk is processed; finalizers may not demote a part whose underlying side effect already succeeded." Prevents a future contributor from re-introducing the lazy-persist behaviour for a tactical reason (e.g. "writes are slow on Safari").                                                                                                                                                                                                                                                                                      | **P2**   | ~50 LOC          | Low — durable guardrail                                |
| R8  | **Track the AI SDK's eventual native incremental-persist hook.** AI SDK ships an `onToolCallFinish` callback per tool but no `onMessageUpdated` style hook. If/when AI SDK exposes a per-part lifecycle hook (mentioned in `vercel/ai#xxxx` discussion threads — track separately), the R1 dirty-bit can be replaced with the upstream primitive. Until then R1 is the right interim shape.                                                                                                                                                                                                                                                                                                                                                               | **P3**   | tracking issue   | Low — keeps fork debt visible                          |

## Diagrams

### Today: lazy-persist (Scenario "tab close mid-stream")

```
LLM emits 5 parallel tool calls
  │
  ▼
ToolNode (v2 Send fan-out) ─────────► task #1 …5 in parallel
  │                                       │
  │ each task                              │
  │ ▼                                       ▼
  │ TauRpcBackend.write ─emitWithAck──► browser RpcHandlers
  │                                          │
  │                                          ▼
  │                                       fileManager.writeFile (IndexedDB)
  │                                          │
  │  ◄────────── ack ──────────────────────  ✓ disk durable
  │
  │ task emits ToolMessage
  ▼
LangGraph messages stream chunk
  │
  ▼
SSE wire ──── ✗ tab closes, transport drops ✗
  │
  ▼
AI SDK Chat.messages          ← tool-output-available NEVER lands
  │
  ▼
~registerMessagesCallback     ← never fires for the lost chunks
  │
  ▼
chatPersistenceMachine        ← pendingMessages stays undefined
  │
  ▼
GlobalChatFlushGuard.flushNow ← no-op (nothing queued)
  │
  ▼
IndexedDB                     ← stale: still holds prior turn's messages
                                Files exist on disk; chat record does not.
```

### After fix: bounded concurrency + incremental-persist + RPC ledger

```
LLM emits 5 parallel write_file tool_calls in one assistant message
  │
  ▼
ReactAgent v2 emits Send(TOOLS_NODE_NAME, …) ×5
  │
  ▼
Pregel runner.tick({ maxConcurrency: 1 })   ← R0
  │
  ▼ schedules ONE task at a time (in completion order)
  ▼
task #1 → TauRpcBackend.write ─emitWithAck──► browser RpcHandlers
                                                │
                                                ▼
                                            fileManager.writeFile (IndexedDB)
                                                │
                                                ▼
                                            RPC ledger.set(toolCallId#1, success)   ← R2
                                                │
                                                ▼ ack
ToolMessage chunk → SSE wire → AI SDK Chat.messages
  │
  ▼ ✓ tool-output-available #1 lives in messages
~registerMessagesCallback
  │ ✓ R1 dirty-bit flips — milestone part
  ▼ 100ms debounce
chatPersistenceMachine.persisting → IndexedDB     ← #1 durable
  │
  ▼
runner schedules task #2 (only after #1 settles)
  │
  ▼ … repeat for #2, #3, #4, #5 …

… tab closes mid-stream after task #3 settled, task #4 in flight …

flushNow → no-op for current pending,
           but #1, #2, #3 already durable in IndexedDB
           (only #4's in-flight RPC is at risk; its file may still
            land in IndexedDB even though the chat result is lost).

… user retries …

API receives messages with tool-output-available×3 preserved + tool-input×2 demoted
  │
  ▼  R3: prepareMessages prefers checkpoint tail when toolCallIds match
  ▼
agent.graph.stream            ← agent only re-issues the unfinished
                                #4 + #5 tool calls, not the durable
                                #1-#3.
```

**Key delta vs today**: at any instant, the harness has at most ONE write-file RPC in flight. Combined with R1, every settled milestone reaches IndexedDB before the next RPC kicks off. Combined with R2, even the in-flight one is recoverable on retry if its RPC actually settled at the browser before the SSE channel dropped.

## Code Examples

### A. Harness concurrency cap (R0)

```typescript
// apps/api/app/api/chat/chat.controller.ts (excerpt)
const toolConcurrency = Number(process.env.TAU_LANGGRAPH_TOOL_CONCURRENCY ?? '1');

const stream = await agent.graph.stream(
  { messages },
  {
    configurable: { thread_id: chatId /* … */ },
    signal: abortController.signal,
    streamMode: ['values', 'messages', 'custom'],
    maxConcurrency: toolConcurrency,
    callbacks: [ttftHandler],
    context: {
      /* … */
    },
    recursionLimit: 2000,
  },
);
```

`maxConcurrency: 1` is the durability-first default. The Pregel runner consumes tasks from the `Send`-fanned-out queue one at a time and yields each completed task back to the streaming pipeline before scheduling the next, so `tool-output-available` chunks arrive in completion order and the UI sees one spinner at a time. For chats that are predominantly read-only (file lookups, web search, screenshots) and benefit from genuine parallelism, the env var can be raised to 2-3 without losing most of the durability win.

### B. Milestone-driven persistence (R1)

```typescript
// apps/ui/app/services/chat-session-store.ts (excerpt)
let lastPersistedMilestone = -1;

const milestoneTypes: ReadonlySet<MyMessagePart['type']> = new Set([
  'tool-output-available',
  'tool-output-error',
  'text-end',
  'reasoning-end',
]);

const unregisterMessages = chat['~registerMessagesCallback'](() => {
  // Existing usage tracking …

  const lastIndex = chat.messages.length - 1;
  const lastMessage = chat.messages[lastIndex];

  if (lastMessage?.role === 'assistant' && lastIndex !== lastPersistedMilestone) {
    const hasMilestone = lastMessage.parts.some((p) => milestoneTypes.has(p.type));
    if (hasMilestone) {
      lastPersistedMilestone = lastIndex;
      persistenceActorRef.send({ type: 'queuePersist', messages: chat.messages });
    }
  }

  // Existing listener fan-out …
});
```

The check is intentionally cheap (one `Set.has` per part). The 100 ms persist debounce inside `chatPersistenceMachine` collapses bursts. `lastPersistedMilestone` resets when `applyFinishedRequest` fires (final flush always wins).

### C. RPC ledger consulted by the finalizer (R2)

```typescript
// apps/ui/app/services/rpc-ledger.ts (new)
export type RpcOutcome = { kind: 'success'; output: unknown } | { kind: 'error'; errorCode: string; message: string };

const ledgerByChat = new Map<string, Map<string, { outcome: RpcOutcome; settledAt: number }>>();

export function recordRpcOutcome(chatId: string, toolCallId: string, outcome: RpcOutcome): void {
  let ledger = ledgerByChat.get(chatId);
  if (!ledger) {
    ledger = new Map();
    ledgerByChat.set(chatId, ledger);
  }
  ledger.set(toolCallId, { outcome, settledAt: Date.now() });
}

export function getRpcOutcome(chatId: string, toolCallId: string): RpcOutcome | undefined {
  return ledgerByChat.get(chatId)?.get(toolCallId)?.outcome;
}

export function pruneLedger(chatId: string, ttlMs = 60_000): void {
  const ledger = ledgerByChat.get(chatId);
  if (!ledger) return;
  const cutoff = Date.now() - ttlMs;
  for (const [id, { settledAt }] of ledger) {
    if (settledAt < cutoff) ledger.delete(id);
  }
}
```

```typescript
// apps/ui/app/hooks/rpc-handlers.ts (excerpt — wrap createFile/editFile/appendFile/deleteFile)
async writeFile(path, content) {
  await fileManager.writeFile(path, encodeTextFile(content), { source: 'machine' });
  recordRpcOutcome(chatId, toolCallId, { kind: 'success', output: { path, message: 'Written' } });
},
```

```typescript
// apps/ui/app/utils/chat.utils.ts (finalizeInterruptedToolParts excerpt)
const updatedParts = lastMessage.parts.map((part) => {
  if (!isToolPart(part) || (part.state !== 'input-streaming' && part.state !== 'input-available')) {
    return part;
  }

  const ledgered = getRpcOutcome(chatId, part.toolCallId);
  if (ledgered?.kind === 'success') {
    // RPC actually settled — preserve the truth instead of demoting.
    return {
      ...part,
      state: 'output-available' as const,
      output: ledgered.output,
    } as MyMessagePart;
  }

  // Existing demotion path (with rawInput carry-over from prior research).
  // …
});
```

### D. Checkpoint-tail merge (R3)

```typescript
// apps/api/app/api/chat/chat.controller.ts (excerpt)
private async prepareMessages(
  messages: CreateChatDto['messages'],
  snapshot: ChatSnapshot | undefined,
  chatId: string,
): Promise<LangChainMessages> {
  validateImageParts(messages);

  const messagesWithContext = snapshot ? injectSnapshotContext(messages, snapshot) : messages;

  const checkpoint = await this.checkpointerService
    .getCheckpointer()
    .getTuple({ configurable: { thread_id: chatId } });

  if (checkpoint) {
    const merged = mergeCheckpointTail({
      requestMessages: messagesWithContext,
      checkpointMessages: checkpoint.checkpoint.channel_values?.messages as BaseMessage[] | undefined,
    });
    return merged;
  }

  return toBaseMessages(messagesWithContext);
}
```

`mergeCheckpointTail` walks the request's last assistant message; for any `tool_call` whose `id` already has a `ToolMessage` in the checkpoint, it splices in that `ToolMessage` instead of relying on the orphan-call sanitiser.

### E. Per-task durability (R4)

```typescript
// apps/api/app/api/chat/chat.controller.ts:134
const stream = await agent.graph.stream(
  { messages },
  {
    configurable: { thread_id: chatId /* … */ },
    signal: abortController.signal,
    streamMode: ['values', 'messages', 'custom'],
    durability: process.env.TAU_LANGGRAPH_DURABILITY === 'async' ? 'async' : 'sync',
    callbacks: [ttftHandler],
    context: {
      /* … */
    },
    recursionLimit: 2000,
  },
);
```

## References

### Concurrency and Pregel scheduling

- LangGraph `maxConcurrency` reference: <https://reference.langchain.com/javascript/langchain-langgraph/pregel/PregelOptions>
- `LangGraphRunnableConfig.maxConcurrency`: <https://langchain-ai.github.io/langgraphjs/reference/interfaces/langgraph.LangGraphRunnableConfig.html>
- Pregel runner concurrency loop: `repos/langgraphjs/libs/langgraph-core/src/pregel/runner.ts:304-328`
- Pregel `maxConcurrency` config plumbing: `repos/langgraphjs/libs/langgraph-core/src/pregel/index.ts:2280-2290`
- `langchain-ai/langgraph#7412` — "Default `handle_tool_errors` doesn't catch tool execution errors in parallel calls" (filed May 2026; sibling completed results discarded by `Promise.all`/`asyncio.gather` on first sibling failure): <https://github.com/langchain-ai/langgraph/issues/7412>
- `langchain-ai/langgraph#7417` — "Long tool calls (~180s+) silently re-executed from checkpoint on LangGraph Cloud" (filed May 2026): <https://github.com/langchain-ai/langgraph/issues/7417>

### LangGraph durability primitives

- LangGraph persistence and pending writes: <https://docs.langchain.com/oss/javascript/langgraph/persistence>
- LangGraph durability modes (`async` / `sync` / `exit`): `repos/langgraphjs/libs/langgraph-core/src/pregel/types.ts:300-314`
- `Send` fan-out for parallel tool calls (Python PR): <https://github.com/langchain-ai/langgraph/pull/3126>
- `Send` fan-out port to JS (`createReactAgent` v2): <https://github.com/langchain-ai/langgraphjs/pull/1498>
- Tool-call namespace in checkpoints (subgraph correlation): <https://github.com/langchain-ai/langgraph/pull/6722>
- ToolNode parallel-interrupt collection bug (closed Jan 2026): <https://github.com/langchain-ai/langgraph/issues/6624>
- `langchain` v1 ReactAgent `version: 'v1' | 'v2'` default: `repos/langchainjs/libs/langchain/src/agents/ReactAgent.ts:170-172`

### AI SDK

- AI SDK per-tool fire-and-forget enqueue: `repos/ai/packages/ai/src/generate-text/run-tools-transformation.ts:320-358`
- AI SDK `executeToolCall` with `onPreliminaryToolResult`: `repos/ai/packages/ai/src/generate-text/execute-tool-call.ts:103-125`
- AI SDK `WorkflowAgent` (April 2026, `@ai-sdk/workflow`, durable per-step tool execution): <https://ai-sdk.dev/v7/docs/agents/workflow-agent>
- AI SDK `streamUI` parallel tool call bug fix (Jan 2026): <https://github.com/vercel/ai/issues/1894>
- Vercel Workflows durable execution overview: <https://vercel.com/blog/a-new-programming-model-for-durable-execution>

### Provider parallel-tool-call toggles (rejected approach)

- Anthropic `tool_choice.disable_parallel_tool_use`: `repos/ai/packages/anthropic/src/anthropic-prepare-tools.ts:300-345`
- OpenAI / Together / Groq / Mistral / Alibaba `parallel_tool_calls: false`: `repos/ai/packages/openai/src/chat/openai-chat-options.ts:73-76`
- LangChain OpenAI base model docstring: `repos/langchainjs/libs/providers/langchain-openai/src/chat_models/base.ts:128-134`

### Cline (peer agent prior art)

- Cline `enableParallelToolCalling` runtime toggle (May 2026): <https://github.com/cline/cline/pull/8020>
- Cline parallel-tool tracking by `call_id` instead of tool name (May 2026): <https://github.com/cline/cline/pull/8036> — same root cause as Tau's R2 ledger
- Cline `trinity` "exactly one tool per assistant message" prompt rule: `repos/cline/src/core/prompts/system-prompt/variants/trinity/overrides.ts:13`
- Cline GPT-5 / GPT-5.1 / Gemini-3 conditional parallel guidance: `repos/cline/src/core/prompts/system-prompt/variants/native-gpt-5/template.ts:54`, `repos/cline/src/core/prompts/system-prompt/variants/gemini-3/overrides.ts:7-10`

### deepagentsjs

- deepagents `write_file` tool (returns ToolMessage, optional Command for state-backed FS): `repos/deepagentsjs/libs/deepagents/src/middleware/fs.ts:497-538`

### Tau code paths

- Tau provider service (does NOT pass `parallel_tool_calls`/`disableParallelToolUse`): `apps/api/app/api/providers/provider.service.ts:60-101`
- Tau persistence machine: `apps/ui/app/hooks/chat-persistence.machine.ts:262-332`
- Tau session store: `apps/ui/app/services/chat-session-store.ts:370-471`
- Tau RPC handlers (browser): `apps/ui/app/hooks/rpc-handlers.ts:95-196`
- Tau RPC backend (server, deepagents protocol): `apps/api/app/api/chat/tau-rpc-backend.ts:148-197`
- Tau RPC service (one socket selected for emit, abort plumbing): `apps/api/app/api/chat/chat-rpc.service.ts:236-337`
- Tau chat controller stream invocation: `apps/api/app/api/chat/chat.controller.ts:131-198`
- Related: `docs/research/interrupted-tool-call-validation-failure.md` (fixed the schema gate so partial-input tool parts can round-trip)
- Related: `docs/research/chat-error-persistence-stale-display.md` (introduced the `requestLifecycle` parallel state this work extends)
- Related: `docs/research/concurrent-chat-streams-agents-panel.md` (defined the `ChatSessionStore` ownership model)

## Appendix: Settling on the right "milestone" set for R1

R1 only debounces persistence on a curated set of part types (`tool-output-available`, `tool-output-error`, `text-end`, `reasoning-end`). Three alternatives were considered and rejected:

| Alternative                                            | Why rejected                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Persist on every chat.messages mutation                | text-delta fires per token — at 50 tok/s that's a 10 ms debounce blowback even with the existing 100 ms coalescing. Hits IndexedDB write storms. |
| Persist only on `tool-output-available`                | Misses long reasoning traces and trailing assistant text — a reasoning-only interrupted turn would still be lost.                                |
| Persist on `tool-input-available` (before RPC settles) | The part has no result yet; persisting it is no better than today's `output-error: USER_INTERRUPTED` story without R2's ledger consult.          |

The chosen set covers every "cost-paid" boundary: a settled tool RPC (the user paid for the write, we must remember it), a completed text segment (the LLM has emitted a coherent paragraph), and a completed reasoning block (signals end-of-thought and clears the prompt-cache breakpoint). Each is bounded in cardinality per turn (1-20 typically) so the debounce coalesces well.
