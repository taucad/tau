---
host: patch
---

`close()` on a Tau Host daemon now resolves only once every runtime child is gone. Previously, a child that was still starting when shutdown began closed itself afterwards, so it could still be running when `close()` returned.
