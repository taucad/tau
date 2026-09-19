# build123d — objects_curve

31 top-level symbols. Signatures are verbatim python.

// Create an airfoil described by a 4-digit (or fractional) NACA airfoil
Airfoil

  // Parse NACA 4-digit (or fractional) airfoil code into parameters
  parse_naca4(value: str | float) -> tuple[float, float, float]

  Airfoil(airfoil_code: str, n_points: int = 50, finite_te: bool = False, mode: Mode = Mode.ADD)
  //   airfoil_code: str The NACA 4-digit (or fractional) airfoil code (e.g
  //   n_points: int Number of points per upper/lower surface
  //   finite_te: bool If True, enforces a finite trailing edge (default False)
  //   mode: combination mode

  // Camber line of the airfoil as an Edge
  camber_line: Edge

// Line Object
ArcArcTangentArc

  ArcArcTangentArc(start_arc: Curve | Edge | Wire, end_arc: Curve | Edge | Wire, radius: float, side: Side = Side.LEFT, keep: Keep | tuple[Keep, Keep] = (Keep.INSIDE, Keep.INSIDE), short_sagitta: bool = True, mode: Mode = Mode.ADD)
  //   start_arc: starting arc, must be GeomType.CIRCLE
  //   end_arc: ending arc, must be GeomType.CIRCLE
  //   radius: radius of tangent arc
  //   side: side of arcs to place tangent arc center, LEFT or RIGHT
  //   keep: which tangent arc to keep, INSIDE or OUTSIDE
  //   short_sagitta: If True selects the short sagitta (height of arc from chord), else the long sagitta crossing the center
  //   mode: combination mode

// Line Object
ArcArcTangentLine

  ArcArcTangentLine(start_arc: Curve | Edge | Wire, end_arc: Curve | Edge | Wire, side: Side = Side.LEFT, keep: Keep = Keep.INSIDE, mode: Mode = Mode.ADD)
  //   start_arc: starting arc, must be GeomType.CIRCLE
  //   end_arc: ending arc, must be GeomType.CIRCLE
  //   side: side of arcs to place tangent arc center, LEFT or RIGHT
  //   keep: which tangent arc to keep, INSIDE or OUTSIDE
  //   mode: combination mode

// Line Object
BSpline

  BSpline(control_points: Iterable[VectorLike], knots: Iterable[float], degree: int, weights: Iterable[float] | None = None, periodic: bool = False, mode: Mode = Mode.ADD)
  //   control_points: Control points (poles) defining the spline shape
  //   knots: Knot sequence for the spline
  //   degree: Polynomial degree of the spline
  //   weights: Optional per-control-point weights for rational B-splines
  //   periodic: Whether to create a periodic spline
  //   mode: Builder combination mode

// BaseCurveObject specialized for Curve
BaseCurveObject

  BaseCurveObject(curve: Curve, mode: Mode = Mode.ADD)
  //   curve: wire to create
  //   mode: combination mode

// BaseEdgeObject specialized for Edge
BaseEdgeObject

  BaseEdgeObject(curve: Edge, mode: Mode = Mode.ADD)
  //   curve: edge to create
  //   mode: combination mode

// BaseLineObject specialized for Wire
BaseLineObject

  BaseLineObject(curve: Wire, mode: Mode = Mode.ADD)
  //   curve: wire to create
  //   mode: combination mode

// Line Object
Bezier

  Bezier(*cntl_pnts: VectorLike, weights: list[float] | None = None, mode: Mode = Mode.ADD)
  //   cntl_pnts: points defining the curve
  //   weights: control point weights
  //   mode: combination mode

// Line Object
BlendCurve

  BlendCurve(curve0: Edge, curve1: Edge, continuity: ContinuityLevel = ContinuityLevel.C2, end_points: tuple[VectorLike, VectorLike] | None = None, tangent_scalars: tuple[float, float] | None = None, mode: Mode = Mode.ADD)
  //   curve0: First curve to blend from
  //   curve1: Second curve to blend to
  //   continuity: Desired geometric continuity at the join
  //   end_points: Pair of points specifying the connection points on `curve0` and `curve1`
  //   tangent_scalars: Scalar multipliers applied to the first derivatives at the start of `curve0` and the end of `curve1` before computing control points
  //   mode: Boolean operation mode when used in a BuildLine context

// Line Object
CenterArc

  CenterArc(center: VectorLike, radius: float, start_angle: float, arc_size: float | Shape | Axis | Location | Plane | VectorLike, mode: Mode = Mode.ADD) -> None
  //   center: center point of arc
  //   radius: arc radius
  //   start_angle: arc starting angle from x-axis
  //   arc_size: angular size of arc or an arc limit
  //   mode: combination mode

