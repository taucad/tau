---
runtime-testing: minor
---

Add `premultipliedRendererOutput`, which returns a renderer capture's premultiplied bytes as the canvas holds them, so a caller can composite a frame over a background the way the page does. The straight-alpha capture clamps an antialiased edge whose encoded colour exceeds its alpha.
