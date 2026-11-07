---
filesystem: minor
---

`NodeFsProvider` applies a changeset phase natively: `applyBatch` stages and syncs every write's temp sibling, renames them, syncs each directory the renames landed in once and reads each file back once, so a phase costs at most one fsync per file plus one per directory; its receipts follow the primitive batch's rule, `uncertain` once a write made a parent or attempted its rename. The Node bridge client sends the phase as one `applyBatch` request (node protocol 10). Node's `readdirWithStats` costs one `lstat` per row in a directory reached without a link, and its watcher classifies events with asynchronous stats, trusting a native delete, instead of one synchronous `stat` per event; a handler that throws is reported and the stream keeps delivering.
