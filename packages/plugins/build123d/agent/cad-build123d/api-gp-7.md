# build123d — gp (7)

1 top-level symbols. Signatures are verbatim python.

// Category: gp
// Defines a non-persistent vector in 3D space
gp_Vec

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function.

1. __init__(self: OCP.OCP.gp.gp_Vec) -> None

2. __init__(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Dir) -> None

3. __init__(self: OCP.OCP.gp.gp_Vec, theCoord: OCP.OCP.gp.gp_XYZ) -> None

4. __init__(self: OCP.OCP.gp.gp_Vec, theXv: float, theYv: float, theZv: float) -> None

5. __init__(self: OCP.OCP.gp.gp_Vec, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theXv: float, theYv: float, theZv: float) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // SetCoord(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetCoord(self: OCP.OCP.gp.gp_Vec, theIndex: int, theXi: float) -> None

Changes the coordinate of range theIndex theIndex = 1 => X is modified theIndex = 2 => Y is modified theIndex = 3 => Z is modified Raised if theIndex != {1, 2, 3}.

2. SetCoord(self: OCP.OCP.gp.gp_Vec, theXv: float, theYv: float, theZv: float) -> None

For this vector, assigns - the values theXv, theYv and theZv to its three coordinates.
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Vec, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Vec, theXv: float, theYv: float, theZv: float) -> None

  // SetX(self
  // Remarks: Assigns the given value to the X coordinate of this vector.
  SetX(self: OCP.OCP.gp.gp_Vec, theX: float) -> None

  // SetY(self
  // Remarks: Assigns the given value to the X coordinate of this vector.
  SetY(self: OCP.OCP.gp.gp_Vec, theY: float) -> None

  // SetZ(self
  // Remarks: Assigns the given value to the X coordinate of this vector.
  SetZ(self: OCP.OCP.gp.gp_Vec, theZ: float) -> None

  // SetXYZ(self
  // Remarks: Assigns the three coordinates of theCoord to this vector.
  SetXYZ(self: OCP.OCP.gp.gp_Vec, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  // Remarks: Overloaded function.

1. Coord(self: OCP.OCP.gp.gp_Vec, theIndex: int) -> float

Returns the coordinate of range theIndex : theIndex = 1 => X is returned theIndex = 2 => Y is returned theIndex = 3 => Z is returned Raised if theIndex != {1, 2, 3}.

2. Coord(self: OCP.OCP.gp.gp_Vec) -> tuple[float, float, float]

For this vector returns its three coordinates theXv, theYv, and theZv inline
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Vec, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Vec) -> tuple[float, float, float]

  // X(self
  // Remarks: For this vector, returns its X coordinate.
  X(self: OCP.OCP.gp.gp_Vec) -> float

  // Y(self
  // Remarks: For this vector, returns its Y coordinate.
  Y(self: OCP.OCP.gp.gp_Vec) -> float

  // Z(self
  // Remarks: For this vector, returns its Z coordinate.
  Z(self: OCP.OCP.gp.gp_Vec) -> float

  // IsEqual(self
  // Remarks: Returns True if the two vectors have the same magnitude value and the same direction. The precision values are theLinearTolerance for the magnitude and theAngularTolerance for the direction.
  IsEqual(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // IsNormal(*args, **kwargs)
  // Remarks: Overloaded function.

1. IsNormal(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

Returns True if abs(<me>.Angle(theOther) - PI/2.) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.Magnitude() <= Resolution or theOther.Magnitude() <= Resolution from gp

2. IsNormal(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

Returns True if abs(<me>.Angle(theOther) - PI/2.) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.Magnitude() <= Resolution or theOther.Magnitude() <= Resolution from gp
  IsNormal(*args, **kwargs)
  IsNormal(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool
  IsNormal(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // IsOpposite(self
  // Remarks: Returns True if PI - <me>.Angle(theOther) <= theAngularTolerance Raises VectorWithNullMagnitude if <me>.Magnitude() <= Resolution or Other.Magnitude() <= Resolution from gp
  IsOpposite(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // IsParallel(self
  // Remarks: Returns True if Angle(<me>, theOther) <= theAngularTolerance or PI - Angle(<me>, theOther) <= theAngularTolerance This definition means that two parallel vectors cannot define a plane but two vectors with opposite directions are considered as parallel. Raises VectorWithNullMagnitude if <me>.Magnitude() <= Resolution or Other.Magnitude() <= Resolution from gp
  IsParallel(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // Angle(*args, **kwargs)
  // Remarks: Overloaded function.

1. Angle(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float

Computes the angular value between <me> and <theOther> Returns the angle value between 0 and PI in radian. Raises VectorWithNullMagnitude if <me>.Magnitude() <= Resolution from gp or theOther.Magnitude() <= Resolution because the angular value is indefinite if one of the vectors has a null magnitude.

2. Angle(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float

Computes the angular value between <me> and <theOther> Returns the angle value between 0 and PI in radian. Raises VectorWithNullMagnitude if <me>.Magnitude() <= Resolution from gp or theOther.Magnitude() <= Resolution because the angular value is indefinite if one of the vectors has a null magnitude.
  Angle(*args, **kwargs)
  Angle(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float
  Angle(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float

  // AngleWithRef(*args, **kwargs)
  // Remarks: Overloaded function.

1. AngleWithRef(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theVRef: OCP.OCP.gp.gp_Vec) -> float

Computes the angle, in radians, between this vector and vector theOther. The result is a value between -Pi and Pi. For this, theVRef defines the positive sense of rotation: the angular value is positive, if the cross product this ^ theOther has the same orientation as theVRef relative to the plane defined by the vectors this and theOther. Otherwise, the angular value is negative. Exceptions gp_VectorWithNullMagnitude if the magnitude of this vector, the vector theOther, or the vector theVRef is less than or equal to gp::Resolution(). Standard_DomainError if this vector, the vector theOther, and the vector theVRef are coplanar, unless this vector and the vector theOther are parallel.

2. AngleWithRef(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theVRef: OCP.OCP.gp.gp_Vec) -> float

Computes the angle, in radians, between this vector and vector theOther. The result is a value between -Pi and Pi. For this, theVRef defines the positive sense of rotation: the angular value is positive, if the cross product this ^ theOther has the same orientation as theVRef relative to the plane defined by the vectors this and theOther. Otherwise, the angular value is negative. Exceptions gp_VectorWithNullMagnitude if the magnitude of this vector, the vector theOther, or the vector theVRef is less than or equal to gp::Resolution(). Standard_DomainError if this vector, the vector theOther, and the vector theVRef are coplanar, unless this vector and the vector theOther are parallel.
  AngleWithRef(*args, **kwargs)
  AngleWithRef(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theVRef: OCP.OCP.gp.gp_Vec) -> float
  AngleWithRef(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theVRef: OCP.OCP.gp.gp_Vec) -> float

  // Magnitude(self
  // Remarks: Computes the magnitude of this vector.
  Magnitude(self: OCP.OCP.gp.gp_Vec) -> float

  // SquareMagnitude(self
  // Remarks: Computes the square magnitude of this vector.
  SquareMagnitude(self: OCP.OCP.gp.gp_Vec) -> float

  // Add(self
  // Remarks: Adds two vectors
  Add(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> None

  // Added(self
  // Remarks: Adds two vectors
  Added(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Subtract(self
  // Remarks: Subtracts two vectors
  Subtract(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> None

  // Subtracted(self
  // Remarks: Subtracts two vectors
  Subtracted(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Multiply(self
  // Remarks: Multiplies a vector by a scalar
  Multiply(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> None

  // Multiplied(self
  // Remarks: Multiplies a vector by a scalar
  Multiplied(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> OCP.OCP.gp.gp_Vec

  // Divide(self
  // Remarks: Divides a vector by a scalar
  Divide(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> None

  // Divided(self
  // Remarks: Divides a vector by a scalar
  Divided(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> OCP.OCP.gp.gp_Vec

  // Cross(self
  // Remarks: computes the cross product between two vectors
  Cross(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> None

  // Crossed(self
  // Remarks: computes the cross product between two vectors
  Crossed(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // CrossMagnitude(self
  // Remarks: Computes the magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||
  CrossMagnitude(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> float

  // CrossSquareMagnitude(self
  // Remarks: Computes the square magnitude of the cross product between <me> and theRight. Returns || <me> ^ theRight ||**2
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> float

  // CrossCross(self
  // Remarks: Computes the triple vector product. <me> ^= (theV1 ^ theV2)
  CrossCross(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None

  // CrossCrossed(self
  // Remarks: Computes the triple vector product. <me> ^ (theV1 ^ theV2)
  CrossCrossed(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Dot(self
  // Remarks: computes the scalar product
  Dot(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float

  // DotCross(self
  // Remarks: Computes the triple scalar product <me> * (theV1 ^ theV2).
  DotCross(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> float

  // Normalize(self
  // Remarks: normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from gp.
  Normalize(self: OCP.OCP.gp.gp_Vec) -> None

  // Normalized(*args, **kwargs)
  // Remarks: Overloaded function.

1. Normalized(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from gp.

2. Normalized(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

normalizes a vector Raises an exception if the magnitude of the vector is lower or equal to Resolution from gp.
  Normalized(*args, **kwargs)
  Normalized(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec
  Normalized(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Reverse(self
  // Remarks: Reverses the direction of a vector
  Reverse(self: OCP.OCP.gp.gp_Vec) -> None

  // Reversed(self
  // Remarks: Reverses the direction of a vector
  Reversed(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // SetLinearForm(*args, **kwargs)
  // Remarks: Overloaded function.

1. SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theA3: float, theV3: OCP.OCP.gp.gp_Vec, theV4: OCP.OCP.gp.gp_Vec) -> None

<me> is set to the following linear form : theA1 * theV1 + theA2 * theV2 + theA3 * theV3 + theV4

2. SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theA3: float, theV3: OCP.OCP.gp.gp_Vec) -> None

<me> is set to the following linear form : theA1 * theV1 + theA2 * theV2 + theA3 * theV3

3. SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theV3: OCP.OCP.gp.gp_Vec) -> None

<me> is set to the following linear form : theA1 * theV1 + theA2 * theV2 + theV3

4. SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec) -> None

<me> is set to the following linear form : theA1 * theV1 + theA2 * theV2

5. SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None

<me> is set to the following linear form : theA1 * theV1 + theV2

6. SetLinearForm(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None

<me> is set to the following linear form : theV1 + theV2
  SetLinearForm(*args, **kwargs)
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theA3: float, theV3: OCP.OCP.gp.gp_Vec, theV4: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theA3: float, theV3: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theV3: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None

  // Mirror(*args, **kwargs)
  // Remarks: Overloaded function.

1. Mirror(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Vec) -> None

2. Mirror(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1) -> None

3. Mirror(self: OCP.OCP.gp.gp_Vec, theA2: OCP.OCP.gp.gp_Ax2) -> None
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Vec) -> None
  Mirror(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Vec, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // Remarks: Overloaded function.

1. Mirrored(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

Performs the symmetrical transformation of a vector with respect to the vector theV which is the center of the symmetry.

2. Mirrored(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Vec

Performs the symmetrical transformation of a vector with respect to an axis placement which is the axis of the symmetry.

3. Mirrored(self: OCP.OCP.gp.gp_Vec, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Vec

Performs the symmetrical transformation of a vector with respect to a plane. The axis placement theA2 locates the plane of the symmetry : (Location, XDirection, YDirection).
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec
  Mirrored(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Vec
  Mirrored(self: OCP.OCP.gp.gp_Vec, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Vec

  // Rotate(*args, **kwargs)
  // Remarks: Overloaded function.

1. Rotate(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

2. Rotate(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // Remarks: Rotates a vector. theA1 is the axis of the rotation. theAng is the angular value of the rotation in radians.
  Rotated(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Vec

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Vec, theS: float) -> None

  // Scaled(self
  // Remarks: Scales a vector. theS is the scaling value.
  Scaled(self: OCP.OCP.gp.gp_Vec, theS: float) -> OCP.OCP.gp.gp_Vec

  // Transform(self
  // Remarks: Transforms a vector with the transformation theT.
  Transform(self: OCP.OCP.gp.gp_Vec, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // Remarks: Transforms a vector with the transformation theT.
  Transformed(self: OCP.OCP.gp.gp_Vec, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Vec

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  DumpJson(self: OCP.OCP.gp.gp_Vec, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // XYZ(self
  // Remarks: For this vector, returns - its three coordinates as a number triple
  XYZ(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_XYZ
