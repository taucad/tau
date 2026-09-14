# build123d — gp (3)

3 top-level symbols. Signatures are verbatim python.

// Defines a non-persistent transformation in 3D space
gp_Trsf

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf2d) -> None

  // SetMirror(*args, **kwargs)
  SetMirror(*args, **kwargs)
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theA1: OCP.OCP.gp.gp_Ax1) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theA2: OCP.OCP.gp.gp_Ax2) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetRotation(*args, **kwargs)
  SetRotation(*args, **kwargs)
  SetRotation(self: OCP.OCP.gp.gp_Trsf, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  SetRotation(self: OCP.OCP.gp.gp_Trsf, theR: OCP.OCP.gp.gp_Quaternion) -> None

  // SetRotationPart(self
  SetRotationPart(self: OCP.OCP.gp.gp_Trsf, theR: OCP.OCP.gp.gp_Quaternion) -> None

  // SetScale(self
  SetScale(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // SetDisplacement(self
  SetDisplacement(self: OCP.OCP.gp.gp_Trsf, theFromSystem1: OCP.OCP.gp.gp_Ax3, theToSystem2: OCP.OCP.gp.gp_Ax3) -> None

  // SetTransformation(*args, **kwargs)
  SetTransformation(*args, **kwargs)
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, theFromSystem1: OCP.OCP.gp.gp_Ax3, theToSystem2: OCP.OCP.gp.gp_Ax3) -> None
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, theToSystem: OCP.OCP.gp.gp_Ax3) -> None
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, R: OCP.OCP.gp.gp_Quaternion, theT: OCP.OCP.gp.gp_Vec) -> None

  // SetTranslation(*args, **kwargs)
  SetTranslation(*args, **kwargs)
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // SetTranslationPart(self
  SetTranslationPart(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None

  // SetScaleFactor(self
  SetScaleFactor(self: OCP.OCP.gp.gp_Trsf, theS: float) -> None

  // SetForm(self
  SetForm(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_TrsfForm) -> None

  // SetValues(self
  SetValues(self: OCP.OCP.gp.gp_Trsf, a11: float, a12: float, a13: float, a14: float, a21: float, a22: float, a23: float, a24: float, a31: float, a32: float, a33: float, a34: float) -> None

  // IsNegative(self
  IsNegative(self: OCP.OCP.gp.gp_Trsf) -> bool

  // Form(self
  Form(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_TrsfForm

  // ScaleFactor(self
  ScaleFactor(self: OCP.OCP.gp.gp_Trsf) -> float

  // GetRotation(*args, **kwargs)
  GetRotation(*args, **kwargs)
  GetRotation(self: OCP.OCP.gp.gp_Trsf, theAxis: OCP.OCP.gp.gp_XYZ, theAngle: float) -> bool
  GetRotation(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Quaternion

  // VectorialPart(self
  VectorialPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Mat

  // Value(*args, **kwargs)
  Value(*args, **kwargs)
  Value(self: OCP.OCP.gp.gp_Trsf, theRow: int, theCol: int) -> float
  Value(self: OCP.OCP.gp.gp_Trsf, theRow: int, theCol: int) -> float

  // Invert(self
  Invert(self: OCP.OCP.gp.gp_Trsf) -> None

  // Inverted(self
  Inverted(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Trsf

  // Multiplied(self
  Multiplied(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Trsf

  // Multiply(self
  Multiply(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // PreMultiply(self
  PreMultiply(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Power(self
  Power(self: OCP.OCP.gp.gp_Trsf, theN: int) -> None

  // Powered(self
  Powered(self: OCP.OCP.gp.gp_Trsf, theN: int) -> OCP.OCP.gp.gp_Trsf

  // Transforms(*args, **kwargs)
  Transforms(*args, **kwargs)
  Transforms(self: OCP.OCP.gp.gp_Trsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_Trsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_Trsf) -> tuple[float, float, float]
  Transforms(self: OCP.OCP.gp.gp_Trsf) -> tuple[float, float, float]

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_Trsf, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  InitFromJson(self: OCP.OCP.gp.gp_Trsf, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // TranslationPart(self
  TranslationPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_XYZ

  // HVectorialPart(self
  HVectorialPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Mat

// Defines a non-persistent vector in 3D space
gp_Vec

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theXv: float, theYv: float, theZv: float) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // SetCoord(*args, **kwargs)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Vec, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Vec, theXv: float, theYv: float, theZv: float) -> None

  // SetX(self
  SetX(self: OCP.OCP.gp.gp_Vec, theX: float) -> None

  // SetY(self
  SetY(self: OCP.OCP.gp.gp_Vec, theY: float) -> None

  // SetZ(self
  SetZ(self: OCP.OCP.gp.gp_Vec, theZ: float) -> None

  // SetXYZ(self
  SetXYZ(self: OCP.OCP.gp.gp_Vec, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Vec, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Vec) -> tuple[float, float, float]

  // X(self
  X(self: OCP.OCP.gp.gp_Vec) -> float

  // Y(self
  Y(self: OCP.OCP.gp.gp_Vec) -> float

  // Z(self
  Z(self: OCP.OCP.gp.gp_Vec) -> float

  // IsEqual(self
  IsEqual(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // IsNormal(*args, **kwargs)
  IsNormal(*args, **kwargs)
  IsNormal(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool
  IsNormal(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // IsOpposite(self
  IsOpposite(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // IsParallel(self
  IsParallel(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // Angle(*args, **kwargs)
  Angle(*args, **kwargs)
  Angle(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float
  Angle(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float

  // AngleWithRef(*args, **kwargs)
  AngleWithRef(*args, **kwargs)
  AngleWithRef(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theVRef: OCP.OCP.gp.gp_Vec) -> float
  AngleWithRef(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theVRef: OCP.OCP.gp.gp_Vec) -> float

  // Magnitude(self
  Magnitude(self: OCP.OCP.gp.gp_Vec) -> float

  // SquareMagnitude(self
  SquareMagnitude(self: OCP.OCP.gp.gp_Vec) -> float

  // Add(self
  Add(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> None

  // Added(self
  Added(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Subtract(self
  Subtract(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> None

  // Subtracted(self
  Subtracted(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Multiply(self
  Multiply(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> None

  // Multiplied(self
  Multiplied(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> OCP.OCP.gp.gp_Vec

  // Divide(self
  Divide(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> None

  // Divided(self
  Divided(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> OCP.OCP.gp.gp_Vec

  // Cross(self
  Cross(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> None

  // Crossed(self
  Crossed(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // CrossMagnitude(self
  CrossMagnitude(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> float

  // CrossSquareMagnitude(self
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> float

  // CrossCross(self
  CrossCross(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None

  // CrossCrossed(self
  CrossCrossed(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Dot(self
  Dot(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float

  // DotCross(self
  DotCross(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> float

  // Normalize(self
  Normalize(self: OCP.OCP.gp.gp_Vec) -> None

  // Normalized(*args, **kwargs)
  Normalized(*args, **kwargs)
  Normalized(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec
  Normalized(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Reverse(self
  Reverse(self: OCP.OCP.gp.gp_Vec) -> None

  // Reversed(self
  Reversed(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // SetLinearForm(*args, **kwargs)
  SetLinearForm(*args, **kwargs)
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theA3: float, theV3: OCP.OCP.gp.gp_Vec, theV4: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theA3: float, theV3: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theV3: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None

  // Mirror(*args, **kwargs)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Vec) -> None
  Mirror(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Vec, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec
  Mirrored(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Vec
  Mirrored(self: OCP.OCP.gp.gp_Vec, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Vec

  // Rotate(*args, **kwargs)
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  Rotated(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Vec

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Vec, theS: float) -> None

  // Scaled(self
  Scaled(self: OCP.OCP.gp.gp_Vec, theS: float) -> OCP.OCP.gp.gp_Vec

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Vec, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  Transformed(self: OCP.OCP.gp.gp_Vec, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Vec

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_Vec, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // XYZ(self
  XYZ(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_XYZ

// This class describes a cartesian coordinate entity in 3D space {X,Y,Z}
gp_XYZ

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_XYZ, theX: float, theY: float, theZ: float) -> None

  // SetCoord(*args, **kwargs)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_XYZ, theX: float, theY: float, theZ: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_XYZ, theIndex: int, theXi: float) -> None

  // SetX(self
  SetX(self: OCP.OCP.gp.gp_XYZ, theX: float) -> None

  // SetY(self
  SetY(self: OCP.OCP.gp.gp_XYZ, theY: float) -> None

  // SetZ(self
  SetZ(self: OCP.OCP.gp.gp_XYZ, theZ: float) -> None

  // Coord(*args, **kwargs)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_XYZ, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_XYZ) -> tuple[float, float, float]

  // ChangeCoord(self
  ChangeCoord(self: OCP.OCP.gp.gp_XYZ, theIndex: int) -> float

  // GetData(self
  GetData(self: OCP.OCP.gp.gp_XYZ) -> float

  // ChangeData(self
  ChangeData(self: OCP.OCP.gp.gp_XYZ) -> float

  // X(self
  X(self: OCP.OCP.gp.gp_XYZ) -> float

  // Y(self
  Y(self: OCP.OCP.gp.gp_XYZ) -> float

  // Z(self
  Z(self: OCP.OCP.gp.gp_XYZ) -> float

  // Modulus(self
  Modulus(self: OCP.OCP.gp.gp_XYZ) -> float

  // SquareModulus(self
  SquareModulus(self: OCP.OCP.gp.gp_XYZ) -> float

  // IsEqual(self
  IsEqual(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ, theTolerance: float) -> bool

  // Add(self
  Add(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None

  // Added(self
  Added(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Cross(*args, **kwargs)
  Cross(*args, **kwargs)
  Cross(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None
  Cross(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> None

  // Crossed(self
  Crossed(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // CrossMagnitude(*args, **kwargs)
  CrossMagnitude(*args, **kwargs)
  CrossMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float
  CrossMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float

  // CrossSquareMagnitude(*args, **kwargs)
  CrossSquareMagnitude(*args, **kwargs)
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float

  // CrossCross(*args, **kwargs)
  CrossCross(*args, **kwargs)
  CrossCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> None
  CrossCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> None

  // CrossCrossed(self
  CrossCrossed(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Divide(self
  Divide(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> None

  // Divided(self
  Divided(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> OCP.OCP.gp.gp_XYZ

  // Dot(self
  Dot(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> float

  // DotCross(*args, **kwargs)
  DotCross(*args, **kwargs)
  DotCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> float
  DotCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> float

  // Multiply(*args, **kwargs)
  Multiply(*args, **kwargs)
  Multiply(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> None

  // Multiplied(*args, **kwargs)
  Multiplied(*args, **kwargs)
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> OCP.OCP.gp.gp_XYZ
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> OCP.OCP.gp.gp_XYZ

  // Normalize(*args, **kwargs)
  Normalize(*args, **kwargs)
  Normalize(self: OCP.OCP.gp.gp_XYZ) -> None
  Normalize(self: OCP.OCP.gp.gp_XYZ) -> None

  // Normalized(self
  Normalized(self: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Reverse(self
  Reverse(self: OCP.OCP.gp.gp_XYZ) -> None

  // Reversed(self
  Reversed(self: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Subtract(self
  Subtract(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None

  // Subtracted(self
  Subtracted(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // SetLinearForm(*args, **kwargs)
  SetLinearForm(*args, **kwargs)
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theA3: float, theXYZ3: OCP.OCP.gp.gp_XYZ, theXYZ4: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theA3: float, theXYZ3: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theXYZ3: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theXYZ1: OCP.OCP.gp.gp_XYZ, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_XYZ, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  InitFromJson(self: OCP.OCP.gp.gp_XYZ, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool
