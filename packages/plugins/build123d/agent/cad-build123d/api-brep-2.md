# build123d — BRep (2)

1 top-level symbols. Signatures are verbatim python.

// Category: BRep
// Provides class methods to access to the geometry of BRep shapes
BRep_Tool

  // __init__(self
  __init__(self: OCP.OCP.BRep.BRep_Tool) -> None

  // IsClosed_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsClosed_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool If S is Shell, returns True if it has no free boundaries (edges). If S is Wire, returns True if it has no free ends (vertices). (Internal and External sub-shepes are ignored in these checks) If S is Edge, returns True if its vertices are the same. For other shape types returns S.Closed(). 2. IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> bool Returns True if <E> has two PCurves in the parametric space of <F>. i.e. <F> is on a closed surface and <E> is on the closing curve. 3. IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> bool Returns True if <E> has two PCurves in the parametric space of <S>. i.e. <S> is a closed surface and <E> is on the closing curve. 4. IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> bool Returns True if <E> has two arrays of indices in the triangulation <T>.
  IsClosed_s(*args, **kwargs)
  IsClosed_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool
  IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> bool
  IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> bool
  IsClosed_s(E: OCP.OCP.TopoDS.TopoDS_Edge, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> bool

  // Surface_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Surface_s(F: OCP.OCP.TopoDS.TopoDS_Face, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Geom.Geom_Surface Returns the geometric surface of the face. Returns in <L> the location for the surface. 2. Surface_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.Geom.Geom_Surface Returns the geometric surface of the face. It can be a copy if there is a Location.
  Surface_s(*args, **kwargs)
  Surface_s(F: OCP.OCP.TopoDS.TopoDS_Face, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Geom.Geom_Surface
  Surface_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.Geom.Geom_Surface

  // Triangulation_s(theFace
  // Remarks: Returns the triangulation of the face according to the mesh purpose.
  Triangulation_s(theFace: OCP.OCP.TopoDS.TopoDS_Face, theLocation: OCP.OCP.TopLoc.TopLoc_Location, theMeshPurpose: int = 0) -> OCP.OCP.Poly.Poly_Triangulation

  // Triangulations_s(theFace
  // Remarks: Returns all triangulations of the face.
  Triangulations_s(theFace: OCP.OCP.TopoDS.TopoDS_Face, theLocation: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_ListOfTriangulation

  // Tolerance_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Tolerance_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> float Returns the tolerance of the face. 2. Tolerance_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> float Returns the tolerance for <E>. 3. Tolerance_s(V: OCP.OCP.TopoDS.TopoDS_Vertex) -> float Returns the tolerance.
  Tolerance_s(*args, **kwargs)
  Tolerance_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> float
  Tolerance_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> float
  Tolerance_s(V: OCP.OCP.TopoDS.TopoDS_Vertex) -> float

  // NaturalRestriction_s(F
  // Remarks: Returns the NaturalRestriction flag of the face.
  NaturalRestriction_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> bool

  // IsGeometric_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsGeometric_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> bool Returns True if <F> has a surface, false otherwise. 2. IsGeometric_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool Returns True if <E> is a 3d curve or a curve on surface.
  IsGeometric_s(*args, **kwargs)
  IsGeometric_s(F: OCP.OCP.TopoDS.TopoDS_Face) -> bool
  IsGeometric_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // Curve_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Curve_s(E: OCP.OCP.TopoDS.TopoDS_Edge, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float) -> OCP.OCP.Geom.Geom_Curve Returns the 3D curve of the edge. May be a Null handle. Returns in <L> the location for the curve. In <First> and <Last> the parameter range. 2. Curve_s(E: OCP.OCP.TopoDS.TopoDS_Edge, First: float, Last: float) -> OCP.OCP.Geom.Geom_Curve Returns the 3D curve of the edge. May be a Null handle. In <First> and <Last> the parameter range. It can be a copy if there is a Location.
  Curve_s(*args, **kwargs)
  Curve_s(E: OCP.OCP.TopoDS.TopoDS_Edge, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float) -> OCP.OCP.Geom.Geom_Curve
  Curve_s(E: OCP.OCP.TopoDS.TopoDS_Edge, First: float, Last: float) -> OCP.OCP.Geom.Geom_Curve

  // Polygon3D_s(E
  // Remarks: Returns the 3D polygon of the edge. May be a Null handle. Returns in <L> the location for the polygon.
  Polygon3D_s(E: OCP.OCP.TopoDS.TopoDS_Edge, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_Polygon3D

  // CurveOnSurface_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, First: float, Last: float, theIsStored: bool = None) -> OCP.OCP.Geom2d.Geom2d_Curve Returns the curve associated to the edge in the parametric space of the face. Returns a NULL handle if this curve does not exist. Returns in <First> and <Last> the parameter range. If the surface is a plane the curve can be not stored but created a new each time. The flag pointed by <theIsStored> serves to indicate storage status. It is valued if the pointer is non-null. 2. CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float, theIsStored: bool = None) -> OCP.OCP.Geom2d.Geom2d_Curve Returns the curve associated to the edge in the parametric space of the surface. Returns a NULL handle if this curve does not exist. Returns in <First> and <Last> the parameter range. If the surface is a plane the curve can be not stored but created a new each time. The flag pointed by <theIsStored> serves to indicate storage status. It is valued if the pointer is non-null. 3. CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> tuple[float, float] Returns in <C>, <S>, <L> a 2d curve, a surface and a location for the edge <E>. <C> and <S> are null if the edge has no curve on surface. Returns in <First> and <Last> the parameter range. 4. CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> tuple[float, float] Returns in <C>, <S>, <L> the 2d curve, the surface and the location for the edge <E> of rank <Index>. <C> and <S> are null if the index is out of range. Returns in <First> and <Last> the parameter range.
  CurveOnSurface_s(*args, **kwargs)
  CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, First: float, Last: float, theIsStored: bool = None) -> OCP.OCP.Geom2d.Geom2d_Curve
  CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float, theIsStored: bool = None) -> OCP.OCP.Geom2d.Geom2d_Curve
  CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> tuple[float, float]
  CurveOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Geom2d.Geom2d_Curve, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> tuple[float, float]

  // CurveOnPlane_s(E
  // Remarks: For the planar surface builds the 2d curve for the edge by projection of the edge on plane. Returns a NULL handle if the surface is not planar or the projection failed.
  CurveOnPlane_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, First: float, Last: float) -> OCP.OCP.Geom2d.Geom2d_Curve

  // PolygonOnSurface_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.Poly.Poly_Polygon2D Returns the polygon associated to the edge in the parametric space of the face. Returns a NULL handle if this polygon does not exist. 2. PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_Polygon2D Returns the polygon associated to the edge in the parametric space of the surface. Returns a NULL handle if this polygon does not exist. 3. PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> None Returns in <C>, <S>, <L> a 2d curve, a surface and a location for the edge <E>. <C> and <S> are null if the edge has no polygon on surface. 4. PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> None Returns in <C>, <S>, <L> the 2d curve, the surface and the location for the edge <E> of rank <Index>. <C> and <S> are null if the index is out of range.
  PolygonOnSurface_s(*args, **kwargs)
  PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.Poly.Poly_Polygon2D
  PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_Polygon2D
  PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  PolygonOnSurface_s(E: OCP.OCP.TopoDS.TopoDS_Edge, C: OCP.OCP.Poly.Poly_Polygon2D, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> None

  // PolygonOnTriangulation_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_PolygonOnTriangulation Returns the polygon associated to the edge in the parametric space of the face. Returns a NULL handle if this polygon does not exist. 2. PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> None Returns in <P>, <T>, <L> a polygon on triangulation, a triangulation and a location for the edge <E>. <P> and <T> are null if the edge has no polygon on triangulation. 3. PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> None Returns in <P>, <T>, <L> a polygon on triangulation, a triangulation and a location for the edge <E> for the range index. <C> and <S> are null if the edge has no polygon on triangulation.
  PolygonOnTriangulation_s(*args, **kwargs)
  PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.Poly.Poly_PolygonOnTriangulation
  PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location) -> None
  PolygonOnTriangulation_s(E: OCP.OCP.TopoDS.TopoDS_Edge, P: OCP.OCP.Poly.Poly_PolygonOnTriangulation, T: OCP.OCP.Poly.Poly_Triangulation, L: OCP.OCP.TopLoc.TopLoc_Location, Index: int) -> None

  // SameParameter_s(E
  // Remarks: Returns the SameParameter flag for the edge.
  SameParameter_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // SameRange_s(E
  // Remarks: Returns the SameRange flag for the edge.
  SameRange_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // Degenerated_s(E
  // Remarks: Returns True if the edge is degenerated.
  Degenerated_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // UVPoints_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. UVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None Gets the UV locations of the extremities of the edge. 2. UVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None Gets the UV locations of the extremities of the edge.
  UVPoints_s(*args, **kwargs)
  UVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None
  UVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None

  // SetUVPoints_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetUVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None Sets the UV locations of the extremities of the edge. 2. SetUVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None Sets the UV locations of the extremities of the edge.
  SetUVPoints_s(*args, **kwargs)
  SetUVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None
  SetUVPoints_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face, PFirst: OCP.OCP.gp.gp_Pnt2d, PLast: OCP.OCP.gp.gp_Pnt2d) -> None

  // HasContinuity_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face) -> bool Returns True if the edge is on the surfaces of the two faces. 2. HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, L1: OCP.OCP.TopLoc.TopLoc_Location, L2: OCP.OCP.TopLoc.TopLoc_Location) -> bool Returns True if the edge is on the surfaces. 3. HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool Returns True if the edge has regularity on some two surfaces
  HasContinuity_s(*args, **kwargs)
  HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face) -> bool
  HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, L1: OCP.OCP.TopLoc.TopLoc_Location, L2: OCP.OCP.TopLoc.TopLoc_Location) -> bool
  HasContinuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> bool

  // Continuity_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Continuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.GeomAbs.GeomAbs_Shape Returns the continuity. 2. Continuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, L1: OCP.OCP.TopLoc.TopLoc_Location, L2: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.GeomAbs.GeomAbs_Shape Returns the continuity.
  Continuity_s(*args, **kwargs)
  Continuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.GeomAbs.GeomAbs_Shape
  Continuity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S1: OCP.OCP.Geom.Geom_Surface, S2: OCP.OCP.Geom.Geom_Surface, L1: OCP.OCP.TopLoc.TopLoc_Location, L2: OCP.OCP.TopLoc.TopLoc_Location) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // MaxContinuity_s(theEdge
  // Remarks: Returns the max continuity of edge between some surfaces or GeomAbs_C0 if there no such surfaces.
  MaxContinuity_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // Pnt_s(V
  // Remarks: Returns the 3d point.
  Pnt_s(V: OCP.OCP.TopoDS.TopoDS_Vertex) -> OCP.OCP.gp.gp_Pnt

  // Parameter_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Parameter_s(theV: OCP.OCP.TopoDS.TopoDS_Vertex, theE: OCP.OCP.TopoDS.TopoDS_Edge, theParam: float) -> bool Finds the parameter of <theV> on <theE>. 2. Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge) -> float Returns the parameter of <V> on <E>. Throws Standard_NoSuchObject if no parameter on edge 3. Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> float Returns the parameters of the vertex on the pcurve of the edge on the face. 4. Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> float Returns the parameters of the vertex on the pcurve of the edge on the surface.
  Parameter_s(*args, **kwargs)
  Parameter_s(theV: OCP.OCP.TopoDS.TopoDS_Vertex, theE: OCP.OCP.TopoDS.TopoDS_Edge, theParam: float) -> bool
  Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge) -> float
  Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> float
  Parameter_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> float

  // Parameters_s(V
  // Remarks: Returns the parameters of the vertex on the face.
  Parameters_s(V: OCP.OCP.TopoDS.TopoDS_Vertex, F: OCP.OCP.TopoDS.TopoDS_Face) -> OCP.OCP.gp.gp_Pnt2d

  // MaxTolerance_s(theShape
  MaxTolerance_s(theShape: OCP.OCP.TopoDS.TopoDS_Shape, theSubShape: OCP.OCP.TopAbs.TopAbs_ShapeEnum) -> float

  // Range_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> tuple[float, float] Gets the range of the 3d curve. 2. Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> tuple[float, float] Gets the range of the edge on the pcurve on the surface. 3. Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> tuple[float, float] Gets the range of the edge on the pcurve on the face.
  Range_s(*args, **kwargs)
  Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge) -> tuple[float, float]
  Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge, S: OCP.OCP.Geom.Geom_Surface, L: OCP.OCP.TopLoc.TopLoc_Location) -> tuple[float, float]
  Range_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F: OCP.OCP.TopoDS.TopoDS_Face) -> tuple[float, float]
