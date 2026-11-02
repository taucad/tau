---
middleware: minor
runtime: minor
picovoxel: minor
picogk: minor
---

Remove voxel display simplification. Voxel kernels now lighten their previews at the source with adaptive meshing, so Tau no longer simplifies a delivered mesh.

`@taucad/middleware` no longer exports `displaySimplification`, and its `default` preset is `parameterFileResolver`, `parameterUnits`, `geometryCache` and `gltfEdgeDetection`. The package no longer depends on `meshoptimizer` or `@gltf-transform/functions`. A voxel preview over the preview budget is now delivered as the kernel produced it. To lighten it, raise the view's `meshAdaptivity` or pass a coarser `voxelSize` per call. Previews cached with the middleware in the chain are rebuilt, because the middleware chain is part of the cache key.

`@taucad/runtime` keeps `DISPLAY_SIMPLIFIED` in the issue-code list so stored results that carry it still validate, but nothing produces it. `kernel.mesh` spans no longer carry `tessellation.effective.simplified`.

The `cad-picovoxel` and `cad-picogk` skills no longer describe display simplification.
