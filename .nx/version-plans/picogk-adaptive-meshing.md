---
picogk: minor
---

`@taucad/picogk` views take `meshAdaptivity` (0 to below 1, default 0) and `meshRelax` (default `false`). Above 0 the build asks the worker for an adaptive OpenVDB display mesh, and the tessellation report adds `adaptivity` and `relax`. The default sends today's request and renders today's mesh; glTF and GLB exports pin `meshAdaptivity` to 0. The worker protocol stays at version 8: a worker that does not echo the meshing it applied refuses the adaptive view with a typed `meshing-unsupported` issue instead of showing a uniform mesh as adaptive.

The native PicoGK build now:

- renders implicits one z-row per lock instead of one voxel per lock, with value-identical grids;
- adds a batched implicit callback;
- appends element-built meshes in one native call;
- marshals native `bool` as one byte;
- clips a render box with a real surface instead of an unbanded cut;
- builds `ScalarField` from Voxels into an empty field;
- hands out copies of `OpenVdbFile` fields, so editing a field read from a file changes neither the file nor another read, while `SaveToFile` still stamps the file's own grids;
- uses unregistered accessors for per-call queries;
- joins slice contours within a one-pixel window;
- merges adaptive mesh regions through an exact OpenVDB `VolumeToMesh` fast path that makes the generic merge's decisions in less time, so adaptive meshes stay byte-identical;
- builds with `-ffp-contract=off`.

The worker's compile, edge-adjacency, validation and frame-parsing paths also do less work, with identical output. The published layers pinned in `tau-plugin.json` keep running until a release rebuilds them and a follow-up re-pins them.
