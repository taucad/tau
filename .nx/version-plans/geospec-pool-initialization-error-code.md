---
geospec: patch
---

The Node pool keeps a worker's initialization error code, so a caller of `run()` can tell a missing `geospec-engine` (`ERR_MODULE_NOT_FOUND`) from any other startup failure. The exit that follows an initialization error no longer replaces its reason.
