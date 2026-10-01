# build123d — BRepBuilderAPI

5 top-level symbols. Signatures are verbatim python.

// Provides methods to build faces
BRepBuilderAPI_MakeFace

  // __init__(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, TolDegen: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus, UMin: float, UMax: float, VMin: float, VMax: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, UMin: float, UMax: float, VMin: float, VMax: float, TolDegen: float) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, W: OCP.OCP.TopoDS.TopoDS_Wire, OnlyPlane: bool = False) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, P: OCP.OCP.gp.gp_Pln, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cylinder, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Cone, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.gp.gp_Sphere, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, C: OCP.OCP.gp.gp_Torus, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, W: OCP.OCP.TopoDS.TopoDS_Wire, Inside: bool = True) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None

  // Init(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.Init (method)
  Init(*args, **kwargs)
  Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, Bound: bool, TolDegen: float) -> None
  Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, S: OCP.OCP.Geom.Geom_Surface, UMin: float, UMax: float, VMin: float, VMax: float, TolDegen: float) -> None

  // Add(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.Add (method)
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None

  // IsDone(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.IsDone (method)
  IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> bool

  // Error(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.Error (method)
  Error(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_FaceError

  // Face(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace.Face (method)
  Face(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeFace) -> OCP.OCP.TopoDS.TopoDS_Face

// Describes functions to build polygonal wires
BRepBuilderAPI_MakePolygon

  // __init__(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, P3: OCP.OCP.gp.gp_Pnt, Close: bool = False) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P1: OCP.OCP.gp.gp_Pnt, P2: OCP.OCP.gp.gp_Pnt, P3: OCP.OCP.gp.gp_Pnt, P4: OCP.OCP.gp.gp_Pnt, Close: bool = False) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex, V3: OCP.OCP.TopoDS.TopoDS_Vertex, Close: bool = False) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex, V3: OCP.OCP.TopoDS.TopoDS_Vertex, V4: OCP.OCP.TopoDS.TopoDS_Vertex, Close: bool = False) -> None

  // Add(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Add (method)
  Add(*args, **kwargs)
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, P: OCP.OCP.gp.gp_Pnt) -> None
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon, V: OCP.OCP.TopoDS.TopoDS_Vertex) -> None

  // Added(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Added (method)
  Added(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> bool

  // Close(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Close (method)
  Close(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> None

  // IsDone(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.IsDone (method)
  IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> bool

  // FirstVertex(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.FirstVertex (method)
  FirstVertex(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Vertex

  // LastVertex(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.LastVertex (method)
  LastVertex(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Vertex

  // Edge(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Edge (method)
  Edge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Edge

  // Wire(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon.Wire (method)
  Wire(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakePolygon) -> OCP.OCP.TopoDS.TopoDS_Wire

// Describes functions to build a solid from shells
BRepBuilderAPI_MakeSolid

  // __init__(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_CompSolid) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S1: OCP.OCP.TopoDS.TopoDS_Shell, S2: OCP.OCP.TopoDS.TopoDS_Shell) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S1: OCP.OCP.TopoDS.TopoDS_Shell, S2: OCP.OCP.TopoDS.TopoDS_Shell, S3: OCP.OCP.TopoDS.TopoDS_Shell) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, So: OCP.OCP.TopoDS.TopoDS_Solid) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, So: OCP.OCP.TopoDS.TopoDS_Solid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None

  // Add(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.Add (method)
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shell) -> None

  // IsDone(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.IsDone (method)
  IsDone(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> bool

  // IsDeleted(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.IsDeleted (method)
  IsDeleted(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid, S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // Solid(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid.Solid (method)
  Solid(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_MakeSolid) -> OCP.OCP.TopoDS.TopoDS_Solid

// Provides methods toProvides methods toProvides methods to
BRepBuilderAPI_Sewing

  // __init__(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.__init__ (constructor)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, tolerance: float = 1e-06, option1: bool = True, option2: bool = True, option3: bool = True, option4: bool = False) -> None

  // Init(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Init (method)
  Init(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, tolerance: float = 1e-06, option1: bool = True, option2: bool = True, option3: bool = True, option4: bool = False) -> None

  // Load(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Load (method)
  Load(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Add(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Add (method)
  Add(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Perform(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Perform (method)
  Perform(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10eb5e630>) -> None

  // SetContext(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetContext (method)
  SetContext(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theContext: OCP.OCP.BRepTools.BRepTools_ReShape) -> None

  // NbFreeEdges(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbFreeEdges (method)
  NbFreeEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // FreeEdge(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.FreeEdge (method)
  FreeEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

  // NbMultipleEdges(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbMultipleEdges (method)
  NbMultipleEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // MultipleEdge(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.MultipleEdge (method)
  MultipleEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

  // NbContigousEdges(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbContigousEdges (method)
  NbContigousEdges(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // ContigousEdge(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.ContigousEdge (method)
  ContigousEdge(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Edge

  // ContigousEdgeCouple(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.ContigousEdgeCouple (method)
  ContigousEdgeCouple(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopTools.TopTools_ListOfShape

  // IsSectionBound(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.IsSectionBound (method)
  IsSectionBound(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, section: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // SectionToBoundary(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SectionToBoundary (method)
  SectionToBoundary(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, section: OCP.OCP.TopoDS.TopoDS_Edge) -> OCP.OCP.TopoDS.TopoDS_Edge

  // NbDegeneratedShapes(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbDegeneratedShapes (method)
  NbDegeneratedShapes(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // DegeneratedShape(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.DegeneratedShape (method)
  DegeneratedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Shape

  // IsDegenerated(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.IsDegenerated (method)
  IsDegenerated(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // IsModified(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.IsModified (method)
  IsModified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // Modified(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Modified (method)
  Modified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // IsModifiedSubShape(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.IsModifiedSubShape (method)
  IsModifiedSubShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // ModifiedSubShape(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.ModifiedSubShape (method)
  ModifiedSubShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, shape: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Dump(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Dump (method)
  Dump(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> None

  // NbDeletedFaces(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NbDeletedFaces (method)
  NbDeletedFaces(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> int

  // DeletedFace(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.DeletedFace (method)
  DeletedFace(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, index: int) -> OCP.OCP.TopoDS.TopoDS_Face

  // WhichFace(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.WhichFace (method)
  WhichFace(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theEdg: OCP.OCP.TopoDS.TopoDS_Edge, index: int = 1) -> OCP.OCP.TopoDS.TopoDS_Face

  // SameParameterMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SameParameterMode (method)
  SameParameterMode(*args, **kwargs)
  SameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  SameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // SetSameParameterMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetSameParameterMode (method)
  SetSameParameterMode(*args, **kwargs)
  SetSameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, SameParameterMode: bool) -> None
  SetSameParameterMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, SameParameterMode: bool) -> None

  // Tolerance(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.Tolerance (method)
  Tolerance(*args, **kwargs)
  Tolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
  Tolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

  // SetTolerance(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetTolerance (method)
  SetTolerance(*args, **kwargs)
  SetTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theToler: float) -> None
  SetTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theToler: float) -> None

  // MinTolerance(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.MinTolerance (method)
  MinTolerance(*args, **kwargs)
  MinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
  MinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

  // SetMinTolerance(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetMinTolerance (method)
  SetMinTolerance(*args, **kwargs)
  SetMinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMinToler: float) -> None
  SetMinTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMinToler: float) -> None

  // MaxTolerance(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.MaxTolerance (method)
  MaxTolerance(*args, **kwargs)
  MaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float
  MaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> float

  // SetMaxTolerance(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetMaxTolerance (method)
  SetMaxTolerance(*args, **kwargs)
  SetMaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMaxToler: float) -> None
  SetMaxTolerance(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theMaxToler: float) -> None

  // FaceMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.FaceMode (method)
  FaceMode(*args, **kwargs)
  FaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  FaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // SetFaceMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetFaceMode (method)
  SetFaceMode(*args, **kwargs)
  SetFaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFaceMode: bool) -> None
  SetFaceMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFaceMode: bool) -> None

  // FloatingEdgesMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.FloatingEdgesMode (method)
  FloatingEdgesMode(*args, **kwargs)
  FloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  FloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // SetFloatingEdgesMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetFloatingEdgesMode (method)
  SetFloatingEdgesMode(*args, **kwargs)
  SetFloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFloatingEdgesMode: bool) -> None
  SetFloatingEdgesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theFloatingEdgesMode: bool) -> None

  // LocalTolerancesMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.LocalTolerancesMode (method)
  LocalTolerancesMode(*args, **kwargs)
  LocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  LocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // SetLocalTolerancesMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetLocalTolerancesMode (method)
  SetLocalTolerancesMode(*args, **kwargs)
  SetLocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theLocalTolerancesMode: bool) -> None
  SetLocalTolerancesMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theLocalTolerancesMode: bool) -> None

  // SetNonManifoldMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SetNonManifoldMode (method)
  SetNonManifoldMode(*args, **kwargs)
  SetNonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theNonManifoldMode: bool) -> None
  SetNonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing, theNonManifoldMode: bool) -> None

  // NonManifoldMode(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.NonManifoldMode (method)
  NonManifoldMode(*args, **kwargs)
  NonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool
  NonManifoldMode(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> bool

  // get_type_name_s() -> str
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // SewedShape(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.SewedShape (method)
  SewedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.TopoDS.TopoDS_Shape

  // GetContext(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.GetContext (method)
  GetContext(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.BRepTools.BRepTools_ReShape

  // DynamicType(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing.DynamicType (method)
  DynamicType(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Sewing) -> OCP.OCP.Standard.Standard_Type

// Geometric transformation on a shape
BRepBuilderAPI_Transform

  // __init__(*args, **kwargs)
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, T: OCP.OCP.gp.gp_Trsf) -> None
  __init__(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theTrsf: OCP.OCP.gp.gp_Trsf, theCopyGeom: bool = False, theCopyMesh: bool = False) -> None

  // Perform(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform.Perform (method)
  Perform(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theCopyGeom: bool = False, theCopyMesh: bool = False) -> None

  // ModifiedShape(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform.ModifiedShape (method)
  ModifiedShape(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopoDS.TopoDS_Shape

  // Modified(self
  // OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform.Modified (method)
  Modified(self: OCP.OCP.BRepBuilderAPI.BRepBuilderAPI_Transform, S: OCP.OCP.TopoDS.TopoDS_Shape) -> OCP.OCP.TopTools.TopTools_ListOfShape
