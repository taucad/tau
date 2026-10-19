---
image: patch
---

Rasterised captures no longer show hidden model edges that end on a face's boundary as short ticks past that face's outline, such as the far-side flank edges of gear teeth. The image renderer now uses nanoraster 0.7.1, whose surface depth margin matches half the drawn edge stroke, and the transcoder version is 13.0.1 so cached images are rendered again.
