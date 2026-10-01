# build123d — gp

5 top-level symbols. Signatures are verbatim python.

// Describes an axis in 3D space
gp_Ax1

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax1.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax1) -> None
  __init__(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetDirection(self
  // OCP.OCP.gp.gp_Ax1.SetDirection (method)
  SetDirection(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // OCP.OCP.gp.gp_Ax1.SetLocation (method)
  SetLocation(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt) -> None

  // IsCoaxial(self
  // OCP.OCP.gp.gp_Ax1.IsCoaxial (method)
  IsCoaxial(self: OCP.OCP.gp.gp_Ax1, Other: OCP.OCP.gp.gp_Ax1, AngularTolerance: float, LinearTolerance: float) -> bool

  // IsNormal(self
  // OCP.OCP.gp.gp_Ax1.IsNormal (method)
  IsNormal(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // IsOpposite(self
  // OCP.OCP.gp.gp_Ax1.IsOpposite (method)
  IsOpposite(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // IsParallel(self
  // OCP.OCP.gp.gp_Ax1.IsParallel (method)
  IsParallel(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // Angle(self
  // OCP.OCP.gp.gp_Ax1.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1) -> float

  // Reverse(self
  // OCP.OCP.gp.gp_Ax1.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_Ax1) -> None

  // Reversed(self
  // OCP.OCP.gp.gp_Ax1.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax1

  // Mirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax1.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax1, P: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax1, A1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax1, A2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax1.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax1, P: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax1
  Mirrored(self: OCP.OCP.gp.gp_Ax1, A1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax1
  Mirrored(self: OCP.OCP.gp.gp_Ax1, A2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax1

  // Rotate(self
  // OCP.OCP.gp.gp_Ax1.Rotate (method)
  Rotate(self: OCP.OCP.gp.gp_Ax1, theA1: OCP.OCP.gp.gp_Ax1, theAngRad: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Ax1.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Ax1, theA1: OCP.OCP.gp.gp_Ax1, theAngRad: float) -> OCP.OCP.gp.gp_Ax1

  // Scale(self
  // OCP.OCP.gp.gp_Ax1.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Ax1.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax1

  // Transform(self
  // OCP.OCP.gp.gp_Ax1.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Ax1, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Ax1.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Ax1, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax1

  // Translate(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax1.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax1, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax1.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax1
  Translated(self: OCP.OCP.gp.gp_Ax1, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax1

  // DumpJson(self
  // OCP.OCP.gp.gp_Ax1.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Ax1, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.gp.gp_Ax1.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Ax1, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Direction(self
  // OCP.OCP.gp.gp_Ax1.Direction (method)
  Direction(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Dir

  // Location(self
  // OCP.OCP.gp.gp_Ax1.Location (method)
  Location(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pnt

// Describes a right-handed coordinate system in 3D space
gp_Ax2

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax2.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax2) -> None
  __init__(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt, N: OCP.OCP.gp.gp_Dir, Vx: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None

  // SetAxis(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax2.SetAxis (method)
  SetAxis(*args, **kwargs)
  SetAxis(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> None
  SetAxis(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetDirection(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax2.SetDirection (method)
  SetDirection(*args, **kwargs)
  SetDirection(self: OCP.OCP.gp.gp_Ax2, V: OCP.OCP.gp.gp_Dir) -> None
  SetDirection(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // OCP.OCP.gp.gp_Ax2.SetLocation (method)
  SetLocation(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetXDirection(self
  // OCP.OCP.gp.gp_Ax2.SetXDirection (method)
  SetXDirection(self: OCP.OCP.gp.gp_Ax2, theVx: OCP.OCP.gp.gp_Dir) -> None

  // SetYDirection(self
  // OCP.OCP.gp.gp_Ax2.SetYDirection (method)
  SetYDirection(self: OCP.OCP.gp.gp_Ax2, theVy: OCP.OCP.gp.gp_Dir) -> None

  // Angle(self
  // OCP.OCP.gp.gp_Ax2.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Ax2, theOther: OCP.OCP.gp.gp_Ax2) -> float

  // IsCoplanar(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax2.IsCoplanar (method)
  IsCoplanar(*args, **kwargs)
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, Other: OCP.OCP.gp.gp_Ax2, LinearTolerance: float, AngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1, LinearTolerance: float, AngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, theOther: OCP.OCP.gp.gp_Ax2, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, theA: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax2.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax2, A2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax2.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax2
  Mirrored(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax2
  Mirrored(self: OCP.OCP.gp.gp_Ax2, A2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax2

  // Rotate(self
  // OCP.OCP.gp.gp_Ax2.Rotate (method)
  Rotate(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Ax2.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Ax2

  // Scale(self
  // OCP.OCP.gp.gp_Ax2.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Ax2.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax2

  // Transform(self
  // OCP.OCP.gp.gp_Ax2.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Ax2, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Ax2.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Ax2, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax2

  // Translate(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax2.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax2, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax2.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax2
  Translated(self: OCP.OCP.gp.gp_Ax2, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax2

  // DumpJson(self
  // OCP.OCP.gp.gp_Ax2.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Ax2, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.gp.gp_Ax2.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Ax2, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Axis(self
  // OCP.OCP.gp.gp_Ax2.Axis (method)
  Axis(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax1

  // Direction(self
  // OCP.OCP.gp.gp_Ax2.Direction (method)
  Direction(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // Location(self
  // OCP.OCP.gp.gp_Ax2.Location (method)
  Location(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pnt

  // XDirection(self
  // OCP.OCP.gp.gp_Ax2.XDirection (method)
  XDirection(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // YDirection(self
  // OCP.OCP.gp.gp_Ax2.YDirection (method)
  YDirection(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

// Describes a coordinate system in 3D space
gp_Ax3

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax3) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theA: OCP.OCP.gp.gp_Ax2) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theN: OCP.OCP.gp.gp_Dir, theVx: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // XReverse(self
  // OCP.OCP.gp.gp_Ax3.XReverse (method)
  XReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // YReverse(self
  // OCP.OCP.gp.gp_Ax3.YReverse (method)
  YReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // ZReverse(self
  // OCP.OCP.gp.gp_Ax3.ZReverse (method)
  ZReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // SetAxis(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.SetAxis (method)
  SetAxis(*args, **kwargs)
  SetAxis(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None
  SetAxis(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetDirection(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.SetDirection (method)
  SetDirection(*args, **kwargs)
  SetDirection(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Dir) -> None
  SetDirection(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  // OCP.OCP.gp.gp_Ax3.SetLocation (method)
  SetLocation(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetXDirection(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.SetXDirection (method)
  SetXDirection(*args, **kwargs)
  SetXDirection(self: OCP.OCP.gp.gp_Ax3, theVx: OCP.OCP.gp.gp_Dir) -> None
  SetXDirection(self: OCP.OCP.gp.gp_Ax3, theVx: OCP.OCP.gp.gp_Dir) -> None

  // SetYDirection(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.SetYDirection (method)
  SetYDirection(*args, **kwargs)
  SetYDirection(self: OCP.OCP.gp.gp_Ax3, theVy: OCP.OCP.gp.gp_Dir) -> None
  SetYDirection(self: OCP.OCP.gp.gp_Ax3, theVy: OCP.OCP.gp.gp_Dir) -> None

  // Angle(self
  // OCP.OCP.gp.gp_Ax3.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3) -> float

  // Ax2(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.Ax2 (method)
  Ax2(*args, **kwargs)
  Ax2(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax2
  Ax2(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax2

  // Direct(self
  // OCP.OCP.gp.gp_Ax3.Direct (method)
  Direct(self: OCP.OCP.gp.gp_Ax3) -> bool

  // IsCoplanar(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.IsCoplanar (method)
  IsCoplanar(*args, **kwargs)
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax3, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax3
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax3
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax3

  // Rotate(self
  // OCP.OCP.gp.gp_Ax3.Rotate (method)
  Rotate(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Ax3.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Ax3

  // Scale(self
  // OCP.OCP.gp.gp_Ax3.Scale (method)
  Scale(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  // OCP.OCP.gp.gp_Ax3.Scaled (method)
  Scaled(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax3

  // Transform(self
  // OCP.OCP.gp.gp_Ax3.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Ax3, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Ax3.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Ax3, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax3

  // Translate(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.Translate (method)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax3, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  // OCP.OCP.gp.gp_Ax3.Translated (method)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax3
  Translated(self: OCP.OCP.gp.gp_Ax3, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax3

  // DumpJson(self
  // OCP.OCP.gp.gp_Ax3.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Ax3, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.gp.gp_Ax3.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Ax3, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Axis(self
  // OCP.OCP.gp.gp_Ax3.Axis (method)
  Axis(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax1

  // Direction(self
  // OCP.OCP.gp.gp_Ax3.Direction (method)
  Direction(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir

  // Location(self
  // OCP.OCP.gp.gp_Ax3.Location (method)
  Location(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Pnt

  // XDirection(self
  // OCP.OCP.gp.gp_Ax3.XDirection (method)
  XDirection(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir

  // YDirection(self
  // OCP.OCP.gp.gp_Ax3.YDirection (method)
  YDirection(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir

// Describes a unit vector in 3D space
gp_Dir

  // __init__(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None

  // SetCoord(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.SetCoord (method)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Dir, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None

  // SetX(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.SetX (method)
  SetX(*args, **kwargs)
  SetX(self: OCP.OCP.gp.gp_Dir, theX: float) -> None
  SetX(self: OCP.OCP.gp.gp_Dir, theX: float) -> None

  // SetY(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.SetY (method)
  SetY(*args, **kwargs)
  SetY(self: OCP.OCP.gp.gp_Dir, theY: float) -> None
  SetY(self: OCP.OCP.gp.gp_Dir, theY: float) -> None

  // SetZ(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.SetZ (method)
  SetZ(*args, **kwargs)
  SetZ(self: OCP.OCP.gp.gp_Dir, theZ: float) -> None
  SetZ(self: OCP.OCP.gp.gp_Dir, theZ: float) -> None

  // SetXYZ(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.SetXYZ (method)
  SetXYZ(*args, **kwargs)
  SetXYZ(self: OCP.OCP.gp.gp_Dir, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  SetXYZ(self: OCP.OCP.gp.gp_Dir, theXYZ: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.Coord (method)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Dir, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Dir) -> tuple[float, float, float]

  // X(self
  // OCP.OCP.gp.gp_Dir.X (method)
  X(self: OCP.OCP.gp.gp_Dir) -> float

  // Y(self
  // OCP.OCP.gp.gp_Dir.Y (method)
  Y(self: OCP.OCP.gp.gp_Dir) -> float

  // Z(self
  // OCP.OCP.gp.gp_Dir.Z (method)
  Z(self: OCP.OCP.gp.gp_Dir) -> float

  // IsEqual(self
  // OCP.OCP.gp.gp_Dir.IsEqual (method)
  IsEqual(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsNormal(self
  // OCP.OCP.gp.gp_Dir.IsNormal (method)
  IsNormal(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsOpposite(self
  // OCP.OCP.gp.gp_Dir.IsOpposite (method)
  IsOpposite(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsParallel(self
  // OCP.OCP.gp.gp_Dir.IsParallel (method)
  IsParallel(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // Angle(self
  // OCP.OCP.gp.gp_Dir.Angle (method)
  Angle(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir) -> float

  // AngleWithRef(self
  // OCP.OCP.gp.gp_Dir.AngleWithRef (method)
  AngleWithRef(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theVRef: OCP.OCP.gp.gp_Dir) -> float

  // Cross(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.Cross (method)
  Cross(*args, **kwargs)
  Cross(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> None
  Cross(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> None

  // Crossed(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.Crossed (method)
  Crossed(*args, **kwargs)
  Crossed(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  Crossed(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // CrossCross(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.CrossCross (method)
  CrossCross(*args, **kwargs)
  CrossCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> None
  CrossCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> None

  // CrossCrossed(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.CrossCrossed (method)
  CrossCrossed(*args, **kwargs)
  CrossCrossed(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  CrossCrossed(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // Dot(self
  // OCP.OCP.gp.gp_Dir.Dot (method)
  Dot(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir) -> float

  // DotCross(self
  // OCP.OCP.gp.gp_Dir.DotCross (method)
  DotCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> float

  // Reverse(self
  // OCP.OCP.gp.gp_Dir.Reverse (method)
  Reverse(self: OCP.OCP.gp.gp_Dir) -> None

  // Reversed(self
  // OCP.OCP.gp.gp_Dir.Reversed (method)
  Reversed(self: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // Mirror(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.Mirror (method)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Dir) -> None
  Mirror(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Dir, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.Mirrored (method)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  Mirrored(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Dir
  Mirrored(self: OCP.OCP.gp.gp_Dir, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // Rotate(*args, **kwargs)
  // OCP.OCP.gp.gp_Dir.Rotate (method)
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  // OCP.OCP.gp.gp_Dir.Rotated (method)
  Rotated(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Dir

  // Transform(self
  // OCP.OCP.gp.gp_Dir.Transform (method)
  Transform(self: OCP.OCP.gp.gp_Dir, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  // OCP.OCP.gp.gp_Dir.Transformed (method)
  Transformed(self: OCP.OCP.gp.gp_Dir, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Dir

  // DumpJson(self
  // OCP.OCP.gp.gp_Dir.DumpJson (method)
  DumpJson(self: OCP.OCP.gp.gp_Dir, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.gp.gp_Dir.InitFromJson (method)
  InitFromJson(self: OCP.OCP.gp.gp_Dir, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // XYZ(self
  // OCP.OCP.gp.gp_Dir.XYZ (method)
  XYZ(self: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_XYZ

// Enumerates all 24 possible variants of generalized Euler angles, defining general 3d rotation by three rotations around main axes of coordinate system, in different possible orders
gp_EulerSequence

  // __init__(self
  // OCP.OCP.gp.gp_EulerSequence.__init__ (constructor)
  __init__(self: OCP.OCP.gp.gp_EulerSequence, value: int) -> None

  // name(self
  name

  value
