# build123d — composite

4 top-level symbols. Signatures are verbatim python.

// Category: composite
// A Compound in build123d is a topological entity representing a collection of
// Remarks: geometric shapes grouped together within a single structure. It serves as a container for organizing diverse shapes like edges, faces, or solids. This hierarchical arrangement facilitates the construction of complex models by combining simpler shapes. Compound plays a pivotal role in managing the composition and structure of intricate 3D models in computer-aided design (CAD) applications, allowing engineers and designers to work with assemblies of shapes as unified entities for efficient modeling and analysis.
Compound

  // Build a Compound from Shapes
  Compound(obj: TopoDS_Compound | Iterable[Shape] | None = None, label: str = '', color: Color | None = None, material: str = '', joints: dict[str, Joint] | None = None, parent: Compound | None = None, children: Sequence[Shape] | None = None)
  //   obj: OCCT Compound or shapes
  //   label: Defaults to ''
  //   color: Defaults to None
  //   material: tag for external tools
  //   joints: names joints
  //   parent: assembly parent
  //   children: assembly children

  // volume - the volume of this Compound
  volume: float

  // Returns the right type of wrapper, given a OCCT object
  cast(obj: TopoDS_Shape) -> Vertex | Edge | Wire | Face | Shell | Solid | Compound

  // extrude
  // Remarks: Extrude a Shell into a Compound. Returns: Edge: extruded shape
  // Throws: ValueError: Unsupported class
  // Throws: RuntimeError: Generated invalid result
  extrude(obj: Shell, direction: VectorLike) -> Compound
  //   direction: direction and magnitude of extrusion

  // Text that optionally follows a path
  // Remarks: The text that is created can be combined as with other sketch features by specifying a mode or rotated by the given angle. In addition, edges have been previously created with arc or segment, the text will follow the path defined by these edges. The start parameter can be used to shift the text along the path to achieve precise positioning.
  make_text(txt: str, font_size: float, font: str = 'Arial', font_path: PathLike[str] | str | None = None, font_style: FontStyle = FontStyle.REGULAR, text_align: tuple[TextAlign, TextAlign] = (TextAlign.CENTER, TextAlign.CENTER), align: Align | tuple[Align, Align] | None = None, position_on_path: float = 0.0, text_path: Edge | Wire | None = None, single_line_width: float = 0.0) -> Compound

  // The coordinate system triad (X, Y, Z axes)
  make_triad(axes_scale: float) -> Compound

  // Return center of object
  // Remarks: Find center of object Returns: Vector: center
  // Throws: ValueError: Center of GEOMETRY is not supported for this object
  // Throws: NotImplementedError: Unable to calculate center of mass of this object
  center(center_of: CenterOf = CenterOf.MASS) -> Vector
  //   center_of: center option

  // Return the Compound
  compound() -> Compound

  // compounds - all the compounds in this Shape
  compounds() -> ShapeList[Compound]

  // Do Children Intersect
  // Remarks: Determine if any of the child objects within a Compound/assembly intersect by intersecting each of the shapes with each other and checking for a common volume. Returns: tuple[bool, tuple[Shape, Shape], float]: do the object intersect, intersecting objects, volume of intersection
  do_children_intersect(include_parent: bool = False, tolerance: float = 1e-05) -> tuple[bool, tuple[Shape | None, Shape | None], float]
  //   include_parent: check parent for intersections
  //   tolerance: maximum allowable volume difference

  // get_type
  // Remarks: Extract the objects of the given type from a Compound. Note that this isn't the same as Faces() etc. which will extract Faces from Solids. Returns: list[Union[Vertex, Edge, Face, Shell, Solid, Wire]]: Extracted objects
  get_type(obj_type: type[Vertex] | type[Edge] | type[Face] | type[Shell] | type[Solid] | type[Wire]) -> list[Vertex | Edge | Face | Shell | Solid | Wire]
  //   obj_type: Object types to extract

  // Distribute touch over compound elements
  // Remarks: Iterates over elements and collects touch results. Only Solid and Face elements produce boundary contacts; other shapes return empty. Returns: ShapeList of boundary contact geometry (empty if no contact)
  touch(other: Shape, tolerance: float = 1e-06) -> ShapeList[Vertex | Edge | Face]
  //   other: Shape to check boundary contacts with
  //   tolerance: tolerance for contact detection

  // project_to_viewport
  // Remarks: Project a shape onto a viewport returning visible and hidden Edges. Returns: tuple[ShapeList[Edge],ShapeList[Edge]]: visible & hidden Edges
  project_to_viewport(viewport_origin: VectorLike, viewport_up: VectorLike = (0, 0, 1), look_at: VectorLike | None = None, focus: float | None = None) -> tuple[ShapeList[Edge], ShapeList[Edge]]
  //   viewport_origin: location of viewport
  //   viewport_up: direction of the viewport y axis
  //   look_at: point to look at
  //   focus: the focal length for perspective projection Defaults to None (orthographic projection)

  // Strip unnecessary Compound wrappers
  // Remarks: Returns: Union[Self, Shape]: base shape
  unwrap(fully: bool = True) -> Self | Shape
  //   fully: return base shape without any Compound wrappers (otherwise one Compound is left)

// Category: composite
// A Compound containing 1D objects - aka Edges
Curve

  // A list of wires created from the edges
  wires() -> ShapeList[Wire]

// Category: composite
// A Compound containing 3D objects - aka Solids
Part

// Category: composite
// A Compound containing 2D objects - aka Faces
Sketch
