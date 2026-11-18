---
image: minor
---

Renders use nanoraster 0.10, whose ambient occlusion matches the viewer's AO profile H2: a sample's weight fades smoothly with 3D distance instead of being cut off by a hard thickness slab, so captures no longer draw a false line partway down deep slots and tooth flanks. The transcoder version is 17.0.0, so cached images are rendered again.

Breaking:

- The image export option `ao.thicknessRatio` is removed. Use `ao.falloffEndRatio` (where the falloff ends, as a multiple of the sampling radius; 0.1–100) and `ao.falloffRange` (the fraction of that end over which a sample's weight falls from 1 to 0; 0.01–1).
