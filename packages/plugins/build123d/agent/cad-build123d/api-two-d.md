# build123d — two_d

3 top-level symbols. Signatures are verbatim python.

# Category: two_d
# A Face in build123d represents a 3D bounded surface within the topological data
# Remarks: structure. It encapsulates geometric information, defining a face of a 3D shape. These faces are integral components of complex structures, such as solids and shells. Face enables precise modeling and manipulation of surfaces, supporting operations like trimming, filleting, and Boolean operations.
# build123d.topology.two_d.Face (class)
class Face(Mixin2D)

  # build123d.topology.two_d.Face.__init__ (constructor)
  Face(obj: TopoDS_Face | Plane, label: str = '', color: Color | None = None, parent: Compound | None = None)
  Face(outer_wire: Wire, inner_wires: Iterable[Wire] | None = None, label: str = '', color: Color | None = None, parent: Compound | None = None)
  #   obj: OCCT Face or Plane
  #   label: Defaults to ''
  #   color: Defaults to None
  #   parent: assembly parent

  # Calculate the total surface area of the face, including the areas of any holes
  # Remarks: This property returns the overall area of the face as if the inner boundaries (holes) were filled in. Returns: float: The total surface area, including the area of holes. Returns 0.0 if the face is empty.
  area_without_holes: float

  # Get the rotational axis of a cylinder or torus
  axis_of_rotation: None | Axis

  # Computes and returns the axes of symmetry for a planar face
  # Remarks: The method determines potential symmetry axes by analyzing the face’s geometry: - It first validates that the face is non-empty and planar. - For faces with inner wires (holes), it computes the centroid of the holes and the face's overall center (COG). - If the holes' centroid significantly deviates from the COG (beyond a specified tolerance), the symmetry axis is taken along the line connecting these points; otherwise, each hole’s center is used to generate a candidate axis. - For faces without holes, candidate directions are derived by sampling midpoints along the outer wire's edges. - If curved edges are present, additional candidate directions are obtained from an oriented bounding box (OBB) constructed around the face. For each candidate direction, the face is split by a plane (defined using the candidate direction and the face’s normal). The top half of the face is then mirrored across this plane, and if the area of the intersection between the mirrored half and the bottom half matches the bottom half’s area within a small tolerance, the direction is accepted as an axis of symmetry. Returns: list[Axis]: A list of Axis objects, each defined by the face's center and a direction vector, representing the symmetry axes of the face.
  # Throws: ValueError: If the face or its underlying representation is empty.
  # Throws: ValueError: If the face is not planar.
  axes_of_symmetry: list[Axis]

  # Location at the center of face
  center_location: Location

  # geometry of planar face
  geometry: None | str

  # Determine whether a given face is convex relative to its underlying geometry
  # Remarks: for supported geometries: cylinder, sphere, torus. Returns: bool: True if convex; otherwise, False.
  is_circular_convex: bool

  # Determine whether a given face is concave relative to its underlying geometry
  # Remarks: for supported geometries: cylinder, sphere, torus. Returns: bool: True if concave; otherwise, False.
  is_circular_concave: bool

  # Is the face planar even though its geom_type may not be PLANE - if so return Plane
  is_planar: Plane | None

  # length of planar face
  length: None | float

  # Return the major and minor radii of a torus otherwise None
  radii: None | tuple[float, float]

  # Return the radius of a cylinder or sphere, otherwise None
  radius: None | float

  # Return the seams contained within this Face
  seams: ShapeList[Edge]

  # Return the semi angle of a cone, otherwise None
  semi_angle: None | float

  # Create a planar face from a face's parametric-space boundary
  # Remarks: Each boundary edge's pcurve on ``self`` is converted to a normal build123d ``Edge`` on the XY plane, where X is the surface U parameter and Y is the surface V parameter. The original outer/inner wire structure is kept so the result can be displayed with normal build123d/ocp-vscode tooling. Returns: A planar ``Face`` in UV parameter space.
  uv_face: Face

  # volume - the volume of this Face, which is always zero
  volume: float

  # width of planar face
  width: None | float

  # extrude
  # Remarks: Extrude an Edge into a Face. Returns: Face: extruded shape
  # Throws: ValueError: Unsupported class
  # Throws: RuntimeError: Generated invalid result
  # build123d.topology.two_d.Face.extrude (method)
  extrude(obj: Edge, direction: VectorLike) -> Face
  #   direction: direction and magnitude of extrusion

  # make_bezier_surface
  # Remarks: Construct a Bézier surface from the provided 2d array of points. Returns: Face: a potentially non-planar face
  # Throws: ValueError: Too few control points
  # Throws: ValueError: Too many control points
  # Throws: ValueError: A weight is required for each control point
  # build123d.topology.two_d.Face.make_bezier_surface (method)
  make_bezier_surface(points: list[list[VectorLike]], weights: list[list[float]] | None = None) -> Face
  #   points: a 2D list of control points
  #   weights: control point weights

  # Constructs a Gordon surface from a network of profile and guide curves
  # Remarks: Requirements: 1. Profiles and guides may be defined as points or curves. 2. Only the first or last profile or guide may be a point. 3. At least one profile and one guide must be a non-point curve. 4. Each profile must intersect with every guide. 5. Both ends of every profile must lie on a guide. 6. Both ends of every guide must lie on a profile. Returns: Face: the interpolated Gordon surface
  # Throws: ValueError: input Edge cannot be empty.
  # build123d.topology.two_d.Face.make_gordon_surface (method)
  make_gordon_surface(profiles: Iterable[VectorLike | Edge], guides: Iterable[VectorLike | Edge], tolerance: float = 0.0003) -> Face
  #   profiles: Profiles defined as points or edges
  #   guides: Guides defined as points or edges
  #   tolerance: Tolerance used for surface construction and intersection calculations

  # Create a unlimited size Face aligned with plane
  # build123d.topology.two_d.Face.make_plane (method)
  make_plane(plane: Plane = Plane.XY) -> Face

  # make_rect
  # Remarks: Make a Rectangle centered on center with the given normal Returns: Face: The centered rectangle
  # build123d.topology.two_d.Face.make_rect (method)
  make_rect(width: float, height: float, plane: Plane = Plane.XY) -> Face
  #   width: width (local x)
  #   height: height (local y)
  #   plane: base plane

  # Create Non-Planar Face
  # Remarks: Create a potentially non-planar face bounded by exterior (wire or edges), optionally refined by surface_points with optional holes defined by interior_wires. Returns: Face: Potentially non-planar face
  # Throws: RuntimeError: Internal error building face
  # Throws: RuntimeError: Error building non-planar face with provided surface_points
  # Throws: RuntimeError: Error adding interior hole
  # Throws: RuntimeError: Generated face is invalid
  # build123d.topology.two_d.Face.make_surface (method)
  make_surface(exterior: Wire | Iterable[Edge], surface_points: Iterable[VectorLike] | None = None, interior_wires: Iterable[Wire] | None = None) -> Face
  #   exterior: Perimeter of face
  #   surface_points: Points on the surface that refine the shape
  #   interior_wires: Hole(s) in the face

  # make_surface_from_array_of_points
  # Remarks: Approximate a spline surface through the provided 2d array of points. The first dimension correspond to points on the vertical direction in the parameter space of the face. The second dimension correspond to points on the horizontal direction in the parameter space of the face. The 2 dimensions are U,V dimensions of the parameter space of the face. Returns: Face: a potentially non-planar face defined by points
  # Throws: ValueError: B-spline approximation failed
  # build123d.topology.two_d.Face.make_surface_from_array_of_points (method)
  make_surface_from_array_of_points(points: list[list[VectorLike]], tol: float = 0.01, smoothing: tuple[float, float, float] | None = None, min_deg: int = 1, max_deg: int = 3) -> Face
  #   points: a 2D list of points, first dimension is V parameters second is U parameters
  #   tol: tolerance of the algorithm
  #   smoothing: optional tuple of 3 weights use for variational smoothing
  #   min_deg: minimum spline degree
  #   max_deg: maximum spline degree

  # make_surface_from_curves
  # Remarks: Create a ruled surface out of two edges or two wires. If wires are used then these must have the same number of edges. Returns: Face: potentially non planar surface
  # build123d.topology.two_d.Face.make_surface_from_curves (method)
  make_surface_from_curves(*args, **kwargs) -> Face

  # make_surface_patch
  # Remarks: Create a potentially non-planar face patch bounded by exterior edges which can be optionally refined using support faces to ensure e.g. tangent surface continuity. Also can optionally refine the surface using surface points. Returns: Face: Potentially non-planar face
  # Throws: RuntimeError: Error building non-planar face with provided constraints
  # Throws: RuntimeError: Generated face is invalid
  # build123d.topology.two_d.Face.make_surface_patch (method)
  make_surface_patch(edge_face_constraints: Iterable[tuple[Edge, Face, ContinuityLevel]] | None = None, edge_constraints: Iterable[Edge] | None = None, point_constraints: Iterable[VectorLike] | None = None) -> Face
  #   edge_face_constraints: Edges defining perimeter of face with adjacent support faces subject to ContinuityLevel
  #   edge_constraints: Edges defining perimeter of face without adjacent support faces
  #   point_constraints: Points on the surface that refine the shape

  # sweep
  # Remarks: Revolve an Edge around an axis. Returns: Face: resulting face
  # build123d.topology.two_d.Face.revolve (method)
  revolve(profile: Edge, angle: float, axis: Axis) -> Face
  #   profile: the object to sweep
  #   angle: the angle to revolve through
  #   axis: rotation Axis

  # sew faces
  # Remarks: Group contiguous faces and return them in a list of ShapeList Returns: list[ShapeList[Face]]: grouped contiguous faces
  # Throws: RuntimeError: OCCT SewedShape generated unexpected output
  # build123d.topology.two_d.Face.sew_faces (method)
  sew_faces(faces: Iterable[Face]) -> list[ShapeList[Face]]
  #   faces: Faces to sew together

  # sweep
  # Remarks: Sweep a 1D profile along a 1D path. Both the profile and path must be composed of only 1 Edge. Returns: Face: resulting face, may be non-planar
  # Throws: ValueError: Only 1 Edge allowed in profile & path
  # build123d.topology.two_d.Face.sweep (method)
  sweep(profile: Curve | Edge | Wire, path: Curve | Edge | Wire, transition = Transition.TRANSFORMED) -> Face
  #   profile: the object to sweep
  #   path: the path to follow when sweeping
  #   transition: handling of profile orientation at C1 path discontinuities

  # Center of Face
  # Remarks: Return the center based on center_of Returns: Vector: center
  # build123d.topology.two_d.Face.center (method)
  center(center_of: CenterOf = CenterOf.GEOMETRY) -> Vector
  #   center_of: centering option

  # Apply 2D chamfer to a face
  # Remarks: Returns: Face: face with a chamfered corner(s)
  # Throws: ValueError: Cannot chamfer at this location
  # Throws: ValueError: One or more vertices are not part of edge
  # build123d.topology.two_d.Face.chamfer_2d (method)
  chamfer_2d(distance: float, distance2: float, vertices: Iterable[Vertex], edge: Edge | None = None) -> Face
  #   distance: chamfer length
  #   distance2: chamfer length
  #   vertices: vertices to chamfer
  #   edge: identifies the side where length is measured

  # Apply 2D fillet to a face
  # Remarks: Returns:
  # build123d.topology.two_d.Face.fillet_2d (method)
  fillet_2d(radius: float, vertices: Iterable[Vertex]) -> Face
  #   radius: float
  #   vertices: Iterable[Vertex]

  # Return the Geom Surface for this Face
  # build123d.topology.two_d.Face.geom_adaptor (method)
  geom_adaptor() -> Geom_Surface

  # Extract the inner or hole wires from this Face
  # build123d.topology.two_d.Face.inner_wires (method)
  inner_wires() -> ShapeList[Wire]

  # Is this planar face coplanar with the provided plane
  # build123d.topology.two_d.Face.is_coplanar (method)
  is_coplanar(plane: Plane) -> bool

  # Point inside Face
  # Remarks: Returns whether or not the point is inside a Face within the specified tolerance. Points on the edge of the Face are considered inside. Returns: bool: indicating whether or not point is within Face
  # build123d.topology.two_d.Face.is_inside (method)
  is_inside(point: VectorLike, tolerance: float = 1e-06) -> bool
  #   point: VectorLike
  #   tolerance: float

  # location_at
  # Remarks: Get the location (origin and orientation) on the surface of the face. This method supports two overloads: 1. `location_at(u: float, v: float, *, x_dir: VectorLike | None = None) -> Location` - Specifies the point in normalized UV parameter space of the face. - `u` and `v` are floats between 0.0 and 1.0. - Optionally override the local X direction using `x_dir`. 2. `location_at(surface_point: VectorLike, *, x_dir: VectorLike | None = None) -> Location` - Projects the given 3D point onto the face surface. - The point must be reasonably close to the face. - Optionally override the local X direction using `x_dir`. If no arguments are provided, the location at the center of the face (u=0.5, v=0.5) is returned. Returns: Location: A full 3D placement at the specified point on the face surface.
  # Throws: ValueError: If only one of `u` or `v` is provided or invalid keyword args are passed.
  # build123d.topology.two_d.Face.location_at (method)
  location_at(surface_point: VectorLike | None = None, *, x_dir: VectorLike | None = None) -> Location
  location_at(u: float, v: float, *, x_dir: VectorLike | None = None) -> Location
  #   surface_point: A 3D point near the surface (optional)
  #   x_dir: Direction for the local X axis

  # Make Holes in Face
  # Remarks: Create holes in the Face 'self' from interior_wires which must be entirely interior. Note that making holes in faces is more efficient than using boolean operations with solid object. Also note that OCCT core may fail unless the orientation of the wire is correct - use `Wire(forward_wire.wrapped.Reversed())` to reverse a wire. Example: For example, make a series of slots on the curved walls of a cylinder. .. image:: slotted_cylinder.png Returns: Face: 'self' with holes
  # Throws: RuntimeError: adding interior hole in non-planar face with provided interior_wires
  # Throws: RuntimeError: resulting face is not valid
  # build123d.topology.two_d.Face.make_holes (method)
  make_holes(interior_wires: list[Wire]) -> Face
  #   interior_wires: list[Wire]

  # normal_at
  # Remarks: Computes the normal vector at the desired location on the face. Returns: Vector: surface normal direction
  # build123d.topology.two_d.Face.normal_at (method)
  normal_at(surface_point: VectorLike | None = None) -> Vector
  normal_at(u: float, v: float) -> Vector
  #   surface_point: a point that lies on the surface where the normal

  # Extract the perimeter wire from this Face
  # build123d.topology.two_d.Face.outer_wire (method)
  outer_wire() -> Wire

  # position_at
  # Remarks: Computes a point on the Face given u, v coordinates. Returns: Vector: point on Face
  # build123d.topology.two_d.Face.position_at (method)
  position_at(u: float, v: float) -> Vector
  #   u: the horizontal coordinate in the parameter space of the Face, between 0.0 and 1.0
  #   v: the vertical coordinate in the parameter space of the Face, between 0.0 and 1.0

  # Project Face to target Object
  # Remarks: Project a Face onto a Shape generating new Face(s) on the surfaces of the object. A projection with no taper is illustrated below: .. image:: flatProjection.png :alt: flatProjection Note that an array of faces is returned as the projection might result in faces on the "front" and "back" of the object (or even more if there are intermediate surfaces in the projection path). faces "behind" the projection are not returned. Returns: ShapeList[Face]: Face(s) projected on target object ordered by distance
  # build123d.topology.two_d.Face.project_to_shape (method)
  project_to_shape(target_object: Shape, direction: VectorLike) -> ShapeList[Face | Shell]
  #   target_object: Object to project onto
  #   direction: projection direction

  # to_arcs
  # Remarks: Approximate planar face with arcs and straight line segments. This is a utility used internally to convert or adapt a face for Boolean operations. Its purpose is not typically for general use, but rather as a helper within the Boolean kernel to ensure input faces are in a compatible and canonical form. Returns: Face: approximated face
  # build123d.topology.two_d.Face.to_arcs (method)
  to_arcs(tolerance: float = 0.001) -> Face
  #   tolerance: Approximation tolerance

  # without_holes
  # Remarks: Remove all of the holes from this face. Returns: Face: A new Face instance identical to the original but without any holes.
  # build123d.topology.two_d.Face.without_holes (method)
  without_holes() -> Face

  # Return the outerwire, generate a warning if inner_wires present
  # build123d.topology.two_d.Face.wire (method)
  wire() -> Wire

  # wrap
  # Remarks: Wrap a planar 2D shape onto a 3D surface. This method conforms a 2D shape defined on the XY plane (Edge, Wire, or Face) to the curvature of a non-planar 3D Face (the target surface), starting at a specified surface location. The operation attempts to preserve the original edge lengths and shape as closely as possible while minimizing the geometric distortion that naturally arises when mapping flat geometry onto curved surfaces. The wrapping process follows the local orientation of the surface and progressively fits each edge along the curvature. To help ensure continuity, the first and last edges are extended and trimmed to close small gaps introduced by distortion. The final shape is tightly aligned to the surface geometry. This method is useful for applying flat features—such as decorative patterns, cutouts, or boundary outlines—onto curved or freeform surfaces while retaining their original proportions. Returns: Edge | Wire | Face: wrapped shape
  # Throws: ValueError: Invalid planar shape
  # build123d.topology.two_d.Face.wrap (method)
  wrap(planar_shape: Edge, surface_loc: Location, tolerance: float = 0.001, extension_factor: float = 0.1) -> Edge
  wrap(planar_shape: Wire, surface_loc: Location, tolerance: float = 0.001, extension_factor: float = 0.1) -> Wire
  wrap(planar_shape: Face, surface_loc: Location, tolerance: float = 0.001, extension_factor: float = 0.1) -> Face
  #   planar_shape: flat shape to wrap around surface
  #   surface_loc: location on surface to wrap
  #   tolerance: maximum allowed error
  #   extension_factor: amount to extend the wrapped first and last edges to allow them to cross

  # wrap_faces
  # Remarks: Wrap a sequence of 2D faces onto a 3D surface, aligned along a guiding path. This method places multiple planar `Face` objects (defined in the XY plane) onto a curved 3D surface (`self`), following a given path (Wire or Edge) that lies on or closely follows the surface. Each face is spaced along the path according to its original horizontal (X-axis) position, preserving the relative layout of the input faces. The wrapping process attempts to maintain the shape and size of each face while minimizing distortion. Each face is repositioned to the origin, then individually wrapped onto the surface starting at a specific point along the path. The face's new orientation is defined using the path's tangent direction and the surface normal at that point. This is particularly useful for placing a series of features—such as embossed logos, engraved labels, or patterned tiles—onto a freeform or cylindrical surface, aligned along a reference edge or curve. Returns: ShapeList[Face]: A list of wrapped face objects, aligned and conformed to the surface.
  # build123d.topology.two_d.Face.wrap_faces (method)
  wrap_faces(faces: Iterable[Face], path: Wire | Edge, start: float = 0.0) -> ShapeList[Face]
  #   faces: An iterable of 2D planar faces to be wrapped
  #   path: A curve on the target surface that defines the alignment direction
  #   start: The relative starting point on the path (between 0.0 and 1.0) where the first face should be placed

