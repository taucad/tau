---
title: 'Chat RPC Error Handling Policy'
description: "Internal reference for the Socket.IO RPC layer connecting the API's LangGraph agent to browser-side tool execution. Covers error model, abort lifecycle, timer management, and connection handling."
status: active
created: '2026-02-18'
updated: '2026-06-19'
related:
  - docs/policy/api-error-policy.md
  - docs/policy/rpc-policy.md
  - docs/research/chat-client-abort-api-crash.md
  - docs/research/chat-post-tool-abort-unhandled-rejection.md
---

# Chat RPC Error Handling Policy

Internal reference for the Socket.IO RPC layer that connects the API's LangGraph agent to browser-side tool execution.

## Rationale

The RPC layer bridges server-side LangGraph tool calls with client-side execution. Structured errors (never thrown exceptions), predictable abort handling, and strict timer/connection cleanup ensure reliable tool execution and prevent resource leaks when users disconnect or cancel requests.

## Error Model

All errors produced by `ChatRpcService` are structured objects — never thrown exceptions. `sendRpcRequest` always resolves; it never rejects. The caller distinguishes success from failure using type guards (`isRpcExecutionError`, `isRpcClientError`).

### RPC Execution Errors

Infrastructure-level failures that prevent the RPC from completing. Produced by `ChatRpcService` itself.

| Error Code               | Trigger                                                                                         | Resolution                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `TIMEOUT`                | No response received within 60 seconds                                                          | Client may be unresponsive; tool layer reports timeout |
| `CLIENT_DISCONNECTED`    | Abort signal had already fired, socket disconnected before acknowledgement, or server shut down | Request was cancelled or connection lost               |
| `NO_CONNECTION`          | No connected socket exists for the chatId                                                       | User closed/navigated away from the page               |
| `UNHANDLED_CLIENT_ERROR` | Client returned an `error` field in `RpcResponse`                                               | Client-side execution failed; error message forwarded  |

### RPC Validation Errors

Schema validation failures on input or output data.

| Error Code                 | Trigger                                                     | Resolution                            |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| `INPUT_VALIDATION_FAILED`  | `args` don't match the RPC's Zod input schema               | LLM provided malformed arguments      |
| `OUTPUT_VALIDATION_FAILED` | Client's `result` doesn't match the RPC's Zod result schema | Client returned unexpected data shape |

### Client Errors

Domain-level errors returned by the client (e.g., `FILE_NOT_FOUND`). These pass through `ChatRpcService` validation as valid results — they are handled at the tool layer via `isRpcClientError()`.

#### Errno-based Classification

`getErrorCode()` classifies raw filesystem errors into `RpcClientErrorCode` values. The **primary signal** is the POSIX `error.code` property (e.g., `'ENOENT'`, `'EACCES'`), looked up in the `errnoToRpcCode` mapping:

| `error.code` | `RpcClientErrorCode` |
| ------------ | -------------------- |
| `ENOENT`     | `FILE_NOT_FOUND`     |
| `EACCES`     | `PERMISSION_DENIED`  |
| `EPERM`      | `PERMISSION_DENIED`  |

All filesystem implementations must set `error.code` on thrown errors:

- **ZenFS** (kerium `Exception`): sets `code` automatically via `Errno` enum.
- **Node.js** (`ErrnoException`): sets `code` natively.
- **`fromMemoryFs`**: sets `code` via `(error as NodeJS.ErrnoException).code = 'ENOENT'`.
- **Filesystem bridge**: preserves `error.code` across worker boundaries via `BridgeError`.

When `error.code` is absent or unrecognized, `getErrorCode()` falls back to substring matching on `error.message` (e.g., `'not found'`, `'no such file'`, `'enoent'`). This fallback exists for defense-in-depth but should not be the primary classification path for any known filesystem implementation.

## Error Propagation Flow

