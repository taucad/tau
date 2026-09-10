# build123d — shape_core

10 top-level symbols. Signatures are verbatim python.

// Abstract base class that requires comparison methods
Comparable

// Result of a Shape.groupby operation
GroupBy

GroupBy(key_f: Callable[[T], K], shapelist: Iterable[T], reverse: bool = False)

// Select group by key
group(key: K)

// Select group by shape
group_for(shape: T)

// Joint
Joint

Joint(label: str, parent: BuildPart | Solid | Compound)
// parent: object that joint to bound to

// Location of joint
location: Location

// A CAD object positioned in global space to illustrate the joint
symbol: Compound

// All derived classes must provide a connect_to method
connect_to(\*args, \*\*kwargs)

// Return relative location to another joint
relative_to(\*args, \*\*kwargs) -> Location

// Shape
Shape

Shape(obj: TopoDS_Shape | None = None, label: str = '', color: ColorLike | None = None, parent: Compound | None = None)
// obj: OCCT object
// label: Defaults to ''
// color: Defaults to None
// parent: assembly parent

// OCP TopoDS object
wrapped

// area -the surface area of all faces in this Shape
area: float

// Get the shape's color
color: None | Color

// Gets the underlying geometry type
geom_type: GeomType

// is_manifold
is_manifold: bool

// Returns true if this shape is null
is_null: bool

// Is the shape a planar face even though its geom_type may not be PLANE
is_planar_face: bool

// Returns True if no defect is detected on the shape S or any of its
is_valid: bool

// The location of this Shape relative to the global coordinate system
global_location: Location

// Get this Shape's Location
location: Location

// Compute the inertia matrix (moment of inertia tensor) of the shape
matrix_of_inertia: list[list[float]]

// Get the orientation component of this Shape's Location
orientation: Vector

// Get the position component of this Shape's Location
position: Vector

// Compute the principal moments of inertia and their corresponding axes
principal_properties: list[tuple[Vector, float]]

// Return the shape type string for this class
shape_type: Shapes

// Compute the static moments (first moments of mass) of the shape
static_moments: tuple[float, float, float]

// Returns the right type of wrapper, given a OCCT object
cast(obj: TopoDS_Shape) -> Self

// extrude
extrude(obj: Shape, direction: VectorLike) -> Edge | Face | Shell | Solid | Compound
// direction: direction and magnitude of extrusion

// combined center
combined_center(objects: Iterable[Shape], center_of: CenterOf = CenterOf.MASS) -> Vector
// objects: list of objects
// center_of: centering option

// Calculates the 'mass' of an object
compute_mass(obj: Shape) -> float
// obj: Shape

// Helper to extract entities of a specific type from a shape
get_shape_list(shape: Shape, entity_type: Literal['Vertex']) -> ShapeList[Vertex]
get_shape_list(shape: Shape, entity_type: Literal['Edge']) -> ShapeList[Edge]
get_shape_list(shape: Shape, entity_type: Literal['Wire']) -> ShapeList[Wire]
get_shape_list(shape: Shape, entity_type: Literal['Face']) -> ShapeList[Face]
get_shape_list(shape: Shape, entity_type: Literal['Shell']) -> ShapeList[Shell]
get_shape_list(shape: Shape, entity_type: Literal['Solid']) -> ShapeList[Solid]
get_shape_list(shape: Shape, entity_type: Literal['Compound']) -> ShapeList[Compound]

// Return the single entity of the requested type
get_single_shape(shape: Shape, entity_type: Literal['Vertex']) -> Vertex
get_single_shape(shape: Shape, entity_type: Literal['Edge']) -> Edge
get_single_shape(shape: Shape, entity_type: Literal['Wire']) -> Wire
get_single_shape(shape: Shape, entity_type: Literal['Face']) -> Face
get_single_shape(shape: Shape, entity_type: Literal['Shell']) -> Shell
get_single_shape(shape: Shape, entity_type: Literal['Solid']) -> Solid
get_single_shape(shape: Shape, entity_type: Literal['Compound']) -> Compound

// Register a composite constructor without importing it here
register_composite_factory(dimension: int | None, factory: CompositeFactory) -> None

// Build the registered composite for a dimension
make_composite(shapes: Iterable[Shape], dimension: int | None = None) -> Shape

// Create a bounding box for this Shape
bounding_box(tolerance: float | None = None, optimal: bool = True) -> BoundBox
// tolerance: Defaults to None

// clean
clean() -> Self

// Points on two shapes where the distance between them is minimal
closest_points(other: Shape | VectorLike) -> tuple[Vector, Vector]

// Return the Compound
compound() -> Compound

// compounds - all the compounds in this Shape
compounds() -> ShapeList[Compound]

// Copy common object attributes to target
copy_attributes_to(target: Shape, exceptions: Iterable[str] | None = None)
// target: object to gain attributes
// exceptions: attributes not to copy

// Remove the positional arguments from this Shape
cut(\*to_cut: Shape) -> Self | Compound
// to_cut: Shape

// Minimal distance between two shapes
distance(other: Shape) -> float
// other: Shape

