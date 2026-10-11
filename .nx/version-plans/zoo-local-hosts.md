---
runtime: minor
zoo: minor
---

Let Node hosts authenticate the Zoo kernel through Tau's proxy. `@taucad/runtime/electron/main` adds `ElectronRuntimeMainHandle.post()`, sticky per-type control frames that each booted utility receives after its boot frame. `@taucad/zoo` adds `withZooProxyHeaders()` to put credentials on the WebSocket upgrade instead of in kernel options. It also reports 4401/4403 proxy refusals as authentication errors, reports an unreachable proxy as unavailable, and closes the socket when a handshake fails.
