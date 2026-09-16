# build123d — BRep

2 top-level symbols. Signatures are verbatim python.

// A framework providing advanced tolerance control
BRep_Builder

  // __init__(self
  __init__(self: OCP.OCP.BRep.BRep_Builder) -> None

  // MakeFace(*args, **kwargs)
  MakeFace(*args, **kwargs)
  MakeFace(self: OCP.OCP.BRep.BRep_Builder, F: OCP.OCP.TopoDS.TopoDS_Face) -> None
  MakeFace(self: OCP.OCP.BRep.BRep_Builder, F: OCP.OCP.TopoDS.TopoDS_Face, S: OCP.OCP.Geom.Geom_Surface, Tol: float) -> None
  MakeFace(self: OCP.OCP.BRep.BRep_Builder, F: OCP.OCP.TopoDS.TopoDS_Face, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float) -> None
  MakeFace(self: OCP.OCP.BRep.BRep_Builder, theFace: OCP.OCP.TopoDS.TopoDS_Face, theTriangulation: OCP.OCP.Poly.Poly_Triangulation) -> None
  MakeFace(self: OCP.OCP.BRep.BRep_Builder, theFace: OCP.OCP.TopoDS.TopoDS_Face, theTriangulations: OCP.OCP.Poly.Poly_ListOfTriangulation, theActiveTriangulation: OCP.OCP.Poly.Poly_Triangulation = None) -> None
  MakeFace(self: OCP.OCP.BRep.BRep_Builder, F: OCP.OCP.TopoDS.TopoDS_Face) -> None

  // UpdateFace(*args, **kwargs)
  UpdateFace(*args, **kwargs)
  UpdateFace(self: OCP.OCP.BRep.BRep_Builder, F: OCP.OCP.TopoDS.TopoDS_Face, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float) -> None
  UpdateFace(self: OCP.OCP.BRep.BRep_Builder, theFace: OCP.OCP.TopoDS.TopoDS_Face, theTriangulation: OCP.OCP.Poly.Poly_Triangulation, theToReset: bool = True) -> None
  UpdateFace(self: OCP.OCP.BRep.BRep_Builder, F: OCP.OCP.TopoDS.TopoDS_Face, Tol: float) -> None

  // NaturalRestriction(self
  NaturalRestriction(self: OCP.OCP.BRep.BRep_Builder, F: OCP.OCP.TopoDS.TopoDS_Face, N: bool) -> None

  // MakeEdge(*args, **kwargs)
  MakeEdge(*args, **kwargs)
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom.Geom_Curve, Tol: float) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom.Geom_Curve, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_Polygon3D) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, N: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, N: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom.Geom_Curve, Tol: float) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_Polygon3D) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  MakeEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom.Geom_Curve, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float) -> None

  // UpdateEdge(*args, **kwargs)
  UpdateEdge(*args, **kwargs)
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom.Geom_Curve, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom.Geom_Curve, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, F: OCP.OCP.TopoDS.TopoDS_Face, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C1: OCP.OCP.Geom2d.Geom2d_Curve, C2: OCP.OCP.Geom2d.Geom2d_Curve, F: OCP.OCP.TopoDS.TopoDS_Face, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float, Pf: OCP.OCP.gp.gp_Pnt2d, Pl: OCP.OCP.gp.gp_Pnt2d) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C1: OCP.OCP.Geom2d.Geom2d_Curve, C2: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C1: OCP.OCP.Geom2d.Geom2d_Curve, C2: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float, Pf: OCP.OCP.gp.gp_Pnt2d, Pl: OCP.OCP.gp.gp_Pnt2d) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_Polygon3D) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_Polygon3D, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, N: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, N: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, N1: OCP.OCP.Poly.Poly_PolygonOnTriangulation, N2: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, N1: OCP.OCP.Poly.Poly_PolygonOnTriangulation, N2: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.TopoDS.TopoDS_Face) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.Geom.Geom_Surface, T: OCP.OCP.TopLoc.TopLoc_Location) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P1: OCP.OCP.Poly.Poly_Polygon2D, P2: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.TopoDS.TopoDS_Face) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P1: OCP.OCP.Poly.Poly_Polygon2D, P2: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom.Geom_Curve, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, F: OCP.OCP.TopoDS.TopoDS_Face, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, C1: OCP.OCP.Geom2d.Geom2d_Curve, C2: OCP.OCP.Geom2d.Geom2d_Curve, F: OCP.OCP.TopoDS.TopoDS_Face, Tol: float) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_Polygon3D) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation) -> None
  UpdateEdge(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, P1: OCP.OCP.Poly.Poly_PolygonOnTriangulation, P2: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation) -> None

  // Continuity(*args, **kwargs)
  Continuity(*args, **kwargs)
  Continuity(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face, C: OCP.OCP.GeomAbs.GeomAbs_Shape) -> None
  Continuity(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, L1: OCP.OCP.TopLoc.TopLoc_Location, L2: OCP.OCP.TopLoc.TopLoc_Location, C: OCP.OCP.GeomAbs.GeomAbs_Shape) -> None

  // SameParameter(self
  SameParameter(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, S: bool) -> None

  // SameRange(self
  SameRange(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, S: bool) -> None

  // Degenerated(self
  Degenerated(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, D: bool) -> None

  // Range(*args, **kwargs)
  Range(*args, **kwargs)
  Range(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, First: float, Last: float, Only3d: bool = False) -> None
  Range(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float) -> None
  Range(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, First: float, Last: float) -> None
  Range(self: OCP.OCP.BRep.BRep_Builder, E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, First: float, Last: float) -> None

  // Transfert(*args, **kwargs)
  Transfert(*args, **kwargs)
  Transfert(self: OCP.OCP.BRep.BRep_Builder, Ein: OCP.OCP.TopoDS.TopoDS_Edge, Eout: OCP.OCP.TopoDS.TopoDS_Edge) -> None
  Transfert(self: OCP.OCP.BRep.BRep_Builder, Ein: OCP.OCP.TopoDS.TopoDS_Edge, Eout: OCP.OCP.TopoDS.TopoDS_Edge, Vin: OCP.OCP.TopoDS.TopoDS_Vertex, Vout: OCP.OCP.TopoDS.TopoDS_Vertex) -> None

  // MakeVertex(*args, **kwargs)
  MakeVertex(*args, **kwargs)
  MakeVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex) -> None
  MakeVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex, P: OCP.OCP.gp.gp_Pnt, Tol: float) -> None
  MakeVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex) -> None
  MakeVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex, P: OCP.OCP.gp.gp_Pnt, Tol: float) -> None

  // UpdateVertex(*args, **kwargs)
  UpdateVertex(*args, **kwargs)
  UpdateVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex, P: OCP.OCP.gp.gp_Pnt, Tol: float) -> None
  UpdateVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex, P: float, E: OCP.OCP.TopoDS.TopoDS_Edge, Tol: float) -> None
  UpdateVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex, P: float, E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, Tol: float) -> None
  UpdateVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex, P: float, E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Tol: float) -> None
  UpdateVertex(self: OCP.OCP.BRep.BRep_Builder, Ve: OCP.OCP.TopoDS.TopoDS_Vertex, U: float, V: float, F: OCP.OCP.TopoDS.TopoDS_Face, Tol: float) -> None
  UpdateVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex, Tol: float) -> None
  UpdateVertex(self: OCP.OCP.BRep.BRep_Builder, V: OCP.OCP.TopoDS.TopoDS_Vertex, Par: float, E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, Tol: float) -> None

