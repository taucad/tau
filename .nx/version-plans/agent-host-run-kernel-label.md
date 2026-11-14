---
agent-host: patch
---

`@taucad/agent-host` labels each run's model calls with the kernel the run targets. `ModelStreamRequest` gains an optional `kernel`, read from the turn's committed snapshot (the chat's chosen kernel, else under `auto` the kernel of the project's main entry), and the gateway transport sends it as `x-tau-kernel` in place of the composition's `GatewayHostLabels.kernel` when the composition names its host. `TurnObservation` gains an optional `kernel` from the same snapshot.
