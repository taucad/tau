---
filesystem: minor
---

`@taucad/filesystem` exports `watchEventsOfChangeSetFor(set, request)`, which reads the per-path events one watch would hear off a change set of the whole root. A client that holds one event channel per connection can then serve all its watches from that channel instead of registering each with the authority. It admits entries the way `WatchRegistry` does, by paths, recursion and globs. A directory created, deleted or moved above a watched path, or a reset over one, becomes a reset. A watch never hears less than the authority would have scoped for it, and in rare cases hears a reset it would not have heard on its own.
