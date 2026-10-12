---
runtime: major
runtime-testing: major
replicad: major
opencascade: major
esbuild: major
rolldown: major
manifold: major
jscad: major
picovoxel: major
tscircuit: major
---

Keep runtime clients that share one JavaScript realm from corrupting each other's kernels. The in-process transport and `webSocketHost` in factory mode build every kernel worker in the caller's realm, so a second client used to rebind replicad's OpenCASCADE instance and overwrite the built-in module registry; the first client's later renders and exports then failed with `KERNEL_BINDING_FAILED`.

`@taucad/runtime` adds `services.realm` (`RealmResources`, `RealmHold`): `hold({ group, key, create, dispose })` gives every kernel in a realm one promise-guarded, refcounted instance per group, disposes it after the last release, and refuses a second build of a held group with the new `KERNEL_REALM_CONFLICT` issue, whose `details.producer` names the refusing kernel. `registerKernelModule` now scopes built-in modules to the registering kernel worker, gains `exportPath` for subpath modules, and a worker drops its modules on cleanup; `BuiltinModule` gains an optional `registryExpression`.

Breaking: `KERNEL_MODULES_KEY`, `getModuleRegistry` and `createKernelModuleRegistryExpression` are removed from `@taucad/runtime/kernel`. Register built-ins with `registerKernelModule` and pass a kernel's own registered exports where it needs them.

`@taucad/replicad` and `@taucad/opencascade` hold one OpenCASCADE instance per realm through `services.realm` and release it on dispose; replicad passes each client's own library facade as `main`'s first argument. `@taucad/jscad` registers its `@jscad/modeling` subpaths per worker and passes `@jscad/modeling` to a two-argument `main` even when another kernel registered a module first. `@taucad/esbuild` and `@taucad/rolldown` bind a built-in's `globalName` from its `registryExpression`. `@taucad/manifold`, `@taucad/picovoxel` and `@taucad/tscircuit` resolve each client's own built-in modules, and `@taucad/manifold` serialises Manifold work across the clients of one realm so one client's cleanup cannot delete another's objects mid-render. `@taucad/runtime-testing`'s mock kernel runtime carries an unshared realm.
