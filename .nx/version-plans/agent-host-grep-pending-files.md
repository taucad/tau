---
agent-host: patch
---

The empty-result safeguard no longer counts a grep as empty when the grep names `pendingFiles`. Those are files it could not search because their large object is not on the device yet.
