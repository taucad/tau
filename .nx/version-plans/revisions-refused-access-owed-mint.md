---
revisions: patch
---

A revision minted while sync is `failed` (for example after the remote refused access) is now recorded as owed in the durable queue, so `selectSyncFacet` reports it in `pendingCount` instead of leaving it at 0. The project no longer reads _Backed up_ over a revision the remote never received; with nothing minted since the refusal it still does. The state stays terminal: nothing is pushed until _Sync now_ or a remote change.
