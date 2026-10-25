---
opencascade: minor
---

The OpenCascade kernel draws its own B-rep edges. The model view and the GLB export claim `includeEdges`, so the runtime no longer runs the fallback `GltfEdgeDetection` pass for OpenCascade, and models above its 500,000-triangle limit now show edges too. When a caller asks for edges, each shape's mesh gains one `LINES` primitive in replicad's layout (`tauComponentKind: 'line'`, `node/<n>/edges`, `edgeGroups` in XYZ scalars) with an unlit material. An edge on a meshed face reuses the face's own boundary samples, so lines sit exactly on the surface; a free edge is sampled from its curve at the same tolerances, including after a preview budget downgrade. Lines do not count toward the triangle budget or the tessellation report.

A render or GLB export without `includeEdges` is byte-identical to before. A shape made only of free edges, such as a lone circle, still carries the lines OpenCascade's glTF writer draws for it; with `includeEdges` those are replaced by the edge set. STL and STEP exports are unchanged. The kernel version moves to 1.3.0, so renders cached with fallback overlay lines are not reused.
