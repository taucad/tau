---
revisions: patch
---

Integrate every checked-out branch on every fetch, not only the live one. A linked checkout whose branch diverged from its remote head is now merged as the live branch is: changes that do not overlap land a merge revision that is pushed, and overlapping changes are recorded on the branch's conflict line and announced once as `mergeConflicted`. A dirty or leased linked checkout is still left where it is until the next pull.

- **`SyncFetchActorOutput`** (`@taucad/revisions/sync-machine`) gains optional `merged` (the linked branches this pull merged) and `conflicts` (conflicts this pull newly recorded for linked branches); a merged checkout is also reported in `advanced` so its actor re-heads.
- **Retries after a lost lease.** A `leaseLost` refusal of another branch no longer narrows the next push to that branch alone, so the live branch's revisions and new conflict lines keep backing up while it waits.
