---
revisions: minor
host: minor
---

A checkout over the host's large-object store now lands each large object by cloning the stored object rather than writing bytes read into memory (W11.3). `readTree` takes `largeObjects: 'stored'`, which fetches what the store lacks and answers each large object as its pointer once the store holds it whole; the native port checks the stored size. `materializeTree` takes a `largeObjects` side map from path to `{ oid, size }`, written as `{ largeObject, size }` sources and verified by the receipt's hashed read-back, and refused on a checkout that does not declare `largeObjectSources`. The large-object fill uses both when the checkout declares the capability. On a disk host each root's store is resolved by the filesystem authority: the live root's own repository store, and an admitted checkout's through `ProjectFileSystem.admit(root, { largeObjectStore })`. The filesystem bridge refuses a large-object source with `EINVAL` before it crosses.
