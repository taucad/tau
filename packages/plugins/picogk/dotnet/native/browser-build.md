# Private browser overlay

This is the Tau-owned input to PicoVoxel's private .NET engine build. It preserves
the existing hosted PicoGK geometry and capture interfaces. It does not add a
viewer or change the npm engine.

Apply `Runtime.browser.patch` after PicoVoxel's pinned runtime and OpenVDB patches,
in a fresh staged runtime tree. Build `Source/PicoGKLibrary.cpp` with
`PICOGK_HEADLESS` and `PICOGK_BUILD_LIBRARY`; the conditional sections exclude
native viewer code while retaining private geometry exports after that code.
Do not use the npm core-extraction script: its upstream-only boundary intentionally
ends before the Tau exports. Rebuild OpenVDB with the included grid patch.

Compile `browser-callbacks.cpp` in place of PicoVoxel's plain upstream
`dotnet/native/callbacks.cpp`. Both implement the same four context-aware imports;
the Tau adapter preserves checked lifetime/input status and additionally adapts
the hosted surface-normal batch callback. Do not link both adapters.

For managed source, apply `PicoGK.hosted.patch`, then PicoVoxel's
`browser-handles.patch`, then `PicoGK.browser.patch`, and include PicoVoxel's
`BrowserCallbacks.cs` and `SdfTape.cs`. The latter is the signed-distance tape
registry the browser boundary consults before falling back to a per-voxel
callback; it is reached only from `PICOGK_BROWSER` branches and needs the
archive's ordinary `Voxels_IntersectImplicitTape` and `Voxels_RenderImplicitTape`
exports. Build PicoVoxel's `dotnet/generator/PicoVoxel.Sdf.Generator` and pass the
resulting assembly as `TauPicoGKGeneratorPath`: the browser host resolves no
analyzer assemblies from disk, so `CompilationService` drives that one generator
explicitly. Apply the build-time `stl-normal-canonicalization.patch`
to the parity library on both targets; it writes historical NaN normal bits after
float storage without changing finite normals or vertices. Do not also apply the plain upstream
`browser-callbacks.patch`: the hosted supplement routes through the existing
checked operations. Define `PICOGK_BROWSER` only for the browser build. Desktop
branches retain their original signatures and implementations.

The existing hosted viewer remains responsible for scene capture. Native viewer
entry points are excluded from browser imports; attempting to construct a native
viewer directly throws a platform error. The host supplies its existing backend.
No native Skia renderer is required for these geometry/capture operations.

Qualification uses `tests/browser-storage.cpp` for bounds, immutable snapshots
and degenerate beams, and `tests/browser-core.cpp` for the historical sphere and exact gyroid pins,
checked callbacks, normal batches and VDB roundtrip. The latter also links every
retained managed import. Blosc and zlib must be present for the existing VDB codec
contract. Build every archive with the compiler actually supplied by the selected
.NET workload, and validate input identities before consuming cached archives.

The production archive/host targets are implemented in subsequent program tasks;
these overlay inputs alone do not constitute browser-host qualification.

Exact geometry uses the upstream implicit-intersection temporary-field conversion
from background millimetres to an integer band, even though it looks inconsistent
with the parent field. Replacing it with the parent's band changes the gyroid
digest. Functional boolean operations use independent operand copies and the same
OpenVDB mutation functions as copy-then-mutate; a custom DeepCopy operator traversal
changed HeatX geometry. The historical HeatX STL is the regression witness for
that path; small sphere boolean checks alone did not expose the discrepancy.
