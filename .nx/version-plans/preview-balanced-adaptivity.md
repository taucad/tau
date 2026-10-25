---
picogk: minor
picovoxel: minor
mcp: minor
---

Views default to Balanced adaptivity (`meshAdaptivity` 0.25) where the kernel can mesh adaptively; exports stay pinned at 0 and `meshRelax` stays `false`.

- `@taucad/picogk`: a view that sets no `meshAdaptivity` asks the worker for 0.25. A worker that predates adaptive meshing answers with the uniform mesh, built once, and the tessellation report carries no `adaptivity`. An explicit value above 0 on such a worker is still refused with `meshing-unsupported`. The kernel version moves to `meshing2`.
- `@taucad/picovoxel`: the render schema resolves an unset `meshAdaptivity` per lane and installed release: 0 on the exact lane and under PicoVoxel 0.1.0, 0.25 on the fast lane of a release whose `toMesh()` takes options once `picovoxelAdaptivePreviewsWatertight` is on. It is off in this release, so every unset view still meshes uniformly. Explicit values are checked as before: an adaptive exact-lane request is still refused with `PICOVOXEL_MESHING_EXACT_LANE`, and 0.1.0 still refuses every adaptive request with `PICOVOXEL_ADAPTIVE_MESHING`.
- `evaluate_model`: when the default view's mesh is adaptive, `summary.admission.warning` says the GeoSpec estimates are low, because subjects export the uniform mesh (about 3 to 6 times the triangles at 0.25).
