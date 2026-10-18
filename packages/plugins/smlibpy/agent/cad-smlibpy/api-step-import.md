# smlibpy — step_import

3 top-level symbols. Signatures are verbatim python.

# Category: step_import
# Everything :func:`read_step` reads from a STEP file
# Remarks: :func:`import_step` returns, always as a list), and the coordinate systems, curves and points that belong to no body.
# smlibpy.step_import.StepModel (class)
class StepModel

  # The coordinate system called ``name`` as a :class:`~smlibpy.Plane`
  # Remarks: have that name (each part of a tool assembly has its own ``MCS``), ``product`` picks the one of the product whose name is or begins with it.
  # smlibpy.step_import.StepModel.frame (method)
  frame(name: str, product: str | None = None) -> Plane

  # smlibpy.step_import.StepModel.__init__ (constructor)
  StepModel(bodies: Any, frames: list[StepFrame] = _HAS_DEFAULT_FACTORY_CLASS(), curves: list[StepCurve] = _HAS_DEFAULT_FACTORY_CLASS(), points: list[StepPoint] = _HAS_DEFAULT_FACTORY_CLASS()) -> NoneType

# Category: step_import
# Read the solids and surfaces of a STEP file (AP203, AP214, AP242 B-rep data)
# Remarks: Returns a single :class:`~smlibpy.Part` (or :class:`~smlibpy.Shell`) when the file holds one body, otherwise a :class:`~smlibpy.ShapeList` of them. Lengths are converted to millimeters; assembly placements are applied; names and colors are kept. ``heal`` repairs bodies that come out invalid (valid ones are left alone).
# smlibpy.step_import.import_step (function)
import_step(path: str | os.PathLike[str], *, heal: bool = True) -> Any

# Category: step_import
# Read everything a STEP file holds that smlibpy can use
# Remarks: coordinate systems, curves and points that belong to no body. The bodies are those of :func:`import_step`, as a :class:`~smlibpy.ShapeList` also when there is one. Coordinate systems are the placements of supplemental geometry (as NX, CATIA and tool catalogs write ``MCS``, ``PCS`` or ``CSW``) and the named placements of shape representations; curves and points are the wireframe geometry (contours such as a tool's cutting edge line, curve sets, reference points). Each carries its name and the product it belongs to, at its place in the assembly, in millimeters. Items on hidden layers are left out. A file with no bodies gives an empty ``bodies``.
# smlibpy.step_import.read_step (function)
read_step(path: str | os.PathLike[str], *, heal: bool = True) -> StepModel
