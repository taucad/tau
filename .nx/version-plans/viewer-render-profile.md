---
image: minor
viewer: minor
---

Require nanoraster 0.9 and accept its viewer-parity image options (`lineColor`, `toneMapping`, the GTAO controls `thicknessRatio`, `denoiseDepthTolerance`, `samples`, `resolutionScale`, the camera-relative `lighting.headlamp` and an environment object with `intensity` and light `cards`), passed to the renderer unchanged, and version the image transcoder 16.0.0 so cached images render again. The viewer reads its post-processing, lighting and edge constants from one render profile that headless captures also build their options from; its output is unchanged.