```
RPC Layer (ChatRpcService)
  │
  │  Returns: RpcResult<T> | RpcExecutionError | RpcValidationError
  │
  ▼
Tool Layer (tool implementations)
  │
  │  assertRpcExecution() / assertRpcSuccess()
  │  rpcErrorToToolError()
  │  Throws: ToolError
  │
  ▼
Tool Error Handler Middleware (toolErrorHandlerMiddleware)
  │
  │  Catches ToolError, unstructured errors
  │  Returns: ToolMessage with JSON content + status: 'error'
  │
  ▼
Stream Error Transform (createErrorTransform)
  │
  │  Normalizes stream-level errors into ChatError JSON
  │
  ▼
UI (frontend)
  │
  │  isToolExecutionError() type guard on ToolMessage content
  │  ChatError parsing for stream errors
```

### Tool Layer Assertion Patterns

- `assertRpcExecution(result, toolName, toolCallId)` — Throws `ToolError` for `RpcExecutionError` and `RpcValidationError`. Lets `RpcClientError` pass through for custom handling (e.g., `FILE_NOT_FOUND` uses default content).
- `assertRpcSuccess(result, toolName, toolCallId)` — Throws `ToolError` for any non-success result, including client errors. Use for the common case where any error should fail the tool.

## Abort Signal Lifecycle

The abort signal connects the SSE response stream to the RPC layer. The implementation records aborted chats so new RPC calls fail promptly after a client stop and maintains a pending-request registry so already-awaited `emitWithAck()` calls resolve promptly on abort.

### Registration

1. `ChatController.createChat()` creates an `AbortController`.
2. The controller listens on `response.raw.on('close')` — fires when the SSE client disconnects.
3. `chatRpcService.registerAbortSignal(chatId, signal)` is called before the LangGraph stream starts.
4. The same signal is passed to `agent.graph.stream()` so LangGraph also stops on abort.

### Abort Handling

When the signal fires:

1. `chatId` is added to `abortedChats`.
2. Pending `sendRpcRequest` calls for that chatId are resolved with `CLIENT_DISCONNECTED`.
3. New `sendRpcRequest` calls for that chatId return `CLIENT_DISCONNECTED` during the cleanup window.
4. The abort listener is removed from the signal.
5. A 5-second cleanup timer is scheduled (see Timer Management).

An RPC call that has already entered `socket.timeout(...).emitWithAck(...)` must race the Socket.IO acknowledgement against the pending-request abort promise. Abort wins with `CLIENT_DISCONNECTED`; late acknowledgements are caught and ignored by the already-settled outcome.

### Re-registration Invariants

When `registerAbortSignal` is called for a chatId that already has state:

1. Any existing cleanup timer for that chatId is **cancelled** via `cancelAbortCleanupTimer()`.
2. The chatId is removed from `abortedChats`.
3. Fresh abort handling is set up for the new signal.

This ensures that a user who cancels request A and immediately sends request B will not have request B's RPCs incorrectly rejected by stale state from request A.

## Timer Management Rules

Every Tau-owned `setTimeout` in `ChatRpcService` must be tracked and cancellable:

| Timer              | Storage                  | Cancelled by                                        |
| ------------------ | ------------------------ | --------------------------------------------------- |
| Abort cleanup (5s) | `abortCleanupTimers` Map | New `registerAbortSignal` for same chatId, shutdown |

The RPC execution timeout is delegated to Socket.IO via `socket.timeout(rpcExecutionTimeout).emitWithAck(...)`; Tau does not store a `PendingRequest.timeoutId` for it. Tau does store pending request resolvers in `pendingRpcRequests` so request-level abort and shutdown can settle in-flight RPCs before the Socket.IO timeout expires.

### Invariants

- Every `setTimeout` call must store the returned timer ID in a tracked data structure.
- Every code path that invalidates a timer must call `clearTimeout` on it.
- `onModuleDestroy` must clear all timers of all types.
- Cleanup timer callbacks must remove their own entry from `abortCleanupTimers` when they fire.

## Connection Management

### Multi-tab Support

- `connections` maps each chatId to a `Set<Socket>`.
- Multiple browser tabs can join the same chat room.
- RPC requests are sent to **one** connected socket (the first found), not broadcast.
- In-flight `emitWithAck()` calls are also represented in Tau's `pendingRpcRequests` map so chat abort and module shutdown can resolve them promptly.

### Disconnect Ordering

When a socket disconnects (`handleSocketDisconnect`):

