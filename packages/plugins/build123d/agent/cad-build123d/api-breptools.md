# build123d — BRepTools

2 top-level symbols. Signatures are verbatim python.

// The BRepTools package provides utilities for BRep data structures
BRepTools

  // __init__(self
  // OCP.OCP.BRepTools.BRepTools.__init__ (constructor)
  __init__(self: OCP.OCP.BRepTools.BRepTools) -> None

  // AddUVBounds_s(*args, **kwargs)
  // OCP.OCP.BRepTools.BRepTools.AddUVBounds_s (method)
  AddUVBounds_s(*args, **kwargs)
  AddUVBounds_s(F: OCP.OCP.TopoDS.TopoDS_Face, B: OCP.OCP.Bnd.Bnd_Box2d) -> None
  AddUVBounds_s(F: OCP.OCP.TopoDS.TopoDS_Face, W: OCP.OCP.TopoDS.TopoDS_Wire, B: OCP.OCP.Bnd.Bnd_Box2d) -> None
  AddUVBounds_s(F: OCP.OCP.TopoDS.TopoDS_Face, E: OCP.OCP.TopoDS.TopoDS_Edge, B: OCP.OCP.Bnd.Bnd_Box2d) -> None

  // Update_s(*args, **kwargs)
  // OCP.OCP.BRepTools.BRepTools.Update_s (method)
  Update_s(*args, **kwargs)
  Update_s(V: OCP.OCP.TopoDS.TopoDS_Vertex) -> None
  Update_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> None
  Update_s(W: OCP.OCP.TopoDS.TopoDS_Wire) -> None
  Update_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  Update_s(S: OCP.OCP.TopoDS.TopoDS_Shell) -> None
  Update_s(S: OCP.OCP.TopoDS.TopoDS_Solid) -> None
  Update_s(C: OCP.OCP.TopoDS.TopoDS_CompSolid) -> None
  Update_s(C: OCP.OCP.TopoDS.TopoDS_Compound) -> None
  Update_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // UpdateFaceUVPoints_s(theF
  // OCP.OCP.BRepTools.BRepTools.UpdateFaceUVPoints_s (method)
  UpdateFaceUVPoints_s(theF: OCP.OCP.TopoDS.TopoDS_Face) -> None

  // Clean_s(theShape
  // OCP.OCP.BRepTools.BRepTools.Clean_s (method)
  Clean_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theForce: bool = False) -> None

  // CleanGeometry_s(theShape
  // OCP.OCP.BRepTools.BRepTools.CleanGeometry_s (method)
  CleanGeometry_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // RemoveUnusedPCurves_s(S
  // OCP.OCP.BRepTools.BRepTools.RemoveUnusedPCurves_s (method)
  RemoveUnusedPCurves_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // Triangulation_s(theShape
  // OCP.OCP.BRepTools.BRepTools.Triangulation_s (method)
  Triangulation_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theLinDefl: float, theToCheckFreeEdges: bool = False) -> bool

  // LoadTriangulation_s(theShape
  // OCP.OCP.BRepTools.BRepTools.LoadTriangulation_s (method)
  LoadTriangulation_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theTriangulationIdx: int = -1, theToSetAsActive: bool = False, theFileSystem: OCP.OCP.OSD.OSD_FileSystem = None) -> bool

  // UnloadTriangulation_s(theShape
  // OCP.OCP.BRepTools.BRepTools.UnloadTriangulation_s (method)
  UnloadTriangulation_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theTriangulationIdx: int = -1) -> bool

  // ActivateTriangulation_s(theShape
  // OCP.OCP.BRepTools.BRepTools.ActivateTriangulation_s (method)
  ActivateTriangulation_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theTriangulationIdx: int, theToActivateStrictly: bool = False) -> bool

  // LoadAllTriangulations_s(theShape
  // OCP.OCP.BRepTools.BRepTools.LoadAllTriangulations_s (method)
  LoadAllTriangulations_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theFileSystem: OCP.OCP.OSD.OSD_FileSystem = None) -> bool

  // UnloadAllTriangulations_s(theShape
  // OCP.OCP.BRepTools.BRepTools.UnloadAllTriangulations_s (method)
  UnloadAllTriangulations_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // Compare_s(*args, **kwargs)
  // OCP.OCP.BRepTools.BRepTools.Compare_s (method)
  Compare_s(*args, **kwargs)
  Compare_s(V1: OCP.OCP.TopoDS.TopoDS_Vertex, V2: OCP.OCP.TopoDS.TopoDS_Vertex) -> bool
  Compare_s(E1: OCP.OCP.TopoDS.TopoDS_Edge, E2: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // OuterWire_s(F
  // OCP.OCP.BRepTools.BRepTools.OuterWire_s (method)
  OuterWire_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.TopoDS.TopoDS_Wire

  // Map3DEdges_s(S
  // OCP.OCP.BRepTools.BRepTools.Map3DEdges_s (method)
  Map3DEdges_s(S: OCP.OCP.TopoDS.TopoDS_Shape, M: OCP.OCP.TopTools.TopTools_IndexedMapOfShape) -> None

  // IsReallyClosed_s(E
  // OCP.OCP.BRepTools.BRepTools.IsReallyClosed_s (method)
  IsReallyClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> bool

  // Dump_s(Sh
  // OCP.OCP.BRepTools.BRepTools.Dump_s (method)
  Dump_s(Sh: OCP.OCP.TopoDS.TopoDS_Shape, S: io.BytesIO) -> None

  // Write_s(*args, **kwargs)
  // OCP.OCP.BRepTools.BRepTools.Write_s (method)
  Write_s(*args, **kwargs)
  Write_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theStream: io.BytesIO, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f1428b0>) -> None
  Write_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theStream: io.BytesIO, theWithTriangles: bool, theWithNormals: bool, theVersion: OCP.OCP.TopTools.TopTools_FormatVersion, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f185ff0>) -> None
  Write_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theFile: str, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f1570b0>) -> bool
  Write_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theFile: str, theWithTriangles: bool, theWithNormals: bool, theVersion: OCP.OCP.TopTools.TopTools_FormatVersion, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10ec3dd70>) -> bool

  // Read_s(*args, **kwargs)
  // OCP.OCP.BRepTools.BRepTools.Read_s (method)
  Read_s(*args, **kwargs)
  Read_s(Sh: OCP.OCP.TopoDS.TopoDS_Shape, S: io.BytesIO, B: OCP.OCP.BRep.BRep_Builder, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f0500b0>) -> None
  Read_s(Sh: OCP.OCP.TopoDS.TopoDS_Shape, File: str, B: OCP.OCP.BRep.BRep_Builder, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f0218f0>) -> bool

  // EvalAndUpdateTol_s(theE
  // OCP.OCP.BRepTools.BRepTools.EvalAndUpdateTol_s (method)
  EvalAndUpdateTol_s(theE: OCP.OCP.TopoDS.TopoDS_Edge, theC3d: OCP.OCP.Geom.Geom_Curve, theC2d: OCP.OCP.Geom2d.Geom2d_Curve, theS: OCP.OCP.Geom.Geom_Surface, theF: float, theL: float) -> float

  // OriEdgeInFace_s(theEdge
  // OCP.OCP.BRepTools.BRepTools.OriEdgeInFace_s (method)
  OriEdgeInFace_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theFace: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.TopAbs.TopAbs_Orientation

  // RemoveInternals_s(theS
  // OCP.OCP.BRepTools.BRepTools.RemoveInternals_s (method)
  RemoveInternals_s(theS: OCP.OCP.TopoDS.TopoDS_Shape, theForce: bool = False) -> None

  // CheckLocations_s(theS
  // OCP.OCP.BRepTools.BRepTools.CheckLocations_s (method)
  CheckLocations_s(theS: OCP.OCP.TopoDS.TopoDS_Shape, theProblemShapes: OCP.OCP.TopTools.TopTools_ListOfShape) -> None

  // UVBounds_s(*args, **kwargs)
  // OCP.OCP.BRepTools.BRepTools.UVBounds_s (method)
  UVBounds_s(*args, **kwargs)
  UVBounds_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> tuple[float, float, float, float]
  UVBounds_s(F: OCP.OCP.TopoDS.TopoDS_Face, W: OCP.OCP.TopoDS.TopoDS_Wire) -> tuple[float, float, float, float]
  UVBounds_s(F: OCP.OCP.TopoDS.TopoDS_Face, E: OCP.OCP.TopoDS.TopoDS_Edge) -> tuple[float, float, float, float]

  // DetectClosedness_s(theFace
  // OCP.OCP.BRepTools.BRepTools.DetectClosedness_s (method)
  DetectClosedness_s(theFace: OCP.OCP.TopoDS.TopoDS_Face) -> tuple[bool, bool]

