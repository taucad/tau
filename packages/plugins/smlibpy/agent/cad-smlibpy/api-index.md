# smlibpy API index

smlibpy 0.3.5 · 479 symbols · extracted by CPython 3.13.16 inspect+ast.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## align — `api-align.md`

smlibpy.align.Align (enum) [lines 5-15] [3 members] [category: align] — How a new shape sits relative to the origin along…
  smlibpy.align.Align.MIN (enumMember)
  smlibpy.align.Align.CENTER (enumMember)
  smlibpy.align.Align.MAX (enumMember)

## sketches — `api-sketches.md`

smlibpy.sketches.ArcSlot (function) [lines 5-9] [category: sketches] — A slot along an arc around the origin
smlibpy.sketches.Circle (function) [lines 11-14] [category: sketches] — A disk of ``radius``
smlibpy.sketches.Ellipse (function) [lines 16-20] [category: sketches] — An ellipse with semi-axes ``x_radius`` and ``y_radius``, turned by ``rotation``
smlibpy.sketches.Hull (function) [lines 22-26] [category: sketches] — The convex hull of points and shapes
smlibpy.sketches.Polygon (function) [lines 28-32] [category: sketches] — The polygon through the points (closed automatically)
smlibpy.sketches.Rectangle (function) [lines 34-38] [category: sketches] — A ``width`` (X) by ``height`` (Y) rectangle
smlibpy.sketches.RegularPolygon (function) [lines 40-44] [category: sketches] — A regular polygon with ``sides`` corners
smlibpy.sketches.RoundedRectangle (function) [lines 46-49] [category: sketches] — A rectangle with rounded corners
smlibpy.sketches.Slot (function) [lines 51-55] [category: sketches] — An obround slot ``length`` long overall (round ends included) and…
smlibpy.sketches.Stroke (function) [lines 57-61] [category: sketches] — The region a pen ``width`` wide covers along a path…
smlibpy.sketches.Trapezoid (function) [lines 63-67] [category: sketches] — A trapezoid with a base of ``width``
smlibpy.sketches.Triangle (function) [lines 69-73] [category: sketches] — A triangle with a base of ``width`` along X and…
smlibpy.sketches.make_face (function) [lines 75-78] [category: sketches] — The planar region inside a closed wire, minus the regions…

## geometry — `api-geometry.md`

smlibpy.geometry.Axis (class) [lines 5-42] [11 members] [category: geometry] — An infinite line through ``origin`` along ``direction``
  smlibpy.geometry.Axis.__init__ (constructor)
  smlibpy.geometry.Axis.origin (property)
  smlibpy.geometry.Axis.direction (property)
  smlibpy.geometry.Axis.__neg__ (method)
  smlibpy.geometry.Axis.reversed (method)
  smlibpy.geometry.Axis.moved (method)
  smlibpy.geometry.Axis.at (method) — The same direction through another point
  smlibpy.geometry.Axis.is_parallel (method)
  smlibpy.geometry.Axis.distance_to (method)
  smlibpy.geometry.Axis.project (method)
  smlibpy.geometry.Axis.position_along (method) — Signed coordinate of ``point`` along this axis
smlibpy.geometry.BoundBox (class) [lines 44-65] [7 members] [category: geometry] — An axis-aligned bounding box
  smlibpy.geometry.BoundBox.__init__ (constructor)
  smlibpy.geometry.BoundBox.of_points (method)
  smlibpy.geometry.BoundBox.size (property)
  smlibpy.geometry.BoundBox.center (property)
  smlibpy.geometry.BoundBox.diagonal (property)
  smlibpy.geometry.BoundBox.union (method)
  smlibpy.geometry.BoundBox.contains (method)
