---
title: 'Chat RPC WebSocket Disconnection Audit'
description: 'Root-cause investigation of "WebSocket client disconnected before RPC execution completed" failures during long-running tool calls, with prod-grade hardening recommendations.'
status: draft
created: '2026-05-15'
updated: '2026-05-15'
category: investigation
related:
  - docs/research/websocket-resilience.md
  - docs/research/resumable-chat-streams.md
  - docs/research/parallel-tool-call-incremental-persistence.md
  - docs/policy/chat-rpc-error-handling-policy.md
---

# Chat RPC WebSocket Disconnection Audit

Root-cause investigation of the `CLIENT_DISCONNECTED` / "WebSocket client disconnected before RPC execution completed" failures observed when the agent runs `test_model` (and other long-running tools) against complex CAD models, plus a tactical hardening list to make the chat RPC channel production-grade.

## Executive Summary

The error surfaced in the attached transcript is **not** an idle-timeout drop — Socket.IO's heartbeat keeps the connection alive against every plausible NAT/proxy timeout in the stack (Fly Proxy, browser, OS). The smoking gun is that the **WebSocket session genuinely terminates mid-RPC** and the server's `socket.timeout(60s).emitWithAck(...)` rejects with `socket.connected === false`, which is the only path that yields the literal message in `chat-rpc.service.ts:331`.

The two leading proximate causes for the transcript's `test_model` failures are (in priority order):

1. **`maxHttpBufferSize` overflow on the inbound `rpc_response`** — `fetch_geometry`'s GLB payload for an 8-rack data center (≈800+ replicad shapes, multi-MB-per-rack OCCT BREP) plausibly exceeds the 50 MB server cap, at which point Socket.IO closes the connection with WS code 1009 (Message Too Big). The four sequential `Connection Lost test_model` rows in the transcript are consistent with this — every retry rebuilds the same oversized GLB and gets killed identically.
2. **Renderer worker / tab crash under memory pressure** — replicad's `fuse` + OCCT BREP for hundreds of shapes can OOM the renderer worker or the tab itself, severing the WS in the process. Once the tab dies, every subsequent RPC fails with `CLIENT_DISCONNECTED` because the SSE stream's `'close'` listener fires and `registerChatAbort` permanently marks the chat aborted (within `abortCleanupDelay = 5000ms`).

Independently, the audit surfaces eight production-grade gaps in the RPC layer (no per-RPC timeout override, no idempotent retry, no chunking/streaming for binary payloads, no CSR rejoin on the server, no surfacing of WS close codes, no application-level health pings, etc.) which collectively explain why one bad payload or one tab hiccup turns into a non-recoverable cascade rather than a transient blip.

The reference doc `docs/research/websocket-resilience.md` already enumerates the failure-mode taxonomy at scale; this doc is the **targeted root-cause analysis** of the observed transcript plus the concrete code-level changes that would have prevented it.

## Table of Contents

