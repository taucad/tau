---
revisions: minor
---

The native Git port fills large objects lazily. A fetch moves refs only and no longer runs `git lfs fetch` over every fetched tip, so tracking refs are published before large objects arrive. A `readTree` that needs a large object the store lacks fetches that one commit's objects then, from each remote that carries large objects in turn, under the transfer deadline and the read's `signal`; it fails `MISSING_LARGE_OBJECT` only when every remote reports the object itself not found, and otherwise with the refusal of a remote that might hold it. Concurrent reads of one commit share one fill and its outcome. A `local` read fetches nothing and answers a missing object with its pointer, and the port now answers `fetchLargeObjects`, fetching an object no read names by its own oid. A `paths` read reads only those blobs. A push to another remote first brings the large objects it carries from the remotes that have them.
