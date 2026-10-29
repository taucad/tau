# smlibpy — step_import

8 top-level symbols. Signatures are verbatim python.

# Category: step_import
# A curve of a STEP file that belongs to no body (wireframe geometry, contours), at its
# Remarks: place in the assembly: an :class:`~smlibpy.Edge`, or a :class:`~smlibpy.Wire` for a composite curve.
# smlibpy.step_import.StepCurve (class)
class StepCurve

  # smlibpy.step_import.StepCurve.__init__ (constructor)
  StepCurve(name: str, shape: Any, product: str = '', color: tuple[float, float, float] | None = None) -> NoneType

# Category: step_import
# A coordinate system of a STEP file (a named ``AXIS2_PLACEMENT_3D``) at its place in
# Remarks: the assembly. ``product`` names the part or assembly it belongs to.
# smlibpy.step_import.StepFrame (class)
class StepFrame

  # The placement that moves the world origin onto this coordinate system
  location: Location

  # smlibpy.step_import.StepFrame.__init__ (constructor)
  StepFrame(name: str, plane: Plane, product: str = '', color: tuple[float, float, float] | None = None) -> NoneType

# Category: step_import
# Everything :func:`read_step` reads from a STEP file
# Remarks: :func:`import_step` returns, always as a list), and the coordinate systems, curves and points that belong to no body. ``skipped`` says which bodies could not be read, and why (``"body 'b' (#99): curve type CLOTHOID (#203), which is not supported"``).
# smlibpy.step_import.StepModel (class)
class StepModel

  # The coordinate system called ``name`` as a :class:`~smlibpy.Plane`
  # Remarks: have that name (each part of a tool assembly has its own ``MCS``), ``product`` picks the one of the product whose name is or begins with it.
  # smlibpy.step_import.StepModel.frame (method)
  frame(name: str, product: str | None = None) -> Plane

  # smlibpy.step_import.StepModel.__init__ (constructor)
  StepModel(bodies: Any, frames: list[StepFrame] = _HAS_DEFAULT_FACTORY_CLASS(), curves: list[StepCurve] = _HAS_DEFAULT_FACTORY_CLASS(), points: list[StepPoint] = _HAS_DEFAULT_FACTORY_CLASS(), skipped: list[str] = _HAS_DEFAULT_FACTORY_CLASS()) -> NoneType

# Category: step_import
# A point of a STEP file that belongs to no body, at its place in the assembly
# smlibpy.step_import.StepPoint (class)
class StepPoint

  # smlibpy.step_import.StepPoint.__init__ (constructor)
  StepPoint(name: str, point: Vector, product: str = '', color: tuple[float, float, float] | None = None) -> NoneType

# Category: step_import
# Read the solids and surfaces of STEP file contents (the text, or the bytes of the file)
# Remarks: :func:`import_step` for contents in memory, such as an upload or the text of :func:`~smlibpy.to_step`. Returns a single :class:`~smlibpy.Part` (or :class:`~smlibpy.Shell`) when the contents hold one body, otherwise a :class:`~smlibpy.ShapeList` of them; ``heal`` and ``strict`` as for :func:`import_step`.
# smlibpy.step_import.from_step (function)
from_step(data: str | bytes, *, heal: bool = True, strict: bool = False) -> Any

# Category: step_import
# Everything STEP file contents hold that smlibpy can use (the text, or the bytes of the
# Remarks: file): :func:`read_step` for contents in memory, such as an upload.
# smlibpy.step_import.from_step_model (function)
from_step_model(data: str | bytes, *, heal: bool = True, strict: bool = False) -> StepModel

# Category: step_import
# Read the solids and surfaces of a STEP file (AP203, AP214, AP242 B-rep data)
# Remarks: Returns a single :class:`~smlibpy.Part` (or :class:`~smlibpy.Shell`) when the file holds one body, otherwise a :class:`~smlibpy.ShapeList` of them. Lengths are converted to millimeters; assembly placements are applied; names and colors are kept. ``heal`` repairs bodies that come out invalid (valid ones are left alone): the kernel's healer, then stitching where faces do not share their edges, each with a warning when it changed the body or could not repair it. A body that cannot be read (an entity smlibpy does not read, one the kernel cannot build) is left out with a ``RuntimeWarning`` that names it, its entity and the reason; the other bodies are read. ``strict=True`` raises ``ModelingError`` for it instead. A file none of whose bodies can be read raises.
# smlibpy.step_import.import_step (function)
import_step(path: str | os.PathLike[str], *, heal: bool = True, strict: bool = False) -> Any

# Category: step_import
# Read everything a STEP file holds that smlibpy can use
# Remarks: coordinate systems, curves and points that belong to no body. The bodies are those of :func:`import_step`, as a :class:`~smlibpy.ShapeList` also when there is one. Coordinate systems are the placements of supplemental geometry (as NX, CATIA and tool catalogs write ``MCS``, ``PCS`` or ``CSW``) and the named placements of shape representations; curves and points are the wireframe geometry (contours such as a tool's cutting edge line, curve sets, reference points). Each carries its name and the product it belongs to, at its place in the assembly, in millimeters. Items on hidden layers are left out. A file with no bodies gives an empty ``bodies``. A body that cannot be read is left out with a warning and listed in ``skipped`` (``strict=True`` raises instead), as :func:`import_step` does.
# smlibpy.step_import.read_step (function)
read_step(path: str | os.PathLike[str], *, heal: bool = True, strict: bool = False) -> StepModel
