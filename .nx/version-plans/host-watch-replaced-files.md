---
host: patch
---

A native host now sees every write to a file that was replaced by an atomic write. Its revision watcher used Node's recursive `fs.watch`, which on Linux before Node 24.22 (Electron 43's 24.21 among them) kept watching the replaced file's old inode, so an editor's in-place save after an agent's write never made the checkout dirty. The watcher is now the filesystem provider's native watch (`@parcel/watcher`), and the store answers its first question only once that watch is admitted, so a write is either in the open comparison or reported as a change.
