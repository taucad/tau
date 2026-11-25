---
replicad: minor
---

With compute reuse on, the Replicad kernel keeps each part's display mesh and bounding box across renders, keyed by the part's shape, placement and exact tolerance. A second view, an agent's repeat render or a revisit of an unchanged part no longer meshes it again (turbofan: about 1.6 s of tessellation down to under 10 ms), and the delivered GLB is unchanged. A native-handle snapshot now writes binary BRep without the triangulation instead of cleaning the displayed shape first.
