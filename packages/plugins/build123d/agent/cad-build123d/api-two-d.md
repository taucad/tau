# build123d — two_d

3 top-level symbols. Signatures are verbatim python.

// A Face in build123d represents a 3D bounded surface within the topological data
Face

Face(obj: TopoDS_Face | Plane, label: str = '', color: Color | None = None, parent: Compound | None = None)
Face(outer_wire: Wire, inner_wires: Iterable[Wire] | None = None, label: str = '', color: Color | None = None, parent: Compound | None = None)
// obj: OCCT Face or Plane
// label: Defaults to ''
// color: Defaults to None
// parent: assembly parent

// Calculate the total surface area of the face, including the areas of any holes
area_without_holes: float

// Get the rotational axis of a cylinder or torus
axis_of_rotation: None | Axis

// Computes and returns the axes of symmetry for a planar face
axes_of_symmetry: list[Axis]

// Location at the center of face
center_location: Location

// geometry of planar face
geometry: None | str

// Determine whether a given face is convex relative to its underlying geometry
is_circular_convex: bool

// Determine whether a given face is concave relative to its underlying geometry
is_circular_concave: bool

// Is the face planar even though its geom_type may not be PLANE - if so return Plane
is_planar: Plane | None

// length of planar face
length: None | float

// Return the major and minor radii of a torus otherwise None
radii: None | tuple[float, float]

// Return the radius of a cylinder or sphere, otherwise None
radius: None | float

// Return the seams contained within this Face
seams: ShapeList[Edge]

// Return the semi angle of a cone, otherwise None
semi_angle: None | float

// Create a planar face from a face's parametric-space boundary
uv_face: Face

// volume - the volume of this Face, which is always zero
volume: float

// width of planar face
width: None | float

// extrude
extrude(obj: Edge, direction: VectorLike) -> Face
// direction: direction and magnitude of extrusion

// make_bezier_surface
make_bezier_surface(points: list[list[VectorLike]], weights: list[list[float]] | None = None) -> Face
// points: a 2D list of control points
// weights: control point weights

// Constructs a Gordon surface from a network of profile and guide curves
make_gordon_surface(profiles: Iterable[VectorLike | Edge], guides: Iterable[VectorLike | Edge], tolerance: float = 0.0003) -> Face
// profiles: Profiles defined as points or edges
// guides: Guides defined as points or edges
// tolerance: Tolerance used for surface construction and intersection calculations

// Create a unlimited size Face aligned with plane
make_plane(plane: Plane = Plane.XY) -> Face

// make_rect
make_rect(width: float, height: float, plane: Plane = Plane.XY) -> Face
// width: width (local x)
// height: height (local y)
// plane: base plane

// Create Non-Planar Face
make_surface(exterior: Wire | Iterable[Edge], surface_points: Iterable[VectorLike] | None = None, interior_wires: Iterable[Wire] | None = None) -> Face
// exterior: Perimeter of face
// surface_points: Points on the surface that refine the shape
// interior_wires: Hole(s) in the face

// make_surface_from_array_of_points
make_surface_from_array_of_points(points: list[list[VectorLike]], tol: float = 0.01, smoothing: tuple[float, float, float] | None = None, min_deg: int = 1, max_deg: int = 3) -> Face
// points: a 2D list of points, first dimension is V parameters second is U parameters
// tol: tolerance of the algorithm
// smoothing: optional tuple of 3 weights use for variational smoothing
// min_deg: minimum spline degree
// max_deg: maximum spline degree

// make_surface_from_curves
make_surface_from_curves(\*args, \*\*kwargs) -> Face

// make_surface_patch
make_surface_patch(edge_face_constraints: Iterable[tuple[Edge, Face, ContinuityLevel]] | None = None, edge_constraints: Iterable[Edge] | None = None, point_constraints: Iterable[VectorLike] | None = None) -> Face
// edge_face_constraints: Edges defining perimeter of face with adjacent support faces subject to ContinuityLevel
// edge_constraints: Edges defining perimeter of face without adjacent support faces
// point_constraints: Points on the surface that refine the shape

// sweep
revolve(profile: Edge, angle: float, axis: Axis) -> Face
// profile: the object to sweep
// angle: the angle to revolve through
// axis: rotation Axis

// sew faces
sew_faces(faces: Iterable[Face]) -> list[ShapeList[Face]]
// faces: Faces to sew together

// sweep
sweep(profile: Curve | Edge | Wire, path: Curve | Edge | Wire, transition = Transition.TRANSFORMED) -> Face
// profile: the object to sweep
// path: the path to follow when sweeping
// transition: handling of profile orientation at C1 path discontinuities

// Center of Face
center(center_of: CenterOf = CenterOf.GEOMETRY) -> Vector
// center_of: centering option

