---
host: minor
cli: patch
---

`tau serve --machines` reports its machine store's runtime telemetry (T19) on the provisioned cloud host (`TAU_CLOUD_HOST=1`), as `tau mcp --machines` does: one `machine` entry per new machine operation and one `admit` entry per request the store's admission refuses, with the closed code and the caller only. A self-hosted `tau serve` still reports nothing. `startHostDaemon` takes `machineTelemetry` (`onOperation` and `onAdmissionRefusal`) and hands it to the shared machine store, and `@taucad/host` exports `observeAdmissionRefusals`, which wraps an admission authority so a host that builds its machine host over its own authority reports each refusal the same way.
