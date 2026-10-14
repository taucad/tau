---
revisions: patch
---

Keep a project's backup when _Change backup_ names a remote that refuses. `remote.machine` now asks a replacing remote for its advertisement (the new `probe` actor) before `writeRemote` replaces the recorded one, and a refusal returns to the recorded remote with `RemoteFacet.refusedReplacement`, numbered by `attempt`. `RevisionPort.listRemoteRefs` also accepts an unrecorded `{ name, url }`, credited and classified as that remote would be once recorded, on both the isomorphic-git and native legs.
