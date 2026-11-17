---
agent-host: patch
---

Time a live run's heartbeat, publish cadence, paused hold and placement asks on a monotonic clock (`monotonicNow`, `performance.now()` by default). A wall clock that steps back no longer pauses heartbeats long enough for another device to take the run over; the wall clock still stamps rows.
