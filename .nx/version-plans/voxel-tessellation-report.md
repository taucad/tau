---
runtime: minor
picovoxel: minor
---

A rendered artifact can carry a `tessellation` report of what its mesh cost: `triangles`, `vertices` and `elapsed` milliseconds, plus `voxelSize`, `activeVoxels` and `memoryBytes` from voxel kernels. Kernels return it from `render` as `RenderOutput.tessellation`, and clients read it on `Rendering.artifact.tessellation`. PicoVoxel reports it for every rendered view: the meshing time of its returned shapes, their active voxels (counted for fields up to 256 MiB) and the native bytes those fields hold.