# Category: two_d
# A Shell is a fundamental component in build123d's topological data structure
# Remarks: representing a connected set of faces forming a closed surface in 3D space. As part of a geometric model, it defines a watertight enclosure, commonly encountered in solid modeling. Shells group faces in a coherent manner, playing a crucial role in representing complex shapes with voids and surfaces. This hierarchical structure allows for efficient handling of surfaces within a model, supporting various operations and analyses.
# build123d.topology.two_d.Shell (class)
class Shell(Mixin2D)

  # Build a shell from an OCCT TopoDS_Shape/TopoDS_Shell
  # build123d.topology.two_d.Shell.__init__ (constructor)
  Shell(obj: TopoDS_Shell | Face | Iterable[Face] | None = None, label: str = '', color: Color | None = None, parent: Compound | None = None)
  #   obj: OCCT Shell, Face or Faces
  #   label: Defaults to ''
  #   color: Defaults to None
  #   parent: assembly parent

  # volume - the volume of this Shell if manifold, otherwise zero
  volume: float

  # extrude
  # Remarks: Extrude a Wire into a Shell. Returns: Edge: extruded shape
  # Throws: ValueError: Unsupported class
  # Throws: RuntimeError: Generated invalid result
  # build123d.topology.two_d.Shell.extrude (method)
  extrude(obj: Wire, direction: VectorLike) -> Shell
  #   direction: direction and magnitude of extrusion

  # make loft
  # Remarks: Makes a loft from a list of wires and vertices. Vertices can appear only at the beginning or end of the list, but cannot appear consecutively within the list nor between wires. Wires may be closed or opened. Returns: Shell: Lofted object
  # Throws: ValueError: Too few wires
  # build123d.topology.two_d.Shell.make_loft (method)
  make_loft(objs: Iterable[Vertex | Wire], ruled: bool = False) -> Shell
  #   objs: wire perimeters or vertices
  #   ruled: stepped or smooth

  # sweep
  # Remarks: Revolve a 1D profile around an axis. Returns: Shell: resulting shell
  # build123d.topology.two_d.Shell.revolve (method)
  revolve(profile: Curve | Wire, angle: float, axis: Axis) -> Face
  #   profile: the object to revolve
  #   angle: the angle to revolve through
  #   axis: rotation Axis

  # sweep
  # Remarks: Sweep a 1D profile along a 1D path Returns: Shell: resulting Shell, may be non-planar
  # build123d.topology.two_d.Shell.sweep (method)
  sweep(profile: Curve | Edge | Wire, path: Curve | Edge | Wire, transition = Transition.TRANSFORMED) -> Shell
  #   profile: the object to sweep
  #   path: the path to follow when sweeping
  #   transition: handling of profile orientation at C1 path discontinuities

  # Center of mass of the shell
  # build123d.topology.two_d.Shell.center (method)
  center() -> Vector

  # location_at
  # Remarks: Get the location (origin and orientation) on the surface of the shell. Returns: Location: A full 3D placement at the specified point on the shell surface.
  # build123d.topology.two_d.Shell.location_at (method)
  location_at(surface_point: VectorLike, *, x_dir: VectorLike | None = None) -> Location
  #   surface_point: A 3D point near the surface
  #   x_dir: Direction for the local X axis

