# build123d — geometry

18 top-level symbols. Signatures are verbatim python.

// Axis
Axis

  // build123d.geometry.Axis.__init__ (constructor)
  Axis(gp_ax1: gp_Ax1) -> None
  Axis(location: Location) -> None
  Axis(origin: VectorLike, direction: VectorLike) -> None
  Axis(origin: VectorLike, end_point: VectorLike) -> None
  Axis(edge: Edge) -> None

  // OCP object
  wrapped

  // The position or origin of the Axis
  position: Vector

  // The normalized direction of the Axis
  direction: Vector

  // Return self as Location
  location: Location

  // relocates self to a new location possibly changing position and direction
  // build123d.geometry.Axis.located (method)
  located(new_location: Location)

  // Return self as Plane
  // build123d.geometry.Axis.to_plane (method)
  to_plane() -> Plane

  // are axes coaxial
  // build123d.geometry.Axis.is_coaxial (method)
  is_coaxial(other: Axis, angular_tolerance: float = 1e-05, linear_tolerance: float = 1e-05) -> bool
  //   other: axis to compare to
  //   angular_tolerance: max angular deviation
  //   linear_tolerance: max linear deviation

  // are axes normal
  // build123d.geometry.Axis.is_normal (method)
  is_normal(other: Axis, angular_tolerance: float = 1e-05) -> bool
  //   other: axis to compare to
  //   angular_tolerance: max angular deviation

  // are axes opposite
  // build123d.geometry.Axis.is_opposite (method)
  is_opposite(other: Axis, angular_tolerance: float = 1e-05) -> bool
  //   other: axis to compare to
  //   angular_tolerance: max angular deviation

  // are axes parallel
  // build123d.geometry.Axis.is_parallel (method)
  is_parallel(other: Axis, angular_tolerance: float = 1e-05) -> bool
  //   other: axis to compare to
  //   angular_tolerance: max angular deviation

  // are axes skew
  // build123d.geometry.Axis.is_skew (method)
  is_skew(other: Axis, tolerance: float = 1e-05) -> bool
  //   other: axis to compare to
  //   tolerance: max deviation

  // calculate angle between axes
  // build123d.geometry.Axis.angle_between (method)
  angle_between(other: Axis) -> float
  //   other: axis to compare to

  // Return a copy of self with the direction reversed
  // build123d.geometry.Axis.reverse (method)
  reverse() -> Axis

  // Find intersection of axis and geometric object or shape
  // build123d.geometry.Axis.intersect (method)
  intersect(vector: VectorLike) -> Vector | None
  intersect(location: Location) -> Vector | Location | None
  intersect(axis: Axis) -> Vector | Axis | None
  intersect(plane: Plane) -> Vector | Axis | None
  intersect(shape: Shape) -> Shape | None

// Axis meta class to enable class properties
AxisMeta

  // X Axis
  X: Axis

  // Y Axis
  Y: Axis

  // Z Axis
  Z: Axis

// A BoundingBox for a Shape
BoundBox

  // build123d.geometry.BoundBox.__init__ (constructor)
  BoundBox(bounding_box: Bnd_Box) -> None
  BoundBox(shape: TopoDS_Shape, tolerance: float | None = None, optimal: bool = True) -> None

  // Return the overall Lebesgue measure of the bounding box
  measure: float

  // body diagonal length (i.e
  diagonal: float

  // Return center of the bounding box
  // build123d.geometry.BoundBox.center (method)
  center() -> Vector

  // Returns a modified (expanded) bounding box
  // build123d.geometry.BoundBox.add (method)
  add(obj: tuple[float, float, float] | Vector | BoundBox, tol: float | None = None) -> BoundBox
  //   obj: tuple[float, float, float] | Vector | BoundBox]
  //   tol: float

  // Compares bounding boxes
  // build123d.geometry.BoundBox.find_outside_box_2d (method)
  find_outside_box_2d(bb1: BoundBox, bb2: BoundBox) -> BoundBox | None
  //   bb1: BoundBox
  //   bb2: BoundBox

  // Constructs a bounding box from a TopoDS_Shape
  // build123d.geometry.BoundBox.from_topo_ds (method)
  from_topo_ds(shape: TopoDS_Shape, tolerance: float | None = None, optimal: bool = True) -> BoundBox
  //   shape: TopoDS_Shape
  //   tolerance: float
  //   optimal: bool

  // Is the provided bounding box inside this one?
  // build123d.geometry.BoundBox.is_inside (method)
  is_inside(second_box: BoundBox) -> bool

  // Check if this bounding box overlaps with another
  // build123d.geometry.BoundBox.overlaps (method)
  overlaps(other: BoundBox, tolerance: float = TOLERANCE) -> bool
  //   other: BoundBox to check overlap with
  //   tolerance: Distance tolerance for overlap detection

  // Amount to move object to achieve the desired alignment
  // build123d.geometry.BoundBox.to_align_offset (method)
  to_align_offset(align: Align2D | Align3D) -> Vector

