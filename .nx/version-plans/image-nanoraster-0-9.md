---
image: minor
---

Require nanoraster 0.9 and pass the viewer-parity image options to it unchanged: `lineColor`, `toneMapping`, the GTAO controls `thicknessRatio`, `denoiseDepthTolerance`, `samples` and `resolutionScale`, the camera-relative `lighting.headlamp` and the environment object now reach the renderer instead of being withheld or rewritten for nanoraster 0.8. The image transcoder is version 16.0.0, so cached images render again.
