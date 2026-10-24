---
title: 'Chat Request Config Policy'
description: 'Shared chat-turn envelope, profile configuration, admission, and execution placement across browser, daemon, and API clients'
status: active
created: '2026-05-18'
updated: '2026-10-23'
related:
  - docs/research/chat-metadata-first-class-architecture.md
  - docs/research/chat-edit-message-metadata-stripping.md
  - docs/policy/cross-provider-content-contract.md
  - docs/policy/interrupted-tool-call-contract.md
  - docs/policy/library-api-policy.md
  - docs/policy/testing-policy.md
---

# Chat Request Config Policy

`libs/chat` owns the shared chat-turn envelope. Profile configuration describes the requested agent, admission records the accepted model and limits, and execution selects where a CAD turn runs. These are durable request facts, not component-local options.

## Rules

### 1. Use the shared schema as the wire registry

Define agent profiles in `libs/chat/src/schemas/agent-config.schema.ts` and the complete request in `libs/chat/src/schemas/chat-turn-request.schema.ts`. Import them through `@taucad/chat/schemas`; do not duplicate their types in UI, API, daemon, or host code.

The profile discriminator remains `cad`, `project_name`, or `commit_name`. Add a profile field in the schema and its one owning assembler before using it at call sites.

### 2. Preserve the whole turn envelope

A chat turn contains:

- validated UI `messages`;
- the profile-specific `agent` configuration;
- optional durable `admission` selected by the control plane;
- optional `execution` placement for CAD.

Keep model input, kernel, mode, testing, snapshot, and context in their owning schema fields. Do not recover request configuration from message metadata or mutable module globals.

### 3. Keep structural and relational validation distinct

`agentConfigSchema` must remain structurally representable as JSON Schema because the API exposes that slice in OpenAPI. Cross-field CAD relationships belong in the top-level `chatTurnRequestSchema.superRefine`, where the full envelope is available.

Use `parseChatTurnRequestAsync` or the API's async validation pipe at untrusted boundaries so message normalization and relational checks execute. A sync parse is not an equivalent boundary.

### 4. Assemble CAD configuration once

`useCadAgentConfig` is the UI assembler for the CAD profile. It combines the selected model, kernel, mode, tool policy, testing flag, snapshot and context from their authoritative stores.

Submission sites send through the profile chat client. They must not construct parallel body literals or stamp request configuration onto the last message.

### 5. Keep admission durable

Admission records the control-plane decision needed to execute the turn, including the accepted model identity and applicable limits. Once admitted, preserve that record with the turn and use it on resume or reattach.

Do not silently recompute admission from current UI state after the request has started.

### 6. Select CAD execution explicitly

The CAD `execution` field is a discriminated union for `tau`, `acp`, or `paseo`. It selects the execution host and its required placement data. It is independent of model provider selection.

Validate the relationship between `agent.profile`, `admission`, and `execution` at the request-envelope boundary. Do not infer placement from a model name, URL, feature flag, or legacy server graph.

A chat owns its intent; each device owns its placement. A turn's execution names the host the sending device placed it on, but a chat's persisted `activeExecution` keeps only a portable host (a paired device id): `origin`, `desktop` and `loopback:` ids are dropped on write and read as local placement on every device, and a device's non-default choice lives in its per-project placements record. That choice is applied only in a tab that can reach its host (`isPlacementOnThisDevice`); a tab that cannot runs the chat locally, says so in the composer, and leaves the choice in place for the tab that can. The held choice is applied as soon as the tab gains a route to its host, and it is dropped from the session, with the notice, when the person picks another host or agent. An external-agent execution keeps its host; a device that knows it cannot reach it refuses the turn at once with a typed reason instead of moving the chat, and the composer offers Tau as an explicit choice. A chat's `activeKernel` this runtime cannot execute stays on the chat; the device runs its own kernel and the composer says which.

