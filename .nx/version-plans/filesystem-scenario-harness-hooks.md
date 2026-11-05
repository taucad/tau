---
revisions: patch
filesystem: patch
---

`@taucad/revisions` exports `@taucad/revisions/apply-tree` (`createApplyTreeEffects`), so the filesystem scenario harness drives the production checkout apply. `@taucad/filesystem` counts each cross-tab lock set and its tokens in `workerTimings` (`locks.set`, `locks.token`), which the harness reads to gate one lock set per changeset.
