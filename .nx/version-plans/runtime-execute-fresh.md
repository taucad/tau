---
runtime: minor
---

`KernelRuntime.execute(code, { fresh: true })` runs a bundled module again and replaces its cached instance under the same code, instead of returning the cached one. The runtime drops the bundler's execution-cache entry first, so the clear that runs when a bundled file changes still frees the new instance. The new `KernelExecuteOptions` type is exported from `@taucad/runtime/types` and `@taucad/runtime/kernel`.
