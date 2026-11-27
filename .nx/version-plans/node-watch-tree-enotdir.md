---
filesystem: patch
agent-host: patch
host: patch
---

A Linux host no longer crashes when a path in the workspace changes from a directory to a file. Node's recursive `fs.watch` on Linux throws an uncaught `ENOTDIR` from its own event handler when a watched directory is replaced by a file. The revisions watcher in `@taucad/host` and the chat store's watcher in `@taucad/agent-host/node` now go through `watchTree` from `@taucad/filesystem/backend/node`. On Linux it watches each directory itself and reports the change instead of throwing. On macOS and Windows it uses Node's native recursive watch.