A run in flight on one device holds its chat on every other device. A run is never moved between devices while it runs: admission, and resume, refuse `RUN_ACTIVE_ON_ANOTHER_DEVICE` (`wait`) while another device's synced segment holds a run that has not settled and whose newest row is within `foreignRunStaleMilliseconds` (`packages/agent-host/src/log/foreign-runs.ts`) of this device's clock, and the composer says the chat is running on another device and holds its send without offering Stop. Each segment is read on its own ledger, never through this device's run bookkeeping. A device keeps one term per incarnation and terms merge whole, so before it admits a start or a resume it closes an incarnation that already wrote under a term when its log has read another device's rows since that term's first row (what this device read, never a comparison with another device's clock); the turn's new term then starts after those rows and merges after them on every device. Every row a device writes is stamped no earlier than one millisecond past the newest row it has read from another device's segment, so a term merges after every row it read whatever the other device's clock says (`t7_stamped_after_read` in `ChatLedger.lean`). The merge reads rows and writers, never segment ids: a segment's writer is the first term it holds, so the id a device reads its own file under, or an old file a device left when its id changed, never changes the order. A chat's commands reach its incarnation in the order they arrive, whatever each awaits first (a term check, an approval's fence), so a Stop never overtakes the Send or Approve before it. That close is started, never awaited by the check: the turn waits for it at most the closing bound (`chatClosingWaitMilliseconds`, on the host's clock) and is refused `WRITER_LOCKED` (`wait`) past it, and no later command for the chat, a Stop included, waits on a close that never ends. Liveness never waits on content: the device that holds a run appends a `run.heartbeat` row whenever its chat has gone `runHeartbeatMilliseconds` (`packages/agent-host/src/host/tau-agent-host.ts`) without a row while the run is admitted, running, or paused with its incarnation open there, only under a term that incarnation already wrote the chat under (a heartbeat never opens a term), and asks its placement to publish the chat's ref. No heartbeat is written while the placement refuses `publish` with `CHAT_NOT_SHARED` (a project with no remote, a placement session with no publish verb, or a placement server older than XD3, whose missing verb the client reads as `CHAT_NOT_SHARED`): no other device reads the chat, and builds older than XD3 read a heartbeat as an opaque row of its run. A heartbeat row is the run's own liveness: only a definite `CHAT_NOT_SHARED` stops it. Only an applied publish marks the chat shared; a fenced or failing placement leaves sharing unknown, and the row is still written and published again, so publish trouble never makes a live run look gone elsewhere. The chat is asked once at the run's start; each heartbeat is published once, after its row; a "not shared" answer stands for one interval and is asked again by that tick's one publish, made before its row, and an answer of shared or unknown writes that tick's heartbeat then; so no heartbeat row lands on an unshared chat and no tick publishes twice. A run that keeps writing rows writes no heartbeat, and its chat is published at least once every `runHeartbeatMilliseconds` while rows were written since the last publish, so a busy run never looks stale elsewhere; a publish of those rows waits a whole interval before the next heartbeat, so no two publishes land within one interval and the newest row is at most two intervals old. A heartbeat a row overtakes while it waits for the chat's write chain is not written, and its tick publishes nothing: that row is the run's liveness and its write arms the next tick, so two ticks never both publish. A paused run holds the chat while its device keeps it open, for at most `pausedRunHoldMilliseconds` (thirty minutes) from its pause, and then goes stale like a run whose device went away, so a forgotten pause costs a bounded number of rows and pushes. A heartbeat is checked again inside the chat's write chain and never written after the run settles or its log closes. A resume on the holder device passes the same fence, and so does an approval that would continue a paused run: it is refused, before any row, while another device holds the chat, since the pause may have outlived its hold; inside the paused run's own hold an unreadable segment does not refuse it while this device's own rows fold alone (an unknown history refuses it there too), and a denial or cancellation is never refused. A paused run has no driver; it goes on only through a resume, which reads the merged history again, so it continues after whatever another device ran meanwhile. The model's history leaves a foreign run that holds the chat out entirely; a run past the bound no longer holds the chat, and its user turn joins the history without its partial reply or its unanswered tool calls. A run its device settles failed before it said the person's words keeps them the same way, from its admission, so the history is the same whether that run is read stale or settled. A segment that exists but cannot be read holds the fence too: admission and resume refuse `SEGMENTS_UNREADABLE` (`wait`), never treating it as no other device, until the segment has failed to read without changing for a whole `foreignRunStaleMilliseconds`. A live run keeps its device's segment changing, so such a segment holds no live run: it is left out of the history and the fence, and the history names it as unreadable. Any change to it starts the bound again. This device's rows can name another device's messages: while the segments cannot be read the history is unknown, never invalid, and the fence refuses `SEGMENTS_UNREADABLE`; once they read and no segment holds those messages (a device removed from the project), the history is this device's rows with those names left out, and says so. The page shows both waits, and `BRANCH_UNAVAILABLE`, as waiting on sync from another device; a placement refused `BRANCH_UNAVAILABLE` after admission ends the run `RUN_ABANDONED` with that code kept, and its card offers Resume. An external agent keeps its own session, so each prompt carries the chat's turns that session has not seen (Tau's, or another device's), as a `tau://chat-handoff` context block: the whole chat for a fresh session, and what follows its own last turn for one it continues (a turn whose marker names no session continues the session its own host most recently named; a continued session whose own turns compaction or a rewind removed is sent nothing), within 24,000 characters, the newest message cut to its tail when it alone is longer.

### 7. Use the browser placement transport for CAD

`apps/ui/app/chat-clients/_internal/shared-chat-transport.ts` owns the shared `BrowserPlacementChatTransport` and one AI SDK `Chat` per CAD session. `useCadChatClient` supplies an asynchronous latest-body factory through `setLatestAgentBody`.

That factory must remain valid after the initiating component unmounts. It must return the durable agent, admission, and execution facts for retry, resume, or reconnect.

### 8. Limit API chat placement

`apps/api/app/api/chat/chat.controller.ts` accepts `project_name` and `commit_name` requests. A `cad` request to that HTTP endpoint must fail with `CHAT_CAD_NOT_API_PLACED`; the API must not reconstruct the removed server-side CAD executor.

Name-generation clients may use AI SDK `DefaultChatTransport` against the API. CAD clients may not.

### 9. Preserve request identity through edits and retries

Editing message content, retrying a transport, restoring a draft, or reattaching a host must not strip the turn's agent, admission, or execution configuration. Rebuild display messages only from durable session state and the portable host event log.

### 10. Keep transport and profile concerns separate

A transport moves a validated turn. It must not choose a kernel, rewrite a profile, or own UI stores. A profile assembler gathers current intent. The admitted turn freezes the accepted execution facts.

### 11. Test the shared boundary

Contract tests must cover every profile, async UI-message normalization, CAD execution relationships, JSON Schema generation for the agent slice, API refusal of CAD placement, and durable latest-body behavior after unmount.

Assert parsed values and transport bodies. Avoid duplicate test fixtures that can drift from the schemas.

## Ownership

- Agent profiles: `libs/chat/src/schemas/agent-config.schema.ts`
- Turn envelope and relational validation: `libs/chat/src/schemas/chat-turn-request.schema.ts`
- API binding and placement refusal: `apps/api/app/api/chat/chat.dto.ts`, `apps/api/app/api/chat/chat.controller.ts`
- CAD assembler: `apps/ui/app/hooks/use-cad-agent-config.ts`
- CAD client and durable body factory: `apps/ui/app/chat-clients/use-cad-chat-client.ts`
- Browser placement transport: `apps/ui/app/chat-clients/_internal/shared-chat-transport.ts`
- API name clients: `apps/ui/app/chat-clients/_internal/name-generator-client.ts`
