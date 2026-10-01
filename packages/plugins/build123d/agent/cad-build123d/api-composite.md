# build123d — composite

4 top-level symbols. Signatures are verbatim python.

// A Compound in build123d is a topological entity representing a collection of
Compound

  // Build a Compound from Shapes
  // build123d.topology.composite.Compound.__init__ (constructor)
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
  // build123d.topology.composite.Compound.cast (method)
  cast(obj: TopoDS_Shape) -> Vertex | Edge | Wire | Face | Shell | Solid | Compound

  // extrude
  // build123d.topology.composite.Compound.extrude (method)
  extrude(obj: Shell, direction: VectorLike) -> Compound
  //   direction: direction and magnitude of extrusion

  // Text that optionally follows a path
  // build123d.topology.composite.Compound.make_text (method)
  make_text(txt: str, font_size: float, font: str = 'Arial', font_path: PathLike[str] | str | None = None, font_style: FontStyle = FontStyle.REGULAR, text_align: tuple[TextAlign, TextAlign] = (TextAlign.CENTER, TextAlign.CENTER), align: Align | tuple[Align, Align] | None = None, position_on_path: float = 0.0, text_path: Edge | Wire | None = None, single_line_width: float = 0.0) -> Compound

  // The coordinate system triad (X, Y, Z axes)
  // build123d.topology.composite.Compound.make_triad (method)
  make_triad(axes_scale: float) -> Compound

  // Return center of object
  // build123d.topology.composite.Compound.center (method)
  center(center_of: CenterOf = CenterOf.MASS) -> Vector
  //   center_of: center option

  // Return the Compound
  // build123d.topology.composite.Compound.compound (method)
  compound() -> Compound

  // compounds - all the compounds in this Shape
  // build123d.topology.composite.Compound.compounds (method)
  compounds() -> ShapeList[Compound]

  // Do Children Intersect
  // build123d.topology.composite.Compound.do_children_intersect (method)
  do_children_intersect(include_parent: bool = False, tolerance: float = 1e-05) -> tuple[bool, tuple[Shape | None, Shape | None], float]
  //   include_parent: check parent for intersections
  //   tolerance: maximum allowable volume difference

  // get_type
  // build123d.topology.composite.Compound.get_type (method)
  get_type(obj_type: type[Vertex] | type[Edge] | type[Face] | type[Shell] | type[Solid] | type[Wire]) -> list[Vertex | Edge | Face | Shell | Solid | Wire]
  //   obj_type: Object types to extract

  // Distribute touch over compound elements
  // build123d.topology.composite.Compound.touch (method)
  touch(other: Shape, tolerance: float = 1e-06) -> ShapeList[Vertex | Edge | Face]
  //   other: Shape to check boundary contacts with
  //   tolerance: tolerance for contact detection

  // project_to_viewport
  // build123d.topology.composite.Compound.project_to_viewport (method)
  project_to_viewport(viewport_origin: VectorLike, viewport_up: VectorLike = (0, 0, 1), look_at: VectorLike | None = None, focus: float | None = None) -> tuple[ShapeList[Edge], ShapeList[Edge]]
  //   viewport_origin: location of viewport
  //   viewport_up: direction of the viewport y axis
  //   look_at: point to look at
  //   focus: the focal length for perspective projection Defaults to None (orthographic projection)

  // Strip unnecessary Compound wrappers
  // build123d.topology.composite.Compound.unwrap (method)
  unwrap(fully: bool = True) -> Self | Shape
  //   fully: return base shape without any Compound wrappers (otherwise one Compound is left)

// A Compound containing 1D objects - aka Edges
Curve

  // A list of wires created from the edges
  // build123d.topology.composite.Curve.wires (method)
  wires() -> ShapeList[Wire]

// A Compound containing 3D objects - aka Solids
Part

// A Compound containing 2D objects - aka Faces
Sketch
