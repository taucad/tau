---
filesystem: minor
runtime: patch
agent-host: patch
---

`watchByChangeSets` now serves a watch from the connection's one event channel (`events()`) when the source offers it, and reads that watch's own events off each change set of the root. The authority then delivers each changeset to a connection once, however many watches the connection holds. When the connection answers `ENOTSUP`, the watch steps down to the change-set form, then to the per-path form, and later watches on that source skip the channel. Any other refusal surfaces through `ready`. `@taucad/filesystem` exports the `ChangeSetChannelEvent` type for the channel's frames.

The kernel dependency watch behind `createWorkerFileSystemProxy` in `@taucad/runtime` and the log observer from `createRootedLogObserver` in `@taucad/agent-host` both go through `watchByChangeSets`, so they now use the event channel too. Their APIs do not change.
