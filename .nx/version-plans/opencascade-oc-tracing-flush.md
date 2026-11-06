---
opencascade: patch
---

With `ocTracing` on, the OpenCascade kernel flushes its `oc.summary` after each render and export as well as after `run-main`, so the OpenCASCADE calls of a render or export land in their own summary instead of the next evaluation's.
