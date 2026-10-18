---
cli: patch
host: minor
---

The CLI composes native kernels through `@taucad/native-kernels` instead of naming Build123d and PicoGK: `tau export`, `check`, `test`, `mcp` and `serve` compose every kernel in the roster from the payload store, and a runtime thread or runtime child now checks each composed kernel's options against its package's schema. `@taucad/cli` depends on `@taucad/native-kernels` in place of `@taucad/build123d` and `@taucad/picogk`. Two native kernels in one runtime now sit in roster order (Build123d, then PicoGK); they claim different extensions, so no file routes differently.

`@taucad/host`: `prepare_kernel`'s description and input schema name the kernels the host passes as the new `preparableKernels` option of `createHostToolRegistry`, `createProjectHost` and the daemon's agent options (type `HostPreparableKernel`), instead of a fixed "build123d for .py, picogk for .cs".
