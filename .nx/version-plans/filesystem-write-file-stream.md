---
filesystem: minor
---

Add `writeFileStream(path, stream)` to `FileSystemProvider` and the rooted `privateStore`: one file written from a stream of its bytes, which lands whole or not at all (I1). OPFS stages the chunks through a sync access handle under `.tau-staging/<owner>` and moves the file into place, a picked folder writes the writable stream's swap file and replaces the target on close, and `NodeFsProvider` writes its temp sibling, syncs and renames it and verifies the published file by its SHA-256 read back in chunks; each holds one chunk at a time. A stream that errors leaves the path as it was and nothing staged. Memory, IndexedDB and the Node bridge client gather the stream and write once.
