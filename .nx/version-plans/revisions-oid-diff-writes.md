---
revisions: minor
---

Write restore, switch, pull and merge fast-forward by oid diff (D10). These writes now read only the paths that `RevisionPort.diff` says changed between the head the files are proven to hold and the target. They read those paths with `largeObjects: 'local'`, and every other path keeps the bytes the checkout already has. A restore plan no longer reads a tree to count what it removes. Large objects that a write leaves as pointers are filled by a fill that the write starts, rather than being fetched before the write. A switch over files the person agreed to replace still reads the branch's whole tree, until the index can say which paths those are.

Each write of another revision's tree uses the new `ApplyingTreePurpose` value `tree`. That write ends the old tree's fill silently (`forget` on the fill), and the new tree's fill always reports, even when there is nothing to fill. `readinessOf` takes a third argument, the number of tree writes a host has seen begin on the checkout, and keys its reading by it. `settleReadiness` no longer lets `filled` fall back to `materialized` within one tree (I7). `materializeTree` from `@taucad/revisions/apply-tree` also accepts a function that builds the target from the capture once `validate` has passed (`MaterializeTarget`).
