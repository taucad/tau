---
runtime: minor
picovoxel: minor
picogk: minor
mcp: minor
---

A rendered artifact can carry a `tessellation` report of what its mesh cost: `triangles`, `vertices` and `elapsed` milliseconds, plus `voxelSize`, `activeVoxels` and `memoryBytes` from voxel kernels. Kernels return it from `render` as `RenderOutput.tessellation`, and clients read it on `Rendering.artifact.tessellation`. PicoVoxel reports it for every rendered view: the meshing time of its returned shapes, their active voxels (counted for fields up to 256 MiB) and the native bytes those fields hold. PicoGK reports triangles, vertices and the worker's mesh construction, extraction and normal generation time, and `PicogkNativeHandle` gains an optional `tessellation`; a handle snapshot without one stays its GLB bytes. `evaluate_model` returns the default view's report as `tessellation`, in Tau and over `tau mcp`.
