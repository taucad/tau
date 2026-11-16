---
replicad: patch
---

Use `@taulabs/replicad-opencascadejs` 0.23.0-beta.1, built on libcascade 3.1.0. `delete()` now frees native memory for OpenCascade value types, shapes, builders and explorers, which the previous build did not. It also binds `BRepAlgoAPI_Splitter` and `BRepPrimAPI_MakeHalfSpace`, so `split()` and `cutPlane()` work.