// Color object based on OCCT Quantity_ColorRGBA
Color

  // build123d.geometry.Color.__init__ (constructor)
  Color(color_like: ColorLike)
  Color(name: str, alpha: float = 1.0)
  Color(red: float, green: float, blue: float, alpha: float = 1.0)
  Color(color_code: int, alpha: int = 255)
  //   color_like: name, ex

  // Generate a palette of evenly spaced colors
  // build123d.geometry.Color.categorical_set (method)
  categorical_set(color_count: int, starting_hue: ColorLike | float = 0.0, alpha: float | Iterable[float] = 1.0) -> list[Color]
  //   color_count: Number of colors to generate
  //   starting_hue: Either a Color-like object or a hue value in the range [0.0, 1.0] that defines the starting color
  //   alpha: Alpha value(s) for the colors

// A JSON encoder for build123d geometry objects
GeomEncoder

  // Return a JSON-serializable representation of a known geometry object
  // build123d.geometry.GeomEncoder.default (method)
  default(o)

  // Convert dictionaries back into geometry objects for decoding
  // build123d.geometry.GeomEncoder.geometry_hook (method)
  geometry_hook(json_dict)

// Location in 3D space
Location

  // build123d.geometry.Location.__init__ (constructor)
  Location() -> None
  Location(location: Location) -> None
  Location(position: VectorLike, angle: float = 0) -> None
  Location(position: VectorLike, orientation: RotationLike | None = None) -> None
  Location(position: VectorLike, orientation: RotationLike, ordering: Extrinsic | Intrinsic) -> None
  Location(plane: Plane) -> None
  Location(plane: Plane, plane_offset: VectorLike) -> None
  Location(top_loc: TopLoc_Location) -> None
  Location(gp_trsf: gp_Trsf) -> None
  Location(position: VectorLike, direction: VectorLike, angle: float) -> None

  // OCP object
  wrapped: TopLoc_Location

  // Extract Position component of self
  position: Vector

  // Extract orientation/rotation component of self
  orientation: Vector

  // Default X axis when used as a plane
  x_axis: Axis

  // Default Y axis when used as a plane
  y_axis: Axis

  // Default Z axis when used as a plane
  z_axis: Axis

  // Inverted location
  // build123d.geometry.Location.inverse (method)
  inverse() -> Location

  // Return center of the location - useful for sorting
  // build123d.geometry.Location.center (method)
  center() -> Vector

  // Return a new Location mirrored across the given plane
  // build123d.geometry.Location.mirror (method)
  mirror(mirror_plane: Plane) -> Location
  //   mirror_plane: The plane to mirror across

  // Convert the location into an Axis
  // build123d.geometry.Location.to_axis (method)
  to_axis() -> Axis

  // Convert the location to a translation, rotation tuple
  // build123d.geometry.Location.to_tuple (method)
  to_tuple() -> tuple[tuple[float, float, float], tuple[float, float, float]]

  // Find intersection of location and geometric object or shape
  // build123d.geometry.Location.intersect (method)
  intersect(vector: VectorLike) -> Vector | None
  intersect(location: Location) -> Vector | Location | None
  intersect(axis: Axis) -> Vector | Location | None
  intersect(plane: Plane) -> Vector | Location | None
  intersect(shape: Shape) -> Shape | None

// Custom JSON Encoder for Location values
LocationEncoder

  // Return a serializable object
  // build123d.geometry.LocationEncoder.default (method)
  default(o: Location) -> dict

  // Convert Locations loaded from json to Location objects
  // build123d.geometry.LocationEncoder.location_hook (method)
  location_hook(obj) -> dict

