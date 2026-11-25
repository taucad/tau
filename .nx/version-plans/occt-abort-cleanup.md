---
occt-core: patch
---

The OpenCascade exception proxy no longer checks for a superseding abort in embind's handle methods (`delete`, `isDeleted`, `deleteLater`, `isAliasOf`). Cleanup that runs after an edit supersedes a build, such as a `finally` that deletes or Replicad's `FinalizationRegistry` callback that asks `isDeleted()`, now frees what it owns instead of throwing `RenderAbortedError`; from a finalizer that throw was uncaught and the handle was never deleted. Every other OpenCascade call still stops at the abort.
