---
replicad: patch
---

Use `@taulabs/replicad-opencascadejs` 0.23.0-beta.3. Textured and anisotropic materials now get their surface coordinates (UVs and tangent frames) from one native call instead of several generated-binding calls per vertex, which takes the copper lampshade's extraction from about 80 ms to about 8 ms and a fully textured turbofan's from 2.7 s to 0.14 s. The native call returns the same doubles as the JavaScript loop, which stays as the fallback for a build without it, so the delivered geometry is unchanged. A material-only edit on a textured part is now answered from the mesh memo instead of meshing the part again.
