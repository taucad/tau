# smlibpy — shapes

3 top-level symbols. Signatures are verbatim python.

# Category: shapes
# A bounded curve
# Remarks: Edges come from bodies (``part.edges()``) or from curve constructors such as :func:`~smlibpy.Line`, :func:`~smlibpy.CenterArc` and :func:`~smlibpy.Spline`. Parameters along an edge (``point_at(t)``) run from 0 at the start to 1 at the end, proportional to arc length.
# smlibpy.shapes.Edge (class)
class Edge(Shape)

  # smlibpy.shapes.Edge.__init__ (constructor)
  Edge() -> None

  # ``"line"``, ``"circle"`` (also arcs), ``"ellipse"``, ``"bspline"`` or ``"other"``
  geom_type: str

  # How far this edge's curve, its ends and the faces it bounds may lie apart
  # Remarks: kernel's tolerance of the edge (1e-5 on most parts; larger where the surfaces of an imported, stitched or healed body meet less exactly). ``ValueError`` for an edge of no body (a curve made with ``Line``, ``Spline``, ...).
  tolerance: float

  # The edge's length
  length: float

  # The point where the edge starts (in its direction)
  start: Vector

  # The point where the edge ends (in its direction)
  end: Vector

  # True if the edge ends where it starts (a circle, a closed spline)
  is_closed: bool

  # True for the seam of a closed surface (an edge used twice by one face)
  is_seam: bool

  # ``"convex"`` for an outside corner (material angle below 180 degrees), ``"concave"``
  # Remarks: for an inside corner, ``"smooth"`` where the faces meet tangentially (within half a degree) all along the edge. Taken at the middle of the edge; an edge that is tangent there but not at points along it takes the kind where its faces turn most. Edges with a single face count as convex.
  convexity: str

  # The angle between the two faces of the edge through the material, in degrees, at the
  # Remarks: middle of the edge: 90 at the edges of a box, 270 at the inside corner of an L, 180 where the faces meet tangentially. ``ValueError`` for an edge that does not lie between two faces.
  dihedral_angle: float

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

  # The box along the axes around the edge
  # smlibpy.shapes.Edge.bbox (method)
  bbox() -> BoundBox

  # Distance to a point, or to a body (see :meth:`Part.distance_to`)
  # smlibpy.shapes.Edge.distance_to (method)
  distance_to(point: VectorLike | _Body) -> float

  # The point of the edge nearest to ``point``
  # smlibpy.shapes.Edge.closest_point (method)
  closest_point(point: VectorLike | Vertex) -> Vector

  # Where on the edge the point nearest to ``point`` lies, as a fraction of the edge's
  # Remarks: length from its start (0) to its end (1), as :meth:`point_at` takes it: ``edge.point_at(edge.param_at_point(p))`` is ``edge.closest_point(p)`` (build123d's name).
  # smlibpy.shapes.Edge.param_at_point (method)
  param_at_point(point: VectorLike | Vertex) -> float

  # The part of the edge from ``start`` to ``end``, each a fraction of the length (as in
  # Remarks: :meth:`point_at`) or a point on the edge. The part keeps the curve: a trimmed arc is an arc, a trimmed spline the same spline. ``start`` must come before ``end`` along the edge. :: arc = CenterArc((0, 0), 10, 0, 180).trim(0.25, 0.75) # the arc from 45 to 135 degrees tail = Spline((0, 0), (10, 10), (20, 0)).trim((10, 10, 0), 1.0)
  # smlibpy.shapes.Edge.trim (method)
  trim(start: float | VectorLike | Vertex, end: float | VectorLike | Vertex) -> Edge

  # The edge cut in two at ``at``, a fraction of the length or a point on the edge
  # Remarks: before and the part after, each keeping the curve. :: a, b = Line((0, 0), (10, 0)).split(0.3) # 3 and 7 long left, right = edge.split(edge.intersections(other)[0])
  # smlibpy.shapes.Edge.split (method)
  split(at: float | VectorLike | Vertex) -> tuple[Edge, Edge]

  # The edge made longer by ``distance`` at its ``end`` (``"end"``, ``"start"`` or
  # Remarks: ``"both"``), for cut tools and paths that must run past a body. Lines and arcs (circles and ellipses) go on as themselves. Other curves are continued as ``continuity`` says: ``"G1"`` straight along the end tangent, ``"G2"`` with the curvature at the end, ``"natural"`` as the curve's own polynomial goes on. The added length is ``distance`` in every case. :: groove_path = Spline((0, 0), (20, 8), (40, 0)).extend(5, end="both")
  # smlibpy.shapes.Edge.extend (method)
  extend(distance: float, *, end: Literal['start', 'end', 'both'] = 'end', continuity: Literal['G1', 'G2', 'natural'] = 'G1') -> Edge

  # Points where this edge meets ``other``
  # Remarks: a list of them, in order along this edge. Where the two run along each other, the points where that overlap starts and ends. Points closer than ``tolerance`` to the other shape count as on it (default: 1e-6, or 1e-9 of the size of the two where that is larger); points closer than that to each other count once. No point is an empty list.
  # smlibpy.shapes.Edge.intersections (method)
  intersections(other: Shape | Iterable[Shape], *, tolerance: float | None = None) -> list[Vector]

  # Where this edge meets ``other`` (see :meth:`intersections`), as fractions of its length
  # Remarks: (as :meth:`point_at` and :meth:`split` take them), in order.
  # smlibpy.shapes.Edge.intersection_params (method)
  intersection_params(other: Shape | Iterable[Shape], *, tolerance: float | None = None) -> list[float]

  # Points where the edge crosses itself (a figure eight, a looping spline), in order along
  # Remarks: it; the closing point of a closed edge does not count.
  # smlibpy.shapes.Edge.self_intersections (method)
  self_intersections(*, tolerance: float | None = None) -> list[Vector]

  # The curvature at fraction ``t`` of the length (as :meth:`point_at`)
  # Remarks: of the circle that fits the edge best there; 0 where it runs straight.
  # smlibpy.shapes.Edge.curvature_at (method)
  curvature_at(t: float = 0.5) -> float

  # The radius of curvature at fraction ``t`` of the length (``math.inf`` where the edge runs
  # Remarks: straight): the radius of the circle that fits the edge best there.
  # smlibpy.shapes.Edge.radius_at (method)
  radius_at(t: float = 0.5) -> float

  # The smallest radius of curvature of the edge (as :meth:`Face.min_radius` is the face's)
  # Remarks: ``inf`` for a line, an arc's radius. A sweep profile that reaches farther from the path than this folds over itself. Where it is: :meth:`min_radius_at`. :: r = path.min_radius() print(f"tightest bend: radius {r:.3g} at {path.point_at(path.min_radius_at())}")
  # smlibpy.shapes.Edge.min_radius (method)
  min_radius() -> float

  # Where the edge bends most tightly (:meth:`min_radius`)
  # Remarks: :meth:`point_at` takes it (0 for a line or an arc).
  # smlibpy.shapes.Edge.min_radius_at (method)
  min_radius_at() -> float

  # Where the edge changes the side it bends to (an S-curve has one), as fractions of its
  # Remarks: length (as :meth:`point_at`), in order: points where its curvature passes through zero. Lines, arcs and curves that bend one way only have none; a straight stretch between two bends counts once, at its middle, where the bends go opposite ways.
  # smlibpy.shapes.Edge.inflections (method)
  inflections() -> list[float]

  # The edge moved ``distance`` sideways in its plane
  # Remarks: positive distance (seen from the side the plane's normal points to), to its right for a negative one; a closed edge (a circle, a closed spline) outward for a positive distance. Lines stay lines and arcs stay arcs, exactly. Splines and ellipses are offset by the kernel within 1e-6 of their size. Where the edge bends toward that side more tightly than the distance (a radius of curvature below it, see :meth:`min_radius`), the offset would fold over itself and :class:`ModelingError` says where. A closed edge with a corner where it starts and ends (``Spline(*pts, pts[0])``) comes back as one closed edge: rounded at the corner where the offset pulls it apart, cut where its sides cross where it pushes them together (:meth:`Wire.offset` gives sharp and chamfered corners). ``plane``: the plane the edge lies in, whose normal tells left from right. Default: the XY plane for an edge at one height, else the plane the edge lies in, its normal toward +Z (+Y, then +X, for vertical planes). :: rail = Spline((0, 0), (20, 8), (40, 0)).offset(3) # 3 to the left (+Y side)
  # smlibpy.shapes.Edge.offset (method)
  offset(distance: float, *, plane: Plane | None = None) -> Edge

  # The edge as lines and circular arcs within ``tolerance`` of it, end to end along it
  # Remarks: for CNC, laser and plasma cutters and DXF readers that take only LINE and ARC (``export_dxf(..., curves="arcs")``). Lines and arcs come back as they are; splines and ellipses become chains of arcs that join tangentially (lines where they run straight). Both ways, every point of one lies within ``tolerance`` of the other. :: cut = Spline((0, 0), (10, 5), (20, -3), (30, 4)).to_arcs(0.01) # 26 arcs
  # smlibpy.shapes.Edge.to_arcs (method)
  to_arcs(tolerance: float = 0.01) -> Wire

  # This edge bent to pass through ``point`` (and there in the direction ``tangent``, if
  # Remarks: given): the smallest move of its control points that does it, with the ends of the edge and its directions at the ends kept. For "make this curve pass here" edits of splines, sweep paths and outlines; lines and arcs become cubic B-splines.
  # smlibpy.shapes.Edge.through (method)
  through(point: VectorLike | Vertex, *, tangent: VectorLike | None = None, at: float | None = None) -> Edge

  # This edge with its ends moved to ``start`` and ``end`` and its directions there set to
  # Remarks: ``start_tangent`` and ``end_tangent`` (each optional: what is not given stays), bent smoothly in between: the parts near the ends move as a whole, the middle blends. For closing gaps, snapping a curve onto a point or another curve, and making it leave or arrive tangentially. Lines and arcs become B-splines (cubic at least). The kernel's own end deformation (``SmCurve::DeformToEndPointTargets``); the ends land on their targets exactly. :: snapped = spline.match(end=other.start, end_tangent=other.tangent_at(0)) # G1 joint
  # smlibpy.shapes.Edge.match (method)
  match(*, start: VectorLike | Vertex | None = None, end: VectorLike | Vertex | None = None, start_tangent: VectorLike | None = None, end_tangent: VectorLike | None = None) -> Edge

  # How the two faces of the edge meet, checked at ``samples`` points along it
  # Remarks: (:class:`Continuity`): ``"G2"`` where their curvatures across the edge agree as well, ``"G1"`` where they meet tangentially (a circular fillet's border), ``"G0"`` at a crease, ``None`` where they leave a gap wider than the edge's tolerance. ``angle_tolerance`` is the largest angle (degrees) between the faces' normals for G1; ``curvature_tolerance`` the largest difference of their curvatures across the edge for G2, relative to the larger of them (and at least ``1e-3 / length``, so that nearly flat faces count as G2). ``ValueError`` for an edge that does not lie between two faces.
  # smlibpy.shapes.Edge.continuity (method)
  continuity(samples: int = 16, *, angle_tolerance: float = 0.5, curvature_tolerance: float = 0.01) -> Continuity

  # The vertices at the edge's ends, start first (one for a closed edge)
  # smlibpy.shapes.Edge.vertices (method)
  vertices() -> ShapeList[Vertex]

  # This edge, in a list
  # smlibpy.shapes.Edge.edges (method)
  edges() -> ShapeList[Edge]

  # The faces of the body that meet at this edge (none for an edge of no body)
  # smlibpy.shapes.Edge.faces (method)
  faces() -> ShapeList[Face]

  # This edge and the edges that continue it tangentially, through vertices where the next
  # Remarks: edge runs on in the same direction (within 10 degrees) between faces that meet this edge's faces smoothly, and so on along the run: all top edges of a plate with rounded corners, the outline of a slot. This edge comes first. ``fillet`` and ``chamfer`` round the whole run of each selected edge (their ``propagate``). An edge of no part is its own chain.
  # smlibpy.shapes.Edge.tangent_chain (method)
  tangent_chain() -> ShapeList[Edge]

  # The same edge traversed the other way
  # smlibpy.shapes.Edge.reversed (method)
  reversed() -> Edge

  # This edge as a NURBS curve, from its start to its end
  # Remarks: weights. Exact for lines, arcs (rational) and B-splines; other curves are approximated within 1e-7.
  # smlibpy.shapes.Edge.nurbs (method)
  nurbs() -> Nurbs

  # The edge of a NURBS curve given by its data
  # Remarks: points read from a file or another program, curves edited by moving control points and B-splines of many spans (a :func:`~smlibpy.Bezier` is one span).
  # smlibpy.shapes.Edge.from_nurbs (method)
  from_nurbs(nurbs: Nurbs | tuple[int, Sequence[float], Sequence[VectorLike], Sequence[float] | None]) -> Edge

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

  # The face's own color as ``(r, g, b)`` from 0 to 1, or None
  # Remarks: Faces get one with ``body.colored(color, faces=...)`` and from STEP files that color single faces. It stays with the face through later operations (kernel plan T5): with both pieces of a face a Boolean splits, with the walls of a hole cut by a tool whose faces have one, with a face moved, mirrored or scaled, with the offsets of a face in a shell; faces an operation makes anew (a fillet's round, the rim around a shell's opening) have none.
  color: tuple[float, float, float] | None

  # The face's name (``body.named(name, faces=...)``, or from the ``ADVANCED_FACE`` of a STEP
  # Remarks: file), or None. It stays with the face as :attr:`color` does.
  name: str | None

  # The cells of its part that this face bounds, as indices into :meth:`Part.cells`
  # Remarks: face on the outside or on the wall of a cavity, two for a face between two cells of a merged part (see :meth:`ShapeList.shared`), ``()`` for a face of a sheet or a sketch.
  cells: tuple[int, ...]

  # ``"plane"``, ``"cylinder"``, ``"cone"``, ``"sphere"``, ``"torus"``, ``"revolution"``,
  # Remarks: ``"extrusion"``, ``"bspline"``, ``"offset"`` or ``"other"``.
  geom_type: str

  # The face's area
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

  # Major radius of a torus
  # Remarks: tube's).
  major_radius: float

  # Half the opening angle of a cone, in degrees
  cone_angle: float

  # Axis of a cylinder, cone, sphere, torus or surface of revolution
  axis: Axis

  # The box along the axes around the face
  # smlibpy.shapes.Face.bbox (method)
  bbox() -> BoundBox

  # Distance to a point, or to a body (see :meth:`Part.distance_to`)
  # smlibpy.shapes.Face.distance_to (method)
  distance_to(point: VectorLike | _Body) -> float

  # The point of the face nearest to ``point`` (within its boundary)
  # smlibpy.shapes.Face.closest_point (method)
  closest_point(point: VectorLike) -> Vector

  # The parameters ``(u, v)`` of the face's point nearest to ``point``, as fractions (0 to
  # Remarks: 1) of the face's parameter box: ``face.position_at(*face.uv_at(p))`` is ``face.closest_point(p)``.
  # smlibpy.shapes.Face.uv_at (method)
  uv_at(point: VectorLike) -> tuple[float, float]

  # The point of the face's surface at ``(u, v)``, fractions (0 to 1) of the face's
  # Remarks: parameter box. A trimmed face (a plate with a hole, a face cut by another) does not cover its whole box: points there lie on the surface beyond the face's boundary.
  # smlibpy.shapes.Face.position_at (method)
  position_at(u: float, v: float) -> Vector

  # The curvature of the face at its point nearest to ``point`` (default
  # Remarks: the face): both principal curvatures, their directions and the outward normal (:class:`Curvature`). Curvatures are positive where the face bends away from its outward normal (a ball, a boss), negative where it bends towards it (a bore): a cylinder of radius 5 has ``k1 = 0.2, k2 = 0``, its bore ``k1 = 0, k2 = -0.2``.
  # smlibpy.shapes.Face.curvature_at (method)
  curvature_at(point: VectorLike | None = None) -> Curvature

  # The smallest radius of curvature on the face, ``1 / max(|k1|, |k2|)``
  # Remarks: plane, the radius of a cylinder or sphere, the smaller of a torus' tube radius and its inner radius, at the narrow end of a cone. Free-form faces are sampled on a 24 x 24 grid of their parameters and refined from the sharpest points (singular points such as a pole are left out). Compare it with a wall thickness or a cutter radius.
  # smlibpy.shapes.Face.min_radius (method)
  min_radius() -> float

  # The face's surface as a NURBS (:class:`NurbsSurface`)
  # Remarks: and weights. Exact for every kind (planes, cylinders, cones, spheres, tori as rational surfaces). It is the whole surface, untrimmed: the face may cover only part of it.
  # smlibpy.shapes.Face.nurbs (method)
  nurbs() -> NurbsSurface

  # Where a ray meets this face, nearest first (see :meth:`Part.raycast`)
  # smlibpy.shapes.Face.raycast (method)
  raycast(origin: VectorLike | Axis, direction: VectorLike | Axis | None = None) -> list[Hit]

  # The curve projected onto this face along its normals
  # Remarks: of the face's surface, the result trimmed to the face (pieces where it leaves the face and comes back). Within 1e-7 of the size of the face and the curve. For curves drawn near a freeform face; along one direction, see :meth:`Part.project`. :: on_face = part.faces().sort_by(Z)[-1].project(Spline((0, 0, 30), (10, 5, 30), (20, 0, 30)))
  # smlibpy.shapes.Face.project (method)
  project(curve: Edge | Wire) -> ShapeList[Edge]

  # The curve of the face along which one of its surface parameters is constant
  # Remarks: ``v`` as a fraction (0 to 1) of the face's range of that parameter. Trimmed to the face: several pieces where the face has holes or notches. For styling lines, inspection curves and rails on freeform faces. Which parameter runs which way depends on the surface: on a cylinder's side ``v`` is constant around it (``iso(v=0.5)``: the circle half way up) and ``u`` along it. :: ring = Cylinder(10, 40).faces().cylinders()[0].iso(v=0.5) Exact: lines, arcs or B-splines of the surface itself, ending exactly where the face's edges cross them. Give one of ``u`` and ``v``, by name.
  # smlibpy.shapes.Face.iso (method)
  iso(*, u: float | None = None, v: float | None = None) -> ShapeList[Edge]

  # A drawing on XY wrapped onto this face, as a label onto a can
  # Remarks: ``at`` (a point of the face; default its middle), its X axis along the face in ``direction`` (default: the face's first parameter direction there; it follows the parameter line nearest to it), its Y axis across, so that it reads from outside. Lengths stay along the two parameter lines through ``at``: on planes and cylinders the whole drawing keeps its size (text around a cylinder); on cones and doubly curved faces it stretches away from those lines. Around a closed face (a cylinder) the drawing continues across the seam; what leaves the face is cut off (also in its holes). Returns the curves on the face, fitted within 1e-7 of its size; a curve across the seam comes back as one edge.
  # smlibpy.shapes.Face.wrap (method)
  wrap(shape: Edge | Wire | Sketch | Iterable[Edge], at: VectorLike | Vertex | None = None, *, direction: VectorLike | None = None) -> ShapeList[Edge]

  # The face's outer boundary
  # smlibpy.shapes.Face.outer_wire (method)
  outer_wire() -> Wire

  # The boundaries of the face's holes
  # smlibpy.shapes.Face.inner_wires (method)
  inner_wires() -> ShapeList[Wire]

  # The face's boundaries
  # smlibpy.shapes.Face.wires (method)
  wires() -> ShapeList[Wire]

  # The face's edges (seam edges only with ``seams=True``)
  # smlibpy.shapes.Face.edges (method)
  edges(*, seams: bool = False) -> ShapeList[Edge]

  # The face's vertices
  # smlibpy.shapes.Face.vertices (method)
  vertices() -> ShapeList[Vertex]

  # This face, in a list
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

  # A sheet of this face moved by ``distance`` along its normal (:meth:`normal_at`
  # Remarks: it bounds; a negative distance moves it in): the offset surface, trimmed as the face is (see :meth:`Shell.offset`).
  # smlibpy.shapes.Face.offset (method)
  offset(distance: float) -> Shell

  # The pieces of this face cut along curves that lie on it, as the faces of a new sheet
  # smlibpy.shapes.Face.split (method)
  split(curves: Edge | Wire | Iterable[Edge | Wire]) -> ShapeList[Face]

  # A copy of this face, turned over
  # Remarks: (see :meth:`Shell.flipped`).
  # smlibpy.shapes.Face.flipped (method)
  flipped() -> Shell

  # The whole surface this face lies on, as a sheet of one face
  # Remarks: are gone. A cylindrical face cut out of a box comes back as the whole cylinder the cut left it on (its full height and all around), a B-spline face as its whole surface. A plane has no border of its own: it comes back as the smallest rectangle around the face, along the plane's own directions. The sheet's normal follows this face's (:meth:`normal_at`).
  # smlibpy.shapes.Face.untrimmed (method)
  untrimmed() -> Shell

  # The face's surface grown past its sides, as a sheet of one face
  # Remarks: across a part before cutting or splitting it with it, or to give a blend room. Returns: A sheet of one face, its normal following this face's (:meth:`normal_at`).
  # smlibpy.shapes.Face.extend (method)
  extend(distance: float, *, sides: Edge | Iterable[Edge] | None = None, continuity: Literal['natural', 'G1', 'G2'] = 'natural') -> Shell

  # Extrude a planar face along its normal (see :meth:`Sketch.extrude`)
  # smlibpy.shapes.Face.extrude (method)
  extrude(amount: float, *, both: bool = False, taper: float = 0.0, direction: Axis | VectorLike | None = None, corners: Literal['sharp', 'round'] = 'sharp') -> Part

