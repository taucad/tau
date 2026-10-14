---
host: patch
---

A daemon with a stored device credential is now paired before its agent channel opens. A Tau run sent the moment the channel is ready is admitted, instead of being refused `HOST_NOT_PAIRED` with copy that asks an already-paired host to pair. A host with no stored credential is unchanged: its agent channel opens first, and pairing follows.
