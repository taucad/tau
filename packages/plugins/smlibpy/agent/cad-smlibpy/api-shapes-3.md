# smlibpy — shapes (3)

4 top-level symbols. Signatures are verbatim python.

# Category: shapes
# A list of shapes with selection helpers
# Remarks: Every selector returns a new :class:`ShapeList`, so selectors chain:: part.edges().parallel_to(Z).max_by(X) part.faces().planar().facing(-Z) A one-element list can be used wherever a single shape is expected (``sketch.on(part.faces().top())``). Use :meth:`one` to require exactly one.
# smlibpy.shapes.ShapeList (class)
class ShapeList(list)

  # The only element
  # smlibpy.shapes.ShapeList.one (method)
  one() -> T

  # The first shape
  first: T

  # The last shape
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

  # The shapes by the distance of their centers from a point, nearest first (farthest first with ``reverse``)
  # smlibpy.shapes.ShapeList.sort_by_distance (method)
  sort_by_distance(point: VectorLike, reverse: bool = False) -> ShapeList[T]

  # Group shapes with equal key (within ``tolerance``), groups in ascending key order
  # smlibpy.shapes.ShapeList.group_by (method)
  group_by(key: SortKey = Z, tolerance: float = 0.0001) -> list[ShapeList[T]]

  # The shapes with the largest key (all of them, if several tie within ``tolerance``)
  # smlibpy.shapes.ShapeList.max_by (method)
  max_by(key: SortKey = Z, tolerance: float = 0.0001) -> ShapeList[T]

  # The shapes with the smallest key (all of them, if several tie within ``tolerance``)
  # smlibpy.shapes.ShapeList.min_by (method)
  min_by(key: SortKey = Z, tolerance: float = 0.0001) -> ShapeList[T]

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

  # The edges of the list and the edges that continue them tangentially (see
  # Remarks: :meth:`Edge.tangent_chain`): what ``fillet`` and ``chamfer`` round for this selection. Other shapes are left out.
  # smlibpy.shapes.ShapeList.tangent_chain (method)
  tangent_chain() -> ShapeList[T]

  # Edges whose two faces meet at least tangentially all along them (``"G1"`` or ``"G2"``
  # Remarks: by :meth:`Edge.continuity`): the borders of fillets and blends.
  # smlibpy.shapes.ShapeList.g1 (method)
  g1() -> ShapeList[T]

  # Edges whose two faces meet with equal curvature as well (``"G2"`` by
  # Remarks: :meth:`Edge.continuity`): the borders of curvature-continuous blends (``fillet(..., continuity="G2")``), seams of smooth surfaces.
  # smlibpy.shapes.ShapeList.g2 (method)
  g2() -> ShapeList[T]

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

  # Shapes passing through ``point`` (vertices at, edges/faces touching it), at most
  # Remarks: ``tolerance`` (mm) from it.
  # smlibpy.shapes.ShapeList.at (method)
  at(point: VectorLike, tolerance: float = 0.0001) -> ShapeList[T]

  # The faces or edges that are new since the given bodies
  # Remarks: led from them to this list's body, descending from no face or edge of theirs. ``since`` is a body (part, shell, sketch) or a list of them, or faces and edges (then only those count as old). After a Boolean, the curves along which the bodies' faces cross (``(plate + boss).edges().new(since=[plate, boss])``: the circle where a boss reaching into the plate meets its top; where an edge of one body lies on the other, such as the bottom edge of a boss standing on the plate, that edge is not new: :meth:`joining` finds both); after a fillet, chamfer or shell, its new faces (``rounded.faces().new(since=part)``) and their edges. smlibpy marks every face and edge of every body it makes, and the kernel carries the marks along: a copy keeps them, both halves of a split face keep their parent's, a face merged from two keeps both. A moved, turned, mirrored or scaled copy gets new marks (it is a shape of its own). A body read from a file, and a section, have new marks everywhere, so all of them counts as new.
  # smlibpy.shapes.ShapeList.new (method)
  new(since: Any) -> ShapeList[T]

  # The faces or edges that descend from the given shapes
  # Remarks: edges, both from a body (part, shell, sketch). A face that an operation split, trimmed, moved along with the part or merged with another descends from it; one the operation made anew does not. ``(plate - holes).faces().derived_from(holes)`` gives the walls of the holes; ``cut.edges().derived_from(box.edges().top())`` the pieces of the top edges of a box that a slot cut. A body's faces and edges are marked as described in :meth:`new`.
  # smlibpy.shapes.ShapeList.derived_from (method)
  derived_from(*shapes: Any) -> ShapeList[T]

  # The edges that lie on the surfaces of both ``a`` and ``b``
  # Remarks: Boolean combined meet, the edges to round or chamfer after it. ``(plate + boss).edges().joining(plate, boss)`` gives the circle where the boss stands on the plate, also where the boss's bottom face lay on the plate's top (which ``new`` does not count as new: the circle is the boss's bottom edge), ``(block - hole).edges().joining(block, hole)`` the rims of the hole. ``a`` and ``b`` are bodies (parts, shells, sketches) or lists of them (an edge on any of them counts). Each edge is tested at a quarter, half and three quarters of the way along it: there it lies on a face of a body (within the edge's tolerance, at least 1e-6 of the bodies' size) where :meth:`Part.classify` puts it on the body's surface. Edges of a merged face (a face of each body lying in one plane, merged by a union) are not on both surfaces and are not taken.
  # smlibpy.shapes.ShapeList.joining (method)
  joining(a: Any, b: Any) -> ShapeList[T]

  # The faces that lie between two cells of a merged part (see :meth:`Part.merge`)
  # Remarks: materials meet, the faces a simulation mesh must match across or a contact condition goes on. ``merge(block, insert).faces().shared()``; :attr:`Face.cells` says which two cells.
  # smlibpy.shapes.ShapeList.shared (method)
  shared() -> ShapeList[T]

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

  # The vertices of all the shapes, each once
  # smlibpy.shapes.ShapeList.vertices (method)
  vertices() -> ShapeList[Vertex]

  # The edges of all the shapes, each once
  # smlibpy.shapes.ShapeList.edges (method)
  edges() -> ShapeList[Edge]

  # The faces of all the shapes, each once
  # smlibpy.shapes.ShapeList.faces (method)
  faces() -> ShapeList[Face]

  # The wires of all the shapes
  # smlibpy.shapes.ShapeList.wires (method)
  wires() -> ShapeList[Wire]

  # Average of the members' centers
  # smlibpy.shapes.ShapeList.center (method)
  center() -> Vector

  # The box around all the shapes
  # smlibpy.shapes.ShapeList.bbox (method)
  bbox() -> BoundBox

  # Each shape moved by a location
  # smlibpy.shapes.ShapeList.moved (method)
  moved(location: Location) -> ShapeList[T]

  # Every shape placed onto a plane or face (see :meth:`Shape.on`)
  # smlibpy.shapes.ShapeList.on (method)
  on(target: Any) -> ShapeList[T]

  # Each shape moved by ``(x, y, z)``
  # smlibpy.shapes.ShapeList.translate (method)
  translate(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0) -> ShapeList[T]

  # Each shape rotated about an axis by ``angle`` degrees
  # smlibpy.shapes.ShapeList.rotate (method)
  rotate(axis: Axis = Z, angle: float = 0.0) -> ShapeList[T]

  # Return value*self
  # smlibpy.shapes.ShapeList.__rmul__ (method)
  __rmul__(other: Any) -> Any  # other * ShapeList