// Minimal distance between two shapes
distance_to(other: Shape | VectorLike) -> float

// Minimal distance between two shapes and the points on each shape
distance_to_with_closest_points(other: Shape | VectorLike) -> tuple[float, Vector, Vector]

// Minimal distances to between self and other shapes
distances(\*others: Shape) -> Iterator[float]
// others: Shape

// Return the Edge
edge() -> Edge

// edges - all the edges in this Shape - subclasses may override
edges() -> ShapeList[Edge]

// Return all of the TopoDS sub entities of the given type
entities(topo_type: Shapes) -> list[TopoDS_Shape]

// Return the Face
face() -> Face

// faces - all the faces in this Shape
faces() -> ShapeList[Face]

// Line Intersection
faces_intersected_by_axis(axis: Axis, tol: float = 0.0001) -> ShapeList[Face]
// axis: Axis on which the intersection line rests
// tol: Intersection tolerance

// fix - try to fix shape if not valid
fix() -> Self

// fuse
fuse(\*to_fuse: Shape, glue: bool = False, tol: float | None = None) -> Self | Compound
// to_fuse: shapes to fuse
// glue: performance improvement for some shapes
// tol: tolerance

// Retrieve the first level of child shapes from the shape
get_top_level_shapes() -> ShapeList[Shape]

// Find where bodies/interiors meet (overlap or crossing geometry)
intersect(\*to_intersect: Shape | Vector | Location | Axis | Plane, tolerance: float = 1e-06, include_touched: bool = False) -> ShapeList | None
// to_intersect: Shape(s) or geometry objects to intersect with
// tolerance: tolerance for intersection detection
// include_touched: if True, include boundary contacts without interior overlap (only relevant when Solids are involved)

// Find boundary contacts between this shape and another
touch(other: Shape, tolerance: float = 1e-06) -> ShapeList
// other: Shape to find contacts with
// tolerance: tolerance for contact detection

// Returns True if two shapes are equal, i.e
is_equal(other: Shape) -> bool
// other: Shape

// Returns True if other and this shape are same, i.e
is_same(other: Shape) -> bool
// other: Shape

// Apply a location in absolute sense to self
locate(loc: Location) -> Self
// loc: Location

// located
located(loc: Location) -> Self
// loc: new absolute location

// Generate triangulation if none exists
mesh(tolerance: float, angular_tolerance: float = 0.1)
// tolerance: float
// angular_tolerance: float

// Applies a mirror transform to this Shape
mirror(mirror_plane: Plane | None = None) -> Self
// mirror_plane: The plane to mirror about

// Apply a location in relative sense (i.e
move(loc: Location) -> Self
// loc: Location

// moved
moved(loc: Location | Plane) -> Self
// loc: new location relative to current location

// Create an oriented bounding box for this Shape
oriented_bounding_box() -> OrientedBoundBox

// Projected Faces following the given path on Shape
project_faces(faces: list[Face] | Compound, path: Wire | Edge, start: float = 0) -> ShapeList[Face]
// faces: faces to project
// path: Path on the Shape to follow
// start: Relative location on path to start the faces

// Compute the radius of gyration of the shape about a given axis
radius_of_gyration(axis: Axis) -> float
// axis: The axis about which the radius of gyration is computed

// Change the location of self while keeping it geometrically similar
relocate(loc: Location)
// loc: new location to set for self

// rotate a copy
rotate(axis: Axis, angle: float, transform: bool = False) -> Self
// axis: rotation Axis
// angle: angle to rotate, in degrees
// transform: regenerate the shape instead of just changing its location

// Scale this shape about a point
scale(factor: float | tuple[float, float, float], about: VectorLike | None = None) -> Self
// factor: uniform scale factor or three scale factors for the X, Y and Z directions
// about: point to scale about

// Return the Shell
shell() -> Shell

// shells - all the shells in this Shape
shells() -> ShapeList[Shell]

// Display internal topology
show_topology(limit_class: Literal['Compound', 'Edge', 'Face', 'Shell', 'Solid', 'Vertex', 'Wire'] = 'Vertex', show_center: bool | None = None) -> str
// limit_class: type of displayed leaf node
// show_center: If None, shows the Location of Compound 'assemblies' and the bounding box center of Shapes

// Return the Solid
solid() -> Solid

// solids - all the solids in this Shape
solids() -> ShapeList[Solid]

// split
split(tool: TrimmingTool, keep: Literal[Keep.TOP, Keep.BOTTOM]) -> Self | list[Self] | None
split(tool: TrimmingTool, keep: Literal[Keep.ALL]) -> list[Self]
split(tool: TrimmingTool, keep: Literal[Keep.BOTH]) -> tuple[Self | list[Self] | None, Self | list[Self] | None]
split(tool: TrimmingTool, keep: Literal[Keep.INSIDE, Keep.OUTSIDE]) -> None
split(tool: TrimmingTool) -> Self | list[Self] | None
// keep: which object(s) to save

