---
agent-host: patch
---

`createAgentLauncher` takes `monotonicNow` and forwards it to every incarnation's host, as it already forwards `clock`. A launcher given a controlled clock can now time a live run's quiet time, publish cadence and a paused run's hold on that same clock, instead of on `performance.now()` while its heartbeat timers run on the controlled one.
