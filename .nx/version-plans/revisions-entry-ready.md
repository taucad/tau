---
revisions: minor
---

`entryReady` is now produced (D10).

- A write that holds the tree tells the checkout's index every entry of the tree before any lands, each placeholder with its large object (`expectEntries`).
- It lands the entry closure first: `tau.json` and the files it names (`entryClosurePaths`).
- It names that closure on its bracket (`ApplyingTreeBracket.closure`).
- `readinessOf` reads `entryReady` while the write holds the tree, once the host reports from the index that the closure has landed (`ReadinessSource.entryClosureLanded`). It reads `treeReady` before that, and `materialized` or `filled` once the write ends. A reading never steps back within one tree (I7).
