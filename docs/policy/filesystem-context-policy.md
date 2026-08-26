---
title: 'Filesystem Context Policy'
description: 'Rules for the filesystem-backed context management pipeline: transcripts, tool offloading, skills, memory, compaction, and middleware ordering.'
status: active
created: '2026-03-24'
updated: '2026-07-10'
related:
  - docs/policy/context-engineering-policy.md
  - docs/research/transcript-search-architecture.md
  - docs/research/harness-cache-hygiene-audit.md
---

# Filesystem Context Policy

Internal reference for building and maintaining Tau's filesystem-backed context management pipeline.

## Rationale

Tau implements dynamic context discovery (see `docs/policy/context-engineering-policy.md`, Part 6) through middleware that persists agent state to `.tau/` in the project filesystem. All context — transcripts, tool outputs, skills, memory — lives in files the agent already knows how to read and search. This policy codifies the schema, ordering, and extension rules so the pipeline stays consistent as features are added.

## Rules

### 1. Unified Append-Only Transcripts

Store all conversation events in a single append-only JSONL file per chat session at `.tau/transcripts/{chatId}.jsonl`.

**Why**: A unified, append-only file enables grep-based recall without loading full history into context. Separate files or overwrite semantics lose prior data.

#### JSONL Schema

Every line has a top-level `role` field for fast filtering (`rg '"role":"user"'`):

| Role                   | Fields                                                                                                                 | Content                                  |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `user`                 | `role, content, timestamp`                                                                                             | Full user message text                   |
| `assistant`            | `role, content, timestamp`                                                                                             | Full assistant text response             |
| `assistant` (thinking) | `role, type, content, timestamp`                                                                                       | Thinking block text (`type: "thinking"`) |
| `tool`                 | `role, toolName, toolCallId, contentLength, timestamp`                                                                 | Metadata only — no full output           |
| `compaction`           | `role, compactionId, status, triggerReason, messagesEvicted, tokensBeforeCompaction, tokensAfterCompaction, timestamp` | Compaction event marker                  |

#### Content Block Rules

When an AI message contains structured content blocks (thinking + text + tool_use):

- **Split into separate lines**: Each thinking and text block becomes its own JSONL line
- **Drop signatures**: Opaque binary data, not greppable, wastes storage
- **Drop index fields**: Positional metadata, not useful for search
- **Skip tool_use blocks**: Captured separately by `wrapToolCall` as `role: "tool"` lines

CORRECT:

```jsonl
{"role":"assistant","type":"thinking","content":"The user wants a cube with 20mm sides.","timestamp":"..."}
{"role":"assistant","content":"I'll create a cube for you using OpenSCAD.","timestamp":"..."}
```

INCORRECT:

```jsonl
{
  "role": "assistant",
  "content": "[{\"type\":\"thinking\",\"thinking\":\"...\",\"signature\":\"Et0BCkY...\"}]"
}
```

### 2. Adding Transcript Event Types

When adding a new event type to the transcript:

1. Add a new `role` value or use an existing role with a distinguishing `type` field
2. Include only fields useful for agent grep — no opaque data, no full tool output
3. Always include `timestamp`
4. Append via `appendTranscriptLine()` — fire-and-forget, never blocks the agent loop
5. Update the JSONL schema table in Rule 1
6. Add tests in `transcript.middleware.test.ts`

### 3. Transcript Search Prompt

The system prompt includes a `<transcript_search>` section (`cad-agent.prompt.ts`) that teaches the agent grep-first retrieval. When modifying this section:

- Keep under 10 lines — the agent already knows `grep` and `read_file`
- Mention the path pattern (`.tau/transcripts/{chatId}.jsonl`)
- Emphasize grep-first, windowed reads — never linear scanning
- List available `role` values so the agent can filter effectively

### 4. Tool Result Offloading

Large tool results are written to `.tau/tool-results/<chatId>/<toolCallId>.{json,txt}` via the tool offloading middleware, then replaced in-context with a generic `<persisted-output>` envelope that preserves the head of the original payload.

**Why**: A 50KB tool result in-context wastes tokens on every subsequent model call. Written to a file, it costs zero tokens until needed.

Never increase the offloading threshold without measuring the impact on context window utilization.

### 5. Skills and Memory via Filesystem

| Feature       | Source                                                       | Middleware                      | Loading                                                              |
| ------------- | ------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------- |
| Skills        | `.agents/skills/` (client-assembled catalog)                 | `createClientContextMiddleware` | Metadata block on the system channel; body on `use_skill` activation |
| Memory        | Client-assembled AGENTS.md payload (`contextPayload.memory`) | `createClientContextMiddleware` | HumanMessage on the message channel, per request                     |
| Recent skills | LangGraph store, per-chat namespace                          | `createRecentSkillsMiddleware`  | Fingerprint-reconciled; content restored after compaction            |

Do not add static skill or memory content to the system prompt. Let the middleware load it from the client payload / filesystem so users can edit, version, and customize it.

### 6. Context Compaction Pipeline

Compaction fires when estimated token count exceeds 85% of the model's context window:

1. **Truncate tool args** in old messages (lightweight, no API call)
2. **Proactive compaction** via native Morph Compact (evict + compact older messages)
3. **Emergency re-compaction** on `ContextOverflowError` (calibrates estimation multiplier)

