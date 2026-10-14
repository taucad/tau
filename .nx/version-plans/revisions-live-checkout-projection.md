---
revisions: patch
---

The status projection names the live checkout as well as the selected one, so a branch on the live checkout is never marked _Linked_ while the workbench is on another.

- **`RevisionStatusProjection`** (`@taucad/revisions`) gains optional `liveCheckoutId`.
