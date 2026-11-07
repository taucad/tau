---
filesystem: patch
---

A project index now keeps its pending entries across a reload. The snapshot stores them as a `pending` map beside its rows, and a snapshot from an older client without the map still loads. Without this, `pendingPaths` named no pending file after a reload until each file was read again. The index reads no file to restore them (I3).
