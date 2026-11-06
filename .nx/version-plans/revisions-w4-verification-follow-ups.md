---
revisions: patch
---

Follow-ups from the W4 verification.

- Each large-object download now has a no-progress stall bound, `transferStallMilliseconds`, which defaults to `lfsTransferStallMilliseconds` (60 seconds). The time spent waiting for the first byte counts toward it. A transfer that hangs is abandoned and retried, then fails, so the fill can be retried instead of waiting until the project closes.
- A tree write whose checkout index cannot learn its entries logs the failure and writes the tree anyway. Its reading stays at `treeReady` until the write ends.
- The entry closure is a pass of its own only when one of its files is replaced. A cold open, where every file is created, lands the closure first within its single changeset per bound (I8).
- A failed tree write is told as failed only when it left the checkout torn. A write that changed nothing, or that undid itself, left the checkout whole. Otherwise the recovery write that puts the prior files back is told separately.
