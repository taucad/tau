---
manifold: patch
---

Rendering and GLB export read each source manifold's mesh and property count once, however many glTF nodes share it, instead of copying the full mesh once per node. Output is unchanged.