smlibpy.geometry.Hit (class) [lines 67-71] [category: geometry] — Where a ray meets a shape or a mesh (see…
smlibpy.geometry.Location (class) [lines 73-112] [12 members] [category: geometry] — A rigid placement (rotation + translation), stored as a 4x4…
  smlibpy.geometry.Location.__init__ (constructor)
  smlibpy.geometry.Location.about (method) — Rotation by ``angle`` degrees about an arbitrary axis
  smlibpy.geometry.Location.matrix (property) — The 4x4 homogeneous matrix (column-vector convention)
  smlibpy.geometry.Location.position (property)
  smlibpy.geometry.Location.rotation (property) — Rotation as X, Y, Z angles in degrees (applied in…
  smlibpy.geometry.Location.x_dir (property)
  smlibpy.geometry.Location.y_dir (property)
  smlibpy.geometry.Location.z_dir (property)
  smlibpy.geometry.Location.plane (property) — The XY plane moved by this location
  smlibpy.geometry.Location.inverse (method)
  smlibpy.geometry.Location.rotate_vector (method)
  smlibpy.geometry.Location.__mul__ (method)
smlibpy.geometry.Nurbs (class) [lines 114-118] [category: geometry] — A curve as a NURBS (see :meth:`Edge.nurbs`)
smlibpy.geometry.Plane (class) [lines 120-189] [20 members] [category: geometry] — A coordinate system
  smlibpy.geometry.Plane.__init__ (constructor)
  smlibpy.geometry.Plane.origin (property)
  smlibpy.geometry.Plane.x_dir (property)
  smlibpy.geometry.Plane.y_dir (property)
  smlibpy.geometry.Plane.z_dir (property) — The plane normal
  smlibpy.geometry.Plane.normal (property) — The plane normal
  smlibpy.geometry.Plane.location (property) — The location that maps the world XY plane onto this…
  smlibpy.geometry.Plane.offset (method) — This plane moved ``distance`` along its normal
  smlibpy.geometry.Plane.shifted (method) — This plane moved within its own coordinates
  smlibpy.geometry.Plane.flipped (method) — The same plane seen from the other side (normal reversed,…
  smlibpy.geometry.Plane.rotated (method) — Rotate about the plane's own X, then Y, then Z…
  smlibpy.geometry.Plane.moved (method)
  smlibpy.geometry.Plane.at (method) — The same orientation through another origin
  smlibpy.geometry.Plane.to_local (method)
  smlibpy.geometry.Plane.from_local (method)
  smlibpy.geometry.Plane.contains (method)
  smlibpy.geometry.Plane.distance_to (method) — Signed distance of a point above the plane
  smlibpy.geometry.Plane.project (method)
  smlibpy.geometry.Plane.is_coplanar (method)
  smlibpy.geometry.Plane.__mul__ (method) — ``Plane * shape`` places a shape (usually a sketch drawn…
smlibpy.geometry.Pos (function) [lines 191-194] [category: geometry] — A translation
smlibpy.geometry.Rot (function) [lines 196-199] [category: geometry] — A rotation in degrees about the world X, then Y,…
smlibpy.geometry.Vector (class) [lines 201-281] [25 members] [category: geometry] — An immutable 3D vector or point
  smlibpy.geometry.Vector.__init__ (constructor)
  smlibpy.geometry.Vector.x (property)
  smlibpy.geometry.Vector.y (property)
  smlibpy.geometry.Vector.z (property)
  smlibpy.geometry.Vector.to_tuple (method)
  smlibpy.geometry.Vector.__getitem__ (method)
  smlibpy.geometry.Vector.__add__ (method)
  smlibpy.geometry.Vector.__radd__ (method)
  smlibpy.geometry.Vector.__sub__ (method)
  smlibpy.geometry.Vector.__mul__ (method)
  smlibpy.geometry.Vector.__rmul__ (method)
  smlibpy.geometry.Vector.__truediv__ (method)
  smlibpy.geometry.Vector.__neg__ (method)
  smlibpy.geometry.Vector.length (property)
  smlibpy.geometry.Vector.dot (method)
  smlibpy.geometry.Vector.cross (method)
  smlibpy.geometry.Vector.normalized (method)
  smlibpy.geometry.Vector.distance_to (method)
  smlibpy.geometry.Vector.angle_to (method) — Angle to another vector in degrees (0..180)
  smlibpy.geometry.Vector.is_close (method)
  smlibpy.geometry.Vector.is_parallel (method) — True if both vectors point along the same line (either…
  smlibpy.geometry.Vector.is_perpendicular (method)
  smlibpy.geometry.Vector.rotate (method) — Rotate this point about an axis (through the origin for…
  smlibpy.geometry.Vector.project_to (method) — Orthogonal projection of this point onto a plane
  smlibpy.geometry.Vector.any_perpendicular (method) — A unit vector perpendicular to this one

## sheetmetal — `api-sheetmetal.md`

smlibpy.sheetmetal.Bend (class) [lines 5-15] [2 members] [category: sheetmetal] — One bend of a sheet metal part
  smlibpy.sheetmetal.Bend.allowance (property) — The bend allowance (the width of the bend's strip in…
  smlibpy.sheetmetal.Bend.__init__ (constructor)
smlibpy.sheetmetal.FlatPattern (class) [lines 17-30] [3 members] [category: sheetmetal] — The unfolded part, laid on the XY plane
  smlibpy.sheetmetal.FlatPattern.bend_lines (property) — The bend lines (middle of each bend's strip), at z…
  smlibpy.sheetmetal.FlatPattern.size (property) — Size of the blank
  smlibpy.sheetmetal.FlatPattern.__init__ (constructor)
smlibpy.sheetmetal.bend_allowance (function) [lines 32-36] [category: sheetmetal] — Length of the flat strip that a bend takes
smlibpy.sheetmetal.bend_deduction (function) [lines 38-42] [category: sheetmetal] — What a bend takes off the sum of the outside…
smlibpy.sheetmetal.developed_length (function) [lines 44-48] [category: sheetmetal] — Length of the flat blank for a strip bent into…
smlibpy.sheetmetal.flange (function) [lines 50-60] [category: sheetmetal] — Add a flange along a straight edge of a sheet
smlibpy.sheetmetal.flat_pattern (function) [lines 62-66] [category: sheetmetal] — The flat pattern of a sheet metal part, laid on…
smlibpy.sheetmetal.fold (function) [lines 68-79] [category: sheetmetal] — Fold a sheet along a line
smlibpy.sheetmetal.unfold (function) [lines 81-85] [category: sheetmetal] — Unfold a sheet metal part

## curves — `api-curves.md`

smlibpy.curves.Bezier (function) [lines 5-8] [category: curves] — A Bézier curve (rational if ``weights`` are given) from its…
smlibpy.curves.CenterArc (function) [lines 10-14] [category: curves] — An arc around ``center`` starting at ``start_angle`` and spanning ``arc_size``…
smlibpy.curves.EllipticalArc (function) [lines 16-20] [category: curves] — An ellipse (or elliptical arc) around ``center`` in ``plane``
smlibpy.curves.FilletPolyline (function) [lines 22-25] [category: curves] — A polyline whose corners are rounded with ``radius``
smlibpy.curves.Helix (function) [lines 27-31] [category: curves] — A helix around ``direction`` through ``center``
smlibpy.curves.Line (function) [lines 33-36] [category: curves] — A straight edge from ``start`` to ``end``
smlibpy.curves.PolarLine (function) [lines 38-41] [category: curves] — A line of ``length`` leaving ``start`` at ``angle`` degrees from…
smlibpy.curves.Polyline (function) [lines 43-46] [category: curves] — Straight segments through the points
smlibpy.curves.RadiusArc (function) [lines 48-52] [category: curves] — The shorter arc of ``radius`` from ``start`` to ``end`` in…
smlibpy.curves.SagittaArc (function) [lines 54-58] [category: curves] — An arc from ``start`` to ``end`` whose middle is ``sagitta``…
smlibpy.curves.Spline (function) [lines 60-66] [category: curves] — A smooth cubic curve through the points
smlibpy.curves.TangentArc (function) [lines 68-71] [category: curves] — An arc from ``start`` to ``end`` leaving ``start`` along ``tangent``
smlibpy.curves.ThreePointArc (function) [lines 73-76] [category: curves] — The circular arc from ``start`` through ``through`` to ``end``
smlibpy.curves.make_compatible (function) [lines 78-83] [category: curves] — Copies of the curves as B-splines of one degree and…

## parts — `api-parts.md`

smlibpy.parts.Box (function) [lines 5-8] [category: parts] — A box of ``length`` (X) by ``width`` (Y) by ``height``…
smlibpy.parts.Cone (function) [lines 10-13] [category: parts] — A cone (or frustum) along Z
smlibpy.parts.CounterBoreHole (function) [lines 15-18] [category: parts] — A drilling tool with a counterbore at the top
smlibpy.parts.CounterSinkHole (function) [lines 20-23] [category: parts] — A drilling tool with a conical countersink of included ``angle``…
smlibpy.parts.Cylinder (function) [lines 25-28] [category: parts] — A cylinder along Z
smlibpy.parts.Hole (function) [lines 30-33] [category: parts] — A drilling tool
smlibpy.parts.Sphere (function) [lines 35-38] [category: parts] — A sphere
smlibpy.parts.Torus (function) [lines 40-43] [category: parts] — A torus around Z
smlibpy.parts.Wedge (function) [lines 45-49] [category: parts] — A ramp

## shapes — `api-shapes.md`

smlibpy.shapes.Edge (class) [lines 5-98] [26 members] [category: shapes] — A bounded curve
  smlibpy.shapes.Edge.__init__ (constructor)
  smlibpy.shapes.Edge.geom_type (property) — ``"line"``, ``"circle"`` (also arcs), ``"ellipse"``, ``"bspline"`` or ``"other"``
  smlibpy.shapes.Edge.length (property)
  smlibpy.shapes.Edge.start (property)
  smlibpy.shapes.Edge.end (property)
  smlibpy.shapes.Edge.is_closed (property)
  smlibpy.shapes.Edge.is_seam (property) — True for the seam of a closed surface (an edge…
  smlibpy.shapes.Edge.convexity (property) — ``"convex"`` for an outside corner (material angle below 180 degrees),…
  smlibpy.shapes.Edge.is_convex (method) — True on an outside corner (see :attr:`convexity`)
  smlibpy.shapes.Edge.direction (property) — Unit direction of a straight edge (start to end)
  smlibpy.shapes.Edge.radius (property) — Radius of a circular edge
  smlibpy.shapes.Edge.arc_center (property) — Center of a circular edge
  smlibpy.shapes.Edge.normal (property) — Axis direction of a circular edge
  smlibpy.shapes.Edge.point_at (method) — Point at fraction ``t`` of the edge length (0 =…
  smlibpy.shapes.Edge.tangent_at (method) — Unit tangent at fraction ``t`` of the edge length, pointing…
  smlibpy.shapes.Edge.center (method) — The point halfway along the edge (use :attr:`arc_center` for a…
  smlibpy.shapes.Edge.bbox (method) — Tight axis-aligned bounding box
  smlibpy.shapes.Edge.distance_to (method)
  smlibpy.shapes.Edge.intersections (method) — Points where this edge crosses another edge
  smlibpy.shapes.Edge.vertices (method) — All vertices of this shape
  smlibpy.shapes.Edge.edges (method) — All edges of this shape
  smlibpy.shapes.Edge.faces (method) — All faces of this shape
  smlibpy.shapes.Edge.reversed (method) — The same edge traversed the other way
  smlibpy.shapes.Edge.nurbs (method) — This edge as a NURBS curve, from its start to…
  smlibpy.shapes.Edge.remove_knots (method) — The same curve with the knots it does not need…
  smlibpy.shapes.Edge.__add__ (method)
smlibpy.shapes.Face (class) [lines 100-188] [24 members] [category: shapes] — A bounded piece of a surface, belonging to a body…
  smlibpy.shapes.Face.__init__ (constructor)
  smlibpy.shapes.Face.owner (property) — The body this face belongs to
  smlibpy.shapes.Face.geom_type (property) — ``"plane"``, ``"cylinder"``, ``"cone"``, ``"sphere"``, ``"torus"``, ``"revolution"``,
  smlibpy.shapes.Face.area (property)
  smlibpy.shapes.Face.center (method) — Area centroid
  smlibpy.shapes.Face.interior_point (method) — A point guaranteed to lie on the face
  smlibpy.shapes.Face.normal_at (method) — Outward unit normal at the face point closest to ``point``…
  smlibpy.shapes.Face.is_planar (property) — True for planes and for flat B-spline faces (control points…
  smlibpy.shapes.Face.plane (property) — The face's plane
  smlibpy.shapes.Face.radius (property) — Radius of a cylinder, sphere or cone (at its base),…
  smlibpy.shapes.Face.axis (property) — Axis of a cylinder, cone, sphere, torus or surface of…
  smlibpy.shapes.Face.bbox (method) — Tight axis-aligned bounding box
  smlibpy.shapes.Face.distance_to (method)
  smlibpy.shapes.Face.raycast (method) — Where a ray meets this face, nearest first (see :meth:`Part.raycast`)
  smlibpy.shapes.Face.outer_wire (method)
  smlibpy.shapes.Face.inner_wires (method)
  smlibpy.shapes.Face.wires (method) — All wires (closed edge loops of faces, or the shape…
  smlibpy.shapes.Face.edges (method) — The face's edges (seam edges only with ``seams=True``)
  smlibpy.shapes.Face.vertices (method) — All vertices of this shape
  smlibpy.shapes.Face.faces (method) — All faces of this shape
  smlibpy.shapes.Face.neighbors (method) — Faces sharing an edge with this one
  smlibpy.shapes.Face.to_sketch (method) — A sketch holding a copy of this (planar) face
  smlibpy.shapes.Face.to_shell (method) — A sheet body holding a copy of this face
  smlibpy.shapes.Face.extrude (method) — Extrude a planar face along its normal (see :meth:`Sketch.extrude`)
smlibpy.shapes.MassProperties (class) [lines 190-201] [3 members] [category: shapes] — Mass properties of a part
  smlibpy.shapes.MassProperties.__init__ (constructor)
  smlibpy.shapes.MassProperties.principal_moments (property)
  smlibpy.shapes.MassProperties.principal_axes (property)
smlibpy.shapes.Part (class) [lines 203-358] [35 members] [category: shapes] — A solid
  smlibpy.shapes.Part.volume (property)
  smlibpy.shapes.Part.area (property) — Total surface area
  smlibpy.shapes.Part.center (method) — Center of mass (uniform density)
  smlibpy.shapes.Part.mass_properties (method) — Mass, center of mass and inertia tensor for a uniform…
  smlibpy.shapes.Part.is_valid (method) — True if the part is a closed, manifold solid that…
  smlibpy.shapes.Part.solids (method) — The separate bodies of this part
  smlibpy.shapes.Part.merge (method) — This part and others as one part made of cells
  smlibpy.shapes.Part.cells (method) — The cells of a part made by :meth:`merge`, each as…
  smlibpy.shapes.Part.fuse (method) — Union with other parts
  smlibpy.shapes.Part.cut (method) — Subtract other parts
  smlibpy.shapes.Part.intersect (method) — Keep only the volume shared with the other parts
  smlibpy.shapes.Part.__add__ (method)
  smlibpy.shapes.Part.__radd__ (method)
  smlibpy.shapes.Part.__sub__ (method)
  smlibpy.shapes.Part.__and__ (method)
  smlibpy.shapes.Part.fillet (method) — Round edges
  smlibpy.shapes.Part.chamfer (method) — Bevel edges
  smlibpy.shapes.Part.shell (method) — Hollow the part out to walls of ``thickness``, removing the…
  smlibpy.shapes.Part.offset (method) — Grow (positive) or shrink (negative) the part by ``distance`` everywhere
  smlibpy.shapes.Part.split (method) — Cut the part with a plane
  smlibpy.shapes.Part.section (method) — The cross-section of the part in a plane, as a…
  smlibpy.shapes.Part.twist (method) — Twist about an axis (default Z) by ``angle`` degrees over…
  smlibpy.shapes.Part.taper (method) — Scale cross-sections toward an axis (default Z) from 1 to…
  smlibpy.shapes.Part.bend (method) — Bend around an axis by ``angle`` degrees (default
  smlibpy.shapes.Part.deform (method) — Deform with a :class:`smlibpy.Lattice` (same as ``lattice.apply(part)``)
  smlibpy.shapes.Part.remove_fillets (method) — The part with fillets taken out and their edges sharp…
  smlibpy.shapes.Part.remove_faces (method) — The part with ``faces`` (a hole, a boss, a pocket)…
  smlibpy.shapes.Part.draft_analysis (method) — Draft angle of every face for the pull direction, with…
  smlibpy.shapes.Part.parting_line (method) — The closed lines where the part's surface turns from facing…
  smlibpy.shapes.Part.draft (method) — Tilt faces by a draft angle, so that a molded…
  smlibpy.shapes.Part.fold (method) — Fold this sheet along a line on its top or…
  smlibpy.shapes.Part.flange (method) — Add a flange along a straight outer edge of this…
  smlibpy.shapes.Part.bends (method) — The bends of this sheet metal part (see :func:`smlibpy.sheetmetal.bends`)
  smlibpy.shapes.Part.unfold (method) — This sheet metal part unfolded flat (see :func:`smlibpy.unfold`)
  smlibpy.shapes.Part.flat_pattern (method) — The flat pattern of this sheet metal part on XY…
smlibpy.shapes.Shape (class) [lines 360-429] [16 members] [category: shapes] — Base class of all shapes
  smlibpy.shapes.Shape.vertices (method) — All vertices of this shape
  smlibpy.shapes.Shape.edges (method) — All edges of this shape
  smlibpy.shapes.Shape.wires (method) — All wires (closed edge loops of faces, or the shape…
  smlibpy.shapes.Shape.faces (method) — All faces of this shape
  smlibpy.shapes.Shape.moved (method) — A copy of this shape moved by a location (``location…
  smlibpy.shapes.Shape.translate (method) — A copy moved by ``(x, y, z)``
  smlibpy.shapes.Shape.rotate (method) — A copy rotated by ``angle`` degrees about ``axis``
  smlibpy.shapes.Shape.mirror (method) — A mirrored copy (reflection in ``plane``, a plane or a…
  smlibpy.shapes.Shape.scale (method) — A scaled copy
  smlibpy.shapes.Shape.on (method) — Place this shape, designed around the world XY plane, onto…
  smlibpy.shapes.Shape.__rmul__ (method)
  smlibpy.shapes.Shape.bbox (method) — Tight axis-aligned bounding box
  smlibpy.shapes.Shape.center (method) — Center of mass (centroid) of the shape
  smlibpy.shapes.Shape.mesh (method) — Triangulate the shape (see :func:`smlibpy.mesh.tessellate`)
  smlibpy.shapes.Shape.show (method) — Show the shape in the browser viewer (see :func:`smlibpy.show`)
  smlibpy.shapes.Shape.export (method) — Write the shape to a file
smlibpy.shapes.ShapeList (class) [lines 431-643] [54 members] [category: shapes] — A list of shapes with selection helpers
  smlibpy.shapes.ShapeList.one (method) — The only element
  smlibpy.shapes.ShapeList.first (property)
  smlibpy.shapes.ShapeList.last (property)
  smlibpy.shapes.ShapeList.sort_by (method) — Sort by position along an axis, by ``"length"``/``"area"``/``"volume"``/``"radius"``,
  smlibpy.shapes.ShapeList.filter_by (method) — ``parallel_to(axis)``, ``of_type(name)`` or ``filter(predicate)``, depending on the
  smlibpy.shapes.ShapeList.__gt__ (method) — Return self>value
  smlibpy.shapes.ShapeList.__lt__ (method) — Return self<value
  smlibpy.shapes.ShapeList.__rshift__ (method)
  smlibpy.shapes.ShapeList.__lshift__ (method)
  smlibpy.shapes.ShapeList.sort_by_distance (method)
  smlibpy.shapes.ShapeList.group_by (method) — Group shapes with equal key (within ``tol``), groups in ascending…
  smlibpy.shapes.ShapeList.max_by (method) — The shapes with the largest key (all of them, if…
  smlibpy.shapes.ShapeList.min_by (method) — The shapes with the smallest key (all of them, if…
  smlibpy.shapes.ShapeList.top (method) — Highest shapes (largest Z)
  smlibpy.shapes.ShapeList.bottom (method) — Lowest shapes (smallest Z)
  smlibpy.shapes.ShapeList.right (method) — Shapes furthest along +X
  smlibpy.shapes.ShapeList.left (method) — Shapes furthest along -X
  smlibpy.shapes.ShapeList.back (method) — Shapes furthest along +Y
  smlibpy.shapes.ShapeList.front (method) — Shapes furthest along -Y
  smlibpy.shapes.ShapeList.largest (method) — The biggest shape by volume, area or length
  smlibpy.shapes.ShapeList.smallest (method) — The smallest shape by volume, area or length
  smlibpy.shapes.ShapeList.nearest (method) — The shape whose center is closest to ``point``
  smlibpy.shapes.ShapeList.filter (method) — Keep the shapes for which ``predicate(shape)`` is true
  smlibpy.shapes.ShapeList.of_type (method) — Keep shapes of the given geometry types, e.g
  smlibpy.shapes.ShapeList.lines (method) — Straight edges (also straight B-spline edges, such as the edges…
  smlibpy.shapes.ShapeList.circles (method) — Circular edges (full circles and arcs)
  smlibpy.shapes.ShapeList.planar (method) — Planar faces (also flat B-spline faces)
  smlibpy.shapes.ShapeList.cylinders (method) — Cylindrical faces
  smlibpy.shapes.ShapeList.parallel_to (method) — Straight edges along ``axis``, or planar faces whose normal is…
  smlibpy.shapes.ShapeList.perpendicular_to (method) — Straight edges perpendicular to ``axis``, or planar faces containing it
  smlibpy.shapes.ShapeList.facing (method) — Faces whose outward normal points along ``direction`` (within ``max_angle`` degrees)
  smlibpy.shapes.ShapeList.convex (method) — Edges on outside corners (material angle below 180 degrees), and…
  smlibpy.shapes.ShapeList.concave (method) — Edges on inside corners (material angle above 180 degrees), and…
  smlibpy.shapes.ShapeList.smooth (method) — Edges where two faces meet tangentially, such as the borders…
  smlibpy.shapes.ShapeList.fillets (method) — Fillet faces
  smlibpy.shapes.ShapeList.hit_by (method) — The faces (or bodies) of the list that a ray…
  smlibpy.shapes.ShapeList.within (method) — Shapes whose bounding box lies inside ``box``
  smlibpy.shapes.ShapeList.at (method) — Shapes passing through ``point`` (vertices at, edges/faces touching it)
  smlibpy.shapes.ShapeList.__add__ (method) — Return self+value
  smlibpy.shapes.ShapeList.__or__ (method) — Return self|value
  smlibpy.shapes.ShapeList.__sub__ (method)
  smlibpy.shapes.ShapeList.__and__ (method)
  smlibpy.shapes.ShapeList.__getitem__ (method) — Return self[index]
  smlibpy.shapes.ShapeList.vertices (method)
  smlibpy.shapes.ShapeList.edges (method)
  smlibpy.shapes.ShapeList.faces (method)
  smlibpy.shapes.ShapeList.wires (method)
  smlibpy.shapes.ShapeList.center (method) — Average of the members' centers
  smlibpy.shapes.ShapeList.bbox (method)
  smlibpy.shapes.ShapeList.moved (method)
  smlibpy.shapes.ShapeList.on (method) — Every shape placed onto a plane or face (see :meth:`Shape.on`)
  smlibpy.shapes.ShapeList.translate (method)
  smlibpy.shapes.ShapeList.rotate (method)
  smlibpy.shapes.ShapeList.__rmul__ (method) — Return value*self
smlibpy.shapes.Shell (class) [lines 645-662] [4 members] [category: shapes] — A sheet body
  smlibpy.shapes.Shell.area (property)
  smlibpy.shapes.Shell.center (method) — Center of mass (centroid) of the shape
  smlibpy.shapes.Shell.thicken (method) — Turn the sheet into a solid of ``thickness`` (along the…
  smlibpy.shapes.Shell.__add__ (method)
smlibpy.shapes.Sketch (class) [lines 664-730] [15 members] [category: shapes] — A planar region (with holes, possibly several pieces) on a…
  smlibpy.shapes.Sketch.plane (property) — The sketch plane
  smlibpy.shapes.Sketch.__add__ (method)
  smlibpy.shapes.Sketch.__radd__ (method)
  smlibpy.shapes.Sketch.__sub__ (method)
  smlibpy.shapes.Sketch.__and__ (method)
  smlibpy.shapes.Sketch.__xor__ (method)
  smlibpy.shapes.Sketch.center (method) — Area centroid of the region
  smlibpy.shapes.Sketch.perimeter (property) — Total length of the boundary
  smlibpy.shapes.Sketch.offset (method) — Grow (positive ``distance``) or shrink (negative) the region
  smlibpy.shapes.Sketch.fillet (method) — Round corners of the region with tangent arcs of ``radius``
  smlibpy.shapes.Sketch.chamfer (method) — Bevel corners of the region
  smlibpy.shapes.Sketch.mirror (method) — A mirrored copy
  smlibpy.shapes.Sketch.extrude (method) — Extrude the region into a solid
  smlibpy.shapes.Sketch.revolve (method) — Revolve the region about an axis in its plane
  smlibpy.shapes.Sketch.sweep (method) — Sweep the region along a path
smlibpy.shapes.Vertex (class) [lines 732-773] [12 members] [category: shapes] — A point
  smlibpy.shapes.Vertex.__init__ (constructor)
  smlibpy.shapes.Vertex.point (property)
  smlibpy.shapes.Vertex.x (property)
  smlibpy.shapes.Vertex.y (property)
  smlibpy.shapes.Vertex.z (property)
  smlibpy.shapes.Vertex.center (method) — Center of mass (centroid) of the shape
  smlibpy.shapes.Vertex.bbox (method) — Tight axis-aligned bounding box
  smlibpy.shapes.Vertex.vertices (method) — All vertices of this shape
  smlibpy.shapes.Vertex.edges (method) — All edges of this shape
  smlibpy.shapes.Vertex.faces (method) — All faces of this shape
  smlibpy.shapes.Vertex.distance_to (method)
  smlibpy.shapes.Vertex.convexity (property) — For a corner of a sketch
smlibpy.shapes.Wire (class) [lines 775-841] [19 members] [category: shapes] — A chain of edges, open or closed
  smlibpy.shapes.Wire.__init__ (constructor)
  smlibpy.shapes.Wire.edges (method) — All edges of this shape
  smlibpy.shapes.Wire.vertices (method) — All vertices of this shape
  smlibpy.shapes.Wire.wires (method) — All wires (closed edge loops of faces, or the shape…
  smlibpy.shapes.Wire.is_closed (property)
  smlibpy.shapes.Wire.start (property)
  smlibpy.shapes.Wire.end (property)
  smlibpy.shapes.Wire.length (property)
  smlibpy.shapes.Wire.center (method) — Length-weighted average of the edge midpoints
  smlibpy.shapes.Wire.bbox (method) — Tight axis-aligned bounding box
  smlibpy.shapes.Wire.point_at (method) — Point at fraction ``t`` of the total length
  smlibpy.shapes.Wire.tangent_at (method)
  smlibpy.shapes.Wire.distance_to (method)
  smlibpy.shapes.Wire.close (method) — This wire closed with a straight line from its end…
  smlibpy.shapes.Wire.reversed (method)
  smlibpy.shapes.Wire.__add__ (method)
  smlibpy.shapes.Wire.plane (method) — The plane of a planar wire (normal by the right-hand…
  smlibpy.shapes.Wire.fillet (method) — Round the corners between straight edges with tangent arcs (planar…
  smlibpy.shapes.Wire.to_sketch (method) — The planar region bounded by this closed wire

## shapes (2) — `api-shapes-2.md`

smlibpy.shapes._Body (class) [lines 5-82] [18 members] [category: shapes] — A shape backed by one kernel Brep
  smlibpy.shapes._Body.__init__ (constructor)
  smlibpy.shapes._Body.named (method) — The same body with a name (used by exporters and…
  smlibpy.shapes._Body.colored (method) — The same body with a display color (``"steelblue"``, ``"#4682b4"`` or…
  smlibpy.shapes._Body.faces (method) — All faces of this shape
  smlibpy.shapes._Body.edges (method) — All edges
  smlibpy.shapes._Body.vertices (method) — All vertices of this shape
  smlibpy.shapes._Body.wires (method) — All wires (closed edge loops of faces, or the shape…
  smlibpy.shapes._Body.bbox (method) — Tight axis-aligned bounding box
  smlibpy.shapes._Body.distance_to (method) — Minimum distance to a point or to another body
  smlibpy.shapes._Body.closest_point (method)
  smlibpy.shapes._Body.raycast (method) — Where a ray meets this body's faces, nearest first
  smlibpy.shapes._Body.intersection_curves (method) — The curves where this body's surface meets another body's surface,…
  smlibpy.shapes._Body.silhouette (method) — Silhouette curves on the body as seen along ``direction`` (an…
  smlibpy.shapes._Body.project (method) — Project a curve onto the body along ``direction`` (an axis…
  smlibpy.shapes._Body.outline (method) — The body's edges projected onto a plane (a 2D drawing…
  smlibpy.shapes._Body.to_nurbs (method) — A copy whose faces and edges are all NURBS (analytic…
  smlibpy.shapes._Body.heal (method) — Repair gaps, tolerances and topology (mostly needed for imported data)
  smlibpy.shapes._Body.info (method) — Counts and measures in one dictionary

## locations — `api-locations.md`

smlibpy.locations.GridLocations (function) [lines 5-8] [category: locations] — A rectangular grid in the XY plane, centered on the…
smlibpy.locations.HexLocations (function) [lines 10-13] [category: locations] — A honeycomb pattern
smlibpy.locations.Locations (class) [lines 15-36] [5 members] [category: locations] — A list of locations
  smlibpy.locations.Locations.__init__ (constructor)
  smlibpy.locations.Locations.__mul__ (method) — Return self*value
  smlibpy.locations.Locations.__rmul__ (method) — Return value*self
  smlibpy.locations.Locations.on (method) — The pattern placed onto a plane or face
  smlibpy.locations.Locations.points (property)
smlibpy.locations.PolarLocations (function) [lines 38-42] [category: locations] — ``count`` locations on a circle of ``radius`` in the XY…

## _kernel — `api-kernel.md`

smlibpy._kernel.KernelError (class) [lines 5-12] [1 members] [category: _kernel] — An SMLib operation failed
  smlibpy._kernel.KernelError.__init__ (constructor)
smlibpy._kernel.ModelingError (class) [lines 14-17] [category: _kernel] — A modeling operation cannot be done (for example a fillet…

## deform — `api-deform.md`

smlibpy.deform.Lattice (class) [lines 5-62] [13 members] [category: deform] — A grid of control points around a part for free-form…
  smlibpy.deform.Lattice.__init__ (constructor)
  smlibpy.deform.Lattice.counts (property) — Points per direction (X, Y, Z)
  smlibpy.deform.Lattice.box (property) — The box the points started on
  smlibpy.deform.Lattice.rest (property) — The starting positions (read-only)
  smlibpy.deform.Lattice.offsets (property) — How far each point was moved (``points - rest``)
  smlibpy.deform.Lattice.layer (method) — The points of one layer across an axis, as an…
  smlibpy.deform.Lattice.move (method) — Move the selected points by ``offset``
  smlibpy.deform.Lattice.scale (method) — Scale the selected points about ``center`` (default
  smlibpy.deform.Lattice.rotate (method) — Turn the selected points by ``angle`` degrees about ``axis``
  smlibpy.deform.Lattice.reset (method) — Put every point back where it started
  smlibpy.deform.Lattice.copy (method) — An independent copy
  smlibpy.deform.Lattice.map (method) — Where the lattice moves a point
  smlibpy.deform.Lattice.apply (method) — Deform a part (or a shell) with the lattice
smlibpy.deform.bend (function) [lines 64-68] [category: deform] — Bend a part around an axis by ``angle`` degrees, like…
smlibpy.deform.taper (function) [lines 70-74] [category: deform] — Taper a part along an axis
smlibpy.deform.twist (function) [lines 76-80] [category: deform] — Twist a part about an axis by ``angle`` degrees over…

## mesh — `api-mesh.md`

smlibpy.mesh.Mesh (class) [lines 5-46] [12 members] [category: mesh] — An indexed triangle mesh
  smlibpy.mesh.Mesh.__init__ (constructor)
  smlibpy.mesh.Mesh.triangle_normals (property)
  smlibpy.mesh.Mesh.area (property)
  smlibpy.mesh.Mesh.volume (property) — Enclosed volume (meaningful for closed meshes)
  smlibpy.mesh.Mesh.bbox (method)
  smlibpy.mesh.Mesh.center (method)
  smlibpy.mesh.Mesh.raycast (method) — Where a ray meets the mesh's triangles, nearest first (``Hit``
  smlibpy.mesh.Mesh.is_closed (method) — True if every edge of the mesh is shared by…
  smlibpy.mesh.Mesh.__add__ (method)
  smlibpy.mesh.Mesh.__sub__ (method)
  smlibpy.mesh.Mesh.__and__ (method)
  smlibpy.mesh.Mesh.export (method)
smlibpy.mesh.tessellate (function) [lines 48-51] [category: mesh] — Triangulate a shape

## profiles — `api-profiles.md`

smlibpy.profiles.Profile (class) [lines 5-79] [16 members] [category: profiles] — A pen that draws an outline in the XY plane,…
  smlibpy.profiles.Profile.__init__ (constructor)
  smlibpy.profiles.Profile.point (property) — Where the pen is
  smlibpy.profiles.Profile.start (property) — Where the drawing started
  smlibpy.profiles.Profile.heading (property) — The direction the pen moves in, degrees counterclockwise from +X…
  smlibpy.profiles.Profile.line_to (method) — A straight line to a point
  smlibpy.profiles.Profile.line_by (method) — A straight line by an offset from the pen
  smlibpy.profiles.Profile.forward (method) — A straight line along the heading
  smlibpy.profiles.Profile.turn (method) — Turn the heading by ``angle`` degrees (positive
  smlibpy.profiles.Profile.turn_to (method) — Set the heading (degrees counterclockwise from +X) without drawing
  smlibpy.profiles.Profile.arc (method) — A tangent arc of ``radius`` that turns the heading by…
  smlibpy.profiles.Profile.arc_to (method) — An arc to an end point
  smlibpy.profiles.Profile.fillet (method) — Round the corner at the pen with a tangent arc…
  smlibpy.profiles.Profile.chamfer (method) — Bevel the corner at the pen
  smlibpy.profiles.Profile.mirror (method) — Continue with the mirror image of the path drawn so…
  smlibpy.profiles.Profile.close (method) — The region inside the outline, as a Sketch on XY
  smlibpy.profiles.Profile.wire (method) — The path as drawn, as an open Wire of exact…

## step_import — `api-step-import.md`

smlibpy.step_import.StepModel (class) [lines 5-17] [2 members] [category: step_import] — Everything :func:`read_step` reads from a STEP file
  smlibpy.step_import.StepModel.frame (method) — The coordinate system called ``name`` as a :class:`~smlibpy.Plane`
  smlibpy.step_import.StepModel.__init__ (constructor)
smlibpy.step_import.import_step (function) [lines 19-23] [category: step_import] — Read the solids and surfaces of a STEP file (AP203,…
smlibpy.step_import.read_step (function) [lines 25-29] [category: step_import] — Read everything a STEP file holds that smlibpy can use

## other — `api-other.md`

TOLERANCE (constant) [lines 5-6] — 1e-06
X (type) [lines 8-8]
Y (type) [lines 10-10]
Z (type) [lines 12-12]

## text — `api-text.md`

smlibpy.text.Text (function) [lines 5-19] [category: text] — Lettering as a sketch in the XY plane, with the…

## operations — `api-operations.md`

smlibpy.operations.chamfer (function) [lines 5-9] [category: operations] — Bevel edges of the part they belong to (see :meth:`Part.chamfer`),…
smlibpy.operations.extrude (function) [lines 11-15] [category: operations] — Extrude a sketch, a planar face or a closed wire…
smlibpy.operations.fillet (function) [lines 17-21] [category: operations] — Round edges of the part they belong to (see :meth:`Part.fillet`),…
smlibpy.operations.loft (function) [lines 23-29] [category: operations] — A solid through a sequence of cross sections, or a…
smlibpy.operations.merge (function) [lines 31-35] [category: operations] — Parts as one part made of cells
smlibpy.operations.mirror (function) [lines 37-40] [category: operations] — A mirrored copy of a shape
smlibpy.operations.offset (function) [lines 42-46] [category: operations] — Grow or shrink a part or a sketch by ``distance``…
smlibpy.operations.revolve (function) [lines 48-52] [category: operations] — Revolve a sketch about an axis into a solid (see…
smlibpy.operations.section (function) [lines 54-57] [category: operations] — Cross-section of a part (see :meth:`Part.section`)
smlibpy.operations.shell (function) [lines 59-62] [category: operations] — Hollow out a part (see :meth:`Part.shell`)
smlibpy.operations.split (function) [lines 64-67] [category: operations] — Cut a part with a plane (see :meth:`Part.split`)
smlibpy.operations.sweep (function) [lines 69-78] [category: operations] — Sweep a profile along a path
smlibpy.operations.thicken (function) [lines 80-83] [category: operations] — Turn a face or sheet into a solid of ``thickness``

## render — `api-render.md`

smlibpy.render.diff_images (function) [lines 5-12] [category: render] — Compare two pictures of the same size pixel by pixel
smlibpy.render.render (function) [lines 14-43] [category: render] — Render shapes to a PNG image

## exporters — `api-exporters.md`

smlibpy.exporters.export (function) [lines 5-8] [category: exporters] — Write shapes to ``path``
smlibpy.exporters.export_glb (function) [lines 10-14] [category: exporters] — Binary glTF export with colors, names and (optionally) the B-rep…
smlibpy.exporters.export_gltf (function) [lines 16-19] [category: exporters] — glTF export with the buffer embedded as a data URI…
smlibpy.exporters.export_obj (function) [lines 21-24] [category: exporters] — Wavefront OBJ export (one object per part)
smlibpy.exporters.export_step (function) [lines 26-29] [category: exporters] — Exact B-rep export to STEP AP214
smlibpy.exporters.export_stl (function) [lines 31-34] [category: exporters] — Triangle mesh export (binary unless ``ascii``)
smlibpy.exporters.import_stl (function) [lines 36-39] [category: exporters] — Read an STL file (binary or ASCII) as a mesh
smlibpy.exporters.load (function) [lines 41-45] [category: exporters] — Read a file, picking the format from the extension
smlibpy.exporters.save (function) [lines 47-50] [category: exporters] — Write a body to SMLib's native ``.smb`` format (exact and…

## dxf — `api-dxf.md`

smlibpy.dxf.export_dxf (function) [lines 5-13] [category: dxf] — Write sketches, faces, wires and edges to a DXF drawing…
smlibpy.dxf.import_dxf (function) [lines 15-25] [category: dxf] — Read the outlines of a DXF drawing as a sketch
smlibpy.dxf.import_dxf_wires (function) [lines 27-31] [category: dxf] — Every chain of curves of a DXF drawing as a…

## usd — `api-usd.md`

smlibpy.usd.export_usd (function) [lines 5-11] [category: usd] — Write parts, sheets and meshes to a USD file (``.usda``,…
smlibpy.usd.import_usd (function) [lines 13-17] [category: usd] — Read the bodies of the ``BrepArray`` prims of a USD…

## surfaces — `api-surfaces.md`

smlibpy.surfaces.ruled (function) [lines 5-8] [category: surfaces] — The ruled surface between two curves (straight lines join matching…
smlibpy.surfaces.stitch (function) [lines 10-14] [category: surfaces] — Sew faces and sheets along their common edges
smlibpy.surfaces.surface (function) [lines 16-19] [category: surfaces] — A freeform NURBS surface through a grid of points, or…
smlibpy.surfaces.surface_fillet (function) [lines 21-29] [category: surfaces] — A round blend between the surfaces of two faces, as…

## viewer — `api-viewer.md`

smlibpy.viewer.show (function) [lines 5-9] [category: viewer] — Show shapes (parts, sketches, faces, edges, wires, meshes, lists) in…
