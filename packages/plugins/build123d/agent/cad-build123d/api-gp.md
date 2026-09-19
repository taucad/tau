# build123d — gp

5 top-level symbols. Signatures are verbatim python.

// Describes an axis in 3D space
gp_Ax1

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax1) -> None
  __init__(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetDirection(self
  SetDirection(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  SetLocation(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt) -> None

  // IsCoaxial(self
  IsCoaxial(self: OCP.OCP.gp.gp_Ax1, Other: OCP.OCP.gp.gp_Ax1, AngularTolerance: float, LinearTolerance: float) -> bool

  // IsNormal(self
  IsNormal(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // IsOpposite(self
  IsOpposite(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // IsParallel(self
  IsParallel(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1, theAngularTolerance: float) -> bool

  // Angle(self
  Angle(self: OCP.OCP.gp.gp_Ax1, theOther: OCP.OCP.gp.gp_Ax1) -> float

  // Reverse(self
  Reverse(self: OCP.OCP.gp.gp_Ax1) -> None

  // Reversed(self
  Reversed(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax1

  // Mirror(*args, **kwargs)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax1, P: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax1, A1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax1, A2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax1, P: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax1
  Mirrored(self: OCP.OCP.gp.gp_Ax1, A1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax1
  Mirrored(self: OCP.OCP.gp.gp_Ax1, A2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax1

  // Rotate(self
  Rotate(self: OCP.OCP.gp.gp_Ax1, theA1: OCP.OCP.gp.gp_Ax1, theAngRad: float) -> None

  // Rotated(self
  Rotated(self: OCP.OCP.gp.gp_Ax1, theA1: OCP.OCP.gp.gp_Ax1, theAngRad: float) -> OCP.OCP.gp.gp_Ax1

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  Scaled(self: OCP.OCP.gp.gp_Ax1, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax1

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Ax1, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  Transformed(self: OCP.OCP.gp.gp_Ax1, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax1

  // Translate(*args, **kwargs)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax1, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax1, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax1
  Translated(self: OCP.OCP.gp.gp_Ax1, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax1

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_Ax1, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  InitFromJson(self: OCP.OCP.gp.gp_Ax1, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Direction(self
  Direction(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Dir

  // Location(self
  Location(self: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Pnt

// Describes a right-handed coordinate system in 3D space
gp_Ax2

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax2) -> None
  __init__(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt, N: OCP.OCP.gp.gp_Dir, Vx: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt, V: OCP.OCP.gp.gp_Dir) -> None

  // SetAxis(*args, **kwargs)
  SetAxis(*args, **kwargs)
  SetAxis(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> None
  SetAxis(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetDirection(*args, **kwargs)
  SetDirection(*args, **kwargs)
  SetDirection(self: OCP.OCP.gp.gp_Ax2, V: OCP.OCP.gp.gp_Dir) -> None
  SetDirection(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  SetLocation(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetXDirection(self
  SetXDirection(self: OCP.OCP.gp.gp_Ax2, theVx: OCP.OCP.gp.gp_Dir) -> None

  // SetYDirection(self
  SetYDirection(self: OCP.OCP.gp.gp_Ax2, theVy: OCP.OCP.gp.gp_Dir) -> None

  // Angle(self
  Angle(self: OCP.OCP.gp.gp_Ax2, theOther: OCP.OCP.gp.gp_Ax2) -> float

  // IsCoplanar(*args, **kwargs)
  IsCoplanar(*args, **kwargs)
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, Other: OCP.OCP.gp.gp_Ax2, LinearTolerance: float, AngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1, LinearTolerance: float, AngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, theOther: OCP.OCP.gp.gp_Ax2, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax2, theA: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax2, A2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax2, P: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax2
  Mirrored(self: OCP.OCP.gp.gp_Ax2, A1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax2
  Mirrored(self: OCP.OCP.gp.gp_Ax2, A2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax2

  // Rotate(self
  Rotate(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  Rotated(self: OCP.OCP.gp.gp_Ax2, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Ax2

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  Scaled(self: OCP.OCP.gp.gp_Ax2, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax2

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Ax2, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  Transformed(self: OCP.OCP.gp.gp_Ax2, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax2

  // Translate(*args, **kwargs)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax2, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax2, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax2
  Translated(self: OCP.OCP.gp.gp_Ax2, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax2

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_Ax2, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  InitFromJson(self: OCP.OCP.gp.gp_Ax2, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Axis(self
  Axis(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax1

  // Direction(self
  Direction(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // Location(self
  Location(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Pnt

  // XDirection(self
  XDirection(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // YDirection(self
  YDirection(self: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

// Describes a coordinate system in 3D space
gp_Ax3

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Ax3) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theA: OCP.OCP.gp.gp_Ax2) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theN: OCP.OCP.gp.gp_Dir, theVx: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theV: OCP.OCP.gp.gp_Dir) -> None

  // XReverse(self
  XReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // YReverse(self
  YReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // ZReverse(self
  ZReverse(self: OCP.OCP.gp.gp_Ax3) -> None

  // SetAxis(*args, **kwargs)
  SetAxis(*args, **kwargs)
  SetAxis(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None
  SetAxis(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None

  // SetDirection(*args, **kwargs)
  SetDirection(*args, **kwargs)
  SetDirection(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Dir) -> None
  SetDirection(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Dir) -> None

  // SetLocation(self
  SetLocation(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> None

  // SetXDirection(*args, **kwargs)
  SetXDirection(*args, **kwargs)
  SetXDirection(self: OCP.OCP.gp.gp_Ax3, theVx: OCP.OCP.gp.gp_Dir) -> None
  SetXDirection(self: OCP.OCP.gp.gp_Ax3, theVx: OCP.OCP.gp.gp_Dir) -> None

  // SetYDirection(*args, **kwargs)
  SetYDirection(*args, **kwargs)
  SetYDirection(self: OCP.OCP.gp.gp_Ax3, theVy: OCP.OCP.gp.gp_Dir) -> None
  SetYDirection(self: OCP.OCP.gp.gp_Ax3, theVy: OCP.OCP.gp.gp_Dir) -> None

  // Angle(self
  Angle(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3) -> float

  // Ax2(*args, **kwargs)
  Ax2(*args, **kwargs)
  Ax2(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax2
  Ax2(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax2

  // Direct(self
  Direct(self: OCP.OCP.gp.gp_Ax3) -> bool

  // IsCoplanar(*args, **kwargs)
  IsCoplanar(*args, **kwargs)
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theOther: OCP.OCP.gp.gp_Ax3, theLinearTolerance: float, theAngularTolerance: float) -> bool
  IsCoplanar(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theLinearTolerance: float, theAngularTolerance: float) -> bool

  // Mirror(*args, **kwargs)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Ax3, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax3
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Ax3
  Mirrored(self: OCP.OCP.gp.gp_Ax3, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Ax3

  // Rotate(self
  Rotate(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  Rotated(self: OCP.OCP.gp.gp_Ax3, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Ax3

  // Scale(self
  Scale(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> None

  // Scaled(self
  Scaled(self: OCP.OCP.gp.gp_Ax3, theP: OCP.OCP.gp.gp_Pnt, theS: float) -> OCP.OCP.gp.gp_Ax3

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Ax3, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  Transformed(self: OCP.OCP.gp.gp_Ax3, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Ax3

  // Translate(*args, **kwargs)
  Translate(*args, **kwargs)
  Translate(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Vec) -> None
  Translate(self: OCP.OCP.gp.gp_Ax3, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> None

  // Translated(*args, **kwargs)
  Translated(*args, **kwargs)
  Translated(self: OCP.OCP.gp.gp_Ax3, theV: OCP.OCP.gp.gp_Vec) -> OCP.OCP.gp.gp_Ax3
  Translated(self: OCP.OCP.gp.gp_Ax3, theP1: OCP.OCP.gp.gp_Pnt, theP2: OCP.OCP.gp.gp_Pnt) -> OCP.OCP.gp.gp_Ax3

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_Ax3, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  InitFromJson(self: OCP.OCP.gp.gp_Ax3, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Axis(self
  Axis(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Ax1

  // Direction(self
  Direction(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir

  // Location(self
  Location(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Pnt

  // XDirection(self
  XDirection(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir

  // YDirection(self
  YDirection(self: OCP.OCP.gp.gp_Ax3) -> OCP.OCP.gp.gp_Dir

// Describes a unit vector in 3D space
gp_Dir

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.gp.gp_Dir) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Vec) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  __init__(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None

  // SetCoord(*args, **kwargs)
  SetCoord(*args, **kwargs)
  SetCoord(self: OCP.OCP.gp.gp_Dir, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theIndex: int, theXi: float) -> None
  SetCoord(self: OCP.OCP.gp.gp_Dir, theXv: float, theYv: float, theZv: float) -> None

  // SetX(*args, **kwargs)
  SetX(*args, **kwargs)
  SetX(self: OCP.OCP.gp.gp_Dir, theX: float) -> None
  SetX(self: OCP.OCP.gp.gp_Dir, theX: float) -> None

  // SetY(*args, **kwargs)
  SetY(*args, **kwargs)
  SetY(self: OCP.OCP.gp.gp_Dir, theY: float) -> None
  SetY(self: OCP.OCP.gp.gp_Dir, theY: float) -> None

  // SetZ(*args, **kwargs)
  SetZ(*args, **kwargs)
  SetZ(self: OCP.OCP.gp.gp_Dir, theZ: float) -> None
  SetZ(self: OCP.OCP.gp.gp_Dir, theZ: float) -> None

  // SetXYZ(*args, **kwargs)
  SetXYZ(*args, **kwargs)
  SetXYZ(self: OCP.OCP.gp.gp_Dir, theCoord: OCP.OCP.gp.gp_XYZ) -> None
  SetXYZ(self: OCP.OCP.gp.gp_Dir, theXYZ: OCP.OCP.gp.gp_XYZ) -> None

  // Coord(*args, **kwargs)
  Coord(*args, **kwargs)
  Coord(self: OCP.OCP.gp.gp_Dir, theIndex: int) -> float
  Coord(self: OCP.OCP.gp.gp_Dir) -> tuple[float, float, float]

  // X(self
  X(self: OCP.OCP.gp.gp_Dir) -> float

  // Y(self
  Y(self: OCP.OCP.gp.gp_Dir) -> float

  // Z(self
  Z(self: OCP.OCP.gp.gp_Dir) -> float

  // IsEqual(self
  IsEqual(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsNormal(self
  IsNormal(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsOpposite(self
  IsOpposite(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // IsParallel(self
  IsParallel(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theAngularTolerance: float) -> bool

  // Angle(self
  Angle(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir) -> float

  // AngleWithRef(self
  AngleWithRef(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir, theVRef: OCP.OCP.gp.gp_Dir) -> float

  // Cross(*args, **kwargs)
  Cross(*args, **kwargs)
  Cross(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> None
  Cross(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> None

  // Crossed(*args, **kwargs)
  Crossed(*args, **kwargs)
  Crossed(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  Crossed(self: OCP.OCP.gp.gp_Dir, theRight: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // CrossCross(*args, **kwargs)
  CrossCross(*args, **kwargs)
  CrossCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> None
  CrossCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> None

  // CrossCrossed(*args, **kwargs)
  CrossCrossed(*args, **kwargs)
  CrossCrossed(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  CrossCrossed(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // Dot(self
  Dot(self: OCP.OCP.gp.gp_Dir, theOther: OCP.OCP.gp.gp_Dir) -> float

  // DotCross(self
  DotCross(self: OCP.OCP.gp.gp_Dir, theV1: OCP.OCP.gp.gp_Dir, theV2: OCP.OCP.gp.gp_Dir) -> float

  // Reverse(self
  Reverse(self: OCP.OCP.gp.gp_Dir) -> None

  // Reversed(self
  Reversed(self: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir

  // Mirror(*args, **kwargs)
  Mirror(*args, **kwargs)
  Mirror(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Dir) -> None
  Mirror(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1) -> None
  Mirror(self: OCP.OCP.gp.gp_Dir, theA2: OCP.OCP.gp.gp_Ax2) -> None

  // Mirrored(*args, **kwargs)
  Mirrored(*args, **kwargs)
  Mirrored(self: OCP.OCP.gp.gp_Dir, theV: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_Dir
  Mirrored(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1) -> OCP.OCP.gp.gp_Dir
  Mirrored(self: OCP.OCP.gp.gp_Dir, theA2: OCP.OCP.gp.gp_Ax2) -> OCP.OCP.gp.gp_Dir

  // Rotate(*args, **kwargs)
  Rotate(*args, **kwargs)
  Rotate(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None
  Rotate(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> None

  // Rotated(self
  Rotated(self: OCP.OCP.gp.gp_Dir, theA1: OCP.OCP.gp.gp_Ax1, theAng: float) -> OCP.OCP.gp.gp_Dir

  // Transform(self
  Transform(self: OCP.OCP.gp.gp_Dir, theT: OCP.OCP.gp.gp_Trsf) -> None

  // Transformed(self
  Transformed(self: OCP.OCP.gp.gp_Dir, theT: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.gp.gp_Dir

  // DumpJson(self
  DumpJson(self: OCP.OCP.gp.gp_Dir, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  InitFromJson(self: OCP.OCP.gp.gp_Dir, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // XYZ(self
  XYZ(self: OCP.OCP.gp.gp_Dir) -> OCP.OCP.gp.gp_XYZ

// Enumerates all 24 possible variants of generalized Euler angles, defining general 3d rotation by three rotations around main axes of coordinate system, in different possible orders
gp_EulerSequence

  // __init__(self
  __init__(self: OCP.OCP.gp.gp_EulerSequence, value: int) -> None

  // name(self
  name

  value
