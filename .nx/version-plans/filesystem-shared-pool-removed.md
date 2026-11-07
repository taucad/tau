---
filesystem: minor
---

`@taucad/filesystem` drops the shared file pool (D13): `WorkspaceFileService` no longer takes a `filePool` option or offers `setFilePool`, and reads no longer copy their bytes into a pool. Reads always go to the provider. `@taucad/filesystem` also no longer depends on `@taucad/memory`.
