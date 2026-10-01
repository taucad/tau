# build123d — shape_core

10 top-level symbols. Signatures are verbatim python.

// Abstract base class that requires comparison methods
Comparable

// Result of a Shape.groupby operation
GroupBy

  // build123d.topology.shape_core.GroupBy.__init__ (constructor)
  GroupBy(key_f: Callable[[T], K], shapelist: Iterable[T], reverse: bool = False)

  // Select group by key
  // build123d.topology.shape_core.GroupBy.group (method)
  group(key: K)

  // Select group by shape
  // build123d.topology.shape_core.GroupBy.group_for (method)
  group_for(shape: T)

// Joint
Joint

  // build123d.topology.shape_core.Joint.__init__ (constructor)
  Joint(label: str, parent: BuildPart | Solid | Compound)
  //   parent: object that joint to bound to

  // Location of joint
  location: Location

  // A CAD object positioned in global space to illustrate the joint
  symbol: Compound

  // All derived classes must provide a connect_to method
  // build123d.topology.shape_core.Joint.connect_to (method)
  connect_to(*args, **kwargs)

  // Return relative location to another joint
  // build123d.topology.shape_core.Joint.relative_to (method)
  relative_to(*args, **kwargs) -> Location

// Shape
Shape

  // build123d.topology.shape_core.Shape.__init__ (constructor)
  Shape(obj: TopoDS_Shape | None = None, label: str = '', color: ColorLike | None = None, parent: Compound | None = None)
  //   obj: OCCT object
  //   label: Defaults to ''
  //   color: Defaults to None
  //   parent: assembly parent

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
  // build123d.topology.shape_core.Shape.cast (method)
  cast(obj: TopoDS_Shape) -> Self

  // extrude
  // build123d.topology.shape_core.Shape.extrude (method)
  extrude(obj: Shape, direction: VectorLike) -> Edge | Face | Shell | Solid | Compound
  //   direction: direction and magnitude of extrusion

  // combined center
  // build123d.topology.shape_core.Shape.combined_center (method)
  combined_center(objects: Iterable[Shape], center_of: CenterOf = CenterOf.MASS) -> Vector
  //   objects: list of objects
  //   center_of: centering option

  // Calculates the 'mass' of an object
  // build123d.topology.shape_core.Shape.compute_mass (method)
  compute_mass(obj: Shape) -> float
  //   obj: Shape

  // Helper to extract entities of a specific type from a shape
  // build123d.topology.shape_core.Shape.get_shape_list (method)
  get_shape_list(shape: Shape, entity_type: Literal['Vertex']) -> ShapeList[Vertex]
  get_shape_list(shape: Shape, entity_type: Literal['Edge']) -> ShapeList[Edge]
  get_shape_list(shape: Shape, entity_type: Literal['Wire']) -> ShapeList[Wire]
  get_shape_list(shape: Shape, entity_type: Literal['Face']) -> ShapeList[Face]
  get_shape_list(shape: Shape, entity_type: Literal['Shell']) -> ShapeList[Shell]
  get_shape_list(shape: Shape, entity_type: Literal['Solid']) -> ShapeList[Solid]
  get_shape_list(shape: Shape, entity_type: Literal['Compound']) -> ShapeList[Compound]

  // Return the single entity of the requested type
  // build123d.topology.shape_core.Shape.get_single_shape (method)
  get_single_shape(shape: Shape, entity_type: Literal['Vertex']) -> Vertex
  get_single_shape(shape: Shape, entity_type: Literal['Edge']) -> Edge
  get_single_shape(shape: Shape, entity_type: Literal['Wire']) -> Wire
  get_single_shape(shape: Shape, entity_type: Literal['Face']) -> Face
  get_single_shape(shape: Shape, entity_type: Literal['Shell']) -> Shell
  get_single_shape(shape: Shape, entity_type: Literal['Solid']) -> Solid
  get_single_shape(shape: Shape, entity_type: Literal['Compound']) -> Compound

  // Register a composite constructor without importing it here
  // build123d.topology.shape_core.Shape.register_composite_factory (method)
  register_composite_factory(dimension: int | None, factory: CompositeFactory) -> None

  // Build the registered composite for a dimension
  // build123d.topology.shape_core.Shape.make_composite (method)
  make_composite(shapes: Iterable[Shape], dimension: int | None = None) -> Shape

  // Create a bounding box for this Shape
  // build123d.topology.shape_core.Shape.bounding_box (method)
  bounding_box(tolerance: float | None = None, optimal: bool = True) -> BoundBox
  //   tolerance: Defaults to None

  // clean
  // build123d.topology.shape_core.Shape.clean (method)
  clean() -> Self

  // Points on two shapes where the distance between them is minimal
  // build123d.topology.shape_core.Shape.closest_points (method)
  closest_points(other: Shape | VectorLike) -> tuple[Vector, Vector]

  // Return the Compound
  // build123d.topology.shape_core.Shape.compound (method)
  compound() -> Compound

  // compounds - all the compounds in this Shape
  // build123d.topology.shape_core.Shape.compounds (method)
  compounds() -> ShapeList[Compound]

  // Copy common object attributes to target
  // build123d.topology.shape_core.Shape.copy_attributes_to (method)
  copy_attributes_to(target: Shape, exceptions: Iterable[str] | None = None)
  //   target: object to gain attributes
  //   exceptions: attributes not to copy

  // Remove the positional arguments from this Shape
  // build123d.topology.shape_core.Shape.cut (method)
  cut(*to_cut: Shape) -> Self | Compound
  //   to_cut: Shape

  // Minimal distance between two shapes
  // build123d.topology.shape_core.Shape.distance (method)
  distance(other: Shape) -> float
  //   other: Shape

  // Minimal distance between two shapes
  // build123d.topology.shape_core.Shape.distance_to (method)
  distance_to(other: Shape | VectorLike) -> float

  // Minimal distance between two shapes and the points on each shape
  // build123d.topology.shape_core.Shape.distance_to_with_closest_points (method)
  distance_to_with_closest_points(other: Shape | VectorLike) -> tuple[float, Vector, Vector]

  // Minimal distances to between self and other shapes
  // build123d.topology.shape_core.Shape.distances (method)
  distances(*others: Shape) -> Iterator[float]
  //   others: Shape

  // Return the Edge
  // build123d.topology.shape_core.Shape.edge (method)
  edge() -> Edge

  // edges - all the edges in this Shape - subclasses may override
  // build123d.topology.shape_core.Shape.edges (method)
  edges() -> ShapeList[Edge]

  // Return all of the TopoDS sub entities of the given type
  // build123d.topology.shape_core.Shape.entities (method)
  entities(topo_type: Shapes) -> list[TopoDS_Shape]

  // Return the Face
  // build123d.topology.shape_core.Shape.face (method)
  face() -> Face

  // faces - all the faces in this Shape
  // build123d.topology.shape_core.Shape.faces (method)
  faces() -> ShapeList[Face]

  // Line Intersection
  // build123d.topology.shape_core.Shape.faces_intersected_by_axis (method)
  faces_intersected_by_axis(axis: Axis, tol: float = 0.0001) -> ShapeList[Face]
  //   axis: Axis on which the intersection line rests
  //   tol: Intersection tolerance

  // fix - try to fix shape if not valid
  // build123d.topology.shape_core.Shape.fix (method)
  fix() -> Self

  // fuse
  // build123d.topology.shape_core.Shape.fuse (method)
  fuse(*to_fuse: Shape, glue: bool = False, tol: float | None = None) -> Self | Compound
  //   to_fuse: shapes to fuse
  //   glue: performance improvement for some shapes
  //   tol: tolerance

  // Retrieve the first level of child shapes from the shape
  // build123d.topology.shape_core.Shape.get_top_level_shapes (method)
  get_top_level_shapes() -> ShapeList[Shape]

  // Find where bodies/interiors meet (overlap or crossing geometry)
  // build123d.topology.shape_core.Shape.intersect (method)
  intersect(*to_intersect: Shape | Vector | Location | Axis | Plane, tolerance: float = 1e-06, include_touched: bool = False) -> ShapeList | None
  //   to_intersect: Shape(s) or geometry objects to intersect with
  //   tolerance: tolerance for intersection detection
  //   include_touched: if True, include boundary contacts without interior overlap (only relevant when Solids are involved)

  // Find boundary contacts between this shape and another
  // build123d.topology.shape_core.Shape.touch (method)
  touch(other: Shape, tolerance: float = 1e-06) -> ShapeList
  //   other: Shape to find contacts with
  //   tolerance: tolerance for contact detection

  // Returns True if two shapes are equal, i.e
  // build123d.topology.shape_core.Shape.is_equal (method)
  is_equal(other: Shape) -> bool
  //   other: Shape

  // Returns True if other and this shape are same, i.e
  // build123d.topology.shape_core.Shape.is_same (method)
  is_same(other: Shape) -> bool
  //   other: Shape

  // Apply a location in absolute sense to self
  // build123d.topology.shape_core.Shape.locate (method)
  locate(loc: Location) -> Self
  //   loc: Location

  // located
  // build123d.topology.shape_core.Shape.located (method)
  located(loc: Location) -> Self
  //   loc: new absolute location

  // Generate triangulation if none exists
  // build123d.topology.shape_core.Shape.mesh (method)
  mesh(tolerance: float, angular_tolerance: float = 0.1)
  //   tolerance: float
  //   angular_tolerance: float

  // Applies a mirror transform to this Shape
  // build123d.topology.shape_core.Shape.mirror (method)
  mirror(mirror_plane: Plane | None = None) -> Self
  //   mirror_plane: The plane to mirror about

  // Apply a location in relative sense (i.e
  // build123d.topology.shape_core.Shape.move (method)
  move(loc: Location) -> Self
  //   loc: Location

  // moved
  // build123d.topology.shape_core.Shape.moved (method)
  moved(loc: Location | Plane) -> Self
  //   loc: new location relative to current location

  // Create an oriented bounding box for this Shape
  // build123d.topology.shape_core.Shape.oriented_bounding_box (method)
  oriented_bounding_box() -> OrientedBoundBox

  // Projected Faces following the given path on Shape
  // build123d.topology.shape_core.Shape.project_faces (method)
  project_faces(faces: list[Face] | Compound, path: Wire | Edge, start: float = 0) -> ShapeList[Face]
  //   faces: faces to project
  //   path: Path on the Shape to follow
  //   start: Relative location on path to start the faces

  // Compute the radius of gyration of the shape about a given axis
  // build123d.topology.shape_core.Shape.radius_of_gyration (method)
  radius_of_gyration(axis: Axis) -> float
  //   axis: The axis about which the radius of gyration is computed

  // Change the location of self while keeping it geometrically similar
  // build123d.topology.shape_core.Shape.relocate (method)
  relocate(loc: Location)
  //   loc: new location to set for self

  // rotate a copy
  // build123d.topology.shape_core.Shape.rotate (method)
  rotate(axis: Axis, angle: float, transform: bool = False) -> Self
  //   axis: rotation Axis
  //   angle: angle to rotate, in degrees
  //   transform: regenerate the shape instead of just changing its location

  // Scale this shape about a point
  // build123d.topology.shape_core.Shape.scale (method)
  scale(factor: float | tuple[float, float, float], about: VectorLike | None = None) -> Self
  //   factor: uniform scale factor or three scale factors for the X, Y and Z directions
  //   about: point to scale about

  // Return the Shell
  // build123d.topology.shape_core.Shape.shell (method)
  shell() -> Shell

  // shells - all the shells in this Shape
  // build123d.topology.shape_core.Shape.shells (method)
  shells() -> ShapeList[Shell]

  // Display internal topology
  // build123d.topology.shape_core.Shape.show_topology (method)
  show_topology(limit_class: Literal['Compound', 'Edge', 'Face', 'Shell', 'Solid', 'Vertex', 'Wire'] = 'Vertex', show_center: bool | None = None) -> str
  //   limit_class: type of displayed leaf node
  //   show_center: If None, shows the Location of Compound 'assemblies' and the bounding box center of Shapes

  // Return the Solid
  // build123d.topology.shape_core.Shape.solid (method)
  solid() -> Solid

  // solids - all the solids in this Shape
  // build123d.topology.shape_core.Shape.solids (method)
  solids() -> ShapeList[Solid]

  // split
  // build123d.topology.shape_core.Shape.split (method)
  split(tool: TrimmingTool, keep: Literal[Keep.TOP, Keep.BOTTOM]) -> Self | list[Self] | None
  split(tool: TrimmingTool, keep: Literal[Keep.ALL]) -> list[Self]
  split(tool: TrimmingTool, keep: Literal[Keep.BOTH]) -> tuple[Self | list[Self] | None, Self | list[Self] | None]
  split(tool: TrimmingTool, keep: Literal[Keep.INSIDE, Keep.OUTSIDE]) -> None
  split(tool: TrimmingTool) -> Self | list[Self] | None
  //   keep: which object(s) to save

  // split_by_perimeter
  // build123d.topology.shape_core.Shape.split_by_perimeter (method)
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.INSIDE, Keep.OUTSIDE]) -> Face | Shell | ShapeList[Face] | None
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.BOTH]) -> tuple[Face | Shell | ShapeList[Face] | None, Face | Shell | ShapeList[Face] | None]
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.INSIDE] = Keep.INSIDE) -> Face | Shell | ShapeList[Face] | None
  //   perimeter: closed perimeter
  //   keep: which object(s) to return

  // General triangulated approximation
  // build123d.topology.shape_core.Shape.tessellate (method)
  tessellate(tolerance: float, angular_tolerance: float = 0.1) -> tuple[list[Vector], list[tuple[int, int, int]]]

  // to_splines
  // build123d.topology.shape_core.Shape.to_splines (method)
  to_splines(degree: int = 3, tolerance: float = 0.001, nurbs: bool = False) -> Self
  //   degree: Maximum degree
  //   tolerance: Approximation tolerance
  //   nurbs: Use rational splines

  // Apply affine transform
  // build123d.topology.shape_core.Shape.transform_geometry (method)
  transform_geometry(t_matrix: Matrix) -> Self
  //   t_matrix: affine transformation matrix

  // Apply affine transform without changing type
  // build123d.topology.shape_core.Shape.transform_shape (method)
  transform_shape(t_matrix: Matrix) -> Self
  //   t_matrix: affine transformation matrix

  // Transform Shape
  // build123d.topology.shape_core.Shape.transformed (method)
  transformed(rotate: VectorLike = (0, 0, 0), offset: VectorLike = (0, 0, 0)) -> Self
  //   rotate: 3-tuple of angles to rotate, in degrees
  //   offset: 3-tuple to offset

  // Translates this shape through a transformation
  // build123d.topology.shape_core.Shape.translate (method)
  translate(vector: VectorLike, transform: bool = False) -> Self
  //   vector: relative movement vector
  //   transform: regenerate the shape instead of just changing its location Defaults to False

  // Return the Wire
  // build123d.topology.shape_core.Shape.wire (method)
  wire() -> Wire

  // wires - all the wires in this Shape
  // build123d.topology.shape_core.Shape.wires (method)
  wires() -> ShapeList[Wire]

  // Return the Vertex
  // build123d.topology.shape_core.Shape.vertex (method)
  vertex() -> Vertex

  // vertices - all the vertices in this Shape
  // build123d.topology.shape_core.Shape.vertices (method)
  vertices() -> ShapeList[Vertex]

