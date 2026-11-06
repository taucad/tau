---
agent-host: patch
---

`@taucad/agent-host` no longer rolls back a fenced event-log append that failed with an unknown outcome. Before, a bridge timeout after the authority had committed the append made the rollback truncate the log, deleting this writer's line and any line another writer appended after it. Now the log handle is poisoned (`LOG_POISONED`), nothing is truncated, and reopening the log reads what it actually holds. An `EventLogStorage` port reports that it fences through `fencesAppends`.