// Line Object
ConstrainedArcs

  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, tangency_two: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, radius: float, sagitta: Sagitta = Sagitta.SHORT, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, tangency_two: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, center_on: Axis | Edge, sagitta: Sagitta = Sagitta.SHORT, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, tangency_two: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, tangency_three: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, sagitta: Sagitta = Sagitta.SHORT, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, center: VectorLike, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  ConstrainedArcs(tangency_one: tuple[Axis | Edge, Tangency] | Axis | Edge | Vertex | VectorLike, radius: float, center_on: Edge, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda arcs: arcs, mode: Mode = Mode.ADD)
  //   radius: arc radius
  //   sagitta: returned arc selector (i.e
  //   selector: typically a lambda which chooses one or more of the results
  //   mode: combination mode

// Line Object
ConstrainedLines

  // Create planar line(s) on XY subject to tangency/contact constraints
  ConstrainedLines(tangency_one: tuple[Edge, Tangency] | Axis | Edge, tangency_two: tuple[Edge, Tangency] | Axis | Edge, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda lines: lines, mode: Mode = Mode.ADD)
  ConstrainedLines(tangency_one: tuple[Edge, Tangency] | Edge, tangency_two: VectorLike, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda lines: lines, mode: Mode = Mode.ADD)
  ConstrainedLines(tangency_one: tuple[Edge, Tangency] | Edge, tangency_two: Axis, angle: float | None = None, direction: VectorLike | None = None, selector: Callable[[ShapeList[Edge]], Edge | ShapeList[Edge]] = lambda lines: lines, mode: Mode = Mode.ADD)
  //   selector: typically a lambda which chooses one or more of the results
  //   mode: combination mode

// Line Object
DoubleTangentArc

  DoubleTangentArc(pnt: VectorLike, tangent: VectorLike, other: Curve | Edge | Wire, keep: Keep = Keep.TOP, mode: Mode = Mode.ADD)
  //   pnt: start point
  //   tangent: tangent at start point
  //   other: line object to tangent
  //   keep: specify which arc if more than one, TOP or BOTTOM
  //   mode: combination mode

// Line Object
EllipticalCenterArc

  EllipticalCenterArc(center: VectorLike, x_radius: float, y_radius: float, start_angle: float = 0.0, end_angle: float | None = None, arc_size: float | Shape | Axis | Location | Plane | VectorLike = 90.0, rotation: float = 0.0, angular_direction: AngularDirection | None = None, mode: Mode = Mode.ADD) -> None
  //   center: ellipse center
  //   x_radius: x radius of the ellipse (along the x-axis of plane)
  //   y_radius: y radius of the ellipse (along the y-axis of plane)
  //   start_angle: arc start angle from x-axis
  //   end_angle: arc end angle from x-axis
  //   arc_size: angular size of arc (negative to change direction) or an arc limit
  //   rotation: angle to rotate arc
  //   angular_direction: arc direction
  //   mode: combination mode

// Line Object
EllipticalStartArc

  EllipticalStartArc(start_pnt: VectorLike, start_tangent: VectorLike, x_radius: float, y_radius: float, arc_size: float, start_angle: float | None = None, major_axis_dir: VectorLike | None = None, mode: Mode = Mode.ADD)
  //   start_pnt: start point
  //   start_tangent: tangent at start point
  //   x_radius: x radius of the ellipse (along the x-axis of plane)
  //   y_radius: y radius of the ellipse (along the y-axis of plane)
  //   arc_size: angular size of arc (negative to change direction)
  //   start_angle: angular position of the start point
  //   major_axis_dir: direction of ellipse x-axis
  //   mode: combination mode

// Line Object
FilletPolyline

  FilletPolyline(*pts: VectorLike | Iterable[VectorLike], radius: float | Iterable[float], close: bool = False, mode: Mode = Mode.ADD)
  //   pts: sequence of two or more points
  //   radius: radius to fillet at each vertex or a single value for all vertices
  //   close: close end points with extra Edge and corner fillets
  //   mode: combination mode

// Line Object
Helix

  Helix(pitch: float, height: float, radius: float, center: VectorLike = (0, 0, 0), direction: VectorLike = (0, 0, 1), cone_angle: float = 0, lefthand: bool = False, mode: Mode = Mode.ADD)
  //   pitch: distance between loops
  //   height: helix height
  //   radius: helix radius
  //   center: center point
  //   direction: direction of central axis
  //   cone_angle: conical angle from direction
  //   lefthand: left handed helix
  //   mode: combination mode

// Line Object
HyperbolicCenterArc

  HyperbolicCenterArc(center: VectorLike, x_radius: float, y_radius: float, start_angle: float = 0.0, end_angle: float | None = None, arc_size: float | Shape | Axis | Location | Plane | VectorLike = 90.0, rotation: float = 0.0, angular_direction: AngularDirection | None = None, mode: Mode = Mode.ADD)
  //   center: hyperbola center
  //   x_radius: x radius of the ellipse (along the x-axis of plane)
  //   y_radius: y radius of the ellipse (along the y-axis of plane)
  //   start_angle: arc start angle from x-axis
  //   end_angle: arc end angle from x-axis
  //   arc_size: angular size of arc (negative to change direction) or an arc limit
  //   rotation: angle to rotate arc
  //   angular_direction: arc direction
  //   mode: combination mode

