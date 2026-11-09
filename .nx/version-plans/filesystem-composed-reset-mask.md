---
filesystem: patch
---

A composed view no longer names a hidden directory in a change set's reset. A reset whose prefix the view's consumer may not see is lifted to the nearest directory it can see, as its per-path watch already hides those paths.
