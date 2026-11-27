---
picogk: patch
---

Showing a large PicoGK model in the browser takes much less memory. The viewer no longer copies every `Add` into managed arrays while the model runs: it keeps the immutable native mesh taken at `Add` and reads it back only for objects still in the scene when the model returns, so a preview that `RemoveAllObjects` drops is never copied. The scene no longer keeps an author's `Voxels` alive, so a previewed intermediate the model has dropped can be freed during the build. Vertex normals for a large mesh need about a third of the scratch memory they did, with bit-identical output, and the mesh artifact is hashed in constant memory instead of in a buffer that doubled past the artifact's size. The scene shows exactly what it did.
