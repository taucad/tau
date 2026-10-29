# smlibpy — shapes (4)

2 top-level symbols. Signatures are verbatim python.

# Category: shapes
# A chain of edges, open or closed
# smlibpy.shapes.Wire (class)
class Wire(Shape)

  # smlibpy.shapes.Wire.__init__ (constructor)
  Wire(edges: Iterable[Edge | Wire] | Edge | Wire, *, sort: bool = True)

  # The wire's edges, in order
  # smlibpy.shapes.Wire.edges (method)
  edges() -> ShapeList[Edge]

  # The vertices of the wire's edges, each once
  # smlibpy.shapes.Wire.vertices (method)
  vertices() -> ShapeList[Vertex]

  # This wire, in a list
  # smlibpy.shapes.Wire.wires (method)
  wires() -> ShapeList[Wire]

  # True if the wire ends where it starts
  is_closed: bool

  # The point where the wire's first edge starts
  start: Vector

  # The point where the wire's last edge ends
  end: Vector

  # The sum of the edges' lengths
  length: float

  # Length-weighted average of the edge midpoints
  # smlibpy.shapes.Wire.center (method)
  center() -> Vector

  # The box along the axes around the wire
  # smlibpy.shapes.Wire.bbox (method)
  bbox() -> BoundBox

  # Point at fraction ``t`` of the total length
  # smlibpy.shapes.Wire.point_at (method)
  point_at(t: float = 0.5) -> Vector

  # The direction of the wire (length 1) at ``t``, a fraction of its length from its start
  # smlibpy.shapes.Wire.tangent_at (method)
  tangent_at(t: float = 0.5) -> Vector

  # Distance to a point, or to a body (see :meth:`Part.distance_to`)
  # smlibpy.shapes.Wire.distance_to (method)
  distance_to(point: VectorLike | _Body) -> float

  # The wire cut in two at ``at``, a fraction of its length or a point on it
  # Remarks: before and the part after. At a vertex the edges stay as they are; elsewhere the edge there is split (:meth:`Edge.split`).
  # smlibpy.shapes.Wire.split (method)
  split(at: float | VectorLike | Vertex) -> tuple[Wire, Wire]

  # The part of the wire from ``start`` to ``end``, each a fraction of its length or a
  # Remarks: point on it; ``start`` must come before ``end`` along the wire.
  # smlibpy.shapes.Wire.trim (method)
  trim(start: float | VectorLike | Vertex, end: float | VectorLike | Vertex) -> Wire

  # Points where this wire meets ``other`` (see :meth:`Edge.intersections`), in order along
  # Remarks: the wire; a point where two of its edges meet counts once.
  # smlibpy.shapes.Wire.intersections (method)
  intersections(other: Shape | Iterable[Shape], *, tolerance: float | None = None) -> list[Vector]

  # The wire as one edge
  # Remarks: that edge). The edges must meet end to end (within 1e-6); where they meet at a corner, the edge has a corner there too. One edge makes a single sweep or loft rail, a single SPLINE in DXF and a single curve for :func:`~smlibpy.make_compatible`. :: rail = FilletPolyline((0, 0), (30, 0), (30, 20), radius=5).to_edge()
  # smlibpy.shapes.Wire.to_edge (method)
  to_edge() -> Edge

  # The wire moved ``distance`` sideways in its plane, as a parallel curve
  # Remarks: its left for a positive distance (seen from the side the plane's normal points to), to its right for a negative one; a closed wire outward for a positive distance, inward for a negative one (as :meth:`Sketch.offset` grows and shrinks). Lines stay lines and arcs stay arcs, exactly; splines and ellipses are offset within 1e-6 of the wire's size (:meth:`Edge.offset`). ``corners`` shapes the corners the offset pulls apart: ``"round"`` (arcs of radius ``|distance|``), ``"sharp"`` (the sides extended until they meet) or ``"chamfer"`` (a straight cut across); at the corners it pushes together, the sides are cut where they cross. Where the offset would fold over or run into itself (an edge bends more tightly than the distance, an edge vanishes, parts of the wire lie closer than the distance), :class:`ModelingError` says where; a region's offset that merges and drops parts is :meth:`Sketch.offset`. ``plane``: the plane the wire lies in, whose normal tells left from right (see :meth:`Edge.offset` for the default). :: path = Polyline((0, 0), (40, 0), (40, 30)) wall = path.offset(2, corners="sharp") # 2 to the left, a sharp outer corner toolpath = outline.offset(-3) # 3 inside a closed outline
  # smlibpy.shapes.Wire.offset (method)
  offset(distance: float, *, corners: Literal['round', 'sharp', 'chamfer'] = 'round', plane: Plane | None = None) -> Wire

  # The wire as lines and circular arcs within ``tolerance`` (see :meth:`Edge.to_arcs`)
  # smlibpy.shapes.Wire.to_arcs (method)
  to_arcs(tolerance: float = 0.01) -> Wire

  # The smallest radius of curvature of the wire's edges
  # Remarks: not count (a corner has no radius; see :meth:`fillet`). Where it is: :meth:`min_radius_at`.
  # smlibpy.shapes.Wire.min_radius (method)
  min_radius() -> float

  # Where the wire bends most tightly (:meth:`min_radius`)
  # Remarks: :meth:`point_at` takes it.
  # smlibpy.shapes.Wire.min_radius_at (method)
  min_radius_at() -> float

  # The point of the wire nearest to ``point``
  # smlibpy.shapes.Wire.closest_point (method)
  closest_point(point: VectorLike) -> Vector

  # How the edges of the wire meet at its joints (and where a closed wire closes)
  # Remarks: (:class:`Continuity`): ``"G2"`` where their curvature vectors agree as well, ``"G1"`` where they meet tangentially (within ``angle_tolerance`` degrees), ``"G0"`` at a corner, ``None`` where an edge does not start where the one before ends (within 1e-6). ``curvature_tolerance`` is relative to the larger curvature (and at least ``1e-3 / length``). ``ValueError`` for a wire of one open edge, which has no joint.
  # smlibpy.shapes.Wire.continuity (method)
  continuity(*, angle_tolerance: float = 0.5, curvature_tolerance: float = 0.01) -> Continuity

  # This wire closed with a straight line from its end to its start
  # smlibpy.shapes.Wire.close (method)
  close() -> Wire

  # The wire run the other way
  # smlibpy.shapes.Wire.reversed (method)
  reversed() -> Wire

  # smlibpy.shapes.Wire.__add__ (method)
  __add__(other: Edge | Wire) -> Wire  # Wire + other

  # The plane of a planar wire (normal by the right-hand rule along the wire)
  # smlibpy.shapes.Wire.plane (method)
  plane() -> Plane

  # Round corners with tangent arcs of ``radius``
  # Remarks: ``vertices`` (points or vertices). A planar wire's corners are rounded in its plane, as :meth:`Sketch.fillet` does: between lines and arcs exactly, next to splines and ellipses with the arc whose center lies at ``radius`` from both curves (the curves are cut where it touches them). A wire that is not planar has its corners between lines rounded. A corner a wire that is not planar has next to another curve, a smooth corner that is named and a point that is not a corner raise :class:`ModelingError`; a radius that does not fit raises ``ValueError``. Open wires keep their ends.
  # smlibpy.shapes.Wire.fillet (method)
  fillet(radius: float, vertices: VectorLike | Vertex | Iterable[VectorLike | Vertex] | None = None) -> Wire

  # The planar region bounded by this closed wire
  # smlibpy.shapes.Wire.to_sketch (method)
  to_sketch() -> Sketch

