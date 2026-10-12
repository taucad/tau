# build123d — geometry

13 top-level symbols. Signatures are verbatim python.

# Category: geometry
# Axis
# Remarks: Axis defined by point and direction or by two points Attributes: position (Vector): the global position of the axis origin direction (Vector): the normalized direction vector wrapped (gp_Ax1): the OCP axis object
# build123d.geometry.Axis (class)
class Axis

  # X Axis
  X: Axis

  # Y Axis
  Y: Axis

  # Z Axis
  Z: Axis

  # build123d.geometry.Axis.__init__ (constructor)
  Axis(gp_ax1: gp_Ax1) -> None
  Axis(location: Location) -> None
  Axis(origin: VectorLike, direction: VectorLike) -> None
  Axis(origin: VectorLike, *, end_point: VectorLike) -> None
  Axis(edge: Edge) -> None

  # OCP object
  wrapped

  # The position or origin of the Axis
  position: Vector

  # The normalized direction of the Axis
  direction: Vector

  # Return self as Location
  location: Location

  # relocates self to a new location possibly changing position and direction
  # build123d.geometry.Axis.located (method)
  located(new_location: Location)

  # Return self as Plane
  # build123d.geometry.Axis.to_plane (method)
  to_plane() -> Plane

  # are axes coaxial
  # Remarks: True if the angle between self and other is lower or equal to angular_tolerance and the distance between self and other is lower or equal to linear_tolerance. Returns: bool: axes are coaxial
  # build123d.geometry.Axis.is_coaxial (method)
  is_coaxial(other: Axis, angular_tolerance: float = 1e-05, linear_tolerance: float = 1e-05) -> bool
  #   other: axis to compare to
  #   angular_tolerance: max angular deviation
  #   linear_tolerance: max linear deviation

  # are axes normal
  # Remarks: Returns True if the direction of this and another axis are normal to each other. That is, if the angle between the two axes is equal to 90° within the angular_tolerance. Returns: bool: axes are normal
  # build123d.geometry.Axis.is_normal (method)
  is_normal(other: Axis, angular_tolerance: float = 1e-05) -> bool
  #   other: axis to compare to
  #   angular_tolerance: max angular deviation

  # are axes opposite
  # Remarks: Returns True if the direction of this and another axis are parallel with opposite orientation. That is, if the angle between the two axes is equal to 180° within the angular_tolerance. Returns: bool: axes are opposite
  # build123d.geometry.Axis.is_opposite (method)
  is_opposite(other: Axis, angular_tolerance: float = 1e-05) -> bool
  #   other: axis to compare to
  #   angular_tolerance: max angular deviation

  # are axes parallel
  # Remarks: Returns True if the direction of this and another axis are parallel with same orientation or opposite orientation. That is, if the angle between the two axes is equal to 0° or 180° within the angular_tolerance. Returns: bool: axes are parallel
  # build123d.geometry.Axis.is_parallel (method)
  is_parallel(other: Axis, angular_tolerance: float = 1e-05) -> bool
  #   other: axis to compare to
  #   angular_tolerance: max angular deviation

  # are axes skew
  # Remarks: Returns True if this axis and another axis are skew, meaning they are neither parallel nor coplanar. Two axes are skew if they do not lie in the same plane and never intersect. Mathematically, this means: - The axes are **not parallel** (the cross product of their direction vectors is nonzero). - The axes are **not coplanar** (the vector between their positions is not aligned with the plane spanned by their directions). If either condition is false (i.e., the axes are parallel or coplanar), they are not skew. Returns: bool: axes are skew
  # build123d.geometry.Axis.is_skew (method)
  is_skew(other: Axis, tolerance: float = 1e-05) -> bool
  #   other: axis to compare to
  #   tolerance: max deviation

  # calculate angle between axes
  # Remarks: Computes the angular value, in degrees, between the direction of self and other between 0° and 360°. Returns: float: angle between axes
  # build123d.geometry.Axis.angle_between (method)
  angle_between(other: Axis) -> float
  #   other: axis to compare to

  # Return a copy of self with the direction reversed
  # build123d.geometry.Axis.reverse (method)
  reverse() -> Axis

  # Flip direction operator -
  # build123d.geometry.Axis.__neg__ (method)
  __neg__() -> Axis  # -Axis

  # intersect vector with other &
  # build123d.geometry.Axis.__and__ (method)
  __and__(other: Axis | Location | Plane | VectorLike | Shape) -> Vector | Location | Axis | None  # Axis & other

  # Find intersection of axis and geometric object or shape
  # build123d.geometry.Axis.intersect (method)
  intersect(vector: VectorLike) -> Vector | None
  intersect(location: Location) -> Vector | Location | None
  intersect(axis: Axis) -> Vector | Axis | None
  intersect(plane: Plane) -> Vector | Axis | None
  intersect(shape: Shape) -> Shape | None

