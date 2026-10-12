---
host: minor
cli: patch
---

`serveHostRuntime` accepts `worker: { url, workerData, workerCtor }` to run every connection's runtime in its own thread, and the runtime child may start worker threads, which keep its permission grants. `tau serve` uses it through a new `runtime-worker` entry: two agent roots or relay sessions no longer share one OpenCASCADE realm (`KERNEL_BINDING_FAILED` on STEP export after another root rendered), and a hung model stops only its own connection.
