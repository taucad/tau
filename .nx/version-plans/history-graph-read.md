---
revisions: minor
host: minor
---

`readRevisionGraph` reads every branch's history in one walk and says which line each entry is drawn on: `main`'s first-parent chain, then each other branch's chain until it meets an entry a line already owns, then any side a merge brought in that no branch names, keyed by its newest entry. Chat records and conflict lines are never read as branches. Its rows are the `RevisionRow`s `readRevisionLog` returns, unnumbered, with `line` and `branch`: versions carry their numbers and an automatic entry that changed only Tau's setup files carries `isSetup`, judged the same way.

A host's revision channel answers a `graph` request (`limit` optional) with that read, so History can draw every branch's lane.