// A 3d , 4x4 transformation matrix
Matrix

  // build123d.geometry.Matrix.__init__ (constructor)
  Matrix()
  Matrix(trsf: gp_GTrsf | gp_Trsf)
  Matrix(matrix: Sequence[Sequence[float]])

  // General rotate about axis by angle in degrees
  // build123d.geometry.Matrix.rotate (method)
  rotate(axis: Axis, angle: float)

  // Invert Matrix
  // build123d.geometry.Matrix.inverse (method)
  inverse() -> Matrix

  // Matrix multiplication
  // build123d.geometry.Matrix.multiply (method)
  multiply(other: Vector) -> Vector
  multiply(other: Matrix) -> Matrix

  // Needed by the cqparts gltf exporter
  // build123d.geometry.Matrix.transposed_list (method)
  transposed_list() -> Sequence[float]

// Raised when an iterable contains objects that cannot be converted to Locations
NotAllLocationLikeError

  // build123d.geometry.NotAllLocationLikeError.__init__ (constructor)
  NotAllLocationLikeError(wrong_types: Iterable[Type[Any]]) -> None

// An Oriented Bounding Box
OrientedBoundBox

  // Create an oriented bounding box from either a precomputed Bnd_OBB or
  // build123d.geometry.OrientedBoundBox.__init__ (constructor)
  OrientedBoundBox(shape: Bnd_OBB | Shape)
  //   shape: Either a precomputed Bnd_OBB or a build123d shape from which to compute the oriented bounding box

  // OCP object
  wrapped

  // Compute and return the unique corner points of the oriented bounding box
  corners: list[Vector]

  // The full length of the body diagonal of the oriented bounding box,
  diagonal: float

  // The Location of the center of the oriented bounding box
  location: Location

  // The oriented coordinate system of the bounding box
  plane: Plane

  // The full extents of the bounding box along its primary axes
  size: Vector

  // The primary (X) direction of the oriented bounding box
  x_direction: Vector

  // The secondary (Y) direction of the oriented bounding box
  y_direction: Vector

  // The tertiary (Z) direction of the oriented bounding box
  z_direction: Vector

  // Compute and return the center point of the oriented bounding box
  // build123d.geometry.OrientedBoundBox.center (method)
  center() -> Vector

  // Determine whether the given oriented bounding box is entirely contained
  // build123d.geometry.OrientedBoundBox.is_completely_inside (method)
  is_completely_inside(other: OrientedBoundBox) -> bool
  //   other: The bounding box to test for containment

  // Determine whether a given point lies entirely outside this oriented bounding box
  // build123d.geometry.OrientedBoundBox.is_outside (method)
  is_outside(point: Vector) -> bool
  //   point: The point to test

