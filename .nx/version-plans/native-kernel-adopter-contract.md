---
native-process-core: minor
runtime-testing: minor
---

Add `@taucad/native-process-core/adopter` with `NativeKernelAdopter`, `NativeKernelBounds`, `NativeKernelPluginFactory` and `defineNativeKernelAdopter`: the one contract a native kernel package exports so a host can prepare, compose and load it (options from a sealed closure, the seal step, the launch set and a lazy `load()`) without naming the kernel. The subpath imports types only, so the package root's graph is unchanged.

Add `@taucad/runtime-testing/roster` with `assertKernelRosterCoverage`, which fails when a host's resolved runtime neither routes a product catalog kernel by its main file's extension nor names it in an `omitted` map with a reason, and when an omission is stale.