# Category: shapes
# A sheet body
# smlibpy.shapes.Shell (class)
class Shell(_Body)

  # The sheet of a NURBS surface given by its data
  # Remarks: :meth:`Edge.from_nurbs` is for curves (:func:`~smlibpy.nurbs_surface` with the data in :class:`~smlibpy.NurbsSurface`'s order):: n = face.nurbs() rows = [list(row) for row in n.points] rows[1][1] = Vector(rows[1][1]) + (0, 0, 2) # pull one control point up bumped = Shell.from_nurbs(n._replace(points=rows))
  # smlibpy.shapes.Shell.from_nurbs (method)
  from_nurbs(nurbs: Any) -> Shell
  #   nurbs: A :class:`~smlibpy.NurbsSurface` (what ``Face.nurbs()`` returns), or a tuple ``(degrees, knots, points, weights)``

  # The total area of the faces
  area: float

  # The center of the faces' area (each face weighted by its area)
  # smlibpy.shapes.Shell.center (method)
  center() -> Vector

  # Turn the sheet into a solid of ``thickness`` (along the face normals
  # Remarks: thickness grows against them). With ``both`` the solid is ``thickness`` thick in total, half of it to each side of the sheet. The kernel step runs in another process (a forked copy on Linux and macOS, a helper process on Windows), so that a crash of its offset code raises :class:`ModelingError`, and is stopped after ``smlibpy.defeature.GUARD_SECONDS`` (20 s), as for :meth:`Part.shell`. Where the kernel's extended offset mode fails on a sheet whose faces meet tangentially at every edge, its other mode, which builds the same solid there, is tried.
  # smlibpy.shapes.Shell.thicken (method)
  thicken(thickness: float, *, both: bool = False) -> Part

  # The sheet moved by ``distance`` along its face normals (a negative distance against them)
  # Remarks: each face offset, and where faces meet, extended or trimmed to meet again (sharp edges, as :meth:`Part.offset`). 0 gives an equal copy. Faces that touch along edges they do not share (faces copied one by one, or put together with ``+``) are joined along them first, where their normals agree (:func:`~smlibpy.stitch` without turning a face); faces apart from the others, or whose normals disagree with their neighbours', move each on its own. Results the kernel gets wrong (no faces, faces closer to the sheet than ``distance``, on its other side, or nowhere at that distance from it) raise :class:`ModelingError`; so does an offset beyond the radius of a concave curvature. The kernel step runs in a forked copy of the process (Linux, macOS), as for :meth:`thicken`.
  # smlibpy.shapes.Shell.offset (method)
  offset(distance: float) -> Shell

  # Cut the sheet along curves that lie on it, and keep one side, or both as faces of their own
  # Remarks: Returns: The trimmed sheet (a new one; this one does not change). To cut along a direction instead (a hole through a curved panel), project the outline first: ``sheet.trim(sheet.project(Circle(5).edges(), (0, 0, -1)), keep=(0, 0, 0))`` keeps the disk.
  # smlibpy.shapes.Shell.trim (method)
  trim(curves: Edge | Wire | Iterable[Edge | Wire], keep: VectorLike | str) -> Shell
  #   curves: Edges or wires on the sheet
  #   keep: A point on the side to keep, or near it (not on a curve)

  # The sheet turned over
  # Remarks: :meth:`thicken` then grows to the other side, and the ``sides`` of :func:`~smlibpy.surface_fillet` count from the new normals. A sheet that encloses a volume (the face of a whole sphere) faces outward whichever way its surface runs: it cannot be turned over (``ValueError``).
  # smlibpy.shapes.Shell.flipped (method)
  flipped() -> Shell

  # The sheet (of one face) grown past its sides
  # Remarks: Returns: A new sheet; this one does not change. For a sheet of several faces, extend one of its faces (``sheet.faces()[i].extend(...)``).
  # smlibpy.shapes.Shell.extend (method)
  extend(distance: float, *, sides: Edge | Iterable[Edge] | None = None, continuity: Literal['natural', 'G1', 'G2'] = 'natural') -> Shell
  #   distance: How far past each side, measured along the surface
  #   sides: Edges of the sheet
  #   continuity: ``"natural"`` (default), ``"G1"`` or ``"G2"``

  # The sheet with an edge moved onto a curve
  # Remarks: exactly, and its face bends to follow, smoothly, near the edge only. To close a gap between two sheets before :func:`~smlibpy.stitch`, match one sheet's edge to the other's; to give a sheet a styling line, match it to that curve. Returns: A new sheet; this one does not change. A Sketch's comes back as a Shell.
  # smlibpy.shapes.Shell.match_edge (method)
  match_edge(edge: Edge, target: Edge | Wire, *, extent: float = 0.25) -> Shell

  # The sheet with two faces made one
  # Remarks: such as the halves of a sheet split along a curve of its surface, or patches built through the same curves. The joint's knot goes where the faces meet smoothly enough (within the sheet's tolerance), so a split sheet comes back as it was. Returns: A new sheet with one face less; this one does not change. A Sketch's comes back as a Shell.
  # smlibpy.shapes.Shell.merge_faces (method)
  merge_faces(a: Face, b: Face) -> Shell

  # Push or pull a face of the sheet at a point
  # Remarks: along the face's normal). Returns a new sheet; a Sketch's comes back as a Shell.
  # smlibpy.shapes.Shell.push (method)
  push(face: Face, at: VectorLike, *, by: float | VectorLike | None = None, to: VectorLike | None = None, normal: VectorLike | None = None, radius: float | None = None, continuity: Literal['G0', 'G1', 'G2'] = 'G1') -> Shell

  # Raise or sink a region of a face of the sheet
  # Remarks: Sketch's comes back as a Shell.
  # smlibpy.shapes.Shell.warp (method)
  warp(face: Face, region: Any, by: float | VectorLike, *, continuity: Literal['crease', 'G1', 'G2'] = 'G2') -> Shell

  # Press a region of a face of the sheet onto a plane
  # Remarks: sheet; a Sketch's comes back as a Shell.
  # smlibpy.shapes.Shell.flatten (method)
  flatten(face: Face, region: Any, plane: Plane | Face, *, continuity: Literal['crease', 'G1', 'G2'] = 'G2') -> Shell

  # Union with other sheets (``sheet + other``)
  # smlibpy.shapes.Shell.fuse (method)
  fuse(*others: Shell | Part | Face | Iterable[Shell | Part | Face]) -> Shell

  # The sheet trimmed by parts
  # smlibpy.shapes.Shell.cut (method)
  cut(*others: Part | Iterable[Part]) -> Shell

  # The sheet trimmed by parts
  # Remarks: ``part & sheet``).
  # smlibpy.shapes.Shell.intersect (method)
  intersect(*others: Part | Iterable[Part]) -> Shell

  # smlibpy.shapes.Shell.__add__ (method)
  __add__(other: Any) -> Shell  # Shell + other

  # smlibpy.shapes.Shell.__sub__ (method)
  __sub__(other: Any) -> Shell  # Shell - other

  # smlibpy.shapes.Shell.__and__ (method)
  __and__(other: Any) -> Shell  # Shell & other

