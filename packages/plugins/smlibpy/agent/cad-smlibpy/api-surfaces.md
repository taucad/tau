# smlibpy — surfaces

10 top-level symbols. Signatures are verbatim python.

# Category: surfaces
# How far the points given to :func:`surface` lie from the surface (``surface(..., report=True)``)
# Remarks: Attributes: max_distance: The largest distance of a point from the surface, to its closest point on it. rms_distance: The root mean square of the distances. distances: The distance of each point (a numpy array, in the order given; a grid's rows one after the other). The distances are true ones, to each point's closest point on the surface. (A fit's own residuals, at the parameters it gave the points, overstate how far a cloud that is not a height field lies from its surface: 18.3 where the worst point lies 7.4 from it.)
# smlibpy.surfaces.FitReport (class)
class FitReport(tuple)

# Category: surfaces
# What :func:`stitch` sewed (``stitch(..., report=True)``)
# Remarks: Attributes: sewn_edges: Pairs of free edges sewn into one edge. open_edges: Free edges left: the border of a sheet, and edges whose partner lies further away than the tolerance. max_gap: The widest gap closed, between vertices or edges that were sewn (0 where the pieces met exactly). Every gap closed is at most ``tolerance``. turned_faces: Faces turned over so that their normals agree with their neighbours' (on open results; a closed result faces outward anyway). tolerance: The widest gap stitch looked for: the ``tolerance`` given, or its default, or less where every edge was sewn before.
# smlibpy.surfaces.StitchReport (class)
class StitchReport(tuple)

# Category: surfaces
# A smooth bridge between free edges of two sheets
# Remarks: edge and reaches the other across the other, tangent to both (or curvature-continuous). Returns: The blend, a sheet of one face, of two between closed edges (with ``join``, the two sheets and the blend sewn into one).
# smlibpy.surfaces.blend (function)
blend(edge_a: Edge, edge_b: Edge, *, continuity: Literal['G1', 'G2', 'G3'] | int = 'G2', tension: float | tuple[float, float] = (1, 1), join: bool = False) -> Shell

# Category: surfaces
# A surface that fills a closed loop of curves
# Remarks: Returns: The patch, a sheet. Its normal follows the sheets it is tangent to; through curves only, it follows the right-hand rule around the loop in the direction of the first curve given. Sew it to the sheets with :func:`stitch` (``stitch(sheet, patch)``).
# Throws: ValueError: The curves do not close into one loop (the message names the gap), or some
# Throws: curves are edges of sheets and others not while ``tangent`` is True.
# Throws: ModelingError: The patch misses its curves, meets a sheet at an angle, or folds back over
# Throws: the sheets.
# smlibpy.surfaces.fill (function)
fill(boundary: Edge | Wire | Sequence[Edge | Wire], *, tangent: bool = True) -> Shell

# Category: surfaces
# A surface through a network of curves
# Remarks: Returns: A sheet of one face through every curve. Its normal is the first ``u`` curve's direction crossed with the first ``v`` curve's, where they cross.
# Throws: ValueError: Curves that do not cross (within 1e-4 of the network's size), that cross out of
# Throws: order, or that run on past the outer curves of the other set.
# Throws: ModelingError: The surface misses a curve by more than 1e-4 of the network's size (a very
# Throws: uneven network: curves of more even spacing, or more of them, help).
# smlibpy.surfaces.network (function)
network(u: Sequence[Edge | Wire], v: Sequence[Edge | Wire]) -> Shell

# Category: surfaces
# A surface from its NURBS data
# Remarks: files or papers give them (also rational surfaces, other degrees than 3, knots that are not uniform). The inverse of ``Face.nurbs()``. Returns: A sheet of one face over the whole surface, its normal along ``du x dv``.
# smlibpy.surfaces.nurbs_surface (function)
nurbs_surface(points: Any, knots: tuple[Sequence[float], Sequence[float]] | None = None, degrees: int | tuple[int, int] | None = None, weights: Sequence[Sequence[float]] | np.ndarray | None = None) -> Shell
#   points: The control points in rows, ``points[i][j]`` the point ``i`` along u and ``j`` along v (all rows the same length, at least ``degree + 1`` each way)
#   knots: The knot vectors ``(u_knots, v_knots)``, every knot as often as its multiplicity
#   degrees: The degrees ``(u, v)`` (1 to 32), or one for both
#   weights: A positive weight per control point, in the same rows

# Category: surfaces
# The ruled surface between two curves (straight lines join matching points)
# smlibpy.surfaces.ruled (function)
ruled(a: Edge | Wire, b: Edge | Wire) -> Shell

# Category: surfaces
# Sew faces and sheets along their common edges
# Remarks: Returns: A :class:`Part` when the pieces close around a volume (its faces then point outward), otherwise a :class:`Shell`. The faces of an open result are turned to agree with their neighbours; each connected piece keeps the normal of its first face (in the order given), so that the sheet thickens.
# smlibpy.surfaces.stitch (function)
stitch(*pieces: Shell | Face | Part | Sequence[Any], tolerance: float | None = ..., report: Literal[False] = ...) -> Part | Shell
stitch(*pieces: Shell | Face | Part | Sequence[Any], tolerance: float | None = ..., report: Literal[True]) -> tuple[Part | Shell, StitchReport]
#   pieces: Faces, sheets, sketches or parts, and lists of them
#   tolerance: The widest gap to close (default
#   report: True returns ``(body, report)``, a :class:`StitchReport`

# Category: surfaces
# A freeform NURBS surface through a grid of points, or fitted to a cloud of points
# smlibpy.surfaces.surface (function)
surface(points: Sequence[Sequence[VectorLike]] | Sequence[VectorLike] | np.ndarray, *, interpolate: bool = ..., controls: int | tuple[int, int] | None = ..., smoothing: float = ..., report: Literal[False] = ...) -> Shell
surface(points: Sequence[Sequence[VectorLike]] | Sequence[VectorLike] | np.ndarray, *, interpolate: bool = ..., controls: int | tuple[int, int] | None = ..., smoothing: float = ..., report: Literal[True]) -> tuple[Shell, FitReport]

# Category: surfaces
# A round blend between the surfaces of two faces, as a sheet
# Remarks: faces of one part, such as two sheets that cross (``fillet`` rounds the edges of a part). Or a flat one, a chamfer, between the same lines. Returns: The blend, a sheet (:class:`Shell`) whose edges along its length lie on the two surfaces; with ``trim`` the two faces, cut back, and the blend between them as one sheet.
# smlibpy.surfaces.surface_fillet (function)
surface_fillet(a: Face | Shell, b: Face | Shell, radius: float, *, radius2: float | None = None, shape: Literal['round', 'chamfer'] = 'round', sides: tuple[int, int] = (1, 1), trim: bool = False) -> Shell
#   a: The first face (or a sheet of one face)
#   b: The second face (or a sheet of one face), the same way
#   radius: The radius of the blend
#   radius2: Chamfers only
#   shape: ``"round"`` (default)
#   sides: The side of each face the blend lies on
#   trim: True cuts both faces back to the blend's long edges and sews the three into one sheet
