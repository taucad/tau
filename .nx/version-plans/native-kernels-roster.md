---
native-kernels: minor
---

Add `@taucad/native-kernels`, the roster of native Tau kernels. The root exports `nativeKernelAdopters` (Build123d, then PicoGK), the `ComposedNativeKernel` and `NativeKernelComposition` types keyed by package, `nativeCompositionSchema` for parsing a composition received from another process, and `unavailableKernelsPlugin`/`unavailableKernelIssue`, the stand-in that refuses a kernel's files with `KERNEL_NOT_PREPARED` or `KERNEL_CAPABILITY_MISSING`. `/manifest` exports each package's `tau-plugin.json` for bundled hosts. `/node` composes every native kernel from an injected payload store and managed profile (`nativePreparationPlugins`, `composeNativeKernels`, `nativeKernelFor`, `composeNativePlugins`, `verifyStoreClosure`, `nativeKernelIdsSupportedOn`, `openNativePreparation` with `UnknownNativeKernelError`, all taking a `NativeStoreInput`).
