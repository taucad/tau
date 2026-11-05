---
filesystem: minor
revisions: minor
---

`@taucad/filesystem` gives a rooted view a `privateStore`: `.git` and everything under it, read and written straight on the captured provider, outside the mutation pipeline. It takes no resource-queue or cross-tab claim and publishes no change event, index entry or content metadata. A path outside `.git` is refused with a `TypeError` before any provider I/O. `readRange` reads one byte range through the provider's ranged stream when the provider has one. `storePrivateObject` is removed; its writer moved into `@taucad/revisions`.

`@taucad/revisions` reads and writes Git objects through its own object store. Pack indexes are held in memory, a packed object costs one index lookup and one range read plus one read for each delta base it resolves, and bases stay in a byte-bounded cache. Objects are written loose and hashed with WebCrypto SHA-1. When a store's loose objects or packs pass their bound, a repack folds them into one pack under an exclusive fence, and replaced files stay readable for 15 minutes so that a reader in another tab can finish. A fetched pack is indexed on the compute worker, which also inflates, deflates and hashes off the main thread when it is connected over a port. `isomorphic-git` keeps refs, config, the wire protocol and pack indexing. The adapter drops its `objectCache` options and takes `compute` and `onObjectStore`.
