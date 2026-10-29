# smlibpy — exporters

21 top-level symbols. Signatures are verbatim python.

# Category: exporters
# Write shapes to ``path``
# smlibpy.exporters.export (function)
export(shapes: Any, path: str | os.PathLike[str], **kwargs: Any) -> None

# Category: exporters
# Binary glTF export with colors, names and (optionally) the B-rep edges as lines
# Remarks: glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under a root node that turns it upright and scales it by 0.001, so viewers show it at its real size. Triangles are indexed: each distinct corner (a point with its normal) is written once. ``max_edge`` is the longest edge a triangle may have.
# smlibpy.exporters.export_glb (function)
export_glb(shapes: Any, path: str | os.PathLike[str], *, tolerance: float | None = None, angle: float = 15.0, edges: bool = True, edge_color: Any = '#1f2328', max_edge: float | None = None) -> None

# Category: exporters
# glTF export with the buffer embedded as a data URI (in meters, like :func:`export_glb`)
# Remarks: keywords of :func:`export_glb`.
# smlibpy.exporters.export_gltf (function)
export_gltf(shapes: Any, path: str | os.PathLike[str], *, tolerance: float | None = None, angle: float = 15.0, edges: bool = True, edge_color: Any = '#1f2328', max_edge: float | None = None) -> None

# Category: exporters
# Wavefront OBJ export (one object per part), with the mesh's normals
# Remarks: its normal (``f v//vn``), so edges stay sharp where the faces meet at an angle and curved faces shade smooth. ``max_edge`` is the longest edge a triangle may have.
# smlibpy.exporters.export_obj (function)
export_obj(shapes: Any, path: str | os.PathLike[str], *, tolerance: float | None = None, angle: float = 15.0, max_edge: float | None = None) -> None

# Category: exporters
# Exact B-rep export to STEP AP214
# Remarks: The bodies go into one product called ``name`` (default: the file's name), or, with ``assembly=True``, each into a product of its own, named as the body, in an assembly called ``name``: other CAD systems then list the parts by name. A body listed more than once is written once and used at each place. Edges and wires are written as wireframe curves, vertices and Vectors as points, Planes as coordinate systems (supplemental geometry), each unnamed; :class:`~smlibpy.StepCurve`, :class:`~smlibpy.StepPoint` and :class:`~smlibpy.StepFrame` give them names and colors, and a :class:`~smlibpy.StepModel` (from :func:`~smlibpy.read_step`) is written whole. :func:`~smlibpy.read_step` reads them back.
# smlibpy.exporters.export_step (function)
export_step(shapes: Any, path: str | os.PathLike[str], *, unit: Literal['mm', 'cm', 'm', 'um', 'inch', 'in'] = 'mm', name: str | None = None, assembly: bool = False) -> None

# Category: exporters
# Triangle mesh export (binary unless ``ascii``)
# Remarks: ``max_edge`` the longest edge a triangle may have (see :func:`tessellate`).
# smlibpy.exporters.export_stl (function)
export_stl(shapes: Any, path: str | os.PathLike[str], *, tolerance: float | None = None, angle: float = 15.0, ascii: bool = False, max_edge: float | None = None) -> None

# Category: exporters
# The shapes of a file's contents, in memory (its text or bytes), the format picked from the
# Remarks: extension of ``name`` as :func:`load` picks it from a path (only the extension counts): STEP, IGES, USD (``.usda``), OpenCASCADE (``.brep``) and SMLib (``.smb``, ``.smp``) give exact parts, DXF a :class:`Sketch` of the drawing's outlines, STL a :class:`Mesh`. The layers a USD text names are not read (:func:`from_usd` reads them with ``resolve``). :: part = from_file(upload.read(), upload.filename)
# smlibpy.exporters.from_file (function)
from_file(data: str | bytes, name: str | os.PathLike[str]) -> Any

# Category: exporters
# The body of an SMLib native ``.smb`` file's contents
# Remarks: volume (a merged part with its cells too, and a broken solid, whose ``is_valid()`` is False), a :class:`Shell` when it does not.
# smlibpy.exporters.from_smb (function)
from_smb(data: bytes) -> Any

# Category: exporters
# The bodies and curves of an SMLib part file's contents (``.smp``, ASCII or binary)
# Remarks: shape when it holds one, otherwise a :class:`ShapeList`. Bodies come back as :class:`Part` (one that encloses a volume) or :class:`Shell`, named and colored as written, curves as :class:`Edge` and :class:`Wire`; a file of another SMLib program gives its loose surfaces as sheets of one face each.
# smlibpy.exporters.from_smp (function)
from_smp(data: bytes) -> Any

# Category: exporters
# A mesh from the contents of an STL file (binary or ASCII)
# Remarks: ASCII file.
# smlibpy.exporters.from_stl (function)
from_stl(data: bytes | str) -> Mesh

# Category: exporters
# Read an STL file (binary or ASCII) as a mesh
# smlibpy.exporters.import_stl (function)
import_stl(path: str | os.PathLike[str]) -> Mesh

