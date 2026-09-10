# build123d — build_common

19 top-level symbols. Signatures are verbatim python.

// Builder
Builder

Builder(\*workplanes: Face | Plane | Location, mode: Mode = Mode.ADD)
// workplanes: sequence of Union[Face, Plane, Location]
// mode: combination mode

// Maximum size of object in all directions
max_dimension: float

// Edges that changed during last operation
new_edges: ShapeList[Edge]

// Return Vertices
vertices(select: Select = Select.ALL) -> ShapeList[Vertex]
// select: Vertex selector

// Return Vertex
vertex(select: Select = Select.ALL) -> Vertex
// select: Vertex selector

// Return Edges
edges(select: Select = Select.ALL) -> ShapeList[Edge]
// select: Edge selector

// Return Edge
edge(select: Select = Select.ALL) -> Edge
// select: Edge selector

// Return Wires
wires(select: Select = Select.ALL) -> ShapeList[Wire]
// select: Wire selector

// Return Wire
wire(select: Select = Select.ALL) -> Wire
// select: Wire selector

// Return Faces
faces(select: Select = Select.ALL) -> ShapeList[Face]
// select: Face selector

// Return Face
face(select: Select = Select.ALL) -> Face
// select: Face selector

// Return Solids
solids(select: Select = Select.ALL) -> ShapeList[Solid]
// select: Solid selector

// Return Solid
solid(select: Select = Select.ALL) -> Solid
// select: Solid selector

// Validate that objects/operations and parameters apply
validate_inputs(validating_class, objects: Shape | Iterable[Shape] | None = None)

// Location Context
GridLocations

GridLocations(x_spacing: float, y_spacing: float, x_count: int, y_count: int, align: Align | tuple[Align, Align] = (Align.CENTER, Align.CENTER))
// x_spacing: horizontal spacing
// y_spacing: vertical spacing
// x_count: number of horizontal points
// y_count: number of vertical points
// align: align min, center, or max of object

// Location Context
HexLocations

HexLocations(radius: float, x_count: int, y_count: int, major_radius: bool = False, align: Align | tuple[Align, Align] = (Align.CENTER, Align.CENTER))
// radius: distance from origin to vertices (major), or optionally from the origin to side (minor or apothem) with major_radius = False
// x_count: number of points ( > 0 )
// y_count: number of points ( > 0 )
// major_radius: If True the radius is the major radius, else the radius is the minor radius (also known as inscribed radius)
// align: align min, center, or max of object

// Location Context
LocationList

// Current local locations globalized with current workplanes
locations: list[Location]

LocationList(locations: list[Location])
// locations: list of locations to add to the context

// Location Context
Locations

Locations(\*pts: VectorLike | Vertex | Location | Face | Plane | Axis | Iterable[VectorLike | Vertex | Location | Face | Plane | Axis])
// pts: sequence of points to push

// Location Context
PolarLocations

PolarLocations(radius: float, count: int, start_angle: float = 0.0, angular_range: float = 360.0, rotate: bool = True, endpoint: bool = False)
// radius: array radius
// count: Number of points to push
// start_angle: angle to first point from +ve X axis
// angular_range: magnitude of array from start angle
// rotate: Align locations with arc tangents
// endpoint: If True, `start_angle` + `angular_range` is the last sample

// Workplane Context
WorkplaneList

WorkplaneList(\*workplanes: Face | Plane | Location)
// workplanes: objects to become planes

// Localize a sequence of points to the active workplane
localize(\*points: VectorLike)

// Return Edge
edge(select: Select = Select.ALL) -> Edge
// select: Edge selector

// Return Edges
edges(select: Select = Select.ALL) -> ShapeList[Edge]
// select: Edge selector

// Return Face
face(select: Select = Select.ALL) -> Face
// select: Face selector

// Return Faces
faces(select: Select = Select.ALL) -> ShapeList[Face]
// select: Face selector

// Convert a sequence of object potentially containing iterables into a flat list
flatten_sequence(\*obj: T) -> ShapeList[Any]

// Return Solid
solid(select: Select = Select.ALL) -> Solid
// select: Solid selector

// Return Solids
solids(select: Select = Select.ALL) -> ShapeList[Solid]
// select: Solid selector

// A function to wrap the method when used outside of a Builder context
validate_inputs(context: Builder | None, validating_class, objects: Iterable[Shape] | None = None)

// Return Vertex
vertex(select: Select = Select.ALL) -> Vertex
// select: Vertex selector

// Return Vertices
vertices(select: Select = Select.ALL) -> ShapeList[Vertex]
// select: Vertex selector

// Return Wire
wire(select: Select = Select.ALL) -> Wire
// select: Wire selector

// Return Wires
wires(select: Select = Select.ALL) -> ShapeList[Wire]
// select: Wire selector
