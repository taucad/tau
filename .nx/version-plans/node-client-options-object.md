---
runtime: major
---

Replace the `createNodeClient(projectPath, options)` positional signature with a single options object: `createNodeClient({ runtime, projectPath })`. The optional project path no longer occupies the required first position, so inline-source callers stop passing a literal `undefined`. Also renames the doubled-suffix option types `CreateWebWorkerClientOptionsOptions` to `WebWorkerClientOptionsInput` and `CreateElectronClientOptionsOptions` to `ElectronClientOptionsInput`.