// Plane
Plane

  // Find the normal at the center of a TopoDS_Face
  // build123d.geometry.Plane.get_topods_face_normal (method)
  get_topods_face_normal(face: TopoDS_Face) -> Vector

  // Create a plane from either an OCCT gp_pln, Face, Location, or coordinates
  // build123d.geometry.Plane.__init__ (constructor)
  Plane(gp_pln: gp_Pln) -> None
  Plane(points: Iterable[VectorLike]) -> None
  Plane(origin: VectorLike, x_dir: VectorLike | None = None, z_dir: VectorLike = (0, 0, 1)) -> None
  Plane(origin: VectorLike, x_dir: VectorLike, y_dir: VectorLike) -> None
  Plane(face: Face, x_dir: VectorLike | None = None) -> None
  Plane(location: Location) -> None
  Plane(axis: Axis, x_dir: VectorLike | None = None) -> None
  //   gp_pln: an OCCT plane object

  // The OCP object
  wrapped: gp_Pln

  // Move the Plane by amount in the direction of z_dir
  // build123d.geometry.Plane.offset (method)
  offset(amount: float) -> Plane

  // Reverse z direction of plane
  // build123d.geometry.Plane.reverse (method)
  reverse() -> Plane

  // global position of local (0,0,0) point
  origin: Vector

  // Local Z direction normal to the plane
  z_dir: Vector

  // Local X direction of the plane
  x_dir: Vector

  // Local Y direction of the plane
  y_dir: Vector

  // shift plane origin
  // build123d.geometry.Plane.shift_origin (method)
  shift_origin(locator: Axis | VectorLike | Vertex) -> Plane
  //   locator: Either Axis that intersects the new plane origin or Vertex within Plane

  // Returns a copy of this plane, rotated about the specified axes
  // build123d.geometry.Plane.rotated (method)
  rotated(rotation: VectorLike = (0, 0, 0), ordering: Extrinsic | Intrinsic | None = None) -> Plane
  //   rotation: (x angle, y angle, z angle)
  //   ordering: order of rotations in Intrinsic or Extrinsic rotation mode

  // Change the position & orientation of a copy of self by applying a relative location
  // build123d.geometry.Plane.moved (method)
  moved(loc: Location | Plane) -> Plane
  //   loc: relative change

  // Change the position & orientation of self by applying a relative location
  // build123d.geometry.Plane.move (method)
  move(loc: Location | Plane) -> Plane
  //   loc: relative change

  // forward location transformation matrix
  forward_transform

  // reverse location transformation matrix
  reverse_transform

  // Return Location representing the origin and z direction
  location: Location

  // Return gp_Ax3 version of the plane
  // build123d.geometry.Plane.to_gp_ax3 (method)
  to_gp_ax3() -> gp_Ax3

  // Return gp_Ax2 version of the plane
  // build123d.geometry.Plane.to_gp_ax2 (method)
  to_gp_ax2() -> gp_Ax2

  // Reposition the object relative to this plane
  // build123d.geometry.Plane.to_local_coords (method)
  to_local_coords(obj: VectorLike | Any | BoundBox)
  //   obj: VectorLike | Shape | BoundBox an object to reposition

  // Reposition the object relative from this plane
  // build123d.geometry.Plane.from_local_coords (method)
  from_local_coords(obj: tuple | Vector | Any | BoundBox)
  //   obj: VectorLike | Shape | BoundBox an object to reposition

  // Return a location representing the translation from self to other
  // build123d.geometry.Plane.location_between (method)
  location_between(other: Plane) -> Location

  // contains
  // build123d.geometry.Plane.contains (method)
  contains(obj: VectorLike | Axis, tolerance: float = TOLERANCE) -> bool
  //   obj: point or Axis to evaluate
  //   tolerance: comparison tolerance

  // Find intersection of plane and geometric object or shape
  // build123d.geometry.Plane.intersect (method)
  intersect(vector: VectorLike) -> Vector | None
  intersect(location: Location) -> Vector | Location | None
  intersect(axis: Axis) -> Vector | Axis | None
  intersect(plane: Plane) -> Axis | Plane | None
  intersect(shape: Shape) -> Shape | None

// Plane meta class to enable class properties
PlaneMeta

  // XY Plane
  XY: Plane

  // YZ Plane
  YZ: Plane

  // ZX Plane
  ZX: Plane

  // XZ Plane
  XZ: Plane

  // YX Plane
  YX: Plane

  // ZY Plane
  ZY: Plane

  // Front Plane
  front: Plane

  // Back Plane
  back: Plane

  // Left Plane
  left: Plane

  // Right Plane
  right: Plane

  // Top Plane
  top: Plane

  // Bottom Plane
  bottom: Plane

  // Isometric Plane
  isometric: Plane

// A position only sub-class of Location
Pos

  // build123d.geometry.Pos.__init__ (constructor)
  Pos(v: VectorLike)
  Pos(v: Iterable)
  Pos(X: float = 0, Y: float = 0, Z: float = 0)

// Subclass of Location used only for object rotation
Rot

  // build123d.geometry.Rotation.__init__ (constructor)
  Rotation(rotation: RotationLike, ordering: Extrinsic | Intrinsic == Intrinsic.XYZ)
  Rotation(X: float = 0, Y: float = 0, Z: float = 0, ordering: Extrinsic | Intrinsic = Intrinsic.XYZ)

// Subclass of Location used only for object rotation
Rotation

  // build123d.geometry.Rotation.__init__ (constructor)
  Rotation(rotation: RotationLike, ordering: Extrinsic | Intrinsic == Intrinsic.XYZ)
  Rotation(X: float = 0, Y: float = 0, Z: float = 0, ordering: Extrinsic | Intrinsic = Intrinsic.XYZ)

