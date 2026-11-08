---
manifold: patch
---

A `setMaterial` part that several glTF nodes share renders and exports. The first node relabelled the part's run material with `NORMAL`; the next node read that as authored normals, kept the part without them and failed with "Too many attribute channels". Normals are now decided from each run material's labels as the model authored them.
