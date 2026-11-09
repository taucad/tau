---
runtime: minor
picogk: minor
picovoxel: minor
---

The `meshRelax` option is removed: adaptive meshes are always meshed with OpenVDB's relax pass off.

- `@taucad/picogk` and `@taucad/picovoxel`: views and exports no longer take `meshRelax`. Measured, the relax pass moved vertices further from the surface and added slivers without ever improving a mesh. Saved options that still carry `meshRelax` are accepted and ignored, and snapshots that report `relax` still restore.
- `@taucad/runtime`: the tessellation report no longer has `relax`; a report that carries one is stripped, not refused.
