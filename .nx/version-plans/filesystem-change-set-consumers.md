---
filesystem: minor
---

`@taucad/filesystem` lets every consumer of a watch take the change-set form (charter D6). A composed view forwards `watchChangeSets`, masked like its per-path `watch` (a move with one hidden edge arrives as the other edge's creation or deletion). `watchByChangeSets(source, request, handler)` serves a per-path watch handler from a source's change-set form, one registration and one delivery per committed changeset, falling back to `watchReady` when the source answers `ENOTSUP`; `watchEventsOfChangeSet` spells one change set as its watch events. The worker timing counters gain `watch.pathEvents` and `watch.changeSets`.
