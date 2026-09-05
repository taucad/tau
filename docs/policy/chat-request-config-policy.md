---
title: 'Chat Request Config Policy'
description: 'Shared chat-turn envelope, profile configuration, admission, and execution placement across browser, daemon, and API clients'
status: active
created: '2026-05-18'
updated: '2026-09-05'
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
