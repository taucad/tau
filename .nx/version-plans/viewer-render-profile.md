---
image: minor
viewer: minor
---

Accept nanoraster's viewer-parity image options (`lineColor`, `toneMapping`, the GTAO controls `thicknessRatio`, `denoiseDepthTolerance`, `samples`, `resolutionScale`, the camera-relative `lighting.headlamp` and an environment object with `intensity` and light `cards`), withheld from a backend that predates them or rewritten in its terms where they light the same, and version the image transcoder 15.0.0. The viewer reads its post-processing, lighting and edge constants from one render profile that headless captures also build their options from; its output is unchanged.