- [Problem Statement](#problem-statement)
- [Methodology](#methodology)
- [Architecture Overview](#architecture-overview)
- [Findings](#findings)
- [Root-Cause Verdict](#root-cause-verdict)
- [Recommendations](#recommendations)
- [Code Examples](#code-examples)
- [References](#references)

## Problem Statement

The transcript at `Downloads/initial_design_2026-05-15T01-51.md` shows the agent successfully:

- Reading `main.ts`, listing the workspace
- Writing `lib/{server,rack,crac,floor,overhead}.ts` and `main.ts` (~700+ lines of replicad code)
- Calling `get_kernel_result` four times against `main.ts` / `lib/server.ts` / `lib/rack.ts` / `lib/crac.ts` — all returning `Status: ready`

…then **every subsequent `test_model` call fails immediately**:

```
[Error: {"errorCode":"CLIENT_DISCONNECTED","message":"WebSocket client
disconnected before RPC execution completed.","toolName":"test_model",
"toolCallId":"toolu_01GSeTd4zuk4fPvqB78sw8oR"}]
```

This repeats four times back-to-back with different tool-call IDs, producing the visible "Connection Lost" rows in the chat UI. The agent eventually self-diagnoses ("The model may be too complex causing timeouts") and starts simplifying the design.

The user-facing question: **is the WebSocket idle-dropping, or is something else going on?** And: **what would make this RPC channel production-grade?**

### In scope

- Why `test_model` produces `CLIENT_DISCONNECTED` while preceding `get_kernel_result` calls succeed
- Whether Socket.IO's transport-layer behaviour (pings, CSR, buffer caps) explains the failure
- Identifying production-grade gaps (timeouts, retries, payload size, CSR, close-code visibility)

### Out of scope

- Fixing the model-complexity issue itself (separate workflow / prompt-engineering concern, captured implicitly in [Recommendation R8](#recommendations))
- Migrating to a different transport (WebTransport, gRPC) — covered in `docs/research/websocket-resilience.md` §6

## Methodology

1. Traced the literal error string from the transcript to its source: `apps/api/app/api/chat/chat-rpc.service.ts:331`.
2. Walked the failure path back through `socket.timeout(60s).emitWithAck` → Socket.IO ack semantics → `socket.connected` check.
3. Read the wire configuration on both ends (`apps/api/app/api/websocket/{redis-io.adapter,dev-websocket.service}.ts`, `apps/ui/app/services/chat-rpc-socket.service.ts`).
4. Inspected `tool-test-model.ts` to enumerate which RPCs `test_model` issues and the data-flow shape (each `fetch_geometry` returns a binary GLB).
5. Cross-referenced the existing transport regression suite at `apps/api/app/testing/model-integration.test.ts` ("Chat RPC WebSocket Transport Resilience"), which already documents two of the failure modes I'm flagging here.
6. Validated the abort/idempotency path through `chat.controller.ts` (SSE `'close'` → `AbortController.abort` → `ChatRpcService.registerAbortSignal`).

## Architecture Overview

```
┌──────────────────────┐                     ┌─────────────────────────┐
│   Browser tab        │                     │   API (NestJS+Fastify)  │
│                      │                     │                         │
│  ChatRpcSocketSvc    │  Socket.IO/WS       │  ChatRpcGateway         │
│  (singleton)         │ ◄─────────────────► │  (Redis Streams adapter │
│                      │  /v1/chat/rpc       │   in prod, DevWebSocket │
│  rpc-handlers.ts     │                     │   in dev on PORT+1)     │
│  (executeRpcCall)    │                     │                         │
│                      │                     │  ChatRpcService         │
│  emitWithAck reply   │                     │   .sendRpcRequest()     │
│  ◄────────── ack     │                     │   ─emitWithAck(60s)──►  │
│   (binary GLB,       │                     │                         │
│    tool result)      │                     │                         │
└──────────────────────┘                     └─────────────────────────┘
                                                        ▲
                                                        │ (in-process)
                                                        │
                                                LangGraph tool runtime
                                                (test_model → many
                                                 fetch_geometry RPCs
                                                 in Promise.all)
```

Key contracts:

- `ChatRpcService.sendRpcRequest()` uses `socket.timeout(60_000).emitWithAck('rpc_request', …)` with one socket per chat room
- The error at `chat-rpc.service.ts:328-336` distinguishes `TIMEOUT` (still connected) from `CLIENT_DISCONNECTED` (socket dead) via `socket.connected` at catch time
- Server caps `maxHttpBufferSize: 50 MB` (`redis-io.adapter.ts:61`, `dev-websocket.service.ts:189`)
- Server `pingTimeout: 30_000`, default `pingInterval: 25_000` ⇒ unhealthy connection detected within ~55s
- `connectionStateRecovery` enabled (`maxDisconnectionDuration: 2 min`, `skipMiddlewares: true`) but the gateway never handles the `recovered` flag
- Client config has **no** `maxHttpBufferSize`, **no** `pingInterval`/`pingTimeout` overrides (uses Socket.IO defaults), exponential backoff up to 5 s

## Findings

### Finding 1: The error surfaces only when the WS truly disconnected mid-RPC

There are exactly three branches in `ChatRpcService.sendRpcRequest` that produce `errorCode: 'CLIENT_DISCONNECTED'`:

| Branch                                               | Message                                                           | Trigger                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| `abortedChats.has(chatId)` early return (line 245)   | `"Chat request was cancelled."`                                   | SSE close fired — user navigated/aborted        |
| Catch block, `socket.connected === false` (line 331) | `"WebSocket client disconnected before RPC execution completed."` | The WS actually went down between emit and ack  |
| Catch block, `socket.connected === true` (line 330)  | `"RPC execution timed out after 60 seconds…"`                     | Reports as `TIMEOUT`, not `CLIENT_DISCONNECTED` |

The transcript shows the **second message verbatim**, so the cause is a real WebSocket termination — not an SSE-close abort and not a 60 s timeout. This is the load-bearing data point for everything that follows.

### Finding 2: Socket.IO heartbeats rule out idle drop

```
pingInterval (default) = 25_000 ms  (server → client every 25 s)
pingTimeout              = 30_000 ms  (client must respond within 30 s)
=> failure detected ≤ 55 s of silence
```

Every potential idle-timeout in the stack is **longer or comparable** to the 25 s ping cadence:

| Hop                   | Idle timeout                                 | Survives 25 s pings? |
| --------------------- | -------------------------------------------- | -------------------- |
| Fly Proxy (public)    | configurable; documented stable              | Yes                  |
| Browser-OS NAT/router | 5–30 min for home routers, 350 s for AWS NAT | Yes                  |
| Server `pingTimeout`  | 30 s                                         | Yes                  |

Idle drop is therefore **not** a credible explanation for the failure cadence in the transcript (sub-second from emit to error). The connection is being terminated by something that doesn't care about pings.

### Finding 3: The transcript pattern matches inbound payload-overflow

The bracketed sequence `Connection Lost test_model` × 4 is a smoking gun: each retry produces an essentially identical RPC fan-out (`fetch_geometry` per file in `Promise.all` — see `tool-test-model.ts:147-184`), and an essentially identical GLB. If one rendering path produces a GLB that exceeds `maxHttpBufferSize: 50e6`, then **every retry will be killed in the same place**.

Quick capacity envelope for the transcript's design:

```
8 racks × ~80 ShapeConfigs/rack (chassis + bezel + 36-outlet PDU + drive
strips + LEDs + fan tray + frame posts + rails + side panels + door)
+ 2 CRAC units × ~30 ShapeConfigs (body + grille + 12 louvres + panel +
side vents)
+ 1 floor × (9×10 = 90 tiles + ~8 perforated grilles + structural slab
+ pedestal grid)
+ overhead trays (rails + ~25 rungs/tray + cable bundles) × 4 + cross trays
+ ceiling + walls + UPS

Approximate part count: 1,000–1,500 ShapeConfigs
```

Each part is a separate OCCT BREP. With colored mesh-grouping and per-part normal/index buffers in glTF binary mode, **multi-MB-per-rack is realistic** and the cumulative GLB easily breaches 50 MB.

`apps/api/app/testing/model-integration.test.ts:541-602` already documents this exact failure mode:

> _"Socket.IO killed the connection because the payload exceeded maxHttpBufferSize (1MB default)"_

…with the test asserting that bumping the cap to `10e6` keeps the connection alive for a 2 MB GLB. There is **no test for the 50 MB ceiling**, and no telemetry on payload size at the close-frame boundary.

This is the most likely proximate cause for the transcript.

### Finding 4: Tab/worker OOM is the secondary candidate

The model the agent built triggers hundreds of replicad operations (e.g., `chassis.fuse(bezel)` per server, ~16 servers/rack × 8 racks). OCCT BREP fuses are memory-heavy. If the renderer worker or tab OOMs:

- The tab dies → WS goes with it
- The chat SSE response's `'close'` listener fires → `registerChatAbort(chatId)` → `abortController.abort()`
- Every subsequent `sendRpcRequest` returns `CLIENT_DISCONNECTED` for the next 5 s (`abortCleanupDelay`), then `NO_CONNECTION` after that

The transcript's four rapid retries fall entirely inside the 5 s abort window, which is consistent with the OOM hypothesis. **Distinguishing this from the payload-overflow hypothesis would require WS close-code observability** (currently not surfaced — see Finding 7).

### Finding 5: Connection State Recovery (CSR) is half-wired

Both server adapters configure CSR:

```ts
connectionStateRecovery: {
  maxDisconnectionDuration: 2 * 60 * 1000,
  skipMiddlewares: true,
},
```

But:

- `ChatRpcGateway` never reads `socket.recovered` on connection (`socket.recovered === true` means the session resumed and the client kept the same `socket.id`).
- `ChatRpcService.handleSocketDisconnect()` (`chat-rpc.service.ts:122`) wipes the connection set on **every** disconnect, including the transient ones CSR was designed to mask. This loses the chat-room registration even when the underlying transport recovers cleanly.
- The client emits a fresh `'join'` on every `'connect'` and `'reconnect'` event (`chat-rpc-socket.service.ts:236-238, 298-300`), which works around (but does not exploit) CSR.

Net effect: CSR is configured to buy the system a 2-minute reconnection window, but the application layer doesn't use it — every reconnect goes through full re-authentication and re-join. CSR's `skipMiddlewares: true` is also a no-op for the same reason.

### Finding 6: `emitWithAck` does not survive reconnection

`emitWithAck` adds a per-emit ack ID to Socket.IO's outbound queue and waits for the matching reply. **If the underlying transport disconnects and reconnects between `emit` and `ack`, the ack reference is dropped silently** — Socket.IO does not replay un-acked outbound RPCs across CSR boundaries (the docs explicitly note CSR replays _server→client missed packets_, not in-flight acks).

This means even with full CSR + room rejoin, in-flight RPCs at the moment of disconnect always fail. The RPC layer needs **its own retry-with-idempotency-key** if we want transient WS hiccups to be invisible to the agent.

### Finding 7: WS close codes are not surfaced

`chat-rpc.service.ts:327` does a bare `catch { }` and only inspects `socket.connected`. The Socket.IO/`ws` library exposes the close code on the engine packet (1006 abnormal, 1009 message too big, 1011 internal error, etc.), but it's neither logged nor included in the error. Likewise:

- `MetricsService.wsDisconnections` records the _socket.io reason string_ (`transport close`, `ping timeout`, etc.), not the underlying WS code
- The client logs `(reason: ${reason})` in `chat-rpc-socket.service.ts:246` but doesn't propagate the code/reason into the next RPC error

Without close-code visibility, distinguishing payload-overflow (1009) from transport-close (1006) from server-restart (1012) is impossible after the fact. **This is the single biggest observability gap.**

### Finding 8: No per-RPC timeout, no chunking, no streaming for binary payloads

`rpcExecutionTimeout = 60_000` is hard-coded in `chat-rpc.service.ts:21` and applies uniformly to every RPC. For `fetch_geometry` against a complex model:

- Render + `replicad.export('gltf')` can take 30–60 s easily on a complex scene
- Marshalling a multi-MB binary GLB through Socket.IO's MessagePack encoder adds non-trivial CPU
- A single ack carries the entire payload — there is no chunking, no progress, no resumability

Combined with Finding 3's 50 MB cap, this means: **the largest model that can ever round-trip is bounded by `maxHttpBufferSize`**, with no graceful degradation. The agent has to discover this bound by trial-and-error on every model.

### Finding 9: Auth race in dev mode is fixed but the test exposes a still-fragile pattern

Dev mode previously had a documented race where the client emitted `'join'` before the auth `await` completed — silently dropped. The fix moved auth to Socket.IO middleware (`server.use(...)` in `chat-rpc.gateway.ts:83-102, 215-234`), which is correct.

However, `handleJoinMessage` still uses a per-handler `try/catch` around `client.join(chatId)` and unregisters on failure — there's no acknowledgment that the room **actually contains the socket** before returning `success: true`. The client retries up to 3 times with linear backoff (`emitJoinWithRetry`), which is good, but the server's success criterion is "no exception thrown" rather than "socket is in the adapter's room set after join". This is robust enough today but brittle if the adapter ever returns mid-failure.

### Finding 10: Application-level health is not pinged

There's no application-level "are you alive?" round-trip. Socket.IO's transport pings only confirm the **TCP socket** is alive — they don't confirm the renderer worker, the file-manager actor, or the screenshot machine on the client are still functioning. A frozen renderer worker plus a still-alive WS produces **timeouts** (which look identical to `CLIENT_DISCONNECTED` from the user's perspective) and the agent has no signal to differentiate them.

## Root-Cause Verdict

Based on the evidence:

| Hypothesis                           | Likelihood                  | Evidence                                                                                               |
| ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| Idle drop / ping timeout             | **Low**                     | `pingInterval = 25 s` with `pingTimeout = 30 s` — no idle path in the stack would breach this          |
| `maxHttpBufferSize` overflow on GLB  | **High**                    | 4 identical retry failures, complex 1k+ shape model, existing transport test documents this exact mode |
| Tab/worker OOM during render         | **Medium**                  | Plausible given OCCT memory cost; cannot be confirmed without WS close code or browser perf telemetry  |
| Server crash / Fly machine migration | **Very low**                | Would also break `get_kernel_result` retries; transcript shows it doesn't                              |
| Auth-middleware race (Finding 9)     | **None**                    | Was fixed; only relevant for _initial_ connection, not mid-RPC                                         |
| `emitWithAck` lost across CSR        | **Low for this transcript** | Would require an actual transient reconnect; not what's happening here, but a real prod risk           |

**Verdict:** The transcript shows the WebSocket genuinely terminated mid-`test_model`. The dominant cause is **inbound `rpc_response` payload overflow**, with **renderer-worker / tab OOM** as the secondary candidate. **Idle disconnect is ruled out** by the ping configuration. The handful of architectural gaps (Findings 5–10) is what turns one bad payload into a non-recoverable cascade rather than a one-time blip.

## Recommendations

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                  | Priority | Effort  | Impact                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| R1  | **Surface WS close codes end-to-end.** Capture the `ws` close code on the engine `close` packet; add to `wsDisconnections` metric label set; include in the `CLIENT_DISCONNECTED` RPC error so the agent (and ops) know whether it was 1006/1009/1011/1012.                                                                                                                             | P0       | Low     | High — currently flying blind; this is the prerequisite for every other diagnostic                              |
| R2  | **Stream/chunk binary GLB payloads** instead of sending one monolithic ack. Either use Socket.IO binary streaming, server-side artifact storage with a fetched URL, or chunked frames with a sequence ID. Removes the 50 MB cliff entirely.                                                                                                                                             | P0       | Medium  | High — eliminates the most likely root cause of this transcript                                                 |
| R3  | **Per-RPC timeouts** instead of a 60 s blanket. `fetch_geometry` and `capture_observations` need 90–120 s; `read_file`/`stat`/`exists` should be ≤ 5 s. Pulls fast-path errors forward and gives complex renders room to breathe.                                                                                                                                                       | P1       | Low     | High — better UX and faster diagnosis                                                                           |
| R4  | **Idempotent retry with idempotency key** at the RPC layer for read-only RPCs (`fetch_geometry`, `capture_screenshot`, `get_kernel_result`, `read_file`, `list_directory`, `stat`, `exists`). Server caches responses keyed by `(chatId, toolCallId, rpcName)` for 5 min; on `CLIENT_DISCONNECTED`, the agent retries once transparently before bubbling.                               | P1       | Medium  | High — masks transient WS hiccups (ties into [Finding 6](#finding-6-emitwithack-does-not-survive-reconnection)) |
| R5  | **Wire CSR through the application layer.** On `connection`, branch on `socket.recovered`: if `true`, skip `chatOwners` clear / `connections` rebuild and assert the rooms still contain the socket. If `false` and the same `socket.id` is in `ChatRpcService.connections` already, log a recovery event.                                                                              | P1       | Low     | Medium — exploits the 2-min recovery window already paid for in infra cost                                      |
| R6  | **Application-level health ping.** Add a lightweight `health_ping` RPC the server sends every 30 s during long-running tool calls; the client responds with `{ workerAlive: bool, fmReady: bool, graphicsReady: bool }`. Use the response to distinguish "WS alive but worker frozen" from real disconnects, and to surface a typed `RENDERER_FROZEN` error instead of `TIMEOUT`.       | P1       | Medium  | Medium — closes the diagnostic gap in [Finding 10](#finding-10-application-level-health-is-not-pinged)          |
| R7  | **Pre-flight payload-size guard on the client.** Before emitting an `rpc_response` containing binary data, check `data.byteLength` against an advertised server limit (negotiated on `connect`). If over, return a typed `PAYLOAD_TOO_LARGE` error with the actual size, so the agent can decompose the request rather than the connection getting killed.                              | P1       | Low     | Medium — fails closed gracefully instead of dropping the WS                                                     |
| R8  | **Memory-pressure escape valve in the renderer.** Add a soft cap on per-tool `ShapeConfig` count (e.g. 2 000) that surfaces a typed `MODEL_TOO_COMPLEX` error to the agent before the worker OOMs. Pair with a system-prompt note that nudges decomposition (a single `Promise.all` of 8 racks at full detail is a known bad shape — split or LOD).                                     | P1       | Medium  | Medium — turns a fatal crash into a recoverable bounded failure                                                 |
| R9  | **Symmetric `maxHttpBufferSize` and ping config on the client.** Currently the client uses Socket.IO defaults; explicitly set `pingInterval`/`pingTimeout` to match the server (25 s / 30 s). Document the negotiated values.                                                                                                                                                           | P2       | Trivial | Low — config drift insurance                                                                                    |
| R10 | **Add transport-layer telemetry tests.** Extend `apps/api/app/testing/model-integration.test.ts` with: (a) the 50 MB cliff (asserts payloads at 49 MB succeed and 51 MB return `PAYLOAD_TOO_LARGE`, not `CLIENT_DISCONNECTED`); (b) idempotent retry across a forced reconnect; (c) CSR `recovered: true` path.                                                                         | P2       | Medium  | Medium — locks the fixes in regression-style                                                                    |
| R11 | **Persist GLBs server-side; round-trip a URL, not bytes.** For `fetch_geometry` specifically (the only RPC sending non-trivial binary), the client could `PUT` to `/v1/artifacts/{toolCallId}` over HTTP and the RPC ack carries `{ artifactPath, contentLength }`. Sidesteps the WS frame-size limit entirely and benefits from Fastify's standard backpressure / multipart machinery. | P2       | High    | High (when shipped) — but R2 is a faster route to the same outcome                                              |
| R12 | **Dual error-code distinction for the agent.** Today both "WS closed mid-RPC" and "user aborted" surface as `CLIENT_DISCONNECTED`. Split into `WS_DISCONNECTED` (transport failure, retryable) vs `CHAT_ABORTED` (intentional cancellation, terminal) so the safeguards/interrupt-recovery middleware doesn't conflate them.                                                            | P2       | Low     | Medium — better recovery UX                                                                                     |

## Code Examples

### R1: Capture and propagate close codes (sketch)

```typescript
// apps/api/app/api/websocket/redis-io.adapter.ts — capture engine close
server.engine.on('connection', (rawSocket: { on: (event: string, fn: (code: number, reason: Buffer) => void) => void; id: string }) => {
  rawSocket.on('close', (code, reason) => {
    this.logger.warn(`Engine close: id=${rawSocket.id} code=${code} reason=${reason.toString()}`);
  });
});

// apps/api/app/api/chat/chat-rpc.service.ts — surface in error
} catch (rpcError) {
  const wsCloseCode = (socket as Socket & { conn?: { transport?: { ws?: { _closeCode?: number } } } })
    .conn?.transport?.ws?._closeCode;
  const errorCode = socket.connected ? 'TIMEOUT' : 'CLIENT_DISCONNECTED';
  return {
    errorCode,
    rpcName,
    message: socket.connected
      ? `RPC execution timed out after ${rpcExecutionTimeout / 1000}s.`
      : `WebSocket closed mid-RPC (close=${wsCloseCode ?? 'unknown'}).`,
    ...(wsCloseCode ? { wsCloseCode } : {}),
  };
}
```

### R3: Per-RPC timeouts

```typescript
// libs/chat/src/schemas/rpc.schema.ts — extend the registry
export const rpcTimeouts: Record<keyof RpcSchemasRegistry, number> = {
  read_file: 5_000,
  list_directory: 5_000,
  stat: 5_000,
  exists: 5_000,
  fetch_geometry: 120_000,
  capture_screenshot: 60_000,
  capture_observations: 90_000,
  get_kernel_result: 60_000,
  // …
};

// chat-rpc.service.ts
const timeout = rpcTimeouts[rpcName];
const response = await socket.timeout(timeout).emitWithAck('rpc_request', rpcRequest);
```

### R4: Server-side idempotent retry (sketch)

```typescript
// chat-rpc.service.ts
private readonly idempotentResults = new Map<string, { result: unknown; expiresAt: number }>();

public async sendRpcRequest<T extends keyof RpcSchemasRegistry>(request: {...}): Promise<...> {
  const idempotencyKey = `${request.chatId}:${request.toolCallId}:${request.rpcName}`;
  const cached = this.idempotentResults.get(idempotencyKey);
  if (cached && cached.expiresAt > Date.now() && readonlyRpcs.has(request.rpcName)) {
    return cached.result as RpcResult<T>;
  }
  // …existing flow…
  if (readonlyRpcs.has(request.rpcName)) {
    this.idempotentResults.set(idempotencyKey, { result: validated.data, expiresAt: Date.now() + 5 * 60_000 });
  }
}
```

### R5: CSR-aware connection handler

```typescript
// chat-rpc.gateway.ts
public handleConnection(client: Socket): void {
  if (import.meta.env.DEV) return;
  if (client.recovered) {
    this.logger.debug(`Recovered session: ${client.id} (rooms preserved)`);
    return;
  }
  this.logger.debug(`Fresh connection: ${client.id} (user: ${client.data.userId})`);
}
```

## References

- `apps/api/app/api/chat/chat-rpc.service.ts` (lines 21, 236–337) — RPC service, error branches
- `apps/api/app/api/chat/chat-rpc.gateway.ts` — Socket.IO gateway, dev/prod split
- `apps/api/app/api/websocket/redis-io.adapter.ts` — production transport config
- `apps/api/app/api/websocket/dev-websocket.service.ts` — dev transport config
- `apps/ui/app/services/chat-rpc-socket.service.ts` — client singleton, reconnection logic
- `apps/api/app/api/tools/tools/tool-test-model.ts` — `test_model` fan-out shape
- `apps/api/app/testing/model-integration.test.ts:466-1084` — existing transport regression suite
- Related: `docs/research/websocket-resilience.md` — full failure-mode taxonomy (R1–R13 there are the _strategic_ track; this doc's R1–R12 are the _tactical_ track for the observed transcript)
- Related: `docs/research/resumable-chat-streams.md` — SSE-side resumability (the same lossy-mid-stream pattern at the chat-stream layer)
- Related: `docs/research/parallel-tool-call-incremental-persistence.md` — why losing parallel tool results on disconnect is uniquely bad
- Socket.IO Connection State Recovery: <https://socket.io/docs/v4/connection-state-recovery>
- WebSocket close codes (RFC 6455 §7.4): <https://www.rfc-editor.org/rfc/rfc6455#section-7.4>
