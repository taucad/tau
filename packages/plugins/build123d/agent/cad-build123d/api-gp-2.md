# build123d — gp (2)

5 top-level symbols. Signatures are verbatim python.

// Defines a non-persistent transformation in 3D space
gp_GTrsf

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_GTrsf.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_GTrsf) -> None
  __init__(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.gp.gp_GTrsf, theM: OCP.OCP.gp.gp_Mat, theV: OCP.OCP.gp.gp_XYZ) -> None

  // SetAffinity(*args, **kwargs)
  // OCP.OCP.gp.gp_GTrsf.SetAffinity (method)
  SetAffinity(*args, **kwargs)
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA1: OCP.OCP.gp.gp_Ax1, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA2: OCP.OCP.gp.gp_Ax2, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA1: OCP.OCP.gp.gp_Ax1, theRatio: float) -> None
  SetAffinity(self: OCP.OCP.gp.gp_GTrsf, theA2: OCP.OCP.gp.gp_Ax2, theRatio: float) -> None

  // SetValue(*args, **kwargs)
  // OCP.OCP.gp.gp_GTrsf.SetValue (method)
  SetValue(*args, **kwargs)
  SetValue(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int, theValue: float) -> None
  SetValue(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int, theValue: float) -> None

  // SetVectorialPart(self
  // OCP.OCP.gp.gp_GTrsf.SetVectorialPart (method)
  SetVectorialPart(self: OCP.OCP.gp.gp_GTrsf, theMatrix: OCP.OCP.gp.gp_Mat) -> None

  // SetTranslationPart(self
  // OCP.OCP.gp.gp_GTrsf.SetTranslationPart (method)
  SetTranslationPart(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // SetTrsf(self
  // OCP.OCP.gp.gp_GTrsf.SetTrsf (method)
  SetTrsf(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_Trsf) -> None

  // IsNegative(self
  // OCP.OCP.gp.gp_GTrsf.IsNegative (method)
  IsNegative(self: OCP.OCP.gp.gp_GTrsf) -> bool

  // IsSingular(self
  // OCP.OCP.gp.gp_GTrsf.IsSingular (method)
  IsSingular(self: OCP.OCP.gp.gp_GTrsf) -> bool

  // Form(self
  // OCP.OCP.gp.gp_GTrsf.Form (method)
  Form(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_TrsfForm

  // SetForm(self
  // OCP.OCP.gp.gp_GTrsf.SetForm (method)
  SetForm(self: OCP.OCP.gp.gp_GTrsf) -> None

  // Value(*args, **kwargs)
  // OCP.OCP.gp.gp_GTrsf.Value (method)
  Value(*args, **kwargs)
  Value(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int) -> float
  Value(self: OCP.OCP.gp.gp_GTrsf, theRow: int, theCol: int) -> float

  // Invert(self
  // OCP.OCP.gp.gp_GTrsf.Invert (method)
  Invert(self: OCP.OCP.gp.gp_GTrsf) -> None

  // Inverted(self
  // OCP.OCP.gp.gp_GTrsf.Inverted (method)
  Inverted(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_GTrsf

  // Multiplied(self
  // OCP.OCP.gp.gp_GTrsf.Multiplied (method)
  Multiplied(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_GTrsf

  // Multiply(self
  // OCP.OCP.gp.gp_GTrsf.Multiply (method)
  Multiply(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> None

  // PreMultiply(self
  // OCP.OCP.gp.gp_GTrsf.PreMultiply (method)
  PreMultiply(self: OCP.OCP.gp.gp_GTrsf, theT: OCP.OCP.gp.gp_GTrsf) -> None

  // Power(self
  // OCP.OCP.gp.gp_GTrsf.Power (method)
  Power(self: OCP.OCP.gp.gp_GTrsf, theN: int) -> None

  // Powered(self
  // OCP.OCP.gp.gp_GTrsf.Powered (method)
  Powered(self: OCP.OCP.gp.gp_GTrsf, theN: int) -> OCP.OCP.gp.gp_GTrsf

  // Transforms(*args, **kwargs)
  // OCP.OCP.gp.gp_GTrsf.Transforms (method)
  Transforms(*args, **kwargs)
  Transforms(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_GTrsf, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  Transforms(self: OCP.OCP.gp.gp_GTrsf) -> tuple[float, float, float]
  Transforms(self: OCP.OCP.gp.gp_GTrsf) -> tuple[float, float, float]

  // Trsf(*args, **kwargs)
  // OCP.OCP.gp.gp_GTrsf.Trsf (method)
  Trsf(*args, **kwargs)
  Trsf(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Trsf
  Trsf(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Trsf

  // DumpJson(self
  // OCP.OCP.gp.gp_GTrsf.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_GTrsf, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // TranslationPart(self
  // OCP.OCP.gp.gp_GTrsf.TranslationPart (method)
  TranslationPart(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_XYZ

  // VectorialPart(self
  // OCP.OCP.gp.gp_GTrsf.VectorialPart (method)
  VectorialPart(self: OCP.OCP.gp.gp_GTrsf) -> OCP.OCP.gp.gp_Mat

// Describes a line in 3D space
gp_Lin

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Lin.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Lin) -> None
  __init__(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None
  __init__(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // Reverse(self
  // OCP.OCP.gp.gp_Lin.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_Lin) -> None

  // Reversed(self
  // OCP.OCP.gp.gp_Lin.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Lin

  // SetDirection(self
  // OCP.OCP.gp.gp_Lin.SetDirection (method)
  SetDirection(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // OCP.OCP.gp.gp_Lin.SetLocation (method)
  SetLocation(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  // OCP.OCP.gp.gp_Lin.SetPosition (method)
  SetPosition(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // Angle(self
  // OCP.OCP.gp.gp_Lin.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float

  // Contains(self
  // OCP.OCP.gp.gp_Lin.Contains (method)
  Contains(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool

  // Distance(*args, **kwargs)
  // OCP.OCP.gp.gp_Lin.Distance (method)
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float

  // SquareDistance(*args, **kwargs)
  // OCP.OCP.gp.gp_Lin.SquareDistance (method)
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theOther: OCP.OCP.gp.gp_Lin) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> float

  // Normal(*args, **kwargs)
  // OCP.OCP.gp.gp_Lin.Normal (method)
  Normal(*args, **kwargs)
  Normal(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin
  Normal(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin

  // Mirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Lin.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Lin, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // OCP.OCP.gp.gp_Lin.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin
  Mirrored(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Lin
  Mirrored(self: OCP.OCP.gp.gp_Lin, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Lin

  // Rotate(self
  // OCP.OCP.gp.gp_Lin.Rotate (method)
  Rotate(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Lin.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Lin, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Lin

  // Scale(self
  // OCP.OCP.gp.gp_Lin.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Lin.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Lin, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Lin

  // Transform(self
  // OCP.OCP.gp.gp_Lin.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Lin, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Lin.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Lin, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Lin

  // Translate(*args, **kwargs)
  // OCP.OCP.gp.gp_Lin.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Lin, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // OCP.OCP.gp.gp_Lin.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Lin, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Lin
  Translated(self: OCP.OCP.gp.gp_Lin, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Lin

  // Direction(self
  // OCP.OCP.gp.gp_Lin.Direction (method)
  Direction(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Dir

  // Location(self
  // OCP.OCP.gp.gp_Lin.Location (method)
  Location(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Pnt

  // Position(self
  // OCP.OCP.gp.gp_Lin.Position (method)
  Position(self: OCP.OCP.gp.gp_Lin) -> OCP.OCP.gp.gp_Ax1

// Describes a plane
gp_Pln

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Pln) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theA3: OCP.OCP.gp.gp_Ax3) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Pln, theA: float, theB: float, theC: float, theD: float) -> None

  // SetAxis(self
  // OCP.OCP.gp.gp_Pln.SetAxis (method)
  SetAxis(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetLocation(self
  // OCP.OCP.gp.gp_Pln.SetLocation (method)
  SetLocation(self: OCP.OCP.gp.gp_Pln, theLoc: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  // OCP.OCP.gp.gp_Pln.SetPosition (method)
  SetPosition(self: OCP.OCP.gp.gp_Pln, theA3: OCP.OCP.gp.gp_Ax3) -> None

  // UReverse(self
  // OCP.OCP.gp.gp_Pln.UReverse (method)
  UReverse(self: OCP.OCP.gp.gp_Pln) -> None

  // VReverse(self
  // OCP.OCP.gp.gp_Pln.VReverse (method)
  VReverse(self: OCP.OCP.gp.gp_Pln) -> None

  // Direct(self
  // OCP.OCP.gp.gp_Pln.Direct (method)
  Direct(self: OCP.OCP.gp.gp_Pln) -> bool

  // Distance(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.Distance (method)
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  Distance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float

  // SquareDistance(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.SquareDistance (method)
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pln, theOther: OCP.OCP.gp.gp_Pln) -> float

  // XAxis(self
  // OCP.OCP.gp.gp_Pln.XAxis (method)
  XAxis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // YAxis(self
  // OCP.OCP.gp.gp_Pln.YAxis (method)
  YAxis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // Contains(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.Contains (method)
  Contains(*args, **kwargs)
  Contains(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool
  Contains(self: OCP.OCP.gp.gp_Pln, theL: OCP.OCP.gp.gp_Lin, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Pln, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pln
  Mirrored(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pln
  Mirrored(self: OCP.OCP.gp.gp_Pln, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pln

  // Rotate(self
  // OCP.OCP.gp.gp_Pln.Rotate (method)
  Rotate(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Pln.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Pln, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Pln

  // Scale(self
  // OCP.OCP.gp.gp_Pln.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Pln.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Pln, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Pln

  // Transform(self
  // OCP.OCP.gp.gp_Pln.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Pln, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Pln.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Pln, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Pln

  // Translate(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Pln, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Pln, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Pln, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pln
  Translated(self: OCP.OCP.gp.gp_Pln, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pln

  // DumpJson(self
  // OCP.OCP.gp.gp_Pln.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Pln, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Coefficients(*args, **kwargs)
  // OCP.OCP.gp.gp_Pln.Coefficients (method)
  Coefficients(*args, **kwargs)
  Coefficients(self: OCP.OCP.gp.gp_Pln) -> tuple[float, float, float, float]
  Coefficients(self: OCP.OCP.gp.gp_Pln) -> tuple[float, float, float, float]

  // Axis(self
  // OCP.OCP.gp.gp_Pln.Axis (method)
  Axis(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax1

  // Location(self
  // OCP.OCP.gp.gp_Pln.Location (method)
  Location(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Pnt

  // Position(self
  // OCP.OCP.gp.gp_Pln.Position (method)
  Position(self: OCP.OCP.gp.gp_Pln) -> OCP.OCP.gp.gp_Ax3

// Defines a 3D cartesian point
gp_Pnt

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Pnt) -> None
  __init__(self: OCP.OCP.gp.gp_Pnt, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Pnt, theXp: float, theYp: float, theZp: float) -> None

  // SetCoord(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.SetCoord (method)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Pnt, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Pnt, theXp: float, theYp: float, theZp: float) -> None

  // SetX(self
  // OCP.OCP.gp.gp_Pnt.SetX (method)
  SetX(self: OCP.OCP.gp.gp_Pnt, theX: float) -> None

  // SetY(self
  // OCP.OCP.gp.gp_Pnt.SetY (method)
  SetY(self: OCP.OCP.gp.gp_Pnt, theY: float) -> None

  // SetZ(self
  // OCP.OCP.gp.gp_Pnt.SetZ (method)
  SetZ(self: OCP.OCP.gp.gp_Pnt, theZ: float) -> None

  // SetXYZ(self
  // OCP.OCP.gp.gp_Pnt.SetXYZ (method)
  SetXYZ(self: OCP.OCP.gp.gp_Pnt, theCoord: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.Coord (method)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Pnt, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Pnt) -> tuple[float, float, float]
  Coord(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

  // X(self
  // OCP.OCP.gp.gp_Pnt.X (method)
  X(self: OCP.OCP.gp.gp_Pnt) -> float

  // Y(self
  // OCP.OCP.gp.gp_Pnt.Y (method)
  Y(self: OCP.OCP.gp.gp_Pnt) -> float

  // Z(self
  // OCP.OCP.gp.gp_Pnt.Z (method)
  Z(self: OCP.OCP.gp.gp_Pnt) -> float

  // BaryCenter(self
  // OCP.OCP.gp.gp_Pnt.BaryCenter (method)
  BaryCenter(self: OCP.OCP.gp.gp_Pnt, theAlpha: float, theP: OCP.OCP.gp.gp_Pnt, theBeta: float) -> None

  // IsEqual(self
  // OCP.OCP.gp.gp_Pnt.IsEqual (method)
  IsEqual(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt, theLinearTolerance: float) -> bool

  // Distance(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.Distance (method)
  Distance(*args, **kwargs)
  Distance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float
  Distance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float

  // SquareDistance(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.SquareDistance (method)
  SquareDistance(*args, **kwargs)
  SquareDistance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float
  SquareDistance(self: OCP.OCP.gp.gp_Pnt, theOther: OCP.OCP.gp.gp_Pnt) -> float

  // Mirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Pnt, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pnt
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pnt
  Mirrored(self: OCP.OCP.gp.gp_Pnt, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pnt

  // Rotate(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.Rotate (method)
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Pnt.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Pnt, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Pnt

  // Scale(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.Scale (method)
  Scale(*args, **kwargs)
  Scale(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None
  Scale(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Pnt.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Pnt, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Pnt

  // Transform(self
  // OCP.OCP.gp.gp_Pnt.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Pnt, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Pnt.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Pnt, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Pnt

  // Translate(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Pnt, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None
  Translate(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> None

  // Translated(*args, **kwargs)
  // OCP.OCP.gp.gp_Pnt.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pnt
  Translated(self: OCP.OCP.gp.gp_Pnt, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Pnt
  Translated(self: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Pnt

  // DumpJson(self
  // OCP.OCP.gp.gp_Pnt.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Pnt, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.gp.gp_Pnt.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Pnt, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // XYZ(self
  // OCP.OCP.gp.gp_Pnt.XYZ (method)
  XYZ(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

  // ChangeCoord(self
  // OCP.OCP.gp.gp_Pnt.ChangeCoord (method)
  ChangeCoord(self: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_XYZ

// Represents operation of rotation in 3d space as quaternion and implements operations with rotations basing on quaternion mathematics
gp_Quaternion

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Quaternion.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Quaternion) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theX: float, theY: float, theZ: float, theW: float) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec, theHelpCrossVec: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec, theAngle: float) -> None
  __init__(self: OCP.OCP.gp.gp_Quaternion, theMat: OCP.OCP.gp.gp_Mat) -> None

  // IsEqual(self
  // OCP.OCP.gp.gp_Quaternion.IsEqual (method)
  IsEqual(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> bool

  // SetRotation(*args, **kwargs)
  // OCP.OCP.gp.gp_Quaternion.SetRotation (method)
  SetRotation(*args, **kwargs)
  SetRotation(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec) -> None
  SetRotation(self: OCP.OCP.gp.gp_Quaternion, theVecFrom: OCP.OCP.gp.gp_Vec, theVecTo: OCP.OCP.gp.gp_Vec, theHelpCrossVec: OCP.OCP.gp.gp_Vec) -> None

  // SetVectorAndAngle(self
  // OCP.OCP.gp.gp_Quaternion.SetVectorAndAngle (method)
  SetVectorAndAngle(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec, theAngle: float) -> None

  // SetMatrix(self
  // OCP.OCP.gp.gp_Quaternion.SetMatrix (method)
  SetMatrix(self: OCP.OCP.gp.gp_Quaternion, theMat: OCP.OCP.gp.gp_Mat) -> None

  // GetMatrix(self
  // OCP.OCP.gp.gp_Quaternion.GetMatrix (method)
  GetMatrix(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Mat

  // SetEulerAngles(self
  // OCP.OCP.gp.gp_Quaternion.SetEulerAngles (method)
  SetEulerAngles(self: OCP.OCP.gp.gp_Quaternion, theOrder: OCP.OCP.gp.gp_EulerSequence, theAlpha: float, theBeta: float, theGamma: float) -> None

  // Set(*args, **kwargs)
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
  // OCP.OCP.gp.gp_Quaternion.SetIdent (method)
  SetIdent(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Reverse(self
  // OCP.OCP.gp.gp_Quaternion.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Reversed(self
  // OCP.OCP.gp.gp_Quaternion.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Invert(self
  // OCP.OCP.gp.gp_Quaternion.Invert (method)
  Invert(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Inverted(self
  // OCP.OCP.gp.gp_Quaternion.Inverted (method)
  Inverted(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // SquareNorm(self
  // OCP.OCP.gp.gp_Quaternion.SquareNorm (method)
  SquareNorm(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Norm(self
  // OCP.OCP.gp.gp_Quaternion.Norm (method)
  Norm(self: OCP.OCP.gp.gp_Quaternion) -> float

  // Scale(*args, **kwargs)
  // OCP.OCP.gp.gp_Quaternion.Scale (method)
  Scale(*args, **kwargs)
  Scale(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> None
  Scale(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Quaternion.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Quaternion, theScale: float) -> OCP.OCP.gp.gp_Quaternion

  // StabilizeLength(self
  // OCP.OCP.gp.gp_Quaternion.StabilizeLength (method)
  StabilizeLength(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Normalize(self
  // OCP.OCP.gp.gp_Quaternion.Normalize (method)
  Normalize(self: OCP.OCP.gp.gp_Quaternion) -> None

  // Normalized(self
  // OCP.OCP.gp.gp_Quaternion.Normalized (method)
  Normalized(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Negated(self
  // OCP.OCP.gp.gp_Quaternion.Negated (method)
  Negated(self: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Added(self
  // OCP.OCP.gp.gp_Quaternion.Added (method)
  Added(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Subtracted(self
  // OCP.OCP.gp.gp_Quaternion.Subtracted (method)
  Subtracted(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Multiplied(*args, **kwargs)
  // OCP.OCP.gp.gp_Quaternion.Multiplied (method)
  Multiplied(*args, **kwargs)
  Multiplied(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion
  Multiplied(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> OCP.OCP.gp.gp_Quaternion

  // Add(*args, **kwargs)
  // OCP.OCP.gp.gp_Quaternion.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Add(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> None

  // Subtract(*args, **kwargs)
  // OCP.OCP.gp.gp_Quaternion.Subtract (method)
  Subtract(*args, **kwargs)
  Subtract(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Subtract(self: OCP.OCP.gp.gp_Quaternion, theQ: OCP.OCP.gp.gp_Quaternion) -> None

  // Multiply(*args, **kwargs)
  // OCP.OCP.gp.gp_Quaternion.Multiply (method)
  Multiply(*args, **kwargs)
  Multiply(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> None
  Multiply(self: OCP.OCP.gp.gp_Quaternion, theVec: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Vec

  // Dot(self
  // OCP.OCP.gp.gp_Quaternion.Dot (method)
  Dot(self: OCP.OCP.gp.gp_Quaternion, theOther: OCP.OCP.gp.gp_Quaternion) -> float

  // GetRotationAngle(self
  // OCP.OCP.gp.gp_Quaternion.GetRotationAngle (method)
  GetRotationAngle(self: OCP.OCP.gp.gp_Quaternion) -> float

  // GetVectorAndAngle(self
  // OCP.OCP.gp.gp_Quaternion.GetVectorAndAngle (method)
  GetVectorAndAngle(self: OCP.OCP.gp.gp_Quaternion, theAxis: OCP.OCP.gp.gp_Vec) -> tuple[float]

  // GetEulerAngles(self
  // OCP.OCP.gp.gp_Quaternion.GetEulerAngles (method)
  GetEulerAngles(self: OCP.OCP.gp.gp_Quaternion, theOrder: OCP.OCP.gp.gp_EulerSequence) -> tuple[float, float, float]
