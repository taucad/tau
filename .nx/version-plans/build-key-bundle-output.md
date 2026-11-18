---
runtime: minor
esbuild: minor
rolldown: minor
replicad: minor
jscad: minor
manifold: minor
opencascade: minor
picovoxel: minor
smlib: minor
tscircuit: minor
---

A kernel can declare `sourceIdentity: 'bundle'` (default `'files'`) when its `resolve` answers from `runtime.bundler` and it reads model sources only as bundle output. For such a kernel the build key carries a new `bundle` dependency (`BundleDependency`, the SHA-256 of the bundled output) in place of those sources' content hashes, so a comment-only or formatting-only edit reuses the previous build; the files stay in `dependencies` with their content hashes and enter the key by path. The Replicad, JSCAD, Manifold, OpenCascade, Picovoxel, SMLib and tscircuit kernels opt in. Parameter descriptions still key on file bytes. `BundleInput.globals` names the built-in modules whose script globals a bundle binds; the runtime passes the selected kernel's, and esbuild and Rolldown emit them sorted, so a bundle no longer depends on which other kernels a worker loaded. Requested view `content` is keyed with its operation defaults applied, and an executed module is kept across an edit that prints the same bundle. `portableKernelModuleCode` and `bindKernelModuleCode` (from `@taucad/runtime/kernel`) keep bundle code stored in a handle snapshot free of the storing worker's module-registry scope; the JSCAD and Manifold kernels use them, so a durable build restored by another worker can run its program again (before, a restored Manifold build failed to re-mesh at a non-default detail). Keys change shape, so durable compute stores rebuild their entries once after the upgrade.
