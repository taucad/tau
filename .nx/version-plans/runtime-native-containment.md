---
runtime: minor
---

`createPreparationHost` takes `nativeContainment(indicators, packageName)`, which answers why the host cannot contain a native worker, or `undefined` when it can. A native variant is refused with that answer before anything downloads. The default still refuses on Windows, where no native worker runs unsandboxed. A host that has configured the Windows sandbox passes `nativeSandboxRefusal` from `@taucad/native-process-core`.
