---
filesystem: patch
---

`NodeFsProvider.watch` names the platform's native `@parcel/watcher` backend (inotify, FSEvents, Windows) instead of letting it choose. Choosing probed for watchman through `popen` and left that pipe open without close-on-exec, so every process started afterwards, a sandboxed shell among them, inherited it.
