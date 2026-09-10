# build123d — composite

4 top-level symbols. Signatures are verbatim python.

// A Compound in build123d is a topological entity representing a collection of
Compound

// Build a Compound from Shapes
Compound(obj: TopoDS_Compound | Iterable[Shape] | None = None, label: str = '', color: Color | None = None, material: str = '', joints: dict[str, Joint] | None = None, parent: Compound | None = None, children: Sequence[Shape] | None = None)
// obj: OCCT Compound or shapes
// label: Defaults to ''
// color: Defaults to None
// material: tag for external tools
// joints: names joints
// parent: assembly parent
// children: assembly children

// volume - the volume of this Compound
volume: float

// Returns the right type of wrapper, given a OCCT object
cast(obj: TopoDS_Shape) -> Vertex | Edge | Wire | Face | Shell | Solid | Compound

// extrude
extrude(obj: Shell, direction: VectorLike) -> Compound
// direction: direction and magnitude of extrusion

// Text that optionally follows a path
make_text(txt: str, font_size: float, font: str = 'Arial', font_path: PathLike[str] | str | None = None, font_style: FontStyle = FontStyle.REGULAR, text_align: tuple[TextAlign, TextAlign] = (TextAlign.CENTER, TextAlign.CENTER), align: Align | tuple[Align, Align] | None = None, position_on_path: float = 0.0, text_path: Edge | Wire | None = None, single_line_width: float = 0.0) -> Compound

// The coordinate system triad (X, Y, Z axes)
make_triad(axes_scale: float) -> Compound

// Return center of object
center(center_of: CenterOf = CenterOf.MASS) -> Vector
// center_of: center option

// Return the Compound
compound() -> Compound

// compounds - all the compounds in this Shape
compounds() -> ShapeList[Compound]

// Do Children Intersect
do_children_intersect(include_parent: bool = False, tolerance: float = 1e-05) -> tuple[bool, tuple[Shape | None, Shape | None], float]
// include_parent: check parent for intersections
// tolerance: maximum allowable volume difference

// get_type
get_type(obj_type: type[Vertex] | type[Edge] | type[Face] | type[Shell] | type[Solid] | type[Wire]) -> list[Vertex | Edge | Face | Shell | Solid | Wire]
// obj_type: Object types to extract

// Distribute touch over compound elements
touch(other: Shape, tolerance: float = 1e-06) -> ShapeList[Vertex | Edge | Face]
// other: Shape to check boundary contacts with
// tolerance: tolerance for contact detection

// project_to_viewport
project_to_viewport(viewport_origin: VectorLike, viewport_up: VectorLike = (0, 0, 1), look_at: VectorLike | None = None, focus: float | None = None) -> tuple[ShapeList[Edge], ShapeList[Edge]]
// viewport_origin: location of viewport
// viewport_up: direction of the viewport y axis
// look_at: point to look at
// focus: the focal length for perspective projection Defaults to None (orthographic projection)

// Strip unnecessary Compound wrappers
unwrap(fully: bool = True) -> Self | Shape
// fully: return base shape without any Compound wrappers (otherwise one Compound is left)

// A Compound containing 1D objects - aka Edges
Curve

// A list of wires created from the edges
wires() -> ShapeList[Wire]

// A Compound containing 3D objects - aka Solids
Part

// A Compound containing 2D objects - aka Faces
Sketch
