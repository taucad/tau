---
title: 'Chat Edit-Resubmit Metadata Stripping → OpenSCAD Fallback'
description: 'Root-cause investigation: editing a failed chat message drops the kernel/mode/toolChoice/testingEnabled metadata, the API silently defaults to OpenSCAD, and Replicad projects get OpenSCAD output. Documents the fix and the new validation contract.'
status: active
created: '2026-05-17'
updated: '2026-05-17'
category: investigation
---

# Chat Edit-Resubmit Metadata Stripping → OpenSCAD Fallback

Root-cause investigation of an edit-resubmit flow that silently retargets a Replicad project at the OpenSCAD agent, plus the wire-contract hardening that prevents recurrence.

## Executive Summary

Editing a failed chat message and resubmitting it rebuilt the user message with a fresh `metadata` object that preserved only `createdAt`, `status`, and `model` — `kernel`, `mode`, `toolChoice`, `testingEnabled`, `snapshot`, and `contextPayload` were all dropped. The API masked the symptom with the wrong fallback (`kernel ?? 'openscad'`, `mode ?? 'agent'`, `toolChoice ?? 'auto'`, `testingEnabled ?? true`), so a Replicad project's edit-resubmit landed at the OpenSCAD agent with the OpenSCAD system prompt and OpenSCAD tools. The LLM dutifully produced `.scad` source for a TypeScript project.

The fix has three parts:

1. UI: `buildEditedMessage` now takes the original message and spreads its existing metadata so the edited turn inherits kernel/mode/toolChoice/testingEnabled/snapshot/contextPayload.
2. UI: `chat-examples.tsx`'s quick-start path was the second offender — it built messages without `kernel` etc. It now reads from the same `useActiveChatKernel` / chat-draft / cookie sources as the free-form `chat-history` path.
3. API: every silent `?? '...'` fallback in `chat.controller.ts` and the `mode = 'agent'` / `testingEnabled = true` default parameters in `chat.service.ts createAgent` are deleted. Validation is centralised in a single Zod schema (`createChatSchema` superRefine in `chat.dto.ts`) enforced at the Fastify body-parse boundary. Missing `kernel`/`mode`/`toolChoice`/`testingEnabled`/`model` on the trailing user message now produces a 400 with a path-precise issue (`messages.N.metadata.kernel`).

## Problem Statement

User reported (transcript: `keyboard_labels_2026-05-16T23-00.md`):

