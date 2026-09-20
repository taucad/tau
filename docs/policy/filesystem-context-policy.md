---
title: 'Filesystem Context Policy'
description: 'Rules for the filesystem-backed context management pipeline: transcripts, tool offloading, skills, memory, compaction, and middleware ordering.'
status: active
created: '2026-03-24'
updated: '2026-09-20'
related:
  - docs/policy/context-engineering-policy.md
  - docs/policy/filesystem-authority-policy.md
  - docs/research/client-host-topology-and-filesystem-authority.md
  - docs/research/transcript-search-architecture.md
  - docs/research/harness-cache-hygiene-audit.md
  - docs/research/chat-compaction-safety-blueprint.md
---

# Filesystem Context Policy

Internal reference for building and maintaining Tau's filesystem-backed context management pipeline.

## Rationale

Tau implements dynamic context discovery (see `docs/policy/context-engineering-policy.md`, Part 6) through middleware that persists agent state to `.tau/` in the project filesystem. All context — transcripts, tool outputs, skills, memory — lives in files the agent already knows how to read and search. This policy codifies the schema, ordering, and extension rules so the pipeline stays consistent as features are added.

## Rules

### 1. Unified Append-Only Transcripts

Store authoritative portable host events at `<workspace>/.tau/chats/<chatId>/events.jsonl` through that workspace's filesystem authority. Reuse the canonical `AgentLogEvent` schema and `EventLogAppender`. Await the storage owner's qualified append/flush acknowledgement before committing the corresponding durable event, publishing its replay cursor or claiming durable completion. A remote execution host uses the same authority; unreachable or uncertain writes are explicit refusal/buffered state, not a successful local shadow log. The host-owned write path is protected by filesystem authority Rule 15.

There is no separate transcript projection: `.tau/transcripts/**` never had a writer (W17, 2026-09-13), so `.tau/chats/<chatId>/events.jsonl` — with per-device segments under `events/<deviceId>.jsonl` when more than one device writes — is the only chat log and the only grep target. Filter its `AgentLogEvent` lines by `type`; there is no role-based diagnostic schema and no second replay authority.

**Why**: Authority-owned append-only events preserve truthful replay; one log means one truth (I3), and a grep over it is bounded recall without a second copy.

### 2. Transcript Search Prompt

The system prompt includes a `<transcript_search>` section (`cad-agent.prompt.ts`) that teaches the agent grep-first retrieval. When modifying this section:

- Keep under 10 lines — the agent already knows `grep` and `read_file`
- Mention the path pattern (`.tau/chats/<chatId>/events.jsonl`)
- Emphasize grep-first, windowed reads — never linear scanning
- List the `AgentLogEvent` `type` values the agent can filter on

### 3. Tool Result Offloading

Large tool results are written to `.tau/tool-results/<chatId>/<toolCallId>.{json,txt}` via the tool offloading middleware, then replaced in-context with a generic `<persisted-output>` envelope that preserves the head of the original payload.

**Why**: A 50KB tool result in-context wastes tokens on every subsequent model call. Written to a file, it costs zero tokens until needed.

Never increase the offloading threshold without measuring the impact on context window utilization.

### 4. Skills and Memory via Filesystem

| Feature       | Source                                                       | Middleware                      | Loading                                                              |
| ------------- | ------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------- |
| Skills        | `.agents/skills/` (client-assembled catalog)                 | `createClientContextMiddleware` | Metadata block on the system channel; body on `use_skill` activation |
| Memory        | Client-assembled AGENTS.md payload (`contextPayload.memory`) | `createClientContextMiddleware` | HumanMessage on the message channel, per request                     |
| Recent skills | LangGraph store, per-chat namespace                          | `createRecentSkillsMiddleware`  | Fingerprint-reconciled; content restored after compaction            |

Do not add static skill or memory content to the system prompt. Let the middleware load it from the client payload / filesystem so users can edit, version, and customize it.

### 5. Context Compaction Pipeline

`packages/agent-host/src/harness/compaction.ts` owns compaction for Tau-hosted sessions. It runs before the first model call of a prompt or resume, between agent turns, and once more if the provider still reports a context overflow. The escalation order is tool-result clearing, then summarizing compaction, per `docs/policy/context-engineering-policy.md`.

Invariants:

- **Decide over the durable log, never the live array.** Every lane compacts a fresh projection of the session log (the same hydration a reload performs) and then replaces the agent's in-memory history with the result. Do not resolve durable ids from in-memory message objects: the model-call middleware clones messages, so object identity is not message identity. Request-shaped copies (trimmed tool results, rewritten assistant text) never enter durable-facing state.
- **Compaction wraps the model call outermost**, so an overflow retry re-enters every request-shaping middleware.
- **One compaction pass per model call.** No ephemeral per-call lane or memo beside the durable lanes.
- **The log is append-only and a refused compaction leaves it byte-identical.** Run every check before the first append. A pass writes either tool-result clearings or one `history.compacted`, never both, and never a clearing for a row it evicts.
- **A cut always evicts when more than one message exists.** Tool results are never cut points, retained tool results keep their calls, whole turn clusters are evicted together, and the retained tail is checked against the budget the trigger computed (window − reserve − measured overhead). Both tiers must land at least the keep-recent budget below the trigger threshold, so the next message does not compact again; a summary that falls short escalates the cut in the same pass.
- **Accept tool-result clearing only when it restores that headroom.** Each clearing invalidates the cached prefix; otherwise go straight to a summary and persist no clearings.
- **Degrade, do not refuse.** A summarizer that fails, aborts, returns nothing or cannot fit its input yields a placeholder summary that names the evicted range and points at the project files, and the attempt records why. The run's own abort still stops the run. Tau never sends the same unreduced history again, and never partially reconstructs a native provider turn without its provider-required signatures and ids.
- **Pinned content survives verbatim**: every `<safety>` block is preserved; for the other `keepContextTags` tags the newest instance is preserved and older instances are evictable, so reminders cannot accumulate into an unevictable history.
- **A compaction failure is a resumable turn failure, not a dead chat.** Compaction codes are resumable, Resume keeps the turn's work, and every attempt records its lane, tier, token counts, eviction count and any discarded overflow response in the existing log events.
- **The circuit breaker counts only completed summaries that remain over budget.**

Tests for this pipeline drive `createAgentSession` through the real middleware chain; they do not hand-populate `MessageIdentities` (`compaction.safety.test.ts`). Evidence: `docs/research/chat-compaction-safety-blueprint.md`.

### 6. Middleware Ordering

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

### 7. Most Context Writes Are Non-Blocking

Routine optional offloading writes may be non-blocking when they are only observability or recall enhancements; observe their failures. Do not return a persisted-output reference before its referenced bytes are available. Authoritative host event appends are awaited under Rule 1, not fire-and-forget diagnostics.

**Why**: An optional diagnostic failure need not prevent a response, but missing authoritative history or a false persisted-output receipt is not successful persistence.

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

- INCORRECT: Treating optional diagnostic persistence as a mandatory provider-dispatch gate
- CORRECT: Observe optional diagnostic writes without blocking ordinary capture
- REQUIRED: Await authoritative host events and referenced-output publication; required compaction commits fail closed before provider dispatch

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
- [ ] Optional diagnostics are non-blocking; authoritative events, referenced output publication and required compaction have truthful awaited commit boundaries
- [ ] `timestamp` is included on every JSONL line
- [ ] Tests added in the corresponding middleware test file
- [ ] Middleware ordering in `chat.service.ts` is preserved

## References

- Related: `docs/policy/context-engineering-policy.md`
- Research: `docs/research/transcript-search-architecture.md`
