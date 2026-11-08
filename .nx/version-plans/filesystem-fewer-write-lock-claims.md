---
filesystem: patch
---

A write through a mount with its own storage root claims only that root's physical locks (the target exclusive, its ancestors shared) and the project-shared lock, no longer a logical lock per path segment as well: a nested project write takes four Web Lock grants instead of seven, which shortens the time it waits behind read traffic on the authority. Writes through virtual mounts keep their logical claims.
