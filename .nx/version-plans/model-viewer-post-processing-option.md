---
viewer: patch
---

`ModelViewer` now applies `graphicsOptions.enablePostProcessing` to the graphics actor it starts for itself. The option was accepted and ignored, so a standalone viewer always ran post-processing. It is read once, when the actor starts; with an external `graphicsRef` its owner sets post-processing.
