# build123d — Bnd

2 top-level symbols. Signatures are verbatim python.

// Describes a bounding box in 3D space
Bnd_Box

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Bnd.Bnd_Box) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_Box, theMin: OCP.OCP.gp.gp_Pnt, theMax: OCP.OCP.gp.gp_Pnt) -> None

  // SetWhole(self
  SetWhole(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // SetVoid(self
  SetVoid(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // Set(*args, **kwargs)
  Set(*args, **kwargs)
  Set(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> None
  Set(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> None

  // Update(*args, **kwargs)
  Update(*args, **kwargs)
  Update(self: OCP.OCP.Bnd.Bnd_Box, aXmin: float, aYmin: float, aZmin: float, aXmax: float, aYmax: float, aZmax: float) -> None
  Update(self: OCP.OCP.Bnd.Bnd_Box, X: float, Y: float, Z: float) -> None

  // GetGap(self
  GetGap(self: OCP.OCP.Bnd.Bnd_Box) -> float

  // SetGap(self
  SetGap(self: OCP.OCP.Bnd.Bnd_Box, Tol: float) -> None

  // Enlarge(self
  Enlarge(self: OCP.OCP.Bnd.Bnd_Box, Tol: float) -> None

  // CornerMin(self
  CornerMin(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.gp.gp_Pnt

  // CornerMax(self
  CornerMax(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.gp.gp_Pnt

  // OpenXmin(self
  OpenXmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenXmax(self
  OpenXmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenYmin(self
  OpenYmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenYmax(self
  OpenYmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenZmin(self
  OpenZmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenZmax(self
  OpenZmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // IsOpen(self
  IsOpen(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenXmin(self
  IsOpenXmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenXmax(self
  IsOpenXmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenYmin(self
  IsOpenYmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenYmax(self
  IsOpenYmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenZmin(self
  IsOpenZmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenZmax(self
  IsOpenZmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsWhole(self
  IsWhole(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsVoid(self
  IsVoid(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsXThin(self
  IsXThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsYThin(self
  IsYThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsZThin(self
  IsZThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsThin(self
  IsThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // Transformed(self
  Transformed(self: OCP.OCP.Bnd.Bnd_Box, T: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.Bnd.Bnd_Box

  // Add(*args, **kwargs)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, D: OCP.OCP.gp.gp_Dir) -> None

  // IsOut(*args, **kwargs)
  IsOut(*args, **kwargs)
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, L: OCP.OCP.gp.gp_Lin) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pln) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box, T: OCP.OCP.gp.gp_Trsf) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, T1: OCP.OCP.gp.gp_Trsf, Other: OCP.OCP.Bnd.Bnd_Box, T2: OCP.OCP.gp.gp_Trsf) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> bool

  // Distance(self
  Distance(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> float

  // Dump(self
  Dump(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // SquareExtent(self
  SquareExtent(self: OCP.OCP.Bnd.Bnd_Box) -> float

  // FinitePart(self
  FinitePart(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.Bnd.Bnd_Box

  // HasFinitePart(self
  HasFinitePart(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // DumpJson(self
  DumpJson(self: OCP.OCP.Bnd.Bnd_Box, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  InitFromJson(self: OCP.OCP.Bnd.Bnd_Box, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Get(self
  Get(self: OCP.OCP.Bnd.Bnd_Box) -> tuple[float, float, float, float, float, float]

// The class describes the Oriented Bounding Box (OBB), much tighter enclosing volume for the shape than the Axis Aligned Bounding Box (AABB)
Bnd_OBB

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Bnd.Bnd_OBB) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_OBB, theCenter: OCP.OCP.gp.gp_Pnt, theXDirection: OCP.OCP.gp.gp_Dir, theYDirection: OCP.OCP.gp.gp_Dir, theZDirection: OCP.OCP.gp.gp_Dir, theHXSize: float, theHYSize: float, theHZSize: float) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_OBB, theBox: OCP.OCP.Bnd.Bnd_Box) -> None

  // ReBuild(self
  ReBuild(self: OCP.OCP.Bnd.Bnd_OBB, theListOfPoints: OCP.OCP.TColgp.TColgp_Array1OfPnt, theListOfTolerances: OCP.OCP.TColStd.TColStd_Array1OfReal = None, theIsOptimal: bool = False) -> None

  // SetCenter(self
  SetCenter(self: OCP.OCP.Bnd.Bnd_OBB, theCenter: OCP.OCP.gp.gp_Pnt) -> None

  // SetXComponent(self
  SetXComponent(self: OCP.OCP.Bnd.Bnd_OBB, theXDirection: OCP.OCP.gp.gp_Dir, theHXSize: float) -> None

  // SetYComponent(self
  SetYComponent(self: OCP.OCP.Bnd.Bnd_OBB, theYDirection: OCP.OCP.gp.gp_Dir, theHYSize: float) -> None

  // SetZComponent(self
  SetZComponent(self: OCP.OCP.Bnd.Bnd_OBB, theZDirection: OCP.OCP.gp.gp_Dir, theHZSize: float) -> None

  // Position(self
  Position(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_Ax3

  // XHSize(self
  XHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // YHSize(self
  YHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // ZHSize(self
  ZHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // IsVoid(self
  IsVoid(self: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // SetVoid(self
  SetVoid(self: OCP.OCP.Bnd.Bnd_OBB) -> None

  // SetAABox(self
  SetAABox(self: OCP.OCP.Bnd.Bnd_OBB, theFlag: bool) -> None

  // IsAABox(self
  IsAABox(self: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // Enlarge(self
  Enlarge(self: OCP.OCP.Bnd.Bnd_OBB, theGapAdd: float) -> None

  // GetVertex(self
  GetVertex(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> bool

  // SquareExtent(self
  SquareExtent(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // IsOut(*args, **kwargs)
  IsOut(*args, **kwargs)
  IsOut(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> bool

  // IsCompletelyInside(self
  IsCompletelyInside(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // Add(*args, **kwargs)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> None
  Add(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> None

  // DumpJson(self
  DumpJson(self: OCP.OCP.Bnd.Bnd_OBB, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Center(self
  Center(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // XDirection(self
  XDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // YDirection(self
  YDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // ZDirection(self
  ZDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ
