---
runtime: minor
---

Add `workerData` to `nodeWorkerTransport`: it is structured-cloned into the worker entry, so one application-owned entry can compose the runtime each client needs. Its type, `NodeWorkerData`, is exported from `@taucad/runtime/transport/node`, and the `workerCtor` seam is typed as a `Worker` constructor that receives (and must forward) the worker options.