# Category: geometry
# A BoundingBox for a Shape
# build123d.geometry.BoundBox (class)
class BoundBox

  # build123d.geometry.BoundBox.__init__ (constructor)
  BoundBox(bounding_box: Bnd_Box) -> None
  BoundBox(shape: TopoDS_Shape, tolerance: float | None = None, optimal: bool = True) -> None

  # Return the overall Lebesgue measure of the bounding box
  # Remarks: - For 1D objects: length - For 2D objects: area - For 3D objects: volume
  measure: float

  # body diagonal length (i.e
  diagonal: float

  # Return center of the bounding box
  # build123d.geometry.BoundBox.center (method)
  center() -> Vector

  # Returns a modified (expanded) bounding box
  # Remarks: obj can be one of several things: 1. a 3-tuple corresponding to x,y, and z amounts to add 2. a vector, containing the x,y,z values to add 3. another bounding box, where a new box will be created that encloses both. This bounding box is not changed. Returns:
  # build123d.geometry.BoundBox.add (method)
  add(obj: tuple[float, float, float] | Vector | BoundBox, tol: float | None = None) -> BoundBox
  #   obj: tuple[float, float, float] | Vector | BoundBox]
  #   tol: float

  # Compares bounding boxes
  # Remarks: Compares bounding boxes. Returns none if neither is inside the other. Returns the outer one if either is outside the other. BoundBox.is_inside works in 3d, but this is a 2d bounding box, so it doesn't work correctly plus, there was all kinds of rounding error in the built-in implementation i do not understand. Returns:
  # build123d.geometry.BoundBox.find_outside_box_2d (method)
  find_outside_box_2d(bb1: BoundBox, bb2: BoundBox) -> BoundBox | None
  #   bb1: BoundBox
  #   bb2: BoundBox

  # Constructs a bounding box from a TopoDS_Shape
  # Remarks: Returns:
  # build123d.geometry.BoundBox.from_topo_ds (method)
  from_topo_ds(shape: TopoDS_Shape, tolerance: float | None = None, optimal: bool = True) -> BoundBox
  #   shape: TopoDS_Shape
  #   tolerance: float
  #   optimal: bool

  # Is the provided bounding box inside this one?
  # Remarks: Returns:
  # build123d.geometry.BoundBox.is_inside (method)
  is_inside(second_box: BoundBox) -> bool

  # Check if this bounding box overlaps with another
  # Remarks: Returns: True if bounding boxes overlap (share any volume), False otherwise
  # build123d.geometry.BoundBox.overlaps (method)
  overlaps(other: BoundBox, tolerance: float = TOLERANCE) -> bool
  #   other: BoundBox to check overlap with
  #   tolerance: Distance tolerance for overlap detection

  # Amount to move object to achieve the desired alignment
  # build123d.geometry.BoundBox.to_align_offset (method)
  to_align_offset(align: Align2D | Align3D) -> Vector

