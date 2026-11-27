---
brep: minor
---

`@taucad/brep/occt` is a new public subpath that exposes the OCCT import backend the BRep kernel uses: `loadOcctBackend()` loads `occt-import-js` with the WASM binary shipped in this package, and `meshOcctFile(backend, { name, bytes, format? })` meshes a STEP, IGES or BREP file into a GLB in meters with Tau's CAD material defaults. Another plugin can now mesh STEP it produces without copying the loader or the WASM asset. The BRep kernel itself uses the same functions, so its output is unchanged.
