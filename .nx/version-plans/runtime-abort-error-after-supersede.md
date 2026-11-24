---
runtime: patch
---

A cooperative abort check now throws `RenderAbortedError` once the operation's signal is aborted, instead of the signal's bare reason. A superseded Replicad or OpenCascade build was usually unwound by that reason (a number), so its error took the full source-mapped formatting path; it now takes the cancellation path, about 7–20 ms sooner on the planetary gear stops. Results of builds that are not aborted are unchanged.
