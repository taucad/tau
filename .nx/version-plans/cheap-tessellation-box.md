---
opencascade: patch
replicad: patch
---

A tessellation preset sizes its linear tolerance from OCCT's cheap bounding box (`BRepBndLib.Add`) instead of the tight one (`AddOptimal`). On the planetary gear the measurement takes about 25–35 ms instead of 0.55–0.6 s. The cheap box is never smaller than the tight one and is at most about 5 % larger on curved and B-spline models, so a preset mesh can be up to that much coarser. Explicit tolerances are unchanged.
