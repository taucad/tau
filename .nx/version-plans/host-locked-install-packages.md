---
host: minor
---

`install_packages` in `tau serve` and `tau mcp` now honours `TAU_ACQUISITION=locked`: it refuses with a `registry-unavailable` issue, contacts no registry and writes nothing, as `tau install` and the browser already do. `HostToolRegistryOptions` gains `acquisition: 'open' | 'locked'`, which defaults to `TAU_ACQUISITION` in the host's environment, read fail-closed (a value other than unset, empty or `open` is `locked`).
