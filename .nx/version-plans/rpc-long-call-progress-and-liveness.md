---
rpc: minor
---

`@taucad/rpc` adds long calls: per-call progress, heartbeats and a liveness bound, so a call whose work grows with its input lives while its server works on it instead of dying at a fixed deadline.

- A new wire kind, `rp` (server to client), says a pending request is still being served: without `d` it is a heartbeat, and with `d` it carries one progress report. `wireVersion` stays 1, and an older peer ignores the kind.
- `createChannelServer` takes `callHeartbeatInterval`. A server call handler's context is now a `ChannelCallContext`, whose `progress(data)` sends a report for that call.
- `Channel.call` takes a fourth argument, `ChannelCallOptions`. Its `onProgress` observes reports. Its `livenessTimeout` rejects the call with code `PEER_UNRESPONSIVE`, and cancels it, when no frame for the call arrives for that long.
- On the bridge layer, `resolveCallTimeout` may return `'liveness'` (`BridgeCallTimeout`). `createBridgeCall`'s `call` takes a `BridgeLongCall` (`signal`, `onProgress`). `createBridgeServer` and `createBridgePort` take `bindLongCall`, which hands a handler the call's abort signal and a progress sink (`BridgeServerLongCall`). Every bridge server now heartbeats calls that run longer than 10 s. Ordinary bridge calls keep their 30 s deadline.
