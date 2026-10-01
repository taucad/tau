# build123d — gp (3)

3 top-level symbols. Signatures are verbatim python.

// Defines a non-persistent transformation in 3D space
gp_Trsf

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Trsf.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf2d) -> None

  // SetMirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Trsf.SetMirror (method)
  SetMirror(*args, **kwargs)
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theA1: OCP.OCP.gp.gp_Ax1) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theA2: OCP.OCP.gp.gp_Ax2) -> None
  SetMirror(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetRotation(*args, **kwargs)
  // OCP.OCP.gp.gp_Trsf.SetRotation (method)
  SetRotation(*args, **kwargs)
  SetRotation(self: OCP.OCP.gp.gp_Trsf, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  SetRotation(self: OCP.OCP.gp.gp_Trsf, theR: OCP.OCP.gp.gp_Quaternion) -> None

  // SetRotationPart(self
  // OCP.OCP.gp.gp_Trsf.SetRotationPart (method)
  SetRotationPart(self: OCP.OCP.gp.gp_Trsf, theR: OCP.OCP.gp.gp_Quaternion) -> None

  // SetScale(self
  // OCP.OCP.gp.gp_Trsf.SetScale (method)
  SetScale(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // SetDisplacement(self
  // OCP.OCP.gp.gp_Trsf.SetDisplacement (method)
  SetDisplacement(self: OCP.OCP.gp.gp_Trsf, theFromSystem1: OCP.OCP.gp.gp_Ax3, theToSystem2: OCP.OCP.gp.gp_Ax3) -> None

  // SetTransformation(*args, **kwargs)
  // OCP.OCP.gp.gp_Trsf.SetTransformation (method)
  SetTransformation(*args, **kwargs)
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, theFromSystem1: OCP.OCP.gp.gp_Ax3, theToSystem2: OCP.OCP.gp.gp_Ax3) -> None
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, theToSystem: OCP.OCP.gp.gp_Ax3) -> None
  SetTransformation(self: OCP.OCP.gp.gp_Trsf, R: OCP.OCP.gp.gp_Quaternion, theT: OCP.OCP.gp.gp_Vec) -> None

  // SetTranslation(*args, **kwargs)
  // OCP.OCP.gp.gp_Trsf.SetTranslation (method)
  SetTranslation(*args, **kwargs)
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None
  SetTranslation(self: OCP.OCP.gp.gp_Trsf, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // SetTranslationPart(self
  // OCP.OCP.gp.gp_Trsf.SetTranslationPart (method)
  SetTranslationPart(self: OCP.OCP.gp.gp_Trsf, theV: OCP.OCP.gp.gp_Vec) -> None

  // SetScaleFactor(self
  // OCP.OCP.gp.gp_Trsf.SetScaleFactor (method)
  SetScaleFactor(self: OCP.OCP.gp.gp_Trsf, theS: float) -> None

  // SetForm(self
  // OCP.OCP.gp.gp_Trsf.SetForm (method)
  SetForm(self: OCP.OCP.gp.gp_Trsf, theP: OCP.OCP.gp.gp_TrsfForm) -> None

  // SetValues(self
  // OCP.OCP.gp.gp_Trsf.SetValues (method)
  SetValues(self: OCP.OCP.gp.gp_Trsf, a11: float, a12: float, a13: float, a14: float, a21: float, a22: float, a23: float, a24: float, a31: float, a32: float, a33: float, a34: float) -> None

  // IsNegative(self
  // OCP.OCP.gp.gp_Trsf.IsNegative (method)
  IsNegative(self: OCP.OCP.gp.gp_Trsf) -> bool

  // Form(self
  // OCP.OCP.gp.gp_Trsf.Form (method)
  Form(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_TrsfForm

  // ScaleFactor(self
  // OCP.OCP.gp.gp_Trsf.ScaleFactor (method)
  ScaleFactor(self: OCP.OCP.gp.gp_Trsf) -> float

  // GetRotation(*args, **kwargs)
  // OCP.OCP.gp.gp_Trsf.GetRotation (method)
  GetRotation(*args, **kwargs)
  GetRotation(self: OCP.OCP.gp.gp_Trsf, theAxis: OCP.OCP.gp.gp_XYZ, theAngle: float) -> bool
  GetRotation(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Quaternion

  // VectorialPart(self
  // OCP.OCP.gp.gp_Trsf.VectorialPart (method)
  VectorialPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Mat

  // Value(*args, **kwargs)
  // OCP.OCP.gp.gp_Trsf.Value (method)
  Value(*args, **kwargs)
  Value(self: OCP.OCP.gp.gp_Trsf, theRow: int, theCol: int) -> float
  Value(self: OCP.OCP.gp.gp_Trsf, theRow: int, theCol: int) -> float

  // Invert(self
  // OCP.OCP.gp.gp_Trsf.Invert (method)
  Invert(self: OCP.OCP.gp.gp_Trsf) -> None

  // Inverted(self
  // OCP.OCP.gp.gp_Trsf.Inverted (method)
  Inverted(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Trsf

  // Multiplied(self
  // OCP.OCP.gp.gp_Trsf.Multiplied (method)
  Multiplied(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Trsf

  // Multiply(self
  // OCP.OCP.gp.gp_Trsf.Multiply (method)
  Multiply(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // PreMultiply(self
  // OCP.OCP.gp.gp_Trsf.PreMultiply (method)
  PreMultiply(self: OCP.OCP.gp.gp_Trsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Power(self
  // OCP.OCP.gp.gp_Trsf.Power (method)
  Power(self: OCP.OCP.gp.gp_Trsf, theN: int) -> None

  // Powered(self
  // OCP.OCP.gp.gp_Trsf.Powered (method)
  Powered(self: OCP.OCP.gp.gp_Trsf, theN: int) -> OCP.OCP.gp.gp_Trsf

  // Transforms(*args, **kwargs)
  // OCP.OCP.gp.gp_Trsf.Transforms (method)
  Transforms(*args, **kwargs)
  Transforms(self: OCP.OCP.gp.gp_Trsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_Trsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_Trsf) -> tuple[float, float, float]
  Transforms(self: OCP.OCP.gp.gp_Trsf) -> tuple[float, float, float]

  // DumpJson(self
  // OCP.OCP.gp.gp_Trsf.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Trsf, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.gp.gp_Trsf.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Trsf, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // TranslationPart(self
  // OCP.OCP.gp.gp_Trsf.TranslationPart (method)
  TranslationPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_XYZ

  // HVectorialPart(self
  // OCP.OCP.gp.gp_Trsf.HVectorialPart (method)
  HVectorialPart(self: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Mat

// Defines a non-persistent vector in 3D space
gp_Vec

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theXv: float, theYv: float, theZv: float) -> None
  __init__(self: OCP.OCP.gp.gp_Vec, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // SetCoord(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.SetCoord (method)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Vec, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Vec, theXv: float, theYv: float, theZv: float) -> None

  // SetX(self
  // OCP.OCP.gp.gp_Vec.SetX (method)
  SetX(self: OCP.OCP.gp.gp_Vec, theX: float) -> None

  // SetY(self
  // OCP.OCP.gp.gp_Vec.SetY (method)
  SetY(self: OCP.OCP.gp.gp_Vec, theY: float) -> None

  // SetZ(self
  // OCP.OCP.gp.gp_Vec.SetZ (method)
  SetZ(self: OCP.OCP.gp.gp_Vec, theZ: float) -> None

  // SetXYZ(self
  // OCP.OCP.gp.gp_Vec.SetXYZ (method)
  SetXYZ(self: OCP.OCP.gp.gp_Vec, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.Coord (method)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Vec, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Vec) -> tuple[float, float, float]

  // X(self
  // OCP.OCP.gp.gp_Vec.X (method)
  X(self: OCP.OCP.gp.gp_Vec) -> float

  // Y(self
  // OCP.OCP.gp.gp_Vec.Y (method)
  Y(self: OCP.OCP.gp.gp_Vec) -> float

  // Z(self
  // OCP.OCP.gp.gp_Vec.Z (method)
  Z(self: OCP.OCP.gp.gp_Vec) -> float

  // IsEqual(self
  // OCP.OCP.gp.gp_Vec.IsEqual (method)
  IsEqual(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // IsNormal(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.IsNormal (method)
  IsNormal(*args, **kwargs)
  IsNormal(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool
  IsNormal(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // IsOpposite(self
  // OCP.OCP.gp.gp_Vec.IsOpposite (method)
  IsOpposite(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // IsParallel(self
  // OCP.OCP.gp.gp_Vec.IsParallel (method)
  IsParallel(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theAngularTolerance: float) -> bool

  // Angle(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.Angle (method)
  Angle(*args, **kwargs)
  Angle(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float
  Angle(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float

  // AngleWithRef(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.AngleWithRef (method)
  AngleWithRef(*args, **kwargs)
  AngleWithRef(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theVRef: OCP.OCP.gp.gp_Vec) -> float
  AngleWithRef(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec, theVRef: OCP.OCP.gp.gp_Vec) -> float

  // Magnitude(self
  // OCP.OCP.gp.gp_Vec.Magnitude (method)
  Magnitude(self: OCP.OCP.gp.gp_Vec) -> float

  // SquareMagnitude(self
  // OCP.OCP.gp.gp_Vec.SquareMagnitude (method)
  SquareMagnitude(self: OCP.OCP.gp.gp_Vec) -> float

  // Add(self
  // OCP.OCP.gp.gp_Vec.Add (method)
  Add(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> None

  // Added(self
  // OCP.OCP.gp.gp_Vec.Added (method)
  Added(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Subtract(self
  // OCP.OCP.gp.gp_Vec.Subtract (method)
  Subtract(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> None

  // Subtracted(self
  // OCP.OCP.gp.gp_Vec.Subtracted (method)
  Subtracted(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Multiply(self
  // OCP.OCP.gp.gp_Vec.Multiply (method)
  Multiply(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> None

  // Multiplied(self
  // OCP.OCP.gp.gp_Vec.Multiplied (method)
  Multiplied(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> OCP.OCP.gp.gp_Vec

  // Divide(self
  // OCP.OCP.gp.gp_Vec.Divide (method)
  Divide(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> None

  // Divided(self
  // OCP.OCP.gp.gp_Vec.Divided (method)
  Divided(self: OCP.OCP.gp.gp_Vec, theScalar: float) -> OCP.OCP.gp.gp_Vec

  // Cross(self
  // OCP.OCP.gp.gp_Vec.Cross (method)
  Cross(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> None

  // Crossed(self
  // OCP.OCP.gp.gp_Vec.Crossed (method)
  Crossed(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // CrossMagnitude(self
  // OCP.OCP.gp.gp_Vec.CrossMagnitude (method)
  CrossMagnitude(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> float

  // CrossSquareMagnitude(self
  // OCP.OCP.gp.gp_Vec.CrossSquareMagnitude (method)
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_Vec, theRight: OCP.OCP.gp.gp_Vec) -> float

  // CrossCross(self
  // OCP.OCP.gp.gp_Vec.CrossCross (method)
  CrossCross(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None

  // CrossCrossed(self
  // OCP.OCP.gp.gp_Vec.CrossCrossed (method)
  CrossCrossed(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Dot(self
  // OCP.OCP.gp.gp_Vec.Dot (method)
  Dot(self: OCP.OCP.gp.gp_Vec, theOther: OCP.OCP.gp.gp_Vec) -> float

  // DotCross(self
  // OCP.OCP.gp.gp_Vec.DotCross (method)
  DotCross(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> float

  // Normalize(self
  // OCP.OCP.gp.gp_Vec.Normalize (method)
  Normalize(self: OCP.OCP.gp.gp_Vec) -> None

  // Normalized(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.Normalized (method)
  Normalized(*args, **kwargs)
  Normalized(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec
  Normalized(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Reverse(self
  // OCP.OCP.gp.gp_Vec.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_Vec) -> None

  // Reversed(self
  // OCP.OCP.gp.gp_Vec.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // SetLinearForm(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.SetLinearForm (method)
  SetLinearForm(*args, **kwargs)
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theA3: float, theV3: OCP.OCP.gp.gp_Vec, theV4: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theA3: float, theV3: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec, theV3: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theA2: float, theV2: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theA1: float, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_Vec, theV1: OCP.OCP.gp.gp_Vec, theV2: OCP.OCP.gp.gp_Vec) -> None

  // Mirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Vec) -> None
  Mirror(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Vec, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Vec, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec
  Mirrored(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Vec
  Mirrored(self: OCP.OCP.gp.gp_Vec, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Vec

  // Rotate(*args, **kwargs)
  // OCP.OCP.gp.gp_Vec.Rotate (method)
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Vec.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Vec, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Vec

  // Scale(self
  // OCP.OCP.gp.gp_Vec.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Vec, theS: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Vec.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Vec, theS: float) -> OCP.OCP.gp.gp_Vec

  // Transform(self
  // OCP.OCP.gp.gp_Vec.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Vec, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Vec.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Vec, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Vec

  // DumpJson(self
  // OCP.OCP.gp.gp_Vec.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Vec, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // XYZ(self
  // OCP.OCP.gp.gp_Vec.XYZ (method)
  XYZ(self: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_XYZ

// This class describes a cartesian coordinate entity in 3D space {X,Y,Z}
gp_XYZ

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_XYZ, theX: float, theY: float, theZ: float) -> None

  // SetCoord(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.SetCoord (method)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_XYZ, theX: float, theY: float, theZ: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_XYZ, theIndex: int, theXi: float) -> None

  // SetX(self
  // OCP.OCP.gp.gp_XYZ.SetX (method)
  SetX(self: OCP.OCP.gp.gp_XYZ, theX: float) -> None

  // SetY(self
  // OCP.OCP.gp.gp_XYZ.SetY (method)
  SetY(self: OCP.OCP.gp.gp_XYZ, theY: float) -> None

  // SetZ(self
  // OCP.OCP.gp.gp_XYZ.SetZ (method)
  SetZ(self: OCP.OCP.gp.gp_XYZ, theZ: float) -> None

  // Coord(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.Coord (method)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_XYZ, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_XYZ) -> tuple[float, float, float]

  // ChangeCoord(self
  // OCP.OCP.gp.gp_XYZ.ChangeCoord (method)
  ChangeCoord(self: OCP.OCP.gp.gp_XYZ, theIndex: int) -> float

  // GetData(self
  // OCP.OCP.gp.gp_XYZ.GetData (method)
  GetData(self: OCP.OCP.gp.gp_XYZ) -> float

  // ChangeData(self
  // OCP.OCP.gp.gp_XYZ.ChangeData (method)
  ChangeData(self: OCP.OCP.gp.gp_XYZ) -> float

  // X(self
  // OCP.OCP.gp.gp_XYZ.X (method)
  X(self: OCP.OCP.gp.gp_XYZ) -> float

  // Y(self
  // OCP.OCP.gp.gp_XYZ.Y (method)
  Y(self: OCP.OCP.gp.gp_XYZ) -> float

  // Z(self
  // OCP.OCP.gp.gp_XYZ.Z (method)
  Z(self: OCP.OCP.gp.gp_XYZ) -> float

  // Modulus(self
  // OCP.OCP.gp.gp_XYZ.Modulus (method)
  Modulus(self: OCP.OCP.gp.gp_XYZ) -> float

  // SquareModulus(self
  // OCP.OCP.gp.gp_XYZ.SquareModulus (method)
  SquareModulus(self: OCP.OCP.gp.gp_XYZ) -> float

  // IsEqual(self
  // OCP.OCP.gp.gp_XYZ.IsEqual (method)
  IsEqual(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ, theTolerance: float) -> bool

  // Add(self
  // OCP.OCP.gp.gp_XYZ.Add (method)
  Add(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None

  // Added(self
  // OCP.OCP.gp.gp_XYZ.Added (method)
  Added(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Cross(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.Cross (method)
  Cross(*args, **kwargs)
  Cross(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None
  Cross(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> None

  // Crossed(self
  // OCP.OCP.gp.gp_XYZ.Crossed (method)
  Crossed(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // CrossMagnitude(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.CrossMagnitude (method)
  CrossMagnitude(*args, **kwargs)
  CrossMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float
  CrossMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float

  // CrossSquareMagnitude(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.CrossSquareMagnitude (method)
  CrossSquareMagnitude(*args, **kwargs)
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float
  CrossSquareMagnitude(self: OCP.OCP.gp.gp_XYZ, theRight: OCP.OCP.gp.gp_XYZ) -> float

  // CrossCross(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.CrossCross (method)
  CrossCross(*args, **kwargs)
  CrossCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> None
  CrossCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> None

  // CrossCrossed(self
  // OCP.OCP.gp.gp_XYZ.CrossCrossed (method)
  CrossCrossed(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Divide(self
  // OCP.OCP.gp.gp_XYZ.Divide (method)
  Divide(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> None

  // Divided(self
  // OCP.OCP.gp.gp_XYZ.Divided (method)
  Divided(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> OCP.OCP.gp.gp_XYZ

  // Dot(self
  // OCP.OCP.gp.gp_XYZ.Dot (method)
  Dot(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> float

  // DotCross(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.DotCross (method)
  DotCross(*args, **kwargs)
  DotCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> float
  DotCross(self: OCP.OCP.gp.gp_XYZ, theCoord1: OCP.OCP.gp.gp_XYZ, theCoord2: OCP.OCP.gp.gp_XYZ) -> float

  // Multiply(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.Multiply (method)
  Multiply(*args, **kwargs)
  Multiply(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> None
  Multiply(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> None

  // Multiplied(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.Multiplied (method)
  Multiplied(*args, **kwargs)
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theScalar: float) -> OCP.OCP.gp.gp_XYZ
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ
  Multiplied(self: OCP.OCP.gp.gp_XYZ, theMatrix: OCP.OCP.gp.gp_Mat) -> OCP.OCP.gp.gp_XYZ

  // Normalize(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.Normalize (method)
  Normalize(*args, **kwargs)
  Normalize(self: OCP.OCP.gp.gp_XYZ) -> None
  Normalize(self: OCP.OCP.gp.gp_XYZ) -> None

  // Normalized(self
  // OCP.OCP.gp.gp_XYZ.Normalized (method)
  Normalized(self: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Reverse(self
  // OCP.OCP.gp.gp_XYZ.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_XYZ) -> None

  // Reversed(self
  // OCP.OCP.gp.gp_XYZ.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // Subtract(self
  // OCP.OCP.gp.gp_XYZ.Subtract (method)
  Subtract(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> None

  // Subtracted(self
  // OCP.OCP.gp.gp_XYZ.Subtracted (method)
  Subtracted(self: OCP.OCP.gp.gp_XYZ, theOther: OCP.OCP.gp.gp_XYZ) -> OCP.OCP.gp.gp_XYZ

  // SetLinearForm(*args, **kwargs)
  // OCP.OCP.gp.gp_XYZ.SetLinearForm (method)
  SetLinearForm(*args, **kwargs)
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theA3: float, theXYZ3: OCP.OCP.gp.gp_XYZ, theXYZ4: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theA3: float, theXYZ3: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ, theXYZ3: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theA2: float, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theA1: float, theXYZ1: OCP.OCP.gp.gp_XYZ, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None
  SetLinearForm(self: OCP.OCP.gp.gp_XYZ, theXYZ1: OCP.OCP.gp.gp_XYZ, theXYZ2: OCP.OCP.gp.gp_XYZ) -> None

  // DumpJson(self
  // OCP.OCP.gp.gp_XYZ.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_XYZ, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.gp.gp_XYZ.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_XYZ, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool
