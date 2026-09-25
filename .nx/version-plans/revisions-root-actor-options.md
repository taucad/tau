---
revisions: minor
host: minor
---

Revision composition roots take XState's actor options. **Breaking:** `clock` on `createRevisionActors` and `createProjectRevisionsActor` is now an XState `Clock`, not a `() => number`: the tree's timers run on it, and its `now()` stamps revisions, falling back to `Date.now`. Pass a clock object, such as a `SimulatedClock` set to the time, where a function was passed. `createProjectRevisionsActor` also forwards `inspect` and `onRejectedEvent` to the tree, and `host`'s `createProjectRevisions` and `openProjectRevisions` accept and forward all three.
