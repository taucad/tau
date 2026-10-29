# smlibpy — dxf

6 top-level symbols. Signatures are verbatim python.

# Category: dxf
# Write sketches, faces, wires and edges to a DXF drawing (AutoCAD 2000, AC1015)
# Remarks: Every curve is written exactly: LINE, ARC, CIRCLE, ELLIPSE, or SPLINE with the kernel's control points, knots and weights. Circular B-splines (the edges of sections) are written as ARC and CIRCLE, straight ones as LINE. A shape's name becomes its layer. The views of :func:`drawing_views` go on the layers VISIBLE and HIDDEN, the hidden lines dashed (the linetype DASHED: 3 mm dashes, 1.5 mm gaps).
# smlibpy.dxf.export_dxf (function)
export_dxf(shapes: Any, path: str | os.PathLike[str], *, unit: Literal['mm', 'cm', 'm', 'um', 'inch', 'in', 'ft'] = 'mm', plane: Plane | None = None, curves: Literal['exact', 'arcs'] = 'exact', tolerance: float = 0.01) -> None
#   shapes: A ``Sketch``, ``Face``, ``Wire``, ``Edge``, ``DrawingView`` or a list of them
#   path: The file to write
#   unit: Unit of the file
#   plane: The plane of the drawing
#   curves: ``"exact"`` (default) writes splines and ellipses as SPLINE and ELLIPSE
#   tolerance: For ``curves="arcs"``

# Category: dxf
# :func:`import_dxf` of a drawing in memory
# smlibpy.dxf.from_dxf (function)
from_dxf(data: str | bytes, *, layers: Iterable[str] | str | None = None, unit: Literal['mm', 'cm', 'm', 'um', 'inch', 'in', 'ft'] | None = None, tolerance: float | None = None) -> Sketch

# Category: dxf
# :func:`import_dxf_wires` of a drawing in memory
# smlibpy.dxf.from_dxf_wires (function)
from_dxf_wires(data: str | bytes, *, layers: Iterable[str] | str | None = None, unit: Literal['mm', 'cm', 'm', 'um', 'inch', 'in', 'ft'] | None = None, tolerance: float | None = None) -> ShapeList[Wire]

# Category: dxf
# Read the outlines of a DXF drawing as a sketch
# Remarks: Lines, arcs, circles, ellipses, polylines (bulges become exact arcs), splines (exact NURBS) and inserted blocks are joined end to end into closed loops. Loops nest by the even-odd rule: a loop inside a loop is a hole, a loop inside a hole an island. The result keeps the drawing's coordinates, converted to millimeters.
# Throws: ModelingError: Curves that do not close into loops (with their ends and layers), or
# Throws: outlines that branch.
# smlibpy.dxf.import_dxf (function)
import_dxf(path: str | os.PathLike[str], *, layers: Iterable[str] | str | None = None, unit: Literal['mm', 'cm', 'm', 'um', 'inch', 'in', 'ft'] | None = None, tolerance: float | None = None) -> Sketch
#   path: An ASCII DXF file
#   layers: Read only these layers (names in any letter case)
#   unit: The unit of the drawing (``"mm"``, ``"cm"``, ``"m"``, ``"um"``, ``"inch"``, ``"ft"``), instead of the file's ``$INSUNITS``
#   tolerance: Ends closer than this (mm) are joined

# Category: dxf
# Every chain of curves of a DXF drawing as a :class:`~smlibpy.Wire`, open or closed
# Remarks: The curves are read and joined like in :func:`import_dxf`; chains also stop where three or more curve ends meet. Closed chains come first, then open ones, each in drawing order.
# smlibpy.dxf.import_dxf_wires (function)
import_dxf_wires(path: str | os.PathLike[str], *, layers: Iterable[str] | str | None = None, unit: Literal['mm', 'cm', 'm', 'um', 'inch', 'in', 'ft'] | None = None, tolerance: float | None = None) -> ShapeList[Wire]

# Category: dxf
# The text of a DXF drawing (AutoCAD 2000, AC1015) of sketches, faces, wires and edges, as
# Remarks: :func:`export_dxf` writes it; ``unit``, ``plane``, ``curves`` and ``tolerance`` as there.
# smlibpy.dxf.to_dxf (function)
to_dxf(shapes: Any, *, unit: Literal['mm', 'cm', 'm', 'um', 'inch', 'in', 'ft'] = 'mm', plane: Plane | None = None, curves: Literal['exact', 'arcs'] = 'exact', tolerance: float = 0.01) -> str
