---
filesystem: patch
---

On Windows, `NodeFsProvider` retries the rename that publishes an atomic write when it fails with `EPERM`, `EACCES` or `EBUSY`. Defender, the search indexer and backup agents briefly hold a freshly written file, and the rename then failed though nothing was wrong. The rename is retried with a growing delay for about a second, as graceful-fs does, and the last error is answered. Other platforms answer these errors at once. Each retry is admitted on the same checks as the first attempt, so a write whose parent changed or whose writer lost its claim during a backoff is refused, known not applied.
