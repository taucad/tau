---
runtime: patch
---

Record an aborted export as `cancelled` instead of `failed`, report replies that arrive after their view or document closed as late, and stop counting a worker shutdown as a late reply.
