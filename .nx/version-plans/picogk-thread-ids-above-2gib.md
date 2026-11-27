---
picogk: patch
---

The threaded browser PicoGK kernel no longer crashes when a build starts a thread after its heap passes 2 GiB. Mono compared a new thread's id as a signed number on one side and an unsigned one on the other, so registering any thread created above 2 GiB failed with `expected monoThreadInfo to be set already when registering` and killed the worker; the staged runtime now compares both as unsigned.
