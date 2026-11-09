---
runtime: minor
---

`@taucad/runtime/worker` exports `createWorkerFileSystemProxy` and its `WorkerFileSystemProxy` type: the worker-facing filesystem a kernel reads over its filesystem bridge port, whose watches use the change-set form. The filesystem scenario harness builds a kernel's dependency watch with it.
