# smlibpy — geometry

9 top-level symbols. Signatures are verbatim python.

# Category: geometry
# An infinite line through ``origin`` along ``direction``
# Remarks: ``Axis.X``, ``Axis.Y`` and ``Axis.Z`` (also exported as ``X``, ``Y``, ``Z``) are the world axes. Axes are used to rotate, revolve, mirror, and to sort or filter shapes.
# smlibpy.geometry.Axis (class)
class Axis

  # smlibpy.geometry.Axis.__init__ (constructor)
  Axis(origin: VectorLike = (0, 0, 0), direction: VectorLike = (0, 0, 1))

  origin: Vector

  direction: Vector

  # smlibpy.geometry.Axis.__neg__ (method)
  __neg__() -> Axis  # -Axis

  # smlibpy.geometry.Axis.reversed (method)
  reversed() -> Axis

  # smlibpy.geometry.Axis.moved (method)
  moved(loc: Location) -> Axis

  # The same direction through another point
  # smlibpy.geometry.Axis.at (method)
  at(origin: VectorLike) -> Axis

  # smlibpy.geometry.Axis.is_parallel (method)
  is_parallel(other: Axis | VectorLike, angle_tol: float = 0.0001) -> bool

  # smlibpy.geometry.Axis.distance_to (method)
  distance_to(point: VectorLike) -> float

  # smlibpy.geometry.Axis.project (method)
  project(point: VectorLike) -> Vector

  # Signed coordinate of ``point`` along this axis
  # smlibpy.geometry.Axis.position_along (method)
  position_along(point: VectorLike) -> float

# Category: geometry
# An axis-aligned bounding box
# smlibpy.geometry.BoundBox (class)
class BoundBox

  # smlibpy.geometry.BoundBox.__init__ (constructor)
  BoundBox(min: VectorLike, max: VectorLike)

  # smlibpy.geometry.BoundBox.of_points (method)
  of_points(points: Iterable[VectorLike]) -> BoundBox

  size: Vector

  center: Vector

  diagonal: float

  # smlibpy.geometry.BoundBox.union (method)
  union(other: BoundBox) -> BoundBox

  # smlibpy.geometry.BoundBox.contains (method)
  contains(point: VectorLike, tol: float = TOLERANCE) -> bool

# Category: geometry
# Where a ray meets a shape or a mesh (see ``raycast``)
# Remarks: Attributes: point: The point where the ray meets the surface. distance: How far along the ray, from its start. normal: The outward unit normal of the surface there (of the face, or the triangle). face: The face that was hit (shapes), or ``None``. triangle: The index of the triangle that was hit (meshes), or ``None``.
# smlibpy.geometry.Hit (class)
class Hit(tuple)

# Category: geometry
# A rigid placement (rotation + translation), stored as a 4x4 matrix
# Remarks: Build them with :func:`Pos` and :func:`Rot` and combine with ``*``. Applying a location to a shape moves the shape: ``Pos(10, 0, 0) * Rot(z=45) * Box(1, 1, 1)`` first rotates the box about the world Z axis, then moves it 10 along X.
# smlibpy.geometry.Location (class)
class Location

  # smlibpy.geometry.Location.__init__ (constructor)
  Location(position: VectorLike | np.ndarray | Plane | Location | None = None, rotation: VectorLike | None = None)

  # Rotation by ``angle`` degrees about an arbitrary axis
  # smlibpy.geometry.Location.about (method)
  about(axis: Axis, angle: float) -> Location

  # The 4x4 homogeneous matrix (column-vector convention)
  matrix: np.ndarray

  position: Vector

  # Rotation as X, Y, Z angles in degrees (applied in that order about world axes)
  rotation: Vector

  x_dir: Vector

  y_dir: Vector

  z_dir: Vector

  # The XY plane moved by this location
  plane: Plane

  # smlibpy.geometry.Location.inverse (method)
  inverse() -> Location

  # smlibpy.geometry.Location.rotate_vector (method)
  rotate_vector(v: VectorLike) -> Vector

  # smlibpy.geometry.Location.__mul__ (method)
  __mul__(other: Location) -> Location  # Location * other
  __mul__(other: Vector) -> Vector  # Location * other
  __mul__(other: 'Shape') -> 'Shape'  # Location * other

# Category: geometry
# A curve as a NURBS (see :meth:`Edge.nurbs`)
# Remarks: Attributes: degree: The degree of the curve. knots: The knot vector, every knot as often as its multiplicity (``len(points) + degree + 1`` of them). points: The control points. weights: The weight of each control point, or ``None`` for a non-rational curve.
# smlibpy.geometry.Nurbs (class)
class Nurbs(tuple)

