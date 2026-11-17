---
host: minor
---

`tau serve` chooses each run's billing layer from the gateway API's deployment answer (`GET /v1/deployment`) instead of `TAU_CLOUD_ENABLED`. A Cloud API funds the run with operation binding, attempt resolution and the paired account as principal. This includes Cloud hosts the provisioner starts without `TAU_CLOUD_ENABLED`. A self-hosted API, or one without the route (`404`), runs unfunded with no new configuration. When the daemon cannot read the answer, the run ends with the resumable `DEPLOYMENT_UNKNOWN` before any model call. `HostDaemonAgentOptions.tauCloudEnabled` now only keeps a local-only daemon on its paired device credential.
