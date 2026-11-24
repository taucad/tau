---
geometry-core: minor
replicad: patch
---

`writeGlb` and `writeGltfJson` take an optional `checkpoint` callback, called before each node is laid out and once before the scene is serialized; throwing from it stops the write, and it never changes the output. The Replicad kernel passes its abort check, so a superseded render also stops inside the GLB writer instead of finishing a stale write.
