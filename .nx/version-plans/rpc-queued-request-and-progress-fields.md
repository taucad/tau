---
rpc: patch
---

A call whose liveness bound expires while its request still waits behind the hello is now dropped from the send queue instead of cancelled, so the server never runs it, and its rejection carries `requestSent: false`. A call still queued when the channel closes is rejected the same way. A progress report's undefined fields are now left out before it crosses, so a binary codec never turns them into `null`.
