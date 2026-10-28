---
runtime: minor
picogk: minor
picovoxel: minor
---

Mesh adaptivity is adjustable for the view and for exports.

- `@taucad/runtime`: a successful evaluation offers the kernel's evaluate options as `evaluateOptions` (`{ schema, defaults }`), absent for a kernel that takes none. Every view of the evaluation shares them; `update({ evaluateOptions })` re-evaluates with new values.
- `@taucad/picogk` and `@taucad/picovoxel`: exports take `meshAdaptivity` (0 to below 1, default 0, the uniform mesh) and `meshRelax` (default `false`) instead of pinning the uniform mesh. A picovoxel adaptive export needs `lane: 'fast'` (the exact lane refuses it), and as every fast export it writes STL only. A PicoGK export whose meshing matches the view's build reuses that build. Both kernels' view `meshAdaptivity` carries the Balanced value 0.25 as its example, so a settings UI shows it while the option stays unset.
