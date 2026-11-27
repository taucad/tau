---
filesystem: patch
---

`WorkspaceFileService.close()` releases the service as `dispose()` does, then resolves only once no Project Index snapshot write it began can still reach the disk. A write in flight stops at its next await before the disk; one already writing its file finishes first. Await it before removing or moving a root the service served: on Windows a snapshot write landing in `<root>/.tau/index` during the removal failed it with `ENOTEMPTY`.

`dispose()` and `ProjectIndexes.clear()` now also stop a snapshot write in flight before it writes, and no snapshot write starts after `dispose()`.
