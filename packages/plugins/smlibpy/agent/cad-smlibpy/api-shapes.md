# smlibpy — shapes

10 top-level symbols. Signatures are verbatim python.

# Category: shapes
# A bounded curve
# Remarks: Edges come from bodies (``part.edges()``) or from curve constructors such as :func:`~smlibpy.Line`, :func:`~smlibpy.Arc` and :func:`~smlibpy.Spline`. Parameters along an edge (``point_at(t)``) run from 0 at the start to 1 at the end, proportional to arc length.
# smlibpy.shapes.Edge (class)
class Edge(Shape)

  # smlibpy.shapes.Edge.__init__ (constructor)
  Edge() -> None

  # ``"line"``, ``"circle"`` (also arcs), ``"ellipse"``, ``"bspline"`` or ``"other"``
  geom_type: str

  length: float

  start: Vector

  end: Vector

  is_closed: bool

  # True for the seam of a closed surface (an edge used twice by one face)
  is_seam: bool

  # ``"convex"`` for an outside corner (material angle below 180 degrees), ``"concave"``
  # Remarks: for an inside corner, ``"smooth"`` where the faces meet tangentially. Edges with a single face count as convex.
  convexity: str

  # True on an outside corner (see :attr:`convexity`)
  # smlibpy.shapes.Edge.is_convex (method)
  is_convex() -> bool

  # Unit direction of a straight edge (start to end)
  direction: Vector

  # Radius of a circular edge
  radius: float

  # Center of a circular edge
  arc_center: Vector

  # Axis direction of a circular edge
  normal: Vector

  # Point at fraction ``t`` of the edge length (0 = start, 1 = end)
  # smlibpy.shapes.Edge.point_at (method)
  point_at(t: float = 0.5) -> Vector

  # Unit tangent at fraction ``t`` of the edge length, pointing along the edge
  # smlibpy.shapes.Edge.tangent_at (method)
  tangent_at(t: float = 0.5) -> Vector

  # The point halfway along the edge (use :attr:`arc_center` for a circle's center)
  # smlibpy.shapes.Edge.center (method)
  center() -> Vector

  # Tight axis-aligned bounding box
  # smlibpy.shapes.Edge.bbox (method)
  bbox() -> BoundBox

  # smlibpy.shapes.Edge.distance_to (method)
  distance_to(point: VectorLike) -> float

  # Points where this edge crosses another edge
  # smlibpy.shapes.Edge.intersections (method)
  intersections(other: Edge) -> list[Vector]

  # All vertices of this shape
  # smlibpy.shapes.Edge.vertices (method)
  vertices() -> ShapeList[Vertex]

  # All edges of this shape
  # smlibpy.shapes.Edge.edges (method)
  edges() -> ShapeList[Edge]

  # All faces of this shape
  # smlibpy.shapes.Edge.faces (method)
  faces() -> ShapeList[Face]

  # The same edge traversed the other way
  # smlibpy.shapes.Edge.reversed (method)
  reversed() -> Edge

  # This edge as a NURBS curve, from its start to its end
  # Remarks: weights. Exact for lines, arcs (rational) and B-splines; other curves are approximated within 1e-7.
  # smlibpy.shapes.Edge.nurbs (method)
  nurbs() -> Nurbs

  # The same curve with the knots it does not need taken out
  # Remarks: points (the kernel's knot removal, which keeps the curve within about 1e-6 of where it was). Lines, arcs and other analytic curves come back as they are.
  # smlibpy.shapes.Edge.remove_knots (method)
  remove_knots() -> Edge

  # smlibpy.shapes.Edge.__add__ (method)
  __add__(other: Edge | Wire) -> Wire  # Edge + other

