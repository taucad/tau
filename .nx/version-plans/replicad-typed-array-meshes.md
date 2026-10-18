---
replicad: patch
---

Replicad meshes now stay in typed arrays from the WASM heap to the glTF writer. The kernel depends on `@taulabs/replicad@1.1.0-taulabs.1`, whose `mesh()` and `meshEdges()` return `Float32Array` and `Uint32Array` instead of `number[]`, and instanced copies are transformed into typed arrays too. Peak worker memory while a render is extracted falls to about a quarter (about 83 → 14 MB for a 400k-triangle preview), and extraction is much faster. Model code that calls `shape.mesh()` receives typed arrays as well.
