---
filesystem: minor
---

Pending entries: fixes from the W4 re-review.

- A read of a pending entry is bounded by a stall, not a deadline (I10). `PendingObjectSource` now takes a third argument, `progress`, which the host calls whenever bytes of the object arrive. Each call restarts the 60-second bound, so a slow transfer that keeps moving is never refused. When the bound runs out, the read refuses with `PENDING` and aborts only its own signal. A transfer that other readers share keeps running. The rooted view's `readFileStream` passes the caller's signal through. The timer and listener are cleared when the read settles.
- `pendingPaths(paths)` on the rooted view and the composed view says which files the root's index holds as pending entries. It answers from the index alone, so a consumer that only searches never starts a download.
- A pointer read no longer marks a path pending when a write landed after the read began. `markPending` takes the size and generation the read observed, and `ProjectIndexes.generationAt` gives that generation.
- `expectEntries` is now async and opens the root's index when it is cold, so a cold open's tree write is known as it lands.
- A placeholder in an expectation stays arriving until its object's bytes land. A pointer is not readable bytes.
- `duplicate` to a name the project does not track never writes pointer text. When the object is on the device, the copy is the object. Otherwise the copy is refused with `PENDING`. `PendingObjectRequest` gains `pointer` and `localOnly` so that the host can answer that question from the device alone.
- `WorkspaceFileService.readFileStream` reads a pending entry through to its object, as `readFile` does.
