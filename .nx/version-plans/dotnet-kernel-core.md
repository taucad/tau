---
dotnet-kernel-core: minor
---

Add `@taucad/dotnet-kernel-core`, the shared TypeScript side of native .NET kernels. The root exports `createDotnetSession`, a worker session on `NativeProcessSession` configured from a kernel's `DotnetWorker` (names, protocol schemas, worker error), and `createDotnetWorkspaceMirror`. `/adopter` exports `defineDotnetKernelAdopter`, which derives a NuGet `NativeKernelAdopter` from a closure layout (worker assembly and launch resources), with `dotnetLaunchSet`, `dotnetOptionsFromClosure`, `dotnetKernelOptionsSchema` and `dotnetClosureOptionsSchema`; it imports no session code. `/layer` exports `createDotnetLayer` (layer record schema, CDN and release URLs, the `worker` pin and the CycloneDX SBOM) and `runComposeTauPlugin`, the body of a kernel's compose script.