# Category: exporters
# Read a file, picking the format from the extension
# Remarks: (``.igs``, ``.iges``), USD (``.usda``), OpenCASCADE (``.brep``) and SMLib (``.smb``, ``.smp``) give exact parts, DXF (``.dxf``) a :class:`Sketch` of the drawing's outlines, STL a :class:`Mesh`. A STEP or IGES file with one body gives that part, one with several a :class:`ShapeList`. A native file comes back as a :class:`Part` when its body encloses a volume (a merged part with its cells too, and a broken solid, whose ``is_valid()`` is False), as a :class:`Shell` when it does not; a part file (``.smp``) with its names, colors and curves (see :func:`from_smp`). A body that also holds wire edges, points or faces outside its solid comes with a warning.
# smlibpy.exporters.load (function)
load(path: str | os.PathLike[str]) -> Any

# Category: exporters
# Write shapes to SMLib's native files (exact)
# Remarks: curves with their names and colors to an ``.smp`` part file. ``.smb`` holds one body without name or color. ``.smp`` (any other extension writes ``.smb``) is the kernel's part container: any number of parts, sheets, sketches and faces, each with its name and color (and a sheet metal part with the K-factors of its bends), and edges and wires as curves (see :func:`to_smp`). Reading either back gives the same geometry; B-spline faces that are exactly planes, cylinders, cones, spheres or surfaces of revolution come back as those (``to_nurbs()`` does not survive). ``ascii=False`` writes the binary form (bit-exact, about 40 % of the size).
# smlibpy.exporters.save (function)
save(shapes: Any, path: str | os.PathLike[str], *, ascii: bool = True) -> None

# Category: exporters
# The contents of a file of the shapes, in memory, the format picked from the extension of
# Remarks: ``name`` as :func:`export` picks it from a path (only the extension counts; nothing is written): text for STEP, OBJ, glTF, DXF, SVG, USD (``.usda``) and OpenCASCADE (``.brep``), ``bytes`` for STL, GLB, ``.smb`` and ``.smp``. The keywords are those of the format's ``to_...`` function. :: data = to_file(part, requested_name) # a web service's download in the format asked for
# smlibpy.exporters.to_file (function)
to_file(shapes: Any, name: str | os.PathLike[str], **kwargs: Any) -> str | bytes

# Category: exporters
# The bytes of a binary glTF (GLB) file of the shapes, with colors, names and (optionally)
# Remarks: the B-rep edges as lines, as :func:`export_glb` writes it (Z-up in millimeters under a root node that turns it upright and scales it to meters).
# smlibpy.exporters.to_glb (function)
to_glb(shapes: Any, *, tolerance: float | None = None, angle: float = 15.0, edges: bool = True, edge_color: Any = '#1f2328', max_edge: float | None = None) -> bytes

# Category: exporters
# The JSON text of a glTF file of the shapes with the buffer embedded as a data URI (in
# Remarks: meters, like :func:`to_glb`); the keywords of :func:`to_glb`.
# smlibpy.exporters.to_gltf (function)
to_gltf(shapes: Any, *, tolerance: float | None = None, angle: float = 15.0, edges: bool = True, edge_color: Any = '#1f2328', max_edge: float | None = None) -> str

# Category: exporters
# The text of a Wavefront OBJ file of the shapes (one object per part), as
# Remarks: :func:`export_obj` writes it.
# smlibpy.exporters.to_obj (function)
to_obj(shapes: Any, *, tolerance: float | None = None, angle: float = 15.0, max_edge: float | None = None) -> str

# Category: exporters
# The contents of an SMLib native ``.smb`` file of one body (exact
# Remarks: False), as :func:`save` writes it.
# smlibpy.exporters.to_smb (function)
to_smb(shapes: Any, *, ascii: bool = True) -> bytes

# Category: exporters
# The contents of an SMLib part file (``.smp``) of the shapes, as :func:`save` writes it
# Remarks: A part file is the kernel's own container: any number of exact bodies (parts with their cells, sheets, sketches and faces as sheets), each with its name and color, and curves (an edge as one, a wire as its edges). :func:`from_smp` and :func:`load` give them back in the same order, with their names and colors, a wire as a :class:`Wire`. A sheet metal part keeps the K-factor each bend was folded with (:func:`~smlibpy.fold`, :func:`~smlibpy.flange`), so that it unfolds as it was folded; ``.smb`` and STEP files do not hold them (pass ``k_factor=`` to ``unfold`` for a part read from those). ASCII unless ``ascii`` is False; the binary form is bit-exact, the ASCII form keeps the geometry to 16 decimals.
# smlibpy.exporters.to_smp (function)
to_smp(shapes: Any, *, ascii: bool = True) -> bytes

# Category: exporters
# The text of a STEP AP214 file of the shapes (see :func:`export_step`)
# Remarks: product is called ``"part"`` unless ``name`` says otherwise. The text is ASCII (names in other characters are encoded as ISO 10303-21 says); write it with ``open(path, "w")`` or send it as it is: ``from_step(to_step(part))`` reads it back.
# smlibpy.exporters.to_step (function)
to_step(shapes: Any, *, unit: Literal['mm', 'cm', 'm', 'um', 'inch', 'in'] = 'mm', name: str | None = None, assembly: bool = False) -> str

# Category: exporters
# The bytes of an STL file of the shapes' triangles (binary unless ``ascii``, then the
# Remarks: file's ASCII text as bytes). ``tolerance`` is the maximum deviation and ``max_edge`` the longest edge a triangle may have, as in :func:`export_stl`.
# smlibpy.exporters.to_stl (function)
to_stl(shapes: Any, *, tolerance: float | None = None, angle: float = 15.0, ascii: bool = False, max_edge: float | None = None) -> bytes
