---
title: 'API Error Policy'
description: 'Internal reference for how the API handles chat request cancellation (user clicking stop) without crashing. Covers ChatAbortError, abort tracker registry, and unhandled rejection handling.'
status: active
created: '2026-02-25'
updated: '2026-06-19'
related:
  - docs/policy/chat-rpc-error-handling-policy.md
  - docs/research/chat-client-abort-api-crash.md
  - docs/research/chat-post-tool-abort-unhandled-rejection.md
---

# API Error Policy

Internal reference for how the API handles chat request cancellation (user clicking the stop button) without crashing.

## Rationale

When users cancel chat requests, LangGraph and provider SDK abort propagation can surface cancellation through request-local catch blocks or process-level detached promise rejections. A Tau-branded but abort-shaped cancellation reason and a scoped abort tracker ensure cancellations are handled gracefully without swallowing unrelated aborts from other subsystems.

## Problem

When a user cancels a chat request, the API aborts the in-flight LangGraph stream via `AbortController`. This triggers two issues:

**Unhandled promise rejection** — LangGraph and provider internals can create detached promises that reject after the SSE client has disconnected. These rejections are disconnected from the controller's local stream processing pipeline and can crash the Node.js process unless they are classified as expected chat cancellation.

**Known noise:** `@langchain/google-common`'s `failedAttemptHandler` calls `console.error` with the full `GaxiosError` (including request body, headers, and duplicate stack traces) when an abort error has no HTTP status. This is cosmetic and does not affect stability.

## Architecture

The solution uses two layers:

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 1: Abort-shaped branded ChatAbortError + Type Guard   │
│  (controller catch block — direct signal access)             │
├──────────────────────────────────────────────────────────────┤
│  Layer 2: Expected Cancellation Predicate + Abort Tracker    │
│  (process-level handler — no signal access for generic abort)│
└──────────────────────────────────────────────────────────────┘
```

### Layer 1: Abort-Shaped Branded ChatAbortError

**File:** `apps/api/app/api/chat/utils/chat-abort.ts`

A `ChatAbortError` class carries a module-private `unique symbol` as a runtime brand. The brand cannot be forged from outside the module because the symbol is created with `Symbol()` (non-global), not `Symbol.for()`.

`ChatAbortError` must be platform abort-shaped and Tau-branded:

- `name === "AbortError"` for ecosystem compatibility.
- `kind === "chat-client-abort"` and `code === "CHAT_CLIENT_ABORT"` for stable Tau diagnostics.
- `chatId` for attribution.
- The module-private brand for `isChatAbortError()` precision.

The controller passes this as the abort reason:

```typescript
abortController.abort(new ChatAbortError(body.id));
```

This sets `signal.reason` to our branded error. In the catch block, the `isChatAbortError` type guard checks the brand symbol on `signal.reason` — a definitive match regardless of what error LangGraph/node-fetch actually throws:

```typescript
catch (error: unknown) {
  if (abortController.signal.aborted && isChatAbortError(abortController.signal.reason)) {
    this.logger.debug(`Chat ${body.id} was cancelled by client`);
    return;
  }
  throw error;
}
```

### Layer 2: Expected Cancellation Predicate

**Files:** `apps/api/app/api/chat/utils/chat-abort.ts`, `apps/api/app/main.ts`, `apps/api/app/api-dev-vite-node-lifecycle.ts`

The process-level `unhandledRejection` handler usually does not have access to the request `AbortSignal`. It must use a narrow predicate that distinguishes Tau-branded chat cancellation from generic transport aborts.

`isExpectedChatCancellationRejection(error)` is the only process-boundary predicate:

1. Tau-branded `ChatAbortError` passes directly because the private brand proves it came from the chat cancellation layer.
2. Generic abort-like errors (`.name === 'AbortError'` or `.type === 'aborted'`) pass only when at least one chat abort was recently registered via `registerChatAbort(chatId)`.

This split prevents accidentally swallowing unrelated generic aborts while still handling Tau's own cancellation reason even if a detached promise surfaces it outside the request-local catch path. Tracker entries auto-cleanup after 10 seconds.

`registerChatAbort()` must be called **before** `AbortController.abort()` because node-fetch's rejection can fire synchronously during the abort call.

### Runtime Installation

Install the unhandled-rejection handler from the same runtime module graph that owns chat request handling.

| Runtime                 | Installation path                                                                                                              | Rule                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Standalone / production | `apps/api/app/main.ts` imports and calls `installApiUnhandledRejectionHandler()` before listening.                             | Keep the handler in the app runtime graph.                                                      |
| Vite dev                | `apps/api/app/api-dev-vite-node-lifecycle.ts` loads `/app/api-unhandled-rejection-handler.ts` via `server.ssrLoadModule(...)`. | Do not statically import app-runtime handler modules from `vite.config.ts` or its plugin graph. |

**Why**: `chat-abort.ts` uses module-local tracking state. Loading the handler from the Vite config graph creates a second tracker instance that cannot see `ChatController` registrations from the SSR app graph.

### Provider Stream Logging

Treat branded client cancellation as normal request termination, not provider failure. Provider stream wrappers must skip `logger.error` when the request `AbortSignal` is aborted with `ChatAbortError`; the controller catch block remains responsible for the debug-level cancellation log.

Do not broaden provider logging into an unscoped generic `AbortError` swallow. Generic detached transport aborts belong to the tracked process-level handler, where the recent chat-abort registry is available.

### Provider Replay Boundary

Do not use the process-level unhandled-rejection handler to hide malformed provider replay payloads. Cross-provider replay normalization must happen before the final provider call, with provider-specific invariants encoded in middleware and tests.

For Google/Vertex replay, canonical `AIMessage.tool_calls` may be preserved, but provider-visible tool-call content blocks and legacy `additional_kwargs.tool_calls` / `function_call` metadata must be removed. If canonical tool calls survive or are reconstructed for Google, `response_metadata.output_version` must be dropped so LangChain's v1 `AIMessage` constructor cannot re-add provider-incompatible `tool_call` content blocks.

## Abort Flow Sequence

```
User clicks Stop
    │
    ▼
