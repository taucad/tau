# build123d — composite

4 top-level symbols. Signatures are verbatim python.

# Category: composite
# A Compound in build123d is a topological entity representing a collection of
# Remarks: geometric shapes grouped together within a single structure. It serves as a container for organizing diverse shapes like edges, faces, or solids. This hierarchical arrangement facilitates the construction of complex models by combining simpler shapes. Compound plays a pivotal role in managing the composition and structure of intricate 3D models in computer-aided design (CAD) applications, allowing engineers and designers to work with assemblies of shapes as unified entities for efficient modeling and analysis.
# build123d.topology.composite.Compound (class)
class Compound(Mixin3D)

  # Build a Compound from Shapes
  # build123d.topology.composite.Compound.__init__ (constructor)
  Compound(obj: TopoDS_Compound | Iterable[Shape] | None = None, label: str = '', color: Color | None = None, material: str = '', joints: dict[str, Joint] | None = None, parent: Compound | None = None, children: Sequence[Shape] | None = None)
  #   obj: OCCT Compound or shapes
  #   label: Defaults to ''
  #   color: Defaults to None
  #   material: tag for external tools
  #   joints: names joints
  #   parent: assembly parent
  #   children: assembly children

  # volume - the volume of this Compound
  volume: float

  # Returns the right type of wrapper, given a OCCT object
  # build123d.topology.composite.Compound.cast (method)
  cast(obj: TopoDS_Shape) -> Vertex | Edge | Wire | Face | Shell | Solid | Compound

  # extrude
  # Remarks: Extrude a Shell into a Compound. Returns: Edge: extruded shape
  # Throws: ValueError: Unsupported class
  # Throws: RuntimeError: Generated invalid result
  # build123d.topology.composite.Compound.extrude (method)
  extrude(obj: Shell, direction: VectorLike) -> Compound
  #   direction: direction and magnitude of extrusion

  # Text that optionally follows a path
  # Remarks: The text that is created can be combined as with other sketch features by specifying a mode or rotated by the given angle. In addition, edges have been previously created with arc or segment, the text will follow the path defined by these edges. The start parameter can be used to shift the text along the path to achieve precise positioning.
  # build123d.topology.composite.Compound.make_text (method)
  make_text(txt: str, font_size: float, font: str = 'Arial', font_path: PathLike[str] | str | None = None, font_style: FontStyle = FontStyle.REGULAR, text_align: tuple[TextAlign, TextAlign] = (TextAlign.CENTER, TextAlign.CENTER), align: Align | tuple[Align, Align] | None = None, position_on_path: float = 0.0, text_path: Edge | Wire | None = None, single_line_width: float = 0.0) -> Compound

  # The coordinate system triad (X, Y, Z axes)
  # build123d.topology.composite.Compound.make_triad (method)
  make_triad(axes_scale: float) -> Compound

  # Combine other to self `+` operator
  # Remarks: Note that if all of the objects are connected Edges/Wires the result will be a Wire, otherwise a Shape.
  # build123d.topology.composite.Compound.__add__ (method)
  __add__(other: None | Shape | Iterable[Shape]) -> Compound | Wire  # Compound + other

  # Intersect other to self `&` operator
  # build123d.topology.composite.Compound.__and__ (method)
  __and__(other: Shape | Iterable[Shape]) -> Compound  # Compound & other

  # Cut other to self `-` operator
  # build123d.topology.composite.Compound.__sub__ (method)
  __sub__(other: None | Shape | Iterable[Shape]) -> Compound  # Compound - other

  # Return center of object
  # Remarks: Find center of object Returns: Vector: center
  # Throws: ValueError: Center of GEOMETRY is not supported for this object
  # Throws: NotImplementedError: Unable to calculate center of mass of this object
  # build123d.topology.composite.Compound.center (method)
  center(center_of: CenterOf = CenterOf.MASS) -> Vector
  #   center_of: center option

  # Return the Compound
  # build123d.topology.composite.Compound.compound (method)
  compound() -> Compound

  # compounds - all the compounds in this Shape
  # build123d.topology.composite.Compound.compounds (method)
  compounds() -> ShapeList[Compound]

  # Do Children Intersect
  # Remarks: Determine if any of the child objects within a Compound/assembly intersect by intersecting each of the shapes with each other and checking for a common volume. Returns: tuple[bool, tuple[Shape, Shape], float]: do the object intersect, intersecting objects, volume of intersection
  # build123d.topology.composite.Compound.do_children_intersect (method)
  do_children_intersect(include_parent: bool = False, tolerance: float = 1e-05) -> tuple[bool, tuple[Shape | None, Shape | None], float]
  #   include_parent: check parent for intersections
  #   tolerance: maximum allowable volume difference

  # get_type
  # Remarks: Extract the objects of the given type from a Compound. Note that this isn't the same as Faces() etc. which will extract Faces from Solids. Returns: list[Union[Vertex, Edge, Face, Shell, Solid, Wire]]: Extracted objects
  # build123d.topology.composite.Compound.get_type (method)
  get_type(obj_type: type[Vertex] | type[Edge] | type[Face] | type[Shell] | type[Solid] | type[Wire]) -> list[Vertex | Edge | Face | Shell | Solid | Wire]
  #   obj_type: Object types to extract

  # Distribute touch over compound elements
  # Remarks: Iterates over elements and collects touch results. Only Solid and Face elements produce boundary contacts; other shapes return empty. Returns: ShapeList of boundary contact geometry (empty if no contact)
  # build123d.topology.composite.Compound.touch (method)
  touch(other: Shape, tolerance: float = 1e-06) -> ShapeList[Vertex | Edge | Face]
  #   other: Shape to check boundary contacts with
  #   tolerance: tolerance for contact detection

  # project_to_viewport
  # Remarks: Project a shape onto a viewport returning visible and hidden Edges. Returns: tuple[ShapeList[Edge],ShapeList[Edge]]: visible & hidden Edges
  # build123d.topology.composite.Compound.project_to_viewport (method)
  project_to_viewport(viewport_origin: VectorLike, viewport_up: VectorLike = (0, 0, 1), look_at: VectorLike | None = None, focus: float | None = None) -> tuple[ShapeList[Edge], ShapeList[Edge]]
  #   viewport_origin: location of viewport
  #   viewport_up: direction of the viewport y axis
  #   look_at: point to look at
  #   focus: the focal length for perspective projection Defaults to None (orthographic projection)

  # Strip unnecessary Compound wrappers
  # Remarks: Returns: Union[Self, Shape]: base shape
  # build123d.topology.composite.Compound.unwrap (method)
  unwrap(fully: bool = True) -> Self | Shape
  #   fully: return base shape without any Compound wrappers (otherwise one Compound is left)