# Category: shapes
# A planar region (with holes, possibly several pieces) on a plane
# Remarks: Sketch constructors build in the world XY plane around the origin; place a sketch with ``.on(plane_or_face)``, ``Plane * sketch`` or ``Pos(...) * sketch``. Combine sketches with ``+``, ``-``, ``&`` and ``^``, change them with :meth:`offset`, :meth:`fillet`, :meth:`chamfer` and :meth:`mirror`, then turn them into parts with :meth:`extrude`, :meth:`revolve`, :meth:`sweep` or :func:`~smlibpy.loft`. Outlines that are awkward as combinations of shapes are drawn with :class:`~smlibpy.Profile`.
# smlibpy.shapes.Sketch (class)
class Sketch(Shell)

  # The sketch turned over
  # Remarks: grows to the other side).
  # smlibpy.shapes.Sketch.flipped (method)
  flipped() -> Sketch

  # The sketch plane
  plane: Plane

  # The union with other sketches (``+``)
  # smlibpy.shapes.Sketch.fuse (method)
  fuse(*others: Sketch | Iterable[Sketch]) -> Sketch

  # The region less other sketches (``-``)
  # smlibpy.shapes.Sketch.cut (method)
  cut(*others: Sketch | Iterable[Sketch]) -> Sketch

  # The region common to this and other sketches (``&``)
  # smlibpy.shapes.Sketch.intersect (method)
  intersect(*others: Sketch | Iterable[Sketch]) -> Sketch

  # The region in exactly one of the sketches (``^``)
  # smlibpy.shapes.Sketch.xor (method)
  xor(*others: Sketch | Iterable[Sketch]) -> Sketch

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

  # Area, centroid and second moments of area of the region (a beam's or an extrusion's
  # Remarks: profile): ``ixx``, ``iyy`` and ``ixy`` about the centroid in the axes of the sketch plane, the principal moments and axes, the polar moment, the radii of gyration and the section moduli (see :class:`SectionProperties`). Integrated as the mass properties of a thin slab of the region (to ``ACCURACY`` of the largest moment), less the slab's own thickness term.
  # smlibpy.shapes.Sketch.section_properties (method)
  section_properties() -> SectionProperties

  # Grow (positive ``distance``) or shrink (negative) the region
  # Remarks: ``corners`` shapes the corners that the offset pulls apart (convex ones when growing, concave ones when shrinking): ``"round"`` (arcs of radius ``|distance|``), ``"sharp"`` (the sides extended until they meet) or ``"chamfer"`` (a straight cut across). Lines stay lines and arcs stay arcs. Parts that grow into each other merge, parts that get too thin vanish; shrinking away the whole region raises :class:`ModelingError`.
  # smlibpy.shapes.Sketch.offset (method)
  offset(distance: float, *, corners: Literal['round', 'sharp', 'chamfer'] = 'round') -> Sketch

  # Round corners of the region with tangent arcs of ``radius``
  # Remarks: ``vertices``: the corners to round, as vertices of this sketch (a selection such as ``s.vertices().concave()``) or points; ``None`` rounds every sharp corner. Corners between lines and arcs are rounded exactly; next to a spline or an ellipse the arc's center lies at ``radius`` from both curves (where their offsets meet), and the curves are cut where it touches them. A corner that does not fit, a point that is not a corner, or a smooth corner raises :class:`ModelingError`.
  # smlibpy.shapes.Sketch.fillet (method)
  fillet(radius: float, vertices: VectorLike | Vertex | Iterable[VectorLike | Vertex] | None = None) -> Sketch

  # Bevel corners of the region
  # Remarks: (measured along the edge) and join the two points with a line. ``vertices`` as for :meth:`fillet`; ``None`` bevels every sharp corner.
  # smlibpy.shapes.Sketch.chamfer (method)
  chamfer(length: float, vertices: VectorLike | Vertex | Iterable[VectorLike | Vertex] | None = None) -> Sketch

  # A mirrored copy
  # Remarks: plane or planar face (by default the XZ plane, which flips Y). Lines stay lines and arcs stay arcs. The sketch keeps facing the same way when the mirror is an axis in its own plane, so the mirrored profile extrudes to the same side.
  # smlibpy.shapes.Sketch.mirror (method)
  mirror(plane: Plane | Face | Axis = Plane.XZ) -> Sketch

  # Extrude the region into a solid
  # smlibpy.shapes.Sketch.extrude (method)
  extrude(amount: float, *, both: bool = False, taper: float = 0.0, direction: Axis | VectorLike | None = None, corners: Literal['sharp', 'round'] = 'sharp') -> Part
  #   amount: Distance along the sketch normal (negative goes the other way)
  #   both: Extrude ``amount`` to both sides of the sketch
  #   taper: Draft angle in degrees
  #   direction: Extrude along this direction (an axis or a vector) instead of the normal
  #   corners: With a taper, the corners that the taper pulls apart (convex ones of an outward taper, concave ones of an inward one)

  # Revolve the region about an axis in its plane
  # Remarks: The default axis is the sketch's local Y axis through its plane origin. For the centered constructors (``Rectangle``, ``Circle``, ...) and for ``make_face`` that origin is the middle of the region, so pass ``axis`` unless the sketch was drawn beside its origin (``Polygon((10, 0), (20, 0), ...)``). A negative ``angle`` turns the other way. The axis must not cross the region (``ModelingError``).
  # smlibpy.shapes.Sketch.revolve (method)
  revolve(axis: Axis | None = None, angle: float = 360.0) -> Part

  # Sweep the region along a path (see :func:`~smlibpy.sweep`
  # Remarks: the point ``anchor`` names, goes to the start of the path; ``up`` and ``twist`` set its attitude along it, ``scale`` its size).
  # smlibpy.shapes.Sketch.sweep (method)
  sweep(path: Edge | Wire, *, orient: bool = True, translational: bool = False, sharp_corners: bool | None = None, up: Axis | VectorLike | str | None = None, twist: float | Callable[[float], float] = 0.0, scale: tuple[float, float] | Sequence[tuple[float, float]] | Callable[[float], float] | None = None, anchor: Literal['center', 'origin'] | VectorLike | Vertex = 'center') -> Part

  # Swing the region around an outline
  # Remarks: :func:`~smlibpy.swing`: the region drawn as for a lathe in the XZ plane, the outline a closed curve around the Z axis parallel to XY, scaled at each height to pass through the region's outline on the +X side).
  # smlibpy.shapes.Sketch.swing (method)
  swing(outline: Sketch | Face | Wire | Edge) -> Part

