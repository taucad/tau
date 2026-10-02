# build123d — build_common

19 top-level symbols. Signatures are verbatim python.

// Category: build_common
// Builder
// Remarks: Base class for the build123d Builders. Attributes: mode (Mode): builder's combination mode workplanes (list[Plane]): active workplanes builder_parent (Builder): build to pass objects to on exit
Builder

  Builder(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  //   workplanes: sequence of Union[Face, Plane, Location]
  //   mode: combination mode

  // Maximum size of object in all directions
  max_dimension: float

  // Edges that changed during last operation
  new_edges: ShapeList[Edge]

  // Return Vertices
  // Remarks: Return either all or the vertices created during the last operation. Returns: ShapeList[Vertex]: Vertices extracted
  vertices(select: Select = Select.ALL) -> ShapeList[Vertex]
  //   select: Vertex selector

  // Return Vertex
  // Remarks: Return a vertex. Returns: Vertex: Vertex extracted
  vertex(select: Select = Select.ALL) -> Vertex
  //   select: Vertex selector

  // Return Edges
  // Remarks: Return either all or the edges created during the last operation. Returns: ShapeList[Edge]: Edges extracted
  edges(select: Select = Select.ALL) -> ShapeList[Edge]
  //   select: Edge selector

  // Return Edge
  // Remarks: Return an edge. Returns: Edge: Edge extracted
  edge(select: Select = Select.ALL) -> Edge
  //   select: Edge selector

  // Return Wires
  // Remarks: Return either all or the wires created during the last operation. Returns: ShapeList[Wire]: Wires extracted
  wires(select: Select = Select.ALL) -> ShapeList[Wire]
  //   select: Wire selector

  // Return Wire
  // Remarks: Return a wire. Returns: Wire: Wire extracted
  wire(select: Select = Select.ALL) -> Wire
  //   select: Wire selector

  // Return Faces
  // Remarks: Return either all or the faces created during the last operation. Returns: ShapeList[Face]: Faces extracted
  faces(select: Select = Select.ALL) -> ShapeList[Face]
  //   select: Face selector

  // Return Face
  // Remarks: Return a face. Returns: Face: Face extracted
  face(select: Select = Select.ALL) -> Face
  //   select: Face selector

  // Return Solids
  // Remarks: Return either all or the solids created during the last operation. Returns: ShapeList[Solid]: Solids extracted
  solids(select: Select = Select.ALL) -> ShapeList[Solid]
  //   select: Solid selector

  // Return Solid
  // Remarks: Return a solid. Returns: Solid: Solid extracted
  solid(select: Select = Select.ALL) -> Solid
  //   select: Solid selector

  // Validate that objects/operations and parameters apply
  validate_inputs(validating_class, objects: Shape | Iterable[Shape] | None = None)

// Category: build_common
// Location Context
// Remarks: Creates a context of rectangular array of locations for Part or Sketch Attributes: x_spacing (float): horizontal spacing y_spacing (float): vertical spacing x_count (int): number of horizontal points y_count (int): number of vertical points align (Union[Align, tuple[Align, Align]]): align min, center, or max of object. local_locations (list{Location}): locations relative to workplane
// Throws: ValueError: Either x or y count must be greater than or equal to one.
GridLocations

  GridLocations(x_spacing: float, y_spacing: float, x_count: int, y_count: int, align: Align | tuple[Align, Align] = (Align.CENTER, Align.CENTER))
  //   x_spacing: horizontal spacing
  //   y_spacing: vertical spacing
  //   x_count: number of horizontal points
  //   y_count: number of vertical points
  //   align: align min, center, or max of object

// Category: build_common
// Location Context
// Remarks: Creates a context of hexagon array of locations for Part or Sketch. When creating hex locations for an array of circles, set `radius` to the radius of the circle plus one half the spacing between the circles. Attributes: radius (float): distance from origin to vertices (major), or optionally from the origin to side (minor or apothem) with major_radius = False apothem (float): radius of the inscribed circle, also known as minor radius x_count (int): number of points ( > 0 ) y_count (int): number of points ( > 0 ) major_radius (bool): If True the radius is the major radius, else the radius is the minor radius (also known as inscribed radius). align (Union[Align, tuple[Align, Align]]): align min, center, or max of object. diagonal (float): major radius local_locations (list{Location}): locations relative to workplane
// Throws: ValueError: Spacing and count must be > 0
HexLocations

  HexLocations(radius: float, x_count: int, y_count: int, major_radius: bool = False, align: Align | tuple[Align, Align] = (Align.CENTER, Align.CENTER))
  //   radius: distance from origin to vertices (major), or optionally from the origin to side (minor or apothem) with major_radius = False
  //   x_count: number of points ( > 0 )
  //   y_count: number of points ( > 0 )
  //   major_radius: If True the radius is the major radius, else the radius is the minor radius (also known as inscribed radius)
  //   align: align min, center, or max of object

// Category: build_common
// Location Context
// Remarks: A stateful context of active locations. At least one must be active at all time. Note that local locations are stored and global locations are returned as a property of the local locations and the currently active workplanes.
LocationList

  // Current local locations globalized with current workplanes
  locations: list[Location]

  LocationList(locations: list[Location])
  //   locations: list of locations to add to the context

// Category: build_common
// Location Context
// Remarks: Creates a context of locations for Part or Sketch Attributes: local_locations (list{Location}): locations relative to workplane
Locations

  Locations(*pts: VectorLike | Vertex | Location | Face | Plane | Axis | Iterable[VectorLike | Vertex | Location | Face | Plane | Axis])
  //   pts: sequence of points to push

// Category: build_common
// Location Context
// Remarks: Creates a context of polar array of locations for Part or Sketch Attributes: local_locations (list{Location}): locations relative to workplane
// Throws: ValueError: Count must be greater than or equal to 1
PolarLocations

  PolarLocations(radius: float, count: int, start_angle: float = 0.0, angular_range: float = 360.0, rotate: bool = True, endpoint: bool = False)
  //   radius: array radius
  //   count: Number of points to push
  //   start_angle: angle to first point from +ve X axis
  //   angular_range: magnitude of array from start angle
  //   rotate: Align locations with arc tangents
  //   endpoint: If True, `start_angle` + `angular_range` is the last sample

// Category: build_common
// Workplane Context
// Remarks: A stateful context of active workplanes. At least one must be active at all time. Attributes: workplanes (list[Plane]): list of workplanes
WorkplaneList

  WorkplaneList(*workplanes: Face | Plane | Location)
  //   workplanes: objects to become planes

  // Localize a sequence of points to the active workplane
  // Remarks: (only used by BuildLine where there is only one active workplane) The return value is conditional: - 1 point -> Vector - >1 points -> list[Vector]
  localize(*points: VectorLike)

// Category: build_common
// Return Edge
// Remarks: Return an edge. Returns: Edge: Edge extracted
edge(select: Select = Select.ALL) -> Edge
//   select: Edge selector

// Category: build_common
// Return Edges
// Remarks: Return either all or the edges created during the last operation. Returns: ShapeList[Edge]: Edges extracted
edges(select: Select = Select.ALL) -> ShapeList[Edge]
//   select: Edge selector

// Category: build_common
// Return Face
// Remarks: Return a face. Returns: Face: Face extracted
face(select: Select = Select.ALL) -> Face
//   select: Face selector

// Category: build_common
// Return Faces
// Remarks: Return either all or the faces created during the last operation. Returns: ShapeList[Face]: Faces extracted
faces(select: Select = Select.ALL) -> ShapeList[Face]
//   select: Face selector

// Category: build_common
// Convert a sequence of object potentially containing iterables into a flat list
flatten_sequence(*obj: T) -> ShapeList[Any]

// Category: build_common
// Return Solid
// Remarks: Return a solid. Returns: Solid: Solid extracted
solid(select: Select = Select.ALL) -> Solid
//   select: Solid selector

// Category: build_common
// Return Solids
// Remarks: Return either all or the solids created during the last operation. Returns: ShapeList[Solid]: Solids extracted
solids(select: Select = Select.ALL) -> ShapeList[Solid]
//   select: Solid selector

// Category: build_common
// A function to wrap the method when used outside of a Builder context
validate_inputs(context: Builder | None, validating_class, objects: Iterable[Shape] | None = None)

// Category: build_common
// Return Vertex
// Remarks: Return a vertex. Returns: Vertex: Vertex extracted
vertex(select: Select = Select.ALL) -> Vertex
//   select: Vertex selector

// Category: build_common
// Return Vertices
// Remarks: Return either all or the vertices created during the last operation. Returns: ShapeList[Vertex]: Vertices extracted
vertices(select: Select = Select.ALL) -> ShapeList[Vertex]
//   select: Vertex selector

// Category: build_common
// Return Wire
// Remarks: Return a wire. Returns: Wire: Wire extracted
wire(select: Select = Select.ALL) -> Wire
//   select: Wire selector

// Category: build_common
// Return Wires
// Remarks: Return either all or the wires created during the last operation. Returns: ShapeList[Wire]: Wires extracted
wires(select: Select = Select.ALL) -> ShapeList[Wire]
//   select: Wire selector
