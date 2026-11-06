---
filesystem: patch
---

A warm open no longer pays a handle lookup per `stat`. A webaccess or OPFS provider keeps the file handles that `readdirWithStats` enumerates and that a `stat` looks up, so the next `stat` of the same path is one `getFile()`. A handle is a locator and never holds bytes (I3). `refresh` drops kept handles, as does a scoped invalidation or a mutation through the provider that names the path. A handle that no longer resolves falls back to the lookup. A Project Index compare that adopts a write's provider mtime now stores its snapshot again. Before, a snapshot stored before the compare kept the write-time clock, so every later load found each written file changed.