> Resubmitting a previously failed chat message (failing due to missing funds) results in the API not receiving the correct CAD kernel. The current effect of the missing CAD kernel is that the AI Agent incorrectly thinks that we are always modeling with OpenSCAD on resubmission (it's the hardcoded fallback in the API) even tho we are running Replicad in this case.

Reproduction:

1. Open a Replicad project (`main.ts` with `import { ... } from 'replicad'`).
2. Send a message that fails (e.g. a model that exceeds account credits).
3. Edit the failed message and resubmit.
4. The new turn lands at the OpenSCAD agent and produces `.scad` source.

## Methodology

- Read the failed wire payload from the user's transcript: confirmed `metadata: { createdAt, status, model }` — `kernel`, `toolChoice`, `mode`, `testingEnabled` all absent.
- Traced API request handling in `apps/api/app/api/chat/chat.controller.ts` (`createChat` → `extractRequestConfig`): located four silent `?? '...'` fallbacks that mask missing required fields.
- Traced UI message construction across every `createMessage` / message-build call site (`chat-history.tsx`, `chat-examples.tsx`, `chat-stack-trace.tsx`, `use-project-manager.tsx`, `chat-session-store.ts`): found two UI offenders (`buildEditedMessage` and `chat-examples.tsx`).
- Verified `messageMetadataSchema` (in `libs/chat/src/schemas/metadata.schema.ts`) marks every field `.optional()`, so the wire validation pipeline previously offered no schema-level safety net.

## Findings

### Finding 1: UI smoking gun — `buildEditedMessage` strips required metadata

`apps/ui/app/services/chat-session-store.ts` (pre-fix) rebuilt the edited message from scratch, preserving only three metadata fields:

```ts
function buildEditedMessage(request: Extract<ChatRequest, { kind: 'edit' }>): MyUIMessage {
  return {
    id: request.messageId,
    role: 'user',
    parts: [...],
    metadata: {
      createdAt: Date.now(),
      status: 'pending',
      model: request.model,
      // kernel, toolChoice, mode, testingEnabled, snapshot, contextPayload DROPPED
    },
  };
}
```

Contrast `buildRetryMessages` in the same file, which spreads `previousMessage.metadata` and only overrides `model` — that path was already correct.

### Finding 2: UI second offender — `chat-examples.tsx` quick-start prompts

Clicking a quick-start example dispatched a `createMessage` with only `{ model, status, snapshot }` in metadata — same defect, different code path. Until the API contract was tightened, this masked itself because of the same OpenSCAD fallbacks.

### Finding 3: API silent fallbacks mask every missing required field

`apps/api/app/api/chat/chat.controller.ts extractRequestConfig` (pre-fix):

```ts
return {
  modelId: messageModel,
  kernel: lastHumanMessage.metadata?.kernel ?? 'openscad',
  mode: lastHumanMessage.metadata?.mode ?? 'agent',
  tools: {
    choice: lastHumanMessage.metadata?.toolChoice ?? 'auto',
    testingEnabled: lastHumanMessage.metadata?.testingEnabled ?? true,
  },
};
```

The `kernel` fallback to `'openscad'` is the most damaging — it actively misroutes a Replicad project's request — but every fallback here is wrong. A missing required field is a UI bug; defaulting silently means we never see it.

### Finding 4: Service layer re-defaults

`chat.service.ts createAgent` had `mode = 'agent'` and `testingEnabled = true` default parameters one layer down. Even if the controller had been clean, drift could have been re-introduced from any other caller.

### Finding 5: `messageMetadataSchema` provides no schema-level safety net

`libs/chat/src/schemas/metadata.schema.ts` makes every field `.optional()`. That's correct for historical persisted messages (legacy chats deserialised without `kernel` need to keep loading), but it offered no point at which we could fail loudly when the _current turn_ was missing required fields.

## Implementation

### Phase 2 — UI fix: `buildEditedMessage` preserves original metadata

```ts
function buildEditedMessage(
  original: MyUIMessage,
  request: Extract<ChatRequest, { kind: 'edit' }>,
): MyUIMessage {
  return {
    id: request.messageId,
    role: 'user',
    parts: [...],
    metadata: {
      ...original.metadata,
      createdAt: Date.now(),
      status: 'pending',
      model: request.model,
    },
  };
}
```

The `case 'edit'` dispatcher in `chat-session-store.ts` now looks up `chat.messages[messageIndex]` and passes it in.

### Phase 3 — UI fix: `chat-examples.tsx`

The quick-start path now reads `kernel` from `useActiveChatKernel`, `mode` and `toolChoice` from chat-draft state via `useChatSelector`, and `testingEnabled` from the `chat-testing-enabled` cookie — matching the free-form `chat-history.tsx` `onSubmit` path exactly.

### Phase 5 — Centralised Zod validation (sole source of truth)

`apps/api/app/api/chat/chat.dto.ts`:

```ts
export const lastUserMessageMetadataSchema = messageMetadataSchema.required({
  kernel: true,
  model: true,
  mode: true,
  toolChoice: true,
  testingEnabled: true,
});

export const createChatSchema: z.ZodType<CreateChat> = z
  .object({
    id: z.string(),
    messages: uiMessagesSchema,
  })
  .superRefine((value, ctx) => {
    const lastIndex = value.messages.length - 1;
    const lastMessage = value.messages[lastIndex];
    if (!lastMessage) {
      return;
    }
    if (lastMessage.role !== 'user') {
      ctx.addIssue({
        code: 'custom',
        path: ['messages', lastIndex, 'role'],
        message: 'The last message in a chat request must be a user message',
      });
      return;
    }
    const metadataResult = lastUserMessageMetadataSchema.safeParse(lastMessage.metadata ?? {});
    if (metadataResult.success) {
      return;
    }
    for (const issue of metadataResult.error.issues) {
      ctx.addIssue({
        ...issue,
        path: ['messages', lastIndex, 'metadata', ...issue.path],
      });
    }
  });
```

This is the single source of truth. The controller no longer throws `BadRequestException` directly — `nestjs-zod`'s `ZodValidationPipe` rejects bad bodies at the Fastify body-parse layer with an issue path like `messages.0.metadata.kernel`, which `ChatExceptionFilter` formats into the structured `ChatError` (`code: VALIDATION_ERROR`) the UI already knows how to render.

`messageMetadataSchema` stays permissive on the historical messages so legacy persisted chats still deserialise. The strictness applies only to the LAST user message — the one driving the current turn.

### Phase 4 — API cleanup: `extractRequestConfig` is now a pure mapper

Every `?? '...'` fallback and every inline `throw new Error(...)` is deleted. The function re-parses the validated metadata through `lastUserMessageMetadataSchema` to narrow the controller-side type from the permissive `MyMetadata` to the strict required-fields shape, then maps directly:

```ts
private extractRequestConfig(body: CreateChatDto): ChatRequestConfig {
  const lastMessage = body.messages.at(-1);
  if (!lastMessage) {
    throw new Error('Unreachable: createChatSchema enforces .nonempty() on messages');
  }
  const metadata = lastUserMessageMetadataSchema.parse(lastMessage.metadata);
  return {
    modelId: metadata.model,
    kernel: metadata.kernel,
    snapshot: metadata.snapshot,
    contextPayload: metadata.contextPayload,
    mode: metadata.mode,
    tools: {
      choice: metadata.toolChoice,
      testingEnabled: metadata.testingEnabled,
    },
  };
}
```

The local re-parse is a cheap structural check on a tiny object and self-documents the invariant.

### Phase 4b — Service signature tightening

`createAgent`'s `mode` and `tools.testingEnabled` fields are now required at the type. Default parameter values are deleted. JSDoc on the options type points future readers at the DTO for the contract.

### Phase 4c — `mergeCheckpointTail` generalisation

The pre-fix function only ran if `requestMessages.at(-1)?.role === 'assistant'`. Under the new contract the trailing message is always `user`, so the splice would never fire. `mergeCheckpointTail` now uses `findLastIndex(message => message.role === 'assistant')` and splices the most recent assistant turn regardless of its position — which is exactly the place stale tool parts live now that user is pinned to the tail.

## Audit Sweep

`rg "\?\? '[a-z]" apps/api/app/api/chat` after the cleanup landed surfaces only telemetry/error-render fallbacks, all defensible:

| File                                              | Pattern                                        | Verdict                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `middleware/transcript.middleware.ts:207`         | `toolName: result.name ?? 'unknown'`           | Telemetry-only; OK                                                                                                                                                           |
| `middleware/agent-safeguards.middleware.ts:296`   | `parsedError?.errorCode ?? 'UNKNOWN_ERROR'`    | Telemetry-only; OK                                                                                                                                                           |
| `middleware/tool-error-handler.middleware.ts:50`  | `path: path?.trim() ?? 'root'`                 | Error-render label; OK                                                                                                                                                       |
| `middleware/tool-error-handler.middleware.ts:134` | `toolCallId: request.toolCall.id ?? 'unknown'` | Error-render label; OK                                                                                                                                                       |
| `prompts/cad-agent.prompt.ts:82`                  | `mode: ChatMode = 'agent'`                     | Test-ergonomics default. Production caller (`chat.service.ts`) passes all 3 args explicitly. Defensible (single location, scoped to a helper, not in request-handling path). |

Test-only fallbacks (`interrupt-recovery.middleware.test.ts`, `agent-safeguards.middleware.test.ts`) are out of scope.

## Validation Contract

The wire contract enforced by `createChatSchema`:

| Field                                     | Required        | Notes                                                                           |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------------------- | --------- | ------- | ---------------------------------- |
| `id`                                      | Yes             | Chat id.                                                                        |
| `messages`                                | Yes (non-empty) | Validated by `uiMessagesSchema`.                                                |
| `messages.at(-1).role`                    | `'user'`        | Trailing message must drive the current turn.                                   |
| `messages.at(-1).metadata.kernel`         | Yes             | Must be in `kernelProviders`.                                                   |
| `messages.at(-1).metadata.model`          | Yes             |                                                                                 |
| `messages.at(-1).metadata.mode`           | Yes             | `'agent'`                                                                       | `'plan'`. |
| `messages.at(-1).metadata.toolChoice`     | Yes             | `'none'`                                                                        | `'auto'`  | `'any'` | `'custom'` or array of tool names. |
| `messages.at(-1).metadata.testingEnabled` | Yes             | Boolean.                                                                        |
| `messages.at(-1).metadata.snapshot`       | Optional        | When present, validated against `snapshotSchema`.                               |
| `messages.at(-1).metadata.contextPayload` | Optional        | When present, validated against `contextPayloadSchema`.                         |
| Historical messages                       | Permissive      | `messageMetadataSchema` keeps every field optional so legacy chats deserialise. |

A request that violates the contract surfaces as a structured `ChatError`:

```json
{
  "category": "tool_error",
  "title": "Tool Error",
  "message": "Validation failed: messages.0.metadata.kernel: Invalid input: expected nonoptional, received undefined",
  "code": "VALIDATION_ERROR",
  "httpStatus": 400
}
```

## Recommendations

| #   | Action                                                                                                                                                                                      | Priority | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | ------ |
| R1  | Add a new required field on the agent? Pair it with a required entry in `lastUserMessageMetadataSchema`. The contract is the single edit point.                                             | P0       | Low    | High   |
| R2  | When adding a new UI surface that dispatches user messages, mirror `chat-history.tsx onSubmit`'s metadata-assembly call (kernel + mode + toolChoice + testingEnabled, plus model + status). | P1       | Low    | Medium |
| R3  | Consider a unit-test contract in `libs/chat` that re-runs `lastUserMessageMetadataSchema.parse` on every UI dispatch path so adding a new entry point fails fast.                           | P2       | Medium | Medium |

## Non-Goals

- Do not migrate persisted chats. `messageMetadataSchema` stays permissive for historical messages so reading old chats still works.
- Do not change first-message create-project paths. `use-project-manager.tsx` already attaches `kernel` correctly.
- Do not remove `chat.service.ts`'s positive defaults on genuinely optional inputs (e.g. `contextPayload`).
- Do not change error categorisation in `chat-exception.filter.ts`. Zod validation errors continue to surface under `category: tool_error` with `code: VALIDATION_ERROR`. Re-categorisation is out of scope.

## References

- `apps/api/app/api/chat/chat.dto.ts` (`lastUserMessageMetadataSchema`, `createChatSchema`)
- `apps/api/app/api/chat/chat.controller.ts` (`extractRequestConfig`)
- `apps/api/app/api/chat/chat.service.ts` (`createAgent` signature)
- `apps/api/app/api/chat/utils/merge-checkpoint-tail.ts` (most-recent-assistant splice)
- `apps/ui/app/services/chat-session-store.ts` (`buildEditedMessage`)
- `apps/ui/app/routes/projects_.$id/chat-examples.tsx`
- `libs/chat/src/schemas/metadata.schema.ts` (`messageMetadataSchema` historical contract)
- Plan: `.cursor/plans/chat-kernel-fallback-removal_560c5a76.plan.md`
