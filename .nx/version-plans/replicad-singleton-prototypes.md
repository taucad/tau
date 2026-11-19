---
replicad: patch
---

The Replicad kernel meshes a shape without an instancing partner the way it meshes an instanced part: once, unplaced, with its placement applied afterwards. With compute reuse on, a pose edit that only moves parts reuses their kept meshes instead of meshing them again. Delivered vertices, normals, edges and bounds are unchanged, but OCCT triangulates a face differently placed and unplaced, so the triangle indices of those parts, and the GLB bytes of most models, change once.
