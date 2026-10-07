# build123d — shape_core

4 top-level symbols. Signatures are verbatim python.

# Category: shape_core
# Joint
# Remarks: Abstract Base Joint class - used to join two components together Attributes: label (str): user assigned label parent (Shape): object joint is bound to connected_to (Joint): joint that is connect to this joint
# build123d.topology.shape_core.Joint (class)
class Joint(ABC)

  # build123d.topology.shape_core.Joint.__init__ (constructor)
  Joint(label: str, parent: BuildPart | Solid | Compound)
  #   parent: object that joint to bound to

  # Location of joint
  location: Location

  # A CAD object positioned in global space to illustrate the joint
  symbol: Compound

  # All derived classes must provide a connect_to method
  # build123d.topology.shape_core.Joint.connect_to (method)
  connect_to(*args, **kwargs)

  # Return relative location to another joint
  # build123d.topology.shape_core.Joint.relative_to (method)
  relative_to(*args, **kwargs) -> Location

# Category: shape_core
# Subclass of list with custom filter and sort methods appropriate to CAD
# build123d.topology.shape_core.ShapeList (class)
class ShapeList(list)

  # First element in the ShapeList
  first: T

  # Last element in the ShapeList
  last: T

  # Return a new ShapeList that includes other
  # build123d.topology.shape_core.ShapeList.__add__ (method)
  __add__(other: Shape | Iterable[Shape]) -> ShapeList[T]  # ShapeList + other

  # In-place addition to this ShapeList
  # build123d.topology.shape_core.ShapeList.__iadd__ (method)
  __iadd__(other: Shape | Iterable[Shape]) -> Self  # ShapeList += other

  # Intersect two ShapeLists operator &
  # build123d.topology.shape_core.ShapeList.__and__ (method)
  __and__(other: ShapeList) -> ShapeList[T]  # ShapeList & other

  # Return slices of ShapeList as ShapeList
  # build123d.topology.shape_core.ShapeList.__getitem__ (method)
  __getitem__(key: SupportsIndex) -> T  # ShapeList[key]
  __getitem__(key: slice) -> ShapeList[T]  # ShapeList[key]

  # Sort operator >
  # build123d.topology.shape_core.ShapeList.__gt__ (method)
  __gt__(sort_by: Axis | SortBy = Axis.Z) -> ShapeList[T]  # ShapeList > sort_by

  # Group and select smallest group operator <<
  # build123d.topology.shape_core.ShapeList.__lshift__ (method)
  __lshift__(group_by: Axis | SortBy = Axis.Z) -> ShapeList[T]  # ShapeList << group_by

  # Reverse sort operator <
  # build123d.topology.shape_core.ShapeList.__lt__ (method)
  __lt__(sort_by: Axis | SortBy = Axis.Z) -> ShapeList[T]  # ShapeList < sort_by

  # Filter by axis or geomtype operator |
  # build123d.topology.shape_core.ShapeList.__or__ (method)
  __or__(filter_by: Axis | GeomType = Axis.Z) -> ShapeList[T]  # ShapeList | filter_by

  # Group and select largest group operator >>
  # build123d.topology.shape_core.ShapeList.__rshift__ (method)
  __rshift__(group_by: Axis | SortBy = Axis.Z) -> ShapeList[T]  # ShapeList >> group_by

  # Differences between two ShapeLists operator -
  # build123d.topology.shape_core.ShapeList.__sub__ (method)
  __sub__(other: ShapeList) -> ShapeList[T]  # ShapeList - other

  # Expand by dissolving compounds, wires, and shells, filtering nulls
  # Remarks: Returns: ShapeList with compounds dissolved to children, wires to edges, shells to faces, and nulls filtered out
  # build123d.topology.shape_core.ShapeList.expand (method)
  expand() -> ShapeList

  # The average of the center of objects within the ShapeList
  # build123d.topology.shape_core.ShapeList.center (method)
  center() -> Vector

  # Return the Compound
  # build123d.topology.shape_core.ShapeList.compound (method)
  compound() -> Compound

  # compounds - all the compounds in this ShapeList
  # build123d.topology.shape_core.ShapeList.compounds (method)
  compounds() -> ShapeList[Compound]

  # Return the Edge
  # build123d.topology.shape_core.ShapeList.edge (method)
  edge() -> Edge

  # edges - all the edges in this ShapeList
  # build123d.topology.shape_core.ShapeList.edges (method)
  edges() -> ShapeList[Edge]

  # Return the Face
  # build123d.topology.shape_core.ShapeList.face (method)
  face() -> Face

  # faces - all the faces in this ShapeList
  # build123d.topology.shape_core.ShapeList.faces (method)
  faces() -> ShapeList[Face]

  # filter by
  # Remarks: Either: - filter objects of type planar Face or linear Edge by their normal or tangent (respectively) and sort the results by the given axis, or - filter the objects by the provided type. Note that not all types apply to all objects. Returns: ShapeList: filtered list of objects
  # Throws: ValueError: Invalid filter_by type
  # build123d.topology.shape_core.ShapeList.filter_by (method)
  filter_by(filter_by: Callable[[T], bool] | Axis | Plane | GeomType | property, reverse: bool = False, tolerance: float = 1e-05) -> ShapeList[T]
  #   filter_by: function, axis, plane, or geom type to filter and possibly sort by
  #   reverse: invert the geom type filter
  #   tolerance: maximum deviation from axis

  # filter by position
  # Remarks: Filter and sort objects by the position of their centers along given axis. min and max values can be inclusive or exclusive depending on the inclusive tuple. Returns: ShapeList: filtered object list
  # build123d.topology.shape_core.ShapeList.filter_by_position (method)
  filter_by_position(axis: Axis, minimum: float, maximum: float, inclusive: tuple[bool, bool] = (True, True)) -> ShapeList[T]
  #   axis: axis to sort by
  #   minimum: minimum value
  #   maximum: maximum value
  #   inclusive: include min,max values

  # group by
  # Remarks: Group objects by provided criteria and then sort the groups according to the criteria. Note that not all group_by criteria apply to all objects. Returns: GroupBy[T, K]: sorted groups of ShapeLists
  # build123d.topology.shape_core.ShapeList.group_by (method)
  group_by(group_by: Callable[[T], K] | Axis | Edge | Wire | SortBy | property = Axis.Z, reverse: bool = False, tol_digits: int = 6) -> GroupBy[T, K]
  #   reverse: flip order of sort
  #   tol_digits: Tolerance for building the group keys by round(key, tol_digits)

  # Return the Shell
  # build123d.topology.shape_core.ShapeList.shell (method)
  shell() -> Shell

  # shells - all the shells in this ShapeList
  # build123d.topology.shape_core.ShapeList.shells (method)
  shells() -> ShapeList[Shell]

  # Return the Solid
  # build123d.topology.shape_core.ShapeList.solid (method)
  solid() -> Solid

  # solids - all the solids in this ShapeList
  # build123d.topology.shape_core.ShapeList.solids (method)
  solids() -> ShapeList[Solid]

  # sort by
  # Remarks: Sort objects by provided criteria. Note that not all sort_by criteria apply to all objects. Returns: ShapeList: sorted list of objects
  # Throws: ValueError: Cannot sort by an empty axis
  # Throws: ValueError: Cannot sort by an empty object
  # Throws: ValueError: Invalid sort_by criteria provided
  # build123d.topology.shape_core.ShapeList.sort_by (method)
  sort_by(sort_by: Callable[[T], K] | Axis | Edge | Wire | SortBy | property = Axis.Z, reverse: bool = False) -> ShapeList[T]
  #   reverse: flip order of sort

  # Sort by distance
  # Remarks: Sort by minimal distance between objects and other Returns: ShapeList: Sorted shapes
  # build123d.topology.shape_core.ShapeList.sort_by_distance (method)
  sort_by_distance(other: Shape | VectorLike, reverse: bool = False) -> ShapeList[T]
  #   other: reference object
  #   reverse: flip order of sort

  # Return the Vertex
  # build123d.topology.shape_core.ShapeList.vertex (method)
  vertex() -> Vertex

  # vertices - all the vertices in this ShapeList
  # build123d.topology.shape_core.ShapeList.vertices (method)
  vertices() -> ShapeList[Vertex]

  # Return the Wire
  # build123d.topology.shape_core.ShapeList.wire (method)
  wire() -> Wire

  # wires - all the wires in this ShapeList
  # build123d.topology.shape_core.ShapeList.wires (method)
  wires() -> ShapeList[Wire]

