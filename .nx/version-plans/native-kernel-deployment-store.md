---
native-process-core: minor
---

A native kernel is integrated by listing its plugin in a runtime definition. `@taucad/native-process-core/adopter` adds `NativeKernelDeployment` and `defineNativeKernelDeployment` (the package, ecosystem, `tau-plugin.json`, package root and entry derived from the defining module's `import.meta.url`, the closure-to-options mapping, the seal step and the launch set), `withNativeDeployment`, which binds a deployment to a kernel factory so every registration carries it, and `nativeDeploymentOf`.

New `@taucad/native-process-core/store` (Node) holds the payload-store machinery, driven by deployments instead of a roster: `nativeDeploymentsOf` (the native packages a resolved runtime lists), `preparationPluginsOf`, `preparableKernels`, `nativeKernelIdsSupportedOn`, `openNativePreparation` with `UnknownNativeKernelError`, `verifyStoreClosure` and `defaultPayloadStore`; late binding in a kernel's `initialize` through `bindNativeKernel`, which throws `UnpreparedKernelError` carrying `KERNEL_NOT_PREPARED` or `KERNEL_CAPABILITY_MISSING`; the closure resolvers (`storeClosureResolver`, `installNativeClosureResolver`, `inspectNativeKernels`, `inspectionResolver`) with `nativeInspectionSchema` and `nativeClosureAnswerSchema`; and the parent report (`reportNativeDeployments`, `loadReportedDeployments`, `nativeDeploymentReportSchema`).
