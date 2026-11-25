---
host: patch
---

`tau serve` exits as soon as it has stopped. Closing a runtime child raced its exit against a 5 s grace timer that stayed pending after the child had exited, which held the daemon's process open for the rest of the grace: a stop that finished in under 100 ms took about 5 s to exit. The timer is now cancelled once the child exits.
