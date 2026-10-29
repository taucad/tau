# smlibpy — occt

4 top-level symbols. Signatures are verbatim python.

# Category: occt
# Write parts, sheets and faces to an OpenCASCADE ``.brep`` file (ASCII, as OpenCASCADE's
# Remarks: ``BRepTools::Write`` writes it), which build123d (``import_brep``), CadQuery (``importBrep``), FreeCAD and OpenCASCADE itself read. The file holds one shape: the solid or shell of a single body, or a compound of the bodies (a part with several solids gives one solid each, a sheet its shell; a sheet whose faces share no edge, a shell per connected set). Faces keep their exact surfaces (planes, cylinders, cones, spheres, tori and B-splines; surfaces of revolution and extrusions are written as the B-splines they are), edges their curves (lines, circles, ellipses, B-splines), and every edge gets its curves in the parameters of its faces, as OpenCASCADE requires. Names and colors are not written: the format has no place for them (``export_step`` keeps them). Raises ``ValueError`` for a body without faces, ``TypeError`` for meshes, curves and points, and :class:`~smlibpy.KernelError` where a body cannot be converted (an edge that lies farther from its face than 1e-3 of the body's size, a face whose boundary does not close).
# smlibpy.occt.export_brep (function)
export_brep(shapes: Any, path: str | os.PathLike[str]) -> None

# Category: occt
# The bodies of an OpenCASCADE ``.brep`` file's contents (the text of an ASCII file, or the
# Remarks: bytes of either kind), as :func:`import_brep` reads a file; the keywords as there.
# smlibpy.occt.from_brep (function)
from_brep(data: str | bytes, *, heal: bool = False, check: bool = True, strict: bool = False) -> Any

# Category: occt
# Read an OpenCASCADE ``.brep`` file (ASCII from ``BRepTools::Write``, binary from
# Remarks: ``BinTools::Write``), as build123d (``export_brep``), CadQuery (``exportBrep``), FreeCAD and OpenCASCADE write it. Returns a :class:`~smlibpy.Part` for each solid of the file's shape and a :class:`~smlibpy.Shell` for each shell or face that is no solid's (a single shape when there is one, otherwise a :class:`~smlibpy.ShapeList` in the order of the file's compound), placed as the file places them and in its units (millimeters for the tools above). Faces and edges keep their exact geometry: planes, cylinders, cones, spheres, tori and B-splines come back as those; surfaces of extrusion and revolution, Bezier surfaces and offset geometry as B-splines.
# smlibpy.occt.import_brep (function)
import_brep(path: str | os.PathLike[str], *, heal: bool = False, check: bool = True, strict: bool = False) -> Any

# Category: occt
# The text of an OpenCASCADE ``.brep`` file of parts and sheets, as :func:`export_brep`
# Remarks: writes it: ``BRepTools::Read`` and ``from_brep`` read it back.
# smlibpy.occt.to_brep (function)
to_brep(shapes: Any) -> str
