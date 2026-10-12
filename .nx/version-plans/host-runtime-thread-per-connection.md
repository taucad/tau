---
host: patch
cli: patch
---

Tau Host starts one sandboxed runtime child process per agent root and per relay session. Two roots or sessions no longer share one OpenCASCADE realm (`KERNEL_BINDING_FAILED` on STEP export after another root rendered), a hung model stalls only its own root or session, and a child exit ends only the root or session it served. Every child receives the Zoo-scoped credential and its refreshes. The CLI ships a `runtime-worker` entry that hosts the CLI runtime from `workerData` for `nodeWorkerTransport` clients.
