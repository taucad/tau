---
occt-core: minor
opencascade: minor
---

Let an OpenCascade render or mesh export ask for a tessellation quality preset (`low`, `medium`, `high`, `extra-high`) instead of tolerances in millimetres, as replicad already does. A preset scales with the model's bounding-box diagonal, measured from the B-rep with `BRepBndLib::AddOptimal` and only for presets, so spheres of radius 5 mm and 500 mm both mesh to 5,858 triangles at `medium`.

`@taucad/opencascade` renders and exports with `occtQualityRenderOptionSchema`, `occtQualityStlExportSchema` and `occtQualityGltfExportSchema`. A tessellation is a preset or an explicit `{ linearTolerance?, angularTolerance? }` in millimetres and degrees, never both. Explicit tolerances mesh byte-identically to before in OCCT's absolute mode, and a field left out takes the old default (0.02 mm or 0.01 mm, 20°). Renders without options now default to `medium` instead of 0.02 mm, and STL and GLB exports to `high` instead of 0.01 mm. A render over 2,000,000 triangles is re-meshed one step coarser, at most three times, and warns `TESSELLATION_DOWNGRADED`. A mesh export over 20,000,000 triangles fails with a suggested tolerance and is never coarsened. Every model render reports its requested form, effective tolerances, downgrade steps, triangle and vertex counts and elapsed time.

`@taucad/occt-core` removes the explicit-only `occtRenderOptionSchema`, `occtStlExportSchema` and `occtGltfExportSchema`. OpenCascade was their last consumer; use the `occtQuality*` schemas, which accept the same explicit objects.
