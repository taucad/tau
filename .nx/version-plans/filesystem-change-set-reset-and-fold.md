---
filesystem: patch
---

`@taucad/filesystem` change-set delivery keeps two facts it could lose. When one changeset replaces two ancestors of a watched path, the watch now receives one reset at their common ancestor. Before, it received a reset of the later ancestor only. A merge of change sets also no longer folds a deleted directory into a later create at the same path: the delete is kept ahead of the create, so a consumer learns that the old directory's descendants are gone.