# Category: two_d
# Additional methods to add to Face and Shell class
# build123d.topology.two_d.Mixin2D (class)
class Mixin2D(ABC, Shape)

  # Returns the right type of wrapper, given a OCCT object
  # build123d.topology.two_d.Mixin2D.cast (method)
  cast(obj: TopoDS_Shape) -> Vertex | Edge | Wire | Face | Shell

  # Unused - only here because Mixin1D is a subclass of Shape
  # build123d.topology.two_d.Mixin2D.extrude (method)
  extrude(obj: Shape, direction: VectorLike) -> Edge | Face | Shell | Solid | Compound

  # Reverse normal operator -
  # build123d.topology.two_d.Mixin2D.__neg__ (method)
  __neg__() -> Self  # -Mixin2D

  # split_by_perimeter
  # Remarks: Divide the faces of this object into those within the perimeter and those outside the perimeter. Note: this method may fail if the perimeter intersects shape edges. Returns: Union[Face | Shell | ShapeList[Face] | None, Tuple[Face | Shell | ShapeList[Face] | None]: The result of the split operation. - **Keep.INSIDE**: Returns the inside part as a `Shell` or `Face`, or `None` if no inside part is found. - **Keep.OUTSIDE**: Returns the outside part as a `Shell` or `Face`, or `None` if no outside part is found. - **Keep.BOTH**: Returns a tuple `(inside, outside)` where each element is either a `Shell`, `Face`, or `None` if no corresponding part is found.
  # Throws: ValueError: perimeter must be closed
  # Throws: ValueError: keep must be one of Keep.INSIDE|OUTSIDE|BOTH
  # build123d.topology.two_d.Mixin2D.split_by_perimeter (method)
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.INSIDE, Keep.OUTSIDE]) -> Face | Shell | ShapeList[Face] | None
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.BOTH]) -> tuple[Face | Shell | ShapeList[Face] | None, Face | Shell | ShapeList[Face] | None]
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.INSIDE] = Keep.INSIDE) -> Face | Shell | ShapeList[Face] | None
  #   perimeter: closed perimeter
  #   keep: which object(s) to return

  # Find point and normal at intersection
  # Remarks: Return both the point(s) and normal(s) of the intersection of the axis and the shape Returns: list[tuple[Vector, Vector]]: Point and normal of intersection
  # build123d.topology.two_d.Mixin2D.find_intersection_points (method)
  find_intersection_points(other: Axis, tolerance: float = TOLERANCE) -> list[tuple[Vector, Vector]]

  # Find boundary contacts between this 2D shape and another shape
  # Remarks: Returns the highest-dimensional contact at each location, filtered to avoid returning lower-dimensional boundaries of higher-dimensional contacts. For Face/Shell: - Face + Face → Vertex (shared corner or crossing point without edge/face overlap) - Face + Edge/Vertex → no touch (intersect already returns dim 0) Returns: ShapeList of contact shapes (Vertex only for 2D+2D)
  # build123d.topology.two_d.Mixin2D.touch (method)
  touch(other: Shape, tolerance: float = 1e-06, found_faces: ShapeList | None = None, found_edges: ShapeList | None = None) -> ShapeList
  #   other: Shape to find contacts with
  #   tolerance: tolerance for contact detection
  #   found_faces: pre-found faces to filter against (from Mixin3D.touch)
  #   found_edges: pre-found edges to filter against (from Mixin3D.touch)

  # A location from a face or shell
  # build123d.topology.two_d.Mixin2D.location_at (method)
  location_at(*args: Any, **kwargs: Any) -> Location

  # Return a copy of self moved along the normal by amount
  # build123d.topology.two_d.Mixin2D.offset (method)
  offset(amount: float) -> Self

  # project_to_viewport
  # Remarks: Project a shape onto a viewport returning visible and hidden Edges. Returns: tuple[ShapeList[Edge],ShapeList[Edge]]: visible & hidden Edges
  # build123d.topology.two_d.Mixin2D.project_to_viewport (method)
  project_to_viewport(viewport_origin: VectorLike, viewport_up: VectorLike = (0, 0, 1), look_at: VectorLike | None = None, focus: float | None = None) -> tuple[ShapeList[Edge], ShapeList[Edge]]
  #   viewport_origin: location of viewport
  #   viewport_up: direction of the viewport y axis
  #   look_at: point to look at
  #   focus: the focal length for perspective projection Defaults to None (orthographic projection)
