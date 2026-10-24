---
replicad: minor
---

A drawing-only Replicad model whose drawings are all closed profiles now offers a STEP export. It writes each drawing's region faces, holes included, on the XY plane at Z = 0 in model units, with the drawing's name as its product, so exact-geometry tools such as GeoSpec can check a 2D drawing. A drawing-only model with an open profile, such as a projected edge drawing, still offers no export, and it offers no mesh export in either case.
