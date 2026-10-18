# smlibpy — curves

14 top-level symbols. Signatures are verbatim python.

# Category: curves
# A Bézier curve (rational if ``weights`` are given) from its control points
# smlibpy.curves.Bezier (function)
Bezier(*control_points: VectorLike, weights: Sequence[float] | None = None) -> Edge

# Category: curves
# An arc around ``center`` starting at ``start_angle`` and spanning ``arc_size`` degrees
# Remarks: (angles counterclockwise from the plane's X axis; a negative ``arc_size`` runs clockwise). ``CenterArc(c, r, 0, 360)`` is a full circle. ``center`` is given in plane coordinates.
# smlibpy.curves.CenterArc (function)
CenterArc(center: VectorLike, radius: float, start_angle: float, arc_size: float, plane: Plane = Plane.XY) -> Edge

# Category: curves
# An ellipse (or elliptical arc) around ``center`` in ``plane``
# Remarks: The angles are ellipse angles in degrees (the point at angle a is ``(x_radius cos a, y_radius sin a)``). The arc runs counterclockwise from ``start_angle`` to ``end_angle``, also across 0 (300 to 60 passes through the X axis); equal angles give the whole ellipse.
# smlibpy.curves.EllipticalArc (function)
EllipticalArc(center: VectorLike, x_radius: float, y_radius: float, start_angle: float = 0.0, end_angle: float = 360.0, plane: Plane = Plane.XY) -> Edge

# Category: curves
# A polyline whose corners are rounded with ``radius``
# smlibpy.curves.FilletPolyline (function)
FilletPolyline(*points: VectorLike, radius: float, close: bool = False) -> Wire

# Category: curves
# A helix around ``direction`` through ``center``
# Remarks: ``direction`` is a vector or an axis (only its direction counts; ``center`` places the helix). ``end_radius`` makes a conical helix; ``pitch`` is the rise per turn.
# smlibpy.curves.Helix (function)
Helix(pitch: float, height: float, radius: float, *, center: VectorLike = (0, 0, 0), direction: Axis | VectorLike = (0, 0, 1), end_radius: float | None = None, left_handed: bool = False) -> Edge

# Category: curves
# A straight edge from ``start`` to ``end``
# smlibpy.curves.Line (function)
Line(start: VectorLike, end: VectorLike) -> Edge

# Category: curves
# A line of ``length`` leaving ``start`` at ``angle`` degrees from the plane's X axis
# smlibpy.curves.PolarLine (function)
PolarLine(start: VectorLike, length: float, angle: float, plane: Plane = Plane.XY) -> Edge

# Category: curves
# Straight segments through the points
# smlibpy.curves.Polyline (function)
Polyline(*points: VectorLike, close: bool = False) -> Wire

# Category: curves
# The shorter arc of ``radius`` from ``start`` to ``end`` in ``plane``
# Remarks: A positive radius bulges to the left of the direction start→end, a negative one to the right.
# smlibpy.curves.RadiusArc (function)
RadiusArc(start: VectorLike, end: VectorLike, radius: float, plane: Plane = Plane.XY) -> Edge

# Category: curves
# An arc from ``start`` to ``end`` whose middle is ``sagitta`` away from the chord
# Remarks: (positive to the left of start→end).
# smlibpy.curves.SagittaArc (function)
SagittaArc(start: VectorLike, end: VectorLike, sagitta: float, plane: Plane = Plane.XY) -> Edge

# Category: curves
# A smooth cubic curve through the points
# smlibpy.curves.Spline (function)
Spline(*points: VectorLike, tangents: tuple[VectorLike | None, VectorLike | None] | None = None, closed: bool = False) -> Edge
#   points: Two or more points
#   tangents: Optional ``(start_tangent, end_tangent)`` directions
#   closed: Make a closed loop (smooth at the join)

# Category: curves
# An arc from ``start`` to ``end`` leaving ``start`` along ``tangent``
# smlibpy.curves.TangentArc (function)
TangentArc(start: VectorLike, end: VectorLike, tangent: VectorLike) -> Edge

# Category: curves
# The circular arc from ``start`` through ``through`` to ``end``
# smlibpy.curves.ThreePointArc (function)
ThreePointArc(start: VectorLike, through: VectorLike, end: VectorLike) -> Edge

# Category: curves
# Copies of the curves as B-splines of one degree and one knot vector, with the same shapes
# Remarks: their control points correspond one to one, as surfaces through the curves (a loft, a skin) need them in other systems. Lines and arcs become B-splines too (arcs rational ones).
# smlibpy.curves.make_compatible (function)
make_compatible(*edges: Edge | Iterable[Edge]) -> list[Edge]
#   edges: Two or more edges (or lists of them)
