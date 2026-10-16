---
picogk: minor
---

`@taucad/picogk` reports the voxel size a model ran at in its tessellation report. The worker returns the edge length in millimetres that the model passed to `Library.Go` as the build-level `voxelSize`, and the render's `TessellationReport.voxelSize` carries it, so display simplification can bound an over-budget preview mesh by half a voxel instead of leaving it unsimplified. The field is additive and the worker protocol stays at version 8: a worker that does not send it renders as before, without a voxel size. Handle snapshots written without a voxel size still restore.
