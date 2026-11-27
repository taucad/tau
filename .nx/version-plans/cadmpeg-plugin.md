---
cadmpeg: minor
---

New package `@taucad/cadmpeg`: native CAD import for `@taucad/runtime`, powered by cadmpeg through `cadmpeg-ts`. `cadmpeg()` registers kernel `cadmpeg`, which opens SOLIDWORKS (`sldprt`), CATIA V5 (`catpart`), Inventor (`ipt`, `iam`), Fusion (`f3d`, `f3z`), FreeCAD (`fcstd`), Rhino (`3dm`), ACIS (`sat`, `sab`, `smt`, `smb`) and Creo View (`pvz`) files in the worker: cadmpeg converts the file to STEP and the OCCT backend of `@taucad/brep/occt` meshes it into the model view, with a `glb` export.

- Everything cadmpeg reports as lost becomes a `REPRESENTATION_UNSUPPORTED` warning carrying `details.cadmpegCode`.
- The `export` preset adds the experimental `cadmpeg` transcoder (`step` to `3dm`, `sldprt`, `f3d` and `fcstd`, with a `strict` option). It is off by default because cadmpeg 0.6.12's writers still refuse a model read from STEP.
