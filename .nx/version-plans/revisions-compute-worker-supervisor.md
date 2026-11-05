---
revisions: minor
---

Run the revision store's CPU work on a supervised compute worker. `@taucad/revisions` adds `createSupervisedComputeWorker`, which spawns one worker on first use, fails the calls a dead worker held with a typed `ComputeWorkerCrashedError` (never a `TypeError`, so a pack is never dropped as corrupt because its worker died), restarts it on the next call, and after too many restarts in a window sends calls to a fallback or fails them `unavailable`. `serveComputeWorker`, `createInlineCompute` and `isComputeWorkerFailure` are exported for the worker side. The compute contract gains `sha256`, `resolveDelta` (pack deltas now resolve on the worker), `unzip` (stored and deflate entries, with CRC, path-safety and size limits) and `grep`.
