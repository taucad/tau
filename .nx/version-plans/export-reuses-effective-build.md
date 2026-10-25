---
runtime: minor
picogk: minor
---

An export reuses the view's build when the kernel reports that build as exactly what the export's options would build.

- `@taucad/runtime`: kernels gain an optional `effectiveOptions({ handle, options })` hook. It returns the evaluate options under which a fresh build would give the handle's geometry, when the kernel fell back to other output than was asked. An export whose admitted evaluate options equal them uses the view's live or snapshot handle. Every other dependency of the native handle must still match. A missing, failed or mismatched report builds for the export, as before.
- `@taucad/picogk`: a default view on a worker that predates adaptive meshing gets the uniform mesh. Its export no longer runs the C# program a second time. An adaptive view still builds the uniform mesh for its export, so exported bytes do not change.
