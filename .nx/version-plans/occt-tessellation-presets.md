---
occt-core: minor
replicad: minor
runtime: minor
viewer: minor
---

Let a replicad render or mesh export ask for a tessellation quality preset (`low`, `medium`, `high`, `extra-high`) instead of tolerances in millimetres. A preset scales with the model's bounding-box diagonal, so a 5 mm part and an 18 m assembly get about the same triangle count.

`@taucad/occt-core` adds `occtTessellationSchema`: a tessellation is either a preset or an explicit `{ linearTolerance?, angularTolerance? }` object with at least one field, never both. In JSON Schema it is a `oneOf`. A preset with explicit fields beside it fails to typecheck and is rejected with a message that names both accepted forms. `occtQualityRenderOptionSchema`, `occtQualityStlExportSchema` and `occtQualityGltfExportSchema` carry the union, defaulting to `medium` for previews and `high` for exports. `resolveOcctTessellation` turns a preset into absolute tolerances: linear `clamp(D / k, 0.001 mm, 50 mm)` with `k` 500, 2000, 8000 or 32000, and angular 30°, 20°, 12° or 6°. `tessellateWithinOcctBudget`, `occtTriangleBudgets`, `createTessellationDowngradedIssue` and `createTessellationBudgetExceededIssue` bound the triangle count. The explicit-only schemas stay unchanged for kernels that have not moved to presets.

`@taucad/replicad` renders and exports with the new schemas. Explicit tolerances mesh exactly as before, in OCCT's absolute mode. A field left out takes the old default (0.02 mm or 0.01 mm, 20°), never a preset value. A render whose mesh exceeds 2,000,000 triangles is re-meshed one step coarser (twice the linear tolerance, 4° more angular), at most three times, and reports a `TESSELLATION_DOWNGRADED` warning. A mesh export over 20,000,000 triangles fails with `RESOURCE_LIMIT` and a suggested tolerance; it is never coarsened. Renders without options now default to `medium` instead of 0.02 mm, and mesh exports to `high` instead of 0.01 mm.

`@taucad/runtime` adds the `TESSELLATION_DOWNGRADED` issue code. `TessellationReport` gains optional `requested`, `linearTolerance`, `angularTolerance` and `downgraded` fields, and replicad fills them on every model render.

`@taucad/viewer` renders a preset-or-explicit setting in the kernel settings menu as one choice: the four presets, plus an Explicit option that shows the linear (mm) and angular (°) tolerance rows. Choosing Explicit starts from the schema's example tolerances; choosing a preset replaces the value whole, so the two forms are never merged.
