---
filesystem: patch
---

`@taucad/filesystem` now checks the fenced appends to one path in a changeset in entry order, against a running length and token. Two appends fenced at the same length can no longer both land, and a pipelined append at L followed by one at L + n is no longer refused.