# Category: shapes
# A bounded piece of a surface, belonging to a body (a part, shell or sketch)
# smlibpy.shapes.Face (class)
class Face(Shape)

  # smlibpy.shapes.Face.__init__ (constructor)
  Face(owner: Any, kface: Any)

  # The body this face belongs to
  owner: _Body

  # ``"plane"``, ``"cylinder"``, ``"cone"``, ``"sphere"``, ``"torus"``, ``"revolution"``,
  # Remarks: ``"extrusion"``, ``"bspline"``, ``"offset"`` or ``"other"``.
  geom_type: str

  area: float

  # Area centroid
  # smlibpy.shapes.Face.center (method)
  center() -> Vector

  # A point guaranteed to lie on the face
  # smlibpy.shapes.Face.interior_point (method)
  interior_point() -> Vector

  # Outward unit normal at the face point closest to ``point`` (default
  # smlibpy.shapes.Face.normal_at (method)
  normal_at(point: VectorLike | None = None) -> Vector

  # True for planes and for flat B-spline faces (control points in one plane)
  is_planar: bool

  # The face's plane
  plane: Plane

  # Radius of a cylinder, sphere or cone (at its base), minor radius of a torus
  radius: float

  # Axis of a cylinder, cone, sphere, torus or surface of revolution
  axis: Axis

  # Tight axis-aligned bounding box
  # smlibpy.shapes.Face.bbox (method)
  bbox() -> BoundBox

  # smlibpy.shapes.Face.distance_to (method)
  distance_to(point: VectorLike) -> float

  # Where a ray meets this face, nearest first (see :meth:`Part.raycast`)
  # smlibpy.shapes.Face.raycast (method)
  raycast(origin: VectorLike | Axis, direction: VectorLike | Axis | None = None) -> list[Hit]

  # smlibpy.shapes.Face.outer_wire (method)
  outer_wire() -> Wire

  # smlibpy.shapes.Face.inner_wires (method)
  inner_wires() -> ShapeList[Wire]

  # All wires (closed edge loops of faces, or the shape itself if it is a wire)
  # smlibpy.shapes.Face.wires (method)
  wires() -> ShapeList[Wire]

  # The face's edges (seam edges only with ``seams=True``)
  # smlibpy.shapes.Face.edges (method)
  edges(seams: bool = False) -> ShapeList[Edge]

  # All vertices of this shape
  # smlibpy.shapes.Face.vertices (method)
  vertices() -> ShapeList[Vertex]

  # All faces of this shape
  # smlibpy.shapes.Face.faces (method)
  faces() -> ShapeList[Face]

  # Faces sharing an edge with this one
  # smlibpy.shapes.Face.neighbors (method)
  neighbors() -> ShapeList[Face]

  # A sketch holding a copy of this (planar) face
  # smlibpy.shapes.Face.to_sketch (method)
  to_sketch() -> Sketch

  # A sheet body holding a copy of this face
  # smlibpy.shapes.Face.to_shell (method)
  to_shell() -> Shell

  # Extrude a planar face along its normal (see :meth:`Sketch.extrude`)
  # smlibpy.shapes.Face.extrude (method)
  extrude(amount: float, **kwargs: Any) -> Part

# Category: shapes
# Mass properties of a part
# Remarks: ``inertia`` is the inertia tensor about the center of mass (axes parallel to the world axes); ``principal_moments`` and ``principal_axes`` are its eigen-decomposition.
# smlibpy.shapes.MassProperties (class)
class MassProperties

  # smlibpy.shapes.MassProperties.__init__ (constructor)
  MassProperties(mass: float, volume: float, area: float, center: Vector, inertia: np.ndarray, density: float)

  principal_moments: tuple[float, float, float]

  principal_axes: tuple[Vector, Vector, Vector]

