---
filesystem: patch
revisions: patch
runtime: patch
---

A read of a path that a tree write has yet to land now waits for it instead of answering the bytes left on disk. `readFile`, `readFileStream`, `stat`, `lstat`, `exists`, `readdir` and `readdirEntries` on a rooted view hold until the path lands or goes, and refuse with `ArrivingContentError` (`PENDING`) when the write fails or stalls; paths the write already holds answer at once, and the raw view never waits. A failed write keeps refusing what it owed until its rollback ends. `@taucad/revisions` names a tree write's manifest and removed paths, and a kernel render refused on a path renders again when that path lands.
