---
revisions: patch
---

The isomorphic-git revision port shares one object cache across a burst of reads, so a tree walk or a push no longer reloads and re-hashes a packfile for every object it reads. The cache, which holds parsed pack indexes and pack bytes, is dropped two seconds after the last read.
