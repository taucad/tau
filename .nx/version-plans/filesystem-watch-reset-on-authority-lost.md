---
filesystem: patch
---

`watchByChangeSets` served from a connection's event channel now hands each watch a `reset` event when the channel announces `authority-lost`, so a tree re-reads instead of going stale. `compute-restarted` still has no watch consumer.