# Category: shapes
# A solid
# Remarks: Combine parts with ``+`` (union), ``-`` (difference) and ``&`` (intersection). The right-hand side may be a single part or any iterable of parts.
# smlibpy.shapes.Part (class)
class Part(_Body)

  volume: float

  # Total surface area
  area: float

  # Center of mass (uniform density)
  # smlibpy.shapes.Part.center (method)
  center() -> Vector

  # Mass, center of mass and inertia tensor for a uniform ``density``
  # Remarks: ``accuracy`` is the relative accuracy of the results (default ``ACCURACY``, 1e-7; from 1e-10 to 1e-2): volume, mass and area to ``accuracy`` of their value, the center to ``accuracy`` times the size of the part (its bounding box diagonal), the inertia to ``accuracy`` times its largest principal moment.
  # smlibpy.shapes.Part.mass_properties (method)
  mass_properties(density: float = 1.0, accuracy: float | None = None) -> MassProperties

  # True if the part is a closed, manifold solid that encloses a positive volume
  # Remarks: (A body whose faces point inward, or that encloses no volume, such as a profile revolved about an axis through it, is not valid.)
  # smlibpy.shapes.Part.is_valid (method)
  is_valid() -> bool

  # The separate bodies of this part
  # smlibpy.shapes.Part.solids (method)
  solids() -> ShapeList[Part]

  # This part and others as one part made of cells
  # Remarks: a cell of its own; cells that touch share the faces between them (each such face bounds two cells: the body is non-manifold). For simulation meshes that must match across materials, and for models of several materials. ``cells()`` gives the cells as parts of their own; ``volume`` is the volume of the union. A merged part is not a manifold solid: ``is_valid()`` is False, and Booleans, fillets and shells take its cells rather than the part itself.
  # smlibpy.shapes.Part.merge (method)
  merge(*others: Part | Sequence[Part]) -> Part

  # The cells of a part made by :meth:`merge`, each as a part of its own (every closed region
  # Remarks: of the body; a cavity is not a cell). A part that is one solid: ``[itself]``.
  # smlibpy.shapes.Part.cells (method)
  cells() -> ShapeList[Part]

  # Union with other parts
  # smlibpy.shapes.Part.fuse (method)
  fuse(*others: Part | Iterable[Part]) -> Part

  # Subtract other parts
  # smlibpy.shapes.Part.cut (method)
  cut(*others: Part | Iterable[Part]) -> Part

  # Keep only the volume shared with the other parts
  # smlibpy.shapes.Part.intersect (method)
  intersect(*others: Part | Iterable[Part]) -> Part

  # smlibpy.shapes.Part.__add__ (method)
  __add__(other: Any) -> Part  # Part + other

  # smlibpy.shapes.Part.__radd__ (method)
  __radd__(other: Any) -> Part  # other + Part

  # smlibpy.shapes.Part.__sub__ (method)
  __sub__(other: Any) -> Part  # Part - other

  # smlibpy.shapes.Part.__and__ (method)
  __and__(other: Any) -> Part  # Part & other

  # Round edges
  # smlibpy.shapes.Part.fillet (method)
  fillet(edges: Any, radius: float | tuple[float, float] | Sequence[float], *, continuity: int | str | None = None, fullness: float = 1.0) -> Part
  #   edges: Edges of this part (a selection, a single edge, or faces whose edges to round)
  #   radius: Fillet radius
  #   continuity: ``None`` for a circular fillet
  #   fullness: Shape of a blend cross-section

  # Bevel edges
  # smlibpy.shapes.Part.chamfer (method)
  chamfer(edges: Any, length: float) -> Part

  # Hollow the part out to walls of ``thickness``, removing the ``openings`` faces
  # Remarks: The walls grow inward (the outside keeps its size) unless ``outward`` is true.
  # smlibpy.shapes.Part.shell (method)
  shell(thickness: float, openings: Any = None, *, outward: bool = False) -> Part

  # Grow (positive) or shrink (negative) the part by ``distance`` everywhere
  # smlibpy.shapes.Part.offset (method)
  offset(distance: float) -> Part

  # Cut the part with a plane
  # Remarks: ``keep="above"`` keeps the side the plane normal points to, ``"below"`` the other side, ``"both"`` returns ``(above, below)``.
  # smlibpy.shapes.Part.split (method)
  split(plane: Plane | Face, keep: str = 'above') -> Any

  # The cross-section of the part in a plane, as a sketch
  # smlibpy.shapes.Part.section (method)
  section(plane: Plane | Face = Plane.XY) -> Sketch

  # Twist about an axis (default Z) by ``angle`` degrees over the part
  # smlibpy.shapes.Part.twist (method)
  twist(angle: float, **kwargs: Any) -> Part

  # Scale cross-sections toward an axis (default Z) from 1 to ``scale``
  # smlibpy.shapes.Part.taper (method)
  taper(scale: float, **kwargs: Any) -> Part

  # Bend around an axis by ``angle`` degrees (default
  # smlibpy.shapes.Part.bend (method)
  bend(angle: float, **kwargs: Any) -> Part

  # Deform with a :class:`smlibpy.Lattice` (same as ``lattice.apply(part)``)
  # smlibpy.shapes.Part.deform (method)
  deform(lattice: Any, **kwargs: Any) -> Part

  # The part with fillets taken out and their edges sharp again
  # Remarks: of this part), or all fillets up to ``max_radius``. With ``partial`` the fillets the kernel cannot take out stay. See :mod:`smlibpy.defeature`.
  # smlibpy.shapes.Part.remove_fillets (method)
  remove_fillets(faces: Any = None, *, max_radius: float | None = None, partial: bool = False) -> Part

  # The part with ``faces`` (a hole, a boss, a pocket) cut out and the gap closed by the
  # Remarks: faces around it. With ``partial`` the features the kernel cannot close stay. See :mod:`smlibpy.defeature`.
  # smlibpy.shapes.Part.remove_faces (method)
  remove_faces(faces: Any, *, partial: bool = False) -> Part

  # Draft angle of every face for the pull direction, with the faces grouped by whether
  # Remarks: they release (see :class:`smlibpy.draft.DraftAnalysis`).
  # smlibpy.shapes.Part.draft_analysis (method)
  draft_analysis(direction: Axis | VectorLike, *, min_angle: float = 1.0) -> Any

  # The closed lines where the part's surface turns from facing ``direction`` to facing
  # Remarks: away from it (see :func:`smlibpy.draft.parting_line`).
  # smlibpy.shapes.Part.parting_line (method)
  parting_line(direction: Axis | VectorLike) -> ShapeList[Wire]

  # Tilt faces by a draft angle, so that a molded or cast part comes out of its mold
  # Remarks: Each face turns about the line where it meets the neutral plane and keeps its size there. The normal of the neutral plane is the pull direction, the way the mold moves off the part: a positive angle turns each face to look more along it, so the part narrows and pockets and holes widen along the normal, on either side of the plane. Afterwards ``draft_analysis`` of that direction finds ``angle`` more draft on each of the faces. Planes can be drafted, and cylinders and cones whose axis runs along the normal (a cylinder becomes a cone). A face that meets a drafted face tangentially, such as a fillet between two walls, must be drafted with it; the faces around the drafted ones are extended or trimmed to meet them.
  # smlibpy.shapes.Part.draft (method)
  draft(faces: Any, angle: float, neutral_plane: Plane | Face) -> Part
  #   faces: Faces of this part (a selection or a single face)
  #   angle: Draft angle in degrees, between -90 and 90 and not 0
  #   neutral_plane: Where the faces keep their size, a :class:`Plane` or a planar face

  # Fold this sheet along a line on its top or bottom face (see :func:`smlibpy.fold`)
  # smlibpy.shapes.Part.fold (method)
  fold(line: Any, angle: float, *, radius: float, k_factor: float = 0.44, fixed: Any = None, partial: bool = False) -> Part

  # Add a flange along a straight outer edge of this sheet (see :func:`smlibpy.flange`)
  # smlibpy.shapes.Part.flange (method)
  flange(edge: Any, length: float, *, angle: float = 90.0, radius: float, k_factor: float = 0.44) -> Part

  # The bends of this sheet metal part (see :func:`smlibpy.sheetmetal.bends`)
  # smlibpy.shapes.Part.bends (method)
  bends(*, k_factor: float = 0.44) -> list[Any]

  # This sheet metal part unfolded flat (see :func:`smlibpy.unfold`)
  # smlibpy.shapes.Part.unfold (method)
  unfold(*, k_factor: float = 0.44, fixed: Face | None = None) -> Part

  # The flat pattern of this sheet metal part on XY (see :func:`smlibpy.flat_pattern`)
  # smlibpy.shapes.Part.flat_pattern (method)
  flat_pattern(*, k_factor: float = 0.44, fixed: Face | None = None) -> Any