# Category: composite
# A Compound containing 1D objects - aka Edges
# build123d.topology.composite.Curve (class)
class Curve(Compound)

  # fuse shape to wire/edge operator +
  # build123d.topology.composite.Curve.__add__ (method)
  __add__(other: None) -> Self  # Curve + other
  __add__(other: Shape | Iterable[Shape]) -> Edge | Wire | Curve  # Curve + other

  # Position on curve operator @ - only works if continuous
  # build123d.topology.composite.Curve.__matmul__ (method)
  __matmul__(position: float) -> Vector  # Curve @ position

  # Tangent on wire operator % - only works if continuous
  # build123d.topology.composite.Curve.__mod__ (method)
  __mod__(position: float) -> Vector  # Curve % position

  # Location on wire operator ^ - only works if continuous
  # build123d.topology.composite.Curve.__xor__ (method)
  __xor__(position: float) -> Location  # Curve ^ position

  # A list of wires created from the edges
  # build123d.topology.composite.Curve.wires (method)
  wires() -> ShapeList[Wire]

# Category: composite
# A Compound containing 3D objects - aka Solids
# build123d.topology.composite.Part (class)
class Part(Compound)

  # build123d.topology.composite.Part.__iadd__ (method)
  __iadd__(other: None | Shape | Iterable[Shape]) -> Part  # Part += other

# Category: composite
# A Compound containing 2D objects - aka Faces
# build123d.topology.composite.Sketch (class)
class Sketch(Compound)

  # build123d.topology.composite.Sketch.__iadd__ (method)
  __iadd__(other: None | Shape | Iterable[Shape]) -> Sketch  # Sketch += other
