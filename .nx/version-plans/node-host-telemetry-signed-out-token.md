---
host: patch
cli: patch
---

A Node host's runtime telemetry (`@taucad/host/telemetry`) no longer reports for a CLI whose `TAU_AUTH_TOKEN` is set but resolves signed-out, for example because it is expired or invalid. Before, such a CLI printed the first-run notice and sent its entries anonymously without `tau telemetry on`. The host now composes and prints the notice only after identity resolves, and re-checks consent and the signed-in state before each record and drain. A signed-in host still asks its runtime clients for facts on the first operation.
