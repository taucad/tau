---
occt-core: patch
runtime: patch
---

A superseded Replicad or OpenCascade run now stops as soon as its abort is seen. `formatOcRuntimeError` returns the abort as a plain `RUNTIME` issue without parsing its stack or reading the bundle and library source maps, which took about 80 ms on the first abort in a worker and 8 ms after; the caller drops a superseded run's issues, so nothing visible changes. `@taucad/runtime/kernel` exports `isRenderAbortedError`, the predicate the runtime already uses to recognise a cooperative abort across realms.
