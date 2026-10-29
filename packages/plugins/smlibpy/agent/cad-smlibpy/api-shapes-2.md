# smlibpy — shapes (2)

4 top-level symbols. Signatures are verbatim python.

# Category: shapes
# A solid
# Remarks: Combine parts with ``+`` (union), ``-`` (difference) and ``&`` (intersection). The right-hand side may be a single part or any iterable of parts.
# smlibpy.shapes.Part (class)
class Part(_Body)

  # The part's volume (mm³)
  volume: float

  # Total surface area
  area: float

  # Center of mass (uniform density)
  # smlibpy.shapes.Part.center (method)
  center() -> Vector

  # Mass, center of mass and inertia tensor for a uniform ``density``
  # Remarks: ``accuracy`` is the relative accuracy of the results (default ``ACCURACY``, 1e-7; from 1e-10 to 1e-2): volume, mass and area to ``accuracy`` of their value, the center to ``accuracy`` times the size of the part (its bounding box diagonal), the inertia to ``accuracy`` times its largest principal moment.
  # smlibpy.shapes.Part.mass_properties (method)
  mass_properties(density: float = 1.0, accuracy: float | None = None) -> MassProperties

  # True if the part is a closed, manifold solid that encloses a positive volume and
  # Remarks: whose faces meet. (A body whose faces point inward, or that encloses no volume, such as a profile revolved about an axis through it, is not valid; nor is one whose faces leave gaps that make its volume uncertain by 1e-2 of its value or more.) With ``strict``, the kernel's own checks of each face, edge and vertex (:meth:`check`, all of them) must find nothing too: an imported, stitched or healed body can be closed and enclose its volume while its edges and vertices lie farther from its faces than their tolerances allow. (Of 1471 Boolean results of a random test campaign that ``is_valid()`` accepts, 34 fail the strict test.)
  # smlibpy.shapes.Part.is_valid (method)
  is_valid(*, strict: bool = False) -> bool

  # The separate bodies of this part
  # Remarks: another (a captive part) too. Cells of a merged part that touch stay one solid (see :meth:`merge`); a body keeps its cavities.
  # smlibpy.shapes.Part.solids (method)
  solids() -> ShapeList[Part]

  # The closed sheets that bound the part, each a :class:`Shell` of copies of its faces
  # Remarks: (joined along their edges): first the outside of each solid, then the wall of each cavity (and the outside of a body that floats in one). For a part with a cavity, ``shells()[1]`` is the cavity's wall: the faces to check the wall thickness on or to put a boundary condition on, which ``part.faces().derived_from(part.shells()[1])`` selects on the part itself. Faces between two cells of a merged part bound no space around it and lie in no shell (see :meth:`ShapeList.shared`).
  # smlibpy.shapes.Part.shells (method)
  shells() -> ShapeList[Shell]

  # The cavities of the part (closed spaces inside it, kernel plan T7), each a part of its own
  # Remarks: the space inside a cavity's wall, less a body that floats in it. With them the part fills its outside: ``part.volume + sum(v.volume for v in part.voids())``. Empty for a part without cavities. ``info()`` counts them.
  # smlibpy.shapes.Part.voids (method)
  voids() -> ShapeList[Part]

  # Counts and measures in one dictionary
  # Remarks: :meth:`solids`) and ``voids`` (how many cavities, :meth:`voids`).
  # smlibpy.shapes.Part.info (method)
  info() -> dict[str, Any]

  # This part and others as one part made of cells
  # Remarks: a cell of its own; cells that touch share the faces between them (each such face bounds two cells: the body is non-manifold). For simulation meshes that must match across materials, and for models of several materials. ``cells()`` gives the cells as parts of their own, each named and colored after the parts it lies in (``cell.sources``); ``volume`` is the volume of the union. A merged part is not a manifold solid: ``is_valid()`` is False, and Booleans, fillets and shells take its cells rather than the part itself. ``export_step`` writes each cell as a solid of its own, with its name and color. A result whose volume is less than that of the largest part, or more than that of all parts together, is wrong: ``ModelingError``.
  # smlibpy.shapes.Part.merge (method)
  merge(*others: Part | Sequence[Part]) -> Part

  # For a cell of a merged part (see :meth:`cells`)
  # Remarks: material it lies in, in the order they were given (a cell where two parts overlap lies in both; a part that was itself merged stands for the parts it was merged from). They are the parts as given, not moved along with the merged part. Empty for other parts.
  sources: tuple[Part, ...]

  # The cells of a part made by :meth:`merge`, each as a part of its own (every closed region
  # Remarks: of the body; a cavity is not a cell). A part that is one solid: ``[itself]``. Each cell is named and colored after the parts given to merge that it lies in (its :attr:`sources`): the names joined by ``&`` (``"steel&brass"`` where a steel and a brass part overlap), the color of the last of them that has one; the merged part's own name and color where none of them has one. The kernel keeps no record of the parts: smlibpy classifies a point inside each cell against them. The kernel's stitcher runs in another process (see ``smlibpy.defeature.GUARD_SECONDS``): a crash there raises :class:`KernelError`, and this process goes on.
  # smlibpy.shapes.Part.cells (method)
  cells() -> ShapeList[Part]

  # Where a point lies
  # Remarks: (also in a cavity), or ``("on", shape)`` on the surface within ``tolerance`` (default: the part's own tolerance, 1e-5 for most parts), with the vertex, edge or face it lies on (the vertex rather than its edges, an edge rather than its faces). The kernel classifies the point exactly (SmBrep::Point3DClassify), also where a ray from it would graze a face or pass through an edge, which the parity of :meth:`raycast` hits gets wrong.
  # smlibpy.shapes.Part.classify (method)
  classify(point: VectorLike, tolerance: float | None = None) -> tuple[str, Face | Edge | Vertex | None]

  # True if the point lies in the material of this part or on its surface (within
  # Remarks: ``tolerance``, see :meth:`classify`); False outside and in a cavity.
  # smlibpy.shapes.Part.contains (method)
  contains(point: VectorLike, tolerance: float | None = None) -> bool

  # The cell of a merged part (see :meth:`merge`) that holds the point, as in
  # Remarks: :meth:`cells`; None outside, in a cavity and on a face (also one between two cells). For a part that is one solid: the part itself or None.
  # smlibpy.shapes.Part.cell_at (method)
  cell_at(point: VectorLike, tolerance: float | None = None) -> Part | None

  # Union with other parts
  # smlibpy.shapes.Part.fuse (method)
  fuse(*others: Part | Iterable[Part]) -> Part

  # Subtract other parts
  # smlibpy.shapes.Part.cut (method)
  cut(*others: Part | Iterable[Part]) -> Part

  # Keep only the volume shared with the other parts
  # Remarks: instead: the piece of the sheet inside the part, as a Shell (``sheet & part``).
  # smlibpy.shapes.Part.intersect (method)
  intersect(*others: Part | Iterable[Part]) -> Part

  # smlibpy.shapes.Part.__add__ (method)
  __add__(other: Any) -> Part  # Part + other

  # smlibpy.shapes.Part.__radd__ (method)
  __radd__(other: Any) -> Part  # other + Part

  # smlibpy.shapes.Part.__sub__ (method)
  __sub__(other: Any) -> Part  # Part - other

  # smlibpy.shapes.Part.__and__ (method)
  __and__(other: Any) -> Part  # Part & other

  # Round edges
  # smlibpy.shapes.Part.fillet (method)
  fillet(edges: Any, radius: float | tuple[float, float] | Sequence[float] | dict[float, float], *, continuity: int | str | None = None, fullness: float = 1.0, propagate: bool = True, corners: Literal['patch', 'mitre', 'miter'] = 'patch', setback: float | None = None) -> Part

  # The surfaces of the rounds a fillet of ``edges`` with ``radius`` would make, as sheets, without
  # Remarks: rounding the part: one per edge, untrimmed (each runs along its whole edge, before the corners are made and the rounds trimmed to meet). For a quick look at a fillet before making it (show them with the part), or to see where its rounds would run. Circular rounds of one radius, the kernel's preview (``SmApiFilletPreview``); the part does not change. ``edges`` and ``propagate`` select as for :meth:`fillet`. A selection the kernel cannot round at any size raises :class:`KernelError`, as :meth:`fillet` does; a preview that succeeds does not promise that the fillet will (its corners and trims are not made). The kernel step of a part read from a file runs in another process, as for :meth:`fillet`.
  # smlibpy.shapes.Part.fillet_preview (method)
  fillet_preview(edges: Any, radius: float, *, propagate: bool = True) -> ShapeList[Shell]

  # Bevel edges
  # Remarks: An asymmetric bevel: ``length2`` is the setback on the other face of each edge, ``length`` the one on its ``reference`` face; or ``angle`` (degrees) is the angle between the bevel and the reference face (``length2`` follows from it: ``length * tan(angle)`` where the faces meet at 90 degrees). ``reference`` is a face of this part (or several) that each edge lies on; ``length2`` and ``angle`` need it. Where the faces meet at an acute angle and the setbacks are less alike than its cosine, the kernel's solver cannot reach the bevel: a straight edge between planes whose ends lie on planes at right angles to it is then bevelled by cutting the bevel's prism along it; other such edges raise :class:`ModelingError`. The faces of each edge must meet at the same angle all along it (within 1 degree); where they do not (a hole into a tilted or curved face), use ``fillet``. ``propagate`` bevels the edges that continue the selected ones tangentially too (:meth:`Edge.tangent_chain`), as :meth:`fillet` does; ``False`` bevels the selected edges only. The edges a run adds must lie on a reference face too. ``corners`` sets the corners where three bevelled edges meet, as for :meth:`fillet`: ``"patch"`` cuts them off with a corner face, ``"mitre"`` runs the bevels on until they meet (the corners of three bevelled convex edges and no other edge).
  # smlibpy.shapes.Part.chamfer (method)
  chamfer(edges: Any, length: float, *, length2: float | None = None, angle: float | None = None, reference: Any = None, propagate: bool = True, corners: Literal['patch', 'mitre', 'miter'] = 'patch') -> Part

  # Hollow the part out to walls of ``thickness``, removing the ``openings`` faces
  # Remarks: The walls grow inward (the outside keeps its size) unless ``outward`` is true. ``corners`` says how the new side of the walls turns where the part's faces grow apart (the inside of a concave edge for walls that grow inward, the outside of a convex edge and corner for walls that grow outward): ``"round"`` keeps the wall's thickness all round with a round of radius ``thickness``; ``"sharp"`` extends the faces until they meet, so that the wall is thicker there (up to ``thickness / sin(a / 2)`` at an edge of angle ``a``). The default, None, takes ``"round"`` where the kernel builds it and ``"sharp"`` where it does not; the result's ``info()["corners"]`` says which. Given ``"round"`` or ``"sharp"``, a shell the kernel cannot build that way raises instead. ``walls`` gives faces walls of their own thickness: ``(faces, thickness)`` pairs, or a dict of faces to thicknesses (``walls=[(part.faces().bottom(), 5)]``). The face of the shell across such a wall is offset by the difference, and the faces around it are extended or trimmed to meet it (as :meth:`offset_faces`). Faces that meet smoothly (a wall and the round beside it) need one thickness. The kernel leaves the rim of an opening open where it meets its neighbours tangentially (the flat top of a box rounded on all edges): planar openings of that kind, whose other rim edges meet walls standing at right angles to them or an ordinary opening, are cut out of the part shelled closed instead (the inner rounds then end at the rim). Walls that do not fit into the part (measured across it from each face), and results the kernel gets wrong (faces that do not meet, no cavity, the part given back, a closed shell of the wrong volume), raise :class:`ModelingError`. The kernel step runs in another process (a forked copy on Linux and macOS, a helper process on Windows), so that a crash of its offset code raises ``ModelingError`` too, and it is stopped after ``smlibpy.defeature.GUARD_SECONDS`` (20 s): raise that for large parts.
  # smlibpy.shapes.Part.shell (method)
  shell(thickness: float, openings: Any = None, *, outward: bool = False, corners: Literal['round', 'sharp'] | None = None, walls: Any = None) -> Part

  # Grow (positive) or shrink (negative) the part by ``distance`` everywhere (0 gives an
  # Remarks: equal copy). ``corners="sharp"`` moves each face by ``distance`` and extends the faces until they meet again: edges and corners stay sharp, and an edge whose faces meet at an angle ``a`` moves out by ``distance / sin(a / 2)``. ``"round"`` rolls a ball of radius ``distance`` along the part: where faces grow apart (the convex edges and corners of a growing part) it fills in cylinders and spheres, so that every point of the result lies at ``distance`` from the part (a clearance body, the skin of an overmould). Shrinking with ``"round"`` rounds the concave edges, which grow apart inward; the convex ones stay sharp. The sharp mode fails where faces would vanish or cross (an acute wedge, a hole that closes, a groove narrower than twice the distance); the rounded mode builds those. Results the kernel gets wrong (faces that do not meet, a change of the wrong sign) raise :class:`ModelingError`. The kernel step runs in another process (a forked copy on Linux and macOS, a helper process on Windows) and is stopped after ``smlibpy.defeature.GUARD_SECONDS`` (20 s), as for :meth:`shell`.
  # smlibpy.shapes.Part.offset (method)
  offset(distance: float, *, corners: Literal['sharp', 'round'] = 'sharp') -> Part

  # Cut the part with a plane or along a sheet
  # Remarks: ``keep="above"`` keeps the side the plane normal points to, ``"below"`` the other side, ``"both"`` returns ``(above, below)``. A sheet (a :class:`Shell`, or a face that is not planar: a curved split surface, a surface fitted to a scan) splits the part along its surface; "above" is the side its normals point to (``normal_at``). The sheet must cut through the part. A sheet of one face whose edges end inside the part is extended beyond them until it does (the face's trim is not kept): a free-form face tangentially, a plane, cylinder, cone or sphere as itself (:meth:`Face.extend`; around a closed face it cannot grow); sheets of several faces raise ``ModelingError`` ("the surface does not cut through the part"). The two sides together hold the part's volume, which is checked. A planar face (or a sketch) stands for its plane. A plane that a seam of the part touches at a point (a torus' outer equator, where the kernel's Boolean can go wrong) gives only sides that together hold the part's volume, else ``ModelingError``.
  # smlibpy.shapes.Part.split (method)
  split(plane: Plane | Face | Shell, keep: Literal['above', 'below', 'both'] = 'above') -> Any

  # The part with its faces split where a tool crosses them, without changing its shape
  # Remarks: lines for drafts, patches for the loads and supports of a simulation, regions of a face of their own to color, draft or select (a label area, a parting line, a seal track). Nothing is added or taken away: the volume stays.
  # smlibpy.shapes.Part.imprint (method)
  imprint(tool: Part | Shell | Face | Sketch | Edge | Wire | Iterable[Edge | Wire], direction: Axis | VectorLike | None = None, *, nearest: bool = True) -> Part

  # The cross-section of the part in a plane, as a sketch
  # Remarks: the sections of the cells the plane cuts, side by side (a region per cell).
  # smlibpy.shapes.Part.section (method)
  section(plane: Plane | Face = Plane.XY) -> Sketch

  # Sections (:meth:`section`) across ``axis``, ``step`` apart
  # Remarks: thickness ``step`` from its lowest point along the axis up, each cut in its middle (at ``step / 2``, ``3 * step / 2``, ... above the lowest point; the contours of a printer's layers). Each sketch lies in its plane (``sketch.plane``); layers whose plane misses the part are left out.
  # smlibpy.shapes.Part.slices (method)
  slices(step: float, axis: Axis | VectorLike = Z) -> list[Sketch]

  # A faceted part of a closed mesh (see :meth:`Mesh.to_part`)
  # smlibpy.shapes.Part.from_mesh (method)
  from_mesh(mesh: 'Mesh', max_faces: int = 5000) -> 'Part'

  # Twist about an axis (default Z) by ``angle`` degrees over the part
  # smlibpy.shapes.Part.twist (method)
  twist(angle: float, *, axis: Axis = Axis.Z, start: float | None = None, end: float | None = None, tolerance: float | None = None) -> Part

  # Scale cross-sections toward an axis (default Z) from 1 to ``scale``
  # smlibpy.shapes.Part.taper (method)
  taper(scale: float, *, axis: Axis = Axis.Z, start: float | None = None, end: float | None = None, tolerance: float | None = None) -> Part

  # Bend around an axis by ``angle`` degrees (default
  # smlibpy.shapes.Part.bend (method)
  bend(angle: float, *, radius: float | None = None, plane: Plane = Plane.XZ, start: float | None = None, end: float | None = None, tolerance: float | None = None) -> Part

  # Unroll this part from around an axis (default Z) into a flat one, the layer at
  # Remarks: ``radius`` keeping its length; see :func:`smlibpy.unroll`.
  # smlibpy.shapes.Part.unroll (method)
  unroll(*, radius: float, axis: Axis = Axis.Z, start: VectorLike | None = None, tolerance: float | None = None) -> Part

  # Deform with a :class:`smlibpy.Lattice` (same as ``lattice.apply(part)``)
  # Remarks: :func:`smlibpy.deform`.
  # smlibpy.shapes.Part.deform (method)
  deform(lattice: Lattice, *, tolerance: float | None = None) -> Part

  # The part with fillets taken out and their edges sharp again
  # Remarks: of this part), or all fillets up to ``max_radius``. With ``partial`` the fillets the kernel cannot take out stay. See :mod:`smlibpy.defeature`.
  # smlibpy.shapes.Part.remove_fillets (method)
  remove_fillets(faces: Any = None, *, max_radius: float | None = None, partial: bool = False) -> Part

  # The part with ``faces`` (a hole, a boss, a pocket) cut out and the gap closed by the
  # Remarks: faces around it. With ``partial`` the features the kernel cannot close stay. See :mod:`smlibpy.defeature`.
  # smlibpy.shapes.Part.remove_faces (method)
  remove_faces(faces: Any, *, partial: bool = False) -> Part

  # Draft angle of every face for the pull direction, with the faces grouped by whether
  # Remarks: they release (see :class:`smlibpy.molding.DraftAnalysis`).
  # smlibpy.shapes.Part.draft_analysis (method)
  draft_analysis(direction: Axis | VectorLike, *, min_angle: float = 1.0) -> Any

  # The closed lines where the part's surface turns from facing ``direction`` to facing
  # Remarks: away from it: where the halves of a mold part (see :func:`smlibpy.molding.parting_line`).
  # smlibpy.shapes.Part.parting_line (method)
  parting_line(direction: Axis | VectorLike) -> ShapeList[Wire]

  # Tilt faces by a draft angle, so that a molded or cast part comes out of its mold
  # Remarks: Each face turns about the line where it meets the neutral plane and keeps its size there. The normal of the neutral plane is the pull direction, the way the mold moves off the part: a positive angle turns each face to look more along it, so the part narrows and pockets and holes widen along the normal, on either side of the plane. Afterwards ``draft_analysis`` of that direction finds ``angle`` more draft on each of the faces. Planes can be drafted, and cylinders and cones whose axis runs along the normal (a cylinder becomes a cone). A face that meets a drafted face tangentially, such as a fillet between two walls, must be drafted with it; the faces around the drafted ones are extended or trimmed to meet them. A part with cavities is drafted as its outside and its cavities apart (the kernel drops cavities), which are cut out again; the walls of a cavity drafted by a positive angle widen along the pull direction, as a pocket's do.
  # smlibpy.shapes.Part.draft (method)
  draft(faces: Any, angle: float, neutral_plane: Plane | Face) -> Part
  #   faces: Faces of this part (a selection or a single face)
  #   angle: Draft angle in degrees, between -90 and 90 and not 0
  #   neutral_plane: Where the faces keep their size, a :class:`Plane` or a planar face

  # Move faces of the part, and extend or trim the faces around them to meet them again
  # Remarks: push or pull a face, move a hole, a boss or a pocket. ``by`` is a vector or a :class:`Location` (a rotation and a translation: it also turns the faces). A face moved along itself stays where it is (a plane moved within its plane); the faces around it decide what changes. Faces that meet a moved face tangentially (a round, the other half of a slot) must be moved with it. Exact: planes, cylinders, cones, spheres, tori and free-form faces keep their shape, and the edges where a plane meets a cylinder, cone or sphere stay circles. Raises :class:`ModelingError` where the kernel cannot rebuild the part, where the moved faces change which faces meet (a face vanishes; use a Boolean), and where the result's faces do not meet. A part with cavities is edited as its outside and its cavities apart (the kernel drops cavities), which are cut out again; a move that makes a cavity reach the outside or another cavity raises, and so does a part with a body inside a cavity. Faces around the moved ones that the kernel extends keep their cylinder or cone.
  # smlibpy.shapes.Part.move_faces (method)
  move_faces(faces: Any, by: Location | VectorLike) -> Part
  #   faces: Faces of this part (a selection or a single face)
  #   by: A vector, or a Location

  # Offset faces of the part along their normals by ``distance``, and extend or trim the
  # Remarks: faces around them to meet them again: push-pull by a distance, resize a hole or a boss. A positive distance moves the faces out of the material: the part grows, a hole narrows and a boss widens; a negative one moves them in. Faces that meet an offset face tangentially (a round, the other half of a slot, a fillet chain) are offset with it, and so on along the tangent chain. Exact: a plane moves, a cylinder, cone, sphere or torus changes its radius, a free-form face becomes its offset surface. Raises :class:`ModelingError` where a radius would reach 0, where the kernel cannot rebuild the part, where the offset faces change which faces meet (a face vanishes; use a Boolean), and where the volume does not change the way the distance says. A part with cavities is edited as for :meth:`move_faces`: a face of a cavity's wall offset by a positive distance moves into the cavity.
  # smlibpy.shapes.Part.offset_faces (method)
  offset_faces(faces: Any, distance: float) -> Part
  #   faces: Faces of this part (a selection or a single face)
  #   distance: How far to move them, along their outward normals

  # Push or pull a face at a point
  # Remarks: Returns: A new part (this one does not change).
  # smlibpy.shapes.Part.push (method)
  push(face: Face, at: VectorLike, *, by: float | VectorLike | None = None, to: VectorLike | None = None, normal: VectorLike | None = None, radius: float | None = None, continuity: Literal['G0', 'G1', 'G2'] = 'G1') -> Part

  # Raise or sink a region of a face
  # Remarks: Returns: A new part (this one does not change).
  # smlibpy.shapes.Part.warp (method)
  warp(face: Face, region: Any, by: float | VectorLike, *, continuity: Literal['crease', 'G1', 'G2'] = 'G2') -> Part

  # Press a region of a face onto a plane
  # Remarks: face, blended into the rest of it. Returns: A new part (this one does not change).
  # smlibpy.shapes.Part.flatten (method)
  flatten(face: Face, region: Any, plane: Plane | Face, *, continuity: Literal['crease', 'G1', 'G2'] = 'G2') -> Part

  # Fold this sheet along a line on its top or bottom face (see :func:`smlibpy.fold`)
  # smlibpy.shapes.Part.fold (method)
  fold(line: Any, angle: float, *, radius: float, k_factor: float = 0.44, fixed: Any = None, partial: bool = False) -> Part

  # Add a flange along a straight outer edge of this sheet (see :func:`smlibpy.flange`)
  # smlibpy.shapes.Part.flange (method)
  flange(edge: Any, length: float, *, angle: float = 90.0, radius: float, k_factor: float = 0.44) -> Part

  # The bends of this sheet metal part (see :func:`smlibpy.sheetmetal.bends`)
  # smlibpy.shapes.Part.bends (method)
  bends(*, k_factor: Any = None) -> list[Any]

  # This sheet metal part unfolded flat (see :func:`smlibpy.unfold`)
  # smlibpy.shapes.Part.unfold (method)
  unfold(*, k_factor: Any = None, fixed: Face | None = None) -> Part

  # The flat pattern of this sheet metal part on XY (see :func:`smlibpy.flat_pattern`)
  # smlibpy.shapes.Part.flat_pattern (method)
  flat_pattern(*, k_factor: Any = None, fixed: Face | None = None) -> Any

