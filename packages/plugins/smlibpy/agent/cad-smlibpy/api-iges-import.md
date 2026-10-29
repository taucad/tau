# smlibpy — iges_import

2 top-level symbols. Signatures are verbatim python.

# Category: iges_import
# Read the solids and surfaces of IGES file contents (the text, or the bytes of the file)
# Remarks: :func:`import_iges` for contents in memory; ``heal`` and ``strict`` as there.
# smlibpy.iges_import.from_iges (function)
from_iges(data: str | bytes, *, heal: bool = True, strict: bool = False) -> Any

# Category: iges_import
# Read the solids and surfaces of an IGES file (``.igs``, ``.iges``
# Remarks: Returns a single :class:`~smlibpy.Part` (or :class:`~smlibpy.Shell`) when the file holds one body, otherwise a :class:`~smlibpy.ShapeList` of them, in millimeters whatever unit the file uses, named and colored as the file has them. Solids (manifold solid B-rep objects, entity 186) come in as STEP bodies do: each face on its exact surface, each edge on its exact curve, the faces sharing their edges. Trimmed and bounded surfaces (144, 143), the way most CAD systems write IGES, share nothing: each becomes a face, the faces are stitched where their edges meet, and each set of faces that closes up becomes a part, the others sheets. ``heal`` repairs solids that come out invalid, as :func:`import_step` does. Something that cannot be read (an entity smlibpy does not read, one the kernel cannot build) is left out with a ``RuntimeWarning`` that names it and the reason; ``strict=True`` raises ``ModelingError`` instead. A file none of whose bodies can be read raises.
# smlibpy.iges_import.import_iges (function)
import_iges(path: str | os.PathLike[str], *, heal: bool = True, strict: bool = False) -> Any