# Category: shapes
# Base class of all shapes
# smlibpy.shapes.Shape (class)
class Shape

  # All vertices of this shape
  # smlibpy.shapes.Shape.vertices (method)
  vertices() -> ShapeList[Vertex]

  # All edges of this shape
  # smlibpy.shapes.Shape.edges (method)
  edges() -> ShapeList[Edge]

  # All wires (closed edge loops of faces, or the shape itself if it is a wire)
  # smlibpy.shapes.Shape.wires (method)
  wires() -> ShapeList[Wire]

  # All faces of this shape
  # smlibpy.shapes.Shape.faces (method)
  faces() -> ShapeList[Face]

  # A copy of this shape moved by a location (``location * shape``)
  # smlibpy.shapes.Shape.moved (method)
  moved(location: Location) -> S

  # A copy moved by ``(x, y, z)``
  # smlibpy.shapes.Shape.translate (method)
  translate(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0) -> S

  # A copy rotated by ``angle`` degrees about ``axis``
  # smlibpy.shapes.Shape.rotate (method)
  rotate(axis: Axis = Z, angle: float = 0.0) -> S

  # A mirrored copy (reflection in ``plane``, a plane or a planar face
  # Remarks: XZ plane, which flips Y).
  # smlibpy.shapes.Shape.mirror (method)
  mirror(plane: Plane | Face = Plane.XZ) -> S

  # A scaled copy
  # Remarks: them zero (``ValueError``: that would flatten the shape).
  # smlibpy.shapes.Shape.scale (method)
  scale(factor: float | VectorLike, center: VectorLike = (0, 0, 0)) -> S

  # Place this shape, designed around the world XY plane, onto a plane or face
  # Remarks: The shape's origin goes to the plane origin (a face's center), its X axis to the plane's X direction and its Z axis to the plane normal. ``sketch.on(face)`` is the usual way to draw on a face.
  # smlibpy.shapes.Shape.on (method)
  on(target: Plane | Face | Location | ShapeList | Sequence[Any]) -> S

  # smlibpy.shapes.Shape.__rmul__ (method)
  __rmul__(other: Any) -> Any  # other * Shape

  # Tight axis-aligned bounding box
  # smlibpy.shapes.Shape.bbox (method)
  bbox() -> BoundBox

  # Center of mass (centroid) of the shape
  # smlibpy.shapes.Shape.center (method)
  center() -> Vector

  # Triangulate the shape (see :func:`smlibpy.mesh.tessellate`)
  # smlibpy.shapes.Shape.mesh (method)
  mesh(tolerance: float | None = None, angle: float = 15.0) -> 'Mesh'

  # Show the shape in the browser viewer (see :func:`smlibpy.show`)
  # smlibpy.shapes.Shape.show (method)
  show(**kwargs: Any) -> Any

  # Write the shape to a file
  # smlibpy.shapes.Shape.export (method)
  export(path: str, **kwargs: Any) -> None

