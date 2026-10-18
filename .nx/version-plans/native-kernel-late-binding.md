---
python-kernel-core: minor
dotnet-kernel-core: minor
build123d: minor
picogk: minor
---

Python and .NET kernels bind their closure late. A kernel's options are now `{ closure?, requestTimeout, maxArtifactBytes }`, a strict object: an explicit `closure` (the interpreter or runtime, worker and support files with their digests) is used as given, and without one the kernel's `initialize()` resolves the prepared closure from the host's installed resolver or the local payload store, refusing with `KERNEL_NOT_PREPARED` or `KERNEL_CAPABILITY_MISSING` when it is not ready. Options that name the closure fields at the top level are refused; nest them under `closure`.

`@taucad/python-kernel-core` adds `bindPythonKernel` and `pythonClosureSchema`; `definePythonKernelAdopter` now takes the package's `tau-plugin.json` and `moduleUrl` (and an optional `packageRoot`) and no longer takes `load`. The payload and project template generators and the Python test runner ship as the `tau-python-kernel` bin (`generate`, `check`, `seed`, `golden`, `template`, `test`, each with `--package <dir>`), so a kernel outside the Tau repository uses them without a Tau checkout. `@taucad/dotnet-kernel-core` adds `bindDotnetKernel` and `dotnetClosureSchema`; `defineDotnetKernelAdopter` takes `manifest` and `moduleUrl` and no longer takes `load`. `@taucad/build123d` exports `build123dClosureSchema`.
