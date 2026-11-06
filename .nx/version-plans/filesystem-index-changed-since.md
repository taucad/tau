---
filesystem: minor
---

Rooted and composed views now offer `changedSince(since, options?)`, which answers what a root's Project Index changed after a generation. The result holds the index's current generation, which the caller passes as `since` next time, and every entry the index still holds whose generation is newer. A composed view applies its mask before the descent, as `statTree` does, and the call honours an abort signal. `ProjectIndex.changedSince` takes the same optional `admits` mask. A removal leaves no entry. The `IndexChanges` type is exported.
