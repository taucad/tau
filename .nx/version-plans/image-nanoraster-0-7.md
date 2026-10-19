---
image: minor
---

Renders use nanoraster 0.7, which never refuses a section cut: an open, cracked or non-manifold part is cut with its closed loops capped and its open outlines drawn in red (`#DD003F`) instead of failing the export. The transcoder version is 13.0.0, so cached section images are rendered again, and the `image.render` span reports `sectionSourceCount`, `sectionUncertifiedSourceCount`, `sectionClosedLoopCount` and `sectionOpenChainCount`.
