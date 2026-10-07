# build123d — gp (3)

3 top-level symbols. Signatures are verbatim python.

// Category: gp
// Describes a unit vector in 3D space
gp_Dir

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_Dir) -> None 2. __init__(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Vec) -> None 3. __init__(self: OCP.OCP.gp.gp_Dir, theCoord: OCP.OCP.gp.gp_XYZ) -> None 4. __init__(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None
  // OCP.OCP.gp.gp_Dir.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None

  // SetCoord(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetCoord(self: OCP.OCP.gp.gp_Dir, theIndex: int, theXi: float) -> None For this unit vector, assigns the value Xi to: - the X coordinate if theIndex is 1, or - the Y coordinate if theIndex is 2, or - the Z coordinate if theIndex is 3, and then normalizes it. Warning Remember that all the coordinates of a unit vector are implicitly modified when any single one is changed directly. Exceptions Standard_OutOfRange if theIndex is not 1, 2, or 3. Standard_ConstructionError if either of the following is less than or equal to gp::Resolution(): - Sqrt(Xv*Xv + Yv*Yv + Zv*Zv), or - the modulus of the number triple formed by the new value theXi and the two other coordinates of this vector that were not directly modified. 2. SetCoord(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None For this unit vector, assigns the values theXv, theYv and theZv to its three coordinates. Remember that all the coordinates of a unit vector are implicitly modified when any single one is changed directly. 3. SetCoord(self: OCP.OCP.gp.gp_Dir, theIndex: int, theXi: float) -> None For this unit vector, assigns the value Xi to: - the X coordinate if theIndex is 1, or - the Y coordinate if theIndex is 2, or - the Z coordinate if theIndex is 3, and then normalizes it. Warning Remember that all the coordinates of a unit vector are implicitly modified when any single one is changed directly. Exceptions Standard_OutOfRange if theIndex is not 1, 2, or 3. Standard_ConstructionError if either of the following is less than or equal to gp::Resolution(): - Sqrt(Xv*Xv + Yv*Yv + Zv*Zv), or - the modulus of the number triple formed by the new value theXi and the two other coordinates of this vector that were not directly modified. 4. SetCoord(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None For this unit vector, assigns the values theXv, theYv and theZv to its three coordinates. Remember that all the coordinates of a unit vector are implicitly modified when any single one is changed directly.
  // OCP.OCP.gp.gp_Dir.SetCoord (method)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Dir, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None

  // SetX(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetX(self: OCP.OCP.gp.gp_Dir, theX: float) -> None Assigns the given value to the X coordinate of this unit vector. 2. SetX(self: OCP.OCP.gp.gp_Dir, theX: float) -> None Assigns the given value to the X coordinate of this unit vector.
  // OCP.OCP.gp.gp_Dir.SetX (method)
  SetX(*args, **kwargs)
  SetX(self: OCP.OCP.gp.gp_Dir, theX: float) -> None
  SetX(self: OCP.OCP.gp.gp_Dir, theX: float) -> None

  // SetY(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetY(self: OCP.OCP.gp.gp_Dir, theY: float) -> None Assigns the given value to the Y coordinate of this unit vector. 2. SetY(self: OCP.OCP.gp.gp_Dir, theY: float) -> None Assigns the given value to the Y coordinate of this unit vector.
  // OCP.OCP.gp.gp_Dir.SetY (method)
  SetY(*args, **kwargs)
  SetY(self: OCP.OCP.gp.gp_Dir, theY: float) -> None
  SetY(self: OCP.OCP.gp.gp_Dir, theY: float) -> None

  // SetZ(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetZ(self: OCP.OCP.gp.gp_Dir, theZ: float) -> None Assigns the given value to the Z coordinate of this unit vector. 2. SetZ(self: OCP.OCP.gp.gp_Dir, theZ: float) -> None Assigns the given value to the Z coordinate of this unit vector.
  // OCP.OCP.gp.gp_Dir.SetZ (method)
  SetZ(*args, **kwargs)
  SetZ(self: OCP.OCP.gp.gp_Dir, theZ: float) -> None
  SetZ(self: OCP.OCP.gp.gp_Dir, theZ: float) -> None

  // SetXYZ(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetXYZ(self: OCP.OCP.gp.gp_Dir, theCoord: OCP.OCP.gp.gp_XYZ) -> None Assigns the three coordinates of theCoord to this unit vector. 2. SetXYZ(self: OCP.OCP.gp.gp_Dir, theXYZ: OCP.OCP.gp.gp_XYZ) -> None Assigns the three coordinates of theCoord to this unit vector.
  // OCP.OCP.gp.gp_Dir.SetXYZ (method)
  SetXYZ(*args, **kwargs)
  SetXYZ(self: OCP.OCP.gp.gp_Dir, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  SetXYZ(self: OCP.OCP.gp.gp_Dir, theXYZ: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  // Remarks: Overloaded function. 1. Coord(self: OCP.OCP.gp.gp_Dir, theIndex: int) -> float Returns the coordinate of range theIndex : theIndex = 1 => X is returned Ithendex = 2 => Y is returned theIndex = 3 => Z is returned Exceptions Standard_OutOfRange if theIndex is not 1, 2, or 3. 2. Coord(self: OCP.OCP.gp.gp_Dir) -> tuple[float, float, float] Returns for the unit vector its three coordinates theXv, theYv, and theZv.
  // OCP.OCP.gp.gp_Dir.Coord (method)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Dir, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Dir) -> tuple[float, float, float]

  // X(self
  // Remarks: Returns the X coordinate for a unit vector.
  // OCP.OCP.gp.gp_Dir.X (method)
  X(self: OCP.OCP.gp.gp_Dir) -> float

  // Y(self
  // Remarks: Returns the Y coordinate for a unit vector.
  // OCP.OCP.gp.gp_Dir.Y (method)
  Y(self: OCP.OCP.gp.gp_Dir) -> float

  // Z(self
  // Remarks: Returns the Z coordinate for a unit vector.
  // OCP.OCP.gp.gp_Dir.Z (method)
  Z(self: OCP.OCP.gp.gp_Dir) -> float

  // IsEqual(self
  // Remarks: Returns True if the angle between the two directions is lower or equal to theAngularTolerance.
  // OCP.OCP.gp.gp_Dir.IsEqual (method)
  IsEqual(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsNormal(self
  // Remarks: Returns True if the angle between this unit vector and the unit vector theOther is equal to Pi/2 (normal).
  // OCP.OCP.gp.gp_Dir.IsNormal (method)
  IsNormal(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsOpposite(self
  // Remarks: Returns True if the angle between this unit vector and the unit vector theOther is equal to Pi (opposite).
  // OCP.OCP.gp.gp_Dir.IsOpposite (method)
  IsOpposite(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsParallel(self
  // Remarks: Returns true if the angle between this unit vector and the unit vector theOther is equal to 0 or to Pi. Note: the tolerance criterion is given by theAngularTolerance.
  // OCP.OCP.gp.gp_Dir.IsParallel (method)
  IsParallel(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // Angle(self
  // Remarks: Computes the angular value in radians between <me> and <theOther>. This value is always positive in 3D space. Returns the angle in the range [0, PI]
  // OCP.OCP.gp.gp_Dir.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir) -> float

  // AngleWithRef(self
  // Remarks: Computes the angular value between <me> and <theOther>. <theVRef> is the direction of reference normal to <me> and <theOther> and its orientation gives the positive sense of rotation. If the cross product <me> ^ <theOther> has the same orientation as <theVRef> the angular value is positive else negative. Returns the angular value in the range -PI and PI (in radians). Raises DomainError if <me> and <theOther> are not parallel this exception is raised when <theVRef> is in the same plane as <me> and <theOther> The tolerance criterion is Resolution from package gp.
  // OCP.OCP.gp.gp_Dir.AngleWithRef (method)
  AngleWithRef(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theVRef: OCP.OCP.gp.gp_Dir) -> float

  // Cross(*args, **kwargs)
  // Remarks: Overloaded function. 1. Cross(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> None Computes the cross product between two directions Raises the exception ConstructionError if the two directions are parallel because the computed vector cannot be normalized to create a direction. 2. Cross(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> None Computes the cross product between two directions Raises the exception ConstructionError if the two directions are parallel because the computed vector cannot be normalized to create a direction.
  // OCP.OCP.gp.gp_Dir.Cross (method)
  Cross(*args, **kwargs)
  Cross(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> None
  Cross(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> None

  // Crossed(*args, **kwargs)
  // Remarks: Overloaded function. 1. Crossed(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir Computes the triple vector product. <me> ^ (V1 ^ V2) Raises the exception ConstructionError if V1 and V2 are parallel or <me> and (V1^V2) are parallel because the computed vector can't be normalized to create a direction. 2. Crossed(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir Computes the triple vector product. <me> ^ (V1 ^ V2) Raises the exception ConstructionError if V1 and V2 are parallel or <me> and (V1^V2) are parallel because the computed vector can't be normalized to create a direction.
  // OCP.OCP.gp.gp_Dir.Crossed (method)
  Crossed(*args, **kwargs)
  Crossed(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  Crossed(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // CrossCross(*args, **kwargs)
  // Remarks: Overloaded function. 1. CrossCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> None 2. CrossCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> None
  // OCP.OCP.gp.gp_Dir.CrossCross (method)
  CrossCross(*args, **kwargs)
  CrossCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> None
  CrossCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> None

  // CrossCrossed(*args, **kwargs)
  // Remarks: Overloaded function. 1. CrossCrossed(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir Computes the double vector product this ^ (theV1 ^ theV2). - CrossCrossed creates a new unit vector. Exceptions Standard_ConstructionError if: - theV1 and theV2 are parallel, or - this unit vector and (theV1 ^ theV2) are parallel. This is because, in these conditions, the computed vector is null and cannot be normalized. 2. CrossCrossed(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir Computes the double vector product this ^ (theV1 ^ theV2). - CrossCrossed creates a new unit vector. Exceptions Standard_ConstructionError if: - theV1 and theV2 are parallel, or - this unit vector and (theV1 ^ theV2) are parallel. This is because, in these conditions, the computed vector is null and cannot be normalized.
  // OCP.OCP.gp.gp_Dir.CrossCrossed (method)
  CrossCrossed(*args, **kwargs)
  CrossCrossed(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  CrossCrossed(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // Dot(self
  // Remarks: Computes the scalar product
  // OCP.OCP.gp.gp_Dir.Dot (method)
  Dot(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir) -> float

  // DotCross(self
  // Remarks: Computes the triple scalar product <me> * (theV1 ^ theV2). Warnings : The computed vector theV1' = theV1 ^ theV2 is not normalized to create a unitary vector. So this method never raises an exception even if theV1 and theV2 are parallel.
  // OCP.OCP.gp.gp_Dir.DotCross (method)
  DotCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> float

  // Reverse(self
  // OCP.OCP.gp.gp_Dir.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_Dir) -> None

  // Reversed(self
  // Remarks: Reverses the orientation of a direction geometric transformations Performs the symmetrical transformation of a direction with respect to the direction V which is the center of the symmetry.]
  // OCP.OCP.gp.gp_Dir.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // Mirror(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirror(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Dir) -> None 2. Mirror(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1) -> None 3. Mirror(self: OCP.OCP.gp.gp_Dir, theA2: OCP.OCP.gp.gp_Ax2) -> None
  // OCP.OCP.gp.gp_Dir.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Dir) -> None
  Mirror(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Dir, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirrored(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir Performs the symmetrical transformation of a direction with respect to the direction theV which is the center of the symmetry. 2. Mirrored(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Dir Performs the symmetrical transformation of a direction with respect to an axis placement which is the axis of the symmetry. 3. Mirrored(self: OCP.OCP.gp.gp_Dir, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir Performs the symmetrical transformation of a direction with respect to a plane. The axis placement theA2 locates the plane of the symmetry : (Location, XDirection, YDirection).
  // OCP.OCP.gp.gp_Dir.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  Mirrored(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Dir
  Mirrored(self: OCP.OCP.gp.gp_Dir, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // Rotate(*args, **kwargs)
  // Remarks: Overloaded function. 1. Rotate(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None 2. Rotate(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  // OCP.OCP.gp.gp_Dir.Rotate (method)
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // Remarks: Rotates a direction. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
  // OCP.OCP.gp.gp_Dir.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Dir

  // Transform(self
  // OCP.OCP.gp.gp_Dir.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Dir, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // Remarks: Transforms a direction with a "Trsf" from gp. Warnings : If the scale factor of the "Trsf" theT is negative then the direction <me> is reversed.
  // OCP.OCP.gp.gp_Dir.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Dir, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Dir

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.gp.gp_Dir.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Dir, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  // OCP.OCP.gp.gp_Dir.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Dir, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // XYZ(self
  // Remarks: for this unit vector, returns its three coordinates as a number triplea.
  // OCP.OCP.gp.gp_Dir.XYZ (method)
  XYZ(self: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_XYZ

// Category: gp
// Enumerates all 24 possible variants of generalized Euler angles, defining general 3d rotation by three rotations around main axes of coordinate system, in different possible orders
// Remarks: Members: gp_EulerAngles gp_YawPitchRoll gp_Extrinsic_XYZ gp_Extrinsic_XZY gp_Extrinsic_YZX gp_Extrinsic_YXZ gp_Extrinsic_ZXY gp_Extrinsic_ZYX gp_Intrinsic_XYZ gp_Intrinsic_XZY gp_Intrinsic_YZX gp_Intrinsic_YXZ gp_Intrinsic_ZXY gp_Intrinsic_ZYX gp_Extrinsic_XYX gp_Extrinsic_XZX gp_Extrinsic_YZY gp_Extrinsic_YXY gp_Extrinsic_ZYZ gp_Extrinsic_ZXZ gp_Intrinsic_XYX gp_Intrinsic_XZX gp_Intrinsic_YZY gp_Intrinsic_YXY gp_Intrinsic_ZXZ gp_Intrinsic_ZYZ
gp_EulerSequence

  // __init__(self
  // OCP.OCP.gp.gp_EulerSequence.__init__ (constructor)
  __init__(self: OCP.OCP.gp.gp_EulerSequence, value: int) -> None

  // name(self
  name

  value

// Category: gp
// Defines a non-persistent transformation in 3D space
gp_GTrsf

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_GTrsf) -> None 2. __init__(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_Trsf) -> None 3. __init__(self: OCP.OCP.gp.gp_GTrsf, theM: OCP.OCP.gp.gp_Mat, theV: OCP.OCP.gp.gp_XYZ) -> None
  // OCP.OCP.gp.gp_GTrsf.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_GTrsf) -> None
  __init__(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.gp.gp_GTrsf, theM: OCP.OCP.gp.gp_Mat, theV: OCP.OCP.gp.gp_XYZ) -> None

  // SetAffinity(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA1: OCP.OCP.gp.gp_Ax1, theRatio: float) -> None Changes this transformation into an affinity of ratio theRatio with respect to the axis theA1. Note: an affinity is a point-by-point transformation that transforms any point P into a point P' such that if H is the orthogonal projection of P on the axis theA1 or the plane A2, the vectors HP and HP' satisfy: HP' = theRatio * HP. 2. SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA2: OCP.OCP.gp.gp_Ax2, theRatio: float) -> None Changes this transformation into an affinity of ratio theRatio with respect to the plane defined by the origin, the "X Direction" and the "Y Direction" of coordinate system theA2. Note: an affinity is a point-by-point transformation that transforms any point P into a point P' such that if H is the orthogonal projection of P on the axis A1 or the plane theA2, the vectors HP and HP' satisfy: HP' = theRatio * HP. 3. SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA1: OCP.OCP.gp.gp_Ax1, theRatio: float) -> None Changes this transformation into an affinity of ratio theRatio with respect to the axis theA1. Note: an affinity is a point-by-point transformation that transforms any point P into a point P' such that if H is the orthogonal projection of P on the axis theA1 or the plane A2, the vectors HP and HP' satisfy: HP' = theRatio * HP. 4. SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA2: OCP.OCP.gp.gp_Ax2, theRatio: float) -> None Changes this transformation into an affinity of ratio theRatio with respect to the plane defined by the origin, the "X Direction" and the "Y Direction" of coordinate system theA2. Note: an affinity is a point-by-point transformation that transforms any point P into a point P' such that if H is the orthogonal projection of P on the axis A1 or the plane theA2, the vectors HP and HP' satisfy: HP' = theRatio * HP.
  // OCP.OCP.gp.gp_GTrsf.SetAffinity (method)
  SetAffinity(*args, **kwargs)
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA1: OCP.OCP.gp.gp_Ax1, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA2: OCP.OCP.gp.gp_Ax2, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA1: OCP.OCP.gp.gp_Ax1, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA2: OCP.OCP.gp.gp_Ax2, theRatio: float) -> None

  // SetValue(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetValue(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int, theValue: float) -> None Replaces the coefficient (theRow, theCol) of the matrix representing this transformation by theValue. Raises OutOfRange if theRow < 1 or theRow > 3 or theCol < 1 or theCol > 4 2. SetValue(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int, theValue: float) -> None Replaces the coefficient (theRow, theCol) of the matrix representing this transformation by theValue. Raises OutOfRange if theRow < 1 or theRow > 3 or theCol < 1 or theCol > 4
  // OCP.OCP.gp.gp_GTrsf.SetValue (method)
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int, theValue: float) -> None
  SetValue(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int, theValue: float) -> None

  // SetVectorialPart(self
  // Remarks: Replaces the vectorial part of this transformation by theMatrix.
  // OCP.OCP.gp.gp_GTrsf.SetVectorialPart (method)
  SetVectorialPart(self: OCP.OCP.gp.gp_GTrsf, theMatrix: OCP.OCP.gp.gp_Mat) -> None

  // SetTranslationPart(self
  // Remarks: Replaces the translation part of this transformation by the coordinates of the number triple theCoord.
  // OCP.OCP.gp.gp_GTrsf.SetTranslationPart (method)
  SetTranslationPart(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // SetTrsf(self
  // Remarks: Assigns the vectorial and translation parts of theT to this transformation.
  // OCP.OCP.gp.gp_GTrsf.SetTrsf (method)
  SetTrsf(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // IsNegative(self
  // Remarks: Returns true if the determinant of the vectorial part of this transformation is negative.
  // OCP.OCP.gp.gp_GTrsf.IsNegative (method)
  IsNegative(self: OCP.OCP.gp.gp_GTrsf) -> bool

  // IsSingular(self
  // Remarks: Returns true if this transformation is singular (and therefore, cannot be inverted). Note: The Gauss LU decomposition is used to invert the transformation matrix. Consequently, the transformation is considered as singular if the largest pivot found is less than or equal to gp::Resolution(). Warning If this transformation is singular, it cannot be inverted.
  // OCP.OCP.gp.gp_GTrsf.IsSingular (method)
  IsSingular(self: OCP.OCP.gp.gp_GTrsf) -> bool

  // Form(self
  // Remarks: Returns the nature of the transformation. It can be an identity transformation, a rotation, a translation, a mirror transformation (relative to a point, an axis or a plane), a scaling transformation, a compound transformation or some other type of transformation.
  // OCP.OCP.gp.gp_GTrsf.Form (method)
  Form(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_TrsfForm

  // SetForm(self
  // Remarks: verify and set the shape of the GTrsf Other or CompoundTrsf Ex :
  // OCP.OCP.gp.gp_GTrsf.SetForm (method)
  SetForm(self: OCP.OCP.gp.gp_GTrsf) -> None

  // Value(*args, **kwargs)
  // Remarks: Overloaded function. 1. Value(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int) -> float Returns the coefficients of the global matrix of transformation. Raises OutOfRange if theRow < 1 or theRow > 3 or theCol < 1 or theCol > 4 2. Value(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int) -> float Returns the coefficients of the global matrix of transformation. Raises OutOfRange if theRow < 1 or theRow > 3 or theCol < 1 or theCol > 4
  // OCP.OCP.gp.gp_GTrsf.Value (method)
  Value(*args, **kwargs)
  Value(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int) -> float
  Value(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int) -> float

  // Invert(self
  // OCP.OCP.gp.gp_GTrsf.Invert (method)
  Invert(self: OCP.OCP.gp.gp_GTrsf) -> None

  // Inverted(self
  // Remarks: Computes the reverse transformation. Raises an exception if the matrix of the transformation is not inversible.
  // OCP.OCP.gp.gp_GTrsf.Inverted (method)
  Inverted(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_GTrsf

  // Multiplied(self
  // Remarks: Computes the transformation composed from theT and <me>. In a C++ implementation you can also write Tcomposed = <me> * theT. Example :
  // OCP.OCP.gp.gp_GTrsf.Multiplied (method)
  Multiplied(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_GTrsf

  // Multiply(self
  // Remarks: Computes the transformation composed with <me> and theT. <me> = <me> * theT
  // OCP.OCP.gp.gp_GTrsf.Multiply (method)
  Multiply(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> None

  // PreMultiply(self
  // Remarks: Computes the product of the transformation theT and this transformation and assigns the result to this transformation. this = theT * this
  // OCP.OCP.gp.gp_GTrsf.PreMultiply (method)
  PreMultiply(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> None

  // Power(self
  // OCP.OCP.gp.gp_GTrsf.Power (method)
  Power(self: OCP.OCP.gp.gp_GTrsf, theN: int) -> None

  // Powered(self
  // Remarks: Computes: - the product of this transformation multiplied by itself theN times, if theN is positive, or - the product of the inverse of this transformation multiplied by itself |theN| times, if theN is negative. If theN equals zero, the result is equal to the Identity transformation. I.e.: <me> * <me> * .......* <me>, theN time. if theN =0 <me> = Identity if theN < 0 <me> = <me>.Inverse() *...........* <me>.Inverse().
  // OCP.OCP.gp.gp_GTrsf.Powered (method)
  Powered(self: OCP.OCP.gp.gp_GTrsf, theN: int) -> OCP.OCP.gp.gp_GTrsf

  // Transforms(*args, **kwargs)
  // Remarks: Overloaded function. 1. Transforms(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None 2. Transforms(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None 3. Transforms(self: OCP.OCP.gp.gp_GTrsf) -> tuple[float, float, float] Transforms a triplet XYZ with a GTrsf. 4. Transforms(self: OCP.OCP.gp.gp_GTrsf) -> tuple[float, float, float] Transforms a triplet XYZ with a GTrsf.
  // OCP.OCP.gp.gp_GTrsf.Transforms (method)
  Transforms(*args, **kwargs)
  Transforms(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_GTrsf) -> tuple[float, float, float]
  Transforms(self: OCP.OCP.gp.gp_GTrsf) -> tuple[float, float, float]

  // Trsf(*args, **kwargs)
  // Remarks: Overloaded function. 1. Trsf(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Trsf 2. Trsf(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Trsf
  // OCP.OCP.gp.gp_GTrsf.Trsf (method)
  Trsf(*args, **kwargs)
  Trsf(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Trsf
  Trsf(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Trsf

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.gp.gp_GTrsf.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_GTrsf, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // TranslationPart(self
  // Remarks: Returns the translation part of the GTrsf.
  // OCP.OCP.gp.gp_GTrsf.TranslationPart (method)
  TranslationPart(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_XYZ

  // VectorialPart(self
  // Remarks: Computes the vectorial part of the GTrsf. The returned Matrix is a 3*3 matrix.
  // OCP.OCP.gp.gp_GTrsf.VectorialPart (method)
  VectorialPart(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Mat
