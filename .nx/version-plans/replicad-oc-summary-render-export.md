---
replicad: patch
---

With `ocTracing: 'summary'`, render and export flush their own `oc.summary`, as OpenCascade does. Their OpenCASCADE calls were counted in the next evaluation's summary, or lost at teardown.