// Create a 3-dimensional vector
Vector

  // build123d.geometry.Vector.__init__ (constructor)
  Vector(X: float, Y: float, Z: float)
  Vector(X: float, Y: float)
  Vector(v: Vector)
  Vector(v: Sequence[float])
  Vector(v: gp_Vec | gp_Pnt | gp_Dir | gp_XYZ)
  Vector()

  // Get x value
  X: float

  // Get y value
  Y: float

  // Get z value
  Z: float

  // OCCT object
  wrapped: gp_Vec

  // Return tuple equivalent
  // build123d.geometry.Vector.to_tuple (method)
  to_tuple() -> tuple[float, float, float]

  // Vector length
  length: float

  // Mathematical cross function
  // build123d.geometry.Vector.cross (method)
  cross(vec: Vector) -> Vector

  // Mathematical dot function
  // build123d.geometry.Vector.dot (method)
  dot(vec: Vector) -> float

  // build123d.geometry.Vector.sub (method)
  sub(vec: VectorLike)

  // build123d.geometry.Vector.add (method)
  add(vec: VectorLike)

  // Mathematical multiply function
  // build123d.geometry.Vector.multiply (method)
  multiply(scale: float) -> Vector

  // Scale to length of 1
  // build123d.geometry.Vector.normalized (method)
  normalized() -> Vector

  // Return a vector with the same magnitude but pointing in the opposite direction
  // build123d.geometry.Vector.reverse (method)
  reverse() -> Vector

  // center
  // build123d.geometry.Vector.center (method)
  center() -> Vector

  // Unsigned angle between vectors
  // build123d.geometry.Vector.get_angle (method)
  get_angle(vec: Vector) -> float

  // Signed Angle Between Vectors
  // build123d.geometry.Vector.get_signed_angle (method)
  get_signed_angle(vec: Vector, normal: Vector | None = None) -> float
  //   normal: normal direction

  // Returns a new vector equal to the projection of this Vector onto the line
  // build123d.geometry.Vector.project_to_line (method)
  project_to_line(line: Vector) -> Vector
  //   line: project to this line

  // Minimum unsigned distance between vector and plane
  // build123d.geometry.Vector.distance_to_plane (method)
  distance_to_plane(plane: Plane) -> float

  // Signed distance from plane to point vector
  // build123d.geometry.Vector.signed_distance_from_plane (method)
  signed_distance_from_plane(plane: Plane) -> float

  // Vector is projected onto the plane provided as input
  // build123d.geometry.Vector.project_to_plane (method)
  project_to_plane(plane: Plane) -> Vector

  // Convert to OCCT gp_Pnt object
  // build123d.geometry.Vector.to_pnt (method)
  to_pnt() -> gp_Pnt

  // Convert to OCCT gp_Dir object
  // build123d.geometry.Vector.to_dir (method)
  to_dir() -> gp_Dir

  // Apply affine transformation
  // build123d.geometry.Vector.transform (method)
  transform(affine_transform: Matrix, is_direction: bool = False) -> Vector
  //   affine_transform: affine transformation matrix
  //   is_direction: Should self be transformed as a vector or direction? Defaults to False (vector)

  // Rotate about axis
  // build123d.geometry.Vector.rotate (method)
  rotate(axis: Axis, angle: float) -> Vector
  //   axis: Axis of rotation
  //   angle: angle in degrees

  // Find intersection of vector and geometric object or shape
  // build123d.geometry.Vector.intersect (method)
  intersect(vector: VectorLike) -> Vector | None
  intersect(location: Location) -> Vector | None
  intersect(axis: Axis) -> Vector | None
  intersect(plane: Plane) -> Vector | None
  intersect(shape: Shape) -> Shape | None

// Returns the items as a list unless any of them is not an instance of `Location | Plane`
// build123d.geometry.all_location_like (function)
all_location_like(items: Iterable[Any]) -> list[Location | Plane]

// Amount to move object to achieve the desired alignment
// build123d.geometry.to_align_offset (function)
to_align_offset(min_point: VectorLike, max_point: VectorLike, align: Align2D | Align3D, center: VectorLike | None = None) -> Vector
