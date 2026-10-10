---
runtime: minor
---

Add `workerData` to `nodeWorkerTransport` (and type its `workerCtor` seam as a `Worker` constructor taking the worker options), and a thread-per-connection mode to `webSocketHost` (`worker: { url, workerData, workerCtor }`): each connection runs its kernel worker in its own thread, which `nodeWorkerHost` entries serve unchanged, and a closed connection terminates its thread.
