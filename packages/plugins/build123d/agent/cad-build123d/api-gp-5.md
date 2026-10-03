# build123d — gp (5)

2 top-level symbols. Signatures are verbatim python.

// Category: gp
// Defines a 3D cartesian point
gp_Pnt

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_Pnt) -> None 2. __init__(self: OCP.OCP.gp.gp_Pnt, theCoord: OCP.OCP.gp.gp_XYZ) -> None 3. __init__(self: OCP.OCP.gp.gp_Pnt, theXp: float, theYp: float, theZp: float) -> None
  // OCP.OCP.gp.gp_Pnt.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Pnt) -> None
  __init__(self: OCP.OCP.gp.gp_Pnt, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Pnt, theXp: float, theYp: float, theZp: float) -> None

  // SetCoord(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetCoord(self: OCP.OCP.gp.gp_Pnt, theIndex: int, theXi: float) -> None Changes the coordinate of range theIndex : theIndex = 1 => X is modified theIndex = 2 => Y is modified theIndex = 3 => Z is modified Raised if theIndex != {1, 2, 3}. 2. SetCoord(self: OCP.OCP.gp.gp_Pnt, theXp: float, theYp: float, theZp: float) -> None For this point, assigns the values theXp, theYp and theZp to its three coordinates.
  // OCP.OCP.gp.gp_Pnt.SetCoord (method)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Pnt, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Pnt, theXp: float, theYp: float, theZp: float) -> None

  // SetX(self
  // Remarks: Assigns the given value to the X coordinate of this point.
  // OCP.OCP.gp.gp_Pnt.SetX (method)
  SetX(self: OCP.OCP.gp.gp_Pnt, theX: float) -> None

  // SetY(self
  // Remarks: Assigns the given value to the Y coordinate of this point.
  // OCP.OCP.gp.gp_Pnt.SetY (method)
  SetY(self: OCP.OCP.gp.gp_Pnt, theY: float) -> None

  // SetZ(self
  // Remarks: Assigns the given value to the Z coordinate of this point.
  // OCP.OCP.gp.gp_Pnt.SetZ (method)
  SetZ(self: OCP.OCP.gp.gp_Pnt, theZ: float) -> None

  // SetXYZ(self
  // Remarks: Assigns the three coordinates of theCoord to this point.
  // OCP.OCP.gp.gp_Pnt.SetXYZ (method)
  SetXYZ(self: OCP.OCP.gp.gp_Pnt, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  // Remarks: Overloaded function. 1. Coord(self: OCP.OCP.gp.gp_Pnt, theIndex: int) -> float Returns the coordinate of corresponding to the value of theIndex : theIndex = 1 => X is returned theIndex = 2 => Y is returned theIndex = 3 => Z is returned Raises OutOfRange if theIndex != {1, 2, 3}. Raised if theIndex != {1, 2, 3}. 2. Coord(self: OCP.OCP.gp.gp_Pnt) -> tuple[float, float, float] For this point gives its three coordinates theXp, theYp and theZp. 3. Coord(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ For this point, returns its three coordinates as a XYZ object.
  // OCP.OCP.gp.gp_Pnt.Coord (method)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Pnt, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Pnt) -> tuple[float, float, float]
  Coord(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

  // X(self
  // Remarks: For this point, returns its X coordinate.
  // OCP.OCP.gp.gp_Pnt.X (method)
  X(self: OCP.OCP.gp.gp_Pnt) -> float

  // Y(self
  // Remarks: For this point, returns its Y coordinate.
  // OCP.OCP.gp.gp_Pnt.Y (method)
  Y(self: OCP.OCP.gp.gp_Pnt) -> float

  // Z(self
  // Remarks: For this point, returns its Z coordinate.
  // OCP.OCP.gp.gp_Pnt.Z (method)
  Z(self: OCP.OCP.gp.gp_Pnt) -> float

  // BaryCenter(self
  // Remarks: Assigns the result of the following expression to this point (theAlpha*this + theBeta*theP) / (theAlpha + theBeta)
  // OCP.OCP.gp.gp_Pnt.BaryCenter (method)
  BaryCenter(self: OCP.OCP.gp.gp_Pnt, theAlpha: float, theP: OCP.OCP.gp.gp_Pnt, theBeta: float) -> None

  // IsEqual(self
  // Remarks: Comparison Returns True if the distance between the two points is lower or equal to theLinearTolerance.
  // OCP.OCP.gp.gp_Pnt.IsEqual (method)
  IsEqual(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool

  // Distance(*args, **kwargs)
  // Remarks: Overloaded function. 1. Distance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float Computes the distance between two points. 2. Distance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float Computes the distance between two points.
  // OCP.OCP.gp.gp_Pnt.Distance (method)
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float

  // SquareDistance(*args, **kwargs)
  // Remarks: Overloaded function. 1. SquareDistance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float Computes the square distance between two points. 2. SquareDistance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float Computes the square distance between two points.
  // OCP.OCP.gp.gp_Pnt.SquareDistance (method)
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float

  // Mirror(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirror(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt) -> None Performs the symmetrical transformation of a point with respect to the point theP which is the center of the symmetry. 2. Mirror(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1) -> None 3. Mirror(self: OCP.OCP.gp.gp_Pnt, theA2: OCP.OCP.gp.gp_Ax2) -> None
  // OCP.OCP.gp.gp_Pnt.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Pnt, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // Remarks: Overloaded function. 1. Mirrored(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pnt Performs the symmetrical transformation of a point with respect to an axis placement which is the axis of the symmetry. 2. Mirrored(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pnt Performs the symmetrical transformation of a point with respect to a plane. The axis placement theA2 locates the plane of the symmetry : (Location, XDirection, YDirection). 3. Mirrored(self: OCP.OCP.gp.gp_Pnt, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pnt Rotates a point. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
  // OCP.OCP.gp.gp_Pnt.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pnt
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pnt
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pnt

  // Rotate(*args, **kwargs)
  // Remarks: Overloaded function. 1. Rotate(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None 2. Rotate(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  // OCP.OCP.gp.gp_Pnt.Rotate (method)
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Pnt.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Pnt

  // Scale(*args, **kwargs)
  // Remarks: Overloaded function. 1. Scale(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None Scales a point. theS is the scaling value. 2. Scale(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None Scales a point. theS is the scaling value.
  // OCP.OCP.gp.gp_Pnt.Scale (method)
  Scale(*args, **kwargs)
  Scale(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None
  Scale(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Pnt.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Pnt

  // Transform(self
  // Remarks: Transforms a point with the transformation T.
  // OCP.OCP.gp.gp_Pnt.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Pnt, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Pnt.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Pnt, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Pnt

  // Translate(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translate(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> None Translates a point in the direction of the vector theV. The magnitude of the translation is the vector's magnitude. 2. Translate(self: OCP.OCP.gp.gp_Pnt, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None Translates a point from the point theP1 to the point theP2. 3. Translate(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> None Translates a point in the direction of the vector theV. The magnitude of the translation is the vector's magnitude.
  // OCP.OCP.gp.gp_Pnt.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Pnt, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  Translate(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> None

  // Translated(*args, **kwargs)
  // Remarks: Overloaded function. 1. Translated(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pnt 2. Translated(self: OCP.OCP.gp.gp_Pnt, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pnt 3. Translated(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pnt
  // OCP.OCP.gp.gp_Pnt.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pnt
  Translated(self: OCP.OCP.gp.gp_Pnt, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pnt
  Translated(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pnt

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.gp.gp_Pnt.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Pnt, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // Remarks: Inits the content of me from the stream
  // OCP.OCP.gp.gp_Pnt.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Pnt, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // XYZ(self
  // Remarks: For this point, returns its three coordinates as a XYZ object.
  // OCP.OCP.gp.gp_Pnt.XYZ (method)
  XYZ(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

  // ChangeCoord(self
  // Remarks: Returns the coordinates of this point. Note: This syntax allows direct modification of the returned value.
  // OCP.OCP.gp.gp_Pnt.ChangeCoord (method)
  ChangeCoord(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

// Category: gp
// Represents operation of rotation in 3d space as quaternion and implements operations with rotations basing on quaternion mathematics
gp_Quaternion

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.gp.gp_Quaternion) -> None 2. __init__(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None 3. __init__(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec) -> None 4. __init__(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec, theHelpCrossVec: OCP.OCP.gp.gp_Vec) -> None 5. __init__(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec, theAngle: float) -> None 6. __init__(self: OCP.OCP.gp.gp_Quaternion, theMat: OCP.OCP.gp.gp_Mat) -> None
  // OCP.OCP.gp.gp_Quaternion.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Quaternion) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec, theHelpCrossVec: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec, theAngle: float) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theMat: OCP.OCP.gp.gp_Mat) -> None

  // IsEqual(self
  // Remarks: Simple equal test without precision
  // OCP.OCP.gp.gp_Quaternion.IsEqual (method)
  IsEqual(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> bool

  // SetRotation(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetRotation(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec) -> None Sets quaternion to shortest-arc rotation producing vector theVecTo from vector theVecFrom. If vectors theVecFrom and theVecTo are opposite then rotation axis is computed as theVecFrom ^ (1,0,0) or theVecFrom ^ (0,0,1). 2. SetRotation(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec, theHelpCrossVec: OCP.OCP.gp.gp_Vec) -> None Sets quaternion to shortest-arc rotation producing vector theVecTo from vector theVecFrom. If vectors theVecFrom and theVecTo are opposite then rotation axis is computed as theVecFrom ^ theHelpCrossVec.
  // OCP.OCP.gp.gp_Quaternion.SetRotation (method)
  SetRotation(*args, **kwargs)
  SetRotation(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec) -> None
  SetRotation(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec, theHelpCrossVec: OCP.OCP.gp.gp_Vec) -> None

  // SetVectorAndAngle(self
  // Remarks: Create a unit quaternion from Axis+Angle representation
  // OCP.OCP.gp.gp_Quaternion.SetVectorAndAngle (method)
  SetVectorAndAngle(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec, theAngle: float) -> None

  // SetMatrix(self
  // Remarks: Create a unit quaternion by rotation matrix matrix must contain only rotation (not scale or shear)
  // OCP.OCP.gp.gp_Quaternion.SetMatrix (method)
  SetMatrix(self: OCP.OCP.gp.gp_Quaternion, theMat: OCP.OCP.gp.gp_Mat) -> None

  // GetMatrix(self
  // Remarks: Returns rotation operation as 3*3 matrix
  // OCP.OCP.gp.gp_Quaternion.GetMatrix (method)
  GetMatrix(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Mat

  // SetEulerAngles(self
  // Remarks: Create a unit quaternion representing rotation defined by generalized Euler angles
  // OCP.OCP.gp.gp_Quaternion.SetEulerAngles (method)
  SetEulerAngles(self: OCP.OCP.gp.gp_Quaternion, theOrder: OCP.OCP.gp.gp_EulerSequence, theAlpha: float, theBeta: float, theGamma: float) -> None

  // Set(*args, **kwargs)
  // Remarks: Overloaded function. 1. Set(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None 2. Set(self: OCP.OCP.gp.gp_Quaternion, theQuaternion: OCP.OCP.gp.gp_Quaternion) -> None 3. Set(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None 4. Set(self: OCP.OCP.gp.gp_Quaternion, theQuaternion: OCP.OCP.gp.gp_Quaternion) -> None
  // OCP.OCP.gp.gp_Quaternion.Set (method)
  Set(*args, **kwargs)
  Set(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None
  Set(self: OCP.OCP.gp.gp_Quaternion, theQuaternion: OCP.OCP.gp.gp_Quaternion) -> None
  Set(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None
  Set(self: OCP.OCP.gp.gp_Quaternion, theQuaternion: OCP.OCP.gp.gp_Quaternion) -> None

  // X(self
  // OCP.OCP.gp.gp_Quaternion.X (method)
  X(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Y(self
  // OCP.OCP.gp.gp_Quaternion.Y (method)
  Y(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Z(self
  // OCP.OCP.gp.gp_Quaternion.Z (method)
  Z(self: OCP.OCP.gp.gp_Quaternion) -> float

  // W(self
  // OCP.OCP.gp.gp_Quaternion.W (method)
  W(self: OCP.OCP.gp.gp_Quaternion) -> float

  // SetIdent(self
  // Remarks: Make identity quaternion (zero-rotation)
  // OCP.OCP.gp.gp_Quaternion.SetIdent (method)
  SetIdent(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Reverse(self
  // Remarks: Reverse direction of rotation (conjugate quaternion)
  // OCP.OCP.gp.gp_Quaternion.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Reversed(self
  // Remarks: Return rotation with reversed direction (conjugated quaternion)
  // OCP.OCP.gp.gp_Quaternion.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Invert(self
  // Remarks: Inverts quaternion (both rotation direction and norm)
  // OCP.OCP.gp.gp_Quaternion.Invert (method)
  Invert(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Inverted(self
  // Remarks: Return inversed quaternion q^-1
  // OCP.OCP.gp.gp_Quaternion.Inverted (method)
  Inverted(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // SquareNorm(self
  // Remarks: Returns square norm of quaternion
  // OCP.OCP.gp.gp_Quaternion.SquareNorm (method)
  SquareNorm(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Norm(self
  // Remarks: Returns norm of quaternion
  // OCP.OCP.gp.gp_Quaternion.Norm (method)
  Norm(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Scale(*args, **kwargs)
  // Remarks: Overloaded function. 1. Scale(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> None Scale all components by quaternion by theScale; note that rotation is not changed by this operation (except 0-scaling) 2. Scale(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> None Scale all components by quaternion by theScale; note that rotation is not changed by this operation (except 0-scaling)
  // OCP.OCP.gp.gp_Quaternion.Scale (method)
  Scale(*args, **kwargs)
  Scale(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> None
  Scale(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> None

  // Scaled(self
  // Remarks: Returns scaled quaternion
  // OCP.OCP.gp.gp_Quaternion.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> OCP.OCP.gp.gp_Quaternion

  // StabilizeLength(self
  // Remarks: Stabilize quaternion length within 1 - 1/4. This operation is a lot faster than normalization and preserve length goes to 0 or infinity
  // OCP.OCP.gp.gp_Quaternion.StabilizeLength (method)
  StabilizeLength(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Normalize(self
  // Remarks: Scale quaternion that its norm goes to 1. The appearing of 0 magnitude or near is a error, so we can be sure that can divide by magnitude
  // OCP.OCP.gp.gp_Quaternion.Normalize (method)
  Normalize(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Normalized(self
  // Remarks: Returns quaternion scaled so that its norm goes to 1.
  // OCP.OCP.gp.gp_Quaternion.Normalized (method)
  Normalized(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Negated(self
  // Remarks: Returns quaternion with all components negated. Note that this operation does not affect neither rotation operator defined by quaternion nor its norm.
  // OCP.OCP.gp.gp_Quaternion.Negated (method)
  Negated(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Added(self
  // Remarks: Makes sum of quaternion components; result is "rotations mix"
  // OCP.OCP.gp.gp_Quaternion.Added (method)
  Added(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Subtracted(self
  // Remarks: Makes difference of quaternion components; result is "rotations mix"
  // OCP.OCP.gp.gp_Quaternion.Subtracted (method)
  Subtracted(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Multiplied(*args, **kwargs)
  // Remarks: Overloaded function. 1. Multiplied(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion Multiply function - work the same as Matrices multiplying. Result is rotation combination: q' than q (here q=this, q'=theQ). Notices that: 2. Multiplied(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion Multiply function - work the same as Matrices multiplying. Result is rotation combination: q' than q (here q=this, q'=theQ). Notices that:
  // OCP.OCP.gp.gp_Quaternion.Multiplied (method)
  Multiplied(*args, **kwargs)
  Multiplied(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion
  Multiplied(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Add(*args, **kwargs)
  // Remarks: Overloaded function. 1. Add(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None Adds components of other quaternion; result is "rotations mix" 2. Add(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> None Adds components of other quaternion; result is "rotations mix"
  // OCP.OCP.gp.gp_Quaternion.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Add(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> None

  // Subtract(*args, **kwargs)
  // Remarks: Overloaded function. 1. Subtract(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None Subtracts components of other quaternion; result is "rotations mix" 2. Subtract(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> None Subtracts components of other quaternion; result is "rotations mix"
  // OCP.OCP.gp.gp_Quaternion.Subtract (method)
  Subtract(*args, **kwargs)
  Subtract(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Subtract(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> None

  // Multiply(*args, **kwargs)
  // Remarks: Overloaded function. 1. Multiply(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None Adds rotation by multiplication 2. Multiply(self: OCP.OCP.gp.gp_Quaternion, theVec: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec Rotates vector by quaternion as rotation operator
  // OCP.OCP.gp.gp_Quaternion.Multiply (method)
  Multiply(*args, **kwargs)
  Multiply(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Multiply(self: OCP.OCP.gp.gp_Quaternion, theVec: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Dot(self
  // Remarks: Computes inner product / scalar product / Dot
  // OCP.OCP.gp.gp_Quaternion.Dot (method)
  Dot(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> float

  // GetRotationAngle(self
  // Remarks: Return rotation angle from -PI to PI
  // OCP.OCP.gp.gp_Quaternion.GetRotationAngle (method)
  GetRotationAngle(self: OCP.OCP.gp.gp_Quaternion) -> float

  // GetVectorAndAngle(self
  // Remarks: Convert a quaternion to Axis+Angle representation, preserve the axis direction and angle from -PI to +PI
  // OCP.OCP.gp.gp_Quaternion.GetVectorAndAngle (method)
  GetVectorAndAngle(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec) -> tuple[float]

  // GetEulerAngles(self
  // Remarks: Returns Euler angles describing current rotation
  // OCP.OCP.gp.gp_Quaternion.GetEulerAngles (method)
  GetEulerAngles(self: OCP.OCP.gp.gp_Quaternion, theOrder: OCP.OCP.gp.gp_EulerSequence) -> tuple[float, float, float]
