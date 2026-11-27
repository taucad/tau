---
filesystem: patch
agent-host: patch
host: patch
---

`watchTree` moves from `@taucad/host` to `@taucad/filesystem/backend/node`, so every recursive watch of a project tree on Node survives a watched directory being replaced by a file. Node's own recursive watcher on Linux throws an uncaught `ENOTDIR` in that case. The agent-host Node chat store's watch of the workspace now goes through `watchTree` too, so a Linux host no longer crashes there either. The chat store also matches `/` paths on every platform, and re-arms a fresh watch after one fails. `watchTree` takes `{ persistent }`, which keeps the process alive as `fs.watch` does by default.