# Category: shapes
# Something the kernel's validity checks find wrong with a body (see :meth:`Part.check`)
# Remarks: Attributes: shape: The face, edge or vertex the problem is about, or the body itself. message: What is wrong, with the value measured and the tolerance where there are. value: The value measured (a gap, a distance, an angle), or ``None``. tolerance: The tolerance it was held against, or ``None``. category: The kind of test: ``"gap"``, ``"geometric"``, ``"topological"``, ``"values"``, ``"degenerate"``, ... (the kernel's SmAssertType). test: The test's short name (``"Bad Gap"``, ``"Bad Loop Connection Vertex"``). other: A second face, edge or vertex the test compared with, or ``None``.
# smlibpy.shapes.Problem (class)
class Problem(tuple)

# Category: shapes
# Section properties of a planar region (see :meth:`Sketch.section_properties`)
# Remarks: and the second moments of area of a profile, for beams, frames and extrusions. The moments are about the centroid, in the axes of :attr:`plane` (the sketch plane moved to the centroid): ``ixx = ∫ y² dA`` about its x axis, ``iyy = ∫ x² dA`` about its y axis and the product ``ixy = ∫ x y dA``, in mm⁴.
# smlibpy.shapes.SectionProperties (class)
class SectionProperties

  # smlibpy.shapes.SectionProperties.__init__ (constructor)
  SectionProperties(area: float, plane: Plane, ixx: float, iyy: float, ixy: float, extent: tuple[float, float, float, float])

  # The polar moment about the centroid, ``ixx + iyy`` (the torsion constant only of a circle
  # Remarks: or a ring).
  polar: float

  # The second moments about the principal axes through the centroid, ascending
  principal_moments: tuple[float, float]

  # Unit directions (in world coordinates, in the plane) of the principal axes, in the
  # Remarks: order of :attr:`principal_moments`.
  principal_axes: tuple[Vector, Vector]

  # ``(sqrt(ixx / area), sqrt(iyy / area))``
  radii_of_gyration: tuple[float, float]

  # The elastic section moduli ``(ixx / c_y, iyy / c_x)``, with ``c`` the distance from the
  # Remarks: centroid to the farthest fiber of the region across each axis (the smaller modulus of a section that is not symmetric).
  section_moduli: tuple[float, float]

