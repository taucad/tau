---
runtime: minor
---

`createPreparationHost` takes `nativeContainment(indicators, packageName)`, which answers why the host cannot contain a native worker, or `undefined` when it can. A native variant is refused with that answer before anything downloads. The default still refuses on Windows, where no native worker runs unsandboxed. A host that has configured the Windows sandbox passes `nativeSandboxRefusal` from `@taucad/native-process-core`.

A seal step now receives `scratch`: an empty directory for its own temporary files, inside the store's staging area, never inside the closure or the system temporary folder. The host removes it when the step settles. Python kernels use it for the self-test's working folder and for Windows' staged compiler, so no sandbox grant lands beside other applications' files in `%TEMP%`.