# Category: shape_core
# Return a key function that yields topological distance to ``other``
# Remarks: The returned callable is intended for use with :meth:`ShapeList.sort_by` and :meth:`ShapeList.group_by`. Distances are measured on the full topology of the shared ``topo_parent`` of the reference shape(s), not only within the ``ShapeList`` being sorted or grouped. The first-pass implementation supports homogeneous collections of: ``Vertex``, ``Edge``, ``Wire``, ``Face``, ``Shell``, and ``Solid``. Adjacency is defined by shared lower-order topology: - ``Face`` via shared ``Edge`` - ``Edge``/``Wire`` via shared ``Vertex`` - ``Shell``/``Solid`` via shared ``Face`` - ``Vertex`` via shared ``Edge`` Reference shapes have distance ``0``. Directly connected shapes have distance ``1``. Each additional intervening peer increases the distance by ``1``. Unreachable shapes return ``inf``. Returns: Callable[[Shape], int | float]: key function for sorting/grouping
# Throws: ValueError: empty reference set, mixed shape types, unsupported
# Throws: shape type, missing ``topo_parent``, or multiple parents
# build123d.topology.shape_core.topo_distance_to (function)
topo_distance_to(other: Shape | Iterable[Shape]) -> Callable[[Shape], int | float]
#   other: reference shape or shapes

