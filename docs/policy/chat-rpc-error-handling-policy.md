# Chat RPC Error Handling Policy

Internal reference for the Socket.IO RPC layer that connects the API's LangGraph agent to browser-side tool execution.

## Error Model

All errors produced by `ChatRpcService` are structured objects — never thrown exceptions. `sendRpcRequest` always resolves; it never rejects. The caller distinguishes success from failure using type guards (`isRpcExecutionError`, `isRpcClientError`).

### RPC Execution Errors

Infrastructure-level failures that prevent the RPC from completing. Produced by `ChatRpcService` itself.

| Error Code | Trigger | Resolution |
|---|---|---|
| `TIMEOUT` | No response received within 60 seconds | Client may be unresponsive; tool layer reports timeout |
| `CLIENT_DISCONNECTED` | Abort signal fired, last socket disconnected, or server shutting down | Request was cancelled or connection lost |
| `NO_CONNECTION` | No connected socket exists for the chatId | User closed/navigated away from the page |
| `UNHANDLED_CLIENT_ERROR` | Client returned an `error` field in `RpcResponse` | Client-side execution failed; error message forwarded |

### RPC Validation Errors

Schema validation failures on input or output data.

| Error Code | Trigger | Resolution |
|---|---|---|
| `INPUT_VALIDATION_FAILED` | `args` don't match the RPC's Zod input schema | LLM provided malformed arguments |
| `OUTPUT_VALIDATION_FAILED` | Client's `result` doesn't match the RPC's Zod result schema | Client returned unexpected data shape |

### Client Errors

Domain-level errors returned by the client (e.g., `FILE_NOT_FOUND`). These pass through `ChatRpcService` validation as valid results — they are handled at the tool layer via `isRpcClientError()`.

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

The abort signal connects the SSE response stream to the RPC layer, ensuring in-flight RPCs are rejected promptly when the client disconnects rather than waiting for the 60-second timeout.

### Registration

1. `ChatController.createChat()` creates an `AbortController`.
2. The controller listens on `response.raw.on('close')` — fires when the SSE client disconnects.
3. `chatRpcService.registerAbortSignal(chatId, signal)` is called before the LangGraph stream starts.
4. The same signal is passed to `agent.graph.stream()` so LangGraph also stops on abort.

### Abort Handling

When the signal fires:

1. `chatId` is added to `abortedChats`.
2. All pending RPC requests for that chatId are resolved with `CLIENT_DISCONNECTED`.
3. The abort listener is removed from the signal.
4. A 5-second cleanup timer is scheduled (see Timer Management).

### Re-registration Invariants

When `registerAbortSignal` is called for a chatId that already has state:

1. Any existing cleanup timer for that chatId is **cancelled** via `cancelAbortCleanupTimer()`.
2. The chatId is removed from `abortedChats`.
3. Fresh abort handling is set up for the new signal.

This ensures that a user who cancels request A and immediately sends request B will not have request B's RPCs incorrectly rejected by stale state from request A.

## Timer Management Rules

Every `setTimeout` in `ChatRpcService` must be tracked and cancellable:

| Timer | Storage | Cancelled by |
|---|---|---|
| RPC execution timeout (60s) | `PendingRequest.timeoutId` | Response received, disconnect, abort, shutdown |
| Abort cleanup (5s) | `abortCleanupTimers` Map | New `registerAbortSignal` for same chatId, shutdown |

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
- Pending requests are only rejected when the **last** socket for a chatId disconnects.

### Disconnect Ordering

When a socket disconnects (`handleSocketDisconnect`):

1. The socket is removed from all chat room sets.
2. For each chat where `socketSet.size === 0` after removal:
   a. The `connections` entry is deleted.
   b. All pending requests for that chatId are resolved with `CLIENT_DISCONNECTED`.
3. Chat rooms with remaining sockets are unaffected.

### Connection vs. Abort

These are independent mechanisms:

- **Connection tracking** handles socket-level events (join, leave, disconnect).
- **Abort tracking** handles request-level events (SSE stream closed by client).
- Both can reject pending requests, but for different reasons.
- A chat can be aborted while sockets remain connected (user clicked "stop" but the tab is still open).

## Cleanup Invariants

### On Client Disconnect (last socket)

1. Remove `connections` entry for chatId.
2. Resolve all pending requests for chatId with `CLIENT_DISCONNECTED`.

### On Abort Signal

1. Add chatId to `abortedChats`.
2. Resolve all pending requests for chatId with `CLIENT_DISCONNECTED`.
3. Schedule 5-second cleanup timer (tracked in `abortCleanupTimers`).

### On New Request (re-registration)

1. Cancel any stale cleanup timer for chatId.
2. Remove chatId from `abortedChats`.
3. Register new abort signal listener.

### On Module Destroy (shutdown)

1. Resolve all pending requests with `CLIENT_DISCONNECTED` and clear timeouts.
2. Clear `pendingRequests`.
3. Clear `connections`.
4. Clear all abort cleanup timers (`clearTimeout` each, then `.clear()`).
5. Clear `abortedChats`.

## Pre-stream vs. Stream Errors

Errors can occur before or during the SSE stream:

| Phase | Handler | Format |
|---|---|---|
| Pre-stream (HTTP exceptions) | `ChatExceptionFilter` | `ChatError` JSON in HTTP response body |
| During stream (LLM/tool errors) | `createErrorTransform` + `normalizeError` | `ChatError` JSON in SSE error chunk |
| During stream (tool execution) | `toolErrorHandlerMiddleware` | `ToolMessage` with JSON `ToolExecutionError` content |

All three paths produce structured error objects that the frontend can parse and display consistently.

## Testing Requirements

The following scenarios must have unit test coverage:

### Timer Management

- Stale cleanup timer from request A must not clear request B's abort entry.
- Rapid abort -> re-register -> abort cycles must not cause timer interference.
- Re-registering a signal must cancel the previous cleanup timer.

### Module Lifecycle

- `onModuleDestroy` must clear all abort cleanup timers (no timer fires after destroy).
- `onModuleDestroy` must resolve all pending requests with `CLIENT_DISCONNECTED`.

### Response Handling

- `handleRpcResponse` resolves pending request with validated result.
- `handleRpcResponse` resolves with `UNHANDLED_CLIENT_ERROR` on client error.
- `handleRpcResponse` logs warning for unknown requestId (no crash).

### Disconnect Handling

- `handleSocketDisconnect` rejects pending requests only when the last socket is removed.
- `unregisterConnection` preserves other chats' pending requests.

### Abort Signal

- Already-aborted signal immediately blocks RPCs.
- Abort during flight rejects pending requests and blocks new ones.
- Cleanup timer unblocks RPCs after 5 seconds.
- New registration clears stale abort state within the 5-second window.
