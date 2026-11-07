---
filesystem: minor
---

The Project Index records removals (S10). A rooted view's `changedSince(since, { epoch })` now answers `removed` beside `entries`: every path the index stopped holding after `since` (a delete, a move's source, a path an observation no longer lists, whatever a write of another kind replaced), each with its kind and generation, and the index's `epoch` to pass with the next `since`. The record keeps the newest `indexRemovalLimit` (4,096) removals and is stored with the snapshot under its CAS; a `since` the record no longer reaches, from another epoch, or ahead of the index answers `rescan: true` with both lists empty, never a silent gap. A loaded index continues the stored epoch only for a `since` up to the stored generation. `ProjectIndex.changes()` and `removalSnapshot()` are new, `ProjectIndex.fromSnapshot`'s third argument is now `{ pending, removals }`, and `IndexChanges` gains `epoch`, `removed` and `rescan` (`IndexRemoval` is exported).
