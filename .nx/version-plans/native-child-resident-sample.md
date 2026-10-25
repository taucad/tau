---
runtime: minor
native-process-core: minor
python-kernel-core: minor
dotnet-kernel-core: minor
host: minor
cli: minor
build123d: minor
smlibpy: minor
picogk: minor
---

A kernel definition may implement `observedChildResidentBytes(context)`, the bytes resident in the process tree of the native child it runs in, read for observation only: like `observedHeapBytes` it never reaches `Rendering.heapBytes` and never feeds worker recycling. The runtime asks once per observed operation, after its reply, waits at most 50 ms and reports the figure with heap source `child`. A `NativeProcessSession` answers `sampleResident()` with one generation-checked sample: on Linux, `VmRSS` summed over the worker's tree walked to its leaves (at most ten levels and 32 processes), falling back to the host process table where the kernel has no children files; no reader on macOS until one is verified there, and none on Windows. The Python and .NET sessions and PicoGK's session pass it through, and Build123d, SMLib Python and PicoGK implement the hook. A runtime child samples its brokered workers through its daemon with the new `native-worker:sample` frame, sent only when the daemon names it in `start`.
