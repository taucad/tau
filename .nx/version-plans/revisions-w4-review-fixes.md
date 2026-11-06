---
revisions: patch
---

Fixes from the W4 review.

- A fast-forward merge into a line the target checkout is not on writes that line's tree whole, as a real merge already does. It no longer overlays the diff on another line's files.
- `materialize` gives up with `PendingError` when the fill makes no progress for its stall bound (`stallMilliseconds`, a minute by default). The fill's `written` answers `stalled`, and a read waits at most a minute.
- `readContent` and `materialize` treat a pointer as a placeholder only where the project's attributes track large objects, as adoption decides. Anywhere else it is read as the text it is.
- A fill begun for a tree is dropped when another tree write starts before it registers, so it never speaks for the newer tree.
- A checkout with no revision behind it reads `filled` without waiting for a fill that never runs there. Until the index-backed tree lands, `entryReady` is reached together with `materialized`.
