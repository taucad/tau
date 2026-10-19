# smlibpy — deform

4 top-level symbols. Signatures are verbatim python.

# Category: deform
# A grid of control points around a part for free-form deformation (exact results)
# Remarks: The points start evenly spaced over a box (``counts`` points per direction, corners included). Move them, then ``apply`` the lattice to a part: space inside the box moves smoothly with the points (a Bezier volume; space outside the box follows the same polynomial). A lattice whose points were not moved changes nothing. ``points`` is a writable ``(nx, ny, nz, 3)`` numpy array of world positions, indexed ``[i, j, k]`` along X, Y and Z: ``lat.points[1, 1, -1] += (0, 0, 5)`` lifts one point. ``move``, ``scale`` and ``rotate`` take the same indices (``(i, j, k)`` with ints and slices, or ``layer(...)``); they change the lattice in place and return it.
# smlibpy.deform.Lattice (class)
class Lattice

  # smlibpy.deform.Lattice.__init__ (constructor)
  Lattice(box: Any, counts: int | Sequence[int] = 3, *, margin: float = 0.0)
  #   box: a BoundBox, or a shape whose bounding box is used
  #   counts: points per direction, one int or three, 2 to 12
  #   margin: grow the box by this much on every side (mm)

  # Points per direction (X, Y, Z)
  counts: tuple[int, int, int]

  # The box the points started on
  box: BoundBox

  # The starting positions (read-only)
  rest: np.ndarray

  # How far each point was moved (``points - rest``)
  offsets: np.ndarray

  # The points of one layer across an axis, as an index
  # Remarks: top layer, ``lat.layer(X, 0)`` the points at the smallest X.
  # smlibpy.deform.Lattice.layer (method)
  layer(axis: Any, index: int) -> tuple[Any, Any, Any]

  # Move the selected points by ``offset``
  # smlibpy.deform.Lattice.move (method)
  move(index: Any, offset: VectorLike) -> Lattice

  # Scale the selected points about ``center`` (default
  # Remarks: one number or three (X, Y, Z). In place; returns the lattice.
  # smlibpy.deform.Lattice.scale (method)
  scale(index: Any, factor: float | VectorLike, center: VectorLike | None = None) -> Lattice

  # Turn the selected points by ``angle`` degrees about ``axis``
  # smlibpy.deform.Lattice.rotate (method)
  rotate(index: Any, axis: Axis, angle: float) -> Lattice

  # Put every point back where it started
  # smlibpy.deform.Lattice.reset (method)
  reset() -> Lattice

  # An independent copy
  # smlibpy.deform.Lattice.copy (method)
  copy() -> Lattice

  # Where the lattice moves a point
  # smlibpy.deform.Lattice.map (method)
  map(point: VectorLike) -> Vector

  # Deform a part (or a shell) with the lattice
  # Remarks: The result is exact unless a face's image needs a degree above ``MAX_DEGREE``; such faces are within ``tolerance``. Raises ``ModelingError`` when the lattice folds the part onto itself (a point moved past its neighbours).
  # smlibpy.deform.Lattice.apply (method)
  apply(shape: Any, *, tolerance: float | None = None) -> Any

# Category: deform
# Bend a part around an axis by ``angle`` degrees, like a bar bent over a mandrel
# Remarks: ``plane`` sets the bend: its ``x_dir`` runs along the part, a positive ``angle`` bends the part toward ``y_dir``, and the bend axis is parallel to the plane normal. The layer of the part through ``plane.origin`` (spanned by ``x_dir`` and the normal) is the neutral layer: it keeps its length; material on the inside of the bend is compressed, material on the outside stretched. With the default ``Plane.XZ``, a part lying along X bends up (toward +Z) about an axis parallel to Y.
# smlibpy.deform.bend (function)
bend(shape: Any, angle: float, *, radius: float | None = None, plane: Plane = Plane.XZ, start: float | None = None, end: float | None = None, tolerance: float | None = None) -> Any

# Category: deform
# Taper a part along an axis
# Remarks: The cross-sections are scaled toward the axis by a factor that changes evenly from 1 at ``start`` to ``scale`` at ``end``.
# smlibpy.deform.taper (function)
taper(shape: Any, scale: float, *, axis: Axis = Z, start: float | None = None, end: float | None = None, tolerance: float | None = None) -> Any

# Category: deform
# Twist a part about an axis by ``angle`` degrees over its length (or from ``start`` to ``end``)
# Remarks: Every cross-section turns by an angle that grows evenly from 0 at ``start`` to ``angle`` at ``end``.
# smlibpy.deform.twist (function)
twist(shape: Any, angle: float, *, axis: Axis = Z, start: float | None = None, end: float | None = None, tolerance: float | None = None) -> Any
