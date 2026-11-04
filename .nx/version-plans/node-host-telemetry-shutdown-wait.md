---
host: patch
cli: patch
---

A Node host's telemetry `shutdown()` (from `@taucad/host/telemetry`) now waits for the identity read, the policy probe and the account's usage-metrics answer, all within its existing 2-second limit, before it flushes. A short-lived command such as `tau prepare` or `tau export` now sends the entries it recorded instead of dropping them as `policy-unknown`. If nothing was recorded, shutdown still returns at once, and an unreachable API never holds it past the limit.