UI disconnects SSE stream
    │
    ▼
response.raw 'close' event fires
    │
    ├──► registerChatAbort(chatId)        ← Layer 2: tracking
    ├──► abortController.abort(           ← Layer 1: branded reason
    │      new ChatAbortError(chatId))
    │
    ▼
LangGraph propagates abort to internal operations
    │
    ├──► node-fetch rejects with AbortError
    │     │
    │     ├──► [if caught] controller catch block
    │     │     └──► isChatAbortError(signal.reason) ← brand check
    │     │
    │     └──► [if unhandled] process.on('unhandledRejection')
    │           └──► isExpectedChatCancellationRejection(reason)
    │                 ├── branded ChatAbortError     ← direct brand check
    │                 └── generic AbortError         ← tracker check
    │
    └──► @langchain/google-common failedAttemptHandler
          └──► console.error (noisy but harmless)
```

## Key Files

| File                                                   | Role                                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `apps/api/app/api/chat/utils/chat-abort.ts`            | `ChatAbortError`, `isChatAbortError`, `isExpectedChatCancellationRejection`, tracker utilities |
| `apps/api/app/api/chat/utils/chat-abort.test.ts`       | Tests for all abort utilities                                                                  |
| `apps/api/app/api-unhandled-rejection-handler.ts`      | Process-level unhandled-rejection handler                                                      |
| `apps/api/app/api-unhandled-rejection-handler.test.ts` | Process-boundary cancellation tests                                                            |
| `apps/api/app/api/chat/chat.controller.ts`             | Controller catch block (Layer 1)                                                               |
| `apps/api/app/main.ts`                                 | Standalone process handler installation (Layer 2)                                              |
| `apps/api/app/api-dev-vite-node-lifecycle.ts`          | Vite dev SSR-loaded process handler installation                                               |