# Category: shapes
# A list of shapes with selection helpers
# Remarks: Every selector returns a new :class:`ShapeList`, so selectors chain:: part.edges().parallel_to(Z).max_by(X) part.faces().planar().facing(-Z) A one-element list can be used wherever a single shape is expected (``sketch.on(part.faces().top())``). Use :meth:`one` to require exactly one.
# smlibpy.shapes.ShapeList (class)
class ShapeList(list)

  # The only element
  # smlibpy.shapes.ShapeList.one (method)
  one() -> T

  first: T

  last: T

  # Sort by position along an axis, by ``"length"``/``"area"``/``"volume"``/``"radius"``,
  # Remarks: or by any function of a shape.
  # smlibpy.shapes.ShapeList.sort_by (method)
  sort_by(key: SortKey = Z, reverse: bool = False) -> ShapeList[T]

  # ``parallel_to(axis)``, ``of_type(name)`` or ``filter(predicate)``, depending on the
  # Remarks: argument.
  # smlibpy.shapes.ShapeList.filter_by (method)
  filter_by(criterion: Axis | str | Callable[[T], bool]) -> ShapeList[T]

  # Return self>value
  # smlibpy.shapes.ShapeList.__gt__ (method)
  __gt__(key: SortKey) -> ShapeList[T]  # ShapeList > key

  # Return self<value
  # smlibpy.shapes.ShapeList.__lt__ (method)
  __lt__(key: SortKey) -> ShapeList[T]  # ShapeList < key

  # smlibpy.shapes.ShapeList.__rshift__ (method)
  __rshift__(key: SortKey) -> ShapeList[T]  # ShapeList >> key

  # smlibpy.shapes.ShapeList.__lshift__ (method)
  __lshift__(key: SortKey) -> ShapeList[T]  # ShapeList << key

  # smlibpy.shapes.ShapeList.sort_by_distance (method)
  sort_by_distance(point: VectorLike, reverse: bool = False) -> ShapeList[T]

  # Group shapes with equal key (within ``tol``), groups in ascending key order
  # smlibpy.shapes.ShapeList.group_by (method)
  group_by(key: SortKey = Z, tol: float = 0.0001) -> list[ShapeList[T]]

  # The shapes with the largest key (all of them, if several tie)
  # smlibpy.shapes.ShapeList.max_by (method)
  max_by(key: SortKey = Z, tol: float = 0.0001) -> ShapeList[T]

  # The shapes with the smallest key (all of them, if several tie)
  # smlibpy.shapes.ShapeList.min_by (method)
  min_by(key: SortKey = Z, tol: float = 0.0001) -> ShapeList[T]

  # Highest shapes (largest Z)
  # smlibpy.shapes.ShapeList.top (method)
  top() -> ShapeList[T]

  # Lowest shapes (smallest Z)
  # smlibpy.shapes.ShapeList.bottom (method)
  bottom() -> ShapeList[T]

  # Shapes furthest along +X
  # smlibpy.shapes.ShapeList.right (method)
  right() -> ShapeList[T]

  # Shapes furthest along -X
  # smlibpy.shapes.ShapeList.left (method)
  left() -> ShapeList[T]

  # Shapes furthest along +Y
  # smlibpy.shapes.ShapeList.back (method)
  back() -> ShapeList[T]

  # Shapes furthest along -Y
  # smlibpy.shapes.ShapeList.front (method)
  front() -> ShapeList[T]

  # The biggest shape by volume, area or length
  # smlibpy.shapes.ShapeList.largest (method)
  largest() -> T

  # The smallest shape by volume, area or length
  # smlibpy.shapes.ShapeList.smallest (method)
  smallest() -> T

  # The shape whose center is closest to ``point``
  # smlibpy.shapes.ShapeList.nearest (method)
  nearest(point: VectorLike) -> T

  # Keep the shapes for which ``predicate(shape)`` is true
  # smlibpy.shapes.ShapeList.filter (method)
  filter(predicate: Callable[[T], bool]) -> ShapeList[T]

  # Keep shapes of the given geometry types, e.g
  # Remarks: ``"plane"``, ``"cylinder"``, ``"bspline"``.
  # smlibpy.shapes.ShapeList.of_type (method)
  of_type(*geom_types: str) -> ShapeList[T]

  # Straight edges (also straight B-spline edges, such as the edges of a chamfer)
  # smlibpy.shapes.ShapeList.lines (method)
  lines() -> ShapeList[T]

  # Circular edges (full circles and arcs)
  # smlibpy.shapes.ShapeList.circles (method)
  circles() -> ShapeList[T]

  # Planar faces (also flat B-spline faces)
  # smlibpy.shapes.ShapeList.planar (method)
  planar() -> ShapeList[T]

  # Cylindrical faces
  # smlibpy.shapes.ShapeList.cylinders (method)
  cylinders() -> ShapeList[T]

  # Straight edges along ``axis``, or planar faces whose normal is along ``axis``
  # smlibpy.shapes.ShapeList.parallel_to (method)
  parallel_to(axis: Axis | VectorLike) -> ShapeList[T]

  # Straight edges perpendicular to ``axis``, or planar faces containing it
  # smlibpy.shapes.ShapeList.perpendicular_to (method)
  perpendicular_to(axis: Axis | VectorLike) -> ShapeList[T]

  # Faces whose outward normal points along ``direction`` (within ``max_angle`` degrees)
  # Remarks: A curved face counts only when its normal does so everywhere on the face: the wall of a hole or a boss faces no direction, and a fillet only with a ``max_angle`` that takes in all its normals.
  # smlibpy.shapes.ShapeList.facing (method)
  facing(direction: Axis | VectorLike, max_angle: float = 0.001) -> ShapeList[T]

  # Edges on outside corners (material angle below 180 degrees), and the outside
  # Remarks: corners of a sketch (vertices where the region's angle is below 180 degrees).
  # smlibpy.shapes.ShapeList.convex (method)
  convex() -> ShapeList[T]

  # Edges on inside corners (material angle above 180 degrees), and the inside
  # Remarks: corners of a sketch.
  # smlibpy.shapes.ShapeList.concave (method)
  concave() -> ShapeList[T]

  # Edges where two faces meet tangentially, such as the borders of a fillet, and the
  # Remarks: vertices of a sketch where two edges meet tangentially.
  # smlibpy.shapes.ShapeList.smooth (method)
  smooth() -> ShapeList[T]

  # Fillet faces
  # Remarks: (with the corner patches where fillets meet), up to ``max_radius``. See :mod:`smlibpy.defeature`.
  # smlibpy.shapes.ShapeList.fillets (method)
  fillets(max_radius: float | None = None) -> ShapeList[T]

  # The faces (or bodies) of the list that a ray meets, nearest first
  # Remarks: order the ray meets them (see :meth:`Part.raycast`). Only the shapes in the list count, so ``part.faces().planar().hit_by(...)`` looks past the faces that are not planar. The ray starts at ``origin`` and runs along ``direction`` (an axis or a vector); an axis alone is a ray from its origin along its direction. A ray through an edge meets the faces on both sides of it.
  # smlibpy.shapes.ShapeList.hit_by (method)
  hit_by(origin: VectorLike | Axis, direction: VectorLike | Axis | None = None) -> ShapeList[T]

  # Shapes whose bounding box lies inside ``box``
  # smlibpy.shapes.ShapeList.within (method)
  within(box: BoundBox) -> ShapeList[T]

  # Shapes passing through ``point`` (vertices at, edges/faces touching it)
  # smlibpy.shapes.ShapeList.at (method)
  at(point: VectorLike, tol: float = 0.0001) -> ShapeList[T]

  # Return self+value
  # smlibpy.shapes.ShapeList.__add__ (method)
  __add__(other: Iterable[T]) -> ShapeList[T]  # ShapeList + other

  # Return self|value
  # smlibpy.shapes.ShapeList.__or__ (method)
  __or__(other: Iterable[T]) -> ShapeList[T]  # ShapeList | other

  # smlibpy.shapes.ShapeList.__sub__ (method)
  __sub__(other: Iterable[T]) -> ShapeList[T]  # ShapeList - other

  # smlibpy.shapes.ShapeList.__and__ (method)
  __and__(other: Iterable[T]) -> ShapeList[T]  # ShapeList & other

  # Return self[index]
  # smlibpy.shapes.ShapeList.__getitem__ (method)
  __getitem__(i)  # ShapeList[i]

  # smlibpy.shapes.ShapeList.vertices (method)
  vertices() -> ShapeList[Vertex]

  # smlibpy.shapes.ShapeList.edges (method)
  edges() -> ShapeList[Edge]

  # smlibpy.shapes.ShapeList.faces (method)
  faces() -> ShapeList[Face]

  # smlibpy.shapes.ShapeList.wires (method)
  wires() -> ShapeList[Wire]

  # Average of the members' centers
  # smlibpy.shapes.ShapeList.center (method)
  center() -> Vector

  # smlibpy.shapes.ShapeList.bbox (method)
  bbox() -> BoundBox

  # smlibpy.shapes.ShapeList.moved (method)
  moved(location: Location) -> ShapeList[T]

  # Every shape placed onto a plane or face (see :meth:`Shape.on`)
  # smlibpy.shapes.ShapeList.on (method)
  on(target: Any) -> ShapeList[T]

  # smlibpy.shapes.ShapeList.translate (method)
  translate(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0) -> ShapeList[T]

  # smlibpy.shapes.ShapeList.rotate (method)
  rotate(axis: Axis = Z, angle: float = 0.0) -> ShapeList[T]

  # Return value*self
  # smlibpy.shapes.ShapeList.__rmul__ (method)
  __rmul__(other: Any) -> Any  # other * ShapeList