# Category: shapes
# Base class of all shapes
# smlibpy.shapes.Shape (class)
class Shape

  # All vertices of this shape
  # smlibpy.shapes.Shape.vertices (method)
  vertices() -> ShapeList[Vertex]

  # All edges of this shape
  # smlibpy.shapes.Shape.edges (method)
  edges() -> ShapeList[Edge]

  # All wires (closed edge loops of faces, or the shape itself if it is a wire)
  # smlibpy.shapes.Shape.wires (method)
  wires() -> ShapeList[Wire]

  # All faces of this shape
  # smlibpy.shapes.Shape.faces (method)
  faces() -> ShapeList[Face]

  # A copy of this shape moved by a location (``location * shape``)
  # smlibpy.shapes.Shape.moved (method)
  moved(location: Location) -> S

  # A copy moved by ``(x, y, z)``
  # smlibpy.shapes.Shape.translate (method)
  translate(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0) -> S

  # A copy rotated by ``angle`` degrees about ``axis``
  # smlibpy.shapes.Shape.rotate (method)
  rotate(axis: Axis = Z, angle: float = 0.0) -> S

  # A mirrored copy (reflection in ``plane``, a plane or a planar face
  # Remarks: XZ plane, which flips Y).
  # smlibpy.shapes.Shape.mirror (method)
  mirror(plane: Plane | Face = Plane.XZ) -> S

  # A scaled copy
  # Remarks: them zero (``ValueError``: that would flatten the shape).
  # smlibpy.shapes.Shape.scale (method)
  scale(factor: float | VectorLike, center: VectorLike = (0, 0, 0)) -> S

  # Place this shape, designed around the world XY plane, onto a plane or face
  # Remarks: The shape's origin goes to the plane origin (a face's center), its X axis to the plane's X direction and its Z axis to the plane normal. ``sketch.on(face)`` is the usual way to draw on a face.
  # smlibpy.shapes.Shape.on (method)
  on(target: Plane | Face | Location | ShapeList | Sequence[Any]) -> S

  # smlibpy.shapes.Shape.__rmul__ (method)
  __rmul__(other: Any) -> Any  # other * Shape

  # Tight axis-aligned bounding box
  # smlibpy.shapes.Shape.bbox (method)
  bbox() -> BoundBox

  # Center of mass (centroid) of the shape
  # smlibpy.shapes.Shape.center (method)
  center() -> Vector

  # Triangulate the shape (see :func:`smlibpy.mesh.tessellate`
  # Remarks: edge a triangle may have).
  # smlibpy.shapes.Shape.mesh (method)
  mesh(tolerance: float | None = None, angle: float = 15.0, *, max_edge: float | None = None) -> 'Mesh'

  # Show the shape in the browser viewer (see :func:`smlibpy.show`)
  # smlibpy.shapes.Shape.show (method)
  show(*, title: str = 'smlibpy', path: str | None = None, open_browser: bool = True, tolerance: float | None = None, angle: float = 12.0, edges: bool = True) -> Any

  # Write the shape to a file
  # smlibpy.shapes.Shape.export (method)
  export(path: str, **kwargs: Any) -> None
