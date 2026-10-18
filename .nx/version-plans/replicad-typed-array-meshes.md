---
replicad: patch
---

Replicad meshes now stay in typed arrays from the WASM heap to the glTF writer. The kernel depends on `@taulabs/replicad@1.1.0-taulabs.1`, whose `mesh()` and `meshEdges()` return `Float32Array` and `Uint32Array` instead of `number[]`, and instanced copies are transformed into typed arrays too. In a standalone Node measurement of a 400k-triangle mesh, peak extraction memory fell from about 83 to 14 MB (about one-sixth) and extraction time from about 560 to 9 ms. Model code that calls `shape.mesh()` receives typed arrays as well.
