# build123d — geometry (2)

1 top-level symbols. Signatures are verbatim python.

# Category: geometry
# Create a 3-dimensional vector
# Remarks: Attributes: wrapped (gp_Vec): the OCP vector object
# build123d.geometry.Vector (class)
class Vector

  # build123d.geometry.Vector.__init__ (constructor)
  Vector(X: float, Y: float, Z: float)
  Vector(X: float, Y: float)
  Vector(v: Vector)
  Vector(v: Sequence[float])
  Vector(v: gp_Vec | gp_Pnt | gp_Dir | gp_XYZ)
  Vector()

  # Get x value
  X: float

  # Get y value
  Y: float

  # Get z value
  Z: float

  # OCCT object
  wrapped: gp_Vec

  # Vector length
  length: float

  # Mathematical cross function
  # build123d.geometry.Vector.cross (method)
  cross(vec: Vector) -> Vector

  # Mathematical dot function
  # build123d.geometry.Vector.dot (method)
  dot(vec: Vector) -> float

  # Mathematical subtraction function
  # build123d.geometry.Vector.sub (method)
  sub(vec: VectorLike) -> Vector

  # Mathematical subtraction operator -
  # build123d.geometry.Vector.__sub__ (method)
  __sub__(vec: VectorLike) -> Vector  # Vector - vec

  # Mathematical addition function
  # build123d.geometry.Vector.add (method)
  add(vec: VectorLike) -> Vector

  # Mathematical addition operator +
  # build123d.geometry.Vector.__add__ (method)
  __add__(vec: VectorLike) -> Vector  # Vector + vec

  # Mathematical reverse addition operator +
  # build123d.geometry.Vector.__radd__ (method)
  __radd__(vec: Vector) -> Vector  # vec + Vector

  # Mathematical multiply function
  # build123d.geometry.Vector.multiply (method)
  multiply(scale: float) -> Vector

  # Mathematical multiply operator *
  # build123d.geometry.Vector.__mul__ (method)
  __mul__(scale: float) -> Vector  # Vector * scale

  # Mathematical division operator /
  # build123d.geometry.Vector.__truediv__ (method)
  __truediv__(denom: float) -> Vector  # Vector / denom

  # Mathematical multiply operator *
  # build123d.geometry.Vector.__rmul__ (method)
  __rmul__(scale: float) -> Vector  # scale * Vector

  # Scale to length of 1
  # build123d.geometry.Vector.normalized (method)
  normalized() -> Vector

  # Return a vector with the same magnitude but pointing in the opposite direction
  # build123d.geometry.Vector.reverse (method)
  reverse() -> Vector

  # center
  # Remarks: Returns: The center of myself is myself. Provided so that vectors, vertices, and other shapes all support a common interface, when center() is requested for all objects on the stack.
  # build123d.geometry.Vector.center (method)
  center() -> Vector

  # Unsigned angle between vectors
  # build123d.geometry.Vector.get_angle (method)
  get_angle(vec: Vector) -> float

  # Signed Angle Between Vectors
  # Remarks: Return the signed angle in degrees between two vectors with the given normal based on this math: angle = atan2((Va × Vb) ⋅ Vn, Va ⋅ Vb) Returns: float: Angle between vectors
  # build123d.geometry.Vector.get_signed_angle (method)
  get_signed_angle(vec: Vector, normal: Vector | None = None) -> float
  #   normal: normal direction

  # Returns a new vector equal to the projection of this Vector onto the line
  # Remarks: represented by Vector <line> Returns: Vector: Returns the projected vector.
  # build123d.geometry.Vector.project_to_line (method)
  project_to_line(line: Vector) -> Vector
  #   line: project to this line

  # Minimum unsigned distance between vector and plane
  # build123d.geometry.Vector.distance_to_plane (method)
  distance_to_plane(plane: Plane) -> float

  # Signed distance from plane to point vector
  # build123d.geometry.Vector.signed_distance_from_plane (method)
  signed_distance_from_plane(plane: Plane) -> float

  # Vector is projected onto the plane provided as input
  # Remarks: Returns:
  # build123d.geometry.Vector.project_to_plane (method)
  project_to_plane(plane: Plane) -> Vector

  # Flip direction of vector operator -
  # build123d.geometry.Vector.__neg__ (method)
  __neg__() -> Vector  # -Vector

  # intersect vector with other &
  # build123d.geometry.Vector.__and__ (method)
  __and__(other: Axis | Location | Plane | VectorLike | Shape)  # Vector & other

  # Convert to OCCT gp_Pnt object
  # build123d.geometry.Vector.to_pnt (method)
  to_pnt() -> gp_Pnt

  # Convert to OCCT gp_Dir object
  # build123d.geometry.Vector.to_dir (method)
  to_dir() -> gp_Dir

  # Apply affine transformation
  # Remarks: Returns: Vector: transformed vector
  # build123d.geometry.Vector.transform (method)
  transform(affine_transform: Matrix, is_direction: bool = False) -> Vector
  #   affine_transform: affine transformation matrix
  #   is_direction: Should self be transformed as a vector or direction? Defaults to False (vector)

  # Rotate about axis
  # Remarks: Rotate about the given Axis by an angle in degrees Returns: Vector: rotated vector
  # build123d.geometry.Vector.rotate (method)
  rotate(axis: Axis, angle: float) -> Vector
  #   axis: Axis of rotation
  #   angle: angle in degrees

  # Find intersection of vector and geometric object or shape
  # build123d.geometry.Vector.intersect (method)
  intersect(vector: VectorLike) -> Vector | None
  intersect(location: Location) -> Vector | None
  intersect(axis: Axis) -> Vector | None
  intersect(plane: Plane) -> Vector | None
  intersect(shape: Shape) -> Shape | None
