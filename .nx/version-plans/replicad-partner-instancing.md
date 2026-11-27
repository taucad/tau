---
replicad: patch
---

Tessellation instancing finds repeated shapes from their OCCT partner key instead of serializing and SHA-256 hashing each shape's BRep. On the turbofan example, detection takes about 6 ms per render instead of about 0.8 s. Delivered GLB bytes are unchanged. The `missedContentHashGroups` detail on the `replicad.tessellation-instancing.detect` span and the `prototypeHash` attribute on the prototype tessellation spans are removed.

A failure while detecting or meshing instances is now a render error. Before, the render fell back to flat meshing, which delivers different bytes without saying so.
