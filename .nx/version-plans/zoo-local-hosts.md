---
runtime: minor
zoo: minor
host: minor
cli: minor
---

Run the Zoo (KCL) kernel on local hosts through Tau's proxy. `@taucad/zoo/proxy` mints a short-lived Zoo-scoped token in a parent process and puts it on the WebSocket upgrade in the process that runs project code, never in kernel options. `@taucad/zoo` also reports 4401/4403 proxy refusals as authentication errors and an unreachable proxy as unavailable, and closes the socket when a handshake fails. `@taucad/runtime/electron/main` adds `ElectronRuntimeMainHandle.post()`: sticky per-type control frames that each booted utility receives after its boot frame. `@taucad/host` forwards a Zoo-scoped token to its runtime child. `@taucad/cli` builds in Zoo for `tau export` and `tau serve`, authenticated by `TAU_AUTH_TOKEN`.
