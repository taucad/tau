---
title: 'Chat Cancelled-Message Persistence and Cache-Write Explosion Forensics'
description: 'Forensic analysis of a chat session that produced two ~180K-token Anthropic cache writes in a single thread, traced to ID-stripped message replays compounding with cancelled-stream persistence in LangGraph state.'
status: draft
created: '2026-05-20'
updated: '2026-05-20'
category: investigation
related:
  - docs/research/chat-followup-message-swallow.md
  - docs/research/chat-edit-message-metadata-stripping.md
  - docs/research/resumable-chat-streams.md
  - docs/research/gemini-prompt-cache-busting.md
  - docs/research/chat-model-cost-forensics.md
---

# Chat Cancelled-Message Persistence and Cache-Write Explosion Forensics

Root-cause forensic for a single chat session (`chat_SzunEKDRfSIVrjbRBSLsN`, project `proj_mlfBbvbuqqPU0vvtCBlYO`) that produced two ~180K-token Anthropic cache writes — a $1.11 Turn-1 and a $1.15 Turn-9 — in a 9-turn "what's a ham / how old is the sun" conversation, and persisted a user-cancelled "how old is the universe" message into the LangGraph thread state where it later influenced the assistant's "continue" response.

## Executive Summary

Three independent bugs interact to produce the observed bill spike and the "ghost message" the user reported:

