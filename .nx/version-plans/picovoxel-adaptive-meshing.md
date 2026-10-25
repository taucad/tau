---
picovoxel: minor
---

`@taucad/picovoxel` render options take `meshAdaptivity` (0 to below 1) and `meshRelax` (default `false`). Every export pins `meshAdaptivity` to 0. An exact-lane render that asks for adaptivity is refused with `REPRESENTATION_UNSUPPORTED`. Under the pinned PicoVoxel 0.1.0, whose `toMesh()` takes no options, every adaptive request is refused with `KERNEL_CAPABILITY_MISSING` naming `PICOVOXEL_ADAPTIVE_MESHING`. An explicit 0 renders today's mesh.