// The WireExplorer is a tool to explore the edges of a wire in a connection order
BRepTools_WireExplorer

  // __init__(*args, **kwargs)
  // OCP.OCP.BRepTools.BRepTools_WireExplorer.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.BRepTools.BRepTools_WireExplorer) -> None
  __init__(self: OCP.OCP.BRepTools.BRepTools_WireExplorer, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None
  __init__(self: OCP.OCP.BRepTools.BRepTools_WireExplorer, W: OCP.OCP.TopoDS.TopoDS_Wire, F: OCP.OCP.TopoDS.TopoDS_Face) -> None

  // Init(*args, **kwargs)
  // OCP.OCP.BRepTools.BRepTools_WireExplorer.Init (method)
  Init(*args, **kwargs)
  Init(self: OCP.OCP.BRepTools.BRepTools_WireExplorer, W: OCP.OCP.TopoDS.TopoDS_Wire) -> None
  Init(self: OCP.OCP.BRepTools.BRepTools_WireExplorer, W: OCP.OCP.TopoDS.TopoDS_Wire, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  Init(self: OCP.OCP.BRepTools.BRepTools_WireExplorer, W: OCP.OCP.TopoDS.TopoDS_Wire, F: OCP.OCP.TopoDS.TopoDS_Face, UMin: float, UMax: float, VMin: float, VMax: float) -> None

  // More(self
  // OCP.OCP.BRepTools.BRepTools_WireExplorer.More (method)
  More(self: OCP.OCP.BRepTools.BRepTools_WireExplorer) -> bool

  // Next(self
  // OCP.OCP.BRepTools.BRepTools_WireExplorer.Next (method)
  Next(self: OCP.OCP.BRepTools.BRepTools_WireExplorer) -> None

  // Orientation(self
  // OCP.OCP.BRepTools.BRepTools_WireExplorer.Orientation (method)
  Orientation(self: OCP.OCP.BRepTools.BRepTools_WireExplorer) -> OCP.OCP.TopAbs.TopAbs_Orientation

  // Clear(self
  // OCP.OCP.BRepTools.BRepTools_WireExplorer.Clear (method)
  Clear(self: OCP.OCP.BRepTools.BRepTools_WireExplorer) -> None

  // Current(self
  // OCP.OCP.BRepTools.BRepTools_WireExplorer.Current (method)
  Current(self: OCP.OCP.BRepTools.BRepTools_WireExplorer) -> OCP.OCP.TopoDS.TopoDS_Edge

  // CurrentVertex(self
  // OCP.OCP.BRepTools.BRepTools_WireExplorer.CurrentVertex (method)
  CurrentVertex(self: OCP.OCP.BRepTools.BRepTools_WireExplorer) -> OCP.OCP.TopoDS.TopoDS_Vertex
