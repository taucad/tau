---
runtime: minor
replicad: minor
opencascade: minor
picovoxel: minor
---

A kernel definition may implement `heapBytes(context)`, the bytes of WebAssembly linear memory its instance has committed; the runtime reads it when it delivers a successful rendering and reports it as `Rendering.heapBytes`, so a host can recycle a worker whose heap (which never shrinks) has outgrown its device. Replicad and OpenCascade implement it. Both take `previewTriangleBudget` (default 2,000,000), the triangle budget a preview coarsens to, so a host on a memory-constrained device can preview within fewer triangles. PicoVoxel takes `recycleHeapBytes` (default 1.5 GiB, the previous constant), the heap above which a runtime is recycled after its render. Replicad's semantic compute reuse keeps its resident tier as a least-recently-used cache bounded at 64 MiB and 4096 entries, serializes only the results the compute scope admits instead of every supported operation's, and no longer copies entries a warm import finds already resident.
