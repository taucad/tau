---
replicad: patch
---

Use `@taulabs/replicad-opencascadejs` 0.23.0-beta.4 and `@taulabs/replicad` 1.2.1-beta.1. A superseded render now also stops inside the instancing mesh extractor, which Tau's render path meshes through: a 167k-triangle prototype mesh stops in about 0.25 s instead of running its 6.5 s to the end. While nothing aborts the mesh is unchanged. Replicad 1.2.1-beta.1 frees the solids of a `Sketches.extrudeUntil` whose compound fails instead of leaking them.
