---
smlib: patch
---

SMLib reads every edge's end vertices from one B-rep dump per body, draws edges the mesh does not bound from one boundary tessellation per body (now within the linear tolerance on splines), and samples drawing curves from one curve read per edge. Render, edge and drawing output is unchanged apart from those fallback edges.
