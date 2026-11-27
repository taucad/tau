---
agent-host: patch
---

`pendingInterrupts` now answers behind every write already begun on the run's chat. A batch is written and then flushed, and the host folds it only once the flush returns, so a caller that had already read a resolution in the log could be told the resolved interrupt was still pending.