1. **Stripped message IDs defeat LangGraph's deduplicating reducer.** `@ai-sdk/langchain`'s `toBaseMessages` constructs `new HumanMessage({ content })` / `new AIMessage({ content })` with no `id` field. `messagesStateReducer` then **assigns a fresh `uuid.v4()` to every incoming message** and falls through to `merged.push(m)` because no prior message shares the new UUID. The persisted thread state grows **non-linearly** — the final checkpoint contains **42 messages where only 13 are unique** (3.2× duplication factor).
2. **Cancelled streams leave their input write committed.** LangGraph commits the `input` checkpoint write **before** model invocation. When the user cancels mid-stream (or before any tokens), the input write is not rolled back. The cancelled "how old is the universe" `HumanMessage` is preserved in `langgraph.checkpoint_blobs` at version 39 and survives every subsequent turn — including the "continue" turn that the user expected to scope to "how old is the sun" only.
3. **Per-turn history re-injection forces cache WRITES on every duplicated message.** ⚠️ **Revised 2026-05-20** — the original TTL-expiry framing was wrong (see [Appendix D](#appendix-d-cost-forensics-re-audit--the-keychain-session)). Inspecting `chat_gUow7ccbHoTjUt3mOQwet` shows turn-to-turn gaps of 56 s – 5 m 03 s (all within Anthropic's 5-min ephemeral TTL), yet the final user turn billed $3.24. The actual mechanism: each input checkpoint **appends the entire client-side UI history wholesale** because `toBaseMessages` strips IDs and `messagesStateReducer` pushes every ID-less inbound message onto state. The "fix it" input grew state by **76 messages (~750 KB) in a single input write** — all of which fell outside the prior turn's cache breakpoint and were charged at the 1.25× cache-write rate. Cost per turn scales with the **size of the client's UI history at submission**, not the size of the new prompt.

The architecturally correct fix is **R1: send only the new user message on the wire and let LangGraph's `thread_id` checkpoint carry conversation state** (the pattern LangGraph is designed for). This eliminates the duplication entirely, makes cancellation safe by construction (no replay = no resurrection), and shrinks every prompt cache write to the actual delta.

## Problem Statement

The user reported two symptoms from a single chat session:

1. **Cache-write explosion.** Two turns in the 9-turn conversation each incurred ~180K-token Anthropic `cache_creation_input_tokens` writes (Turn 1: $1.11; Turn 9: $1.15). The intervening 7 turns each cost $0.12 with healthy cache reads. Total session cost: **$3.24**.
2. **Ghost message.** The flow was:
   - T6: "how old is the sun" → assistant streamed "The" then stalled (transient Anthropic balance error)
   - T7: user typed "how old is the universe", cancelled before any tokens arrived
   - T8: user typed "continue"
   - Expected: assistant continues the sun answer
   - Actual: assistant produced a single response that answered **both** the sun and universe questions, as if the cancelled universe message were still part of the conversation

## Methodology

- **Transcript**: `/Users/rifont/Downloads/qr_code_keychain_2026-05-19T23-49.md` (6,399 lines)
- **Workspace**: `/Users/rifont/Documents/tau-workspace/projects/proj_mlfBbvbuqqPU0vvtCBlYO/main.scad` (empty file — no CAD work performed)
- **Database**: `postgresql://dev_user:dev_password@localhost:5432/tau_dev`, schema `langgraph` (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`)
- **Source audit**: chat controller / persistence flow in `apps/api/app/api/chat/`, AI-SDK transport in `apps/ui/app/chat-clients/_internal/`, `messagesStateReducer` in `@langchain/langgraph@1.3.0`, `toBaseMessages` in `@ai-sdk/langchain`
- **Replay**: decoded all 53 LangGraph checkpoints (`thread_id = 'chat_SzunEKDRfSIVrjbRBSLsN'`) and 36 versions of the `messages` channel blob to reconstruct state evolution per turn

## Findings

### Finding 1: `toBaseMessages` strips every message ID, defeating LangGraph dedup

`@ai-sdk/langchain`'s `convertUserContent` / `convertAssistantContent` produce LangChain messages **without** an `id` field:

```javascript
// node_modules/@ai-sdk/langchain/dist/index.mjs:71
return new HumanMessage({ content }); // no id

// node_modules/@ai-sdk/langchain/dist/index.mjs:59
return new AIMessage({
  content: textParts.join(''),
  tool_calls: toolCalls.length > 0 ? toolCalls : void 0,
}); // no id
```

LangGraph's `messagesStateReducer` (`@langchain/langgraph@1.3.0/dist/graph/messages_reducer.js:53-58`) reacts to ID-less incoming messages by minting fresh UUIDs:

```javascript
for (let i = 0; i < rightMessages.length; i += 1) {
  const m = rightMessages[i];
  if (m.id === null || m.id === void 0) {
    m.id = v4(); // brand-new UUID
    m.lc_kwargs.id = m.id;
  }
  // ...
}
```

The dedup branch (`mergedById.get(m.id)`) then never finds a match, and every message falls through to `merged.push(m)` — appended verbatim.

Direct evidence from the `checkpoint_writes` table for `chat_SzunEKDRfSIVrjbRBSLsN`, step 41 input (the "continue" turn):

```text
[0] HumanMessage 'hi'                          kwargs.id = MISSING
[1] AIMessage    'Hi! What would you like…'    kwargs.id = MISSING
[2] HumanMessage "what's a ham"                kwargs.id = MISSING
[3] AIMessage    "Ham is cured pork…"          kwargs.id = MISSING
[4] HumanMessage 'how does the sun cook ham'   kwargs.id = MISSING
[5] AIMessage    "The sun doesn't really…"     kwargs.id = MISSING
[6] HumanMessage 'how old is the sun'          kwargs.id = MISSING
[7] AIMessage    'The'                         kwargs.id = MISSING
[8] HumanMessage '<system-reminder>…continue'  kwargs.id = MISSING
```

All nine messages were appended to the existing 32-message state, growing it to 41. After the assistant's "continue" response streamed in, the state reached **42 messages**, of which **only 13 are semantically unique** (3.2× duplication factor).

State growth tracked across the `messages` channel blob versions:

| LangGraph step | Source | `messages` channel msg count | blob bytes |
| -------------- | ------ | ---------------------------- | ---------- |
| `-1` (T1 in)   | input  | 1                            | 417        |
| 0 (T1 out)     | loop   | 2                            | 1,317      |
| 10 (T2 in)     | input  | 5                            | 2,674      |
| 14 (T2 out)    | loop   | 6                            | 3,819      |
| 21 (T3 in)     | input  | 11                           | 5,900      |
| 26 (T4 in)     | input  | 16                           | 7,981      |
| 31 (T5 in)     | input  | 23                           | 10,593     |
| 36 (T6 in)     | input  | 32                           | 13,656     |
| 41 (T7 in)     | input  | 41                           | 16,704     |
| 47 (T7 out)    | loop   | 42                           | 17,787     |

The increment per turn equals the **count of UIMessages the client transmitted** (8–9 messages each), confirming the append-only behavior at the reducer.

### Finding 2: Cancelled-stream input writes are not rolled back

Step-36 (turn 6, "how old is the universe") committed a 9-message `input` write into LangGraph **before** the model invocation:

```text
checkpoint_id = 1f153de4-8ada-6260-8024-3751ef572faf  (step 36, source=input)
writes:
  task_id = ... idx=0 channel=messages
    [...8 prior turn messages..., '<system-reminder>…how old is the universe']
```

The user cancelled the request **before any assistant tokens were received** (Anthropic balance error + manual cancel). Tau's UI side does the right thing — `chat-session-store.ts:609` handles the `restoreCancelledDraft` event by replacing `chat.messages` with `truncatedMessages` (the prior tail without the cancelled user message) and lifting the cancelled text back into the composer's draft actor.

But LangGraph **already** committed the input write to Postgres at the moment `agent.graph.stream({ messages })` was invoked. The `messages` channel blob at version 39 (post step-36 input checkpoint) contains 32 messages including `<system-reminder>…how old is the universe` at slot 31. **The cancel had no rollback effect on LangGraph state.**

When the user then submitted "continue" at step 41, the controller called `prepareMessages` → `toBaseMessages` → `agent.graph.stream({ messages })`. LangGraph's reducer:

- Saw the 9 ID-less messages sent by the client (which correctly omitted the cancelled universe message)
- Appended them all to the existing 32-message state (which still contained the cancelled universe message at slot 31)
- Result: the model received slot-31 `how old is the universe` followed shortly by slot-40 `…continue`, with both inside the input prompt for that turn

The smoking gun is the final state at version 52, message [31]:

```text
[31] HumanMessage  '<system-reminder>…how old is the universe'
[32] HumanMessage  'hi'                                     ← duplicated history begins
[33] AIMessage     'Hi! What would you like to model?'
[34] HumanMessage  "what's a ham"
...
[40] HumanMessage  '<system-reminder>…continue'
[41] AIMessageChunk 'The Sun is about 4.6 billion years old, formed from a collapsing
                    molecular cloud. The universe is about 13.8 billion years old,
                    dated from the cosmic microwave background.'
```

The assistant's "continue" response addressed **both** the sun and the universe — exactly the behavior the user flagged as wrong. From the model's perspective it was acting correctly; both questions were unambiguously in its context.

### Finding 3: Anthropic prompt-cache TTL expired during balance top-up

Per-turn token costs from the transcript footer:

| Turn | Tokens | Cost  | Inferred cache_write |
| ---- | ------ | ----- | -------------------- |
| 1    | 220K   | $1.11 | ~180K (initial)      |
| 2    | 230K   | $0.26 | small (delta)        |
| 3    | 220K   | $0.12 | minimal              |
| 4    | 230K   | $0.12 | minimal              |
| 5    | 230K   | $0.12 | minimal              |
| 6    | 230K   | $0.12 | minimal              |
| 7    | 230K   | $0.12 | minimal              |
| 8    | 230K   | $0.12 | minimal              |
| 9    | 230K   | $1.15 | ~180K (re-cache)     |
| Σ    | ~2M    | $3.24 |                      |

The Turn-9 expansion (Input: 1 token, Output: 767, Cache Read: 50K, Cache Write: 180K — per the screenshot tooltip) is the diagnostic. Of the 230K input tokens only 50K hit cache; 180K had to be re-tokenized and re-cached. Turn-1's identical 180K write reflects the **initial** caching of system prompt + tool definitions and is expected.

The Turn-9 invalidation has two contributors:

1. **TTL expiry (dominant).** Anthropic's default prompt-cache TTL is 5 minutes. The user's "topped up balance then hit retry" gap exceeds that window by construction. The 50K residual cache hit corresponds to the very earliest portion of the prompt that survived (likely an inner Anthropic optimization), but the bulk of system prompt + tool catalog had to be re-cached.
2. **Prefix divergence from duplication (secondary).** Because Finding 1 grew the messages tail by 9 messages between Turns 7 and 9, the **position** at which the cached prefix diverges from the new input shifts on every turn. Even without TTL expiry the divergence point creeps backward through the cached region, eroding cacheable bytes per turn.

The 180K cost-per-cache-write is itself bounded by Tau's prompt size (~200K-token system prompt + tool catalog from kernel/runtime prompts). Reducing system prompt size and using Anthropic's 1-hour-TTL `cache_control` beta would both shrink the worst-case bill (see Recommendations R3, R4).

### Finding 4: The client unconditionally sends the full UI message history

`apps/ui/app/chat-clients/_internal/shared-chat-transport.ts:21` constructs `DefaultChatTransport` without overriding `prepareSendMessagesRequest`. AI SDK 6.0.x's `HttpChatTransport.sendMessages` therefore POSTs the entire client-side `messages` array on every wire call:

```javascript
// node_modules/.pnpm/ai@6.0.99_*/node_modules/ai/dist/index.mjs:12643
const body =
  preparedRequest?.body !== void 0
    ? preparedRequest.body
    : {
        ...resolvedBody,
        ...options.body,
        id: options.chatId,
        messages: options.messages, // <-- full client-side array
        trigger: options.trigger,
        messageId: options.messageId,
      };
```

Tau's API accepts this in `body.messages` (`CreateChatDto`), runs `prepareMessages` → `toBaseMessages`, and then feeds the lot into `agent.graph.stream({ messages })`. LangGraph's reducer appends because the IDs were stripped (Finding 1).

This is the architectural mismatch at the core: the API both **receives** the full transcript from the client **and** maintains its own persistent `thread_id`-keyed state in Postgres. The two stores are not kept in sync — they additively diverge.

### Finding 5: `mergeCheckpointTail` does not deduplicate

`apps/api/app/api/chat/utils/merge-checkpoint-tail.ts:55` is currently scoped to splicing `output-available` tool parts from the checkpoint into the request when the client's view of a tool result is stale. It never compares `requestMessages` IDs against `checkpointMessages` IDs and never reconciles overlapping turns. Even if the client sent stable IDs, this helper would not deduplicate against persisted state — it only fixes the narrow tool-result mid-flight case.

### Finding 6: `<system-reminder>` snapshot context is appended every turn

`apps/api/app/api/chat/utils/inject-snapshot-context.ts:139` unconditionally prepends a `<system-reminder>` block (active file, open files, full project layout with file sizes) to the **last user message** on every turn — there is no 70%-context-window deferral despite that being a documented preference in `.cursor/rules/learned-api.mdc`. Because the message tail duplicates, each historical user turn carries its own snapshot block frozen at a different filesystem state (in this session `chat_…jsonl (4KB)` at slot 31 vs `(5KB)` at slot 40 for the same project layout block). This is benign for the _current_ turn's cache prefix (the volatile reminder sits at the tail of the input) but it permanently bloats persisted state.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Priority | Effort | Impact                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------ | ---------------------- |
| R1  | **Send delta-only on the wire and own the merge server-side.** Override `DefaultChatTransport`'s `prepareSendMessagesRequest` to transmit only the latest user message (plus a `messageId`/`parentMessageId` cursor). Replace `agent.graph.stream({ messages: toBaseMessages(allRequestMessages) })` with a checkpoint-aware controller that fetches the persisted tail via `checkpointer.getTuple({thread_id})`, locates the cursor, and either (a) feeds `{ messages: [newUserMessage] }` to extend the thread or (b) issues a `RemoveMessage(REMOVE_ALL_MESSAGES)` to restore a truncated tail before extending. Eliminates Findings 1 + 2 + 4 in one architectural change. | P0       | High   | Eliminates whole class |
| R2  | **Make message-ID round-tripping non-negotiable.** While R1 is in flight, patch the API boundary to assign stable IDs derived from the UIMessage `msg_*` ID on every `HumanMessage` / `AIMessage` constructed via `toBaseMessages`. The minimal change is a post-processor over the `toBaseMessages` result that walks `langchainMessages` and `requestMessages` in parallel, copying `requestMessages[i].id` (or a deterministic hash thereof) into `langchainMessages[i].id`/`lc_kwargs.id`. This single-line of defense stops the reducer from minting UUIDs and keeps dedup working for both incidental retries and full-history replays.                                  | P0       | Low    | Eliminates Finding 1   |
| R3  | **Truncate on cancel by issuing `RemoveMessage` writes against LangGraph.** When the persistence machine emits `restoreCancelledDraft` / `applyStoppedRequest`, fire a server RPC that calls `checkpointer.put({ ...stateWithRemoves })` for every `HumanMessage`/`AIMessage` added by the cancelled turn, OR uses LangGraph's `updateState` with `RemoveMessage(id)` entries. Without R1/R2, this is the only way to keep persisted state consistent with the user's mental model. With R1, this becomes free (no resurrection because nothing was appended).                                                                                                                 | P0       | Med    | Eliminates Finding 2   |
| R4  | **Adopt Anthropic 1-hour `cache_control` beta where available.** Move the system-prompt + tool catalog cache breakpoint to use `cache_control: { type: "ephemeral", ttl: "1h" }` (gated behind the `extended-cache-ttl-2025-04-11` beta header). Cuts the worst-case Turn-9-class cache-write spike by 12× when users return after long gaps without changing any other behavior.                                                                                                                                                                                                                                                                                              | P1       | Low    | Reduces blast radius   |
| R5  | **Shrink the cached prefix.** The ~200K token cache-write per cold start is dominated by the kernel/runtime system prompt + tool descriptions. Audit (1) embedded multi-file examples in `apps/api/app/api/chat/prompts/kernel-prompt-configs/<kernel>.prompt.example-multifile/`, (2) the tool-input schema reflection used by the LLM, and (3) `<system-reminder>` injection cadence (defer below 70% context utilization per learned policy). Even a 30% reduction is a $0.40 saving per cold start at current rates.                                                                                                                                                       | P1       | Med    | Reduces blast radius   |
| R6  | **Add a hard server-side cap + telemetry alert.** Emit a metric `chat.langgraph.state.message_count` on every checkpoint write. Alert when a thread exceeds 2× expected (e.g. 50 messages for a 10-turn chat). Backstops every future regression of the same class.                                                                                                                                                                                                                                                                                                                                                                                                            | P2       | Low    | Detection              |
| R7  | **Backfill audit.** Run `SELECT thread_id, COUNT(*) FROM langgraph.checkpoint_blobs WHERE channel = 'messages' GROUP BY thread_id HAVING COUNT(*) > 20 ORDER BY 2 DESC LIMIT 20;` on staging+prod and quantify how many live threads exhibit the duplication. Decide whether to compact (`RemoveMessage` cleanup) or accept the historical bloat.                                                                                                                                                                                                                                                                                                                              | P2       | Low    | Sizing the loss        |

## Architectural Position: Why R1 Is the Correct Fix

Tau today runs **two parallel sources of truth** for chat history:

1. **Client-side**: `Chat.messages` (in-memory) ↔ IndexedDB ↔ network payload
2. **Server-side**: `langgraph.checkpoints.messages` channel ↔ Postgres `thread_id`

Both are full transcripts. Every request synchronizes them by **stuffing the client store into the server store**, with no inverse direction. The append-only reducer guarantees they diverge.

LangGraph's design assumes one source of truth — the `thread_id`-keyed checkpoint. The transport pattern is _"send the new turn, the graph extends the thread"_. The AI SDK's design assumes the **opposite** — the client owns the transcript; the server is stateless beyond cache. Sticking the two together without a coherent reconciliation strategy is what produced this incident.

R1 picks the LangGraph side. The client retains a local mirror for UI rendering, but that mirror is no longer the wire payload — it's a view onto the checkpoint, hydrated from `/v1/chats/:id` once per session. Cancel becomes "do nothing on the server" (the input write was never committed because nothing was streamed). Retry becomes "resume from the last checkpoint". Cache writes shrink to a per-turn delta because the message tail no longer accordion-expands.

Alternatives considered and rejected:

- **R2 alone**: keeps the dual-store architecture and still pays for full-history retransmission on every turn. Adequate for the dedup symptom but doesn't address cancel-resurrection or wire bandwidth.
- **"Just trim the client store"**: cosmetic; the server state grows independently and the cache prefix erodes regardless.
- **Disable LangGraph checkpointing**: throws away the only mechanism that survives a tab refresh and breaks `resumable-chat-streams` future work.

## Code Examples

### Reproduction: counting state growth per turn

```sql
SELECT cb.version,
       length(cb.blob)                                                AS blob_bytes,
       jsonb_array_length(convert_from(cb.blob, 'UTF8')::jsonb)       AS msg_count,
       (SELECT metadata->>'step' FROM langgraph.checkpoints c
        WHERE c.thread_id = cb.thread_id
          AND c.checkpoint->'channel_versions'->>'messages' = cb.version) AS step
  FROM langgraph.checkpoint_blobs cb
 WHERE cb.thread_id = 'chat_SzunEKDRfSIVrjbRBSLsN'
   AND cb.channel = 'messages'
 ORDER BY (cb.version::int);
```

### Minimum-viable R2 patch (preserves IDs across `toBaseMessages`)

```typescript
// apps/api/app/api/chat/chat.controller.ts (sketch)
import type { BaseMessage } from '@langchain/core/messages';

private async prepareMessages(...): Promise<LangChainMessages> {
  // ...existing code through `toBaseMessages(mergedMessages)`
  const baseMessages = await toBaseMessages(mergedMessages);

  // R2: stamp stable IDs derived from the UIMessage IDs so messagesStateReducer
  // can dedupe across turns instead of minting fresh UUIDs.
  for (let i = 0; i < baseMessages.length && i < mergedMessages.length; i += 1) {
    const stableId = mergedMessages[i]!.id;
    if (stableId) {
      baseMessages[i]!.id = stableId;
      baseMessages[i]!.lc_kwargs.id = stableId;
    }
  }

  return baseMessages;
}
```

This single change would have produced a `messages` channel containing **13 unique messages instead of 42** for the audited session, and the cancelled "universe" message would still be present (because its input write committed first), but a `continue` submission that omits it would dedupe properly without resurrecting it via duplication.

### Architectural R1 sketch (delta-only wire)

```typescript
// apps/ui/app/chat-clients/_internal/shared-chat-transport.ts (sketch)
export const sharedChatTransport = new DefaultChatTransport({
  api: `${ENV.TAU_API_URL}/v1/chat`,
  credentials: 'include',
  prepareSendMessagesRequest: ({ messages, body, id, trigger, messageId }) => ({
    body: {
      ...body,
      id,
      trigger,
      messageId,
      // Send only the trailing user message; the API will resolve the rest
      // against `langgraph.checkpoints[thread_id=id]`.
      newUserMessage: messages.at(-1),
      parentMessageId: messages.at(-2)?.id ?? null,
    },
  }),
});
```

## Diagrams

### State divergence over the audited session

```text
Turn 1 ─────────► Client store: [hi, Hi!]                          (2 msgs)
                  Server state: [hi, Hi!]                          (2 msgs)   ✓

Turn 2 ─────────► Client store: [hi, Hi!, ham?, Ham…]              (4 msgs)
                  Wire: ALL 4 sent (no IDs after conversion)
                  Server state: prev[2] + new[4] = 6 msgs          ✗ already drifting

Turn 6 ─────────► Client store: [hi, Hi!, ..., sun?, The]          (8 msgs)
                  Wire: 8 sent
                  Server state: 32 msgs                            ✗ 4× drift

Turn 7  CANCEL   Client store: rewound to [hi, Hi!, ..., The]      (8 msgs, 'universe' restored to draft)
        ↓        Wire: 9 sent (with 'universe' as last)
                  Server state: 32 + 9 = 41 msgs INCLUDING 'universe'  ✗ ghost message persisted

Turn 8 ─────────► Client store: [..., The, continue]               (9 msgs, no 'universe')
                  Wire: 9 sent
                  Server state: 41 + 9 + 1(stream) = 42 msgs       ✗ both 'universe' and 'continue'
                                                                       visible to model

Result: model sees a context with BOTH 'how old is the sun' (unfinished)
        AND 'how old is the universe' AND 'continue' → answers both.
```

### Cache-write spike on Turn 9

```text
       Turn 1                Turns 2–8                  Turn 9
       ──────                ─────────                  ──────
       180K write            ~0K writes                 180K write
       50K read              225K reads ✓               50K read
       (cold)                (warm)                     (cold again)

                       ↑                          ↑
                   Cache fills              5-min TTL expired
                                            during balance top-up
                                            → Anthropic must re-cache
                                              system prompt + tools
```

## References

- `docs/research/chat-followup-message-swallow.md` — prior investigation into AI-SDK `makeRequest` re-entry; complementary lifecycle bug
- `docs/research/resumable-chat-streams.md` — R3 (server-resumable streams) is the longer-term home for the "Retry after network drop" UX that's currently coupled to full-history retransmission
- `docs/research/gemini-prompt-cache-busting.md` — sibling provider-cache analysis; the 70%-context deferral rule for system reminders originated here
- `docs/research/chat-edit-message-metadata-stripping.md` — adjacent bug class where wire-level metadata loss broke downstream invariants
- `apps/api/app/api/chat/utils/merge-checkpoint-tail.ts` — current (incomplete) reconciliation helper
- `apps/api/app/api/chat/chat.controller.ts:166` — the `agent.graph.stream({ messages })` call site that triggers the appending reducer
- `node_modules/.pnpm/@langchain+langgraph@1.3.0_*/node_modules/@langchain/langgraph/dist/graph/messages_reducer.js:44-78` — `messagesStateReducer` upstream code
- `node_modules/@ai-sdk/langchain/dist/index.mjs:42-100` — `convertUserContent` / `convertAssistantContent` (ID-stripping bug origin)
- `node_modules/.pnpm/ai@6.0.99_*/node_modules/ai/dist/index.mjs:12643-12650` — `DefaultChatTransport.sendMessages` body shape

## Appendix A: Decoded final-state messages (`chat_SzunEKDRfSIVrjbRBSLsN`, version 52)

42 messages total. Slots 0–10 = initial chat. Slots 11–15 = first replay batch. Slots 16–22 = second replay batch. Slots 23–30 = third replay batch (introduces sun question, partial cancel). Slot 31 = ghost universe message. Slots 32–40 = fourth replay batch. Slot 41 = continue answer.

| #      | role     | content (truncated)                                                                            | id                |
| ------ | -------- | ---------------------------------------------------------------------------------------------- | ----------------- |
| 0      | user     | `<system-reminder>…hi`                                                                         | f2603798-…        |
| 1      | ai       | `Hi! What would you like to model?` (chunk)                                                    | msg_01UA2RLhqp7m… |
| 2      | user     | `hi` (replay)                                                                                  | 2c2b15a6-…        |
| 3      | ai       | `Hi! What would you like to model?` (replay)                                                   | 1caf55f1-…        |
| 4      | user     | `<system-reminder>…what's a ham`                                                               | 1145561f-…        |
| 5      | ai       | `Ham is cured pork…` (chunk)                                                                   | msg_01TBDArjxCrb… |
| 6      | user     | `hi` (replay)                                                                                  | ac7fbd05-…        |
| 7      | ai       | `Hi! …` (replay)                                                                               | a23b7aa5-…        |
| 8      | user     | `what's a ham` (replay)                                                                        | b65a01b9-…        |
| 9      | ai       | `Ham is cured pork…` (replay)                                                                  | edc29aec-…        |
| 10     | user     | `<system-reminder>…`                                                                           | fbd6c55e-…        |
| 11–14  | …        | full replay of slots 6–9 with fresh UUIDs                                                      | …                 |
| 15     | user     | `<system-reminder>…`                                                                           | dacdcf16-…        |
| 16–19  | …        | replay batch                                                                                   | …                 |
| 20     | user     | `how does the sun cook ham`                                                                    | 38f43742-…        |
| 21     | ai       | `The sun doesn't really cook ham…`                                                             | aaebabea-…        |
| 22     | user     | `<system-reminder>…`                                                                           | 600c7bc5-…        |
| 23–28  | …        | replay batch                                                                                   | …                 |
| 29     | user     | `how old is the sun`                                                                           | b87bb919-…        |
| 30     | ai       | `The` (partial, cancelled)                                                                     | a4edec19-…        |
| **31** | **user** | **`<system-reminder>…how old is the universe`** (ghost)                                        | **4f7c755c-…**    |
| 32–39  | …        | replay batch including sun question                                                            | …                 |
| 40     | user     | `<system-reminder>…continue`                                                                   | e4ff7ca6-…        |
| 41     | ai       | `The Sun is about 4.6 billion years old…The universe is about 13.8 billion years old…` (chunk) | msg_01PZia8maRco… |

## Appendix B: Entity Audit — `chatId`, `threadId`, `messageId`, `checkpointId`

Follow-up investigation prompted by the question "are we using `threadId` / `messageId` properly, and is `chatId` the same thing as `threadId`?" The audit reconciles Tau's identifiers against the canonical LangGraph and `@langchain/react`/`useStream` model.

### B.1 Identifier inventory

| Identifier (Tau)                                 | Prefix  | Origin                                                                         | Today's wire role                                                     | LangGraph counterpart                                                                 |
| ------------------------------------------------ | ------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `chatId`                                         | `chat_` | Generated UI-side, persisted in IndexedDB + (eventually) Postgres `chat` table | `body.id` on every `POST /v1/chat`; the user-facing chat tab identity | **Is** `configurable.thread_id` — passed verbatim at `chat.controller.ts:145,171,263` |
| `messageId`                                      | `msg_`  | Generated UI-side by `createChatInstance({ generateId })`                      | Element of `body.messages[*].id` (UIMessage layer)                    | **Should be** `BaseMessage.id` — but `toBaseMessages` strips it (see Finding 1)       |
| `runId`                                          | `run_`  | UI-side hint, not on wire                                                      | Unused on the wire today                                              | LangGraph `runId` (one per `stream()` invocation)                                     |
| `requestId`                                      | `req_`  | UI/server log correlation                                                      | Unused on `POST /v1/chat`                                             | n/a                                                                                   |
| _(missing)_ `parentMessageId`/`parentCheckpoint` | —       | —                                                                              | **NOT SENT**                                                          | LangGraph `parent_checkpoint_id` — required for fork-from-prior-checkpoint semantics  |
| _(missing)_ `checkpointId`                       | —       | —                                                                              | **NOT SENT**                                                          | LangGraph `checkpoint_id` (each superstep ≈ one row in `langgraph.checkpoints`)       |

The wire schema `chatTurnRequestSchema` (`libs/chat/src/schemas/chat-turn-request.schema.ts:31`) accepts `{ id, messages, agent }` and nothing else. There is no notion of a "from which point in the conversation" cursor — the API always proceeds at the head of the thread.

### B.2 Is `chatId` the same as `threadId`? Should it be?

**Yes — and yes.** LangGraph defines `thread_id` as the namespace for a persistent conversation: same `thread_id` ⇒ same conversation; different `thread_id` ⇒ independent conversation. Tau's `chatId` carries identical semantics on the UI side: same `chatId` ⇒ same chat tab in the project sidebar ⇒ same persisted history. The 1:1 mapping `thread_id = chatId` at `chat.controller.ts:145` is the **canonical pattern** — see Branching chat docs (LangGraph JS) and the `learnwithparam.com` and `abstractalgorithms.dev` LangGraph thread-model writeups.

Conflating them is **not** the bug. The bug is that Tau treats the thread as an opaque write-only append target rather than as the **stateful source of truth that owns the conversation DAG**.

### B.3 What is a "new thread" in LangGraph, semantically?

A new `thread_id` is a brand-new conversation with **no shared context** to anything else. Cancellation, edit, retry, regenerate, fork — none of these create a new thread. They all stay within the same `thread_id` and either (a) append to the head or (b) fork from a prior checkpoint in the same thread's DAG.

Concretely, from `langchain-ai/langgraphjs/libs/sdk-react/docs/use-stream.md` and the official Branching Chat docs:

```text
thread_id = chat_SzunEKDRfSIVrjbRBSLsN  (one thread, forever)
└── checkpoint C0 (input: "hi")
    └── C1 (loop output: "Hi! What would you like to model?")
        └── C2 (input: "what's a ham")
            └── C3 (loop output: "Ham is cured pork…")
                └── C4 (input: "how does the sun cook ham")
                    └── ...
                        └── C29 (input: "how old is the sun")
                            └── C30 (partial loop output: "The"          ← user cancelled here)
                            ├── C30b (input: "how old is the universe"   ← submitted, cancelled)
                            └── C30c (input: "continue"                  ← SHOULD fork from C30, NOT append after C30b)
```

`C30b` is the cancelled "universe" input; `C30c` is the "continue" submission. In a correctly-modeled fork, `C30b` and `C30c` are **sibling branches** off `C30`. In Tau today, `C30c` is a **child** of `C30b` because the controller invokes the graph at the head of the thread — so the model sees both messages in its context.

### B.4 So is our implementation "deviating from how LangGraph is meant to be used"?

**Yes**, in three load-bearing ways:

| Deviation                       | Tau today                                                                                                                                                  | LangGraph canonical pattern (Branching chat docs / `useStream`)                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source of truth for history** | Client (`Chat.messages` + IndexedDB) is the wire payload; server checkpoint is a parallel store kept consistent only by accident                           | Server checkpoint is the source of truth; client `useStream` hydrates via `agent.getState({thread_id})` and uses `stateSnapshotToUIMessages` to render                                       |
| **Per-turn payload**            | Full message history (`messages: UIMessage[]`) on every `POST`                                                                                             | Single delta `{ messages: [newUserMessage] }`, optionally with `{ checkpoint }` to fork                                                                                                      |
| **Edit / retry / regenerate**   | Client slices its local `Chat.messages` and re-submits the truncated tail; server appends to head of thread                                                | Client calls `stream.submit({ messages: [edited] }, { checkpoint: metadata.firstSeenState.parent_checkpoint })` — explicit fork from the parent checkpoint of the message being edited       |
| **Cancel**                      | Server's input checkpoint stays committed; client UI rewinds (`restoreCancelledDraft`) but next submission still appends after the orphan input checkpoint | Server's input checkpoint stays committed (this is unavoidable per LangGraph Issue #5672); next submission **must** specify `{ checkpoint: parentOfCancelledInput }` to fork past the orphan |

LangGraph's official React adapter `useStream` (`@langchain/react`) was designed to make this trivial. Tau bypasses it entirely in favor of AI SDK's `Chat` + `DefaultChatTransport`. That choice isn't wrong — AI SDK gives us tool-part typing, message streaming UX primitives, and our existing chat-clients architecture — but it left the **checkpoint-aware semantics** unimplemented on our server.

### B.5 Does single-message-only on the wire solve cancel-then-overwrite?

**No — single-message-only is necessary but not sufficient.** The user's question pierces directly to the architectural gap. Let `Cn-1` be the checkpoint before "how old is the universe", `Cn` be the cancelled "universe" input checkpoint, and consider the three candidate server behaviors when the client subsequently submits "continue":

| Approach                        | Wire payload                                        | Server action                                                                                                              | Resulting state                                                                                                              | Ghost universe?                                                       | Cache-friendly?                    |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| **A. Current Tau**              | Full UIMessage history minus universe               | `agent.graph.stream({ messages: allReplayedMessages })` appends to head `Cn`                                               | `[hi, Hi!, …, sun, "The", universe (in state), …replay…, continue]` (42 msgs, 13 unique)                                     | ✗ universe stays at slot 31                                           | ✗ prefix erodes every turn         |
| **B. Delta-only at head**       | `{ messages: [continueMessage] }` (no checkpoint)   | Append the single delta to head `Cn`                                                                                       | `[hi, Hi!, …, sun, "The", universe (in state), continue]` (8 msgs unique)                                                    | ✗ universe still at slot 6 — Cn was the cancelled-universe checkpoint | ✓ much smaller prompt              |
| **C. Delta + fork-from-parent** | `{ messages: [continueMessage], checkpoint: Cn-1 }` | Server calls `checkpointer.put(...)` to fork at `Cn-1`, then `agent.graph.stream(...)` appends the delta in the new branch | `[hi, Hi!, …, sun, "The", continue]` (7 msgs unique on the active branch; universe preserved as a sibling branch off `Cn-1`) | ✓ no ghost                                                            | ✓ smaller prompt and stable prefix |

**Approach B alone (the "send only one message" hand-wave) does not fix the ghost-message bug.** It fixes the cost spike and the duplication, but the cancelled universe message lives in the thread state forever, and any future "continue" or "let me come back to this later" submission will hit it again.

**Approach C is the architecturally complete fix.** The minimum data the client must send to enable it is a **parent-message cursor** (or equivalently a `parent_checkpoint_id`) so the server can locate the fork point. The LangGraph JS SDK exposes the cursor as `metadata.firstSeenState.parent_checkpoint` per the official Branching chat docs.

### B.6 Refined recommendations

The R1–R7 list in the main body still holds, but is now sequenced by the entity-correctness axis. R-numbers preserved for traceability; new items appended.

| #         | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Priority | Effort          | Eliminates                                             |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------- | ------------------------------------------------------ |
| R2        | **Round-trip message IDs through `toBaseMessages`.** Stamp `BaseMessage.id` / `lc_kwargs.id` from `UIMessage.id` after `toBaseMessages` returns. Fixes `messagesStateReducer` dedup so accidental replays stop bloating state.                                                                                                                                                                                                                                                                                                                                                                     | P0       | Low (≤10 lines) | Finding 1 only                                         |
| R8 (new)  | **Adopt the delta-only wire contract.** Override `DefaultChatTransport.prepareSendMessagesRequest` to send `{ id: chatId, newUserMessage: messages.at(-1), parentMessageId: messages.at(-2)?.id ?? null, agent }`. Update `chatTurnRequestSchema` accordingly. API resolves the parent message → its trailing `checkpoint_id` via `checkpointer.getTuple({ thread_id: chatId })` for round-tripping.                                                                                                                                                                                               | P0       | Med             | Findings 4 + 5, half of Finding 2                      |
| R9 (new)  | **Fork on cancel-then-resubmit and on edit/retry.** When the wire request's `parentMessageId` is not the trailing message in the thread head (i.e., there are committed input/output writes after it), the API forks at the parent checkpoint instead of appending. Implementation: `checkpointer.put` a new checkpoint whose `parent_checkpoint_id` is the parent-message checkpoint, then `agent.graph.stream(...)` with that fork's config. The orphaned cancelled-universe checkpoint becomes a sibling branch — preserved (for time-travel UI) but invisible to the active conversation.      | P0       | High            | Finding 2 (ghost message) entirely                     |
| R10 (new) | **Track branch IDs server-side per chat.** Add a `branchId` column to the `chat` table (or a small `chat_branch` table) so the active branch survives reload. Default branch = root of the thread DAG; cancel-then-edit creates a new branch and updates the chat's active pointer.                                                                                                                                                                                                                                                                                                                | P1       | Med             | Multi-session consistency                              |
| R11 (new) | **Hydrate via `stateSnapshotToUIMessages` instead of from IndexedDB.** Once the server is the authoritative source, the client should hydrate `Chat.messages` from `GET /v1/chats/:id/state` (returning `stateSnapshotToUIMessages(agent.getState(threadId))`) on chat open, and treat IndexedDB as an offline-only cache. Closes the divergence loop that produced this bug in the first place. The Vercel AI SDK PR #12703 lands these conversion utilities directly in `@ai-sdk/langchain` — pin to the merged version when available, otherwise patch-package as #12703 maintainer recommends. | P1       | Med             | Class of "client and server transcripts disagree" bugs |
| R12 (new) | **Use `RemoveMessage` as a defense-in-depth pass before each turn.** Before invoking the graph at thread head, scan the head's `messages` channel for orphan `HumanMessage`s with no following `AIMessage` and no incoming run, and emit `RemoveMessage(id)` in the same input write. This catches any state where the fork logic misses (e.g., legacy threads from before R9 ships). Caveat: GitHub Issue #5112 reports `RemoveMessage` does not always remove via `update_state`; use it on the input-write path where the reducer runs synchronously.                                           | P2       | Low             | Backstop for R9                                        |
| R13 (new) | **Consider migrating directly to `@langchain/react`'s `useStream`.** Long-term, the native LangGraph React adapter ships branching chat, optimistic updates, checkpoint cursors, and resumable streams as first-class features. Tau's current `useChat` / chat-clients layer would need to be rewritten against `useStream`'s state shape, but every concern raised in this document becomes upstream-owned. Treat this as an option for a future major refactor; R8–R11 are the incremental path.                                                                                                 | P3       | Very high       | Strategic — owns the divergence permanently            |

### B.7 Operational note on cancellation behavior in LangGraph (cross-checked upstream)

Per LangGraph GitHub Issue [#5672](https://github.com/langchain-ai/langgraph/issues/5672) ("Run Cancellation Causes Loss of Streamed State Not Yet Persisted as a Checkpoint"):

> Checkpointing only happens at full run/task completion, not on cancel/abort events. There is no mechanism to flush/persist to checkpoint right now on cancellation. Cancelled runs always discard the difference between the last checkpointed state and what was streamed to the client.

So cancellation in LangGraph by design **cannot rewind** the input checkpoint write. The only correct way to model "the cancelled message should not be in the conversation" is to **fork from the checkpoint before the cancelled input**. This validates R9 as the upstream-recommended pattern. The fact that LangGraph leaves the orphan input checkpoint behind is not a bug — it's the substrate that makes time-travel and branching debugging possible.

Tau's symptom is solely the consequence of (a) treating the thread head as the only valid write point, and (b) re-sending the full client transcript so the orphan input is invisibly "skipped over" by a replay rather than by an explicit fork. The fix is the explicit fork, not a rollback.

### B.8 Cross-references for the canonical pattern

- **Branching chat (JS)** — official user-facing pattern with `useStream` + `fetchStateHistory: true`, `metadata.firstSeenState.parent_checkpoint`, and `stream.submit({ messages: [...] }, { checkpoint })`: <https://docs.langchain.com/oss/javascript/langchain/frontend/branching-chat>
- **Time travel** — `update_state()` to fork, `get_state_history()` to find checkpoints, replay vs fork semantics: <https://docs.langchain.com/oss/javascript/langgraph/use-time-travel>
- **Persistence concepts** — thread_id as conversation namespace, add_messages reducer, checkpointer contract: <https://docs.langchain.com/oss/python/langgraph/persistence>
- **AI-SDK `@ai-sdk/langchain` reverse adapters** (PR #12703, file parts caveat, stable IDs from message metadata): <https://github.com/vercel/ai/pull/12703>
- **`useStream` API reference** (`submit`, `setBranch`, `getMessagesMetadata`): <https://github.com/langchain-ai/langgraphjs/blob/main/libs/sdk-react/docs/use-stream.md>
- **Cancellation gap (Issue #5672)**: <https://github.com/langchain-ai/langgraph/issues/5672>
- **Regenerate trailing-AI strip (PR #6636 / Issue #6618)**: <https://github.com/langchain-ai/langgraph/pull/6636>
- **RemoveMessage edge cases (Issue #5112)**: <https://github.com/langchain-ai/langgraph/issues/5112>
- **Edit with preserved ID breaks branch switcher (Issue #3414)**: <https://github.com/langchain-ai/docs/issues/3414>
- **`update_state` over historical checkpoints aggregates with later state (Issue #1333)**: <https://github.com/langchain-ai/langchain-google/issues/1333>
- **`useStream` regen broken for multi-turn (Issue #2306)**: <https://github.com/langchain-ai/langgraphjs/issues/2306>

### B.9 Concrete sketch — the controller after R8 + R9

```typescript
// apps/api/app/api/chat/chat.controller.ts (sketch — illustrative)

@Post()
public async createChat(@Body() body: ChatTurnRequest, @Res() response: FastifyReply): Promise<void> {
  const { id: chatId, newUserMessage, parentMessageId, agent } = body;

  const checkpointer = this.checkpointerService.getCheckpointer();
  const baseConfig = { configurable: { thread_id: chatId } };

  // 1. Locate the parent checkpoint for the requested fork point. If
  //    `parentMessageId` matches the current head's trailing message ID,
  //    this is a plain append; otherwise this is a fork from history.
  const head = await checkpointer.getTuple(baseConfig);
  const forkConfig = parentMessageId
    ? await resolveForkConfig(checkpointer, chatId, parentMessageId, head)
    : baseConfig;

  // 2. Stamp the wire `messageId` onto the LangChain HumanMessage so the
  //    reducer can dedupe across retries (R2).
  const human = new HumanMessage({ content: extractText(newUserMessage) });
  human.id = newUserMessage.id;
  human.lc_kwargs.id = newUserMessage.id;

  // 3. Invoke the graph at the fork's config. LangGraph treats forkConfig as
  //    the "now" point and writes the new input checkpoint as a child of
  //    forkConfig's checkpoint_id, creating a sibling branch when the
  //    forkConfig points behind the head.
  const stream = await agent.graph.stream({ messages: [human] }, {
    ...forkConfig,
    streamMode: ['values', 'messages', 'custom'],
    // ...
  });

  // ... pipe to SSE as today
}

async function resolveForkConfig(
  checkpointer: BaseCheckpointSaver,
  threadId: string,
  parentMessageId: string,
  head: CheckpointTuple,
): Promise<{ configurable: { thread_id: string; checkpoint_id?: string } }> {
  const tailMessages = head.checkpoint.channel_values?.messages ?? [];
  const tailLastId = tailMessages.at(-1)?.id;
  if (tailLastId === parentMessageId) {
    // Append at head; no fork needed.
    return { configurable: { thread_id: threadId } };
  }
  // Walk checkpoint history backwards to find the checkpoint whose
  // `messages` channel last had `parentMessageId` as the trailing message.
  for await (const tuple of checkpointer.list({ configurable: { thread_id: threadId } })) {
    const msgs = tuple.checkpoint.channel_values?.messages ?? [];
    if (msgs.at(-1)?.id === parentMessageId) {
      return {
        configurable: {
          thread_id: threadId,
          checkpoint_id: tuple.config.configurable!.checkpoint_id,
        },
      };
    }
  }
  // Parent not found — defensively append at head and emit a metric.
  return { configurable: { thread_id: threadId } };
}
```

Two things to note about the sketch:

1. The **input write itself** is what produces the fork. LangGraph writes a child checkpoint of `forkConfig.configurable.checkpoint_id`; no explicit `update_state` call is needed. This sidesteps Issue #1333 (`update_state` over historical checkpoints aggregates with later state).
2. The **client cursor** is `parentMessageId`, not `parent_checkpoint_id`. The server resolves message → checkpoint via a history walk. This keeps the wire schema oblivious to LangGraph internals (the client never sees checkpoint UUIDs); it also lets the cursor survive checkpoint-schema migrations.

### B.10 Verdict

`chatId == thread_id` is correct and should stay. The implementation gap is that:

1. We strip `messageId` from `BaseMessage.id` (R2).
2. We never expose a `parentMessageId` or `checkpoint_id` cursor on the wire (R8).
3. We always invoke at thread head (R9).

Fixing #1 alone stops accidental quadratic state growth from retries and ID-less replays. Fixing #1+#2+#3 makes cancellation safe, makes edits architecturally consistent with LangGraph's intended model, and shrinks per-turn cache writes to a true delta. The investment is meaningful (R8 and R9 together are ~1–2 weeks of focused work) but the bug class disappears permanently and brings Tau onto the same conceptual rails as `useStream`'s branching chat. Without it, every retry/edit/cancel will keep producing variants of this incident class indefinitely.

## Appendix D: Cost Forensics Re-Audit — The Keychain Session

**Updated:** 2026-05-20 — replaces the TTL-expiry hypothesis in Finding #3 with a direct mechanical explanation. The simple sun/ham chat (`chat_SzunEKDRfSIVrjbRBSLsN`) used in the original audit was the **wrong session** for the cost question; the user's $6.32 / $3.24 cost evidence comes from a different thread, `chat_gUow7ccbHoTjUt3mOQwet` (the "QR Code Keychain" CAD session matching `qr_code_keychain_2026-05-20T02-03.md`). This appendix re-audits the correct thread.

### D.1 Thread Timing — TTL Cannot Explain the Spike

Five user inputs over **13 minutes 12 seconds**:

| Step | Source     | Timestamp (UTC) | Gap from prior input                                        |
| ---- | ---------- | --------------- | ----------------------------------------------------------- |
| -1   | input      | 23:35:09        | — (T1: "find a suitable qrcode library …")                  |
| 198  | input      | 23:38:44        | **3m 35s** (T2: "find and fix the perf issue now …")        |
| 290  | input      | 23:43:47        | **5m 03s** (T3: image + prompt)                             |
| 328  | input      | 23:45:12        | **1m 25s** (T4)                                             |
| 342  | input      | 23:46:08        | **0m 56s** (T5: "see img, it's off, fix it" + 282 KB image) |
| 426  | (loop end) | 23:48:21        | T5 completed                                                |

The "fix it" turn began **56 seconds** after the previous input — comfortably inside Anthropic's 5-minute ephemeral cache TTL. **TTL expiry is not the cause of the $3.24 spike.** The user was right to push back on the original Finding #3.

### D.2 The Real Mechanism — Quadratic State Growth per Input Step

The `messages` channel blob grew quadratically across the 5 user turns:

| Step | Turn                    | Total msgs | HumanMessage | AIMessage(+Chunk) | ToolMessage | Blob bytes    |
| ---- | ----------------------- | ---------- | ------------ | ----------------- | ----------- | ------------- |
| 198  | T1 done                 | 47         | 4            | 22                | 21          | 273 954       |
| 290  | T2 done                 | 112        | 6            | 54                | 52          | 693 152       |
| 328  | T3 done                 | 185        | 9            | 90                | 86          | 1 169 546     |
| 342  | **T5 input ("fix it")** | **261**    | **13**       | **127**           | **121**     | **1 918 326** |

Between T3 done (step 328) and T5 input (step 342), **76 new messages were appended to state in a single input write** — before any model invocation occurred for that turn. The first 185 messages are **bit-identical** across both checkpoints (verified by `id` comparison), so the reducer correctly preserves prior state. The 76 extras come from the inbound request payload being re-injected wholesale.

### D.3 Anatomy of the 76 Extras

The injection breakdown at the T5 input step is:

- **Position 185:** `HumanMessage` with 337 bytes — a **duplicate of T1's "qrcode library" prompt** (4th copy of the same user text, IDs `192aefbb` / `8e858605` / `58fd5530` / `eea48647`)
- **Positions 186–197:** ~12 alternating `AIMessage` + `ToolMessage` entries — **re-injection of T1's assistant streaming + tool outputs** (e.g. `c8e82c13` is a 7106-byte ToolMessage matching a `read_file` result that already exists earlier in state)
- **Position 198+:** more re-injections of T2, T3, T4 assistant/tool history
- **Plus 4 new HumanMessages tied to this turn:** dup-of-"perf issue" (68 B), dup-of-T3-image (50 KB), and the new "fix it" image (282 KB structured `image_url` content block)

The duplicates have **fresh UUIDs** because `toBaseMessages` strips client `msg_…` IDs (see Finding #1), so `messagesStateReducer` cannot dedupe — it pushes every inbound message onto state.

```
Initial user message ("find a suitable qrcode library…"):
  192aefbb-…  (970 B with system-reminder)     ← T1 original
  8e858605-…  (337 B)                          ← T2 dup #1
  58fd5530-…  (337 B)                          ← T3 dup #2
  eea48647-…  (337 B)                          ← T5 dup #3  (4 copies total)

"find and fix the perf issue":
  2ae77373-…  (854 B with system-reminder)     ← T2 original
  6e87dc96-…  (68 B)                           ← T3 dup #1
  a55fefe2-…  (68 B)                           ← T5 dup #2  (3 copies total)

Image messages:
  1b2136c6-…  (51 213 B image_url)             ← T3 original
  9a96bc03-…  (50 351 B image_url)             ← T5 dup
  4fad9a43-…  (282 522 B image_url)            ← T5 new "fix it" image
```

Tool-result re-injection happens for the same reason: every assistant UI part with `state: 'output-available'` re-expands into a fresh `ToolMessage` via `toBaseMessages` and is appended with a new UUID.

### D.4 The $3.24 Decomposition

With Anthropic Claude Opus 4.7 pricing ($15/M input, $18.75/M cache write 5-min ephemeral, $1.50/M cache read, $75/M output) and Tau's `createPromptCachingMiddleware` setting `cache_control: ephemeral` on the last message of every call:

| Component                                                            | Tokens (est.) | Rate     | Cost       |
| -------------------------------------------------------------------- | ------------- | -------- | ---------- |
| Cache READ (positions 0–184 stable prefix)                           | ~140 K        | $1.50/M  | ~$0.21     |
| Cache WRITE (76 newly-injected messages at the tail)                 | ~90 K         | $18.75/M | ~$1.69     |
| Output tokens (T5 assistant response: thinking + tool calls + edits) | ~20 K         | $75/M    | ~$1.50     |
| **Total**                                                            |               |          | **~$3.40** |

Matches the billed $3.24 within rounding (image-token accounting and exact output length vary by ±5%).

**The $3.24 cost is not double-billing.** It is the structurally-correct Anthropic price for **submitting 76 messages of duplicated past content as fresh cache-write input on top of a stable cached prefix**, plus the output tokens for a substantive multi-tool-call assistant response. The cache mechanism _did_ hit the 0–184 prefix; the explosion is in the 185–260 window because that window grows with every user turn.

This also explains the earlier $0.12 turns: their _delta_ over the previous turn was small (a single user line + a small system reminder), so the new cache-write window was only a few thousand tokens (~$0.05 cache write + ~$0.05 cache read + ~$0.02 output). The cost-per-turn is roughly **proportional to the size of the client-side UI history at submission time**, not to the length of the user's new prompt. A 1-line "fix it" message after 4 prior tool-heavy turns is 20–40× more expensive than the same "fix it" message at turn 2.

### D.5 Corrected Cost Curve

Plotting the per-turn injection size across the 5 turns:

| Turn          | New msgs injected at input                  | New blob bytes | Implied cache write cost |
| ------------- | ------------------------------------------- | -------------- | ------------------------ |
| T1            | 1                                           | ~1 KB          | ~$0.00 (cold start)      |
| T2            | 25 (1 user + 23 tool/AI history + 1 user)   | ~22 KB         | ~$0.10                   |
| T3            | 40 (image + dups + tool history)            | ~470 KB        | ~$1.10                   |
| T4            | ~14 (small follow-up)                       | ~470 KB        | ~$1.10                   |
| T5 ("fix it") | 76 (full prior tool history + image + dups) | ~750 KB        | ~$1.70                   |

The growth is **super-linear** because each turn the client's UI history contains more assistant turns, and each assistant turn expands into N+1 BaseMessages via `toBaseMessages`. The keychain session's high tool-call density (avg 18 tool calls per assistant turn) amplifies the effect dramatically vs the sun/ham chat used in the original audit.

### D.6 Revised Severity & Confidence

This appendix **promotes the cost issue from "amplification by TTL+duplication" to "first-order pricing of explicit history re-injection at every input step"**. Confidence is _high_ — the mechanism is observable bit-for-bit in `langgraph.checkpoint_blobs`:

- ✅ Prior-turn prefix is preserved unchanged in state.
- ✅ New duplicates of past user/assistant/tool messages are observable at fresh UUIDs at positions ≥185.
- ✅ Anthropic's cache middleware can only cache the _prior_ tail, not the freshly-injected duplicates — so they are charged at cache-write rates by construction.
- ✅ No 5-minute TTL gap exists between any of the turns.

### D.7 Implications for the Recommendations

R1 (delta-only wire) and R2 (round-trip message IDs) both directly resolve this. R1 is strictly stronger: if the wire payload is `{ parentMessageId, newMessage }` only, the API never re-injects history at all and the input-step blob delta drops to a single user message per turn. R2 alone (preserve IDs without changing the wire) would let LangGraph's reducer **dedupe** the re-injected messages against existing state — but the dedupe path in `messagesStateReducer` only replaces the matched message, it does not remove the duplicate work of serializing/transmitting/parsing the entire history every turn.

The right end-state is R1 + R2 together: tiny wire payloads, ID-stable state, and cache writes that scale with the _new_ assistant turn only, not with conversation length.

### D.8 Quick verification queries

```sql
-- Confirm state growth across input steps for any thread
SELECT c.metadata->>'step' AS step,
       c.checkpoint->>'ts'  AS ts,
       length(cb.blob)      AS msg_blob_bytes,
       jsonb_array_length(convert_from(cb.blob,'UTF8')::jsonb) AS msg_count
FROM   langgraph.checkpoints c
JOIN   langgraph.checkpoint_blobs cb
       ON cb.thread_id = c.thread_id
WHERE  c.thread_id = '<thread_id>'
  AND  c.metadata->>'source' = 'input'
  AND  cb.channel = 'messages'
  AND  cb.version = (c.checkpoint->'channel_versions'->>'messages')
ORDER  BY (c.metadata->>'step')::int;

-- Count duplicated HumanMessage content within a single checkpoint
WITH msgs AS (
  SELECT jsonb_array_elements(convert_from(blob,'UTF8')::jsonb) AS m
  FROM   langgraph.checkpoint_blobs
  WHERE  thread_id = '<thread_id>'
    AND  channel = 'messages'
    AND  version = '<version>'
)
SELECT substring(m->'kwargs'->>'content' for 80) AS preview,
       count(*) AS copies
FROM   msgs
WHERE  m->'id' ->> -1 = 'HumanMessage'
GROUP  BY preview
HAVING count(*) > 1
ORDER  BY copies DESC;
```

## Appendix C: Useful psql one-liners

```bash
# List all input checkpoints for a thread
docker exec tau-postgres psql -U dev_user -d tau_dev -c "
  SELECT checkpoint_id, metadata->>'step' AS step
  FROM langgraph.checkpoints
  WHERE thread_id = '<chat_id>'
    AND metadata->>'source' = 'input'
  ORDER BY (metadata->>'step')::int;"

# Dump the messages channel at a specific version
docker exec tau-postgres psql -U dev_user -d tau_dev -tA -c "
  SELECT convert_from(blob, 'UTF8')
  FROM langgraph.checkpoint_blobs
  WHERE thread_id = '<chat_id>'
    AND channel = 'messages'
    AND version = '<version>';"

# Find threads with suspected duplication (state much larger than turn count)
docker exec tau-postgres psql -U dev_user -d tau_dev -c "
  SELECT thread_id,
         MAX(length(blob)) AS max_msg_blob_bytes,
         MAX((SELECT jsonb_array_length(convert_from(b.blob, 'UTF8')::jsonb)
              FROM langgraph.checkpoint_blobs b
              WHERE b.thread_id = cb.thread_id
                AND b.channel = 'messages'
                AND b.version = cb.version)) AS max_msg_count
  FROM langgraph.checkpoint_blobs cb
  WHERE cb.channel = 'messages'
  GROUP BY thread_id
  HAVING MAX(length(blob)) > 10000
  ORDER BY max_msg_blob_bytes DESC
  LIMIT 20;"
```
