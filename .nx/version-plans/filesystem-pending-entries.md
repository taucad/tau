---
filesystem: minor
---

Pending entries. A pending entry is a checkout path whose bytes are a large object that is not on the device yet.

- The project index records a file whose bytes are a git-lfs pointer as pending (`ProjectIndex.markPending`, `pendingFor`, and `ProjectIndexes.markPending`, `pendingAt`). A write over the path ends it, and so does an observation that finds its size changed. A move carries it.
- The authority reads go through to the object instead of the pointer. This covers `readFile` (bytes and `utf8`), `readFileStream`, and through them `contents`, `archive` and grep. Each read asks the host's `PendingObjectSource` (`WorkspaceFileService.setPendingObjectSource`) by mount and mount-relative path, under a 60-second stall bound (`pendingStallMilliseconds`). When the object cannot be had in time, or no source is set, the read rejects with `PendingContentError` (code `PENDING`). It never answers pointer text. A source that answers `undefined` means the path is no placeholder, and the pointer is read as the text it is.
- `duplicate` copies the pointer, and the copy stays pending (copy-on-write). A write over a pending entry replaces it.
- `createRootedFileSystem(root, context, { placeholders: 'raw' })` is the view for the revision layer, which owns the pointers. It reads them as they are.