// Provides class methods to access to the geometry of BRep shapes
BRep_Tool

  // __init__(self
  __init__(self: OCP.OCP.BRep.BRep_Tool) -> None

  // IsClosed_s(*args, **kwargs)
  IsClosed_s(*args, **kwargs)
  IsClosed_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> bool
  IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> bool
  IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // Surface_s(*args, **kwargs)
  Surface_s(*args, **kwargs)
  Surface_s(F: OCP.OCP.TopoDS.TopoDS_Face, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Geom.Geom_Surface
  Surface_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.Geom.Geom_Surface

  // Triangulation_s(theFace
  Triangulation_s(theFace: OCP.OCP.TopoDS.TopoDS_Face, theLocation: OCP.OCP.TopLoc.TopLoc_Location, theMeshPurpose: int = 0) -> OCP.OCP.Poly.Poly_Triangulation

  // Triangulations_s(theFace
  Triangulations_s(theFace: OCP.OCP.TopoDS.TopoDS_Face, theLocation: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_ListOfTriangulation

  // Tolerance_s(*args, **kwargs)
  Tolerance_s(*args, **kwargs)
  Tolerance_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> float
  Tolerance_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> float
  Tolerance_s(V: OCP.OCP.TopoDS.TopoDS_Vertex) -> float

  // NaturalRestriction_s(F
  NaturalRestriction_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> bool

  // IsGeometric_s(*args, **kwargs)
  IsGeometric_s(*args, **kwargs)
  IsGeometric_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> bool
  IsGeometric_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // Curve_s(*args, **kwargs)
  Curve_s(*args, **kwargs)
  Curve_s(E: OCP.OCP.TopoDS.TopoDS_Edge, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float) -> OCP.OCP.Geom.Geom_Curve
  Curve_s(E: OCP.OCP.TopoDS.TopoDS_Edge, First: float, Last: float) -> OCP.OCP.Geom.Geom_Curve

  // Polygon3D_s(E
  Polygon3D_s(E: OCP.OCP.TopoDS.TopoDS_Edge, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_Polygon3D

  // CurveOnSurface_s(*args, **kwargs)
  CurveOnSurface_s(*args, **kwargs)
  CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, First: float, Last: float, theIsStored: bool = None) -> OCP.OCP.Geom2d.Geom2d_Curve
  CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float, theIsStored: bool = None) -> OCP.OCP.Geom2d.Geom2d_Curve
  CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> tuple[float, float]
  CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> tuple[float, float]

  // CurveOnPlane_s(E
  CurveOnPlane_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float) -> OCP.OCP.Geom2d.Geom2d_Curve

  // PolygonOnSurface_s(*args, **kwargs)
  PolygonOnSurface_s(*args, **kwargs)
  PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.Poly.Poly_Polygon2D
  PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_Polygon2D
  PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> None

  // PolygonOnTriangulation_s(*args, **kwargs)
  PolygonOnTriangulation_s(*args, **kwargs)
  PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_PolygonOnTriangulation
  PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> None

  // SameParameter_s(E
  SameParameter_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // SameRange_s(E
  SameRange_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // Degenerated_s(E
  Degenerated_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // UVPoints_s(*args, **kwargs)
  UVPoints_s(*args, **kwargs)
  UVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None
  UVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None

  // SetUVPoints_s(*args, **kwargs)
  SetUVPoints_s(*args, **kwargs)
  SetUVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None
  SetUVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None

  // HasContinuity_s(*args, **kwargs)
  HasContinuity_s(*args, **kwargs)
  HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face) -> bool
  HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, L1: OCP.OCP.TopLoc.TopLoc_Location, L2: OCP.OCP.TopLoc.TopLoc_Location) -> bool
  HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // Continuity_s(*args, **kwargs)
  Continuity_s(*args, **kwargs)
  Continuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.GeomAbs.GeomAbs_Shape
  Continuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, L1: OCP.OCP.TopLoc.TopLoc_Location, L2: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // MaxContinuity_s(theEdge
  MaxContinuity_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // Pnt_s(V
  Pnt_s(V: OCP.OCP.TopoDS.TopoDS_Vertex) -> OCP.OCP.gp.gp_Pnt

  // Parameter_s(*args, **kwargs)
  Parameter_s(*args, **kwargs)
  Parameter_s(theV: OCP.OCP.TopoDS.TopoDS_Vertex, theE: OCP.OCP.TopoDS.TopoDS_Edge, theParam: float) -> bool
  Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge) -> float
  Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> float
  Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> float

  // Parameters_s(V
  Parameters_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.gp.gp_Pnt2d

  // MaxTolerance_s(theShape
  MaxTolerance_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theSubShape: OCP.OCP.TopAbs.TopAbs_ShapeEnum) -> float

  // Range_s(*args, **kwargs)
  Range_s(*args, **kwargs)
  Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> tuple[float, float]
  Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> tuple[float, float]
  Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> tuple[float, float]
