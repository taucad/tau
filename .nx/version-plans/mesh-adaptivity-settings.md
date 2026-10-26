---
runtime: minor
viewer: minor
picogk: minor
picovoxel: minor
---

Mesh adaptivity is adjustable on views and on exports for PicoGK and PicoVoxel, and the viewer's Kernel settings offer it.

- `@taucad/runtime`: a view's offered `options` now carry its kernel's evaluate options beside the view's own, and a document view may set them. When the values a view sets build differently from the document's evaluation, the runtime renders that view from a build of its own, keyed like any build by its construction options, so two values never share a native handle; a view that sets none, or sets the evaluation's own values, renders the evaluation's build as before. Typed clients accept those options on `document.view(id, { options })`. Exports still build from the document's evaluate options and their own. The rendering wire schema now keeps a tessellation report's `adaptivity` and `relax`, which it used to strip.
- `@taucad/viewer`: a number setting with no value and no default shows its schema's first example, so an unset `meshAdaptivity` reads as the Balanced 0.25 the kernel resolves instead of 0.
- `@taucad/picogk`: GLB and glTF exports take `meshAdaptivity` in [0, 1) (default 0) and `meshRelax` (default `false`) instead of pinning them. Default exports are unchanged byte for byte; an explicit adaptive export on a PicoGK runtime that cannot mesh adaptively is refused with `meshing-unsupported`, as an explicit adaptive view is. An export that asks for exactly the meshing a default view was delivered with reuses that build.
- `@taucad/picovoxel`: GLB, glTF and STL exports take `meshAdaptivity` in [0, 1) (default 0) and `meshRelax` (default `false`). Default exports are unchanged byte for byte. Adaptive meshes are fast-lane geometry, so an adaptive export needs `lane: 'fast'`: STL takes it and is stamped `LANE=fast`, GLB and glTF refuse the fast lane as before, and an exact export that asks for adaptivity is refused with `PICOVOXEL_MESHING_EXACT_LANE`.
