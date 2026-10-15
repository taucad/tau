---
host: minor
cli: minor
native-process-core: minor
---

Serve native kernels over `tau serve`: the daemon composes each runtime child from the payload store, offers `prepare_kernel` to its agents, and starts every native worker on the child's behalf from sealed closures only, inside the OS sandbox, so the runtime child keeps its permission flags and still cannot spawn.
