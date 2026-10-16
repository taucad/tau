---
middleware: minor
runtime: minor
---

Simplify over-budget voxel previews instead of shipping every triangle to the viewer.

`@taucad/middleware` adds `displaySimplification`, a render-only middleware in the default preset after `gltfEdgeDetection`. When a render's tessellation report describes a voxel mesh (it carries `voxelSize`, `activeVoxels` or `memoryBytes`) with more triangles than `maxTriangles` (default 2,000,000, the preview budget OCCT kernels use), it collapses edges with meshoptimizer inside half a voxel of the original surface. It keeps topology, locks open borders and creases, and never moves a vertex. The report's `triangles` and `vertices` then count the delivered mesh, and a `DISPLAY_SIMPLIFIED` warning carries `{ from, to, maxErrorMm }`. A voxel mesh over the budget whose report has no `voxelSize` is shown as produced, with a `RESOURCE_LIMIT` warning. Exports, and so GeoSpec subjects, never pass through it, and it never changes `voxelSize`. A gyroid lamp at 0.5 mm voxels goes from 4,516,808 to 2,000,000 triangles, with a measured maximum deviation of 0.138 mm.

`@taucad/runtime` adds the `DISPLAY_SIMPLIFIED` issue code.
