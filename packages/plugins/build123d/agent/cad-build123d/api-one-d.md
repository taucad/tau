# build123d — one_d

5 top-level symbols. Signatures are verbatim python.

# Category: one_d
# An Edge in build123d is a fundamental element in the topological data structure
# Remarks: representing a one-dimensional geometric entity within a 3D model. It encapsulates information about a curve, which could be a line, arc, or other parametrically defined shape. Edge is crucial in for precise modeling and manipulation of curves, facilitating operations like filleting, chamfering, and Boolean operations. It serves as a building block for constructing complex structures, such as wires and faces.
# build123d.topology.one_d.Edge (class)
class Edge(Mixin1D)

  # Build an Edge from an OCCT TopoDS_Shape/TopoDS_Edge
  # build123d.topology.one_d.Edge.__init__ (constructor)
  Edge(obj: TopoDS_Edge | Axis | None | None = None, label: str = '', color: Color | None = None, parent: Compound | None = None)
  #   obj: OCCT Edge or Axis
  #   label: Defaults to ''
  #   color: Defaults to None
  #   parent: assembly parent

  # center of an underlying circle or ellipse geometry
  arc_center: Vector

  # extrude
  # Remarks: Extrude a Vertex into an Edge. Returns: Edge: extruded shape
  # Throws: ValueError: Unsupported class
  # Throws: RuntimeError: Generated invalid result
  # build123d.topology.one_d.Edge.extrude (method)
  extrude(obj: Vertex, direction: VectorLike) -> Edge
  #   direction: direction and magnitude of extrusion

  # make_bezier
  # Remarks: Create a rational (with weights) or non-rational bezier curve. The first and last control points represent the start and end of the curve respectively. If weights are provided, there must be one provided for each control point. Returns: Edge: bezier curve
  # Throws: ValueError: Too few control points
  # Throws: ValueError: Too many control points
  # Throws: ValueError: A weight is required for each control point
  # build123d.topology.one_d.Edge.make_bezier (method)
  make_bezier(*cntl_pnts: VectorLike, weights: list[float] | None = None) -> Edge
  #   cntl_pnts: points defining the curve
  #   weights: control point weights list

  # make circle
  # Remarks: Create a circle centered on the origin of plane Returns: Edge: full or partial circle
  # build123d.topology.one_d.Edge.make_circle (method)
  make_circle(radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
  #   radius: circle radius
  #   plane: base plane
  #   start_angle: start of arc angle
  #   end_angle: end of arc angle
  #   angular_direction: arc direction

  # build123d.topology.one_d.Edge.make_constrained_arcs (method)
  make_constrained_arcs(*args, sagitta: Sagitta = Sagitta.SHORT, **kwargs) -> ShapeList[Edge]

  # Create planar line(s) on XY subject to tangency/contact constraints
  # Remarks: Supported cases --------------- 1. Tangent to two curves 2. Tangent to one curve and passing through a given point
  # build123d.topology.one_d.Edge.make_constrained_lines (method)
  make_constrained_lines(*args, **kwargs) -> ShapeList[Edge]

  # make ellipse
  # Remarks: Makes an ellipse centered at the origin of plane. Returns: Edge: full or partial ellipse
  # build123d.topology.one_d.Edge.make_ellipse (method)
  make_ellipse(x_radius: float, y_radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
  #   x_radius: x radius of the ellipse (along the x-axis of plane)
  #   y_radius: y radius of the ellipse (along the y-axis of plane)
  #   plane: base plane
  #   start_angle: Defaults to 360.0
  #   end_angle: Defaults to 360.0
  #   angular_direction: arc direction

  # make parabola
  # Remarks: Makes an parabola centered at the origin of plane. Returns: Edge: full or partial parabola
  # build123d.topology.one_d.Edge.make_parabola (method)
  make_parabola(focal_length: float, plane: Plane = Plane.XY, start_angle: float = 0.0, end_angle: float = 90.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
  #   focal_length: focal length the parabola (distance from the vertex to focus along the x-axis of plane)
  #   plane: base plane
  #   start_angle: Defaults to 0.0
  #   end_angle: Defaults to 90.0
  #   angular_direction: arc direction

  # make hyperbola
  # Remarks: Makes a hyperbola centered at the origin of plane. Returns: Edge: full or partial hyperbola
  # build123d.topology.one_d.Edge.make_hyperbola (method)
  make_hyperbola(x_radius: float, y_radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE) -> Edge
  #   x_radius: x radius of the hyperbola (along the x-axis of plane)
  #   y_radius: y radius of the hyperbola (along the y-axis of plane)
  #   plane: base plane
  #   start_angle: Defaults to 360.0
  #   end_angle: Defaults to 360.0
  #   angular_direction: arc direction

  # make_helix
  # Remarks: Make a helix with a given pitch, height and radius. By default a cylindrical surface is used to create the helix. If the :angle: is set (the apex given in degree) a conical surface is used instead. Returns: Wire: helix
  # build123d.topology.one_d.Edge.make_helix (method)
  make_helix(pitch: float, height: float, radius: float, center: VectorLike = (0, 0, 0), normal: VectorLike = (0, 0, 1), angle: float = 0.0, lefthand: bool = False) -> Wire
  #   pitch: distance per revolution along normal
  #   height: total height
  #   center: Defaults to (0, 0, 0)
  #   normal: Defaults to (0, 0, 1)
  #   angle: conical angle
  #   lefthand: Defaults to False

  # Create a line between two points
  # Remarks: Returns: A linear edge between the two provided points
  # build123d.topology.one_d.Edge.make_line (method)
  make_line(point1: VectorLike, point2: VectorLike) -> Edge
  #   point1: VectorLike
  #   point2: VectorLike

  # make line between edges
  # Remarks: Create a new linear Edge between the two provided Edges. If the Edges are parallel but in the opposite directions one Edge is flipped such that the mid way Edge isn't truncated. Returns: Edge: linear Edge between two Edges
  # build123d.topology.one_d.Edge.make_mid_way (method)
  make_mid_way(first: Edge, second: Edge, middle: float = 0.5) -> Edge
  #   first: first reference Edge
  #   second: second reference Edge
  #   middle: factional distance between Edges

  # Spline
  # Remarks: Interpolate a spline through the provided points. Returns: Edge: the spline
  # Throws: ValueError: Parameter for each interpolation point
  # Throws: ValueError: Tangent for each interpolation point
  # Throws: ValueError: B-spline interpolation failed
  # build123d.topology.one_d.Edge.make_spline (method)
  make_spline(points: list[VectorLike], tangents: list[VectorLike] | None = None, periodic: bool = False, parameters: list[float] | None = None, scale: bool = True, tol: float = 1e-06) -> Edge
  #   points: the points defining the spline
  #   tangents: start and finish tangent
  #   periodic: creation of periodic curves
  #   parameters: the value of the parameter at each interpolation point
  #   scale: whether to scale the specified tangent vectors before interpolating
  #   tol: tolerance of the algorithm (consult OCC documentation)

  # Create an exact B-spline edge from control points and knot data
  # Remarks: Returns: Edge: the B-spline edge
  # Throws: ValueError: B-spline requires at least one knot.
  # build123d.topology.one_d.Edge.make_bspline (method)
  make_bspline(control_points: Iterable[VectorLike], knots: Iterable[float], degree: int, weights: Iterable[float] | None = None, periodic: bool = False) -> Edge
  #   control_points: Control points (poles) defining the spline shape
  #   knots: Knot sequence for the spline
  #   degree: Polynomial degree of the spline
  #   weights: Optional per-control-point weights for rational B-splines
  #   periodic: Whether to create a periodic spline

  # make_spline_approx
  # Remarks: Approximate a spline through the provided points. Returns: Edge: spline
  # Throws: ValueError: B-spline approximation failed
  # build123d.topology.one_d.Edge.make_spline_approx (method)
  make_spline_approx(points: list[VectorLike], tol: float = 0.001, smoothing: tuple[float, float, float] | None = None, min_deg: int = 1, max_deg: int = 6) -> Edge
  #   tol: tolerance of the algorithm
  #   smoothing: optional tuple of 3 weights use for variational smoothing
  #   min_deg: minimum spline degree
  #   max_deg: maximum spline degree

  # Tangent Arc
  # Remarks: Makes a tangent arc from point start, in the direction of tangent and ends at end. Returns: Edge: circular arc
  # build123d.topology.one_d.Edge.make_tangent_arc (method)
  make_tangent_arc(start: VectorLike, tangent: VectorLike, end: VectorLike) -> Edge
  #   start: start point
  #   tangent: start tangent
  #   end: end point

  # Three Point Arc
  # Remarks: Makes a three point arc through the provided points Returns: Edge: a circular arc through the three points
  # build123d.topology.one_d.Edge.make_three_point_arc (method)
  make_three_point_arc(point1: VectorLike, point2: VectorLike, point3: VectorLike) -> Edge
  #   point1: start point
  #   point2: middle point
  #   point3: end point

  # Close an Edge
  # build123d.topology.one_d.Edge.close (method)
  close() -> Edge | Wire

  # Distribute Locations
  # Remarks: Distribute locations along edge or wire. Returns: list[Location]: locations distributed along Edge|Wire
  # Throws: ValueError: count must be two or greater
  # build123d.topology.one_d.Edge.distribute_locations (method)
  distribute_locations(count: int, start: float = 0.0, stop: float = 1.0, positions_only: bool = False) -> list[Location]
  #   count: Number of locations to generate
  #   start: position along Edge|Wire to start
  #   stop: position along Edge|Wire to end
  #   positions_only: only generate position not orientation

  # find_intersection_points
  # Remarks: Determine the points where a 2D edge crosses itself or another 2D edge Returns: ShapeList[Vector]: list of intersection points
  # Throws: ValueError: empty edge
  # build123d.topology.one_d.Edge.find_intersection_points (method)
  find_intersection_points(other: Axis | Edge | None = None, tolerance: float = TOLERANCE) -> ShapeList[Vector]
  #   other: curve to compare with
  #   tolerance: the precision of computing the intersection points

  # find_tangent
  # Remarks: Find the parameter values of self where the tangent is equal to angle. Returns: list[float]: u values between 0.0 and 1.0
  # build123d.topology.one_d.Edge.find_tangent (method)
  find_tangent(angle: float) -> list[float]
  #   angle: target angle in degrees

  # Return the Geom Curve from this Edge
  # build123d.topology.one_d.Edge.geom_adaptor (method)
  geom_adaptor() -> BRepAdaptor_Curve

  # Compare two edges for geometric equality within tolerance
  # Remarks: This compares the geometric properties of two edges, not their topological identity. Two independently created edges with the same geometry will return True. Returns: bool: True if edges are geometrically equal within tolerance
  # build123d.topology.one_d.Edge.geom_equal (method)
  geom_equal(other: Edge, tol: float = 1e-06, num_interpolation_points: int = 5) -> bool
  #   other: Edge to compare with
  #   tol: Tolerance for numeric comparisons
  #   num_interpolation_points: Number of points to sample for unknown curve types

  # Map a normalized arc-length position to the underlying OCCT parameter
  # Remarks: Returns the native OCCT curve parameter corresponding to the given normalized `position` (0.0 → start, 1.0 → end). For closed/periodic edges, OCCT may return a value **outside** the edge's nominal parameter range `[param_min, param_max]` (e.g., by adding/subtracting multiples of the period). If you require a value folded into the edge's range, apply a modulo with the parameter span. Returns: float: OCCT parameter (for edges) **or** composite “edgeIndex + fraction” parameter (for wires), as described above.
  # build123d.topology.one_d.Edge.param_at (method)
  param_at(position: float) -> float
  #   position: Normalized arc-length position along the shape, where `0.0` is the start and `1.0` is the end

  # Return the normalized parameter (∈ [0.0, 1.0]) of the location on this edge
  # Remarks: closest to `point`. This method always returns a **normalized** parameter across the edge's full OCCT parameter range, even though the underlying OCP/OCCT queries work in native (non-normalized) parameters. It is robust to several OCCT quirks: 1) Vertex snap (fast path) If `point` coincides (within tolerance) with one of the edge's vertices, that vertex's OCCT parameter is used and normalized to [0, 1]. Note: for a closed edge, a vertex may represent both start and end; the mapping is therefore ambiguous and either end may be chosen. 2) Projection via GeomAPI_ProjectPointOnCurve The OCCT projector's `LowerDistanceParameter()` can legitimately return a value **outside** the edge's [param_min, param_max] (e.g., periodic curves or implementation behavior). The result is wrapped back into range using a modulo by the parameter span and then normalized to [0, 1]. The projected answer is accepted only if re-evaluating the 3D point at that normalized parameter is within tolerance of the input `point`. 3) Fallback numeric search (robust path) If the projector fails the validation, a bounded 1D search is performed over [0, 1] using progressive subdivision and local minimization of the 3D distance ‖edge(u) - point‖. The first minimum found under geometric resolution is returned. Returns: float: Normalized parameter in [0.0, 1.0] corresponding to the point's closest location on the edge.
  # Throws: ValueError: If `point` is not on the edge within tolerance.
  # Throws: ValueError: Can't find param on empty edge
  # Throws: RuntimeError: If no parameter can be found (e.g., extremely pathological
  # Throws: curves or numerical failure).
  # build123d.topology.one_d.Edge.param_at_point (method)
  param_at_point(point: VectorLike) -> float
  #   point: A point expected to lie on this edge (within tolerance)

  # Project Edge
  # Remarks: Project an Edge onto a Shape generating new wires on the surfaces of the object one and only one of `direction` or `center` must be provided. Note that one or more wires may be generated depending on the topology of the target object and location/direction of projection. To avoid flipping the normal of a face built with the projected wire the orientation of the output wires are forced to be the same as self. Returns: : Projected Edge(s)
  # Throws: ValueError: Only one of direction or center must be provided
  # build123d.topology.one_d.Edge.project_to_shape (method)
  project_to_shape(target_object: Shape, direction: VectorLike | None = None, center: VectorLike | None = None) -> ShapeList[Edge]
  #   target_object: Shape
  #   direction: VectorLike
  #   center: VectorLike

  # reversed
  # Remarks: Return a copy of self with the opposite orientation. Returns: Edge: reversed
  # build123d.topology.one_d.Edge.reversed (method)
  reversed(reconstruct: bool = False) -> Edge
  #   reconstruct: rebuild edge instead of setting OCCT flag

  # Translate a linear Edge to an Axis
  # build123d.topology.one_d.Edge.to_axis (method)
  to_axis() -> Axis

  # Edge as Wire
  # build123d.topology.one_d.Edge.to_wire (method)
  to_wire() -> Wire

  # trim
  # Remarks: Create a new edge by keeping only the section between start and end. Returns: Edge: trimmed edge
  # Throws: TypeError: invalid input, must be float or VectorLike
  # Throws: ValueError: can't trim empty edge
  # build123d.topology.one_d.Edge.trim (method)
  trim(start: float | VectorLike, end: float | VectorLike) -> Edge
  #   start: 0.0 <= start < 1.0 or point on edge
  #   end: 0.0 < end <= 1.0 or point on edge

  # trim_to_length
  # Remarks: Create a new edge starting at the given normalized parameter of a given length. Returns: Edge: trimmed edge
  # build123d.topology.one_d.Edge.trim_to_length (method)
  trim_to_length(start: float | VectorLike, length: float) -> Edge

  # Return the shortest Edge of self trimmed by other or None if they don't intersect
  # build123d.topology.one_d.Edge.trim_to_other (method)
  trim_to_other(other: Shape | Axis | Location | Plane | VectorLike) -> Edge | None

  # Check if edge is infinite (LINE with length > 1e100)
  is_infinite: bool

  # Trim an infinite line edge to a finite length
  # Remarks: OCCT's boolean operations struggle with very long edges (length > 1e100). This method trims such edges to a reasonable size centered at edge.center(). For non-infinite edges, returns self unchanged. Returns: Trimmed edge if infinite, otherwise self
  # build123d.topology.one_d.Edge.trim_infinite (method)
  trim_infinite(half_length: float) -> Edge
  #   half_length: Half-length of the resulting edge

# Category: one_d
# A Wire in build123d is a topological entity representing a connected sequence
# Remarks: of edges forming a continuous curve or path in 3D space. Wires are essential components in modeling complex objects, defining boundaries for surfaces or solids. They store information about the connectivity and order of edges, allowing precise definition of paths within a 3D model.
# build123d.topology.one_d.Wire (class)
class Wire(Mixin1D)

  # build123d.topology.one_d.Wire.__init__ (constructor)
  Wire(obj: TopoDS_Wire, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Wire(edge: Edge, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Wire(wire: Wire, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Wire(wire: Curve, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Wire(edges: Iterable[Edge], sequenced: bool = False, label: str = '', color: Color | None = None, parent: Compound | None = None)
  #   obj: OCCT Wire
  #   label: Defaults to ''
  #   color: Defaults to None
  #   parent: assembly parent

  # combine
  # Remarks: Combine a list of wires and edges into a list of Wires. Returns: ShapeList[Wire]: Wires
  # build123d.topology.one_d.Wire.combine (method)
  combine(wires: Iterable[Wire | Edge], tol: float = 1e-09) -> ShapeList[Wire]
  #   wires: unsorted
  #   tol: tolerance

  # extrude - invalid operation for Wire
  # build123d.topology.one_d.Wire.extrude (method)
  extrude(obj: Shape, direction: VectorLike) -> Wire

  # make_circle
  # Remarks: Makes a circle centered at the origin of plane Returns: Wire: a circle
  # build123d.topology.one_d.Wire.make_circle (method)
  make_circle(radius: float, plane: Plane = Plane.XY) -> Wire
  #   radius: circle radius
  #   plane: base plane

  # make_convex_hull
  # Remarks: Create a wire of minimum length enclosing all of the provided edges. Note that edges can't overlap each other. Returns: Wire: convex hull perimeter
  # Throws: ValueError: edges overlap
  # build123d.topology.one_d.Wire.make_convex_hull (method)
  make_convex_hull(edges: Iterable[Edge], tolerance: float = 0.001) -> Wire
  #   edges: edges defining the convex hull
  #   tolerance: allowable error as a fraction of each edge length

  # make ellipse
  # Remarks: Makes an ellipse centered at the origin of plane. Returns: Wire: an ellipse
  # build123d.topology.one_d.Wire.make_ellipse (method)
  make_ellipse(x_radius: float, y_radius: float, plane: Plane = Plane.XY, start_angle: float = 360.0, end_angle: float = 360.0, angular_direction: AngularDirection = AngularDirection.COUNTER_CLOCKWISE, closed: bool = True) -> Wire
  #   x_radius: x radius of the ellipse (along the x-axis of plane)
  #   y_radius: y radius of the ellipse (along the y-axis of plane)
  #   plane: base plane
  #   start_angle: _description_
  #   end_angle: _description_
  #   angular_direction: arc direction
  #   closed: close the arc

  # make_polygon
  # Remarks: Create an irregular polygon by defining vertices Returns: Wire: an irregular polygon
  # build123d.topology.one_d.Wire.make_polygon (method)
  make_polygon(vertices: Iterable[VectorLike], close: bool = True) -> Wire
  #   close: close the polygon

  # Make Rectangle
  # Remarks: Make a Rectangle centered on center with the given normal Returns: Wire: The centered rectangle
  # build123d.topology.one_d.Wire.make_rect (method)
  make_rect(width: float, height: float, plane: Plane = Plane.XY) -> Wire
  #   width: width (local x)
  #   height: height (local y)
  #   plane: plane containing rectangle

  # Order the edges of a chamfer relative to a reference Edge
  # build123d.topology.one_d.Wire.order_chamfer_edges (method)
  order_chamfer_edges(reference_edge: Edge | None, edges: tuple[Edge, Edge]) -> tuple[Edge, Edge]

  # chamfer_2d
  # Remarks: Apply 2D chamfer to a wire Returns: Wire: chamfered wire
  # build123d.topology.one_d.Wire.chamfer_2d (method)
  chamfer_2d(distance: float, distance2: float, vertices: Iterable[Vertex], edge: Edge | None = None) -> Wire
  #   distance: chamfer length
  #   distance2: chamfer length
  #   vertices: vertices to chamfer
  #   edge: identifies the side where length is measured

  # Close a Wire
  # build123d.topology.one_d.Wire.close (method)
  close() -> Wire

  # edges - all the edges in this Shape
  # build123d.topology.one_d.Wire.edges (method)
  edges() -> ShapeList[Edge]

  # fillet_2d
  # Remarks: Apply 2D fillet to a wire Returns: Wire: filleted wire
  # Throws: RuntimeError: Internal error
  # Throws: ValueError: empty wire
  # build123d.topology.one_d.Wire.fillet_2d (method)
  fillet_2d(radius: float, vertices: Iterable[Vertex]) -> Wire
  #   vertices: vertices to fillet

  # fix_degenerate_edges
  # Remarks: Fix a Wire that contains degenerate (very small) edges Returns: Wire: fixed wire
  # build123d.topology.one_d.Wire.fix_degenerate_edges (method)
  fix_degenerate_edges(precision: float) -> Wire
  #   precision: minimum value edge length

  # Return the Geom Comp Curve for this Wire
  # build123d.topology.one_d.Wire.geom_adaptor (method)
  geom_adaptor() -> BRepAdaptor_CompCurve

  # Return the edges in self ordered by wire direction and orientation
  # build123d.topology.one_d.Wire.order_edges (method)
  order_edges() -> ShapeList[Edge]

  # Compare two wires for geometric equality within tolerance
  # Remarks: This compares the geometric properties of two wires by comparing their constituent edges pairwise. Two independently created wires with the same geometry will return True. Returns: bool: True if wires are geometrically equal within tolerance
  # build123d.topology.one_d.Wire.geom_equal (method)
  geom_equal(other: Wire, tol: float = 1e-06, num_interpolation_points: int = 5) -> bool
  #   other: Wire to compare with
  #   tol: Tolerance for numeric comparisons
  #   num_interpolation_points: Number of points to sample for unknown curve types

  # Return the OCCT comp-curve parameter corresponding to the given wire position
  # Remarks: This is *not* the edge composite parameter; it is the parameter of the wire’s BRepAdaptor_CompCurve.
  # build123d.topology.one_d.Wire.param_at (method)
  param_at(position: float) -> float

  # Return the normalized wire parameter for the point closest to this wire
  # Remarks: This method projects the given point onto the wire, finds the nearest edge, and accumulates arc lengths to determine the fractional position along the entire wire. The result is normalized to the interval [0.0, 1.0], where: - 0.0 corresponds to the start of the wire - 1.0 corresponds to the end of the wire Unlike the edge version of this method, the returned value is **not** an OCCT curve parameter, but a normalized parameter across the wire as a whole. Returns: float: Normalized parameter in [0.0, 1.0] representing the relative position of the projected point along the wire.
  # Throws: ValueError: Can't find point on empty wire
  # build123d.topology.one_d.Wire.param_at_point (method)
  param_at_point(point: VectorLike) -> float
  #   point: The point to project onto the wire

  # Project Wire
  # Remarks: Project a Wire onto a Shape generating new wires on the surfaces of the object one and only one of `direction` or `center` must be provided. Note that one or more wires may be generated depending on the topology of the target object and location/direction of projection. To avoid flipping the normal of a face built with the projected wire the orientation of the output wires are forced to be the same as self. Returns: : Projected wire(s)
  # Throws: ValueError: Only one of direction or center must be provided
  # build123d.topology.one_d.Wire.project_to_shape (method)
  project_to_shape(target_object: Shape, direction: VectorLike | None = None, center: VectorLike | None = None) -> ShapeList[Wire]
  #   target_object: Shape
  #   direction: VectorLike
  #   center: VectorLike

  # Attempt to stitch wires
  # Remarks: Returns: Wire: stitched wires
  # Throws: ValueError: Can't stitch empty wires
  # build123d.topology.one_d.Wire.stitch (method)
  stitch(other: Wire) -> Wire
  #   other: wire to combine

  # Return Wire - used as a pair with Edge.to_wire when self is Wire | Edge
  # build123d.topology.one_d.Wire.to_wire (method)
  to_wire() -> Wire

  # Trim a wire between [start, end] normalized over total length
  # Remarks: Returns: Wire: trimmed Wire
  # build123d.topology.one_d.Wire.trim (method)
  trim(start: float | VectorLike, end: float | VectorLike) -> Wire
  #   start: normalized start position (0.0 to <1.0) or point
  #   end: normalized end position (>0.0 to 1.0) or point

# Category: one_d
# Convert edges to a list of wires
# Remarks: Returns:
# build123d.topology.one_d.edges_to_wires (function)
edges_to_wires(edges: Iterable[Edge], tol: float = 1e-06) -> ShapeList[Wire]
#   edges: Iterable[Edge]
#   tol: float

# Category: one_d
# Find edges connected to the given edge with at least the requested continuity
# Remarks: Returns: ShapeList[Edge]: Connected edges meeting the continuity requirement.
# build123d.topology.one_d.topo_explore_connected_edges (function)
topo_explore_connected_edges(edge: Edge, parent: Shape | None = None, continuity: ContinuityLevel = ContinuityLevel.C0) -> ShapeList[Edge]
#   edge: The reference edge to explore from
#   parent: Optional parent Shape
#   continuity: Minimum required continuity (C0/G0, C1/G1, C2/G2)

# Category: one_d
# Methods to add to the Edge and Wire classes
# build123d.topology.one_d.Mixin1D (class)
class Mixin1D(Shape)

  # Are the start and end points equal?
  is_closed: bool

  # Does the Edge/Wire loop forward or reverse
  is_forward: bool

  # Check if the edge is an interior edge
  # Remarks: An interior edge lies between surfaces that are part of the body (internal to the geometry) and does not form part of the exterior boundary. Returns: bool: True if the edge is an interior edge, False otherwise.
  is_interior: bool

  # Edge or Wire length
  length: float

  # Calculate the radius
  # Remarks: Note that when applied to a Wire, the radius is simply the radius of the first edge. Returns: radius
  # Throws: ValueError: if kernel can not reduce the shape to a circular edge
  radius: float

  # volume - the volume of this Edge or Wire, which is always zero
  volume: float

  # Returns the right type of wrapper, given a OCCT object
  # build123d.topology.one_d.Mixin1D.cast (method)
  cast(obj: TopoDS_Shape) -> Vertex | Edge | Wire

  # Unused - only here because Mixin1D is a subclass of Shape
  # build123d.topology.one_d.Mixin1D.extrude (method)
  extrude(obj: Shape, direction: VectorLike) -> Edge | Face | Shell | Solid | Compound

  # fuse shape to wire/edge operator +
  # build123d.topology.one_d.Mixin1D.__add__ (method)
  __add__(other: None) -> Self  # Mixin1D + other
  __add__(other: Shape | Iterable[Shape]) -> Edge | Wire | Curve  # Mixin1D + other

  # Position on wire operator @
  # build123d.topology.one_d.Mixin1D.__matmul__ (method)
  __matmul__(position: float) -> Vector  # Mixin1D @ position

  # Tangent on wire operator %
  # build123d.topology.one_d.Mixin1D.__mod__ (method)
  __mod__(position: float) -> Vector  # Mixin1D % position

  # Location on wire operator ^
  # build123d.topology.one_d.Mixin1D.__xor__ (method)
  __xor__(position: float) -> Location  # Mixin1D ^ position

  # Center of object
  # Remarks: Return the center based on center_of Returns: Vector: center
  # build123d.topology.one_d.Mixin1D.center (method)
  center(center_of: CenterOf = CenterOf.GEOMETRY) -> Vector
  #   center_of: centering option

  # common_plane
  # Remarks: Find the plane containing all the edges/wires (including self). If there is no common plane return None. If the edges are coaxial, select one of the infinite number of valid planes. Returns: None | Plane: Either the common plane or None
  # build123d.topology.one_d.Mixin1D.common_plane (method)
  common_plane(*lines: Edge | Wire | None, tolerance: float = TOLERANCE) -> None | Plane
  #   lines: edges in common with self
  #   tolerance: amount lines can deviate from plane

  # Build a *curvature comb* for a planar (XY) 1D curve
  # Remarks: A curvature comb is a set of short line segments (“teeth”) erected perpendicular to the curve that visualize the signed curvature κ(u). Tooth length is proportional to |κ| and the direction encodes the sign (left normal for κ>0, right normal for κ<0). This is useful for inspecting fairness and continuity (C0/C1/C2) of edges and wires. Returns: ShapeList[Edge]: A list of short `Edge` objects (lines) anchored on the curve and oriented along the left normal `n̂ = normalize(t) × +Z`. Notes: - On circles, κ = 1/R so tooth length is constant. - On straight segments, κ = 0 so no teeth are drawn. - At inflection points κ→0 and the tooth flips direction. - At C0 corners the tangent is discontinuous; nearby teeth may jump. C1 yields continuous direction; C2 yields continuous magnitude as well. Example: >>> comb = my_wire.curvature_comb(count=200, max_tooth_size=2.0) >>> show(my_wire, Curve(comb))
  # Throws: ValueError: Empty curve.
  # Throws: ValueError: If the curve is not planar on `Plane.XY`.
  # build123d.topology.one_d.Mixin1D.curvature_comb (method)
  curvature_comb(count: int = 100, max_tooth_size: float | None = None) -> ShapeList[Edge]
  #   count: Number of uniformly spaced samples over the normalized parameter
  #   max_tooth_size: Maximum tooth height in model units

  # Derivative At
  # Remarks: Generate a derivative along the underlying curve. Returns: Vector: position on the underlying curve
  # Throws: ValueError: position must be a float or a point
  # build123d.topology.one_d.Mixin1D.derivative_at (method)
  derivative_at(position: float | VectorLike, order: int = 2, position_mode: PositionMode = PositionMode.PARAMETER) -> Vector
  #   position: distance, parameter value or point
  #   order: derivative order
  #   position_mode: position calculation mode

  # The end point of this edge
  # Remarks: Note that circles may have identical start and end points.
  # build123d.topology.one_d.Mixin1D.end_point (method)
  end_point() -> Vector

  # Locations along curve
  # Remarks: Generate a location along the underlying curve. Returns: Location: A Location object representing local coordinate system at the specified distance.
  # build123d.topology.one_d.Mixin1D.location_at (method)
  location_at(distance: float, position_mode: PositionMode = PositionMode.PARAMETER, frame_method: FrameMethod = FrameMethod.FRENET, x_dir: VectorLike | None = None) -> Location
  #   distance: distance or parameter value
  #   position_mode: position calculation mode
  #   frame_method: moving frame calculation method
  #   x_dir: override the x_dir to help with plane creation along a 1D shape

  # Locations along curve
  # Remarks: Generate location along the curve Returns: list[Location]: A list of Location objects representing local coordinate systems at the specified distances.
  # build123d.topology.one_d.Mixin1D.locations (method)
  locations(distances: Iterable[float], position_mode: PositionMode = PositionMode.PARAMETER, frame_method: FrameMethod = FrameMethod.FRENET, x_dir: VectorLike | None = None) -> list[Location]
  #   distances: distance or parameter values
  #   position_mode: position calculation mode
  #   frame_method: moving frame calculation method
  #   x_dir: override the x_dir to help with plane creation along a 1D shape

  # Calculate the normal Vector
  # Remarks: :return: normal vector Returns:
  # build123d.topology.one_d.Mixin1D.normal (method)
  normal() -> Vector

  # 2d Offset
  # Remarks: Offsets a planar edge/wire Returns: Wire: offset wire
  # Throws: RuntimeError: Multiple Wires generated
  # Throws: RuntimeError: Unexpected result type
  # build123d.topology.one_d.Mixin1D.offset_2d (method)
  offset_2d(distance: float, kind: Kind = Kind.ARC, side: Side = Side.BOTH, closed: bool = True) -> Edge | Wire
  #   distance: distance from edge/wire to offset
  #   kind: offset corner transition
  #   side: side to place offset
  #   closed: if Side!=BOTH, close the LEFT or RIGHT offset

  # perpendicular_line
  # Remarks: Create a line on the given plane perpendicular to and centered on beginning of self Returns: Edge: perpendicular line
  # build123d.topology.one_d.Mixin1D.perpendicular_line (method)
  perpendicular_line(length: float, u_value: float, plane: Plane = Plane.XY) -> Edge
  #   length: line length
  #   u_value: position along line between 0.0 and 1.0
  #   plane: plane containing perpendicular line

  # Position At
  # Remarks: Generate a position along the underlying Wire. Returns: Vector: position on the underlying curve
  # build123d.topology.one_d.Mixin1D.position_at (method)
  position_at(position: float, position_mode: PositionMode = PositionMode.PARAMETER) -> Vector
  #   position: distance or parameter value
  #   position_mode: position calculation mode

  # Positions along curve
  # Remarks: Generate positions along the underlying curve Returns: list[Vector]: positions along curve
  # build123d.topology.one_d.Mixin1D.positions (method)
  positions(distances: Iterable[float] | None = None, position_mode: PositionMode = PositionMode.PARAMETER, deflection: float | None = None) -> list[Vector]
  #   distances: distance or parameter values
  #   position_mode: position calculation mode only applies when using distances
  #   deflection: maximum deflection between the curve and the polygon that results from the computed points

  # Project onto a face along the specified direction
  # Remarks: Returns:
  # build123d.topology.one_d.Mixin1D.project (method)
  project(face: Face, direction: VectorLike, closest: bool = True) -> Edge | Wire | ShapeList[Edge | Wire]
  #   face: Face
  #   direction: VectorLike
  #   closest: bool

  # project_to_viewport
  # Remarks: Project a shape onto a viewport returning visible and hidden Edges. Returns: tuple[ShapeList[Edge],ShapeList[Edge]]: visible & hidden Edges
  # build123d.topology.one_d.Mixin1D.project_to_viewport (method)
  project_to_viewport(viewport_origin: VectorLike, viewport_up: VectorLike = (0, 0, 1), look_at: VectorLike | None = None, focus: float | None = None) -> tuple[ShapeList[Edge], ShapeList[Edge]]
  #   viewport_origin: location of viewport
  #   viewport_up: direction of the viewport y axis
  #   look_at: point to look at
  #   focus: the focal length for perspective projection Defaults to None (orthographic projection)

  # The start point of this edge
  # Remarks: Note that circles may have identical start and end points.
  # build123d.topology.one_d.Mixin1D.start_point (method)
  start_point() -> Vector

  # tangent_angle_at
  # Remarks: Compute the tangent angle at the specified location Returns: float: angle in degrees between 0 and 360
  # build123d.topology.one_d.Mixin1D.tangent_angle_at (method)
  tangent_angle_at(location_param: float = 0.5, position_mode: PositionMode = PositionMode.PARAMETER, plane: Plane = Plane.XY) -> float
  #   location_param: distance or parameter value
  #   position_mode: position calculation mode
  #   plane: plane line was constructed on

  # tangent_at
  # Remarks: Find the tangent at a given position on the 1D shape where the position is either a float (or int) parameter or a point that lies on the shape. Returns: Vector: tangent value
  # build123d.topology.one_d.Mixin1D.tangent_at (method)
  tangent_at(position: float | VectorLike = 0.5, position_mode: PositionMode = PositionMode.PARAMETER) -> Vector
  #   position: distance, parameter value, or point on shape
  #   position_mode: position calculation mode
