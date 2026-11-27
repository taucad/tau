---
picovoxel: patch
runtime: patch
---

PicoVoxel reports an SDF expression longer than its 65,536-instruction tape as a capacity limit. The refusal is now a `RESOURCE_LIMIT` issue whose details carry the `picovoxel.tape.instructions` limit (unit `{instruction}`, maximum 65,536, unknown demand) instead of a plain `RUNTIME` issue, so runtime telemetry counts it as a capacity refusal. The `ResourceLimitDetails` example now shows this limit instead of a retired export-triangle limit.
