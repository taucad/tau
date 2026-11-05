---
revisions: minor
---

Add the readiness vocabulary of a project's open: `ProjectReadiness` (`connected`, `treeReady`, `entryReady`, `materialized`, `filled`), an optional `readiness` on `RevisionStatusProjection` that the host settles, and `readinessOf`, `settleReadiness` and `reachesReadiness` to derive, hold and test it. A reading never falls back within one tree, except that `filled` gives way when the fill names a pointer. The large-object fill now reports its placeholders before it asks for the first object, and reports once on a checkout with nothing to fill, so a host never reads its silence as filled.
