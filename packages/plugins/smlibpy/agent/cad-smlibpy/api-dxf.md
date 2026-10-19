# smlibpy — dxf

3 top-level symbols. Signatures are verbatim python.

# Category: dxf
# Write sketches, faces, wires and edges to a DXF drawing (AutoCAD 2000, AC1015)
# Remarks: Every curve is written exactly: LINE, ARC, CIRCLE, ELLIPSE, or SPLINE with the kernel's control points, knots and weights. Circular B-splines (the edges of sections) are written as ARC and CIRCLE, straight ones as LINE. A shape's name becomes its layer.
# smlibpy.dxf.export_dxf (function)
export_dxf(shapes: Any, path: str | os.PathLike[str], *, unit: str = 'mm', plane: Plane | None = None) -> None
#   shapes: A ``Sketch``, ``Face``, ``Wire``, ``Edge`` or a list of them
#   path: The file to write
#   unit: Unit of the file
#   plane: The plane of the drawing

# Category: dxf
# Read the outlines of a DXF drawing as a sketch
# Remarks: Lines, arcs, circles, ellipses, polylines (bulges become exact arcs), splines (exact NURBS) and inserted blocks are joined end to end into closed loops. Loops nest by the even-odd rule: a loop inside a loop is a hole, a loop inside a hole an island. The result keeps the drawing's coordinates, converted to millimeters.
# Throws: ModelingError: Curves that do not close into loops (with their ends and layers), or
# Throws: outlines that branch.
# smlibpy.dxf.import_dxf (function)
import_dxf(path: str | os.PathLike[str], *, layers: Iterable[str] | str | None = None, unit: str | None = None, tolerance: float | None = None) -> Sketch
#   path: An ASCII DXF file
#   layers: Read only these layers (names in any letter case)
#   unit: The unit of the drawing (``"mm"``, ``"cm"``, ``"m"``, ``"um"``, ``"inch"``, ``"ft"``), instead of the file's ``$INSUNITS``
#   tolerance: Ends closer than this (mm) are joined

# Category: dxf
# Every chain of curves of a DXF drawing as a :class:`~smlibpy.Wire`, open or closed
# Remarks: The curves are read and joined like in :func:`import_dxf`; chains also stop where three or more curve ends meet. Closed chains come first, then open ones, each in drawing order.
# smlibpy.dxf.import_dxf_wires (function)
import_dxf_wires(path: str | os.PathLike[str], *, layers: Iterable[str] | str | None = None, unit: str | None = None, tolerance: float | None = None) -> ShapeList[Wire]