# Category: shape_core
# Shape
# Remarks: Base class for all CAD objects such as Edge, Face, Solid, etc. Attributes: wrapped (TopoDS_Shape): the OCP object label (str): user assigned label color (Color): object color joints (dict[str:Joint]): dictionary of joints bound to this object (Solid only) children (Shape): list of assembly children of this object (Compound only) topo_parent (Shape): assembly parent of this object
# build123d.topology.shape_core.Shape (class)
class Shape(NodeMixin, Generic)

  # build123d.topology.shape_core.Shape.__init__ (constructor)
  Shape(obj: TopoDS_Shape | None = None, label: str = '', color: ColorLike | None = None, parent: Compound | None = None)
  #   obj: OCCT object
  #   label: Defaults to ''
  #   color: Defaults to None
  #   parent: assembly parent

  # OCP TopoDS object
  wrapped

  # area -the surface area of all faces in this Shape
  area: float

  # Get the shape's color
  # Remarks: ancestor, assign it to this Shape and return this value.
  color: None | Color

  # Gets the underlying geometry type
  # Remarks: Returns: GeomType: The geometry type of the shape
  geom_type: GeomType

  # is_manifold
  # Remarks: Check if each edge in the given Shape has exactly two faces associated with it (skipping degenerate edges). If so, the shape is manifold. Returns: bool: is the shape manifold or water tight
  is_manifold: bool

  # Returns true if this shape is null
  # Remarks: underlying shape with the potential to be given a location and an orientation.
  is_null: bool

  # Is the shape a planar face even though its geom_type may not be PLANE
  is_planar_face: bool

  # Returns True if no defect is detected on the shape S or any of its
  # Remarks: subshapes. See the OCCT docs on BRepCheck_Analyzer::IsValid for a full description of what is checked.
  is_valid: bool

  # The location of this Shape relative to the global coordinate system
  # Remarks: This property computes the composite transformation by traversing the hierarchy from the root of the assembly to this node, combining the location of each ancestor. It reflects the absolute position and orientation of the shape in world space, even when the shape is deeply nested within an assembly. Note: This is only meaningful when the Shape is part of an assembly tree where parent-child relationships define relative placements.
  global_location: Location

  # Get this Shape's Location
  location: Location

  # Compute the inertia matrix (moment of inertia tensor) of the shape
  # Remarks: The inertia matrix represents how the mass of the shape is distributed with respect to its reference frame. It is a 3×3 symmetric tensor that describes the resistance of the shape to rotational motion around different axes. Returns: list[list[float]]: A 3×3 nested list representing the inertia matrix. The elements of the matrix are given as: | Ixx Ixy Ixz | | Ixy Iyy Iyz | | Ixz Iyz Izz | where: - Ixx, Iyy, Izz are the moments of inertia about the X, Y, and Z axes. - Ixy, Ixz, Iyz are the products of inertia. Example: >>> obj = MyShape() >>> obj.matrix_of_inertia [[1000.0, 50.0, 0.0], [50.0, 1200.0, 0.0], [0.0, 0.0, 300.0]] Notes: - The inertia matrix is computed relative to the shape's center of mass. - It is commonly used in structural analysis, mechanical simulations, and physics-based motion calculations.
  matrix_of_inertia: list[list[float]]

  # Get the orientation component of this Shape's Location
  orientation: Vector

  # Get the position component of this Shape's Location
  position: Vector

  # Compute the principal moments of inertia and their corresponding axes
  # Remarks: Returns: list[tuple[Vector, float]]: A list of tuples, where each tuple contains: - A `Vector` representing the axis of inertia. - A `float` representing the moment of inertia for that axis. Example: >>> obj = MyShape() >>> obj.principal_properties [(Vector(1, 0, 0), 1200.0), (Vector(0, 1, 0), 1000.0), (Vector(0, 0, 1), 300.0)]
  principal_properties: list[tuple[Vector, float]]

  # Return the shape type string for this class
  shape_type: Shapes

  # Compute the static moments (first moments of mass) of the shape
  # Remarks: The static moments represent the weighted sum of the coordinates with respect to the mass distribution, providing insight into the center of mass and mass distribution of the shape. Returns: tuple[float, float, float]: The static moments (Mx, My, Mz), where: - Mx is the first moment of mass about the YZ plane. - My is the first moment of mass about the XZ plane. - Mz is the first moment of mass about the XY plane. Example: >>> obj = MyShape() >>> obj.static_moments (150.0, 200.0, 50.0)
  static_moments: tuple[float, float, float]

  # Returns the right type of wrapper, given a OCCT object
  # build123d.topology.shape_core.Shape.cast (method)
  cast(obj: TopoDS_Shape) -> Self

  # extrude
  # Remarks: Extrude a Shape in the provided direction. * Vertices generate Edges * Edges generate Faces * Wires generate Shells * Faces generate Solids * Shells generate Compounds Returns: Edge | Face | Shell | Solid | Compound: extruded shape
  # Throws: ValueError: Unsupported class
  # Throws: RuntimeError: Generated invalid result
  # build123d.topology.shape_core.Shape.extrude (method)
  extrude(obj: Shape, direction: VectorLike) -> Edge | Face | Shell | Solid | Compound
  #   direction: direction and magnitude of extrusion

  # combined center
  # Remarks: Calculates the center of a multiple objects. Returns: Vector: center of multiple objects
  # Throws: ValueError: CenterOf.GEOMETRY not implemented
  # build123d.topology.shape_core.Shape.combined_center (method)
  combined_center(objects: Iterable[Shape], center_of: CenterOf = CenterOf.MASS) -> Vector
  #   objects: list of objects
  #   center_of: centering option

  # Calculates the 'mass' of an object
  # Remarks: Returns:
  # build123d.topology.shape_core.Shape.compute_mass (method)
  compute_mass(obj: Shape) -> float
  #   obj: Shape

  # Helper to extract entities of a specific type from a shape
  # build123d.topology.shape_core.Shape.get_shape_list (method)
  get_shape_list(shape: Shape, entity_type: Literal['Vertex']) -> ShapeList[Vertex]
  get_shape_list(shape: Shape, entity_type: Literal['Edge']) -> ShapeList[Edge]
  get_shape_list(shape: Shape, entity_type: Literal['Wire']) -> ShapeList[Wire]
  get_shape_list(shape: Shape, entity_type: Literal['Face']) -> ShapeList[Face]
  get_shape_list(shape: Shape, entity_type: Literal['Shell']) -> ShapeList[Shell]
  get_shape_list(shape: Shape, entity_type: Literal['Solid']) -> ShapeList[Solid]
  get_shape_list(shape: Shape, entity_type: Literal['Compound']) -> ShapeList[Compound]

  # Return the single entity of the requested type
  # Throws: ValueError: if the number of matching entities is not exactly one.
  # build123d.topology.shape_core.Shape.get_single_shape (method)
  get_single_shape(shape: Shape, entity_type: Literal['Vertex']) -> Vertex
  get_single_shape(shape: Shape, entity_type: Literal['Edge']) -> Edge
  get_single_shape(shape: Shape, entity_type: Literal['Wire']) -> Wire
  get_single_shape(shape: Shape, entity_type: Literal['Face']) -> Face
  get_single_shape(shape: Shape, entity_type: Literal['Shell']) -> Shell
  get_single_shape(shape: Shape, entity_type: Literal['Solid']) -> Solid
  get_single_shape(shape: Shape, entity_type: Literal['Compound']) -> Compound

  # Register a composite constructor without importing it here
  # build123d.topology.shape_core.Shape.register_composite_factory (method)
  register_composite_factory(dimension: int | None, factory: CompositeFactory) -> None

  # Build the registered composite for a dimension
  # build123d.topology.shape_core.Shape.make_composite (method)
  make_composite(shapes: Iterable[Shape], dimension: int | None = None) -> Shape

  # fuse shape to self operator +
  # build123d.topology.shape_core.Shape.__add__ (method)
  __add__(other: None) -> Self  # Shape + other
  __add__(other: Shape | Iterable[Shape]) -> Self | Compound  # Shape + other

  # intersect shape with self operator &
  # build123d.topology.shape_core.Shape.__and__ (method)
  __and__(other: Shape | Iterable[Shape]) -> None | Self | Compound  # Shape & other

  # right multiply for positioning operator *
  # build123d.topology.shape_core.Shape.__rmul__ (method)
  __rmul__(other: Plane | Location) -> Self  # other * Shape
  __rmul__(other: Iterable[Plane | Location]) -> list[Self]  # other * Shape

  # cut shape from self operator -
  # build123d.topology.shape_core.Shape.__sub__ (method)
  __sub__(other: None) -> Self  # Shape - other
  __sub__(other: Shape | Iterable[Shape]) -> Self | Compound  # Shape - other

  # Create a bounding box for this Shape
  # Remarks: Returns: BoundBox: A box sized to contain this Shape
  # build123d.topology.shape_core.Shape.bounding_box (method)
  bounding_box(tolerance: float | None = None, optimal: bool = True) -> BoundBox
  #   tolerance: Defaults to None

  # clean
  # Remarks: Remove internal edges Returns: Shape: Original object with extraneous internal edges removed
  # build123d.topology.shape_core.Shape.clean (method)
  clean() -> Self

  # Points on two shapes where the distance between them is minimal
  # build123d.topology.shape_core.Shape.closest_points (method)
  closest_points(other: Shape | VectorLike) -> tuple[Vector, Vector]

  # Return the Compound
  # build123d.topology.shape_core.Shape.compound (method)
  compound() -> Compound

  # compounds - all the compounds in this Shape
  # build123d.topology.shape_core.Shape.compounds (method)
  compounds() -> ShapeList[Compound]

  # Copy common object attributes to target
  # Remarks: Note that preset attributes of target will not be overridden.
  # Throws: ValueError: invalid attribute
  # build123d.topology.shape_core.Shape.copy_attributes_to (method)
  copy_attributes_to(target: Shape, exceptions: Iterable[str] | None = None)
  #   target: object to gain attributes
  #   exceptions: attributes not to copy

  # Remove the positional arguments from this Shape
  # Remarks: Returns: Self | Compound: Resulting object may be of a different class than self
  # build123d.topology.shape_core.Shape.cut (method)
  cut(*to_cut: Shape) -> Self | Compound
  #   to_cut: Shape

  # Minimal distance between two shapes
  # Remarks: Returns:
  # build123d.topology.shape_core.Shape.distance (method)
  distance(other: Shape) -> float
  #   other: Shape

  # Minimal distance between two shapes
  # build123d.topology.shape_core.Shape.distance_to (method)
  distance_to(other: Shape | VectorLike) -> float

  # Minimal distance between two shapes and the points on each shape
  # build123d.topology.shape_core.Shape.distance_to_with_closest_points (method)
  distance_to_with_closest_points(other: Shape | VectorLike) -> tuple[float, Vector, Vector]

  # Minimal distances to between self and other shapes
  # Remarks: Returns:
  # build123d.topology.shape_core.Shape.distances (method)
  distances(*others: Shape) -> Iterator[float]
  #   others: Shape

  # Return the Edge
  # build123d.topology.shape_core.Shape.edge (method)
  edge() -> Edge

  # edges - all the edges in this Shape - subclasses may override
  # build123d.topology.shape_core.Shape.edges (method)
  edges() -> ShapeList[Edge]

  # Return all of the TopoDS sub entities of the given type
  # build123d.topology.shape_core.Shape.entities (method)
  entities(topo_type: Shapes) -> list[TopoDS_Shape]

  # Return the Face
  # build123d.topology.shape_core.Shape.face (method)
  face() -> Face

  # faces - all the faces in this Shape
  # build123d.topology.shape_core.Shape.faces (method)
  faces() -> ShapeList[Face]

  # Line Intersection
  # Remarks: Computes the intersections between the provided axis and the faces of this Shape Returns: list[Face]: A list of intersected faces sorted by distance from axis.position
  # build123d.topology.shape_core.Shape.faces_intersected_by_axis (method)
  faces_intersected_by_axis(axis: Axis, tol: float = 0.0001) -> ShapeList[Face]
  #   axis: Axis on which the intersection line rests
  #   tol: Intersection tolerance

  # fix - try to fix shape if not valid
  # build123d.topology.shape_core.Shape.fix (method)
  fix() -> Self

  # fuse
  # Remarks: Fuse a sequence of shapes into a single shape. Returns: Self | Compound: Resulting object may be of a different class than self
  # build123d.topology.shape_core.Shape.fuse (method)
  fuse(*to_fuse: Shape, glue: bool = False, tol: float | None = None) -> Self | Compound
  #   to_fuse: shapes to fuse
  #   glue: performance improvement for some shapes
  #   tol: tolerance

  # Retrieve the first level of child shapes from the shape
  # Remarks: This method collects all the non-compound shapes directly contained in the current shape. If the wrapped shape is a `TopoDS_Compound`, it traverses its immediate children and collects all shapes that are not further nested compounds. Nested compounds are traversed to gather their non-compound elements without returning the nested compound itself. Returns: ShapeList[Shape]: A list of all first-level non-compound child shapes. Example: If the current shape is a compound containing both simple shapes (e.g., edges, vertices) and other compounds, the method returns a list of only the simple shapes directly contained at the top level.
  # build123d.topology.shape_core.Shape.get_top_level_shapes (method)
  get_top_level_shapes() -> ShapeList[Shape]

  # Find where bodies/interiors meet (overlap or crossing geometry)
  # Remarks: This is the main entry point for intersection operations. Handles geometry conversion and delegates to subclass _intersect() implementations. Semantics: - Multiple arguments use AND (chaining): c.intersect(s1, s2) = c ∩ s1 ∩ s2 - Compound arguments use OR (distribution): c.intersect(Compound([s1, s2])) = (c ∩ s1) ∪ (c ∩ s2) Returns: ShapeList of intersection results, or None if no intersection
  # build123d.topology.shape_core.Shape.intersect (method)
  intersect(*to_intersect: Shape | Vector | Location | Axis | Plane, tolerance: float = 1e-06, include_touched: bool = False) -> ShapeList | None
  #   to_intersect: Shape(s) or geometry objects to intersect with
  #   tolerance: tolerance for intersection detection
  #   include_touched: if True, include boundary contacts without interior overlap (only relevant when Solids are involved)

  # Find boundary contacts between this shape and another
  # Remarks: Base implementation returns empty ShapeList. Subclasses (Mixin2D, Mixin3D, Compound) override this to provide actual touch detection. Returns: ShapeList of contact shapes (empty for base implementation)
  # build123d.topology.shape_core.Shape.touch (method)
  touch(other: Shape, tolerance: float = 1e-06) -> ShapeList
  #   other: Shape to find contacts with
  #   tolerance: tolerance for contact detection

  # Returns True if two shapes are equal, i.e
  # Remarks: TShape with the same Locations and Orientations. Also see :py:meth:`is_same`. Returns:
  # build123d.topology.shape_core.Shape.is_equal (method)
  is_equal(other: Shape) -> bool
  #   other: Shape

  # Returns True if other and this shape are same, i.e
  # Remarks: same TShape with the same Locations. Orientations may differ. Also see :py:meth:`is_equal` Returns:
  # build123d.topology.shape_core.Shape.is_same (method)
  is_same(other: Shape) -> bool
  #   other: Shape

  # Apply a location in absolute sense to self
  # Remarks: Returns:
  # build123d.topology.shape_core.Shape.locate (method)
  locate(loc: Location) -> Self
  #   loc: Location

  # located
  # Remarks: Apply a location in absolute sense to a copy of self Returns: Shape: copy of Shape at location
  # build123d.topology.shape_core.Shape.located (method)
  located(loc: Location) -> Self
  #   loc: new absolute location

  # Generate triangulation if none exists
  # Remarks: Returns:
  # build123d.topology.shape_core.Shape.mesh (method)
  mesh(tolerance: float, angular_tolerance: float = 0.1)
  #   tolerance: float
  #   angular_tolerance: float

  # Applies a mirror transform to this Shape
  # Remarks: about the plane. Returns: The mirrored shape
  # build123d.topology.shape_core.Shape.mirror (method)
  mirror(mirror_plane: Plane | None = None) -> Self
  #   mirror_plane: The plane to mirror about

  # Apply a location in relative sense (i.e
  # Remarks: Returns:
  # build123d.topology.shape_core.Shape.move (method)
  move(loc: Location) -> Self
  #   loc: Location

  # moved
  # Remarks: Apply a location in relative sense (i.e. update current location) to a copy of self Returns: Shape: copy of Shape moved to relative location
  # build123d.topology.shape_core.Shape.moved (method)
  moved(loc: Location | Plane) -> Self
  #   loc: new location relative to current location

  # Create an oriented bounding box for this Shape
  # Remarks: Returns: OrientedBoundBox: A box oriented and sized to contain this Shape
  # build123d.topology.shape_core.Shape.oriented_bounding_box (method)
  oriented_bounding_box() -> OrientedBoundBox

  # Projected Faces following the given path on Shape
  # Remarks: Project by positioning each face of to the shape along the path and projecting onto the surface. Note that projection may result in distortion depending on the shape at a position along the path. .. image:: projectText.png Returns: The projected faces
  # build123d.topology.shape_core.Shape.project_faces (method)
  project_faces(faces: list[Face] | Compound, path: Wire | Edge, start: float = 0) -> ShapeList[Face]
  #   faces: faces to project
  #   path: Path on the Shape to follow
  #   start: Relative location on path to start the faces

  # Compute the radius of gyration of the shape about a given axis
  # Remarks: The radius of gyration represents the distance from the axis at which the entire mass of the shape could be concentrated without changing its moment of inertia. It provides insight into how mass is distributed relative to the axis and is useful in structural analysis, rotational dynamics, and mechanical simulations. Returns: float: The radius of gyration in the same units as the shape's dimensions. Example: >>> obj = MyShape() >>> axis = Axis((0, 0, 0), (0, 0, 1)) >>> obj.radius_of_gyration(axis) 5.47 Notes: - The radius of gyration is computed based on the shape’s mass properties. - It is useful for evaluating structural stability and rotational behavior.
  # build123d.topology.shape_core.Shape.radius_of_gyration (method)
  radius_of_gyration(axis: Axis) -> float
  #   axis: The axis about which the radius of gyration is computed

  # Change the location of self while keeping it geometrically similar
  # build123d.topology.shape_core.Shape.relocate (method)
  relocate(loc: Location)
  #   loc: new location to set for self

  # rotate a copy
  # Remarks: Rotates a shape around an axis. Returns: a copy of the shape, rotated
  # build123d.topology.shape_core.Shape.rotate (method)
  rotate(axis: Axis, angle: float, transform: bool = False) -> Self
  #   axis: rotation Axis
  #   angle: angle to rotate, in degrees
  #   transform: regenerate the shape instead of just changing its location

  # Scale this shape about a point
  # Remarks: Non-uniform scaling may change the underlying geometry type to splines. When ``about`` isn't provided, the shape is scaled about its location. Returns: Shape: a copy of the scaled shape.
  # build123d.topology.shape_core.Shape.scale (method)
  scale(factor: float | tuple[float, float, float], about: VectorLike | None = None) -> Self
  #   factor: uniform scale factor or three scale factors for the X, Y and Z directions
  #   about: point to scale about

  # Return the Shell
  # build123d.topology.shape_core.Shape.shell (method)
  shell() -> Shell

  # shells - all the shells in this Shape
  # build123d.topology.shape_core.Shape.shells (method)
  shells() -> ShapeList[Shell]

  # Display internal topology
  # Remarks: Display the internal structure of a Compound 'assembly' or Shape. Example: .. code:: >>> c1.show_topology() c1 is the root Compound at 0x7f4a4cafafa0, Location(...)) ├── Solid at 0x7f4a4cafafd0, Location(...)) ├── c2 is 1st compound Compound at 0x7f4a4cafaee0, Location(...)) │ ├── Solid at 0x7f4a4cafad00, Location(...)) │ └── Solid at 0x7f4a11a52790, Location(...)) └── c3 is 2nd Compound at 0x7f4a4cafad60, Location(...)) ├── Solid at 0x7f4a11a52700, Location(...)) └── Solid at 0x7f4a11a58550, Location(...)) Returns: str: tree representation of internal structure
  # build123d.topology.shape_core.Shape.show_topology (method)
  show_topology(limit_class: Literal['Compound', 'Edge', 'Face', 'Shell', 'Solid', 'Vertex', 'Wire'] = 'Vertex', show_center: bool | None = None) -> str
  #   limit_class: type of displayed leaf node
  #   show_center: If None, shows the Location of Compound 'assemblies' and the bounding box center of Shapes

  # Return the Solid
  # build123d.topology.shape_core.Shape.solid (method)
  solid() -> Solid

  # solids - all the solids in this Shape
  # build123d.topology.shape_core.Shape.solids (method)
  solids() -> ShapeList[Solid]

  # split
  # Remarks: Split this shape by the provided plane or face. Returns: Shape: result of split Self | list[Self] | None, Tuple[Self | list[Self] | None]: The result of the split operation. - **Keep.TOP**: Returns the top as a `Self` or `list[Self]`, or `None` if no top is found. - **Keep.BOTTOM**: Returns the bottom as a `Self` or `list[Self]`, or `None` if no bottom is found. - **Keep.BOTH**: Returns a tuple `(inside, outside)` where each element is either a `Self` or `list[Self]`, or `None` if no corresponding part is found.
  # build123d.topology.shape_core.Shape.split (method)
  split(tool: TrimmingTool, keep: Literal[Keep.TOP, Keep.BOTTOM]) -> Self | list[Self] | None
  split(tool: TrimmingTool, keep: Literal[Keep.ALL]) -> list[Self]
  split(tool: TrimmingTool, keep: Literal[Keep.BOTH]) -> tuple[Self | list[Self] | None, Self | list[Self] | None]
  split(tool: TrimmingTool, keep: Literal[Keep.INSIDE, Keep.OUTSIDE]) -> None
  split(tool: TrimmingTool) -> Self | list[Self] | None
  #   keep: which object(s) to save

  # split_by_perimeter
  # Remarks: Divide the faces of this object into those within the perimeter and those outside the perimeter. Note: this method may fail if the perimeter intersects shape edges. Returns: Union[Face | Shell | ShapeList[Face] | None, Tuple[Face | Shell | ShapeList[Face] | None]: The result of the split operation. - **Keep.INSIDE**: Returns the inside part as a `Shell` or `Face`, or `None` if no inside part is found. - **Keep.OUTSIDE**: Returns the outside part as a `Shell` or `Face`, or `None` if no outside part is found. - **Keep.BOTH**: Returns a tuple `(inside, outside)` where each element is either a `Shell`, `Face`, or `None` if no corresponding part is found.
  # Throws: ValueError: perimeter must be closed
  # Throws: ValueError: keep must be one of Keep.INSIDE|OUTSIDE|BOTH
  # build123d.topology.shape_core.Shape.split_by_perimeter (method)
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.INSIDE, Keep.OUTSIDE]) -> Face | Shell | ShapeList[Face] | None
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.BOTH]) -> tuple[Face | Shell | ShapeList[Face] | None, Face | Shell | ShapeList[Face] | None]
  split_by_perimeter(perimeter: Edge | Wire, keep: Literal[Keep.INSIDE] = Keep.INSIDE) -> Face | Shell | ShapeList[Face] | None
  #   perimeter: closed perimeter
  #   keep: which object(s) to return

  # General triangulated approximation
  # build123d.topology.shape_core.Shape.tessellate (method)
  tessellate(tolerance: float, angular_tolerance: float = 0.1) -> tuple[list[Vector], list[tuple[int, int, int]]]

  # to_splines
  # Remarks: A shape-processing utility that forces all geometry in a shape to be converted into BSplines. It's useful when working with tools or export formats that require uniform geometry, or for downstream processing that only understands BSpline representations. Returns: Self: Approximated shape
  # build123d.topology.shape_core.Shape.to_splines (method)
  to_splines(degree: int = 3, tolerance: float = 0.001, nurbs: bool = False) -> Self
  #   degree: Maximum degree
  #   tolerance: Approximation tolerance
  #   nurbs: Use rational splines

  # Apply affine transform
  # Remarks: WARNING: transform_geometry will sometimes convert lines and circles to splines, but it also has the ability to handle skew and stretching transformations. If your transformation is only translation and rotation, it is safer to use :py:meth:`transform_shape`, which doesn't change the underlying type of the geometry, but cannot handle skew transformations. Returns: Shape: a copy of the object, but with geometry transformed
  # build123d.topology.shape_core.Shape.transform_geometry (method)
  transform_geometry(t_matrix: Matrix) -> Self
  #   t_matrix: affine transformation matrix

  # Apply affine transform without changing type
  # Remarks: Transforms a copy of this Shape by the provided 3D affine transformation matrix. Note that not all transformation are supported - primarily designed for translation and rotation. See :transform_geometry: for more comprehensive transformations. Returns: Shape: copy of transformed shape with all objects keeping their type
  # build123d.topology.shape_core.Shape.transform_shape (method)
  transform_shape(t_matrix: Matrix) -> Self
  #   t_matrix: affine transformation matrix

  # Transform Shape
  # Remarks: Rotate and translate the Shape by the three angles (in degrees) and offset. Returns: Shape: transformed object
  # build123d.topology.shape_core.Shape.transformed (method)
  transformed(rotate: VectorLike = (0, 0, 0), offset: VectorLike = (0, 0, 0)) -> Self
  #   rotate: 3-tuple of angles to rotate, in degrees
  #   offset: 3-tuple to offset

  # Translates this shape through a transformation
  # Remarks: Returns: object with a relative move applied
  # build123d.topology.shape_core.Shape.translate (method)
  translate(vector: VectorLike, transform: bool = False) -> Self
  #   vector: relative movement vector
  #   transform: regenerate the shape instead of just changing its location Defaults to False

  # Return the Wire
  # build123d.topology.shape_core.Shape.wire (method)
  wire() -> Wire

  # wires - all the wires in this Shape
  # build123d.topology.shape_core.Shape.wires (method)
  wires() -> ShapeList[Wire]

  # Return the Vertex
  # build123d.topology.shape_core.Shape.vertex (method)
  vertex() -> Vertex

  # vertices - all the vertices in this Shape
  # build123d.topology.shape_core.Shape.vertices (method)
  vertices() -> ShapeList[Vertex]
