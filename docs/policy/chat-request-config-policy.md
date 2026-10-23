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

A chat owns its intent; each device owns its placement. A turn's execution names the host the sending device placed it on, but a chat's persisted `activeExecution` keeps only a portable host (a paired device id): `origin`, `desktop` and `loopback:` ids are dropped on write and read as local placement on every device, and a device's non-default choice lives in its per-project placements record. That choice is applied only in a tab that can reach its host (`isPlacementOnThisDevice`); a tab that cannot runs the chat locally, says so in the composer, and leaves the choice in place for the tab that can. An external-agent execution keeps its host; a device that knows it cannot reach it refuses the turn at once with a typed reason instead of moving the chat, and the composer offers Tau as an explicit choice. A chat's `activeKernel` this runtime cannot execute stays on the chat; the device runs its own kernel and the composer says which.

A run in flight on one device holds its chat on every other device. A run is never moved between devices while it runs: admission, and resume, refuse `RUN_ACTIVE_ON_ANOTHER_DEVICE` (`wait`) while another device's synced segment holds a run that has not settled and whose newest row is within `foreignRunStaleMilliseconds` (`packages/agent-host/src/log/foreign-runs.ts`) of this device's clock, and the composer says the chat is running on another device and holds its send without offering Stop. Each segment is read on its own ledger, never through this device's run bookkeeping. Liveness never waits on content: the device that holds a run appends a `run.heartbeat` row whenever its chat has gone `runHeartbeatMilliseconds` (`packages/agent-host/src/host/tau-agent-host.ts`) without a row while the run is admitted, running, or paused with its incarnation open there, only under a term that incarnation already wrote the chat under (a heartbeat never opens a term), and asks its placement to publish the chat's ref; a paused run holds the chat while its device keeps it open, for at most `pausedRunHoldMilliseconds` (thirty minutes) from its pause, and then goes stale like a run whose device went away, so a forgotten pause costs a bounded number of rows and pushes. A heartbeat is checked again inside the chat's write chain and never written after the run settles or its log closes. A resume on the holder device passes the same fence. The model's history leaves a foreign run that holds the chat out entirely; a run past the bound no longer holds the chat, and its user turn joins the history without its partial reply or its unanswered tool calls. A segment that exists but cannot be read holds the fence too: admission and resume refuse `SEGMENTS_UNREADABLE` (`wait`), never treating it as no other device.

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