# Category: geometry
# Color object based on OCCT Quantity_ColorRGBA
# Remarks: Attributes: wrapped (Quantity_ColorRGBA): the OCP color object
# build123d.geometry.Color (class)
class Color

  # build123d.geometry.Color.__init__ (constructor)
  Color(color_like: ColorLike)
  Color(name: str, alpha: float = 1.0)
  Color(red: float, green: float, blue: float, alpha: float = 1.0)
  Color(color_code: int, alpha: int = 255)
  #   color_like: name, ex

  # Generate a palette of evenly spaced colors
  # Remarks: Creates a list of visually distinct colors suitable for representing discrete categories (such as different parts, assemblies, or data series). Colors are evenly spaced around the hue circle and share consistent lightness and saturation levels, resulting in balanced perceptual contrast across all hues. Produces palettes similar in appearance to the **Tableau 10** and **D3 Category10** color sets—both widely recognized standards in data visualization for their clarity and accessibility. These values have been empirically chosen to maintain consistent perceived brightness across hues while avoiding overly vivid or dark colors. Returns: list[Color]: List of generated colors.
  # Throws: ValueError: If starting_hue is out of range or alpha length mismatch.
  # build123d.geometry.Color.categorical_set (method)
  categorical_set(color_count: int, starting_hue: ColorLike | float = 0.0, alpha: float | Iterable[float] = 1.0) -> list[Color]
  #   color_count: Number of colors to generate
  #   starting_hue: Either a Color-like object or a hue value in the range [0.0, 1.0] that defines the starting color
  #   alpha: Alpha value(s) for the colors

# Category: geometry
# A JSON encoder for build123d geometry objects
# Remarks: This class extends ``json.JSONEncoder`` to provide custom serialization for geometry objects such as Axis, Color, Location, Plane, and Vector. It converts each geometry object into a dictionary containing exactly one key that identifies the geometry type (e.g. ``"Axis"``, ``"Vector"``, etc.), paired with a tuple or list that represents the underlying data. Any other object types are handled by the standard encoder. The inverse decoding is performed by the ``geometry_hook`` static method, which expects the dictionary to have precisely one key from the known geometry types. It then uses a class registry (``CLASS_REGISTRY``) to look up and instantiate the appropriate class with the provided values. **Usage Example**:: import json # Suppose we have some geometry objects: axis = Axis(position=(0, 0, 0), direction=(1, 0, 0)) vector = Vector(0.0, 1.0, 2.0) data = { "my_axis": axis, "my_vector": vector } # Encode them to JSON: encoded_data = json.dumps(data, cls=GeomEncoder, indent=4) # Decode them back: decoded_data = json.loads(encoded_data, object_hook=GeomEncoder.geometry_hook)
# build123d.geometry.GeomEncoder (class)
class GeomEncoder(JSONEncoder)

  # Return a JSON-serializable representation of a known geometry object
  # build123d.geometry.GeomEncoder.default (method)
  default(o)

  # Convert dictionaries back into geometry objects for decoding
  # build123d.geometry.GeomEncoder.geometry_hook (method)
  geometry_hook(json_dict)

