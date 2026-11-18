---
runtime: patch
---

A view whose delivered artifact breaks its media's content rule on the client (an empty GLB, an incomplete SVG) is now observed as `discarded` with the code the worker gives the same rule, `GLTF_BYTES_INVALID` or `SVG_DOCUMENT_INVALID`, instead of `UNKNOWN`. The rendering still rejects with a `TypeError`.