// Subclass of list with custom filter and sort methods appropriate to CAD
ShapeList

  // First element in the ShapeList
  first: T

  // Last element in the ShapeList
  last: T

  // Expand by dissolving compounds, wires, and shells, filtering nulls
  // build123d.topology.shape_core.ShapeList.expand (method)
  expand() -> ShapeList

  // The average of the center of objects within the ShapeList
  // build123d.topology.shape_core.ShapeList.center (method)
  center() -> Vector

  // Return the Compound
  // build123d.topology.shape_core.ShapeList.compound (method)
  compound() -> Compound

  // compounds - all the compounds in this ShapeList
  // build123d.topology.shape_core.ShapeList.compounds (method)
  compounds() -> ShapeList[Compound]

  // Return the Edge
  // build123d.topology.shape_core.ShapeList.edge (method)
  edge() -> Edge

  // edges - all the edges in this ShapeList
  // build123d.topology.shape_core.ShapeList.edges (method)
  edges() -> ShapeList[Edge]

  // Return the Face
  // build123d.topology.shape_core.ShapeList.face (method)
  face() -> Face

  // faces - all the faces in this ShapeList
  // build123d.topology.shape_core.ShapeList.faces (method)
  faces() -> ShapeList[Face]

  // filter by
  // build123d.topology.shape_core.ShapeList.filter_by (method)
  filter_by(filter_by: Callable[[T], bool] | Axis | Plane | GeomType | property, reverse: bool = False, tolerance: float = 1e-05) -> ShapeList[T]
  //   filter_by: function, axis, plane, or geom type to filter and possibly sort by
  //   reverse: invert the geom type filter
  //   tolerance: maximum deviation from axis

  // filter by position
  // build123d.topology.shape_core.ShapeList.filter_by_position (method)
  filter_by_position(axis: Axis, minimum: float, maximum: float, inclusive: tuple[bool, bool] = (True, True)) -> ShapeList[T]
  //   axis: axis to sort by
  //   minimum: minimum value
  //   maximum: maximum value
  //   inclusive: include min,max values

  // group by
  // build123d.topology.shape_core.ShapeList.group_by (method)
  group_by(group_by: Callable[[T], K] | Axis | Edge | Wire | SortBy | property = Axis.Z, reverse: bool = False, tol_digits: int = 6) -> GroupBy[T, K]
  //   reverse: flip order of sort
  //   tol_digits: Tolerance for building the group keys by round(key, tol_digits)

  // Return the Shell
  // build123d.topology.shape_core.ShapeList.shell (method)
  shell() -> Shell

  // shells - all the shells in this ShapeList
  // build123d.topology.shape_core.ShapeList.shells (method)
  shells() -> ShapeList[Shell]

  // Return the Solid
  // build123d.topology.shape_core.ShapeList.solid (method)
  solid() -> Solid

  // solids - all the solids in this ShapeList
  // build123d.topology.shape_core.ShapeList.solids (method)
  solids() -> ShapeList[Solid]

  // sort by
  // build123d.topology.shape_core.ShapeList.sort_by (method)
  sort_by(sort_by: Callable[[T], K] | Axis | Edge | Wire | SortBy | property = Axis.Z, reverse: bool = False) -> ShapeList[T]
  //   reverse: flip order of sort

  // Sort by distance
  // build123d.topology.shape_core.ShapeList.sort_by_distance (method)
  sort_by_distance(other: Shape | VectorLike, reverse: bool = False) -> ShapeList[T]
  //   other: reference object
  //   reverse: flip order of sort

  // Return the Vertex
  // build123d.topology.shape_core.ShapeList.vertex (method)
  vertex() -> Vertex

  // vertices - all the vertices in this ShapeList
  // build123d.topology.shape_core.ShapeList.vertices (method)
  vertices() -> ShapeList[Vertex]

  // Return the Wire
  // build123d.topology.shape_core.ShapeList.wire (method)
  wire() -> Wire

  // wires - all the wires in this ShapeList
  // build123d.topology.shape_core.ShapeList.wires (method)
  wires() -> ShapeList[Wire]

// Skip clean context for use in operator driven code where clean=False wouldn't work
SkipClean

// Downcasts a TopoDS object to suitable specialized type
// build123d.topology.shape_core.downcast (function)
downcast(obj: TopoDS_Shape) -> TopoDS_Shape
//   obj: TopoDS_Shape

// Fix a TopoDS object to suitable specialized type
// build123d.topology.shape_core.fix (function)
fix(obj: TopoDS_Shape) -> TopoDS_Shape
//   obj: TopoDS_Shape

// Return a key function that yields topological distance to ``other``
// build123d.topology.shape_core.topo_distance_to (function)
topo_distance_to(other: Shape | Iterable[Shape]) -> Callable[[Shape], int | float]
//   other: reference shape or shapes

// Strip unnecessary Compound wrappers
// build123d.topology.shape_core.unwrap_topods_compound (function)
unwrap_topods_compound(compound: TopoDS_Compound, fully: bool = True) -> TopoDS_Compound | TopoDS_Shape
//   compound: The TopoDS_Compound to unwrap
//   fully: return base shape without any TopoDS_Compound wrappers (otherwise one TopoDS_Compound is left)
