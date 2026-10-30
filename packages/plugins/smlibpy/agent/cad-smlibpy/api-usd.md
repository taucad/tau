# smlibpy — usd

4 top-level symbols. Signatures are verbatim python.

# Category: usd
# Write parts, sheets and meshes to a USD file (``.usda``, or ``.usd`` as text)
# Remarks: Each body becomes a ``BrepArray`` prim under ``/World``, its exact B-rep with its name and color, and a ``Mesh`` prim of it (``<name>_mesh``), which is what USD viewers draw. The stage is in millimeters (``metersPerUnit = 0.001``) with Z up.
# smlibpy.usd.export_usd (function)
export_usd(shapes: Any, path: str | os.PathLike[str], *, mesh: bool = True, tolerance: float | None = None, angle: float = 15.0, materials: bool = False, max_edge: float | None = None) -> None
#   shapes: Parts, sheets, faces and meshes (or lists of them)
#   mesh: Write the ``Mesh`` prim of each body
#   materials: Also give each color a ``Material`` (a ``UsdPreviewSurface`` of that color under ``/World/Looks``) bound to the prims of that color, which Omniverse and other renderers use where they leave ``displayColor`` aside

# Category: usd
# The bodies of the ``BrepArray`` prims of USD text in memory (``.usda``
# Remarks: of the file), as :func:`import_usd` reads a file; the keywords as there. The layers the text names (``subLayers``, ``references``, ``payload``) come from ``resolve(asset, from_)``, which gives the text (or bytes) of a layer, or None if it has none: ``asset`` as written, ``from_`` the name of the layer that names it ("" for the text given; a relative asset is taken from the directory of ``from_``). Without it such layers are not read, and a warning names them.
# smlibpy.usd.from_usd (function)
from_usd(data: str | bytes, *, heal: bool = False, units: str | None = None, placement: bool = True, check: bool = True, strict: bool = False, resolve: Callable[[str, str], str | bytes | None] | None = None) -> Any

# Category: usd
# Read the bodies of the ``BrepArray`` prims of a USD text file (``.usda``, ``.usd``)
# Remarks: Returns a single :class:`~smlibpy.Part` (or :class:`~smlibpy.Shell` for a body that encloses no volume) when the file holds one body, otherwise a :class:`~smlibpy.ShapeList` of them, named and colored as their prims (a body whose prim's name another prim has too is named by its prim's path). A body's color is that of the material bound to it (the ``diffuseColor`` of the ``UsdPreviewSurface`` its material has, through a GeomSubset of bodies, the prim or a prim above it), or else its prim's ``displayColor``. The file is read as USD composes it: its ``subLayers`` and the files its prims reference (``references``, ``payload``) are read too, relative to the file that names them (text USD only); prims that are abstract (``class``), inactive (``active = false``) or only ``over`` hold no bodies. A reference that cannot be read is named in a warning.
# smlibpy.usd.import_usd (function)
import_usd(path: str | os.PathLike[str], *, heal: bool = False, units: str | None = None, placement: bool = True, check: bool = True, strict: bool = False) -> Any

# Category: usd
# The text of a USD file (``.usda``) of parts, sheets and meshes, as :func:`export_usd` writes
# Remarks: it; the keywords as there.
# smlibpy.usd.to_usd (function)
to_usd(shapes: Any, *, mesh: bool = True, tolerance: float | None = None, angle: float = 15.0, materials: bool = False, max_edge: float | None = None) -> str
