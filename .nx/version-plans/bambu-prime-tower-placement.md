---
slicer: patch
---

`sliceWithBambuStudio` now slices multi-colour assemblies on crowded plates. Bambu Studio arranges an assembly against an estimate of its prime tower that is up to about 2 mm smaller than the tower it prints, leaving only 1 mm between them. It then fails its own path-conflict check (`-101`), as a four-colour model did on the A1 mini.

On that failure the engine now runs Bambu Studio again with checks off to measure the tower it prints. It moves the assembly the shortest way clear of the tower, staying inside the bed and away from excluded areas, and slices again with checks on, keeping the tower where Bambu Studio placed it. When no side of the tower has room, the slice fails with `BAMBU_STUDIO_SLICE_FAILED`, saying that the model and its prime tower do not fit on that plate together.
