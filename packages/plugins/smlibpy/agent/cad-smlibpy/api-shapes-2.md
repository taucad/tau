# smlibpy — shapes (2)

1 top-level symbols. Signatures are verbatim python.

# Category: shapes
# A shape backed by one kernel Brep
# smlibpy.shapes._Body (class)
class _Body(Shape)

  # smlibpy.shapes._Body.__init__ (constructor)
  _Body() -> None

  # The same body with a name (used by exporters and the viewer)
  # smlibpy.shapes._Body.named (method)
  named(name: str) -> Any

  # The same body with a display color (``"steelblue"``, ``"#4682b4"`` or ``(r, g, b)``)
  # smlibpy.shapes._Body.colored (method)
  colored(color: str | Sequence[float]) -> Any

  # All faces of this shape
  # smlibpy.shapes._Body.faces (method)
  faces() -> ShapeList[Face]

  # All edges
  # Remarks: are left out unless ``seams`` is true.
  # smlibpy.shapes._Body.edges (method)
  edges(seams: bool = False) -> ShapeList[Edge]

  # All vertices of this shape
  # smlibpy.shapes._Body.vertices (method)
  vertices() -> ShapeList[Vertex]

  # All wires (closed edge loops of faces, or the shape itself if it is a wire)
  # smlibpy.shapes._Body.wires (method)
  wires() -> ShapeList[Wire]

  # Tight axis-aligned bounding box
  # smlibpy.shapes._Body.bbox (method)
  bbox() -> BoundBox

  # Minimum distance to a point or to another body
  # Remarks: For a point inside a part, and for a body nested in another, it is the distance to the surface (the wall clearance). Bodies that touch or overlap are 0 apart.
  # smlibpy.shapes._Body.distance_to (method)
  distance_to(other: VectorLike | Shape) -> float

  # smlibpy.shapes._Body.closest_point (method)
  closest_point(point: VectorLike) -> Vector

  # Where a ray meets this body's faces, nearest first
  # Remarks: distance from the start, the face, its outward normal there). The ray starts at ``origin`` and runs along ``direction`` (an axis or a vector); an axis alone is a ray from its origin along its direction. Points behind the start are not hits. A ray through an edge or a vertex hits once, a ray along a face where it enters the face. ``hits[0]`` is what the ray sees first; ``len(hits)`` is odd from inside a closed part.
  # smlibpy.shapes._Body.raycast (method)
  raycast(origin: VectorLike | Axis, direction: VectorLike | Axis | None = None) -> list[Hit]

  # The curves where this body's surface meets another body's surface, each one once
  # smlibpy.shapes._Body.intersection_curves (method)
  intersection_curves(other: _Body) -> ShapeList[Edge]

  # Silhouette curves on the body as seen along ``direction`` (an axis or a vector)
  # smlibpy.shapes._Body.silhouette (method)
  silhouette(direction: Axis | VectorLike = (0, 0, 1)) -> ShapeList[Edge]

  # Project a curve onto the body along ``direction`` (an axis or a vector)
  # Remarks: curves on its faces.
  # smlibpy.shapes._Body.project (method)
  project(curve: Edge | Wire, direction: Axis | VectorLike = (0, 0, -1)) -> ShapeList[Edge]

  # The body's edges projected onto a plane (a 2D drawing view)
  # smlibpy.shapes._Body.outline (method)
  outline(plane: Plane = Plane.XY) -> ShapeList[Edge]

  # A copy whose faces and edges are all NURBS (analytic types converted)
  # smlibpy.shapes._Body.to_nurbs (method)
  to_nurbs() -> Any

  # Repair gaps, tolerances and topology (mostly needed for imported data)
  # smlibpy.shapes._Body.heal (method)
  heal() -> Any

  # Counts and measures in one dictionary
  # smlibpy.shapes._Body.info (method)
  info() -> dict[str, Any]