When compaction fires:

- Evicted messages are rendered into a provider-neutral compaction transcript and **appended** (not overwritten) to the unified transcript file
- A `role: "compaction"` marker event is appended to the transcript
- A `data-context-compaction` SSE event is emitted to the UI
- The model call proceeds only after Morph returns a valid compacted `output`, the transcript commit succeeds, and the in-memory graph is rewritten to compacted history plus recent complete turns

All compaction writes use `append`, never `write` (overwrite). Overwrite semantics lose prior transcript data.

Required compaction is fail-closed. Once Tau determines that the provider-visible request must be compacted, Morph transport errors, Morph HTTP errors, invalid Morph response shape, empty compacted output, transcript commit failure, state rewrite failure, or any Tau-authored compaction pipeline invariant failure MUST throw a typed pre-provider error such as `CONTEXT_COMPACTION_FAILED`. Tau MUST NOT continue with the same unreduced history, a tail-only request, or a partial `AIMessage` reconstruction as an implicit fallback.

The compaction transcript renderer is provider-neutral. It preserves user-visible text, tool-call boundaries, tool-result boundaries, file references, and test outcomes, but excludes opaque provider signatures and raw provider reasoning by default. A compacted seed may replace whole old turn clusters; middleware must not partially reconstruct a native provider turn without all provider-required signatures, IDs, and replay metadata.

### 7. Middleware Ordering

The middleware chain order in `chat.service.ts` is load-bearing (earlier entries wrap outer and mutate the effective request first):

```
1. Tool metrics + error handling + input compat   (observe tool calls)
2. Tool offloading → result budget → trimmer      (reduce results before budgeting)
3. Token-usage context + agent safeguards         (reminders counted by compaction)
4. Interrupt recovery + message sanitization      (clean content)
5. Client context (skills + memory) + recent skills
6. Prompt caching (modelSettings cache_control)
7. Compaction                                      (sees the final effective request)
8. Cross-provider content normalizer               (after compaction rebuilds AIMessages)
9. Logging + observability
10. Transcript                                     (captures final events)
```

**Why**: every middleware that mutates the effective ModelRequest (result trimming, reminders, skills/memory injection, cache settings) runs **before** compaction so the budget decision evaluates exactly the payload the provider would receive; the normalizer runs **after** compaction because LangChain rebuilds AIMessages when rewriting history; transcript runs last to capture the final state of each turn. See `docs/research/harness-cache-hygiene-audit.md` for the durability semantics of each mutation channel (`wrapToolCall` = durable, `wrapModelCall` = ephemeral, `Command` update = durable rewrite) — pick the channel to match the intended durability.

### 8. Most Context Writes Are Non-Blocking

Routine transcript and offloading writes use fire-and-forget (`void promise`). Context persistence must not block the agent loop when it is an observability or recall enhancement.

**Why**: A filesystem or RPC failure during write should not prevent the agent from responding. Transcript loss is acceptable; agent hang is not.

Required compaction commits are the exception. When compaction is the gate that makes a provider request valid and small enough to send, the transcript append and state rewrite are part of the request contract. Failure blocks provider dispatch and is surfaced noisily instead of being hidden behind a degraded continuation.

## Anti-Patterns

### 1. Overwrite Semantics for Persistent Context

- INCORRECT: `backend.write(path, content)` for transcript data (destroys prior history)
- CORRECT: `backend.append(path, content)` or `appendTranscriptLine()` (preserves all data)

### 2. Opaque Data in Transcripts

- INCORRECT: Storing `signature`, binary hashes, or full serialized content block arrays
- CORRECT: Store only human-readable, greppable text per line

### 3. Duplicating Tool Results

- INCORRECT: Recording full tool output in both `wrapToolCall` and `afterModel`
- CORRECT: `wrapToolCall` stores metadata (`role: "tool"`); `afterModel` stores assistant text only

### 4. Blocking Writes

- INCORRECT: `await appendTranscriptLine(...)` in the middleware hot path
- CORRECT: `void appendTranscriptLine(...)` — fire-and-forget for ordinary transcript capture
- EXCEPTION: required compaction transcript commits are awaited and fail closed before provider dispatch

### 5. Implicit Compaction Fallbacks

- INCORRECT: On required compaction failure, sending truncated old messages, tail-only history, or partially cloned tool-call turns to the provider
- CORRECT: Throw a typed pre-provider compaction or replay-metadata error with structured diagnostics

### 6. Static Injection of Dynamic Context

- INCORRECT: Hardcoding skill content or memory in the system prompt string
- CORRECT: Let `createSkillsMiddleware` / `createMemoryMiddleware` load from filesystem

## Summary Checklist

When adding or modifying filesystem-based context:

- [ ] Data is greppable by the agent (full text, no opaque binary)
- [ ] No duplication with another middleware hook
- [ ] Uses append-only semantics (not overwrite)
- [ ] Writes are fire-and-forget (void the promise), except required compaction commits that gate provider dispatch
- [ ] `timestamp` is included on every JSONL line
- [ ] Schema table in Rule 1 is updated for new event types
- [ ] Tests added in the corresponding middleware test file
- [ ] Middleware ordering in `chat.service.ts` is preserved

## References

- Related: `docs/policy/context-engineering-policy.md`
- Research: `docs/research/transcript-search-architecture.md`
