# build123d — joints

5 top-level symbols. Signatures are verbatim python.

# Category: joints
# BallJoint
# Remarks: A component rotates around all 3 axes using a gimbal system (3 nested rotations). Attributes: relative_location (Location): joint location relative to bound part angular_range (tuple[ tuple[float, float], tuple[float, float], tuple[float, float] ]): X, Y, Z angle (min, max) pairs. angle_reference (Plane): plane relative to part defining zero degrees of
# build123d.joints.BallJoint (class)
class BallJoint(Joint)

  # Location of joint
  location: Location

  # A CAD symbol representing joint as bound to part
  symbol: Compound

  # build123d.joints.BallJoint.__init__ (constructor)
  BallJoint(label: str, to_part: Solid | Compound | None = None, joint_location: Location | None = None, angular_range: tuple[tuple[float, float], tuple[float, float], tuple[float, float]] = ((0, 360), (0, 360), (0, 360)), angle_reference: Plane = Plane.XY)
  #   label: joint label
  #   to_part: object to attach joint to
  #   joint_location: global location of joint angular_range (tuple[ tuple[float, float], tuple[float, float], tuple[float, float] ], optional)
  #   angle_reference: plane relative to part defining zero degrees of rotation

  # Connect BallJoint and RigidJoint
  # Throws: TypeError: invalid other joint type
  # Throws: ValueError: angles out of range
  # build123d.joints.BallJoint.connect_to (method)
  connect_to(other: RigidJoint, *, angles: RotationLike | None = None)
  #   other: joint to connect to
  #   angles: angles about axes in degrees

  # relative_to - BallJoint
  # Remarks: Return the relative location from this joint to the RigidJoint of another object
  # Throws: TypeError: invalid other joint type
  # Throws: ValueError: angles out of range
  # build123d.joints.BallJoint.relative_to (method)
  relative_to(other: RigidJoint, *, angles: RotationLike | None = None)
  #   other: joint to connect to
  #   angles: angles about axes in degrees

# Category: joints
# CylindricalJoint
# Remarks: Component rotates around and moves along a single axis like a screw. Attributes: axis (Axis): joint axis linear_position (float): linear joint position rotational_position (float): revolute joint angle in degrees angle_reference (Vector): reference for angular positions angular_range (tuple[float,float]): min and max angular position of joint linear_range (tuple[float,float]): min and max positional values relative_axis (Axis): joint axis relative to bound part position (float): joint position angle (float): angle of joint
# Throws: ValueError: angle_reference must be normal to axis
# build123d.joints.CylindricalJoint (class)
class CylindricalJoint(Joint)

  # Location of joint
  location: Location

  # A CAD symbol representing the cylindrical axis as bound to part
  symbol: Compound

  # build123d.joints.CylindricalJoint.__init__ (constructor)
  CylindricalJoint(label: str, to_part: Solid | Compound | None = None, axis: Axis = Axis.Z, angle_reference: VectorLike | None = None, linear_range: tuple[float, float] = (0, inf), angular_range: tuple[float, float] = (0, 360))
  #   label: joint label
  #   to_part: object to attach joint to
  #   axis: axis of rotation and linear motion
  #   angle_reference: direction normal to axis defining where angles will be measured from
  #   linear_range: (min,max) position of joint
  #   angular_range: (min,max) angle of joint

  # Connect CylindricalJoint and RigidJoint"
  # Throws: TypeError: other must be of type RigidJoint
  # Throws: ValueError: position out of range
  # Throws: ValueError: angle out of range
  # build123d.joints.CylindricalJoint.connect_to (method)
  connect_to(other: RigidJoint, *, position: float | None = None, angle: float | None = None)
  #   other: joint to connect to
  #   position: linear position
  #   angle: angle in degrees

  # Relative location of CylindricalJoint to RigidJoint
  # Throws: TypeError: other must be of type RigidJoint
  # Throws: ValueError: position out of range
  # Throws: ValueError: angle out of range
  # build123d.joints.CylindricalJoint.relative_to (method)
  relative_to(other: RigidJoint, *, position: float | None = None, angle: float | None = None)
  #   other: joint to connect to
  #   position: linear position
  #   angle: angle in degrees

