---
filesystem: minor
revisions: minor
runtime: minor
---

`@taucad/filesystem` applies every mutation as a changeset: `apply({ entries })` on a rooted view admits the whole changeset before its first I/O (phases 0–2, no two entries of a phase racing), holds one shared/exclusive lock set for it, and answers a receipt per entry (`applied`, `failed`, `uncertain` or `skipped`). A changeset holds at most 256 entries and 32 MiB (`splitChangeset` divides larger work), publishes one change event (a `changeSet` envelope when it holds more than one fact; `changeEventEntries` expands it) and one cross-tab notice with a sequence number, and a gap in a sibling's sequence resets every storage root the authority holds. Conveniences issued together coalesce into one changeset. Providers take a batch (`applyBatch`): the File System Access and OPFS providers write through atomic writables, OPFS stages writes of 8 MiB or more under `.tau-staging` (a control-plane path, hidden and never versioned) and moves them into place, a batch records each create whose path it found missing, with its size, in IndexedDB before it makes the file and until the batch settles, so the next open of that root (OPFS, or a picked folder by its workspace id) removes only the empty file a killed realm left and publishes the removal, and IndexedDB refreshes only the prefixes a change named. `applyChangesetToProvider` runs a changeset on a bare provider, and `workerTimings` counts each committed changeset (`changesets`).

`@taucad/revisions` applies a tree as bounded changesets: a new file is written once at its final path, and removed on the next open only while it is the empty file a killed apply left, and a replaced file is staged beside it, moved aside, verified and replaced with one move, so every path holds its old bytes or its new ones. `sweepTemporarySiblings` (at `@taucad/revisions/apply-tree`) recovers a checkout an apply died in.

`@taucad/runtime` re-exports the widened `ChangeEvent` (a path fact or a `changeSet` envelope) with `PathChangeEvent` and `ChangeSetEvent`; a subscriber that switched on `type` expands an envelope with `changeEventEntries` from `@taucad/filesystem`.
