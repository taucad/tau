# smlibpy — usd

2 top-level symbols. Signatures are verbatim python.

# Category: usd
# Write parts, sheets and meshes to a USD file (``.usda``, or ``.usd`` as text)
# Remarks: Each body becomes a ``BrepArray`` prim under ``/World``, its exact B-rep with its name and color, and a ``Mesh`` prim of it (``<name>_mesh``), which is what USD viewers draw. The stage is in millimeters (``metersPerUnit = 0.001``) with Z up.
# smlibpy.usd.export_usd (function)
export_usd(shapes: Any, path: str | os.PathLike[str], *, mesh: bool = True, tolerance: float | None = None, angle: float = 15.0) -> None
#   shapes: Parts, sheets, faces and meshes (or lists of them)
#   mesh: Write the ``Mesh`` prim of each body

# Category: usd
# Read the bodies of the ``BrepArray`` prims of a USD text file (``.usda``, ``.usd``)
# Remarks: Returns a single :class:`~smlibpy.Part` (or :class:`~smlibpy.Shell` for a body that encloses no volume) when the file holds one body, otherwise a :class:`~smlibpy.ShapeList` of them, named and colored as their prims. Lengths are taken as they are (smlibpy writes millimeters). ``heal`` runs the kernel's import healer on them. A malformed BrepArray raises a ``ValueError`` that says what is wrong.
# smlibpy.usd.import_usd (function)
import_usd(path: str | os.PathLike[str], *, heal: bool = False) -> Any
