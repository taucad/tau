---
runtime: minor
esbuild: minor
occt-core: minor
---

The in-memory compute store is now a least-recently-used cache bounded by bytes. `createMemoryComputeEngine({ maxBytes })` keeps up to 64 MiB per workspace by default; a read or publication makes an entry the most recent, an entry whose required content is evicted is evicted with it, and an entry larger than the whole bound is not published. Before, the store kept every result for the life of the worker. A document now keeps one projection per open view instead of one per option set it was ever rendered with, so scrubbing a view's options no longer accumulates a GLB per step. Inside a worker, esbuild-wasm now runs on that worker's thread instead of starting a nested worker of its own. The OpenCASCADE exception proxy reuses one method wrapper per wrapped object instead of allocating one on every method access.
