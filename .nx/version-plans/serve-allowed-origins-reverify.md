---
host: minor
cli: minor
---

`tau serve --allowed-origins` (`TAU_HOST_ALLOWED_ORIGINS`) lists exact browser origins that may read `/.well-known/tau-host` across origins and open `/agent`; the agent token is still required, and an unlisted origin gets no CORS grant. A native worker that exits before its handshake under `tau serve` now has its closure re-verified by the daemon, so the refusal names the damaged files (`createRuntimeChildRuntimeVerifier` in `@taucad/host/runtime-host`).