# Category: shapes
# A shape backed by one kernel Brep
# smlibpy.shapes._Body (class)
class _Body(Shape)

  # smlibpy.shapes._Body.__init__ (constructor)
  _Body() -> None

  # The same body with a name (used by exporters and the viewer)
  # Remarks: With ``faces`` (faces of this body, or of an earlier version of it: as :meth:`Part.fillet` takes edges), the body keeps its own name and those faces get this one (:attr:`Face.name`, ``None`` takes it off): it stays with the faces and their pieces through later operations, and STEP files write it on the face. ``part.faces().filter_by(lambda f: f.name == "seal")`` finds them again.
  # smlibpy.shapes._Body.named (method)
  named(name: str | None, *, faces: Any = None) -> Any

  # The same body with a display color (``"steelblue"``, ``"#4682b4"`` or ``(r, g, b)``)
  # Remarks: With ``faces`` (faces of this body, or of an earlier version of it), the body keeps its own color and those faces get this one (:attr:`Face.color`; ``None`` takes it off): it stays with the faces through later operations (the walls of a hole keep the color of the tool's faces), and STEP, glTF and USD files and pictures show it on them:: tool = Cylinder(5, 20) plate = Box(60, 40, 8) - tool.colored("red", faces=tool.faces()) plate = plate.colored("steelblue", faces=plate.faces().top())
  # smlibpy.shapes._Body.colored (method)
  colored(color: str | Sequence[float] | None, *, faces: Any = None) -> Any

  # The body's faces
  # smlibpy.shapes._Body.faces (method)
  faces() -> ShapeList[Face]

  # All edges
  # Remarks: are left out unless ``seams`` is true.
  # smlibpy.shapes._Body.edges (method)
  edges(*, seams: bool = False) -> ShapeList[Edge]

  # The body's vertices
  # smlibpy.shapes._Body.vertices (method)
  vertices() -> ShapeList[Vertex]

  # The boundaries of all the body's faces
  # smlibpy.shapes._Body.wires (method)
  wires() -> ShapeList[Wire]

  # The box along the axes around the body
  # smlibpy.shapes._Body.bbox (method)
  bbox() -> BoundBox

  # Minimum distance to a point, another body, a face, an edge or a wire
  # Remarks: For a point inside a part, and for a body nested in another, it is the distance to the surface (the wall clearance). Bodies that touch or overlap are 0 apart, and so are a body and a curve that touches or crosses its surface.
  # smlibpy.shapes._Body.distance_to (method)
  distance_to(other: VectorLike | Shape) -> float

  # The nearest points of this body and another body, a face, an edge or a wire
  # Remarks: (:class:`ClosestPoints`): the point on this body, the point on the other, their distance and the faces they lie on. The points are exact surface points (and curve points), as for :meth:`distance_to`; where the shapes touch or overlap, the distance is 0 and the points are one place where they meet.
  # smlibpy.shapes._Body.closest_points (method)
  closest_points(other: _Body | Face | Edge | Wire) -> ClosestPoints

  # The point of the body's surface nearest to a point (also from inside a part)
  # smlibpy.shapes._Body.closest_point (method)
  closest_point(point: VectorLike) -> Vector

  # The first hit of each of many rays, one per ray (``Hit`` or ``None``), not
  # Remarks: :meth:`raycast` many times (which gives every hit of a ray): for each origin, the ``Hit`` that :meth:`raycast` gives first (the exact point on the face, the distance, the face, its outward normal), ``None`` where the ray misses. ``origins`` is an ``(n, 3)`` array or a sequence of points; ``directions`` one direction (a vector or an axis) for all of them, or one each. The rays are traced through a mesh of the body (made once per body, at 1e-4 of its size) by the kernel's ray tracer, and each hit is moved onto the exact face the mesh says the ray meets first; where that face is missed there, the ray is cast exactly (:meth:`raycast`), and so is a ray that passes within twice the mesh's tolerance (1e-4 of its size) of a triangle it does not meet (it can graze a curved face the mesh lies inside of). Give all the rays in one call: the tracer is built once per call (0.2 s for a mesh of 20 000 triangles), then a ray takes 0.02 to 0.05 ms (a plate with 144 holes: 0.05 ms, where :meth:`raycast` takes 1 ms).
  # smlibpy.shapes._Body.raycast_many (method)
  raycast_many(origins: Any, directions: Any) -> list[Hit | None]

  # Where a ray meets this body's faces, nearest first
  # Remarks: distance from the start, the face, its outward normal there). The ray starts at ``origin`` and runs along ``direction`` (an axis or a vector); an axis alone is a ray from its origin along its direction. Points behind the start are not hits. A ray through an edge or a vertex hits once, a ray along a face where it enters the face. ``hits[0]`` is what the ray sees first; ``len(hits)`` is odd from inside a closed part, except where the ray grazes a face (to test a point, use :meth:`Part.contains`).
  # smlibpy.shapes._Body.raycast (method)
  raycast(origin: VectorLike | Axis, direction: VectorLike | Axis | None = None) -> list[Hit]

  # Free what the kernel keeps from earlier queries of this body
  # Remarks: :meth:`bbox`, :meth:`distance_to`, :meth:`closest_point`, :meth:`raycast` and ``mesh()`` leave on its curves, its surfaces and the body itself (evaluation grids, trimmed-surface data, spatial trees). The body does not change, nor do its faces and edges; a later query builds what it needs again. The kernel keeps these caches as long as the body lives, and they can outweigh the body: on a holed, filleted box of about 150 KB, ``bbox()`` left 42 KB, ``mesh()`` 770 KB and ``distance_to()`` 820 KB. A query that finds them is about 1.2 times as fast (11 times for ``closest_point()`` after ``distance_to()``); Booleans gain nothing from them. Compact bodies that are kept but no longer queried, such as the copies of a large pattern after they were measured or exported.
  # smlibpy.shapes._Body.compact (method)
  compact() -> None

  # The curves where this body's surface meets another body's surface, each one once
  # Remarks: ``other`` is a Part, Shell or Sketch, a face (the face itself, bounded by its edges), or a :class:`Plane` (unbounded: where it cuts this body's faces, as :meth:`Part.section` cuts a part). Bodies that do not meet, apart or one inside the other, give an empty list.
  # smlibpy.shapes._Body.intersection_curves (method)
  intersection_curves(other: _Body | Face | Plane) -> ShapeList[Edge]

  # The contour of the body seen along ``direction`` (an axis or a vector, from the body
  # Remarks: towards the viewer): the curves on its faces where the surface turns away from the viewer (``n . d = 0``), and the edges between faces that face the viewer and faces that face away. All of them, seen or not, as standalone 3D edges; arcs of one circle come joined (a sphere's rim is one circle). Faces seen edge-on go with the faces behind them, so their near edges are the contour (a box seen from +Z: its 4 top edges). A sheet's free edges are not part of it. The curves are exact for spheres, cylinders and tori around the direction, traced (within 1e-6 of the body's size) otherwise.
  # smlibpy.shapes._Body.silhouette (method)
  silhouette(direction: Axis | VectorLike = (0, 0, 1)) -> ShapeList[Edge]

  # Project a curve onto the body along ``direction`` (an axis or a vector)
  # Remarks: curves on its faces, fitted within 1e-7 of the size of the body and the curve. Every face the projection meets gets its pieces: the near side and the far side of the body, and faces seen edge-on (pieces along the direction). ``nearest=True`` keeps what the projection reaches first: the parts seen from the curve along the direction, cut where another part of the body hides them (the default of :meth:`imprint` with a direction, which marks the faces an outline lands on). :: path = part.project(Spline((0, -20, 50), (10, 0, 50), (0, 20, 50)), (0, 0, -1), nearest=True)
  # smlibpy.shapes._Body.project (method)
  project(curve: Edge | Wire, direction: Axis | VectorLike = (0, 0, -1), *, nearest: bool = False) -> ShapeList[Edge]

  # The body's edges and contours projected onto a plane (a 2D drawing view), seen from
  # Remarks: the side the plane's normal points to: the visible lines. With ``hidden=True``, ``(visible, hidden)``: the lines behind the body too, for dashed hidden lines. With ``tangent_edges=True`` the edges between faces that meet tangentially (the tangent lines of fillets) are drawn too. Either way each line comes once: hidden pieces under visible lines are cut away, seams of closed faces and edges seen end-on are left out. See also :func:`drawing_views`.
  # smlibpy.shapes._Body.outline (method)
  outline(plane: Plane = Plane.XY, *, hidden: bool = False, tangent_edges: bool = False) -> ShapeList[Edge] | tuple[ShapeList[Edge], ShapeList[Edge]]

  # A copy whose faces and edges are all NURBS (analytic types converted)
  # smlibpy.shapes._Body.to_nurbs (method)
  to_nurbs() -> Any

  # Repair gaps, tolerances and topology (mostly needed for imported data)
  # Remarks: whose faces close around a volume once healed comes back as a :class:`Part`.
  # smlibpy.shapes._Body.heal (method)
  heal() -> Any

  # What the kernel's own validity checks find wrong with the body
  # Remarks: :class:`Problem` with the face, edge or vertex it is about (or the body), a message, and the value and tolerance it measured. An empty list: nothing found. ``level`` 0 checks the structure (how faces, loops, edges and vertices connect, the pointers between them); 1 also the geometry; 2 (the default) everything, the slow tests too, among them the gaps between vertices and faces against their tolerances. That takes about 0.1 s on a plate with 24 holes and on an imported part of 170 faces. The tests look at each face, edge and vertex and its neighbours (SmBrep::AssertValid): they do not see a body that runs through itself. Use them where :meth:`is_valid` cannot tell what is wrong: after importing, stitching or healing, or where an operation on a part fails that ``is_valid()`` accepts.
  # smlibpy.shapes._Body.check (method)
  check(level: int = 2) -> list[Problem]

  # Counts and measures in one dictionary
  # Remarks: how the corners of its new walls came out: ``"corners"`` is ``"round"`` or ``"sharp"``.
  # smlibpy.shapes._Body.info (method)
  info() -> dict[str, Any]
