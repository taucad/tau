# build123d — shape_core

3 top-level symbols. Signatures are verbatim python.

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
  filter_by(filter_by: Callable[[T], bool] | Axis | Plane | GeomType | Convexity | property, reverse: bool = False, tolerance: float = 1e-05) -> ShapeList[T]
  #   filter_by: function, axis, plane, geom type or convexity to filter and possibly sort by
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
  # Remarks: Group objects by provided criteria and then sort the groups according to the criteria. Note that not all group_by criteria apply to all objects. Grouping by ``Convexity`` classifies each object relative to the shape it was selected from, with the groups in the enum's definition order. Returns: GroupBy[T, K]: sorted groups of ShapeLists
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
