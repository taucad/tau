# build123d — Geom (2)

4 top-level symbols. Signatures are verbatim python.

// The root class for bounded surfaces in 3D space
Geom_BoundedSurface

  // Initialize self
  // OCP.OCP.Geom.Geom_BoundedSurface.__init__ (constructor)
  Geom_BoundedSurface(*args, **kwargs)

  // get_type_name_s() -> str
  // OCP.OCP.Geom.Geom_BoundedSurface.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.Geom.Geom_BoundedSurface.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.Geom.Geom_BoundedSurface.DynamicType (method)
  DynamicType(self: OCP.OCP.Geom.Geom_BoundedSurface) -> OCP.OCP.Standard.Standard_Type

// Describes the common behavior of surfaces which have a simple parametric equation in a local coordinate system
Geom_ElementarySurface

  // Initialize self
  // OCP.OCP.Geom.Geom_ElementarySurface.__init__ (constructor)
  Geom_ElementarySurface(*args, **kwargs)

  // SetAxis(self
  // OCP.OCP.Geom.Geom_ElementarySurface.SetAxis (method)
  SetAxis(self: OCP.OCP.Geom.Geom_ElementarySurface, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetLocation(self
  // OCP.OCP.Geom.Geom_ElementarySurface.SetLocation (method)
  SetLocation(self: OCP.OCP.Geom.Geom_ElementarySurface, theLoc: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  // OCP.OCP.Geom.Geom_ElementarySurface.SetPosition (method)
  SetPosition(self: OCP.OCP.Geom.Geom_ElementarySurface, theAx3: OCP.OCP.gp.gp_Ax3) -> None

  // UReverse(self
  // OCP.OCP.Geom.Geom_ElementarySurface.UReverse (method)
  UReverse(self: OCP.OCP.Geom.Geom_ElementarySurface) -> None

  // UReversedParameter(self
  // OCP.OCP.Geom.Geom_ElementarySurface.UReversedParameter (method)
  UReversedParameter(self: OCP.OCP.Geom.Geom_ElementarySurface, U: float) -> float

  // VReverse(self
  // OCP.OCP.Geom.Geom_ElementarySurface.VReverse (method)
  VReverse(self: OCP.OCP.Geom.Geom_ElementarySurface) -> None

  // VReversedParameter(self
  // OCP.OCP.Geom.Geom_ElementarySurface.VReversedParameter (method)
  VReversedParameter(self: OCP.OCP.Geom.Geom_ElementarySurface, V: float) -> float

  // Continuity(self
  // OCP.OCP.Geom.Geom_ElementarySurface.Continuity (method)
  Continuity(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // IsCNu(self
  // OCP.OCP.Geom.Geom_ElementarySurface.IsCNu (method)
  IsCNu(self: OCP.OCP.Geom.Geom_ElementarySurface, N: int) -> bool

  // IsCNv(self
  // OCP.OCP.Geom.Geom_ElementarySurface.IsCNv (method)
  IsCNv(self: OCP.OCP.Geom.Geom_ElementarySurface, N: int) -> bool

  // DumpJson(self
  // OCP.OCP.Geom.Geom_ElementarySurface.DumpJson (method)
  DumpJson(self: OCP.OCP.Geom.Geom_ElementarySurface, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // get_type_name_s() -> str
  // OCP.OCP.Geom.Geom_ElementarySurface.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.Geom.Geom_ElementarySurface.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // Axis(self
  // OCP.OCP.Geom.Geom_ElementarySurface.Axis (method)
  Axis(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Ax1

  // Location(self
  // OCP.OCP.Geom.Geom_ElementarySurface.Location (method)
  Location(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Pnt

  // Position(self
  // OCP.OCP.Geom.Geom_ElementarySurface.Position (method)
  Position(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.gp.gp_Ax3

  // DynamicType(self
  // OCP.OCP.Geom.Geom_ElementarySurface.DynamicType (method)
  DynamicType(self: OCP.OCP.Geom.Geom_ElementarySurface) -> OCP.OCP.Standard.Standard_Type

// Describes an infinite line
Geom_Line

  // __init__(*args, **kwargs)
  // OCP.OCP.Geom.Geom_Line.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_Line, A1: OCP.OCP.gp.gp_Ax1) -> None
  __init__(self: OCP.OCP.Geom.Geom_Line, L: OCP.OCP.gp.gp_Lin) -> None
  __init__(self: OCP.OCP.Geom.Geom_Line, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None

  // SetLin(self
  // OCP.OCP.Geom.Geom_Line.SetLin (method)
  SetLin(self: OCP.OCP.Geom.Geom_Line, L: OCP.OCP.gp.gp_Lin) -> None

  // SetDirection(self
  // OCP.OCP.Geom.Geom_Line.SetDirection (method)
  SetDirection(self: OCP.OCP.Geom.Geom_Line, V: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // OCP.OCP.Geom.Geom_Line.SetLocation (method)
  SetLocation(self: OCP.OCP.Geom.Geom_Line, P: OCP.OCP.gp.gp_Pnt) -> None

  // SetPosition(self
  // OCP.OCP.Geom.Geom_Line.SetPosition (method)
  SetPosition(self: OCP.OCP.Geom.Geom_Line, A1: OCP.OCP.gp.gp_Ax1) -> None

  // Lin(self
  // OCP.OCP.Geom.Geom_Line.Lin (method)
  Lin(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.gp.gp_Lin

  // Reverse(self
  // OCP.OCP.Geom.Geom_Line.Reverse (method)
  Reverse(self: OCP.OCP.Geom.Geom_Line) -> None

  // ReversedParameter(self
  // OCP.OCP.Geom.Geom_Line.ReversedParameter (method)
  ReversedParameter(self: OCP.OCP.Geom.Geom_Line, U: float) -> float

  // FirstParameter(self
  // OCP.OCP.Geom.Geom_Line.FirstParameter (method)
  FirstParameter(self: OCP.OCP.Geom.Geom_Line) -> float

  // LastParameter(self
  // OCP.OCP.Geom.Geom_Line.LastParameter (method)
  LastParameter(self: OCP.OCP.Geom.Geom_Line) -> float

  // IsClosed(self
  // OCP.OCP.Geom.Geom_Line.IsClosed (method)
  IsClosed(self: OCP.OCP.Geom.Geom_Line) -> bool

  // IsPeriodic(self
  // OCP.OCP.Geom.Geom_Line.IsPeriodic (method)
  IsPeriodic(self: OCP.OCP.Geom.Geom_Line) -> bool

  // Continuity(self
  // OCP.OCP.Geom.Geom_Line.Continuity (method)
  Continuity(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // IsCN(self
  // OCP.OCP.Geom.Geom_Line.IsCN (method)
  IsCN(self: OCP.OCP.Geom.Geom_Line, N: int) -> bool

  // D0(self
  // OCP.OCP.Geom.Geom_Line.D0 (method)
  D0(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  // OCP.OCP.Geom.Geom_Line.D1 (method)
  D1(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  // OCP.OCP.Geom.Geom_Line.D2 (method)
  D2(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  // OCP.OCP.Geom.Geom_Line.D3 (method)
  D3(self: OCP.OCP.Geom.Geom_Line, U: float, P: OCP.OCP.gp.gp_Pnt, V1: OCP.OCP.gp.gp_Vec, V2: OCP.OCP.gp.gp_Vec, V3: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  // OCP.OCP.Geom.Geom_Line.DN (method)
  DN(self: OCP.OCP.Geom.Geom_Line, U: float, N: int) -> OCP.OCP.gp.gp_Vec

  // Transform(self
  // OCP.OCP.Geom.Geom_Line.Transform (method)
  Transform(self: OCP.OCP.Geom.Geom_Line, T: OCP.OCP.gp.gp_Trsf) -> None

  // TransformedParameter(self
  // OCP.OCP.Geom.Geom_Line.TransformedParameter (method)
  TransformedParameter(self: OCP.OCP.Geom.Geom_Line, U: float, T: OCP.OCP.gp.gp_Trsf) -> float

  // ParametricTransformation(self
  // OCP.OCP.Geom.Geom_Line.ParametricTransformation (method)
  ParametricTransformation(self: OCP.OCP.Geom.Geom_Line, T: OCP.OCP.gp.gp_Trsf) -> float

  // Copy(self
  // OCP.OCP.Geom.Geom_Line.Copy (method)
  Copy(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.Geom.Geom_Geometry

  // DumpJson(self
  // OCP.OCP.Geom.Geom_Line.DumpJson (method)
  DumpJson(self: OCP.OCP.Geom.Geom_Line, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // get_type_name_s() -> str
  // OCP.OCP.Geom.Geom_Line.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.Geom.Geom_Line.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // Position(self
  // OCP.OCP.Geom.Geom_Line.Position (method)
  Position(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.gp.gp_Ax1

  // DynamicType(self
  // OCP.OCP.Geom.Geom_Line.DynamicType (method)
  DynamicType(self: OCP.OCP.Geom.Geom_Line) -> OCP.OCP.Standard.Standard_Type

// Describes a plane in 3D space
Geom_Plane

  // __init__(*args, **kwargs)
  // OCP.OCP.Geom.Geom_Plane.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Geom.Geom_Plane, A3: OCP.OCP.gp.gp_Ax3) -> None
  __init__(self: OCP.OCP.Geom.Geom_Plane, Pl: OCP.OCP.gp.gp_Pln) -> None
  __init__(self: OCP.OCP.Geom.Geom_Plane, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.Geom.Geom_Plane, A: float, B: float, C: float, D: float) -> None

  // SetPln(self
  // OCP.OCP.Geom.Geom_Plane.SetPln (method)
  SetPln(self: OCP.OCP.Geom.Geom_Plane, Pl: OCP.OCP.gp.gp_Pln) -> None

  // Pln(self
  // OCP.OCP.Geom.Geom_Plane.Pln (method)
  Pln(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.gp.gp_Pln

  // UReverse(self
  // OCP.OCP.Geom.Geom_Plane.UReverse (method)
  UReverse(self: OCP.OCP.Geom.Geom_Plane) -> None

  // UReversedParameter(self
  // OCP.OCP.Geom.Geom_Plane.UReversedParameter (method)
  UReversedParameter(self: OCP.OCP.Geom.Geom_Plane, U: float) -> float

  // VReverse(self
  // OCP.OCP.Geom.Geom_Plane.VReverse (method)
  VReverse(self: OCP.OCP.Geom.Geom_Plane) -> None

  // VReversedParameter(self
  // OCP.OCP.Geom.Geom_Plane.VReversedParameter (method)
  VReversedParameter(self: OCP.OCP.Geom.Geom_Plane, V: float) -> float

  // ParametricTransformation(self
  // OCP.OCP.Geom.Geom_Plane.ParametricTransformation (method)
  ParametricTransformation(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_GTrsf2d

  // IsUClosed(self
  // OCP.OCP.Geom.Geom_Plane.IsUClosed (method)
  IsUClosed(self: OCP.OCP.Geom.Geom_Plane) -> bool

  // IsVClosed(self
  // OCP.OCP.Geom.Geom_Plane.IsVClosed (method)
  IsVClosed(self: OCP.OCP.Geom.Geom_Plane) -> bool

  // IsUPeriodic(self
  // OCP.OCP.Geom.Geom_Plane.IsUPeriodic (method)
  IsUPeriodic(self: OCP.OCP.Geom.Geom_Plane) -> bool

  // IsVPeriodic(self
  // OCP.OCP.Geom.Geom_Plane.IsVPeriodic (method)
  IsVPeriodic(self: OCP.OCP.Geom.Geom_Plane) -> bool

  // UIso(self
  // OCP.OCP.Geom.Geom_Plane.UIso (method)
  UIso(self: OCP.OCP.Geom.Geom_Plane, U: float) -> OCP.OCP.Geom.Geom_Curve

  // VIso(self
  // OCP.OCP.Geom.Geom_Plane.VIso (method)
  VIso(self: OCP.OCP.Geom.Geom_Plane, V: float) -> OCP.OCP.Geom.Geom_Curve

  // D0(self
  // OCP.OCP.Geom.Geom_Plane.D0 (method)
  D0(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt) -> None

  // D1(self
  // OCP.OCP.Geom.Geom_Plane.D1 (method)
  D1(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec) -> None

  // D2(self
  // OCP.OCP.Geom.Geom_Plane.D2 (method)
  D2(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec, D2U: OCP.OCP.gp.gp_Vec, D2V: OCP.OCP.gp.gp_Vec, D2UV: OCP.OCP.gp.gp_Vec) -> None

  // D3(self
  // OCP.OCP.Geom.Geom_Plane.D3 (method)
  D3(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, P: OCP.OCP.gp.gp_Pnt, D1U: OCP.OCP.gp.gp_Vec, D1V: OCP.OCP.gp.gp_Vec, D2U: OCP.OCP.gp.gp_Vec, D2V: OCP.OCP.gp.gp_Vec, D2UV: OCP.OCP.gp.gp_Vec, D3U: OCP.OCP.gp.gp_Vec, D3V: OCP.OCP.gp.gp_Vec, D3UUV: OCP.OCP.gp.gp_Vec, D3UVV: OCP.OCP.gp.gp_Vec) -> None

  // DN(self
  // OCP.OCP.Geom.Geom_Plane.DN (method)
  DN(self: OCP.OCP.Geom.Geom_Plane, U: float, V: float, Nu: int, Nv: int) -> OCP.OCP.gp.gp_Vec

  // Transform(self
  // OCP.OCP.Geom.Geom_Plane.Transform (method)
  Transform(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> None

  // Copy(self
  // OCP.OCP.Geom.Geom_Plane.Copy (method)
  Copy(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.Geom.Geom_Geometry

  // DumpJson(self
  // OCP.OCP.Geom.Geom_Plane.DumpJson (method)
  DumpJson(self: OCP.OCP.Geom.Geom_Plane, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // TransformParameters(self
  // OCP.OCP.Geom.Geom_Plane.TransformParameters (method)
  TransformParameters(self: OCP.OCP.Geom.Geom_Plane, T: OCP.OCP.gp.gp_Trsf) -> tuple[float, float]

  // Bounds(self
  // OCP.OCP.Geom.Geom_Plane.Bounds (method)
  Bounds(self: OCP.OCP.Geom.Geom_Plane) -> tuple[float, float, float, float]

  // Coefficients(self
  // OCP.OCP.Geom.Geom_Plane.Coefficients (method)
  Coefficients(self: OCP.OCP.Geom.Geom_Plane) -> tuple[float, float, float, float]

  // get_type_name_s() -> str
  // OCP.OCP.Geom.Geom_Plane.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.Geom.Geom_Plane.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.Geom.Geom_Plane.DynamicType (method)
  DynamicType(self: OCP.OCP.Geom.Geom_Plane) -> OCP.OCP.Standard.Standard_Type
