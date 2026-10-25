---
picovoxel: minor
---

`@taucad/picovoxel` now depends on PicoVoxel 0.2.0, whose `toMesh()` takes `{ adaptivity, relax }`. Fast-lane views mesh adaptively: an unset `meshAdaptivity` resolves to 0.25 (Balanced) on lane `'fast'`, and an explicit value in (0, 1) now runs there instead of being refused with `PICOVOXEL_ADAPTIVE_MESHING`. The exact lane and every export still mesh uniformly, so exact exports keep their bytes; an explicitly fast STL export of an adaptive view replays a uniform fast build. The kernel version moves with the new package version and digests, so geometry cached under 0.1.0 is rebuilt.