# Category: shapes
# Mass properties of a part
# Remarks: ``inertia`` is the inertia tensor about the center of mass (axes parallel to the world axes); ``principal_moments`` and ``principal_axes`` are its eigen-decomposition.
# smlibpy.shapes.MassProperties (class)
class MassProperties

  # smlibpy.shapes.MassProperties.__init__ (constructor)
  MassProperties(mass: float, volume: float, area: float, center: Vector, inertia: np.ndarray, density: float)

  # The principal moments of inertia, smallest first
  principal_moments: tuple[float, float, float]

  # The principal axes of inertia (directions), in the order of :attr:`principal_moments`
  principal_axes: tuple[Vector, Vector, Vector]

  # The radius of gyration about each principal axis, ``sqrt(moment / mass)``, in the order
  # Remarks: of :attr:`principal_moments`: the distance from the axis at which the whole mass would have the same moment of inertia.
  radii_of_gyration: tuple[float, float, float]

  # The inertia tensor about ``point`` (axes parallel to the world axes)
  # Remarks: moved by the parallel-axis theorem, ``inertia + mass * (d.d * I - d d^T)`` with ``d`` from the center of mass to the point.
  # smlibpy.shapes.MassProperties.inertia_about (method)
  inertia_about(point: VectorLike) -> np.ndarray

  # The moment of inertia about an axis (for example a shaft's axis or a pivot)
  # Remarks: with the inertia tensor about a point of the axis and its unit direction ``n``.
  # smlibpy.shapes.MassProperties.moment_about (method)
  moment_about(axis: Axis) -> float
