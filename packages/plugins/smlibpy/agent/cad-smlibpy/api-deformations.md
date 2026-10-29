# smlibpy — deformations

6 top-level symbols. Signatures are verbatim python.

# Category: deformations
# A grid of control points around a part for free-form deformation (exact results)
# Remarks: The points start evenly spaced over a box (``counts`` points per direction, corners included). Move them, then ``apply`` the lattice to a part: space inside the box moves smoothly with the points (a Bezier volume; space outside the box follows the same polynomial). A lattice whose points were not moved changes nothing. A lattice is a global map, for the overall shape: every point pulls the whole box (most near itself), so one moved point changes every face it does not leave in place. For a bump or dent on one face, push or warp that face instead (:meth:`Part.push`, :meth:`Part.warp`): they change it near a point or within a region and leave the other faces as they are. ``points`` is a writable ``(nx, ny, nz, 3)`` numpy array of world positions, indexed ``[i, j, k]`` along X, Y and Z: ``lat.points[1, 1, -1] += (0, 0, 5)`` lifts one point. ``move``, ``scale`` and ``rotate`` take the same indices (``(i, j, k)`` with ints and slices, or ``layer(...)``); they change the lattice in place and return it.
# smlibpy.deformations.Lattice (class)
class Lattice

  # smlibpy.deformations.Lattice.__init__ (constructor)
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
  # smlibpy.deformations.Lattice.layer (method)
  layer(axis: Any, index: int) -> tuple[Any, Any, Any]

  # Move the selected points by ``offset``
  # smlibpy.deformations.Lattice.move (method)
  move(index: Any, offset: VectorLike) -> Lattice

  # Scale the selected points about ``center`` (default
  # Remarks: one number or three (X, Y, Z). In place; returns the lattice.
  # smlibpy.deformations.Lattice.scale (method)
  scale(index: Any, factor: float | VectorLike, center: VectorLike | None = None) -> Lattice

  # Turn the selected points by ``angle`` degrees about ``axis``
  # smlibpy.deformations.Lattice.rotate (method)
  rotate(index: Any, axis: Axis, angle: float) -> Lattice

  # Put every point back where it started
  # smlibpy.deformations.Lattice.reset (method)
  reset() -> Lattice

  # An independent copy
  # smlibpy.deformations.Lattice.copy (method)
  copy() -> Lattice

  # Where the lattice moves a point
  # smlibpy.deformations.Lattice.map (method)
  map(point: VectorLike) -> Vector

  # Deform a part (or a shell) with the lattice
  # Remarks: The result is exact unless a face's image needs a degree above ``MAX_DEGREE``; such faces are within ``tolerance``. Raises ``ModelingError`` when the lattice folds the part onto itself (a point moved past its neighbours). An Edge or a Wire gives an Edge or a Wire (exact B-splines; lines and arcs the map only moves stay lines and arcs), points give points (as :meth:`map`); curves and points are not checked for folding.
  # smlibpy.deformations.Lattice.apply (method)
  apply(shape: Any, *, tolerance: float | None = None) -> Any

# Category: deformations
# Bend a part around an axis by ``angle`` degrees, like a bar bent over a mandrel
# Remarks: ``plane`` sets the bend: its ``x_dir`` runs along the part, a positive ``angle`` bends the part toward ``y_dir``, and the bend axis is parallel to the plane normal. The layer of the part through ``plane.origin`` (spanned by ``x_dir`` and the normal) is the neutral layer: it keeps its length; material on the inside of the bend is compressed, material on the outside stretched. With the default ``Plane.XZ``, a part lying along X bends up (toward +Z) about an axis parallel to Y.
# smlibpy.deformations.bend (function)
bend(shape: Part, angle: float, *, radius: float | None = ..., plane: Plane = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Part
bend(shape: Shell, angle: float, *, radius: float | None = ..., plane: Plane = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Shell
bend(shape: Edge, angle: float, *, radius: float | None = ..., plane: Plane = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Edge
bend(shape: Wire, angle: float, *, radius: float | None = ..., plane: Plane = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Wire
bend(shape: VectorLike, angle: float, *, radius: float | None = ..., plane: Plane = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Vector
bend(shape: Sequence[VectorLike], angle: float, *, radius: float | None = ..., plane: Plane = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> list[Vector]

# Category: deformations
# Deform a part, a sheet, a curve or points with a lattice
# Remarks: :class:`Lattice` and :meth:`smlibpy.Part.deform`).
# smlibpy.deformations.deform (function)
deform(shape: Any, lattice: Lattice, *, tolerance: float | None = None) -> Any

# Category: deformations
# Taper a part along an axis
# Remarks: The cross-sections are scaled toward the axis by a factor that changes evenly from 1 at ``start`` to ``scale`` at ``end``.
# smlibpy.deformations.taper (function)
taper(shape: Part, scale: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Part
taper(shape: Shell, scale: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Shell
taper(shape: Edge, scale: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Edge
taper(shape: Wire, scale: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Wire
taper(shape: VectorLike, scale: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Vector
taper(shape: Sequence[VectorLike], scale: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> list[Vector]

# Category: deformations
# Twist a part about an axis by ``angle`` degrees over its length (or from ``start`` to ``end``)
# Remarks: Every cross-section turns by an angle that grows evenly from 0 at ``start`` to ``angle`` at ``end``. A cylinder, cone, sphere or torus about the axis maps onto itself and stays as it was (a twisted tube's walls are its cylinders).
# smlibpy.deformations.twist (function)
twist(shape: Part, angle: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Part
twist(shape: Shell, angle: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Shell
twist(shape: Edge, angle: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Edge
twist(shape: Wire, angle: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Wire
twist(shape: VectorLike, angle: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> Vector
twist(shape: Sequence[VectorLike], angle: float, *, axis: Axis = ..., start: float | None = ..., end: float | None = ..., tolerance: float | None = ...) -> list[Vector]

# Category: deformations
# Unroll a part wrapped around an axis into a flat one
# Remarks: A point at distance ``r`` from the axis and at the angle ``a`` (radians) about it from ``start`` goes to distance ``r`` from the axis along ``start`` and ``radius * a`` across: the layer at ``radius`` (the neutral layer) keeps its length, material inside it gets longer and outside it shorter. A rolled sheet (a ring segment of inside radius ``R`` and thickness ``t``) unrolls into a flat plate; as sheet metal, with ``radius = R + k_factor * t`` (:func:`smlibpy.unfold` does that, also for rolled parts). Cylinders about the axis become planes, circles about it lines; the faces are exact where their image is a plane, cone, cylinder, line or circle, and within ``tolerance`` elsewhere.
# smlibpy.deformations.unroll (function)
unroll(shape: Part, *, radius: float, axis: Axis = ..., start: VectorLike | None = ..., tolerance: float | None = ...) -> Part
unroll(shape: Shell, *, radius: float, axis: Axis = ..., start: VectorLike | None = ..., tolerance: float | None = ...) -> Shell
unroll(shape: Edge, *, radius: float, axis: Axis = ..., start: VectorLike | None = ..., tolerance: float | None = ...) -> Edge
unroll(shape: Wire, *, radius: float, axis: Axis = ..., start: VectorLike | None = ..., tolerance: float | None = ...) -> Wire
unroll(shape: VectorLike, *, radius: float, axis: Axis = ..., start: VectorLike | None = ..., tolerance: float | None = ...) -> Vector
unroll(shape: Sequence[VectorLike], *, radius: float, axis: Axis = ..., start: VectorLike | None = ..., tolerance: float | None = ...) -> list[Vector]
