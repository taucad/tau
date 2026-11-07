---
revisions: minor
---

The native Git port mints incrementally. Its tree-id memo names every object a revision's tree needs, digesting only what changed since the last mint, and only the objects the store lacks are written: changed blobs through one blob-only `fast-import`, changed trees children first through one `mktree --batch`, with Git's ids checked against the memo's. A one-file save streams that file and the trees on its path to Git instead of the whole project. Objects the port has written or seen are trusted for at most an hour, well inside `git gc`'s expiry, and a fresh port checks presence from object headers alone. A large object the store already holds is not opened again.
