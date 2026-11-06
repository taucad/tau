---
openrscad: minor
---

The OpenRSCAD kernel takes a `libraryTracing` option (`'off'` when left out, `'summary'` or `'per-call'`) and exports its `openrscadOptionsSchema`. It counts the kernel's calls into the engine (`parameters`, `renderToGlb`, `exportShape3D`, `cacheStats`, `clearCache`) and emits an `openrscad.library.summary` span after describe and under each engine span. With tracing off nothing is wrapped.