// Apply 2D chamfer to a face
chamfer_2d(distance: float, distance2: float, vertices: Iterable[Vertex], edge: Edge | None = None) -> Face
// distance: chamfer length
// distance2: chamfer length
// vertices: vertices to chamfer
// edge: identifies the side where length is measured

// Apply 2D fillet to a face
fillet_2d(radius: float, vertices: Iterable[Vertex]) -> Face
// radius: float
// vertices: Iterable[Vertex]

// Return the Geom Surface for this Face
geom_adaptor() -> Geom_Surface

// Extract the inner or hole wires from this Face
inner_wires() -> ShapeList[Wire]

// Is this planar face coplanar with the provided plane
is_coplanar(plane: Plane) -> bool

// Point inside Face
is_inside(point: VectorLike, tolerance: float = 1e-06) -> bool
// point: VectorLike
// tolerance: float

// location_at
location_at(surface_point: VectorLike | None = None, x_dir: VectorLike | None = None) -> Location
location_at(u: float, v: float, x_dir: VectorLike | None = None) -> Location
// surface_point: A 3D point near the surface (optional)
// x_dir: Direction for the local X axis

// Make Holes in Face
make_holes(interior_wires: list[Wire]) -> Face
// interior_wires: list[Wire]

// normal_at
normal_at(surface_point: VectorLike | None = None) -> Vector
normal_at(u: float, v: float) -> Vector
// surface_point: a point that lies on the surface where the normal

// Extract the perimeter wire from this Face
outer_wire() -> Wire

// position_at
position_at(u: float, v: float) -> Vector
// u: the horizontal coordinate in the parameter space of the Face, between 0.0 and 1.0
// v: the vertical coordinate in the parameter space of the Face, between 0.0 and 1.0

// Project Face to target Object
project_to_shape(target_object: Shape, direction: VectorLike) -> ShapeList[Face | Shell]
// target_object: Object to project onto
// direction: projection direction

// to_arcs
to_arcs(tolerance: float = 0.001) -> Face
// tolerance: Approximation tolerance

// without_holes
without_holes() -> Face

// Return the outerwire, generate a warning if inner_wires present
wire() -> Wire

// wrap
wrap(planar_shape: Edge, surface_loc: Location, tolerance: float = 0.001, extension_factor: float = 0.1) -> Edge
wrap(planar_shape: Wire, surface_loc: Location, tolerance: float = 0.001, extension_factor: float = 0.1) -> Wire
wrap(planar_shape: Face, surface_loc: Location, tolerance: float = 0.001, extension_factor: float = 0.1) -> Face
// planar_shape: flat shape to wrap around surface
// surface_loc: location on surface to wrap
// tolerance: maximum allowed error
// extension_factor: amount to extend the wrapped first and last edges to allow them to cross

// wrap_faces
wrap_faces(faces: Iterable[Face], path: Wire | Edge, start: float = 0.0) -> ShapeList[Face]
// faces: An iterable of 2D planar faces to be wrapped
// path: A curve on the target surface that defines the alignment direction
// start: The relative starting point on the path (between 0.0 and 1.0) where the first face should be placed

// A Shell is a fundamental component in build123d's topological data structure
Shell

// Build a shell from an OCCT TopoDS_Shape/TopoDS_Shell
Shell(obj: TopoDS_Shell | Face | Iterable[Face] | None = None, label: str = '', color: Color | None = None, parent: Compound | None = None)
// obj: OCCT Shell, Face or Faces
// label: Defaults to ''
// color: Defaults to None
// parent: assembly parent

// volume - the volume of this Shell if manifold, otherwise zero
volume: float

// extrude
extrude(obj: Wire, direction: VectorLike) -> Shell
// direction: direction and magnitude of extrusion

// make loft
make_loft(objs: Iterable[Vertex | Wire], ruled: bool = False) -> Shell
// objs: wire perimeters or vertices
// ruled: stepped or smooth

// sweep
revolve(profile: Curve | Wire, angle: float, axis: Axis) -> Face
// profile: the object to revolve
// angle: the angle to revolve through
// axis: rotation Axis

// sweep
sweep(profile: Curve | Edge | Wire, path: Curve | Edge | Wire, transition = Transition.TRANSFORMED) -> Shell
// profile: the object to sweep
// path: the path to follow when sweeping
// transition: handling of profile orientation at C1 path discontinuities

// Center of mass of the shell
center() -> Vector

// location_at
location_at(surface_point: VectorLike, x_dir: VectorLike | None = None) -> Location
// surface_point: A 3D point near the surface
// x_dir: Direction for the local X axis

// Tries to determine how wires should be combined into faces
sort_wires_by_build_order(wire_list: list[Wire]) -> list[list[Wire]]
// wire_list: list[Wire]