# Category: shapes
# A sheet body
# smlibpy.shapes.Shell (class)
class Shell(_Body)

  area: float

  # Center of mass (centroid) of the shape
  # smlibpy.shapes.Shell.center (method)
  center() -> Vector

  # Turn the sheet into a solid of ``thickness`` (along the face normals
  # Remarks: thickness grows against them). With ``both`` the solid is ``thickness`` thick in total, half of it to each side of the sheet.
  # smlibpy.shapes.Shell.thicken (method)
  thicken(thickness: float, *, both: bool = False) -> Part

  # smlibpy.shapes.Shell.__add__ (method)
  __add__(other: Any) -> Shell  # Shell + other

# Category: shapes
# A planar region (with holes, possibly several pieces) on a plane
# Remarks: Sketch constructors build in the world XY plane around the origin; place a sketch with ``.on(plane_or_face)``, ``Plane * sketch`` or ``Pos(...) * sketch``. Combine sketches with ``+``, ``-``, ``&`` and ``^``, change them with :meth:`offset`, :meth:`fillet`, :meth:`chamfer` and :meth:`mirror`, then turn them into parts with :meth:`extrude`, :meth:`revolve`, :meth:`sweep` or :func:`~smlibpy.loft`. Outlines that are awkward as combinations of shapes are drawn with :class:`~smlibpy.Profile`.
# smlibpy.shapes.Sketch (class)
class Sketch(Shell)

  # The sketch plane
  plane: Plane

  # smlibpy.shapes.Sketch.__add__ (method)
  __add__(other: Any) -> Sketch  # Sketch + other

  # smlibpy.shapes.Sketch.__radd__ (method)
  __radd__(other: Any) -> Sketch  # other + Sketch

  # smlibpy.shapes.Sketch.__sub__ (method)
  __sub__(other: Any) -> Sketch  # Sketch - other

  # smlibpy.shapes.Sketch.__and__ (method)
  __and__(other: Any) -> Sketch  # Sketch & other

  # smlibpy.shapes.Sketch.__xor__ (method)
  __xor__(other: Any) -> Sketch  # Sketch ^ other

  # Area centroid of the region
  # smlibpy.shapes.Sketch.center (method)
  center() -> Vector

  # Total length of the boundary
  perimeter: float

  # Grow (positive ``distance``) or shrink (negative) the region
  # Remarks: ``corners`` shapes the corners that the offset pulls apart (convex ones when growing, concave ones when shrinking): ``"round"`` (arcs of radius ``|distance|``), ``"sharp"`` (the sides extended until they meet) or ``"chamfer"`` (a straight cut across). Lines stay lines and arcs stay arcs. Parts that grow into each other merge, parts that get too thin vanish; shrinking away the whole region raises :class:`ModelingError`. ``round=False`` is the older spelling of ``corners="sharp"``.
  # smlibpy.shapes.Sketch.offset (method)
  offset(distance: float, *, corners: str = 'round', round: bool | None = None) -> Sketch

  # Round corners of the region with tangent arcs of ``radius``
  # Remarks: ``vertices``: the corners to round, as vertices of this sketch (a selection such as ``s.vertices().concave()``) or points; ``None`` rounds every sharp corner. Corners between lines and arcs are rounded exactly; a corner that does not fit, a point that is not a corner, or a smooth corner raises :class:`ModelingError`.
  # smlibpy.shapes.Sketch.fillet (method)
  fillet(radius: float, vertices: Iterable[VectorLike | Vertex] | None = None) -> Sketch

  # Bevel corners of the region
  # Remarks: (measured along the edge) and join the two points with a line. ``vertices`` as for :meth:`fillet`; ``None`` bevels every sharp corner.
  # smlibpy.shapes.Sketch.chamfer (method)
  chamfer(length: float, vertices: Iterable[VectorLike | Vertex] | None = None) -> Sketch

  # A mirrored copy
  # Remarks: plane or planar face (by default the XZ plane, which flips Y). Lines stay lines and arcs stay arcs. The sketch keeps facing the same way when the mirror is an axis in its own plane, so the mirrored profile extrudes to the same side.
  # smlibpy.shapes.Sketch.mirror (method)
  mirror(plane: Plane | Face | Axis = Plane.XZ) -> Sketch

  # Extrude the region into a solid
  # smlibpy.shapes.Sketch.extrude (method)
  extrude(amount: float, *, both: bool = False, taper: float = 0.0, direction: Axis | VectorLike | None = None) -> Part
  #   amount: Distance along the sketch normal (negative goes the other way)
  #   both: Extrude ``amount`` to both sides of the sketch
  #   taper: Draft angle in degrees
  #   direction: Extrude along this direction (an axis or a vector) instead of the normal

  # Revolve the region about an axis in its plane
  # Remarks: The default axis is the sketch's local Y axis through its plane origin. For the centered constructors (``Rectangle``, ``Circle``, ...) and for ``make_face`` that origin is the middle of the region, so pass ``axis`` unless the sketch was drawn beside its origin (``Polygon((10, 0), (20, 0), ...)``). A negative ``angle`` turns the other way. The axis must not cross the region (``ModelingError``).
  # smlibpy.shapes.Sketch.revolve (method)
  revolve(axis: Axis | None = None, angle: float = 360.0) -> Part

  # Sweep the region along a path
  # smlibpy.shapes.Sketch.sweep (method)
  sweep(path: Edge | Wire, *, sharp_corners: bool | None = None) -> Part

