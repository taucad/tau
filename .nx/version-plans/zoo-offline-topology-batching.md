---
zoo: patch
---

The offline engine's topology queries stop comparing sub-shapes one by one. The edge nearest a point is one `BRepExtrema_DistShapeShape` against a compound of the shape's edges, with the same first-in-order tie rule; the faces of an edge come from one `TopExp.MapShapesAndUniqueAncestors` pass; edges between faces test membership in an indexed map per face; and a face or edge id is one lookup in an indexed map of its solid's id table, rebuilt only when the table changes. The queries also free the wrappers they create. Query results are unchanged.
