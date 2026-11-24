---
geometry-core: minor
---

`writeGlb` and `writeGltfJson` take an optional `checkpoint` callback, called before each node is laid out and once before the scene is serialized; throwing from it stops the write, and it never changes the output.
