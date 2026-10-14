---
host: patch
---

Closing a Tau Host runtime child now settles only after the child has exited and its private temp directory is removed, so `close()` on the daemon no longer returns while a child's cleanup is still running.
