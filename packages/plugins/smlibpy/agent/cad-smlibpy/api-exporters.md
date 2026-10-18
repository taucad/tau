# smlibpy — exporters

9 top-level symbols. Signatures are verbatim python.

# Category: exporters
# Write shapes to ``path``
# smlibpy.exporters.export (function)
export(shapes: Any, path: str | os.PathLike[str], **kwargs: Any) -> None

# Category: exporters
# Binary glTF export with colors, names and (optionally) the B-rep edges as lines
# Remarks: glTF is Y-up and measured in meters; the model is written Z-up in millimeters as modeled, under a root node that turns it upright and scales it by 0.001, so viewers show it at its real size.
# smlibpy.exporters.export_glb (function)
export_glb(shapes: Any, path: str | os.PathLike[str], *, tolerance: float | None = None, angle: float = 15.0, edges: bool = True, edge_color: Any = '#1f2328') -> None

# Category: exporters
# glTF export with the buffer embedded as a data URI (in meters, like :func:`export_glb`)
# smlibpy.exporters.export_gltf (function)
export_gltf(shapes: Any, path: str | os.PathLike[str], **kwargs: Any) -> None

# Category: exporters
# Wavefront OBJ export (one object per part)
# smlibpy.exporters.export_obj (function)
export_obj(shapes: Any, path: str | os.PathLike[str], *, tolerance: float | None = None, angle: float = 15.0) -> None

# Category: exporters
# Exact B-rep export to STEP AP214
# smlibpy.exporters.export_step (function)
export_step(shapes: Any, path: str | os.PathLike[str], *, unit: str = 'mm', name: str | None = None) -> None

# Category: exporters
# Triangle mesh export (binary unless ``ascii``)
# smlibpy.exporters.export_stl (function)
export_stl(shapes: Any, path: str | os.PathLike[str], *, tolerance: float | None = None, angle: float = 15.0, ascii: bool = False) -> None

# Category: exporters
# Read an STL file (binary or ASCII) as a mesh
# smlibpy.exporters.import_stl (function)
import_stl(path: str | os.PathLike[str]) -> Mesh

# Category: exporters
# Read a file, picking the format from the extension
# Remarks: (``.usda``) and SMLib (``.smb``) give exact parts, DXF (``.dxf``) a :class:`Sketch` of the drawing's outlines, STL a :class:`Mesh`. A STEP file with one body gives that part, one with several a :class:`ShapeList`. A native file that encloses no volume comes back as a :class:`Shell`.
# smlibpy.exporters.load (function)
load(path: str | os.PathLike[str]) -> Any

# Category: exporters
# Write a body to SMLib's native ``.smb`` format (exact and lossless)
# smlibpy.exporters.save (function)
save(shapes: Any, path: str | os.PathLike[str], *, ascii: bool = True) -> None
