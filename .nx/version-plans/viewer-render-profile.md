---
image: minor
viewer: minor
---

Accept nanoraster's viewer-parity image options (`lineColor`, `toneMapping` and the GTAO controls `thicknessRatio`, `denoiseDepthTolerance`, `samples`, `resolutionScale`), withheld from a backend that predates them, and version the image transcoder 15.0.0. The viewer reads its post-processing, lighting and edge constants from one render profile that headless captures also build their options from; its output is unchanged.
