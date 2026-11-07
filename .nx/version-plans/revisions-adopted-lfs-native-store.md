---
revisions: minor
---

A repository the native Git port adopts may now keep large files on git LFS. Its own `.gitattributes` files decide which paths are stored as pointers, the way `git add` with git-lfs would, and Tau never writes its generated attributes block into them or tracks other paths by size or family; the port no longer refuses such a repository. The engine descriptor names this with `largeObjectRule: 'repository'`, and `cleanLargeObjects` takes the rule as a second argument. The native port also answers `readLargeObject` and `storeLargeObject` from the repository's own LFS store, and declares `keepsLargeObjectFiles`, so large-object adoption leaves a disk checkout's files whole.
