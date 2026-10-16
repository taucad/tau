---
middleware: minor
---

Stop voxel display simplification at the triangle budget instead of simplifying as far as half a voxel allows.

`displaySimplification` now collapses edges only until the delivered mesh fits `maxTriangles` (default 2,000,000), so an over-budget voxel preview arrives sooner. Half a voxel stays the cap: a collapse that would pass it is never made, and when the cap stops a mesh above the budget the `DISPLAY_SIMPLIFIED` warning still says it is over. When several meshes or primitives are eligible, the budget is shared among them in proportion to the triangles each draws. The middleware's version is now `1.1.0`, so previews cached by the earlier version are rebuilt. Exports and GeoSpec subjects still never pass through it.