# Category: geometry
# Location in 3D space
# Remarks: This class wraps the TopLoc_Location class from OCCT. It can be used to move Shape objects in both relative and absolute manner. It is the preferred type to locate objects in build123d. Attributes: wrapped (TopLoc_Location): the OCP location object
# build123d.geometry.Location (class)
class Location

  # build123d.geometry.Location.__init__ (constructor)
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

  # OCP object
  wrapped: TopLoc_Location

  # Extract Position component of self
  # Remarks: Returns: Vector: Position part of Location
  position: Vector

  # Extract orientation/rotation component of self
  # Remarks: Returns: Vector: orientation part of Location
  orientation: Vector

  # Default X axis when used as a plane
  x_axis: Axis

  # Default Y axis when used as a plane
  y_axis: Axis

  # Default Z axis when used as a plane
  z_axis: Axis

  # Inverted location
  # build123d.geometry.Location.inverse (method)
  inverse() -> Location

  # Combine locations
  # build123d.geometry.Location.__mul__ (method)
  __mul__(other: _ShapeT) -> _ShapeT  # Location * other
  __mul__(other: Location) -> Location  # Location * other
  __mul__(other: Iterable[Location]) -> list[Location]  # Location * other

  # build123d.geometry.Location.__pow__ (method)
  __pow__(exponent: int) -> Location  # Location ** exponent

  # Flip the orientation without changing the position operator -
  # build123d.geometry.Location.__neg__ (method)
  __neg__() -> Location  # -Location

  # intersect axis with other &
  # build123d.geometry.Location.__and__ (method)
  __and__(other: Axis | Location | Plane | VectorLike | Shape) -> Vector | Location | None  # Location & other

  # Return center of the location - useful for sorting
  # build123d.geometry.Location.center (method)
  center() -> Vector

  # Return a new Location mirrored across the given plane
  # Remarks: This method reflects both the position and orientation of the current Location across the specified mirror_plane using affine vector mathematics. Due to the mathematical properties of reflection: - The true mirror of a right-handed coordinate system is a *left-handed* one. However, `build123d` requires all coordinate systems to be right-handed. Therefore, this implementation: - Reflects the X and Z directions across the mirror plane - Recomputes the Y direction as: `Y = X × Z` This ensures the resulting Location maintains a valid right-handed frame, while remaining as close as possible to the geometric mirror. Returns: Location: A new mirrored Location that preserves right-handedness.
  # build123d.geometry.Location.mirror (method)
  mirror(mirror_plane: Plane) -> Location
  #   mirror_plane: The plane to mirror across

  # Convert the location into an Axis
  # build123d.geometry.Location.to_axis (method)
  to_axis() -> Axis

  # Convert the location to a translation, rotation tuple
  # build123d.geometry.Location.to_tuple (method)
  to_tuple() -> tuple[tuple[float, float, float], tuple[float, float, float]]

  # Find intersection of location and geometric object or shape
  # build123d.geometry.Location.intersect (method)
  intersect(vector: VectorLike) -> Vector | None
  intersect(location: Location) -> Vector | Location | None
  intersect(axis: Axis) -> Vector | Location | None
  intersect(plane: Plane) -> Vector | Location | None
  intersect(shape: Shape) -> Shape | None

# Category: geometry
# Custom JSON Encoder for Location values
# Remarks: Example: .. code:: data_dict = { "part1": { "joint_one": Location((1, 2, 3), (4, 5, 6)), "joint_two": Location((7, 8, 9), (10, 11, 12)), }, "part2": { "joint_one": Location((13, 14, 15), (16, 17, 18)), "joint_two": Location((19, 20, 21), (22, 23, 24)), }, } json_object = json.dumps(data_dict, indent=4, cls=LocationEncoder) with open("sample.json", "w") as outfile: outfile.write(json_object) with open("sample.json", "r") as infile: copy_data_dict = json.load(infile, object_hook=LocationEncoder.location_hook)
# build123d.geometry.LocationEncoder (class)
class LocationEncoder(JSONEncoder)

  # Return a serializable object
  # build123d.geometry.LocationEncoder.default (method)
  default(o: Location) -> dict

  # Convert Locations loaded from json to Location objects
  # Remarks: Example: read_json = json.load(infile, object_hook=LocationEncoder.location_hook)
  # build123d.geometry.LocationEncoder.location_hook (method)
  location_hook(obj) -> dict

