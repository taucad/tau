---
runtime: patch
---

The rendering wire schema keeps a tessellation report's `adaptivity` and `relax`, so a client sees whether a PicoGK or PicoVoxel view was meshed adaptively instead of having both fields stripped.
