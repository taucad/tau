# build123d — objects_part

11 top-level symbols. Signatures are verbatim python.

// BasePartObject
BasePartObject

BasePartObject(part: Part | Solid, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] | None = None, mode: Mode = Mode.ADD)
// rotation: angles to rotate about axes
// align: align MIN, CENTER, or MAX of object
// mode: combination mode

// Part Object
Box

Box(length: float, width: float, height: float, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
// length: box length
// width: box width
// height: box height
// rotation: angles to rotate about axes
// align: align MIN, CENTER, or MAX of object
// mode: combine mode

// Part Object
Cone

Cone(bottom_radius: float, top_radius: float, height: float, arc_size: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
// bottom_radius: bottom radius
// top_radius: top radius, may be zero
// height: cone height
// arc_size: angular size of cone
// rotation: angles to rotate about axes
// align: align MIN, CENTER, or MAX of object
// mode: combine mode

// Part Object
ConvexPolyhedron

ConvexPolyhedron(points: Iterable[VectorLike], rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] | None = Align.NONE, mode: Mode = Mode.ADD)
// points: vertices of the polyhedron
// rotation: angles to rotate about axes
// align: align MIN, CENTER, or MAX of object
// mode: combine mode

// Part Operation
CounterBoreHole

CounterBoreHole(radius: float, counter_bore_radius: float, counter_bore_depth: float, depth: float | None = None, mode: Mode = Mode.SUBTRACT)
// radius: hole radius
// counter_bore_radius: counter bore radius
// counter_bore_depth: counter bore depth
// depth: hole depth, through part if None
// mode: combination mode

// Part Operation
CounterSinkHole

CounterSinkHole(radius: float, counter_sink_radius: float, depth: float | None = None, counter_sink_angle: float = 82, mode: Mode = Mode.SUBTRACT)
// radius: hole radius
// counter_sink_radius: countersink radius
// depth: hole depth, through part if None
// counter_sink_angle: cone angle
// mode: combination mode

// Part Object
Cylinder

Cylinder(radius: float, height: float, arc_size: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
// radius: cylinder radius
// height: cylinder height
// arc_size: angular size of cone
// rotation: angles to rotate about axes
// align: align MIN, CENTER, or MAX of object
// mode: combine mode

// Part Operation
Hole

Hole(radius: float, depth: float | None = None, mode: Mode = Mode.SUBTRACT)
// radius: hole radius
// depth: hole depth, through part if None
// mode: combination mode

// Part Object
Sphere

Sphere(radius: float, arc_size1: float = -90, arc_size2: float = 90, arc_size3: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
// radius: sphere radius
// arc_size1: angular size of bottom hemisphere
// arc_size2: angular size of top hemisphere
// arc_size3: angular revolution about pole
// rotation: angles to rotate about axes
// align: align MIN, CENTER, or MAX of object
// mode: combine mode

// Part Object
Torus

Torus(major_radius: float, minor_radius: float, minor_start_angle: float = 0, minor_end_angle: float = 360, major_angle: float = 360, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
// major_radius: major torus radius
// minor_radius: minor torus radius
// minor_start_angle: angle to start minor arc
// minor_end_angle: angle to end minor arc
// major_angle: angle to revolve minor arc
// rotation: angles to rotate about axes
// align: align MIN, CENTER, or MAX of object
// mode: combine mode

// Part Object
Wedge

Wedge(xsize: float, ysize: float, zsize: float, xmin: float, zmin: float, xmax: float, zmax: float, rotation: RotationLike = (0, 0, 0), align: Align | tuple[Align, Align, Align] = (Align.CENTER, Align.CENTER, Align.CENTER), mode: Mode = Mode.ADD)
// xsize: length of near face along x-axis
// ysize: length of part along y-axis
// zsize: length of near face z-axis
// xmin: minimum position far face along x-axis
// zmin: minimum position far face along z-axis
// xmax: maximum position far face along x-axis
// zmax: maximum position far face along z-axis
// rotation: angles to rotate about axes
// align: align MIN, CENTER, or MAX of object
// mode: combine mode
