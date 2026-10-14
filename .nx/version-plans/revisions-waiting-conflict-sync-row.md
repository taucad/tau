---
revisions: patch
---

The Sync row no longer says a linked branch "will catch up and try again" while that branch's conflict waits on the person. A lost lease on a branch with an undecided conflict now reads "<branch> waits on your decision; its revisions back up once you choose."

- **`selectSyncFacet`** (`@taucad/revisions/sync-machine`) takes an optional second argument, the branches whose conflict waits on the person; the project-revisions root passes its `conflicts`, so the sentence survives a reload.