# Category: geometry
# A 3d , 4x4 transformation matrix
# Remarks: Used to move geometry in space. The provided "matrix" parameter may be None, a gp_GTrsf, or a nested list of values. If given a nested list, it is expected to be of the form: [[m11, m12, m13, m14], [m21, m22, m23, m24], [m31, m32, m33, m34]] A fourth row may be given, but it is expected to be: [0.0, 0.0, 0.0, 1.0] since this is a transform matrix. Attributes: wrapped (gp_GTrsf): the OCP transformation function
# build123d.geometry.Matrix (class)
class Matrix

  # build123d.geometry.Matrix.__init__ (constructor)
  Matrix()
  Matrix(trsf: gp_GTrsf | gp_Trsf)
  Matrix(matrix: Sequence[Sequence[float]])

  # General rotate about axis by angle in degrees
  # build123d.geometry.Matrix.rotate (method)
  rotate(axis: Axis, angle: float)

  # Invert Matrix
  # build123d.geometry.Matrix.inverse (method)
  inverse() -> Matrix

  # Matrix multiplication
  # build123d.geometry.Matrix.multiply (method)
  multiply(other: Vector) -> Vector
  multiply(other: Matrix) -> Matrix

  # Needed by the cqparts gltf exporter
  # build123d.geometry.Matrix.transposed_list (method)
  transposed_list() -> Sequence[float]

  # Provide Matrix[r, c] syntax for accessing individual values
  # Remarks: and column parameters start at zero, which is consistent with most python libraries, but is counter to gp_GTrsf(), which is 1-indexed.
  # build123d.geometry.Matrix.__getitem__ (method)
  __getitem__(row_col: tuple[int, int]) -> float  # Matrix[row_col]

# Category: geometry
# An Oriented Bounding Box
# Remarks: This class computes the oriented bounding box for a given build123d shape. It exposes properties such as the center, principal axis directions, the extents along these axes, and the full diagonal length of the box. Note: The axes of the oriented bounding box are arbitrary and may not be consistent across platforms or time.
# build123d.geometry.OrientedBoundBox (class)
class OrientedBoundBox

  # Create an oriented bounding box from either a precomputed Bnd_OBB or
  # Remarks: a build123d Shape (which wraps a TopoDS_Shape).
  # build123d.geometry.OrientedBoundBox.__init__ (constructor)
  OrientedBoundBox(shape: Bnd_OBB | Shape)
  #   shape: Either a precomputed Bnd_OBB or a build123d shape from which to compute the oriented bounding box

  # OCP object
  wrapped

  # Compute and return the unique corner points of the oriented bounding box
  # Remarks: in the coordinate system defined by the OBB's plane. For degenerate shapes (e.g. a line or a planar face), only the unique points are returned. For 2D shapes the corners are returned in an order that allows a polygon to be directly created from them. Returns: list[Vector]: The unique corner points.
  corners: list[Vector]

  # The full length of the body diagonal of the oriented bounding box,
  # Remarks: which represents the maximum size of the object. Returns: float: The diagonal length.
  diagonal: float

  # The Location of the center of the oriented bounding box
  # Remarks: Returns: Location: center location
  location: Location

  # The oriented coordinate system of the bounding box
  # Remarks: Returns: Plane: The coordinate system defined by the center and primary (X) and tertiary (Z) directions of the bounding box.
  plane: Plane

  # The full extents of the bounding box along its primary axes
  # Remarks: Returns: Vector: The oriented size (full dimensions) of the box.
  size: Vector

  # The primary (X) direction of the oriented bounding box
  # Remarks: Returns: Vector: The X direction as a unit vector.
  x_direction: Vector

  # The secondary (Y) direction of the oriented bounding box
  # Remarks: Returns: Vector: The Y direction as a unit vector.
  y_direction: Vector

  # The tertiary (Z) direction of the oriented bounding box
  # Remarks: Returns: Vector: The Z direction as a unit vector.
  z_direction: Vector

  # Compute and return the center point of the oriented bounding box
  # Remarks: Returns: Vector: The center point of the box.
  # build123d.geometry.OrientedBoundBox.center (method)
  center() -> Vector

  # Determine whether the given oriented bounding box is entirely contained
  # Remarks: within this bounding box. This method checks that every point of 'other' lies strictly within the boundaries of this box, according to the tolerance criteria inherent to the underlying OCCT implementation. Returns: bool: True if 'other' is completely inside this bounding box; otherwise, False.
  # Throws: ValueError: If the 'other' bounding box has an uninitialized (null) underlying geometry.
  # build123d.geometry.OrientedBoundBox.is_completely_inside (method)
  is_completely_inside(other: OrientedBoundBox) -> bool
  #   other: The bounding box to test for containment

  # Determine whether a given point lies entirely outside this oriented bounding box
  # Remarks: A point is considered outside if it is neither inside the box nor on its surface, based on the criteria defined by the OCCT implementation. Returns: bool: True if the point is completely outside the bounding box; otherwise, False.
  # Throws: ValueError: If the point's underlying geometry is not set (null).
  # build123d.geometry.OrientedBoundBox.is_outside (method)
  is_outside(point: Vector) -> bool
  #   point: The point to test