# Category: shapes
# A point
# smlibpy.shapes.Vertex (class)
class Vertex(Shape)

  # smlibpy.shapes.Vertex.__init__ (constructor)
  Vertex(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0)

  point: Vector

  x: float

  y: float

  z: float

  # Center of mass (centroid) of the shape
  # smlibpy.shapes.Vertex.center (method)
  center() -> Vector

  # Tight axis-aligned bounding box
  # smlibpy.shapes.Vertex.bbox (method)
  bbox() -> BoundBox

  # All vertices of this shape
  # smlibpy.shapes.Vertex.vertices (method)
  vertices() -> ShapeList[Vertex]

  # All edges of this shape
  # smlibpy.shapes.Vertex.edges (method)
  edges() -> ShapeList[Edge]

  # All faces of this shape
  # smlibpy.shapes.Vertex.faces (method)
  faces() -> ShapeList[Face]

  # smlibpy.shapes.Vertex.distance_to (method)
  distance_to(other: VectorLike | Shape) -> float

  # For a corner of a sketch
  # Remarks: degrees (an outside corner), ``"concave"`` above (an inside corner, also every corner of a square hole), ``"smooth"`` where the two edges meet tangentially.
  convexity: str

# Category: shapes
# A chain of edges, open or closed
# smlibpy.shapes.Wire (class)
class Wire(Shape)

  # smlibpy.shapes.Wire.__init__ (constructor)
  Wire(edges: Iterable[Edge | Wire] | Edge | Wire, *, sort: bool = True)

  # All edges of this shape
  # smlibpy.shapes.Wire.edges (method)
  edges() -> ShapeList[Edge]

  # All vertices of this shape
  # smlibpy.shapes.Wire.vertices (method)
  vertices() -> ShapeList[Vertex]

  # All wires (closed edge loops of faces, or the shape itself if it is a wire)
  # smlibpy.shapes.Wire.wires (method)
  wires() -> ShapeList[Wire]

  is_closed: bool

  start: Vector

  end: Vector

  length: float

  # Length-weighted average of the edge midpoints
  # smlibpy.shapes.Wire.center (method)
  center() -> Vector

  # Tight axis-aligned bounding box
  # smlibpy.shapes.Wire.bbox (method)
  bbox() -> BoundBox

  # Point at fraction ``t`` of the total length
  # smlibpy.shapes.Wire.point_at (method)
  point_at(t: float = 0.5) -> Vector

  # smlibpy.shapes.Wire.tangent_at (method)
  tangent_at(t: float = 0.5) -> Vector

  # smlibpy.shapes.Wire.distance_to (method)
  distance_to(point: VectorLike) -> float

  # This wire closed with a straight line from its end to its start
  # smlibpy.shapes.Wire.close (method)
  close() -> Wire

  # smlibpy.shapes.Wire.reversed (method)
  reversed() -> Wire

  # smlibpy.shapes.Wire.__add__ (method)
  __add__(other: Edge | Wire) -> Wire  # Wire + other

  # The plane of a planar wire (normal by the right-hand rule along the wire)
  # smlibpy.shapes.Wire.plane (method)
  plane() -> Plane

  # Round the corners between straight edges with tangent arcs (planar wires)
  # smlibpy.shapes.Wire.fillet (method)
  fillet(radius: float, vertices: Iterable[VectorLike | Vertex] | None = None) -> Wire

  # The planar region bounded by this closed wire
  # smlibpy.shapes.Wire.to_sketch (method)
  to_sketch() -> Sketch
