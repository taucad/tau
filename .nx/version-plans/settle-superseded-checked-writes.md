---
filesystem: patch
---

A node provider write that a concurrent writer of the same path replaces while the write reads its own bytes back now settles instead of rejecting `CHECKED_WRITE_POTENTIALLY_APPLIED`. The post-rename verification still holds the inode it published to its identity and bytes, but no longer to its status-change time, which the later writer's replacement moves when it unlinks that inode.
