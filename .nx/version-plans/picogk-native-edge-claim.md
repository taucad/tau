---
picogk: patch
---

PicoGK's model view and glTF exports claim `includeEdges` natively, so the fallback `GltfEdgeDetection` middleware no longer runs over PicoGK's voxel meshes. A voxel mesh has no B-rep edges; a render or export that asks for edges returns the model's own lines and no inferred overlay.
