# build123d — objects_curve

31 top-level symbols. Signatures are verbatim python.

# Category: objects_curve
# Create an airfoil described by a 4-digit (or fractional) NACA airfoil
# Remarks: (e.g. '2412' or '2213.323'). The NACA four-digit wing sections define the airfoil_code by: - First digit describing maximum camber as percentage of the chord. - Second digit describing the distance of maximum camber from the airfoil leading edge in tenths of the chord. - Last two digits describing maximum thickness of the airfoil as percent of the chord.
# build123d.objects_curve.Airfoil (class)
class Airfoil(BaseLineObject)

  # Parse NACA 4-digit (or fractional) airfoil code into parameters
  # build123d.objects_curve.Airfoil.parse_naca4 (method)
  parse_naca4(value: str | float) -> tuple[float, float, float]

  # build123d.objects_curve.Airfoil.__init__ (constructor)
  Airfoil(airfoil_code: str, n_points: int = 50, finite_te: bool = False, mode: Mode = Mode.ADD)
  #   airfoil_code: str The NACA 4-digit (or fractional) airfoil code (e.g
  #   n_points: int Number of points per upper/lower surface
  #   finite_te: bool If True, enforces a finite trailing edge (default False)
  #   mode: combination mode

  # Camber line of the airfoil as an Edge
  camber_line: Edge

