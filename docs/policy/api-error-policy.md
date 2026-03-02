# API Chat Abort Error Policy

Internal reference for how the API handles chat request cancellation (user clicking the stop button) without crashing.

## Problem

When a user cancels a chat request, the API aborts the in-flight LangGraph stream via `AbortController`. This triggers two issues:

**Unhandled promise rejection** — LangGraph's internal abort propagation creates fire-and-forget promises in `node-fetch` that reject with `AbortError`. These rejections are disconnected from the stream processing pipeline and crash the Node.js process.

**Known noise:** `@langchain/google-common`'s `failedAttemptHandler` calls `console.error` with the full `GaxiosError` (including request body, headers, and duplicate stack traces) when an abort error has no HTTP status. This is cosmetic and does not affect stability.

## Architecture

The solution uses two layers:

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: Branded ChatAbortError + Type Guard       │
│  (controller catch block — direct signal access)    │
├─────────────────────────────────────────────────────┤
│  Layer 2: Abort Tracker Registry                    │
│  (process-level handler — no signal access)         │
└─────────────────────────────────────────────────────┘
```

### Layer 1: Branded ChatAbortError

**File:** `apps/api/app/api/chat/utils/chat-abort.ts`

A `ChatAbortError` class carries a module-private `unique symbol` as a runtime brand. The brand cannot be forged from outside the module because the symbol is created with `Symbol()` (non-global), not `Symbol.for()`.

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

### Layer 2: Abort Tracker Registry

**Files:** `apps/api/app/api/chat/utils/chat-abort.ts`, `apps/api/app/main.ts`

The process-level `unhandledRejection` handler in `main.ts` doesn't have access to the `AbortSignal`. Instead, an abort tracker correlates the unhandled rejection with a known chat cancellation.

`isTrackedAbortError(error)` returns true only when **both** conditions are met:

1. The error matches the `AbortError` pattern (`.name === 'AbortError'` or `.type === 'aborted'`)
2. At least one chat abort was recently registered via `registerChatAbort(chatId)`

This two-condition check prevents accidentally swallowing unrelated `AbortError`s from other subsystems. Entries auto-cleanup after 10 seconds.

`registerChatAbort()` must be called **before** `AbortController.abort()` because node-fetch's rejection can fire synchronously during the abort call.

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
    │           └──► isTrackedAbortError(reason)     ← tracker check
    │
    └──► @langchain/google-common failedAttemptHandler
          └──► console.error (noisy but harmless)
```

## Key Files

| File | Role |
|---|---|
| `apps/api/app/api/chat/utils/chat-abort.ts` | `ChatAbortError`, `isChatAbortError`, tracker utilities |
| `apps/api/app/api/chat/utils/chat-abort.test.ts` | Tests for all abort utilities |
| `apps/api/app/api/chat/chat.controller.ts` | Controller catch block (Layer 1) |
| `apps/api/app/main.ts` | Process handler (Layer 2) |