1. The socket is removed from all chat room sets.
2. For each chat where `socketSet.size === 0` after removal, the `connections` entry and ownership entry are deleted.
3. In-flight `emitWithAck()` calls either observe the socket disconnect through Socket.IO and resolve as `CLIENT_DISCONNECTED`, or resolve earlier if the chat abort signal fires.
4. Chat rooms with remaining sockets are unaffected.

### Connection vs. Abort

These are independent mechanisms:

- **Connection tracking** handles socket-level events (join, leave, disconnect).
- **Abort tracking** handles request-level events (SSE stream closed by client).
- Connection tracking affects socket availability and in-flight Socket.IO acknowledgement behavior. Abort tracking blocks new RPC calls during the aborted-chat cleanup window.
- A chat can be aborted while sockets remain connected (user clicked "stop" but the tab is still open).

## Cleanup Invariants

### On Client Disconnect (last socket)

1. Remove `connections` entry for chatId.
2. Remove chat ownership for chatId.
3. Let in-flight `emitWithAck()` calls observe the socket disconnect and return `CLIENT_DISCONNECTED`.

### On Abort Signal

1. Add chatId to `abortedChats`.
2. Resolve pending RPCs for that chatId with `CLIENT_DISCONNECTED`.
3. Block new RPC calls for that chatId with `CLIENT_DISCONNECTED`.
4. Schedule 5-second cleanup timer (tracked in `abortCleanupTimers`).

### On New Request (re-registration)

1. Cancel any stale cleanup timer for chatId.
2. Remove chatId from `abortedChats`.
3. Register new abort signal listener.

### On Module Destroy (shutdown)

1. Clear `connections`.
2. Clear chat ownership.
3. Clear all abort cleanup timers (`clearTimeout` each, then `.clear()`).
4. Remove active abort listeners.
5. Resolve all pending RPCs with `CLIENT_DISCONNECTED`.
6. Clear `abortedChats`.

## Pre-stream vs. Stream Errors

Errors can occur before or during the SSE stream:

| Phase                           | Handler                                   | Format                                               |
| ------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| Pre-stream (HTTP exceptions)    | `ChatExceptionFilter`                     | `ChatError` JSON in HTTP response body               |
| During stream (LLM/tool errors) | `createErrorTransform` + `normalizeError` | `ChatError` JSON in SSE error chunk                  |
| During stream (tool execution)  | `toolErrorHandlerMiddleware`              | `ToolMessage` with JSON `ToolExecutionError` content |

All three paths produce structured error objects that the frontend can parse and display consistently.

## Testing Requirements

The following scenarios must have unit test coverage:

### Timer Management

- Stale cleanup timer from request A must not clear request B's abort entry.
- Rapid abort -> re-register -> abort cycles must not cause timer interference.
- Re-registering a signal must cancel the previous cleanup timer.

### Module Lifecycle

- `onModuleDestroy` must clear all abort cleanup timers (no timer fires after destroy).
- `onModuleDestroy` must remove active abort listeners.
- `onModuleDestroy` must resolve all pending RPC requests with `CLIENT_DISCONNECTED`.

### Response Handling

- `sendRpcRequest` validates successful `emitWithAck()` results before returning them.
- `sendRpcRequest` resolves with `UNHANDLED_CLIENT_ERROR` when the client acknowledgement contains an `error` field.
- `sendRpcRequest` resolves with `OUTPUT_VALIDATION_FAILED` when the acknowledgement result does not match the RPC schema.

### Disconnect Handling

- `handleSocketDisconnect` removes socket registrations and deletes the chat room only when the last socket is removed.
- `unregisterConnection` preserves other chat rooms and sockets.
- In-flight `emitWithAck()` calls return `CLIENT_DISCONNECTED` through `sendRpcRequest` when Socket.IO surfaces the disconnect before timeout or when the chat abort signal fires first.

### Abort Signal

- Already-aborted signal immediately blocks RPCs.
- Abort during flight blocks new RPCs and resolves already in-flight RPCs with `CLIENT_DISCONNECTED`.
- Late acknowledgements after abort must not double-record metrics or change the settled RPC outcome.
- Cleanup timer unblocks RPCs after 5 seconds.
- New registration clears stale abort state within the 5-second window.
