# RPC Wire Spec — `@taucad/rpc` v1

## Status

**Normative** — version 1 of the wire envelope used by every `Channel<P>` /
`ChannelServer<P>` pair (worker, Electron `MessageChannelMain`, in-process,
multiplex tunnel, WebSocket). All Tau runtime transports MUST
conform to this spec. A non-conforming frame is never acted on: it is
answered with a coded error when it names a return address (see
[Unreadable Frames](#unreadable-frames)) and dropped otherwise.

This document is the authoritative reference cited from
[`packages/rpc/src/wire.ts`](../../packages/rpc/src/wire.ts) and
[`docs/research/runtime-channel-blueprint-v5.md`](../research/runtime-channel-blueprint-v5.md).

## Design Principles

1. **Two-character family-prefixed kind codes.** Each frame's `k` field is a
   two-character ASCII code prefixed by family: RPC (`r*`), notify (`n*`),
   stream (`s*`), lifecycle (`l*`), flow control (`f*`). The prefix lets
   readers and dispatch tables filter by family in O(1) without enumerating
   every code.
2. **Versioned envelope.** Every frame carries `v: 1`. A receiver MUST NOT
   act on a frame whose `v` it does not implement; a request or subscribe
   with a readable `i` is answered with a coded error in the receiver's
   version (`WIRE_VERSION_UNSUPPORTED`, see
   [Unreadable Frames](#unreadable-frames)). This permits forward-compatible
   upgrades (`v: 2`) without ambiguity or a caller left pending.
3. **JSON-cloneable payload, transferables hoisted at the boundary.** The
   wire envelope is structured-clone safe. Transferables (`ArrayBuffer`,
   `MessagePort`, etc.) are extracted at the channel author boundary via
   `WithTransferables` and passed to `port.postMessage(frame, transfer)`,
   keeping the envelope itself free of host-specific objects.
4. **Discriminated union, never magic strings.** All consumers parse the
   wire format through the
   [`WireMessage`](../../packages/rpc/src/wire.ts) discriminated union and
   the [`isWireMessage`](../../packages/rpc/src/wire.ts) type guard. Adding
   a kind requires extending both the union and the guard.
5. **No correlation id for fan-out frames.** `nt` (notify) carries no `i`
   slot; receivers pattern-match on `n` (name). This mirrors LSP
   notifications and keeps the pending-call map free of fan-out traffic.
6. **Handshake-gated readiness.** `Channel.ready` resolves after the server
   emits `lh` (hello). Pre-ready calls queue locally so call sites do not
   need to await the handshake explicitly.
7. **Symmetric graceful close.** Either side may emit `lb` (bye); the other
   side emits its own `lb` and resolves `closed` with origin metadata.

## Frame Catalogue

All frames carry `v: 1`. The optional fields are documented per kind.

### RPC family (`r*`)

| Kind | Direction | Purpose                                       | Required fields                                                                                 | Optional fields |
| ---- | --------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- |
| `rq` | C → S     | Request                                       | `i: string`, `n: string`, `a: unknown`                                                          | —               |
| `rs` | S → C     | Response                                      | `i: string`, `o: 0\|1` plus either `d: unknown` (when `o===1`) or `e: WireError` (when `o===0`) | —               |
| `rc` | C → S     | Cancel a pending `rq` (LSP `$/cancelRequest`) | `i: string`                                                                                     | `e: WireError`  |

`rq.i` is allocated by the client and MUST be unique within the channel
session. `rs.i` and `rc.i` MUST equal the originating `rq.i`.

### Notify family (`n*`)

| Kind | Direction     | Purpose                       | Required fields           |
| ---- | ------------- | ----------------------------- | ------------------------- |
| `nt` | bidirectional | Fire-and-forget event/command | `n: string`, `a: unknown` |

`nt` carries **no** `i` slot. The receiver dispatches by `n` and runs every
registered `onNotify(name)` handler. Handler exceptions are swallowed so a
failing listener cannot stall the channel.

### Stream family (`s*`)

| Kind | Direction | Purpose                               | Required fields                        | Optional fields |
| ---- | --------- | ------------------------------------- | -------------------------------------- | --------------- |
| `ss` | C → S     | Subscribe to a server-pushed iterable | `i: string`, `n: string`, `a: unknown` | —               |
| `sn` | S → C     | Stream chunk                          | `i: string`, `d: unknown`              | —               |
| `sc` | S → C     | Stream completed cleanly              | `i: string`                            | —               |
| `se` | S → C     | Stream errored (terminal)             | `i: string`, `e: WireError`            | —               |
| `su` | C → S     | Consumer-initiated cancel             | `i: string`                            | —               |

The producer SHOULD stop emitting `sn` after observing `su` and SHOULD emit
`sc` once cleanup is complete. Frame ordering is FIFO per stream id.

### Lifecycle family (`l*`)

| Kind | Direction     | Purpose                          | Required fields                                                         | Optional fields       |
| ---- | ------------- | -------------------------------- | ----------------------------------------------------------------------- | --------------------- |
| `lh` | S → C         | Connection-established handshake | `o: 0\|1` plus either `d?: unknown` (success) or `e: WireError` (error) | `d` only with `o===1` |
| `lb` | bidirectional | Graceful close                   | —                                                                       | `r: string` (reason)  |
| `lk` | S → C         | Liveness keepalive               | —                                                                       | —                     |

The server emits exactly one `lh` after the port is wired. Clients MUST NOT
send `rq`/`ss` over the wire until `lh` arrives; locally they queue. After
`lb`, neither side accepts further frames.

`lk` lets a client tell a slow server from a dead one. Both options are in
milliseconds and off by default:

| Option              | Side   | Effect                                                                                     |
| ------------------- | ------ | ------------------------------------------------------------------------------------------ |
| `keepaliveInterval` | server | Send `lk` once the hello is posted, then at this interval until the channel closes         |
| `livenessTimeout`   | client | Close with `PEER_UNRESPONSIVE` (reason `liveness-timeout`) when no frame arrives this long |

- The first `lk` a client receives arms its bound, so a server that never
  sends one (an older peer) stays unbounded. Once armed, every inbound frame
  of any kind re-arms it.
- Time comes from `performance.now()`, never `Date.now()`, so a wall-clock
  step can neither fire nor mask the bound.
- Frozen time does not count. A bound whose timer fires later than its due
  time by more than the observed keepalive interval (the gap between the last
  two `lk` frames; `livenessTimeout / 4` until two have arrived) re-arms once
  for a full window instead of expiring, because a frozen page's timers fire
  late while its peer could not reach it.
- Per-stream connections inside one worker need no keepalive: they share the
  worker's thread, so the control channel's bound covers them.

### Flow control family (`f*`)

Server-pushed streams are credit-bounded. Both kinds flow from the stream
consumer (client) to the producer (server); a client that receives either
logs once at warn level and drops it.

| Kind | Direction | Purpose                                              | Required fields                         |
| ---- | --------- | ---------------------------------------------------- | --------------------------------------- |
| `fa` | C → S     | Acknowledge one handed-off `sn` frame for stream `i` | `i: string`                             |
| `fw` | C → S     | Grant `s` more stream-frame slots for stream id `i`  | `i: string`, `s: number` (positive int) |

The client sends `fw` with its initial window (`initialCredits`, default 16)
right after `ss`, then `fa` plus `fw{s:1}` as each frame is consumed. The
server pulls its iterator only while it holds a credit and its estimated
owned bytes leave room for one more frame (`maxFrameBytes`, default 16 MiB;
`maxOwnedBytes`, default 64 MiB). A grant that would exceed the initial
window, or a frame that exceeds the byte bounds, fails the stream with `se`.

## Error Shape

`WireError` is a structured payload used by `rs` (`o: 0`), `rc` (optional),
`se`, and `lh` (`o: 0`):

```ts
type WireError = {
  readonly m: string; // human-readable, mandatory
  readonly c?: string | number; // machine-readable code
  readonly s?: string; // optional stack (dev only)
};
```

Receivers MUST treat `m` as the only mandatory field. `c` allows
machine-readable taxonomies (e.g. `"NoSettledRenderError"`); `s` carries
stack traces in development mode. A thrown error's `code` travels as `c`,
and the receiving end copies `c` back onto `error.code`. The channel itself
answers with these codes:

| `c`                        | Meaning                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `WIRE_VERSION_UNSUPPORTED` | The frame's `v` is not the receiver's version                   |
| `FRAME_UNREADABLE`         | The frame's `v` matches but it fails the envelope schema        |
| `WIRE_VALIDATION_FAILED`   | The call or listen args failed the receiver's `protocolSchemas` |

## Unreadable Frames

Before either end drops a frame that fails `isWireMessage`, it looks for a
return address: a string `k` and a non-empty string `i`.

- A server answers an unreadable `rq` with `rs{i, o:0, e:{m, c}}` and an
  unreadable `ss` with `se{i, e:{m, c}}`, in wire v1. `c` is
  `WIRE_VERSION_UNSUPPORTED` when `v !== 1`, otherwise `FRAME_UNREADABLE`.
- A client that receives an unreadable `rs` naming a pending call rejects
  that call, and an unreadable `sn`/`sc`/`se` naming a live listen fails that
  listen (and sends `su`), with an error whose `code` follows the same rule.
- A frame without a readable id is dropped; a known kind with the wrong
  version is reported once at warn level.

## Close Codes

Every close carries a code on `CloseInfo.code` (`onClose` listeners) and on
`ChannelClosedError.code`:

| Code                | When                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `CHANNEL_CLOSED`    | This end closed the channel (`close()`/`dispose()`)                                          |
| `PEER_CLOSED`       | The peer said bye (`lb`)                                                                     |
| `PEER_GONE`         | The port reported its own death; only Node sockets and `worker_threads` ports fire this      |
| `PEER_UNRESPONSIVE` | The liveness, close-handshake or hello bound expired; a dead browser peer shows only as this |

On close, every pending call, queued (pre-ready) call and failing listen
rejects with `ChannelClosedError`, which carries `code` and the `CloseInfo`
as `info`. Its message stays `Channel closed`. A call, notify or listen made
after close throws the same error. A peer's bye (`PEER_CLOSED`) ends
in-flight listens gracefully; every other code fails them. On a command the
error means the effect is unknown: re-send by key.

## Conformance Fixtures

[`packages/rpc/test/conformance/*.json`](../../packages/rpc/test/conformance/)
holds one fixture per kind. The
[`conformance.test.ts`](../../packages/rpc/src/conformance.test.ts) suite
asserts that every fixture:

1. Passes `isWireMessage`.
2. Round-trips byte-for-byte through `JSON.stringify` / `JSON.parse`.
3. Advertises a `kind` metadata field that matches `frame.k`.

Adding a new wire kind REQUIRES adding a fixture under `packages/rpc/test/conformance/`.

## Mapping to Prior Art

| Tau wire kind            | LSP equivalent                | VS Code `rpcProtocol.ts`          | `kkrpc`            | Notes                                        |
| ------------------------ | ----------------------------- | --------------------------------- | ------------------ | -------------------------------------------- |
| `rq` / `rs`              | `$/request` / `$/response`    | `RequestMessage` / `ReplyMessage` | request / response | Standard request-response                    |
| `rc`                     | `$/cancelRequest`             | `CancelMessage`                   | n/a                | Cooperative cancellation                     |
| `nt`                     | `$/notification`              | `Notification`                    | event              | Fire-and-forget, no `i`                      |
| `ss`/`sn`/`sc`/`se`/`su` | `$/progress` (loose analogue) | n/a (no first-class streams)      | iterator           | Server-pushed iterables with consumer cancel |
| `lh`                     | `initialize` (server-pushed)  | greeting frame                    | `ready` event      | Handshake gate for `Channel.ready`           |
| `lb`                     | `exit`                        | `disposeMessage`                  | `close`            | Symmetric graceful close                     |
| `lk`                     | n/a                           | n/a                               | n/a                | Heartbeat for the client's liveness bound    |
| `fa` / `fw`              | n/a                           | n/a                               | n/a                | Credit-based stream flow control             |

## Forward Compatibility

- Unknown kinds (e.g. `xx`, `_internal`) fail `isWireMessage`; an unknown
  kind is never answered, since only `rq` and `ss` carry a return address.
- Underscore-prefixed kinds are reserved for transport internals (e.g.
  `multiplex` framing) and MUST NOT escape the framing layer.
- Adding fields to existing kinds requires bumping `v` to maintain wire
  identity. Adding a kind does not: `lk` was added in v1, and an older peer
  ignores it.
- `wireVersion` is exported from `@taucad/rpc` for runtime version checks.

## References

- [`packages/rpc/src/wire.ts`](../../packages/rpc/src/wire.ts) — TypeScript
  source of truth for the union, type guard, and known-kind set.
- [`packages/rpc/src/channel.ts`](../../packages/rpc/src/channel.ts) — Wire
  emission and reception per kind.
- [`packages/rpc/src/trace.ts`](../../packages/rpc/src/trace.ts) — Structured
  logger keyed by kind, gated on `RPC_TRACE` env flag.
- [`docs/research/runtime-channel-blueprint-v5.md`](../research/runtime-channel-blueprint-v5.md) —
  Blueprint document with the full requirements catalogue (R1–R17).
- [LSP base protocol](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#baseProtocol) —
  Prior-art reference for request/response/notification framing.
