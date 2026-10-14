---
host: patch
cli: patch
---

Tau Host starts one sandboxed runtime child process per agent root and per relay session. Two roots or sessions no longer share one OpenCASCADE realm (`KERNEL_BINDING_FAILED` on STEP export after another root rendered), a hung model stalls only its own root or session, and a child exit ends only the root or session it served. Every child receives the Zoo-scoped credential and its refreshes. The CLI also bundles a `runtime-worker` entry that hosts the CLI runtime from `workerData`, for the coming `tau mcp` worker client.

On macOS, the runtime child can now import from its private temp directory: the directory is granted by its real path, since `/var` links to `/private/var`.
