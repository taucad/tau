# build123d — gp (2)

5 top-level symbols. Signatures are verbatim python.

// Defines a non-persistent transformation in 3D space
gp_GTrsf

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_GTrsf) -> None
  __init__(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.gp.gp_GTrsf, theM: OCP.OCP.gp.gp_Mat, theV: OCP.OCP.gp.gp_XYZ) -> None

  // SetAffinity(*args, **kwargs)
  SetAffinity(*args, **kwargs)
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA1: OCP.OCP.gp.gp_Ax1, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA2: OCP.OCP.gp.gp_Ax2, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA1: OCP.OCP.gp.gp_Ax1, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA2: OCP.OCP.gp.gp_Ax2, theRatio: float) -> None

  // SetValue(*args, **kwargs)
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int, theValue: float) -> None
  SetValue(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int, theValue: float) -> None

  // SetVectorialPart(self
  SetVectorialPart(self: OCP.OCP.gp.gp_GTrsf, theMatrix: OCP.OCP.gp.gp_Mat) -> None

  // SetTranslationPart(self
  SetTranslationPart(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // SetTrsf(self
  SetTrsf(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // IsNegative(self
  IsNegative(self: OCP.OCP.gp.gp_GTrsf) -> bool

  // IsSingular(self
  IsSingular(self: OCP.OCP.gp.gp_GTrsf) -> bool

  // Form(self
  Form(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_TrsfForm

  // SetForm(self
  SetForm(self: OCP.OCP.gp.gp_GTrsf) -> None

  // Value(*args, **kwargs)
  Value(*args, **kwargs)
  Value(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int) -> float
  Value(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int) -> float

  // Invert(self
  Invert(self: OCP.OCP.gp.gp_GTrsf) -> None

  // Inverted(self
  Inverted(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_GTrsf

  // Multiplied(self
  Multiplied(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_GTrsf

  // Multiply(self
  Multiply(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> None

  // PreMultiply(self
  PreMultiply(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> None

  // Power(self
  Power(self: OCP.OCP.gp.gp_GTrsf, theN: int) -> None

  // Powered(self
  Powered(self: OCP.OCP.gp.gp_GTrsf, theN: int) -> OCP.OCP.gp.gp_GTrsf

  // Transforms(*args, **kwargs)
  Transforms(*args, **kwargs)
  Transforms(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_GTrsf) -> tuple[float, float, float]
  Transforms(self: OCP.OCP.gp.gp_GTrsf) -> tuple[float, float, float]

  // Trsf(*args, **kwargs)
  Trsf(*args, **kwargs)
  Trsf(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Trsf
  Trsf(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Trsf

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_GTrsf, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // TranslationPart(self
  TranslationPart(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_XYZ

  // VectorialPart(self
  VectorialPart(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Mat

// Describes a line in 3D space
gp_Lin

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Lin) -> None
  __init__(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None
  __init__(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // Reverse(self
  Reverse(self: OCP.OCP.gp.gp_Lin) -> None

  // Reversed(self
  Reversed(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Lin

  // SetDirection(self
  SetDirection(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  SetLocation(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  SetPosition(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // Angle(self
  Angle(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float

  // Contains(self
  Contains(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool

  // Distance(*args, **kwargs)
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float

  // SquareDistance(*args, **kwargs)
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float

  // Normal(*args, **kwargs)
  Normal(*args, **kwargs)
  Normal(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin
  Normal(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin

  // Mirror(*args, **kwargs)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Lin, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin
  Mirrored(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Lin
  Mirrored(self: OCP.OCP.gp.gp_Lin, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Lin

  // Rotate(self
  Rotate(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  Rotated(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Lin

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  Scaled(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Lin

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Lin, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  Transformed(self: OCP.OCP.gp.gp_Lin, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Lin

  // Translate(*args, **kwargs)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Lin, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Lin
  Translated(self: OCP.OCP.gp.gp_Lin, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin

  // Direction(self
  Direction(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Dir

  // Location(self
  Location(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Pnt

  // Position(self
  Position(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Ax1

// Describes a plane
gp_Pln

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Pln) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theA3: OCP.OCP.gp.gp_Ax3) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theA: float, theB: float, theC: float, theD: float) -> None

  // SetAxis(self
  SetAxis(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetLocation(self
  SetLocation(self: OCP.OCP.gp.gp_Pln, theLoc: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  SetPosition(self: OCP.OCP.gp.gp_Pln, theA3: OCP.OCP.gp.gp_Ax3) -> None

  // UReverse(self
  UReverse(self: OCP.OCP.gp.gp_Pln) -> None

  // VReverse(self
  VReverse(self: OCP.OCP.gp.gp_Pln) -> None

  // Direct(self
  Direct(self: OCP.OCP.gp.gp_Pln) -> bool

  // Distance(*args, **kwargs)
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float

  // SquareDistance(*args, **kwargs)
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float

  // XAxis(self
  XAxis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // YAxis(self
  YAxis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // Contains(*args, **kwargs)
  Contains(*args, **kwargs)
  Contains(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool
  Contains(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Pln, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pln
  Mirrored(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pln
  Mirrored(self: OCP.OCP.gp.gp_Pln, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pln

  // Rotate(self
  Rotate(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  Rotated(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Pln

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  Scaled(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Pln

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Pln, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  Transformed(self: OCP.OCP.gp.gp_Pln, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Pln

  // Translate(*args, **kwargs)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Pln, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Pln, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Pln, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pln
  Translated(self: OCP.OCP.gp.gp_Pln, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pln

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_Pln, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Coefficients(*args, **kwargs)
  Coefficients(*args, **kwargs)
  Coefficients(self: OCP.OCP.gp.gp_Pln) -> tuple[float, float, float, float]
  Coefficients(self: OCP.OCP.gp.gp_Pln) -> tuple[float, float, float, float]

  // Axis(self
  Axis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // Location(self
  Location(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Pnt

  // Position(self
  Position(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax3

// Defines a 3D cartesian point
gp_Pnt

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Pnt) -> None
  __init__(self: OCP.OCP.gp.gp_Pnt, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Pnt, theXp: float, theYp: float, theZp: float) -> None

  // SetCoord(*args, **kwargs)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Pnt, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Pnt, theXp: float, theYp: float, theZp: float) -> None

  // SetX(self
  SetX(self: OCP.OCP.gp.gp_Pnt, theX: float) -> None

  // SetY(self
  SetY(self: OCP.OCP.gp.gp_Pnt, theY: float) -> None

  // SetZ(self
  SetZ(self: OCP.OCP.gp.gp_Pnt, theZ: float) -> None

  // SetXYZ(self
  SetXYZ(self: OCP.OCP.gp.gp_Pnt, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Pnt, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Pnt) -> tuple[float, float, float]
  Coord(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

  // X(self
  X(self: OCP.OCP.gp.gp_Pnt) -> float

  // Y(self
  Y(self: OCP.OCP.gp.gp_Pnt) -> float

  // Z(self
  Z(self: OCP.OCP.gp.gp_Pnt) -> float

  // BaryCenter(self
  BaryCenter(self: OCP.OCP.gp.gp_Pnt, theAlpha: float, theP: OCP.OCP.gp.gp_Pnt, theBeta: float) -> None

  // IsEqual(self
  IsEqual(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool

  // Distance(*args, **kwargs)
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float

  // SquareDistance(*args, **kwargs)
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float

  // Mirror(*args, **kwargs)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Pnt, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pnt
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pnt
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pnt

  // Rotate(*args, **kwargs)
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  Rotated(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Pnt

  // Scale(*args, **kwargs)
  Scale(*args, **kwargs)
  Scale(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None
  Scale(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  Scaled(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Pnt

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Pnt, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  Transformed(self: OCP.OCP.gp.gp_Pnt, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Pnt

  // Translate(*args, **kwargs)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Pnt, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  Translate(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> None

  // Translated(*args, **kwargs)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pnt
  Translated(self: OCP.OCP.gp.gp_Pnt, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pnt
  Translated(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pnt

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_Pnt, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  InitFromJson(self: OCP.OCP.gp.gp_Pnt, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // XYZ(self
  XYZ(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

  // ChangeCoord(self
  ChangeCoord(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

// Represents operation of rotation in 3d space as quaternion and implements operations with rotations basing on quaternion mathematics
gp_Quaternion

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Quaternion) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec, theHelpCrossVec: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec, theAngle: float) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theMat: OCP.OCP.gp.gp_Mat) -> None

  // IsEqual(self
  IsEqual(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> bool

  // SetRotation(*args, **kwargs)
  SetRotation(*args, **kwargs)
  SetRotation(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec) -> None
  SetRotation(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec, theHelpCrossVec: OCP.OCP.gp.gp_Vec) -> None

  // SetVectorAndAngle(self
  SetVectorAndAngle(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec, theAngle: float) -> None

  // SetMatrix(self
  SetMatrix(self: OCP.OCP.gp.gp_Quaternion, theMat: OCP.OCP.gp.gp_Mat) -> None

  // GetMatrix(self
  GetMatrix(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Mat

  // SetEulerAngles(self
  SetEulerAngles(self: OCP.OCP.gp.gp_Quaternion, theOrder: OCP.OCP.gp.gp_EulerSequence, theAlpha: float, theBeta: float, theGamma: float) -> None

  // Set(*args, **kwargs)
  Set(*args, **kwargs)
  Set(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None
  Set(self: OCP.OCP.gp.gp_Quaternion, theQuaternion: OCP.OCP.gp.gp_Quaternion) -> None
  Set(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None
  Set(self: OCP.OCP.gp.gp_Quaternion, theQuaternion: OCP.OCP.gp.gp_Quaternion) -> None

  // X(self
  X(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Y(self
  Y(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Z(self
  Z(self: OCP.OCP.gp.gp_Quaternion) -> float

  // W(self
  W(self: OCP.OCP.gp.gp_Quaternion) -> float

  // SetIdent(self
  SetIdent(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Reverse(self
  Reverse(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Reversed(self
  Reversed(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Invert(self
  Invert(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Inverted(self
  Inverted(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // SquareNorm(self
  SquareNorm(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Norm(self
  Norm(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Scale(*args, **kwargs)
  Scale(*args, **kwargs)
  Scale(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> None
  Scale(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> None

  // Scaled(self
  Scaled(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> OCP.OCP.gp.gp_Quaternion

  // StabilizeLength(self
  StabilizeLength(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Normalize(self
  Normalize(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Normalized(self
  Normalized(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Negated(self
  Negated(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Added(self
  Added(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Subtracted(self
  Subtracted(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Multiplied(*args, **kwargs)
  Multiplied(*args, **kwargs)
  Multiplied(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion
  Multiplied(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Add(*args, **kwargs)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Add(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> None

  // Subtract(*args, **kwargs)
  Subtract(*args, **kwargs)
  Subtract(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Subtract(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> None

  // Multiply(*args, **kwargs)
  Multiply(*args, **kwargs)
  Multiply(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Multiply(self: OCP.OCP.gp.gp_Quaternion, theVec: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Dot(self
  Dot(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> float

  // GetRotationAngle(self
  GetRotationAngle(self: OCP.OCP.gp.gp_Quaternion) -> float

  // GetVectorAndAngle(self
  GetVectorAndAngle(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec) -> tuple[float]

  // GetEulerAngles(self
  GetEulerAngles(self: OCP.OCP.gp.gp_Quaternion, theOrder: OCP.OCP.gp.gp_EulerSequence) -> tuple[float, float, float]