// Intersecting Line Object
IntersectingLine

  IntersectingLine(start: VectorLike, direction: VectorLike, other: Curve | Edge | Wire, mode: Mode = Mode.ADD)
  //   start: start point
  //   direction: direction to make line
  //   other: line object to intersect
  //   mode: combination mode

// Line Object
JernArc

  JernArc(start: VectorLike, tangent: VectorLike, radius: float, arc_size: float | Shape | Axis | Location | Plane | VectorLike, mode: Mode = Mode.ADD)
  //   start: start point
  //   tangent: tangent at start point
  //   radius: arc radius
  //   arc_size: angular size of arc (negative to change direction) or an arc limit
  //   mode: combination mode

// Line Object
Line

  Line(*pts: VectorLike | Iterable[VectorLike], mode: Mode = Mode.ADD)
  //   pts: sequence of two points
  //   mode: combination mode

// Line Object
ParabolicCenterArc

  ParabolicCenterArc(vertex: VectorLike, focal_length: float, start_angle: float = 0.0, end_angle: float | None = None, arc_size: float | Shape | Axis | Location | Plane | VectorLike = 90.0, rotation: float = 0.0, angular_direction: AngularDirection | None = None, mode: Mode = Mode.ADD)
  //   vertex: parabola vertex
  //   focal_length: focal length the parabola (distance from the vertex to focus along the x-axis of plane)
  //   start_angle: arc start angle
  //   end_angle: arc end angle
  //   arc_size: angular size of arc (negative to change direction) or an arc limit
  //   rotation: angle to rotate arc
  //   angular_direction: arc direction
  //   mode: combination mode

// Line Object
PointArcTangentArc

  PointArcTangentArc(point: VectorLike, direction: VectorLike, arc: Curve | Edge | Wire, side: Side = Side.LEFT, mode: Mode = Mode.ADD)
  //   point: starting point of tangent arc
  //   direction: direction at starting point of tangent arc
  //   arc: ending arc, must be GeomType.CIRCLE
  //   side: select which arc to keep Defaults to Side.LEFT
  //   mode: combination mode

// Line Object
PointArcTangentLine

  PointArcTangentLine(point: VectorLike, arc: Curve | Edge | Wire, side: Side = Side.LEFT, mode: Mode = Mode.ADD)
  //   point: intersection point for tangent
  //   arc: circular arc to tangent, must be GeomType.CIRCLE
  //   side: side of arcs to place tangent arc center, LEFT or RIGHT
  //   mode: combination mode

// Line Object
PolarLine

  PolarLine(start: VectorLike, length: float | Shape | Axis | Location | Plane | VectorLike, angle: float | None = None, direction: VectorLike | None = None, length_mode: LengthMode = LengthMode.DIAGONAL, mode: Mode = Mode.ADD)
  //   start: start point
  //   length: line length (float) or limit limit
  //   angle: angle from the local x-axis
  //   direction: vector direction to determine angle
  //   length_mode: how length defines the line
  //   mode: combination mode

// Line Object
Polyline

  Polyline(*pts: VectorLike | Iterable[VectorLike], close: bool = False, mode: Mode = Mode.ADD)
  //   pts: sequence of two or more points
  //   close: close by generating an extra Edge
  //   mode: combination mode

// Line Object
RadiusArc

  RadiusArc(start_point: VectorLike, end_point: VectorLike, radius: float, short_sagitta: bool = True, mode: Mode = Mode.ADD)
  //   start_point: start point
  //   end_point: end point
  //   radius: arc radius
  //   short_sagitta: If True selects the short sagitta (height of arc from chord), else the long sagitta crossing the center
  //   mode: combination mode

// Line Object
SagittaArc

  SagittaArc(start_point: VectorLike, end_point: VectorLike, sagitta: float, mode: Mode = Mode.ADD)
  //   start_point: start point
  //   end_point: end point
  //   sagitta: arc height from chord between points
  //   mode: combination mode

// Line Object
Spline

  Spline(*pts: VectorLike | Iterable[VectorLike], tangents: Iterable[VectorLike] | None = None, tangent_scalars: Iterable[float] | None = None, periodic: bool = False, mode: Mode = Mode.ADD)
  //   pts: sequence of two or more points
  //   tangents: tangent directions
  //   tangent_scalars: tangent scales
  //   periodic: make the spline periodic (closed)
  //   mode: combination mode

// Line Object
TangentArc

  TangentArc(*pts: VectorLike | Iterable[VectorLike], tangent: VectorLike, tangent_from_first: bool = True, mode: Mode = Mode.ADD)
  //   pts: sequence of two points
  //   tangent: tangent to constrain arc
  //   tangent_from_first: apply tangent to first point
  //   mode: combination mode

// Line Object
ThreePointArc

  ThreePointArc(*pts: VectorLike | Iterable[VectorLike], mode: Mode = Mode.ADD)
  //   pts: sequence of three points
  //   mode: combination mode
