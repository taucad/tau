# build123d — Bnd

2 top-level symbols. Signatures are verbatim python.

// Describes a bounding box in 3D space
Bnd_Box

  // __init__(*args, **kwargs)
  // OCP.OCP.Bnd.Bnd_Box.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Bnd.Bnd_Box) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_Box, theMin: OCP.OCP.gp.gp_Pnt, theMax: OCP.OCP.gp.gp_Pnt) -> None

  // SetWhole(self
  // OCP.OCP.Bnd.Bnd_Box.SetWhole (method)
  SetWhole(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // SetVoid(self
  // OCP.OCP.Bnd.Bnd_Box.SetVoid (method)
  SetVoid(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // Set(*args, **kwargs)
  // OCP.OCP.Bnd.Bnd_Box.Set (method)
  Set(*args, **kwargs)
  Set(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> None
  Set(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> None

  // Update(*args, **kwargs)
  // OCP.OCP.Bnd.Bnd_Box.Update (method)
  Update(*args, **kwargs)
  Update(self: OCP.OCP.Bnd.Bnd_Box, aXmin: float, aYmin: float, aZmin: float, aXmax: float, aYmax: float, aZmax: float) -> None
  Update(self: OCP.OCP.Bnd.Bnd_Box, X: float, Y: float, Z: float) -> None

  // GetGap(self
  // OCP.OCP.Bnd.Bnd_Box.GetGap (method)
  GetGap(self: OCP.OCP.Bnd.Bnd_Box) -> float

  // SetGap(self
  // OCP.OCP.Bnd.Bnd_Box.SetGap (method)
  SetGap(self: OCP.OCP.Bnd.Bnd_Box, Tol: float) -> None

  // Enlarge(self
  // OCP.OCP.Bnd.Bnd_Box.Enlarge (method)
  Enlarge(self: OCP.OCP.Bnd.Bnd_Box, Tol: float) -> None

  // CornerMin(self
  // OCP.OCP.Bnd.Bnd_Box.CornerMin (method)
  CornerMin(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.gp.gp_Pnt

  // CornerMax(self
  // OCP.OCP.Bnd.Bnd_Box.CornerMax (method)
  CornerMax(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.gp.gp_Pnt

  // OpenXmin(self
  // OCP.OCP.Bnd.Bnd_Box.OpenXmin (method)
  OpenXmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenXmax(self
  // OCP.OCP.Bnd.Bnd_Box.OpenXmax (method)
  OpenXmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenYmin(self
  // OCP.OCP.Bnd.Bnd_Box.OpenYmin (method)
  OpenYmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenYmax(self
  // OCP.OCP.Bnd.Bnd_Box.OpenYmax (method)
  OpenYmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenZmin(self
  // OCP.OCP.Bnd.Bnd_Box.OpenZmin (method)
  OpenZmin(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // OpenZmax(self
  // OCP.OCP.Bnd.Bnd_Box.OpenZmax (method)
  OpenZmax(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // IsOpen(self
  // OCP.OCP.Bnd.Bnd_Box.IsOpen (method)
  IsOpen(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenXmin(self
  // OCP.OCP.Bnd.Bnd_Box.IsOpenXmin (method)
  IsOpenXmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenXmax(self
  // OCP.OCP.Bnd.Bnd_Box.IsOpenXmax (method)
  IsOpenXmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenYmin(self
  // OCP.OCP.Bnd.Bnd_Box.IsOpenYmin (method)
  IsOpenYmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenYmax(self
  // OCP.OCP.Bnd.Bnd_Box.IsOpenYmax (method)
  IsOpenYmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenZmin(self
  // OCP.OCP.Bnd.Bnd_Box.IsOpenZmin (method)
  IsOpenZmin(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsOpenZmax(self
  // OCP.OCP.Bnd.Bnd_Box.IsOpenZmax (method)
  IsOpenZmax(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsWhole(self
  // OCP.OCP.Bnd.Bnd_Box.IsWhole (method)
  IsWhole(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsVoid(self
  // OCP.OCP.Bnd.Bnd_Box.IsVoid (method)
  IsVoid(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // IsXThin(self
  // OCP.OCP.Bnd.Bnd_Box.IsXThin (method)
  IsXThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsYThin(self
  // OCP.OCP.Bnd.Bnd_Box.IsYThin (method)
  IsYThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsZThin(self
  // OCP.OCP.Bnd.Bnd_Box.IsZThin (method)
  IsZThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // IsThin(self
  // OCP.OCP.Bnd.Bnd_Box.IsThin (method)
  IsThin(self: OCP.OCP.Bnd.Bnd_Box, tol: float) -> bool

  // Transformed(self
  // OCP.OCP.Bnd.Bnd_Box.Transformed (method)
  Transformed(self: OCP.OCP.Bnd.Bnd_Box, T: OCP.OCP.gp.gp_Trsf) -> OCP.OCP.Bnd.Bnd_Box

  // Add(*args, **kwargs)
  // OCP.OCP.Bnd.Bnd_Box.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> None
  Add(self: OCP.OCP.Bnd.Bnd_Box, D: OCP.OCP.gp.gp_Dir) -> None

  // IsOut(*args, **kwargs)
  // OCP.OCP.Bnd.Bnd_Box.IsOut (method)
  IsOut(*args, **kwargs)
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pnt) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, L: OCP.OCP.gp.gp_Lin) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P: OCP.OCP.gp.gp_Pln) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box, T: OCP.OCP.gp.gp_Trsf) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, T1: OCP.OCP.gp.gp_Trsf, Other: OCP.OCP.Bnd.Bnd_Box, T2: OCP.OCP.gp.gp_Trsf) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_Box, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, D: OCP.OCP.gp.gp_Dir) -> bool

  // Distance(self
  // OCP.OCP.Bnd.Bnd_Box.Distance (method)
  Distance(self: OCP.OCP.Bnd.Bnd_Box, Other: OCP.OCP.Bnd.Bnd_Box) -> float

  // Dump(self
  // OCP.OCP.Bnd.Bnd_Box.Dump (method)
  Dump(self: OCP.OCP.Bnd.Bnd_Box) -> None

  // SquareExtent(self
  // OCP.OCP.Bnd.Bnd_Box.SquareExtent (method)
  SquareExtent(self: OCP.OCP.Bnd.Bnd_Box) -> float

  // FinitePart(self
  // OCP.OCP.Bnd.Bnd_Box.FinitePart (method)
  FinitePart(self: OCP.OCP.Bnd.Bnd_Box) -> OCP.OCP.Bnd.Bnd_Box

  // HasFinitePart(self
  // OCP.OCP.Bnd.Bnd_Box.HasFinitePart (method)
  HasFinitePart(self: OCP.OCP.Bnd.Bnd_Box) -> bool

  // DumpJson(self
  // OCP.OCP.Bnd.Bnd_Box.DumpJson (method)
  DumpJson(self: OCP.OCP.Bnd.Bnd_Box, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // InitFromJson(self
  // OCP.OCP.Bnd.Bnd_Box.InitFromJson (method)
  InitFromJson(self: OCP.OCP.Bnd.Bnd_Box, theSStream: std::__1::basic_stringstream<char, std::__1::char_traits<char>, std::__1::allocator<char>>, theStreamPos: int) -> bool

  // Get(self
  // OCP.OCP.Bnd.Bnd_Box.Get (method)
  Get(self: OCP.OCP.Bnd.Bnd_Box) -> tuple[float, float, float, float, float, float]

// The class describes the Oriented Bounding Box (OBB), much tighter enclosing volume for the shape than the Axis Aligned Bounding Box (AABB)
Bnd_OBB

  // __init__(*args, **kwargs)
  // OCP.OCP.Bnd.Bnd_OBB.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Bnd.Bnd_OBB) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_OBB, theCenter: OCP.OCP.gp.gp_Pnt, theXDirection: OCP.OCP.gp.gp_Dir, theYDirection: OCP.OCP.gp.gp_Dir, theZDirection: OCP.OCP.gp.gp_Dir, theHXSize: float, theHYSize: float, theHZSize: float) -> None
  __init__(self: OCP.OCP.Bnd.Bnd_OBB, theBox: OCP.OCP.Bnd.Bnd_Box) -> None

  // ReBuild(self
  // OCP.OCP.Bnd.Bnd_OBB.ReBuild (method)
  ReBuild(self: OCP.OCP.Bnd.Bnd_OBB, theListOfPoints: OCP.OCP.TColgp.TColgp_Array1OfPnt, theListOfTolerances: OCP.OCP.TColStd.TColStd_Array1OfReal = None, theIsOptimal: bool = False) -> None

  // SetCenter(self
  // OCP.OCP.Bnd.Bnd_OBB.SetCenter (method)
  SetCenter(self: OCP.OCP.Bnd.Bnd_OBB, theCenter: OCP.OCP.gp.gp_Pnt) -> None

  // SetXComponent(self
  // OCP.OCP.Bnd.Bnd_OBB.SetXComponent (method)
  SetXComponent(self: OCP.OCP.Bnd.Bnd_OBB, theXDirection: OCP.OCP.gp.gp_Dir, theHXSize: float) -> None

  // SetYComponent(self
  // OCP.OCP.Bnd.Bnd_OBB.SetYComponent (method)
  SetYComponent(self: OCP.OCP.Bnd.Bnd_OBB, theYDirection: OCP.OCP.gp.gp_Dir, theHYSize: float) -> None

  // SetZComponent(self
  // OCP.OCP.Bnd.Bnd_OBB.SetZComponent (method)
  SetZComponent(self: OCP.OCP.Bnd.Bnd_OBB, theZDirection: OCP.OCP.gp.gp_Dir, theHZSize: float) -> None

  // Position(self
  // OCP.OCP.Bnd.Bnd_OBB.Position (method)
  Position(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_Ax3

  // XHSize(self
  // OCP.OCP.Bnd.Bnd_OBB.XHSize (method)
  XHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // YHSize(self
  // OCP.OCP.Bnd.Bnd_OBB.YHSize (method)
  YHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // ZHSize(self
  // OCP.OCP.Bnd.Bnd_OBB.ZHSize (method)
  ZHSize(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // IsVoid(self
  // OCP.OCP.Bnd.Bnd_OBB.IsVoid (method)
  IsVoid(self: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // SetVoid(self
  // OCP.OCP.Bnd.Bnd_OBB.SetVoid (method)
  SetVoid(self: OCP.OCP.Bnd.Bnd_OBB) -> None

  // SetAABox(self
  // OCP.OCP.Bnd.Bnd_OBB.SetAABox (method)
  SetAABox(self: OCP.OCP.Bnd.Bnd_OBB, theFlag: bool) -> None

  // IsAABox(self
  // OCP.OCP.Bnd.Bnd_OBB.IsAABox (method)
  IsAABox(self: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // Enlarge(self
  // OCP.OCP.Bnd.Bnd_OBB.Enlarge (method)
  Enlarge(self: OCP.OCP.Bnd.Bnd_OBB, theGapAdd: float) -> None

  // GetVertex(self
  // OCP.OCP.Bnd.Bnd_OBB.GetVertex (method)
  GetVertex(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> bool

  // SquareExtent(self
  // OCP.OCP.Bnd.Bnd_OBB.SquareExtent (method)
  SquareExtent(self: OCP.OCP.Bnd.Bnd_OBB) -> float

  // IsOut(*args, **kwargs)
  // OCP.OCP.Bnd.Bnd_OBB.IsOut (method)
  IsOut(*args, **kwargs)
  IsOut(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> bool
  IsOut(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> bool

  // IsCompletelyInside(self
  // OCP.OCP.Bnd.Bnd_OBB.IsCompletelyInside (method)
  IsCompletelyInside(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> bool

  // Add(*args, **kwargs)
  // OCP.OCP.Bnd.Bnd_OBB.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.Bnd.Bnd_OBB, theOther: OCP.OCP.Bnd.Bnd_OBB) -> None
  Add(self: OCP.OCP.Bnd.Bnd_OBB, theP: OCP.OCP.gp.gp_Pnt) -> None

  // DumpJson(self
  // OCP.OCP.Bnd.Bnd_OBB.DumpJson (method)
  DumpJson(self: OCP.OCP.Bnd.Bnd_OBB, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Center(self
  // OCP.OCP.Bnd.Bnd_OBB.Center (method)
  Center(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // XDirection(self
  // OCP.OCP.Bnd.Bnd_OBB.XDirection (method)
  XDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // YDirection(self
  // OCP.OCP.Bnd.Bnd_OBB.YDirection (method)
  YDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ

  // ZDirection(self
  // OCP.OCP.Bnd.Bnd_OBB.ZDirection (method)
  ZDirection(self: OCP.OCP.Bnd.Bnd_OBB) -> OCP.OCP.gp.gp_XYZ
