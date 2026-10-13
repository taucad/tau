---
runtime: minor
---

`NodeWorkerLike` now declares the `'error'` and `'exit'` events that `nodeWorkerTransport` listens to, so a custom `workerCtor` must construct a worker that accepts listeners for them. `node:worker_threads.Worker` and its subclasses already do. Before, a worker that handled only `'message'` type-checked, and if it crashed the client waited for the operation timeout instead of failing at once.
