# build123d — one_d

6 top-level symbols. Signatures are verbatim python.

// An Edge in build123d is a fundamental element in the topological data structure
Edge

// Build an Edge from an OCCT TopoDS_Shape/TopoDS_Edge
Edge(obj: TopoDS_Edge | Axis | None | None = None, label: str = '', color: Color | None = None, parent: Compound | None = None)
// obj: OCCT Edge or Axis
// label: Defaults to ''
// color: Defaults to None
// parent: assembly parent

// center of an underlying circle or ellipse geometry
arc_center: Vector

// extrude
extrude(obj: Vertex, direction: VectorLike) -> Edge
// direction: direction and magnitude of extrusion

// make_bezier
make_bezier(\*cntl_pnts: VectorLike, weights: list[float] | None = None) -> Edge
// cntl_pnts: points defining the curve
// weights: control point weights list

// make circle
make_circle(radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
// radius: circle radius
// plane: base plane
// start_angle: start of arc angle
// end_angle: end of arc angle
// angular_direction: arc direction

make_constrained_arcs(\*args, sagitta: Sagitta = Sagitta.SHORT, \*\*kwargs) -> ShapeList[Edge]

// Create planar line(s) on XY subject to tangency/contact constraints
make_constrained_lines(\*args, \*\*kwargs) -> ShapeList[Edge]

// make ellipse
make_ellipse(x_radius: float, y_radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
// x_radius: x radius of the ellipse (along the x-axis of plane)
// y_radius: y radius of the ellipse (along the y-axis of plane)
// plane: base plane
// start_angle: Defaults to 360.0
// end_angle: Defaults to 360.0
// angular_direction: arc direction

// make parabola
make_parabola(focal_length: float, plane: Plane = Plane.XY, start_angle: float = 0.0, end_angle: float = 90.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
// focal_length: focal length the parabola (distance from the vertex to focus along the x-axis of plane)
// plane: base plane
// start_angle: Defaults to 0.0
// end_angle: Defaults to 90.0
// angular_direction: arc direction

// make hyperbola
make_hyperbola(x_radius: float, y_radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
// x_radius: x radius of the hyperbola (along the x-axis of plane)
// y_radius: y radius of the hyperbola (along the y-axis of plane)
// plane: base plane
// start_angle: Defaults to 360.0
// end_angle: Defaults to 360.0
// angular_direction: arc direction

// make_helix
make_helix(pitch: float, height: float, radius: float, center: VectorLike = (0, 0, 0), normal: VectorLike = (0, 0, 1), angle: float = 0.0, lefthand: bool = False) -> Wire
// pitch: distance per revolution along normal
// height: total height
// center: Defaults to (0, 0, 0)
// normal: Defaults to (0, 0, 1)
// angle: conical angle
// lefthand: Defaults to False

// Create a line between two points
make_line(point1: VectorLike, point2: VectorLike) -> Edge
// point1: VectorLike
// point2: VectorLike

// make line between edges
make_mid_way(first: Edge, second: Edge, middle: float = 0.5) -> Edge
// first: first reference Edge
// second: second reference Edge
// middle: factional distance between Edges

// Spline
make_spline(points: list[VectorLike], tangents: list[VectorLike] | None = None, periodic: bool = False, parameters: list[float] | None = None, scale: bool = True, tol: float = 1e-06) -> Edge
// points: the points defining the spline
// tangents: start and finish tangent
// periodic: creation of periodic curves
// parameters: the value of the parameter at each interpolation point
// scale: whether to scale the specified tangent vectors before interpolating
// tol: tolerance of the algorithm (consult OCC documentation)

// Create an exact B-spline edge from control points and knot data
make_bspline(control_points: Iterable[VectorLike], knots: Iterable[float], degree: int, weights: Iterable[float] | None = None, periodic: bool = False) -> Edge
// control_points: Control points (poles) defining the spline shape
// knots: Knot sequence for the spline
// degree: Polynomial degree of the spline
// weights: Optional per-control-point weights for rational B-splines
// periodic: Whether to create a periodic spline

// make_spline_approx
make_spline_approx(points: list[VectorLike], tol: float = 0.001, smoothing: tuple[float, float, float] | None = None, min_deg: int = 1, max_deg: int = 6) -> Edge
// tol: tolerance of the algorithm
// smoothing: optional tuple of 3 weights use for variational smoothing
// min_deg: minimum spline degree
// max_deg: maximum spline degree

// Tangent Arc
make_tangent_arc(start: VectorLike, tangent: VectorLike, end: VectorLike) -> Edge
// start: start point
// tangent: start tangent
// end: end point

// Three Point Arc
make_three_point_arc(point1: VectorLike, point2: VectorLike, point3: VectorLike) -> Edge
// point1: start point
// point2: middle point
// point3: end point

// Close an Edge
close() -> Edge | Wire

// Distribute Locations
distribute_locations(count: int, start: float = 0.0, stop: float = 1.0, positions_only: bool = False) -> list[Location]
// count: Number of locations to generate
// start: position along Edge|Wire to start
// stop: position along Edge|Wire to end
// positions_only: only generate position not orientation

// find_intersection_points
find_intersection_points(other: Axis | Edge | None = None, tolerance: float = TOLERANCE) -> ShapeList[Vector]
// other: curve to compare with
// tolerance: the precision of computing the intersection points

// find_tangent
find_tangent(angle: float) -> list[float]
// angle: target angle in degrees

// Return the Geom Curve from this Edge
geom_adaptor() -> BRepAdaptor_Curve

// Compare two edges for geometric equality within tolerance
geom_equal(other: Edge, tol: float = 1e-06, num_interpolation_points: int = 5) -> bool
// other: Edge to compare with
// tol: Tolerance for numeric comparisons
// num_interpolation_points: Number of points to sample for unknown curve types

// Map a normalized arc-length position to the underlying OCCT parameter
param_at(position: float) -> float
// position: Normalized arc-length position along the shape, where `0.0` is the start and `1.0` is the end

// Return the normalized parameter (∈ [0.0, 1.0]) of the location on this edge
param_at_point(point: VectorLike) -> float
// point: A point expected to lie on this edge (within tolerance)

// Project Edge
project_to_shape(target_object: Shape, direction: VectorLike | None = None, center: VectorLike | None = None) -> ShapeList[Edge]
// target_object: Shape
// direction: VectorLike
// center: VectorLike

// reversed
reversed(reconstruct: bool = False) -> Edge
// reconstruct: rebuild edge instead of setting OCCT flag

// Translate a linear Edge to an Axis
to_axis() -> Axis

// Edge as Wire
to_wire() -> Wire

// trim
trim(start: float | VectorLike, end: float | VectorLike) -> Edge
// start: 0.0 <= start < 1.0 or point on edge
// end: 0.0 < end <= 1.0 or point on edge

// trim_to_length
trim_to_length(start: float | VectorLike, length: float) -> Edge

// Return the shortest Edge of self trimmed by other or None if they don't intersect
trim_to_other(other: Shape | Axis | Location | Plane | VectorLike) -> Edge | None

// Check if edge is infinite (LINE with length > 1e100)
is_infinite: bool

// Trim an infinite line edge to a finite length
trim_infinite(half_length: float) -> Edge
// half_length: Half-length of the resulting edge

// A Wire in build123d is a topological entity representing a connected sequence
Wire

Wire(obj: TopoDS_Wire, label: str = '', color: Color | None = None, parent: Compound | None = None)
Wire(edge: Edge, label: str = '', color: Color | None = None, parent: Compound | None = None)
Wire(wire: Wire, label: str = '', color: Color | None = None, parent: Compound | None = None)
Wire(wire: Curve, label: str = '', color: Color | None = None, parent: Compound | None = None)
Wire(edges: Iterable[Edge], sequenced: bool = False, label: str = '', color: Color | None = None, parent: Compound | None = None)
// obj: OCCT Wire
// label: Defaults to ''
// color: Defaults to None
// parent: assembly parent

// combine
combine(wires: Iterable[Wire | Edge], tol: float = 1e-09) -> ShapeList[Wire]
// wires: unsorted
// tol: tolerance

// extrude - invalid operation for Wire
extrude(obj: Shape, direction: VectorLike) -> Wire

// make_circle
make_circle(radius: float, plane: Plane = Plane.XY) -> Wire
// radius: circle radius
// plane: base plane

// make_convex_hull
make_convex_hull(edges: Iterable[Edge], tolerance: float = 0.001) -> Wire
// edges: edges defining the convex hull
// tolerance: allowable error as a fraction of each edge length

// make ellipse
make*ellipse(x_radius: float, y_radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE, closed: bool = True) -> Wire
// x_radius: x radius of the ellipse (along the x-axis of plane)
// y_radius: y radius of the ellipse (along the y-axis of plane)
// plane: base plane
// start_angle: \_description*
// end*angle: \_description*
// angular_direction: arc direction
// closed: close the arc

// make_polygon
make_polygon(vertices: Iterable[VectorLike], close: bool = True) -> Wire
// close: close the polygon

// Make Rectangle
make_rect(width: float, height: float, plane: Plane = Plane.XY) -> Wire
// width: width (local x)
// height: height (local y)
// plane: plane containing rectangle

// Order the edges of a chamfer relative to a reference Edge
order_chamfer_edges(reference_edge: Edge | None, edges: tuple[Edge, Edge]) -> tuple[Edge, Edge]

// chamfer_2d
chamfer_2d(distance: float, distance2: float, vertices: Iterable[Vertex], edge: Edge | None = None) -> Wire
// distance: chamfer length
// distance2: chamfer length
// vertices: vertices to chamfer
// edge: identifies the side where length is measured

// Close a Wire
close() -> Wire

// edges - all the edges in this Shape
edges() -> ShapeList[Edge]

// fillet_2d
fillet_2d(radius: float, vertices: Iterable[Vertex]) -> Wire
// vertices: vertices to fillet

// fix_degenerate_edges
fix_degenerate_edges(precision: float) -> Wire
// precision: minimum value edge length

// Return the Geom Comp Curve for this Wire
geom_adaptor() -> BRepAdaptor_CompCurve

// Return the edges in self ordered by wire direction and orientation
order_edges() -> ShapeList[Edge]

// Compare two wires for geometric equality within tolerance
geom_equal(other: Wire, tol: float = 1e-06, num_interpolation_points: int = 5) -> bool
// other: Wire to compare with
// tol: Tolerance for numeric comparisons
// num_interpolation_points: Number of points to sample for unknown curve types

// Return the OCCT comp-curve parameter corresponding to the given wire position
param_at(position: float) -> float

// Return the normalized wire parameter for the point closest to this wire
param_at_point(point: VectorLike) -> float
// point: The point to project onto the wire

// Project Wire
project_to_shape(target_object: Shape, direction: VectorLike | None = None, center: VectorLike | None = None) -> ShapeList[Wire]
// target_object: Shape
// direction: VectorLike
// center: VectorLike

// Attempt to stitch wires
stitch(other: Wire) -> Wire
// other: wire to combine

// Return Wire - used as a pair with Edge.to_wire when self is Wire | Edge
to_wire() -> Wire

// Trim a wire between [start, end] normalized over total length
trim(start: float | VectorLike, end: float | VectorLike) -> Wire
// start: normalized start position (0.0 to <1.0) or point
// end: normalized end position (>0.0 to 1.0) or point

// Convert edges to a list of wires
edges_to_wires(edges: Iterable[Edge], tol: float = 1e-06) -> ShapeList[Wire]
// edges: Iterable[Edge]
// tol: float

// Offset a topods_face
offset_topods_face(face: TopoDS_Face, amount: float) -> TopoDS_Shape

// Find edges connected to the given edge with at least the requested continuity
topo_explore_connected_edges(edge: Edge, parent: Shape | None = None, continuity: ContinuityLevel = ContinuityLevel.C0) -> ShapeList[Edge]
// edge: The reference edge to explore from
// parent: Optional parent Shape
// continuity: Minimum required continuity (C0/G0, C1/G1, C2/G2)

// Given an edge extracted from a Shape, return the topods_faces connected to it
topo_explore_connected_faces(edge: Edge, parent: Shape | None = None) -> list[TopoDS_Face]
