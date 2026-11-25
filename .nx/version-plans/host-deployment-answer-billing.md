---
host: minor
---

`tau serve` chooses each run's billing layer from the gateway API's deployment answer (`GET /v1/deployment`) instead of `TAU_CLOUD_ENABLED`. A Cloud API funds the run with operation binding, attempt resolution and a principal: the paired device's account, or the `tau login` session's account on a local-only daemon, looked up when a funded run starts if `tau serve` could not learn it at startup; a funded run whose account still cannot be learned ends with `DEPLOYMENT_UNKNOWN` instead of running unattributed. This includes Cloud hosts the provisioner starts without `TAU_CLOUD_ENABLED`. A self-hosted API, or one without the route (`404`), runs unfunded with no new configuration. When the daemon cannot read the answer, the run ends with the resumable `DEPLOYMENT_UNKNOWN` before any model call. `HostDaemonAgentOptions.tauCloudEnabled` now only keeps a local-only daemon on its paired device credential.