# Category: shapes
# A point
# smlibpy.shapes.Vertex (class)
class Vertex(Shape)

  # smlibpy.shapes.Vertex.__init__ (constructor)
  Vertex(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0)

  # Where the vertex is
  point: Vector

  # The vertex's x coordinate
  x: float

  # The vertex's y coordinate
  y: float

  # The vertex's z coordinate
  z: float

  # How far the edges and faces that meet at this vertex may pass from its point
  # Remarks: kernel's tolerance of the vertex (1e-5 on most parts; larger where the surfaces of an imported, stitched or healed body meet less exactly). ``ValueError`` for a vertex of no body (``Vertex(x, y, z)``).
  tolerance: float

  # Where the vertex is (as :attr:`point`)
  # smlibpy.shapes.Vertex.center (method)
  center() -> Vector

  # A box of size 0 at the vertex
  # smlibpy.shapes.Vertex.bbox (method)
  bbox() -> BoundBox

  # This vertex, in a list
  # smlibpy.shapes.Vertex.vertices (method)
  vertices() -> ShapeList[Vertex]

  # The edges of the body that meet at this vertex (none for a vertex of no body)
  # smlibpy.shapes.Vertex.edges (method)
  edges() -> ShapeList[Edge]

  # The faces of the body that meet at this vertex (none for a vertex of no body)
  # smlibpy.shapes.Vertex.faces (method)
  faces() -> ShapeList[Face]

  # The distance to a point or to a shape
  # smlibpy.shapes.Vertex.distance_to (method)
  distance_to(other: VectorLike | Shape) -> float

  # For a corner of a sketch
  # Remarks: degrees (an outside corner), ``"concave"`` above (an inside corner, also every corner of a square hole), ``"smooth"`` where the two edges meet tangentially.
  convexity: str
