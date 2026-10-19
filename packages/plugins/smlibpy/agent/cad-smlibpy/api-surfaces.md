# smlibpy — surfaces

4 top-level symbols. Signatures are verbatim python.

# Category: surfaces
# The ruled surface between two curves (straight lines join matching points)
# smlibpy.surfaces.ruled (function)
ruled(a: Edge | Wire, b: Edge | Wire) -> Shell

# Category: surfaces
# Sew faces and sheets along their common edges
# Remarks: Returns a :class:`Part` when the result encloses a volume, otherwise a :class:`Shell`. ``tolerance`` is the largest gap to close (default: 1e-4 of the model size).
# smlibpy.surfaces.stitch (function)
stitch(*pieces: Shell | Face | Part | Sequence[Any], tolerance: float | None = None) -> Part | Shell

# Category: surfaces
# A freeform NURBS surface through a grid of points, or fitted to a cloud of points
# smlibpy.surfaces.surface (function)
surface(points: Sequence[Sequence[VectorLike]] | Sequence[VectorLike] | np.ndarray, *, interpolate: bool = True, controls: int | tuple[int, int] | None = None, smoothing: float = 0.01) -> Shell

# Category: surfaces
# A round blend between the surfaces of two faces, as a sheet
# Remarks: faces of one part, such as two sheets that cross (``fillet`` rounds the edges of a part). Returns: The blend, a sheet (:class:`Shell`) whose edges along its length lie on the two surfaces.
# smlibpy.surfaces.surface_fillet (function)
surface_fillet(a: Face | Shell, b: Face | Shell, radius: float, *, sides: tuple[int, int] = (1, 1)) -> Shell
#   a: The first face (or a sheet of one face)
#   b: The second face (or a sheet of one face), the same way
#   radius: The radius of the blend
#   sides: The side of each face the blend lies on
