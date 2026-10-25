---
filesystem: minor
---

Add optional `hashFiles(paths)` to `FileSystemProvider`. It returns each path's lowercase hexadecimal SHA-256, or `'missing'` when the path is absent, computed where the bytes live. `NodeFsProvider` streams each file through SHA-256 in bounded chunks. The node provider protocol moves to version 8 and carries a `hashFiles` request, so `NodeFsProviderClient` gets digests in one round trip with no bodies. Rooted views pass the call to their mount's provider in one call. Composed views send project files to the base in one call, digest overlay entries themselves, and refuse hidden paths the same way `readFile` does. A provider without `hashFiles` leaves the views without it, so callers keep reading bodies.