# Category: objects_curve
# Line Object
# Remarks: Create an arc tangent to two arcs and a radius. keep specifies tangent arc position with a Keep pair: (placement, type) - placement: start_arc is tangent INSIDE or OUTSIDE the tangent arc. BOTH is a special case for overlapping arcs with type INSIDE - type: tangent arc is INSIDE or OUTSIDE start_arc and end_arc
# build123d.objects_curve.ArcArcTangentArc (class)
class ArcArcTangentArc(BaseEdgeObject)

  # build123d.objects_curve.ArcArcTangentArc.__init__ (constructor)
  ArcArcTangentArc(start_arc: Curve | Edge | Wire, end_arc: Curve | Edge | Wire, radius: float, side: Side = Side.LEFT, keep: Keep | tuple[Keep, Keep] = (Keep.INSIDE, Keep.INSIDE), short_sagitta: bool = True, mode: Mode = Mode.ADD)
  #   start_arc: starting arc, must be GeomType.CIRCLE
  #   end_arc: ending arc, must be GeomType.CIRCLE
  #   radius: radius of tangent arc
  #   side: side of arcs to place tangent arc center, LEFT or RIGHT
  #   keep: which tangent arc to keep, INSIDE or OUTSIDE
  #   short_sagitta: If True selects the short sagitta (height of arc from chord), else the long sagitta crossing the center
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a straight line tangent to two arcs.
# build123d.objects_curve.ArcArcTangentLine (class)
class ArcArcTangentLine(BaseEdgeObject)

  # build123d.objects_curve.ArcArcTangentLine.__init__ (constructor)
  ArcArcTangentLine(start_arc: Curve | Edge | Wire, end_arc: Curve | Edge | Wire, side: Side = Side.LEFT, keep: Keep = Keep.INSIDE, mode: Mode = Mode.ADD)
  #   start_arc: starting arc, must be GeomType.CIRCLE
  #   end_arc: ending arc, must be GeomType.CIRCLE
  #   side: side of arcs to place tangent arc center, LEFT or RIGHT
  #   keep: which tangent arc to keep, INSIDE or OUTSIDE
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: An exact B-spline edge defined directly from control points and knot data. BSpline creates an exact B-spline from control points, a knot sequence, and optional weights. Control points define the control polygon that pulls the curve, but the curve does not generally pass through them. Knots define the parameter-space structure of the spline: they determine where polynomial spans begin and end and how smoothly those spans join. Repeated knot values indicate knot multiplicity. For a spline of degree p, a knot with multiplicity m has continuity C^(p-m) at that location, so increasing multiplicity reduces smoothness. Repeating the first and last knots degree + 1 times creates a clamped spline that starts and ends at the first and last control points. Optional weights create a rational B-spline, allowing some control points to pull more strongly than others and enabling exact representation of conic sections.` Unlike :class:`~build123d.objects_curve.Spline`, which creates an interpolated curve through a set of points using ``GeomAPI_Interpolate``, ``BSpline`` preserves the supplied spline definition by building the underlying OCCT ``Geom_BSplineCurve`` from its poles, knot vector, optional weights, degree, and periodic flag.
# build123d.objects_curve.BSpline (class)
class BSpline(BaseEdgeObject)

  # build123d.objects_curve.BSpline.__init__ (constructor)
  BSpline(control_points: Iterable[VectorLike], knots: Iterable[float], degree: int, weights: Iterable[float] | None = None, periodic: bool = False, mode: Mode = Mode.ADD)
  #   control_points: Control points (poles) defining the spline shape
  #   knots: Knot sequence for the spline
  #   degree: Polynomial degree of the spline
  #   weights: Optional per-control-point weights for rational B-splines
  #   periodic: Whether to create a periodic spline
  #   mode: Builder combination mode

# Category: objects_curve
# BaseLineObject specialized for Wire
# build123d.objects_curve.BaseLineObject (class)
class BaseLineObject(Wire)

  # build123d.objects_curve.BaseLineObject.__init__ (constructor)
  BaseLineObject(curve: Wire, mode: Mode = Mode.ADD)
  #   curve: wire to create
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a non-rational bezier curve defined by a sequence of points and include optional weights to create a rational bezier curve. The number of weights must match the number of control points.
# build123d.objects_curve.Bezier (class)
class Bezier(BaseEdgeObject)

  # build123d.objects_curve.Bezier.__init__ (constructor)
  Bezier(*cntl_pnts: VectorLike, weights: list[float] | None = None, mode: Mode = Mode.ADD)
  #   cntl_pnts: points defining the curve
  #   weights: control point weights
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a smooth Bézier-based transition curve between two existing edges. The blend is constructed as a cubic (C1) or quintic (C2) Bézier curve whose control points are determined from the position, first derivative, and (for C2) second derivative of the input curves at the chosen endpoints. Optional scalar multipliers can be applied to the endpoint tangents to control the "tension" of the blend. Example: >>> blend = BlendCurve(curve_a, curve_b, ContinuityLevel.C1, tangent_scalars=(1.2, 0.8)) >>> show(blend)
# Throws: ValueError: `tangent_scalars` must be a pair of float values.
# Throws: ValueError: If specified `end_points` are not coincident with the start
# Throws: or end of their respective curves.
# build123d.objects_curve.BlendCurve (class)
class BlendCurve(BaseEdgeObject)

  # build123d.objects_curve.BlendCurve.__init__ (constructor)
  BlendCurve(curve0: Edge, curve1: Edge, continuity: ContinuityLevel = ContinuityLevel.C2, end_points: tuple[VectorLike, VectorLike] | None = None, tangent_scalars: tuple[float, float] | None = None, mode: Mode = Mode.ADD)
  #   curve0: First curve to blend from
  #   curve1: Second curve to blend to
  #   continuity: Desired geometric continuity at the join
  #   end_points: Pair of points specifying the connection points on `curve0` and `curve1`
  #   tangent_scalars: Scalar multipliers applied to the first derivatives at the start of `curve0` and the end of `curve1` before computing control points
  #   mode: Boolean operation mode when used in a BuildLine context

# Category: objects_curve
# Line Object
# Remarks: Create a circular arc defined by a center point and radius.
# build123d.objects_curve.CenterArc (class)
class CenterArc(BaseEdgeObject)

  # build123d.objects_curve.CenterArc.__init__ (constructor)
  CenterArc(center: VectorLike, radius: float, start_angle: float, arc_size: float | Shape | Axis | Location | Plane | VectorLike, mode: Mode = Mode.ADD) -> None
  #   center: center point of arc
  #   radius: arc radius
  #   start_angle: arc starting angle from x-axis
  #   arc_size: angular size of arc or an arc limit
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: The result is always a Curve containing one or more Edges. If you need to access Edge-specific properties or methods (such as ``arc_center``), extract the edge or edges first:: result = ConstrainedArcs(...) arc = result.edge() # extract the Edge center = arc.arc_center # now Edge methods are available Note that in Builder mode the ``selector`` parameter must be provided or all results will be combined into the BuildLine context. In Algebra mode the selector can be applied as a parameter or in the normal way to the ConstrainedArcs object. The content of the selector is the same in both cases. Examples: An arc built from three edge constraints. Algebra:: l4 = PolarLine((0, 0), 4, 60) l5 = PolarLine((0, 0), 4, 40) a3 = CenterArc((0, 0), 4, 0, 90) ex_a3 = ( ConstrainedArcs(l4, l5, a3, sagitta=Sagitta.BOTH).edges().sort_by(Edge.length)[0] ) Builder:: with BuildLine() as arc_ex3: l4 = PolarLine((0, 0), 4, 60) l5 = PolarLine((0, 0), 4, 40) a3 = CenterArc((0, 0), 4, 0, 90) ex_a3 = ConstrainedArcs( l4, l5, a3, sagitta=Sagitta.BOTH, selector=lambda arcs: arcs.sort_by(Edge.length)[0], )
# build123d.objects_curve.ConstrainedArcs (class)
class ConstrainedArcs(BaseCurveObject)

  # build123d.objects_curve.ConstrainedArcs.__init__ (constructor)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, tangency_two: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, *, radius: float, sagitta: Sagitta = Sagitta.SHORT, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, tangency_two: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, *, center_on: Axis | Edge, sagitta: Sagitta = Sagitta.SHORT, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, tangency_two: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, tangency_three: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, *, sagitta: Sagitta = Sagitta.SHORT, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, *, center: VectorLike, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, *, radius: float, center_on: Edge, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  #   radius: arc radius
  #   sagitta: returned arc selector (i.e
  #   selector: typically a lambda which chooses one or more of the results
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: The result is always a Curve containing one or more Edges. If you need to access Edge-specific properties or methods (such as ``length``), extract the edge or edges first:: result = ConstrainedLines(...) lines = result.edges() # extract the Edges length = lines[1].length # now Edge methods are available Note that in Builder mode the ``selector`` parameter must be provided or all results will be combined into the BuildLine context. In Algebra mode the selector can be applied as a parameter or in the normal way to the ConstrainedArcs object. The content of the selector is the same in both cases.
# build123d.objects_curve.ConstrainedLines (class)
class ConstrainedLines(BaseCurveObject)

  # Create planar line(s) on XY subject to tangency/contact constraints
  # Remarks: Supported cases --------------- 1. Tangent to two curves 2. Tangent to one curve and passing through a given point
  # build123d.objects_curve.ConstrainedLines.__init__ (constructor)
  ConstrainedLines(tangency_one: tuple[Edge, Tangency] | Axis | Edge, tangency_two: tuple[Edge, Tangency] | Axis | Edge, *, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda lines: lines, mode: Mode = Mode.ADD)
  ConstrainedLines(tangency_one: tuple[Edge, Tangency] | Edge, tangency_two: VectorLike, *, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda lines: lines, mode: Mode = Mode.ADD)
  ConstrainedLines(tangency_one: tuple[Edge, Tangency] | Edge, tangency_two: Axis, *, angle: float | None = None, direction: VectorLike | None = None, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda lines: lines, mode: Mode = Mode.ADD)
  #   selector: typically a lambda which chooses one or more of the results
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a circular arc defined by a point/tangent pair and another line find a tangent to. The arc specified with TOP or BOTTOM depends on the geometry and isn't predictable. Contains a solver.
# Throws: RunTimeError: no double tangent arcs found
# build123d.objects_curve.DoubleTangentArc (class)
class DoubleTangentArc(BaseEdgeObject)

  # build123d.objects_curve.DoubleTangentArc.__init__ (constructor)
  DoubleTangentArc(pnt: VectorLike, tangent: VectorLike, other: Curve | Edge | Wire, keep: Keep = Keep.TOP, mode: Mode = Mode.ADD)
  #   pnt: start point
  #   tangent: tangent at start point
  #   other: line object to tangent
  #   keep: specify which arc if more than one, TOP or BOTTOM
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create an elliptical arc defined by a center point, x- and y- radii.
# build123d.objects_curve.EllipticalCenterArc (class)
class EllipticalCenterArc(BaseEdgeObject)

  # build123d.objects_curve.EllipticalCenterArc.__init__ (constructor)
  EllipticalCenterArc(center: VectorLike, x_radius: float, y_radius: float, start_angle: float = 0.0, end_angle: float | None = None, *, arc_size: float | Shape | Axis | Location | Plane | VectorLike = 90.0, rotation: float = 0.0, angular_direction: AngularDirection | None = None, mode: Mode = Mode.ADD) -> None
  #   center: ellipse center
  #   x_radius: x radius of the ellipse (along the x-axis of plane)
  #   y_radius: y radius of the ellipse (along the y-axis of plane)
  #   start_angle: arc start angle from x-axis
  #   end_angle: arc end angle from x-axis
  #   arc_size: angular size of arc (negative to change direction) or an arc limit
  #   rotation: angle to rotate arc
  #   angular_direction: arc direction
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a circular arc defined by a start point/tangent pair, radius and arc size. Note: One of start_angle or major_axis_dir must be provided.
# build123d.objects_curve.EllipticalStartArc (class)
class EllipticalStartArc(BaseEdgeObject)

  # build123d.objects_curve.EllipticalStartArc.__init__ (constructor)
  EllipticalStartArc(start_pnt: VectorLike, start_tangent: VectorLike, x_radius: float, y_radius: float, arc_size: float, *, start_angle: float | None = None, major_axis_dir: VectorLike | None = None, mode: Mode = Mode.ADD)
  #   start_pnt: start point
  #   start_tangent: tangent at start point
  #   x_radius: x radius of the ellipse (along the x-axis of plane)
  #   y_radius: y radius of the ellipse (along the y-axis of plane)
  #   arc_size: angular size of arc (negative to change direction)
  #   start_angle: angular position of the start point
  #   major_axis_dir: direction of ellipse x-axis
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a sequence of straight lines defined by successive points that are filleted to a given radius.
# Throws: ValueError: Two or more points not provided
# Throws: ValueError: radius must be non-negative
# build123d.objects_curve.FilletPolyline (class)
class FilletPolyline(BaseLineObject)

  # build123d.objects_curve.FilletPolyline.__init__ (constructor)
  FilletPolyline(*pts: VectorLike | Iterable[VectorLike], radius: float | Iterable[float], close: bool = False, mode: Mode = Mode.ADD)
  #   pts: sequence of two or more points
  #   radius: radius to fillet at each vertex or a single value for all vertices
  #   close: close end points with extra Edge and corner fillets
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a helix defined by pitch, height, and radius. The helix may have a taper defined by cone_angle. If cone_angle is not 0, radius is the initial helix radius at center. cone_angle > 0 increases the final radius. cone_angle < 0 decreases the final radius.
# build123d.objects_curve.Helix (class)
class Helix(BaseEdgeObject)

  # build123d.objects_curve.Helix.__init__ (constructor)
  Helix(pitch: float, height: float, radius: float, center: VectorLike = (0, 0, 0), direction: VectorLike = (0, 0, 1), cone_angle: float = 0, lefthand: bool = False, mode: Mode = Mode.ADD)
  #   pitch: distance between loops
  #   height: helix height
  #   radius: helix radius
  #   center: center point
  #   direction: direction of central axis
  #   cone_angle: conical angle from direction
  #   lefthand: left handed helix
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a hyperbolic arc defined by a center point and focal length (distance from focus to vertex).
# build123d.objects_curve.HyperbolicCenterArc (class)
class HyperbolicCenterArc(BaseEdgeObject)

  # build123d.objects_curve.HyperbolicCenterArc.__init__ (constructor)
  HyperbolicCenterArc(center: VectorLike, x_radius: float, y_radius: float, start_angle: float = 0.0, end_angle: float | None = None, *, arc_size: float | Shape | Axis | Location | Plane | VectorLike = 90.0, rotation: float = 0.0, angular_direction: AngularDirection | None = None, mode: Mode = Mode.ADD)
  #   center: hyperbola center
  #   x_radius: x radius of the ellipse (along the x-axis of plane)
  #   y_radius: y radius of the ellipse (along the y-axis of plane)
  #   start_angle: arc start angle from x-axis
  #   end_angle: arc end angle from x-axis
  #   arc_size: angular size of arc (negative to change direction) or an arc limit
  #   rotation: angle to rotate arc
  #   angular_direction: arc direction
  #   mode: combination mode

# Category: objects_curve
# Intersecting Line Object
# Remarks: Create a straight line defined by a point/direction pair and another line to intersect.
# build123d.objects_curve.IntersectingLine (class)
class IntersectingLine(BaseEdgeObject)

  # build123d.objects_curve.IntersectingLine.__init__ (constructor)
  IntersectingLine(start: VectorLike, direction: VectorLike, other: Curve | Edge | Wire, mode: Mode = Mode.ADD)
  #   start: start point
  #   direction: direction to make line
  #   other: line object to intersect
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a circular arc defined by a start point/tangent pair, radius and arc size or arc limit. Attributes: start (Vector): start point end_of_arc (Vector): end point of arc center_point (Vector): center of arc
# build123d.objects_curve.JernArc (class)
class JernArc(BaseEdgeObject)

  # build123d.objects_curve.JernArc.__init__ (constructor)
  JernArc(start: VectorLike, tangent: VectorLike, radius: float, arc_size: float | Shape | Axis | Location | Plane | VectorLike, mode: Mode = Mode.ADD)
  #   start: start point
  #   tangent: tangent at start point
  #   radius: arc radius
  #   arc_size: angular size of arc (negative to change direction) or an arc limit
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a straight line defined by two points.
# Throws: ValueError: Two point not provided
# build123d.objects_curve.Line (class)
class Line(BaseEdgeObject)

  # build123d.objects_curve.Line.__init__ (constructor)
  Line(*pts: VectorLike | Iterable[VectorLike], mode: Mode = Mode.ADD)
  #   pts: sequence of two points
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a parabolic arc defined by a vertex point and focal length (distance from focus to vertex).
# build123d.objects_curve.ParabolicCenterArc (class)
class ParabolicCenterArc(BaseEdgeObject)

  # build123d.objects_curve.ParabolicCenterArc.__init__ (constructor)
  ParabolicCenterArc(vertex: VectorLike, focal_length: float, start_angle: float = 0.0, end_angle: float | None = None, *, arc_size: float | Shape | Axis | Location | Plane | VectorLike = 90.0, rotation: float = 0.0, angular_direction: AngularDirection | None = None, mode: Mode = Mode.ADD)
  #   vertex: parabola vertex
  #   focal_length: focal length the parabola (distance from the vertex to focus along the x-axis of plane)
  #   start_angle: arc start angle
  #   end_angle: arc end angle
  #   arc_size: angular size of arc (negative to change direction) or an arc limit
  #   rotation: angle to rotate arc
  #   angular_direction: arc direction
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create an arc defined by a point/tangent pair and another line which the other end is tangent to.
# Throws: ValueError: Arc must have GeomType.CIRCLE
# Throws: ValueError: Point is already tangent to arc
# Throws: RuntimeError: No tangent arc found
# build123d.objects_curve.PointArcTangentArc (class)
class PointArcTangentArc(BaseEdgeObject)

  # build123d.objects_curve.PointArcTangentArc.__init__ (constructor)
  PointArcTangentArc(point: VectorLike, direction: VectorLike, arc: Curve | Edge | Wire, side: Side = Side.LEFT, mode: Mode = Mode.ADD)
  #   point: starting point of tangent arc
  #   direction: direction at starting point of tangent arc
  #   arc: ending arc, must be GeomType.CIRCLE
  #   side: select which arc to keep Defaults to Side.LEFT
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a straight, tangent line from a point to a circular arc.
# build123d.objects_curve.PointArcTangentLine (class)
class PointArcTangentLine(BaseEdgeObject)

  # build123d.objects_curve.PointArcTangentLine.__init__ (constructor)
  PointArcTangentLine(point: VectorLike, arc: Curve | Edge | Wire, side: Side = Side.LEFT, mode: Mode = Mode.ADD)
  #   point: intersection point for tangent
  #   arc: circular arc to tangent, must be GeomType.CIRCLE
  #   side: side of arcs to place tangent arc center, LEFT or RIGHT
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a straight line defined by a start point, length, and angle. The length can specify the DIAGONAL, HORIZONTAL, or VERTICAL component of the triangle defined by the angle. Alternatively, the length parameter can contain a limit to the length of the line in the form of another object. If the PolarLine doesn't contact the limit an error will be generated. Example: p = PolarLine(start=(2, 0), length=Axis.Y, angle=135)
# Throws: ValueError: Either angle or direction must be provided
# Throws: ValueError: Polar line doesn't intersect length limit
# build123d.objects_curve.PolarLine (class)
class PolarLine(BaseEdgeObject)

  # build123d.objects_curve.PolarLine.__init__ (constructor)
  PolarLine(start: VectorLike, length: float | Shape | Axis | Location | Plane | VectorLike, angle: float | None = None, direction: VectorLike | None = None, length_mode: LengthMode = LengthMode.DIAGONAL, mode: Mode = Mode.ADD)
  #   start: start point
  #   length: line length (float) or limit limit
  #   angle: angle from the local x-axis
  #   direction: vector direction to determine angle
  #   length_mode: how length defines the line
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a sequence of straight lines defined by successive points.
# Throws: ValueError: Two or more points not provided
# build123d.objects_curve.Polyline (class)
class Polyline(BaseLineObject)

  # build123d.objects_curve.Polyline.__init__ (constructor)
  Polyline(*pts: VectorLike | Iterable[VectorLike], close: bool = False, mode: Mode = Mode.ADD)
  #   pts: sequence of two or more points
  #   close: close by generating an extra Edge
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a circular arc defined by two points and a radius.
# Throws: ValueError: Insufficient radius to connect end points
# build123d.objects_curve.RadiusArc (class)
class RadiusArc(BaseEdgeObject)

  # build123d.objects_curve.RadiusArc.__init__ (constructor)
  RadiusArc(start_point: VectorLike, end_point: VectorLike, radius: float, short_sagitta: bool = True, mode: Mode = Mode.ADD)
  #   start_point: start point
  #   end_point: end point
  #   radius: arc radius
  #   short_sagitta: If True selects the short sagitta (height of arc from chord), else the long sagitta crossing the center
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a circular arc defined by two points and the sagitta (height of the arc from chord).
# build123d.objects_curve.SagittaArc (class)
class SagittaArc(BaseEdgeObject)

  # build123d.objects_curve.SagittaArc.__init__ (constructor)
  SagittaArc(start_point: VectorLike, end_point: VectorLike, sagitta: float, mode: Mode = Mode.ADD)
  #   start_point: start point
  #   end_point: end point
  #   sagitta: arc height from chord between points
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a spline defined by a sequence of points, optionally constrained by tangents. Tangents and tangent scalars must have length of 2 for only the end points or a length of the number of points.
# build123d.objects_curve.Spline (class)
class Spline(BaseEdgeObject)

  # build123d.objects_curve.Spline.__init__ (constructor)
  Spline(*pts: VectorLike | Iterable[VectorLike], tangents: Iterable[VectorLike] | None = None, tangent_scalars: Iterable[float] | None = None, periodic: bool = False, mode: Mode = Mode.ADD)
  #   pts: sequence of two or more points
  #   tangents: tangent directions
  #   tangent_scalars: tangent scales
  #   periodic: make the spline periodic (closed)
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a circular arc defined by two points and a tangent.
# Throws: ValueError: Two points are required
# build123d.objects_curve.TangentArc (class)
class TangentArc(BaseEdgeObject)

  # build123d.objects_curve.TangentArc.__init__ (constructor)
  TangentArc(*pts: VectorLike | Iterable[VectorLike], tangent: VectorLike, tangent_from_first: bool = True, mode: Mode = Mode.ADD)
  #   pts: sequence of two points
  #   tangent: tangent to constrain arc
  #   tangent_from_first: apply tangent to first point
  #   mode: combination mode

# Category: objects_curve
# Line Object
# Remarks: Create a circular arc defined by three points.
# Throws: ValueError: Three points must be provided
# build123d.objects_curve.ThreePointArc (class)
class ThreePointArc(BaseEdgeObject)

  # build123d.objects_curve.ThreePointArc.__init__ (constructor)
  ThreePointArc(*pts: VectorLike | Iterable[VectorLike], mode: Mode = Mode.ADD)
  #   pts: sequence of three points
  #   mode: combination mode

# Category: objects_curve
# BaseEdgeObject specialized for Edge
# build123d.objects_curve.BaseEdgeObject (class)
class BaseEdgeObject(Edge)

  # build123d.objects_curve.BaseEdgeObject.__init__ (constructor)
  BaseEdgeObject(curve: Edge, mode: Mode = Mode.ADD)
  #   curve: edge to create
  #   mode: combination mode

# Category: objects_curve
# BaseCurveObject specialized for Curve
# build123d.objects_curve.BaseCurveObject (class)
class BaseCurveObject(Curve)

  # build123d.objects_curve.BaseCurveObject.__init__ (constructor)
  BaseCurveObject(curve: Curve, mode: Mode = Mode.ADD)
  #   curve: wire to create
  #   mode: combination mode
