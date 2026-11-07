---
filesystem: minor
---

`@taucad/filesystem` exports the change-set contract (`ChangeSet`, `ChangeSetEntry`, `ChangeSetOp`, `ChangeSetReset`, `ChangeSetResetReason`, `ChangeSetSegment`, `ChangeSetWatchRequest`, `toChangeSet`, `touchedDirectoriesOf`, `ChangeSetCoalescer`, `mergeChangeSets`, `nextFrame`, `FrameScheduler`). A rooted view offers `watchChangeSets(request, handler)`: one change set per committed changeset that reaches the request, spelled in the root's namespace, without the facts its own port originated, and a reset of `''` when its mount goes. `WatchRegistry.watchChangeSets` takes `skipOrigin` to leave out one port's own facts.
