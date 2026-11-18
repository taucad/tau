---
replicad: minor
geometry-core: minor
---

With compute reuse on, the Replicad kernel keeps each kept mesh's glTF pack facts (its compacted triangles and whether it is a closed solid) with the mesh memo, so a render that reuses a mesh no longer compacts and welds it again. The kernel's own meshes are also written without re-validating every accessor. On the turbofan example a one-parameter edit packs its GLB in about 125 ms instead of about 400 ms. Instanced parts no longer read per-instance face and edge ids that the glTF packer replaced anyway. The delivered GLB bytes are unchanged with reuse on and off.

`writeGlb` and `writeGltfJson` take a new `trustedGeometry` input flag for producers whose primitives are valid by construction: the writer then skips its per-primitive geometry checks (finite attributes, index range, element counts, unit tangents) and still computes POSITION bounds and validates placements, materials and resources.