// split_by_perimeter
split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.INSIDE, Keep.OUTSIDE]) -> Face | Shell | ShapeList[Face] | None
split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.BOTH]) -> tuple[Face | Shell | ShapeList[Face] | None, Face | Shell | ShapeList[Face] | None]
split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.INSIDE] = Keep.INSIDE) -> Face | Shell | ShapeList[Face] | None
// perimeter: closed perimeter
// keep: which object(s) to return

// General triangulated approximation
tessellate(tolerance: float, angular_tolerance: float = 0.1) -> tuple[list[Vector], list[tuple[int, int, int]]]

// to_splines
to_splines(degree: int = 3, tolerance: float = 0.001, nurbs: bool = False) -> Self
// degree: Maximum degree
// tolerance: Approximation tolerance
// nurbs: Use rational splines

// Apply affine transform
transform_geometry(t_matrix: Matrix) -> Self
// t_matrix: affine transformation matrix

// Apply affine transform without changing type
transform_shape(t_matrix: Matrix) -> Self
// t_matrix: affine transformation matrix

// Transform Shape
transformed(rotate: VectorLike = (0, 0, 0), offset: VectorLike = (0, 0, 0)) -> Self
// rotate: 3-tuple of angles to rotate, in degrees
// offset: 3-tuple to offset

// Translates this shape through a transformation
translate(vector: VectorLike, transform: bool = False) -> Self
// vector: relative movement vector
// transform: regenerate the shape instead of just changing its location Defaults to False

// Return the Wire
wire() -> Wire

// wires - all the wires in this Shape
wires() -> ShapeList[Wire]

// Return the Vertex
vertex() -> Vertex

// vertices - all the vertices in this Shape
vertices() -> ShapeList[Vertex]

// Subclass of list with custom filter and sort methods appropriate to CAD
ShapeList

// First element in the ShapeList
first: T

// Last element in the ShapeList
last: T

// Expand by dissolving compounds, wires, and shells, filtering nulls
expand() -> ShapeList

// The average of the center of objects within the ShapeList
center() -> Vector

// Return the Compound
compound() -> Compound

// compounds - all the compounds in this ShapeList
compounds() -> ShapeList[Compound]

// Return the Edge
edge() -> Edge

// edges - all the edges in this ShapeList
edges() -> ShapeList[Edge]

// Return the Face
face() -> Face

// faces - all the faces in this ShapeList
faces() -> ShapeList[Face]

// filter by
filter_by(filter_by: Callable[[T], bool] | Axis | Plane | GeomType | property, reverse: bool = False, tolerance: float = 1e-05) -> ShapeList[T]
// filter_by: function, axis, plane, or geom type to filter and possibly sort by
// reverse: invert the geom type filter
// tolerance: maximum deviation from axis

// filter by position
filter_by_position(axis: Axis, minimum: float, maximum: float, inclusive: tuple[bool, bool] = (True, True)) -> ShapeList[T]
// axis: axis to sort by
// minimum: minimum value
// maximum: maximum value
// inclusive: include min,max values

// group by
group_by(group_by: Callable[[T], K] | Axis | Edge | Wire | SortBy | property = Axis.Z, reverse: bool = False, tol_digits: int = 6) -> GroupBy[T, K]
// reverse: flip order of sort
// tol_digits: Tolerance for building the group keys by round(key, tol_digits)

// Return the Shell
shell() -> Shell

// shells - all the shells in this ShapeList
shells() -> ShapeList[Shell]

// Return the Solid
solid() -> Solid

// solids - all the solids in this ShapeList
solids() -> ShapeList[Solid]

// sort by
sort_by(sort_by: Callable[[T], K] | Axis | Edge | Wire | SortBy | property = Axis.Z, reverse: bool = False) -> ShapeList[T]
// reverse: flip order of sort

// Sort by distance
sort_by_distance(other: Shape | VectorLike, reverse: bool = False) -> ShapeList[T]
// other: reference object
// reverse: flip order of sort

// Return the Vertex
vertex() -> Vertex

// vertices - all the vertices in this ShapeList
vertices() -> ShapeList[Vertex]

// Return the Wire
wire() -> Wire

// wires - all the wires in this ShapeList
wires() -> ShapeList[Wire]

// Skip clean context for use in operator driven code where clean=False wouldn't work
SkipClean

// Downcasts a TopoDS object to suitable specialized type
downcast(obj: TopoDS_Shape) -> TopoDS_Shape
// obj: TopoDS_Shape

// Fix a TopoDS object to suitable specialized type
fix(obj: TopoDS_Shape) -> TopoDS_Shape
// obj: TopoDS_Shape

// Return a key function that yields topological distance to `other`
topo_distance_to(other: Shape | Iterable[Shape]) -> Callable[[Shape], int | float]
// other: reference shape or shapes

// Strip unnecessary Compound wrappers
unwrap_topods_compound(compound: TopoDS_Compound, fully: bool = True) -> TopoDS_Compound | TopoDS_Shape
// compound: The TopoDS_Compound to unwrap
// fully: return base shape without any TopoDS_Compound wrappers (otherwise one TopoDS_Compound is left)
