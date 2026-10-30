# smlibpy — curves

19 top-level symbols. Signatures are verbatim python.

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
# A conic arc from ``start`` to ``end``, tangent there to the lines toward ``apex`` (the
# Remarks: point where the end tangents meet), with the fullness ``rho`` (0 < rho < 1): the arc passes ``rho`` of the way from the middle of the chord to the apex. 0.5 is a parabola, less an ellipse (flatter), more a hyperbola (closer to the apex). The rho conic of styling: a corner blend whose shape a single number sets. Exact: a rational quadratic B-spline. ``ConicArc((0, 0), (10, 0), (10, 10), 0.4142)`` is nearly the quarter circle of radius 10 (exactly for rho = sqrt(2) - 1).
# smlibpy.curves.ConicArc (function)
ConicArc(start: VectorLike, apex: VectorLike, end: VectorLike, rho: float = 0.5) -> Edge

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
# Remarks: ``direction`` is a vector or an axis (only its direction counts; ``center`` places the helix). ``end_radius`` makes a conical helix; ``pitch`` is the rise per turn. Any number of turns: beyond 120 the helix is fitted in pieces of whole turns, joined into one curve.
# smlibpy.curves.Helix (function)
Helix(pitch: float, height: float, radius: float, *, center: VectorLike = (0, 0, 0), direction: Axis | VectorLike = (0, 0, 1), end_radius: float | None = None, left_handed: bool = False) -> Edge

# Category: curves
# A piece of the hyperbola ``x²/x_radius² - y²/y_radius² = 1``, the branch on the +X side of
# Remarks: ``center`` (in plane coordinates), from ``y = start`` to ``y = end`` (measured from the center along the plane's Y axis). Exact: a rational quadratic B-spline. Its vertex is at ``(x_radius, 0)`` from the center and its asymptotes have the slopes ``±y_radius / x_radius``. ``HyperbolicArc((0, 0), 10, 20, -30, 30)`` revolved about the Y axis is a cooling tower with a waist of radius 10.
# smlibpy.curves.HyperbolicArc (function)
HyperbolicArc(center: VectorLike, x_radius: float, y_radius: float, start: float, end: float, plane: Plane = Plane.XY) -> Edge

# Category: curves
# A straight edge from ``start`` to ``end``
# smlibpy.curves.Line (function)
Line(start: VectorLike, end: VectorLike) -> Edge

# Category: curves
# A piece of the parabola ``y = x² / (4 focal_length)``
# Remarks: coordinates), opening along the plane's Y axis, from ``x = start`` to ``x = end`` (measured from the vertex along the plane's X axis). Exact: a quadratic B-spline. For reflectors, horns and nozzle contours; a negative focal length opens it along -Y. ``ParabolicArc((0, 0), 10, -20, 20)`` runs from (-20, 10) through (0, 0) to (20, 10); its focus is at (0, 10).
# smlibpy.curves.ParabolicArc (function)
ParabolicArc(vertex: VectorLike, focal_length: float, start: float, end: float, plane: Plane = Plane.XY) -> Edge

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
# A flat (Archimedean) spiral around the plane's origin
# Remarks: with the angle from ``start_radius`` to ``end_radius`` over ``turns`` turns. It starts on the plane's X axis and turns counterclockwise seen from the plane's normal (``clockwise=True``: the other way). Either radius may be 0 (a spiral from or to the center). For spiral springs, scroll grooves and coils; a B-spline within 1e-4 of the exact spiral, as :func:`Helix`. Less than a turn with a large change of radius (``Spiral(2, 20, 0.5)``) and very many turns (``Spiral(20, 0, 130)``) are beyond the kernel's approximation: :class:`KernelError`, whose hint says what makes such a curve. ``Spiral(2, 20, 5)`` runs from (2, 0) to (20, 0) in five turns, 9/5 = 3.6 apart.
# smlibpy.curves.Spiral (function)
Spiral(start_radius: float, end_radius: float, turns: float, plane: Plane = Plane.XY, *, clockwise: bool = False) -> Edge

# Category: curves
# A smooth cubic curve through the points
# smlibpy.curves.Spline (function)
Spline(*points: VectorLike, tangents: tuple[VectorLike | None, VectorLike | None] | Sequence[VectorLike] | None = None, closed: bool = False) -> Edge
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
# A smooth curve near many points, with as few control points as keep it within
# Remarks: ``tolerance`` of every one: for scanned or digitized outlines, sampled curves and long polylines, where :func:`Spline` passes through every point, follows every wiggle and needs a control point per point. A least-squares B-spline: it averages noise smaller than the tolerance out instead of following it, and takes more control points (spread evenly over the points) until every point is within the tolerance, measured to the nearest point of the curve. An open curve runs from the first point to the last; where the points run smoothly there and no tangent is given, it leaves them in the points' own direction. Below the points' noise it takes up to a control point per point, and where even that does not keep within the tolerance it raises :class:`ModelingError` with the distance it reached (:func:`Spline` passes through every point).
# smlibpy.curves.fit_curve (function)
fit_curve(points: Sequence[VectorLike] | np.ndarray, *, tolerance: float | None = None, degree: int = 3, tangents: tuple[VectorLike | None, VectorLike | None] | Sequence[VectorLike] | None = None, closed: bool = False) -> Edge

# Category: curves
# Copies of the curves as B-splines of one degree and one knot vector, with the same shapes
# Remarks: their control points correspond one to one, as surfaces through the curves (a loft, a skin) need them in other systems. Lines and arcs become B-splines too (arcs rational ones).
# smlibpy.curves.make_compatible (function)
make_compatible(*edges: Edge | Iterable[Edge]) -> list[Edge]
#   edges: Two or more edges (or lists of them)
