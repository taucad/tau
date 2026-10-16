---
picogk: minor
---

`@taucad/picogk` reports the voxel size a model ran at in its tessellation report. The worker returns the edge length in millimetres that the model passed to `Library.Go` as the build-level `voxelSize`, and the render's `TessellationReport.voxelSize` carries it, so display simplification can bound an over-budget preview mesh by half a voxel instead of leaving it unsimplified. The worker protocol moves to version 9: resources prepared for protocol 8 are refused with the command that prepares them again. Handle snapshots written without a voxel size still restore.