# Category: geometry
# Plane
# Remarks: A plane is positioned in space with a coordinate system such that the plane is defined by the origin, x_dir (X direction), y_dir (Y direction), and z_dir (Z direction) of this coordinate system, which is the "local coordinate system" of the plane. The z_dir is a vector normal to the plane. The coordinate system is right-handed. A plane allows the use of local 2D coordinates, which are later converted to global, 3d coordinates when the operations are complete. Planes can be created from faces as workplanes for feature creation on objects. ========= ====== ======== ======== Name x_dir y_dir z_dir ========= ====== ======== ======== XY +x +y +z YZ +y +z +x ZX +z +x +y XZ +x +z -y YX +y +x -z ZY +z +y -x front +x +z -y back -x +z +y left -y +z -x right +y +z +x top +x +y +z bottom +x -y -z isometric +x+y -x+y+z +x+y-z ========= ====== ======== ======== Attributes: origin (Vector): global position of local (0,0,0) point x_dir (Vector): x direction y_dir (Vector): y direction z_dir (Vector): z direction forward_transform (Matrix): forward location transformation matrix reverse_transform (Matrix): reverse location transformation matrix wrapped (gp_Pln): the OCP plane object Returns: Plane: A plane
# Throws: ValueError: z_dir must be non null
# Throws: ValueError: y_dir must be non null
# Throws: ValueError: x_dir must be non null
# Throws: ValueError: the specified x_dir is not orthogonal to the provided normal
# Throws: ValueError: x_dir and y_dir must not be parallel
# Throws: ValueError: the specified x_dir is not orthogonal to the provided normal
# build123d.geometry.Plane (class)
class Plane

  # XY Plane
  XY: Plane

  # YZ Plane
  YZ: Plane

  # ZX Plane
  ZX: Plane

  # XZ Plane
  XZ: Plane

  # YX Plane
  YX: Plane

  # ZY Plane
  ZY: Plane

  # Front Plane
  front: Plane

  # Back Plane
  back: Plane

  # Left Plane
  left: Plane

  # Right Plane
  right: Plane

  # Top Plane
  top: Plane

  # Bottom Plane
  bottom: Plane

  # Isometric Plane
  isometric: Plane

  # Find the normal at the center of a TopoDS_Face
  # build123d.geometry.Plane.get_topods_face_normal (method)
  get_topods_face_normal(face: TopoDS_Face) -> Vector

  # Create a plane from either an OCCT gp_pln, Face, Location, or coordinates
  # build123d.geometry.Plane.__init__ (constructor)
  Plane(gp_pln: gp_Pln) -> None
  Plane(points: Iterable[VectorLike]) -> None
  Plane(origin: VectorLike, x_dir: VectorLike | None = None, z_dir: VectorLike = (0, 0, 1)) -> None
  Plane(origin: VectorLike, x_dir: VectorLike, *, y_dir: VectorLike) -> None
  Plane(face: Face, x_dir: VectorLike | None = None) -> None
  Plane(location: Location) -> None
  Plane(axis: Axis, x_dir: VectorLike | None = None) -> None
  #   gp_pln: an OCCT plane object

  # The OCP object
  wrapped: gp_Pln

  # Move the Plane by amount in the direction of z_dir
  # build123d.geometry.Plane.offset (method)
  offset(amount: float) -> Plane

  # Reverse z direction of plane operator -
  # build123d.geometry.Plane.__neg__ (method)
  __neg__() -> Plane  # -Plane

  # build123d.geometry.Plane.__mul__ (method)
  __mul__(other: _ShapeT) -> _ShapeT  # Plane * other
  __mul__(other: Location | Plane) -> Location  # Plane * other
  __mul__(other: Iterable[Location | Plane]) -> list[Location]  # Plane * other

  # build123d.geometry.Plane.__rmul__ (method)
  __rmul__(other: Location) -> Plane  # other * Plane
  __rmul__(other: Iterable[Location | Plane]) -> list[Plane]  # other * Plane

  # intersect plane with other &
  # build123d.geometry.Plane.__and__ (method)
  __and__(other: Axis | Location | Plane | VectorLike | Shape)  # Plane & other

  # Reverse z direction of plane
  # build123d.geometry.Plane.reverse (method)
  reverse() -> Plane

  # global position of local (0,0,0) point
  origin: Vector

  # Local Z direction normal to the plane
  z_dir: Vector

  # Local X direction of the plane
  x_dir: Vector

  # Local Y direction of the plane
  y_dir: Vector

  # shift plane origin
  # Remarks: Creates a new plane with the origin moved within the plane to the point of intersection of the axis or at the given Vertex. The plane's x_dir and z_dir are unchanged. Returns: Plane: plane with new origin
  # Throws: ValueError: Vertex isn't within plane
  # Throws: ValueError: Point isn't within plane
  # Throws: ValueError: Axis doesn't intersect plane
  # build123d.geometry.Plane.shift_origin (method)
  shift_origin(locator: Axis | VectorLike | Vertex) -> Plane
  #   locator: Either Axis that intersects the new plane origin or Vertex within Plane

  # Returns a copy of this plane, rotated about the specified axes
  # Remarks: The origin of the workplane is unaffected by the rotation. Rotations are done in order x, y, z. If you need a different order, specify ordering. e.g. Intrinsic.ZYX changes rotation to (z angle, y angle, x angle) and rotates in that order. Returns: Plane: a copy of this plane rotated as requested.
  # build123d.geometry.Plane.rotated (method)
  rotated(rotation: VectorLike = (0, 0, 0), ordering: Extrinsic | Intrinsic | None = None) -> Plane
  #   rotation: (x angle, y angle, z angle)
  #   ordering: order of rotations in Intrinsic or Extrinsic rotation mode

  # Change the position & orientation of a copy of self by applying a relative location
  # Remarks: Returns: Plane: relocated plane
  # build123d.geometry.Plane.moved (method)
  moved(loc: Location | Plane) -> Plane
  #   loc: relative change

  # Change the position & orientation of self by applying a relative location
  # Remarks: Returns: Plane: relocated self
  # build123d.geometry.Plane.move (method)
  move(loc: Location | Plane) -> Plane
  #   loc: relative change

  # forward location transformation matrix
  forward_transform

  # reverse location transformation matrix
  reverse_transform

  # Return Location representing the origin and z direction
  location: Location

  # Return gp_Ax3 version of the plane
  # build123d.geometry.Plane.to_gp_ax3 (method)
  to_gp_ax3() -> gp_Ax3

  # Return gp_Ax2 version of the plane
  # build123d.geometry.Plane.to_gp_ax2 (method)
  to_gp_ax2() -> gp_Ax2

  # Reposition the object relative to this plane
  # Remarks: Returns: an object of the same type, but repositioned to local coordinates
  # build123d.geometry.Plane.to_local_coords (method)
  to_local_coords(obj: VectorLike | Any | BoundBox)
  #   obj: VectorLike | Shape | BoundBox an object to reposition

  # Reposition the object relative from this plane
  # Remarks: Returns: an object of the same type, but repositioned to world coordinates
  # build123d.geometry.Plane.from_local_coords (method)
  from_local_coords(obj: tuple | Vector | Any | BoundBox)
  #   obj: VectorLike | Shape | BoundBox an object to reposition

  # Return a location representing the translation from self to other
  # build123d.geometry.Plane.location_between (method)
  location_between(other: Plane) -> Location

  # contains
  # Remarks: Is this point or Axis fully contained in this plane? Returns: bool: self contains point or Axis
  # build123d.geometry.Plane.contains (method)
  contains(obj: VectorLike | Axis, tolerance: float = TOLERANCE) -> bool
  #   obj: point or Axis to evaluate
  #   tolerance: comparison tolerance

  # Find intersection of plane and geometric object or shape
  # build123d.geometry.Plane.intersect (method)
  intersect(vector: VectorLike) -> Vector | None
  intersect(location: Location) -> Vector | Location | None
  intersect(axis: Axis) -> Vector | Axis | None
  intersect(plane: Plane) -> Axis | Plane | None
  intersect(shape: Shape) -> Shape | None

