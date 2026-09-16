# build123d — joints

5 top-level symbols. Signatures are verbatim python.

// BallJoint
BallJoint

  // Location of joint
  location: Location

  // A CAD symbol representing joint as bound to part
  symbol: Compound

  BallJoint(label: str, to_part: Solid | Compound | None = None, joint_location: Location | None = None, angular_range: tuple[tuple[float, float], tuple[float, float], tuple[float, float]] = ((0, 360), (0, 360), (0, 360)), angle_reference: Plane = Plane.XY)
  //   label: joint label
  //   to_part: object to attach joint to
  //   joint_location: global location of joint angular_range (tuple[ tuple[float, float], tuple[float, float], tuple[float, float] ], optional)
  //   angle_reference: plane relative to part defining zero degrees of rotation

  // Connect BallJoint and RigidJoint
  connect_to(other: RigidJoint, angles: RotationLike | None = None)
  //   other: joint to connect to
  //   angles: angles about axes in degrees

  // relative_to - BallJoint
  relative_to(other: RigidJoint, angles: RotationLike | None = None)
  //   other: joint to connect to
  //   angles: angles about axes in degrees

// CylindricalJoint
CylindricalJoint

  // Location of joint
  location: Location

  // A CAD symbol representing the cylindrical axis as bound to part
  symbol: Compound

  CylindricalJoint(label: str, to_part: Solid | Compound | None = None, axis: Axis = Axis.Z, angle_reference: VectorLike | None = None, linear_range: tuple[float, float] = (0, inf), angular_range: tuple[float, float] = (0, 360))
  //   label: joint label
  //   to_part: object to attach joint to
  //   axis: axis of rotation and linear motion
  //   angle_reference: direction normal to axis defining where angles will be measured from
  //   linear_range: (min,max) position of joint
  //   angular_range: (min,max) angle of joint

  // Connect CylindricalJoint and RigidJoint"
  connect_to(other: RigidJoint, position: float | None = None, angle: float | None = None)
  //   other: joint to connect to
  //   position: linear position
  //   angle: angle in degrees

  // Relative location of CylindricalJoint to RigidJoint
  relative_to(other: RigidJoint, position: float | None = None, angle: float | None = None)
  //   other: joint to connect to
  //   position: linear position
  //   angle: angle in degrees

// LinearJoint
LinearJoint

  // Location of joint
  location: Location

  // A CAD symbol of the linear axis positioned relative to_part
  symbol: Compound

  LinearJoint(label: str, to_part: Solid | Compound | None = None, axis: Axis = Axis.Z, linear_range: tuple[float, float] = (0, inf))
  //   label: joint label
  //   to_part: object to attach joint to
  //   axis: axis of linear motion

  // Connect LinearJoint to another Joint
  connect_to(other: RevoluteJoint, position: float | None = None, angle: float | None = None)
  connect_to(other: RigidJoint, position: float | None = None)
  //   other: joint to connect to
  //   position: linear position
  //   angle: angle in degrees

  // Relative location of LinearJoint to RevoluteJoint or RigidJoint
  relative_to(other: RigidJoint, position: float | None = None)
  relative_to(other: RevoluteJoint, position: float | None = None, angle: float | None = None)
  //   other: joint to connect to
  //   position: linear position

// RevoluteJoint
RevoluteJoint

  // Location of joint
  location: Location

  // A CAD symbol representing the axis of rotation as bound to part
  symbol: Compound

  RevoluteJoint(label: str, to_part: Solid | Compound | None = None, axis: Axis = Axis.Z, angle_reference: VectorLike | None = None, angular_range: tuple[float, float] = (0, 360))
  //   label: joint label
  //   to_part: object to attach joint to
  //   axis: axis of rotation
  //   angle_reference: direction normal to axis defining where angles will be measured from

  // Connect RevoluteJoint and RigidJoint
  connect_to(other: RigidJoint, angle: float | None = None)
  //   other: relative to joint
  //   angle: angle in degrees

  // Relative location of RevoluteJoint to RigidJoint
  relative_to(other: RigidJoint, angle: float | None = None)
  //   other: relative to joint
  //   angle: angle in degrees

// RigidJoint
RigidJoint

  // Location of joint
  location: Location

  // A CAD symbol (XYZ indicator) as bound to part
  symbol: Compound

  RigidJoint(label: str, to_part: Solid | Compound | None = None, joint_location: Location | None = None)
  //   label: joint label
  //   to_part: object to attach joint to
  //   joint_location: global location of joint

  // Connect the RigidJoint to another Joint
  connect_to(other: BallJoint, angles: RotationLike | None = None, **kwargs)
  connect_to(other: CylindricalJoint, position: float | None = None, angle: float | None = None)
  connect_to(other: LinearJoint, position: float | None = None)
  connect_to(other: RevoluteJoint, angle: float | None = None)
  connect_to(other: RigidJoint)
  //   other: joint to connect to
  //   angles: angles about axes in degrees

  // Relative location of RigidJoint to another Joint
  relative_to(other: BallJoint, angles: RotationLike | None = None)
  relative_to(other: CylindricalJoint, position: float | None = None, angle: float | None = None)
  relative_to(other: LinearJoint, position: float | None = None)
  relative_to(other: RevoluteJoint, angle: float | None = None)
  relative_to(other: RigidJoint)
  //   other: relative to joint
  //   angles: angles about axes in degrees
