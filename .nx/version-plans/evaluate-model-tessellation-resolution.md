---
mcp: minor
---

`evaluate_model` now returns the default view's effective tessellation resolution in its `tessellation` report, in Tau and over `tau mcp`: `requested` (the quality preset or `explicit`), the `linearTolerance` (mm) and `angularTolerance` (degrees) the mesh was produced at, and `downgraded`, the coarser steps taken to fit the triangle budget. The tool previously dropped these fields, so an agent saw the triangle count without the resolution that produced it.
