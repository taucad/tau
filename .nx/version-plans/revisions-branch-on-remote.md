---
revisions: patch
---

A branch row knows whether the remote holds its branch, so _Remote only_ is said only of a branch the remote has.

- **`RevisionBranchFacet`** (`@taucad/revisions`) gains optional `onRemote`, set from the branches the latest fetch listed; a branch only this device holds reports `false`.
