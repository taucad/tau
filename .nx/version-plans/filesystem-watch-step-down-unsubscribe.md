---
filesystem: patch
---

`watchByChangeSets` now unsubscribes a registration the connection refused with `ENOTSUP` before it steps down to the next form. A refused event-channel or change-set registration no longer keeps a subscriber on its source.
