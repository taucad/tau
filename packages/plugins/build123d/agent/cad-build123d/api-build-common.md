# build123d — build_common

19 top-level symbols. Signatures are verbatim python.

// Builder
Builder

  // build123d.build_common.Builder.__init__ (constructor)
  Builder(*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
  //   workplanes: sequence of Union[Face, Plane, Location]
  //   mode: combination mode

  // Maximum size of object in all directions
  max_dimension: float

  // Edges that changed during last operation
  new_edges: ShapeList[Edge]

  // Return Vertices
  // build123d.build_common.Builder.vertices (method)
  vertices(select: Select = Select.ALL) -> ShapeList[Vertex]
  //   select: Vertex selector

  // Return Vertex
  // build123d.build_common.Builder.vertex (method)
  vertex(select: Select = Select.ALL) -> Vertex
  //   select: Vertex selector

  // Return Edges
  // build123d.build_common.Builder.edges (method)
  edges(select: Select = Select.ALL) -> ShapeList[Edge]
  //   select: Edge selector

  // Return Edge
  // build123d.build_common.Builder.edge (method)
  edge(select: Select = Select.ALL) -> Edge
  //   select: Edge selector

  // Return Wires
  // build123d.build_common.Builder.wires (method)
  wires(select: Select = Select.ALL) -> ShapeList[Wire]
  //   select: Wire selector

  // Return Wire
  // build123d.build_common.Builder.wire (method)
  wire(select: Select = Select.ALL) -> Wire
  //   select: Wire selector

  // Return Faces
  // build123d.build_common.Builder.faces (method)
  faces(select: Select = Select.ALL) -> ShapeList[Face]
  //   select: Face selector

  // Return Face
  // build123d.build_common.Builder.face (method)
  face(select: Select = Select.ALL) -> Face
  //   select: Face selector

  // Return Solids
  // build123d.build_common.Builder.solids (method)
  solids(select: Select = Select.ALL) -> ShapeList[Solid]
  //   select: Solid selector

  // Return Solid
  // build123d.build_common.Builder.solid (method)
  solid(select: Select = Select.ALL) -> Solid
  //   select: Solid selector

  // Validate that objects/operations and parameters apply
  // build123d.build_common.Builder.validate_inputs (method)
  validate_inputs(validating_class, objects: Shape | Iterable[Shape] | None = None)

// Location Context
GridLocations

  // build123d.build_common.GridLocations.__init__ (constructor)
  GridLocations(x_spacing: float, y_spacing: float, x_count: int, y_count: int, align: Align | tuple[Align, Align] = (Align.CENTER, Align.CENTER))
  //   x_spacing: horizontal spacing
  //   y_spacing: vertical spacing
  //   x_count: number of horizontal points
  //   y_count: number of vertical points
  //   align: align min, center, or max of object

// Location Context
HexLocations

  // build123d.build_common.HexLocations.__init__ (constructor)
  HexLocations(radius: float, x_count: int, y_count: int, major_radius: bool = False, align: Align | tuple[Align, Align] = (Align.CENTER, Align.CENTER))
  //   radius: distance from origin to vertices (major), or optionally from the origin to side (minor or apothem) with major_radius = False
  //   x_count: number of points ( > 0 )
  //   y_count: number of points ( > 0 )
  //   major_radius: If True the radius is the major radius, else the radius is the minor radius (also known as inscribed radius)
  //   align: align min, center, or max of object

// Location Context
LocationList

  // Current local locations globalized with current workplanes
  locations: list[Location]

  // build123d.build_common.LocationList.__init__ (constructor)
  LocationList(locations: list[Location])
  //   locations: list of locations to add to the context

// Location Context
Locations

  // build123d.build_common.Locations.__init__ (constructor)
  Locations(*pts: VectorLike | Vertex | Location | Face | Plane | Axis | Iterable[VectorLike | Vertex | Location | Face | Plane | Axis])
  //   pts: sequence of points to push

// Location Context
PolarLocations

  // build123d.build_common.PolarLocations.__init__ (constructor)
  PolarLocations(radius: float, count: int, start_angle: float = 0.0, angular_range: float = 360.0, rotate: bool = True, endpoint: bool = False)
  //   radius: array radius
  //   count: Number of points to push
  //   start_angle: angle to first point from +ve X axis
  //   angular_range: magnitude of array from start angle
  //   rotate: Align locations with arc tangents
  //   endpoint: If True, `start_angle` + `angular_range` is the last sample

// Workplane Context
WorkplaneList

  // build123d.build_common.WorkplaneList.__init__ (constructor)
  WorkplaneList(*workplanes: Face | Plane | Location)
  //   workplanes: objects to become planes

  // Localize a sequence of points to the active workplane
  // build123d.build_common.WorkplaneList.localize (method)
  localize(*points: VectorLike)

// Return Edge
// build123d.build_common.edge (function)
edge(select: Select = Select.ALL) -> Edge
//   select: Edge selector

// Return Edges
// build123d.build_common.edges (function)
edges(select: Select = Select.ALL) -> ShapeList[Edge]
//   select: Edge selector

// Return Face
// build123d.build_common.face (function)
face(select: Select = Select.ALL) -> Face
//   select: Face selector

// Return Faces
// build123d.build_common.faces (function)
faces(select: Select = Select.ALL) -> ShapeList[Face]
//   select: Face selector

// Convert a sequence of object potentially containing iterables into a flat list
// build123d.build_common.flatten_sequence (function)
flatten_sequence(*obj: T) -> ShapeList[Any]

// Return Solid
// build123d.build_common.solid (function)
solid(select: Select = Select.ALL) -> Solid
//   select: Solid selector

// Return Solids
// build123d.build_common.solids (function)
solids(select: Select = Select.ALL) -> ShapeList[Solid]
//   select: Solid selector

// A function to wrap the method when used outside of a Builder context
// build123d.build_common.validate_inputs (function)
validate_inputs(context: Builder | None, validating_class, objects: Iterable[Shape] | None = None)

// Return Vertex
// build123d.build_common.vertex (function)
vertex(select: Select = Select.ALL) -> Vertex
//   select: Vertex selector

// Return Vertices
// build123d.build_common.vertices (function)
vertices(select: Select = Select.ALL) -> ShapeList[Vertex]
//   select: Vertex selector

// Return Wire
// build123d.build_common.wire (function)
wire(select: Select = Select.ALL) -> Wire
//   select: Wire selector

// Return Wires
// build123d.build_common.wires (function)
wires(select: Select = Select.ALL) -> ShapeList[Wire]
//   select: Wire selector
