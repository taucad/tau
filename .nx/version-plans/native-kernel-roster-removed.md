---
native-process-core: minor
---

There is no native kernel roster. `@taucad/native-kernels`, which preview builds of this release carried, is removed, and `@taucad/native-process-core/adopter` no longer exports its contract (`NativeKernelAdopter`, `NativeKernelPluginFactory`, `defineNativeKernelAdopter`). A native kernel package exports a `NativeKernelDeployment` from its `/native` subpath and binds it to its kernel with `withNativeDeployment`; a host lists the package's plugin in its runtime definition and finds the deployment with `nativeDeploymentsOf` from `@taucad/native-process-core/store`. Build123d's payload generator is the `tau-python-kernel` command of `@taucad/python-kernel-core` (`tau-python-kernel generate|check|seed|golden --package <dir>`).
