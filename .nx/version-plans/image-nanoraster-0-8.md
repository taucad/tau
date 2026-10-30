---
image: minor
---

Renders use nanoraster 0.8, which turns on screen-space ambient occlusion by default: opaque contacts and creases get soft contact shadows unless an export sets `ao: { intensity: 0 }`. Image exports now accept widths and heights up to 8192 pixels, subject to the GPU's limits and available memory. The transcoder version is 14.0.0, so cached images are rendered again.