# Category: joints
# LinearJoint
# Remarks: Component moves along a single axis. Attributes: axis (Axis): joint axis angle (float): angle of joint linear_range (tuple[float,float]): min and max positional values position (float): joint position relative_axis (Axis): joint axis relative to bound part
# build123d.joints.LinearJoint (class)
class LinearJoint(Joint)

  # Location of joint
  location: Location

  # A CAD symbol of the linear axis positioned relative to_part
  symbol: Compound

  # build123d.joints.LinearJoint.__init__ (constructor)
  LinearJoint(label: str, to_part: Solid | Compound | None = None, axis: Axis = Axis.Z, linear_range: tuple[float, float] = (0, inf))
  #   label: joint label
  #   to_part: object to attach joint to
  #   axis: axis of linear motion

  # Connect LinearJoint to another Joint
  # Throws: TypeError: other must be of type RevoluteJoint or RigidJoint
  # Throws: ValueError: position out of range
  # Throws: ValueError: angle out of range
  # build123d.joints.LinearJoint.connect_to (method)
  connect_to(other: RevoluteJoint, *, position: float | None = None, angle: float | None = None)
  connect_to(other: RigidJoint, *, position: float | None = None)
  #   other: joint to connect to
  #   position: linear position
  #   angle: angle in degrees

  # Relative location of LinearJoint to RevoluteJoint or RigidJoint
  # Throws: TypeError: other must be of type RevoluteJoint or RigidJoint
  # Throws: ValueError: position out of range
  # Throws: ValueError: angle out of range
  # build123d.joints.LinearJoint.relative_to (method)
  relative_to(other: RigidJoint, *, position: float | None = None)
  relative_to(other: RevoluteJoint, *, position: float | None = None, angle: float | None = None)
  #   other: joint to connect to
  #   position: linear position

# Category: joints
# RevoluteJoint
# Remarks: Component rotates around axis like a hinge. Attributes: angle (float): angle of joint angle_reference (Vector): reference for angular positions angular_range (tuple[float,float]): min and max angular position of joint relative_axis (Axis): joint axis relative to bound part
# Throws: ValueError: angle_reference must be normal to axis
# build123d.joints.RevoluteJoint (class)
class RevoluteJoint(Joint)

  # Location of joint
  location: Location

  # A CAD symbol representing the axis of rotation as bound to part
  symbol: Compound

  # build123d.joints.RevoluteJoint.__init__ (constructor)
  RevoluteJoint(label: str, to_part: Solid | Compound | None = None, axis: Axis = Axis.Z, angle_reference: VectorLike | None = None, angular_range: tuple[float, float] = (0, 360))
  #   label: joint label
  #   to_part: object to attach joint to
  #   axis: axis of rotation
  #   angle_reference: direction normal to axis defining where angles will be measured from

  # Connect RevoluteJoint and RigidJoint
  # Remarks: Returns: TypeError: other must of type RigidJoint ValueError: angle out of range
  # build123d.joints.RevoluteJoint.connect_to (method)
  connect_to(other: RigidJoint, *, angle: float | None = None)
  #   other: relative to joint
  #   angle: angle in degrees

  # Relative location of RevoluteJoint to RigidJoint
  # Throws: TypeError: other must of type RigidJoint
  # Throws: ValueError: angle out of range
  # build123d.joints.RevoluteJoint.relative_to (method)
  relative_to(other: RigidJoint, *, angle: float | None = None)
  #   other: relative to joint
  #   angle: angle in degrees

# Category: joints
# RigidJoint
# Remarks: A rigid joint fixes two components to one another. Attributes: relative_location (Location): joint location relative to bound object
# build123d.joints.RigidJoint (class)
class RigidJoint(Joint)

  # Location of joint
  location: Location

  # A CAD symbol (XYZ indicator) as bound to part
  symbol: Compound

  # build123d.joints.RigidJoint.__init__ (constructor)
  RigidJoint(label: str, to_part: Solid | Compound | None = None, joint_location: Location | None = None)
  #   label: joint label
  #   to_part: object to attach joint to
  #   joint_location: global location of joint

  # Connect the RigidJoint to another Joint
  # build123d.joints.RigidJoint.connect_to (method)
  connect_to(other: BallJoint, *, angles: RotationLike | None = None, **kwargs)
  connect_to(other: CylindricalJoint, *, position: float | None = None, angle: float | None = None)
  connect_to(other: LinearJoint, *, position: float | None = None)
  connect_to(other: RevoluteJoint, *, angle: float | None = None)
  connect_to(other: RigidJoint)
  #   other: joint to connect to
  #   angles: angles about axes in degrees

  # Relative location of RigidJoint to another Joint
  # Throws: TypeError: other must be of a type in: BallJoint, CylindricalJoint,
  # Throws: LinearJoint, RevoluteJoint, RigidJoint.
  # build123d.joints.RigidJoint.relative_to (method)
  relative_to(other: BallJoint, *, angles: RotationLike | None = None)
  relative_to(other: CylindricalJoint, *, position: float | None = None, angle: float | None = None)
  relative_to(other: LinearJoint, *, position: float | None = None)
  relative_to(other: RevoluteJoint, *, angle: float | None = None)
  relative_to(other: RigidJoint)
  #   other: relative to joint
  #   angles: angles about axes in degrees
