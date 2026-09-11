---
image: major
middleware: major
runtime: major
---

Adopt nanoraster's v10 caller-world option schema and the 0.5.1 renderer, remove the `gltfCoordinateTransform` middleware export, and add direct settled-artifact transcoding over wire protocol v2. This also replaces the legacy `RuntimeClient` plugin-bag generics with `RuntimeClient<Runtime, Transport>`.
