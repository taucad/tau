---
revisions: minor
---

Fixes from the W4 re-review.

- The authority's read-through of a pending entry never aborts a download. `resolvePlaceholder` now takes a `PlaceholderRequest` with `signal`, `onProgress`, `pointer` and `localOnly` in place of a signal. It moves the path to the front of the running fill (`prioritize` on the fill). It joins the fill's transfer of the object, so the object downloads once. Its fetch runs without the reader's signal, and only a close stops it.
- `ReadTreeOptions.onTransferProgress`, which `fetchLargeObjects` also takes, is told whenever bytes of one of the read's objects arrive, including bytes from a transfer this read joined. `LfsDownloadManyInput.progress` reports bytes as they arrive, by oid.
- A copy's target can be answered from the pointer the copy carries (`pointer`), and from the device alone (`localOnly`), which rejects with `PendingError` rather than fetch.
- A tree write lands its entry closure before any other file, whether the closure's files are created or replaced. It tells the index its entries inside the bracket, so the expectation always ends, even when the host's bracket throws.
- The bracket's release is now told how the write ended (`ApplyingTreeOutcome`). `ReadinessSource.treeWriteFailed` keeps a failed write's new tree at `treeReady`, so it is never read as `materialized`.
