---
host: patch
---

A relayed session whose runtime child crashes now reports `CHILD_EXIT` as soon as the child exits, instead of `RELAY_CLOSED` when removing the child's temp directory takes longer than the attribution grace.
