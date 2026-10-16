---
runtime: patch
---

An export that refuses with a kernel issue now reaches the caller with that issue. Before, the runtime's export boundary replaced any error thrown by a kernel's `export` with `KERNEL_BINDING_FAILED`, so an OCCT export over its 20,000,000-triangle budget lost its `RESOURCE_LIMIT` code and the suggested tolerance in `details`. The export boundary now reads the issues a thrown error carries, as render and evaluate already did; an error that carries none, such as a `ZodError`, is still `KERNEL_BINDING_FAILED`.

Each `kernel.mesh` span whose render reports a tessellation now carries `tessellation.effective.*` attributes: `form` (`preset` or `explicit`), `preset`, the effective `linearTolerance` and `angularTolerance`, `triangles`, `vertices`, `elapsed`, `downgraded` and `downgradeSteps`, `simplified` (the render delivered `DISPLAY_SIMPLIFIED`) and, for voxel kernels, `voxelSize`. A render without a report carries none of them.