# Category: geometry
# A position only sub-class of Location
# build123d.geometry.Pos (class)
class Pos(Location)

  # build123d.geometry.Pos.__init__ (constructor)
  Pos(v: VectorLike)
  Pos(v: Iterable)
  Pos(X: float = 0, Y: float = 0, Z: float = 0)

# Category: geometry
# Subclass of Location used only for object rotation
# Remarks: Attributes: X (float): rotation in degrees about X axis Y (float): rotation in degrees about Y axis Z (float): rotation in degrees about Z axis optionally specify rotation ordering with Intrinsic or Extrinsic enums, defaults to Intrinsic.XYZ
# build123d.geometry.Rot (class)
class Rot(Location)

  # build123d.geometry.Rotation.__init__ (constructor)
  Rotation(rotation: RotationLike, ordering: Extrinsic | Intrinsic == Intrinsic.XYZ)
  Rotation(X: float = 0, Y: float = 0, Z: float = 0, ordering: Extrinsic | Intrinsic = Intrinsic.XYZ)

# Category: geometry
# Subclass of Location used only for object rotation
# Remarks: Attributes: X (float): rotation in degrees about X axis Y (float): rotation in degrees about Y axis Z (float): rotation in degrees about Z axis optionally specify rotation ordering with Intrinsic or Extrinsic enums, defaults to Intrinsic.XYZ
# build123d.geometry.Rotation (class)
class Rotation(Location)

  # build123d.geometry.Rotation.__init__ (constructor)
  Rotation(rotation: RotationLike, ordering: Extrinsic | Intrinsic == Intrinsic.XYZ)
  Rotation(X: float = 0, Y: float = 0, Z: float = 0, ordering: Extrinsic | Intrinsic = Intrinsic.XYZ)

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

  # Return tuple equivalent
  # build123d.geometry.Vector.to_tuple (method)
  to_tuple() -> tuple[float, float, float]

  # Vector length
  length: float

  # Mathematical cross function
  # build123d.geometry.Vector.cross (method)
  cross(vec: Vector) -> Vector

  # Mathematical dot function
  # build123d.geometry.Vector.dot (method)
  dot(vec: Vector) -> float

  # build123d.geometry.Vector.sub (method)
  sub(vec: VectorLike)

  # Mathematical subtraction operator -
  # build123d.geometry.Vector.__sub__ (method)
  __sub__(vec: VectorLike) -> Vector  # Vector - vec

  # build123d.geometry.Vector.add (method)
  add(vec: VectorLike)

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
