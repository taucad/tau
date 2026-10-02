---
title: 'Filesystem Context Policy'
description: 'Rules for the filesystem-backed context management pipeline: transcripts, tool offloading, skills, memory, compaction, and middleware ordering.'
status: active
created: '2026-03-24'
updated: '2026-05-12'
related:
  - docs/policy/context-engineering-policy.md
  - docs/research/transcript-search-architecture.md
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

| Role                   | Fields                                                                            | Content                                  |
| ---------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| `user`                 | `role, content, timestamp`                                                        | Full user message text                   |
| `assistant`            | `role, content, timestamp`                                                        | Full assistant text response             |
| `assistant` (thinking) | `role, type, content, timestamp`                                                  | Thinking block text (`type: "thinking"`) |
| `tool`                 | `role, toolName, toolCallId, contentLength, timestamp`                            | Metadata only — no full output           |
| `compaction`           | `role, messagesEvicted, tokensBeforeCompaction, tokensAfterCompaction, timestamp` | Compaction event marker                  |

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

| Feature | Path             | Middleware               | Loading                        |
| ------- | ---------------- | ------------------------ | ------------------------------ |
| Skills  | `.tau/skills/`   | `createSkillsMiddleware` | Per-invocation from filesystem |
| Memory  | `.tau/AGENTS.md` | `createMemoryMiddleware` | Per-invocation from filesystem |

Do not add static skill or memory content to the system prompt. Let the middleware load it from files so users can edit, version, and customize it.

### 6. Context Compaction Pipeline

Compaction fires when estimated token count exceeds 85% of the model's context window:

1. **Truncate tool args** in old messages (lightweight, no API call)
2. **Proactive compaction** via summarization service (evict + summarize older messages)
3. **Emergency re-compaction** on `ContextOverflowError` (calibrates estimation multiplier)

When compaction fires:

- Evicted messages are **appended** (not overwritten) to the unified transcript file
- A `role: "compaction"` marker event is appended to the transcript
- A `data-context-compaction` SSE event is emitted to the UI
- The model call proceeds with compacted messages — the stream is never interrupted

All compaction writes use `append`, never `write` (overwrite). Overwrite semantics lose prior transcript data.

### 7. Middleware Ordering

The middleware chain order in `chat.service.ts` is load-bearing:

```
1. Tool metrics + error handling     (observe tool calls)
2. Tool offloading + result trimmer  (reduce context before compaction)
3. Compaction                        (compress if needed)
4. Message sanitization              (clean content)
5. Prompt caching                    (must follow compaction)
6. Logging + observability           (observe final state)
7. Transcript                        (capture final events)
8. Skills + memory                   (load from filesystem)
```

**Why**: Transcript middleware must run after compaction and observability — it captures the final state of each model turn. Moving it earlier would miss compaction events or record pre-sanitized content.

### 8. All Writes Are Non-Blocking

Every transcript and offloading write uses fire-and-forget (`void promise`). Context persistence must never block or delay the agent loop.

**Why**: A filesystem or RPC failure during write should not prevent the agent from responding. Transcript loss is acceptable; agent hang is not.

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
- CORRECT: `void appendTranscriptLine(...)` — fire-and-forget

### 5. Static Injection of Dynamic Context

- INCORRECT: Hardcoding skill content or memory in the system prompt string
- CORRECT: Let `createSkillsMiddleware` / `createMemoryMiddleware` load from filesystem

## Summary Checklist

When adding or modifying filesystem-based context:

- [ ] Data is greppable by the agent (full text, no opaque binary)
- [ ] No duplication with another middleware hook
- [ ] Uses append-only semantics (not overwrite)
- [ ] Writes are fire-and-forget (void the promise)
- [ ] `timestamp` is included on every JSONL line
- [ ] Schema table in Rule 1 is updated for new event types
- [ ] Tests added in the corresponding middleware test file
- [ ] Middleware ordering in `chat.service.ts` is preserved

## References

- Related: `docs/policy/context-engineering-policy.md`
- Research: `docs/research/transcript-search-architecture.md`
