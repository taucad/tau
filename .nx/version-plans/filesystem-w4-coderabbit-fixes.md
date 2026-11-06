---
filesystem: patch
---

Pending entries now survive a project index reload in two more cases.

- One malformed entry in a stored snapshot's `pending` map no longer drops the whole map. Each entry is checked on its own.
- A placeholder that a tree write recorded before the provider reported its mtime now keeps its pending object across a reload. A snapshot re-observes each such entry first, so it stores the provider's mtime rather than the write's clock. An mtime that a compare adopts also schedules a new snapshot.
- `pendingPaths` now finds a placeholder that the index was never told about, for example after a reload whose snapshot was lost or marked for rescan. It reads a pointer-sized file raw, without fetching its object, so the agent's write guard still refuses a write over it.
