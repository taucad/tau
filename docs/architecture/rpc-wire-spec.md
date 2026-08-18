# RPC Wire Spec — `@taucad/rpc` v1

## Status

**Normative** — version 1 of the wire envelope used by every `Channel<P>` /
`ChannelServer<P>` pair (worker, Electron `MessageChannelMain`, in-process,
multiplex tunnel, future WebSocket). All Tau runtime transports MUST
conform to this spec; non-conforming frames are dropped silently by
`isWireMessage`.

This document is the authoritative reference cited from
[`libs/rpc/src/wire.ts`](../../libs/rpc/src/wire.ts) and
[`docs/research/runtime-channel-blueprint-v5.md`](../research/runtime-channel-blueprint-v5.md).

## Design Principles

1. **Two-character family-prefixed kind codes.** Each frame's `k` field is a
   two-character ASCII code prefixed by family: RPC (`r*`), notify (`n*`),
   stream (`s*`), lifecycle (`l*`), flow control (`f*`). The prefix lets
   readers and dispatch tables filter by family in O(1) without enumerating
   every code.
2. **Versioned envelope.** Every frame carries `v: 1`. Receivers MUST drop
   frames whose `v` is not the spec version they implement. This permits
   forward-compatible upgrades (`v: 2`) without ambiguity.
3. **JSON-cloneable payload, transferables hoisted at the boundary.** The
   wire envelope is structured-clone safe. Transferables (`ArrayBuffer`,
   `MessagePort`, etc.) are extracted at the channel author boundary via
   `WithTransferables` and passed to `port.postMessage(frame, transfer)`,
   keeping the envelope itself free of host-specific objects.
4. **Discriminated union, never magic strings.** All consumers parse the
   wire format through the
   [`WireMessage`](../../libs/rpc/src/wire.ts) discriminated union and
   the [`isWireMessage`](../../libs/rpc/src/wire.ts) type guard. Adding
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

The server emits exactly one `lh` after the port is wired. Clients MUST NOT
send `rq`/`ss` over the wire until `lh` arrives; locally they queue. After
`lb`, neither side accepts further frames.

### Flow control family (`f*`) — RESERVED for v6

| Kind | Direction     | Purpose                                             | Required fields                   | Status   |
| ---- | ------------- | --------------------------------------------------- | --------------------------------- | -------- |
| `fa` | bidirectional | Acknowledge frames up to id `i`                     | `i: string`                       | Reserved |
| `fw` | bidirectional | Grant `s` more stream-frame slots for stream id `i` | `i: string`, `s: number` (finite) | Reserved |

In v1 receivers log once at warn level and drop both kinds. Reserving the
codes prevents a wire-format break when flow control lands.

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
stack traces in development mode.

## Conformance Fixtures

[`libs/rpc/test/conformance/*.json`](../../libs/rpc/test/conformance/)
holds one fixture per kind. The
[`conformance.test.ts`](../../libs/rpc/src/conformance.test.ts) suite
asserts that every fixture:

1. Passes `isWireMessage`.
2. Round-trips byte-for-byte through `JSON.stringify` / `JSON.parse`.
3. Advertises a `kind` metadata field that matches `frame.k`.

Adding a new wire kind REQUIRES adding a fixture under `libs/rpc/test/conformance/`.

## Mapping to Prior Art

| Tau wire kind            | LSP equivalent                | VS Code `rpcProtocol.ts`          | `kkrpc`            | Notes                                        |
| ------------------------ | ----------------------------- | --------------------------------- | ------------------ | -------------------------------------------- |
| `rq` / `rs`              | `$/request` / `$/response`    | `RequestMessage` / `ReplyMessage` | request / response | Standard request-response                    |
| `rc`                     | `$/cancelRequest`             | `CancelMessage`                   | n/a                | Cooperative cancellation                     |
| `nt`                     | `$/notification`              | `Notification`                    | event              | Fire-and-forget, no `i`                      |
| `ss`/`sn`/`sc`/`se`/`su` | `$/progress` (loose analogue) | n/a (no first-class streams)      | iterator           | Server-pushed iterables with consumer cancel |
| `lh`                     | `initialize` (server-pushed)  | greeting frame                    | `ready` event      | Handshake gate for `Channel.ready`           |
| `lb`                     | `exit`                        | `disposeMessage`                  | `close`            | Symmetric graceful close                     |
| `fa` / `fw`              | n/a                           | n/a                               | n/a                | Reserved for v6 flow control                 |

## Forward Compatibility

- Unknown kinds (e.g. `xx`, `_internal`) are dropped by `isWireMessage`.
- Underscore-prefixed kinds are reserved for transport internals (e.g.
  `multiplex` framing) and MUST NOT escape the framing layer.
- Adding fields to existing kinds requires bumping `v` to maintain wire
  identity.
- `wireVersion` is exported from `@taucad/rpc` for runtime version checks.

## References

- [`libs/rpc/src/wire.ts`](../../libs/rpc/src/wire.ts) — TypeScript
  source of truth for the union, type guard, and known-kind set.
- [`libs/rpc/src/channel.ts`](../../libs/rpc/src/channel.ts) — Wire
  emission and reception per kind.
- [`libs/rpc/src/trace.ts`](../../libs/rpc/src/trace.ts) — Structured
  logger keyed by kind, gated on `RPC_TRACE` env flag.
- [`docs/research/runtime-channel-blueprint-v5.md`](../research/runtime-channel-blueprint-v5.md) —
  Blueprint document with the full requirements catalogue (R1–R17).
- [LSP base protocol](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#baseProtocol) —
  Prior-art reference for request/response/notification framing.
