---
revisions: patch
---

Fixes from the W4 code review.

- `resolvePlaceholder` now rejects with `PendingError` when the object fetch fails, with the fill's reason and the transfer's error as its `cause`. An abort is still rethrown unchanged. `PendingError` is now exported from the package root, so a host can tell a pending read with `instanceof`. Its `reason` property carries the reason.
- Large-object adoption no longer copies the whole captured checkout. Each candidate is copied once, to be stored, and the tree it writes shares every unchanged file with the capture.
- A real merge into the checkout's own line now writes only its merged paths, laid over the checkout as the fence holds it. Before, a placeholder that a fill wrote while the merge was being prepared was turned back into its pointer.
- When a tree write fails and the follow-up check of its large objects fails too, the next capture of the checkout runs the check again, for a linked checkout as for the project directory. Readiness no longer stays at `materialized`.
- The `onApplyingTree` contract now documents every write purpose and what the release outcome means.