# Category: geometry
# A coordinate system
# Remarks: Planes are where sketches live and where parts are placed. Named planes: ``Plane.XY`` (= ``Plane.top``), ``Plane.XZ`` (= ``Plane.front``), ``Plane.YZ`` (= ``Plane.right``), plus ``back``, ``left`` and ``bottom``. Their local Y axis points up (world +Z) for the side views, so a sketch drawn "upwards" stands up on the front plane. A planar :class:`~smlibpy.Face` converts to a plane at its center with its outward normal: ``Plane(face)`` or ``face.plane``.
# smlibpy.geometry.Plane (class)
class Plane

  # smlibpy.geometry.Plane.__init__ (constructor)
  Plane(origin: VectorLike | 'Face' | Location | Plane = (0, 0, 0), x_dir: VectorLike | None = None, z_dir: VectorLike = (0, 0, 1))

  origin: Vector

  x_dir: Vector

  y_dir: Vector

  # The plane normal
  z_dir: Vector

  # The plane normal
  normal: Vector

  # The location that maps the world XY plane onto this plane
  location: Location

  # This plane moved ``distance`` along its normal
  # smlibpy.geometry.Plane.offset (method)
  offset(distance: float) -> Plane

  # This plane moved within its own coordinates
  # smlibpy.geometry.Plane.shifted (method)
  shifted(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Plane

  # The same plane seen from the other side (normal reversed, x kept)
  # smlibpy.geometry.Plane.flipped (method)
  flipped() -> Plane

  # Rotate about the plane's own X, then Y, then Z axis (degrees)
  # smlibpy.geometry.Plane.rotated (method)
  rotated(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Plane

  # smlibpy.geometry.Plane.moved (method)
  moved(loc: Location) -> Plane

  # The same orientation through another origin
  # smlibpy.geometry.Plane.at (method)
  at(origin: VectorLike) -> Plane

  # smlibpy.geometry.Plane.to_local (method)
  to_local(point: VectorLike) -> Vector

  # smlibpy.geometry.Plane.from_local (method)
  from_local(point: VectorLike) -> Vector

  # smlibpy.geometry.Plane.contains (method)
  contains(point: VectorLike, tol: float = TOLERANCE) -> bool

  # Signed distance of a point above the plane
  # smlibpy.geometry.Plane.distance_to (method)
  distance_to(point: VectorLike) -> float

  # smlibpy.geometry.Plane.project (method)
  project(point: VectorLike) -> Vector

  # smlibpy.geometry.Plane.is_coplanar (method)
  is_coplanar(other: Plane, tol: float = TOLERANCE) -> bool

  # ``Plane * shape`` places a shape (usually a sketch drawn on XY) onto this plane
  # Remarks: ``Plane * Location`` gives the plane's location composed with ``Location``.
  # smlibpy.geometry.Plane.__mul__ (method)
  __mul__(other)  # Plane * other

# Category: geometry
# A translation
# smlibpy.geometry.Pos (function)
Pos(x: float | VectorLike = 0.0, y: float = 0.0, z: float = 0.0) -> Location

# Category: geometry
# A rotation in degrees about the world X, then Y, then Z axis
# smlibpy.geometry.Rot (function)
Rot(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Location

# Category: geometry
# An immutable 3D vector or point
# Remarks: ``Vector(1, 2)``, ``Vector(1, 2, 3)``, ``Vector((1, 2, 3))`` and ``Vector(other)`` are all accepted. Vectors support ``+``, ``-``, ``*`` (by a number), ``/``, unary ``-``, ``abs()`` (length), iteration and indexing.
# smlibpy.geometry.Vector (class)
class Vector

  # smlibpy.geometry.Vector.__init__ (constructor)
  Vector(*args: float | VectorLike)

  x: float

  y: float

  z: float

  # smlibpy.geometry.Vector.to_tuple (method)
  to_tuple() -> tuple[float, float, float]

  # smlibpy.geometry.Vector.__getitem__ (method)
  __getitem__(i: int) -> float  # Vector[i]

  # smlibpy.geometry.Vector.__add__ (method)
  __add__(other: VectorLike) -> Vector  # Vector + other

  # smlibpy.geometry.Vector.__radd__ (method)
  __radd__(other: VectorLike) -> Vector  # other + Vector

  # smlibpy.geometry.Vector.__sub__ (method)
  __sub__(other: VectorLike) -> Vector  # Vector - other

  # smlibpy.geometry.Vector.__mul__ (method)
  __mul__(s: float) -> Vector  # Vector * s

  # smlibpy.geometry.Vector.__rmul__ (method)
  __rmul__(s: float) -> Vector  # s * Vector

  # smlibpy.geometry.Vector.__truediv__ (method)
  __truediv__(s: float) -> Vector  # Vector / s

  # smlibpy.geometry.Vector.__neg__ (method)
  __neg__() -> Vector  # -Vector

  length: float

  # smlibpy.geometry.Vector.dot (method)
  dot(other: VectorLike) -> float

  # smlibpy.geometry.Vector.cross (method)
  cross(other: VectorLike) -> Vector

  # smlibpy.geometry.Vector.normalized (method)
  normalized() -> Vector

  # smlibpy.geometry.Vector.distance_to (method)
  distance_to(other: VectorLike) -> float

  # Angle to another vector in degrees (0..180)
  # smlibpy.geometry.Vector.angle_to (method)
  angle_to(other: VectorLike) -> float

  # smlibpy.geometry.Vector.is_close (method)
  is_close(other: VectorLike, tol: float = TOLERANCE) -> bool

  # True if both vectors point along the same line (either sense)
  # smlibpy.geometry.Vector.is_parallel (method)
  is_parallel(other: VectorLike, angle_tol: float = 0.0001) -> bool

  # smlibpy.geometry.Vector.is_perpendicular (method)
  is_perpendicular(other: VectorLike, angle_tol: float = 0.0001) -> bool

  # Rotate this point about an axis (through the origin for a plain vector)
  # smlibpy.geometry.Vector.rotate (method)
  rotate(axis: Axis | VectorLike, angle: float) -> Vector

  # Orthogonal projection of this point onto a plane
  # smlibpy.geometry.Vector.project_to (method)
  project_to(plane: Plane) -> Vector

  # A unit vector perpendicular to this one
  # smlibpy.geometry.Vector.any_perpendicular (method)
  any_perpendicular() -> Vector
