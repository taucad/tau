# build123d — BRepLib

1 top-level symbols. Signatures are verbatim python.

// Category: BRepLib
// The BRepLib package provides general utilities for BRep
BRepLib

  // __init__(self
  // OCP.OCP.BRepLib.BRepLib.__init__ (constructor)
  __init__(self: OCP.OCP.BRepLib.BRepLib) -> None

  // Precision_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Precision_s(P: float) -> None Computes the max distance between edge and its 2d representation on the face. Sets the default precision. The current Precision is returned. 2. Precision_s() -> float Returns the default precision.
  // OCP.OCP.BRepLib.BRepLib.Precision_s (method)
  Precision_s(*args, **kwargs)
  Precision_s(P: float) -> None
  Precision_s() -> float

  // Plane_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Plane_s(P: OCP.OCP.Geom.Geom_Plane) -> None Sets the current plane to P. 2. Plane_s() -> OCP.OCP.Geom.Geom_Plane Returns the current plane.
  // OCP.OCP.BRepLib.BRepLib.Plane_s (method)
  Plane_s(*args, **kwargs)
  Plane_s(P: OCP.OCP.Geom.Geom_Plane) -> None
  Plane_s() -> OCP.OCP.Geom.Geom_Plane

  // CheckSameRange_s(E
  // Remarks: checks if the Edge is same range IGNORING the same range flag of the edge Confusion argument is to compare real numbers idenpendently of any model space tolerance
  // OCP.OCP.BRepLib.BRepLib.CheckSameRange_s (method)
  CheckSameRange_s(E: OCP.OCP.TopoDS.TopoDS_Edge, Confusion: float = 1e-12) -> bool

  // SameRange_s(E
  // Remarks: will make all the curve representation have the same range domain for the parameters. This will IGNORE the same range flag value to proceed. If there is a 3D curve there it will the range of that curve. If not the first curve representation encountered in the list will give its range to the all the other curves.
  // OCP.OCP.BRepLib.BRepLib.SameRange_s (method)
  SameRange_s(E: OCP.OCP.TopoDS.TopoDS_Edge, Tolerance: float = 1e-05) -> None

  // BuildCurve3d_s(E
  // Remarks: Computes the 3d curve for the edge <E> if it does not exist. Returns True if the curve was computed or existed. Returns False if there is no planar pcurve or the computation failed. <MaxSegment> >= 30 in approximation
  // OCP.OCP.BRepLib.BRepLib.BuildCurve3d_s (method)
  BuildCurve3d_s(E: OCP.OCP.TopoDS.TopoDS_Edge, Tolerance: float = 1e-05, Continuity: OCP.OCP.GeomAbs.GeomAbs_Shape = <GeomAbs_Shape.GeomAbs_C1: 2>, MaxDegree: int = 14, MaxSegment: int = 0) -> bool

  // BuildCurves3d_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. BuildCurves3d_s(S: OCP.OCP.TopoDS.TopoDS_Shape, Tolerance: float, Continuity: OCP.OCP.GeomAbs.GeomAbs_Shape = <GeomAbs_Shape.GeomAbs_C1: 2>, MaxDegree: int = 14, MaxSegment: int = 0) -> bool Computes the 3d curves for all the edges of <S> return False if one of the computation failed. <MaxSegment> >= 30 in approximation 2. BuildCurves3d_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool Computes the 3d curves for all the edges of <S> return False if one of the computation failed.
  // OCP.OCP.BRepLib.BRepLib.BuildCurves3d_s (method)
  BuildCurves3d_s(*args, **kwargs)
  BuildCurves3d_s(S: OCP.OCP.TopoDS.TopoDS_Shape, Tolerance: float, Continuity: OCP.OCP.GeomAbs.GeomAbs_Shape = <GeomAbs_Shape.GeomAbs_C1: 2>, MaxDegree: int = 14, MaxSegment: int = 0) -> bool
  BuildCurves3d_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

  // BuildPCurveForEdgeOnPlane_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. BuildPCurveForEdgeOnPlane_s(theE: OCP.OCP.TopoDS.TopoDS_Edge, theF: OCP.OCP.TopoDS.TopoDS_Face) -> None Builds pcurve of edge on face if the surface is plane, and updates the edge. 2. BuildPCurveForEdgeOnPlane_s(theE: OCP.OCP.TopoDS.TopoDS_Edge, theF: OCP.OCP.TopoDS.TopoDS_Face, aC2D: OCP.OCP.Geom2d.Geom2d_Curve) -> tuple[bool] Builds pcurve of edge on face if the surface is plane, but does not update the edge. The output are the pcurve and the flag telling that pcurve was built.
  // OCP.OCP.BRepLib.BRepLib.BuildPCurveForEdgeOnPlane_s (method)
  BuildPCurveForEdgeOnPlane_s(*args, **kwargs)
  BuildPCurveForEdgeOnPlane_s(theE: OCP.OCP.TopoDS.TopoDS_Edge, theF: OCP.OCP.TopoDS.TopoDS_Face) -> None
  BuildPCurveForEdgeOnPlane_s(theE: OCP.OCP.TopoDS.TopoDS_Edge, theF: OCP.OCP.TopoDS.TopoDS_Face, aC2D: OCP.OCP.Geom2d.Geom2d_Curve) -> tuple[bool]

  // UpdateEdgeTol_s(E
  // Remarks: Checks if the edge has a Tolerance smaller than -- -- -- -- MaxToleranceToCheck if so it will compute the radius of -- the cylindrical pipe surface that MinToleranceRequest is the minimum tolerance before it is useful to start testing. Usually it should be around 10e-5 contains all -- the curve representation of the edge returns True if the Edge tolerance had to be updated
  // OCP.OCP.BRepLib.BRepLib.UpdateEdgeTol_s (method)
  UpdateEdgeTol_s(E: OCP.OCP.TopoDS.TopoDS_Edge, MinToleranceRequest: float, MaxToleranceToCheck: float) -> bool

  // UpdateEdgeTolerance_s(S
  // Remarks: -- Checks all the edges of the shape whose -- -- -- Tolerance is smaller than MaxToleranceToCheck -- Returns True if at least one edge was updated -- MinToleranceRequest is the minimum tolerance before -- it -- is useful to start testing. Usually it should be around -- 10e-5--
  // OCP.OCP.BRepLib.BRepLib.UpdateEdgeTolerance_s (method)
  UpdateEdgeTolerance_s(S: OCP.OCP.TopoDS.TopoDS_Shape, MinToleranceRequest: float, MaxToleranceToCheck: float) -> bool

  // SameParameter_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SameParameter_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, Tolerance: float = 1e-05) -> None Computes new 2d curve(s) for the edge <theEdge> to have the same parameter as the 3d curve. The algorithm is not done if the flag SameParameter was True on the Edge. 2. SameParameter_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theTolerance: float, theNewTol: float, IsUseOldEdge: bool) -> OCP.OCP.TopoDS.TopoDS_Edge Computes new 2d curve(s) for the edge <theEdge> to have the same parameter as the 3d curve. The algorithm is not done if the flag SameParameter was True on the Edge. theNewTol is a new tolerance of vertices of the input edge (not applied inside the algorithm, but pre-computed). If IsUseOldEdge is true then the input edge will be modified, otherwise the new copy of input edge will be created. Returns the new edge as a result, can be ignored if IsUseOldEdge is true. 3. SameParameter_s(S: OCP.OCP.TopoDS.TopoDS_Shape, Tolerance: float = 1e-05, forced: bool = False) -> None Computes new 2d curve(s) for all the edges of <S> to have the same parameter as the 3d curve. The algorithm is not done if the flag SameParameter was True on an Edge. 4. SameParameter_s(S: OCP.OCP.TopoDS.TopoDS_Shape, theReshaper: OCP.OCP.BRepTools.BRepTools_ReShape, Tolerance: float = 1e-05, forced: bool = False) -> None Computes new 2d curve(s) for all the edges of <S> to have the same parameter as the 3d curve. The algorithm is not done if the flag SameParameter was True on an Edge. theReshaper is used to record the modifications of input shape <S> to prevent any modifications on the shape itself. Thus the input shape (and its subshapes) will not be modified, instead the reshaper will contain a modified empty-copies of original subshapes as substitutions.
  // OCP.OCP.BRepLib.BRepLib.SameParameter_s (method)
  SameParameter_s(*args, **kwargs)
  SameParameter_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, Tolerance: float = 1e-05) -> None
  SameParameter_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theTolerance: float, theNewTol: float, IsUseOldEdge: bool) -> OCP.OCP.TopoDS.TopoDS_Edge
  SameParameter_s(S: OCP.OCP.TopoDS.TopoDS_Shape, Tolerance: float = 1e-05, forced: bool = False) -> None
  SameParameter_s(S: OCP.OCP.TopoDS.TopoDS_Shape, theReshaper: OCP.OCP.BRepTools.BRepTools_ReShape, Tolerance: float = 1e-05, forced: bool = False) -> None

  // UpdateTolerances_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. UpdateTolerances_s(S: OCP.OCP.TopoDS.TopoDS_Shape, verifyFaceTolerance: bool = False) -> None Replaces tolerance of FACE EDGE VERTEX by the tolerance Max of their connected handling shapes. It is not necessary to use this call after SameParameter. (called in) 2. UpdateTolerances_s(S: OCP.OCP.TopoDS.TopoDS_Shape, theReshaper: OCP.OCP.BRepTools.BRepTools_ReShape, verifyFaceTolerance: bool = False) -> None Replaces tolerance of FACE EDGE VERTEX by the tolerance Max of their connected handling shapes. It is not necessary to use this call after SameParameter. (called in) theReshaper is used to record the modifications of input shape <S> to prevent any modifications on the shape itself. Thus the input shape (and its subshapes) will not be modified, instead the reshaper will contain a modified empty-copies of original subshapes as substitutions.
  // OCP.OCP.BRepLib.BRepLib.UpdateTolerances_s (method)
  UpdateTolerances_s(*args, **kwargs)
  UpdateTolerances_s(S: OCP.OCP.TopoDS.TopoDS_Shape, verifyFaceTolerance: bool = False) -> None
  UpdateTolerances_s(S: OCP.OCP.TopoDS.TopoDS_Shape, theReshaper: OCP.OCP.BRepTools.BRepTools_ReShape, verifyFaceTolerance: bool = False) -> None

  // UpdateInnerTolerances_s(S
  // Remarks: Checks tolerances of edges (including inner points) and vertices of a shape and updates them to satisfy "SameParameter" condition
  // OCP.OCP.BRepLib.BRepLib.UpdateInnerTolerances_s (method)
  UpdateInnerTolerances_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // OrientClosedSolid_s(solid
  // Remarks: Orients the solid forward and the shell with the orientation to have matter in the solid. Returns False if the solid is unOrientable (open or incoherent)
  // OCP.OCP.BRepLib.BRepLib.OrientClosedSolid_s (method)
  OrientClosedSolid_s(solid: OCP.OCP.TopoDS.TopoDS_Solid) -> bool

  // ContinuityOfFaces_s(theEdge
  // Remarks: Returns the order of continuity between two faces connected by an edge
  // OCP.OCP.BRepLib.BRepLib.ContinuityOfFaces_s (method)
  ContinuityOfFaces_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theFace1: OCP.OCP.TopoDS.TopoDS_Face, theFace2: OCP.OCP.TopoDS.TopoDS_Face, theAngleTol: float) -> OCP.OCP.GeomAbs.GeomAbs_Shape

  // EncodeRegularity_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. EncodeRegularity_s(S: OCP.OCP.TopoDS.TopoDS_Shape, TolAng: float = 1e-10) -> None Encodes the Regularity of edges on a Shape. Warning: <TolAng> is an angular tolerance, expressed in Rad. Warning: If the edges's regularity are coded before, nothing is done. 2. EncodeRegularity_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LE: OCP.OCP.TopTools.TopTools_ListOfShape, TolAng: float = 1e-10) -> None Encodes the Regularity of edges in list <LE> on the shape <S> Warning: <TolAng> is an angular tolerance, expressed in Rad. Warning: If the edges's regularity are coded before, nothing is done. 3. EncodeRegularity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face, TolAng: float = 1e-10) -> None Encodes the Regularity between <F1> and <F2> by <E> Warning: <TolAng> is an angular tolerance, expressed in Rad. Warning: If the edge's regularity is coded before, nothing is done.
  // OCP.OCP.BRepLib.BRepLib.EncodeRegularity_s (method)
  EncodeRegularity_s(*args, **kwargs)
  EncodeRegularity_s(S: OCP.OCP.TopoDS.TopoDS_Shape, TolAng: float = 1e-10) -> None
  EncodeRegularity_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LE: OCP.OCP.TopTools.TopTools_ListOfShape, TolAng: float = 1e-10) -> None
  EncodeRegularity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face, TolAng: float = 1e-10) -> None

  // SortFaces_s(S
  // Remarks: Sorts in LF the Faces of S on the complexity of their surfaces (Plane,Cylinder,Cone,Sphere,Torus,other)
  // OCP.OCP.BRepLib.BRepLib.SortFaces_s (method)
  SortFaces_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LF: OCP.OCP.TopTools.TopTools_ListOfShape) -> None

  // ReverseSortFaces_s(S
  // Remarks: Sorts in LF the Faces of S on the reverse complexity of their surfaces (other,Torus,Sphere,Cone,Cylinder,Plane)
  // OCP.OCP.BRepLib.BRepLib.ReverseSortFaces_s (method)
  ReverseSortFaces_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LF: OCP.OCP.TopTools.TopTools_ListOfShape) -> None

  // EnsureNormalConsistency_s(S
  // Remarks: Corrects the normals in Poly_Triangulation of faces, in such way that normals at nodes lying along smooth edges have the same value on both adjacent triangulations. Returns TRUE if any correction is done.
  // OCP.OCP.BRepLib.BRepLib.EnsureNormalConsistency_s (method)
  EnsureNormalConsistency_s(S: OCP.OCP.TopoDS.TopoDS_Shape, theAngTol: float = 0.001, ForceComputeNormals: bool = False) -> bool

  // UpdateDeflection_s(S
  // Remarks: Updates value of deflection in Poly_Triangulation of faces by the maximum deviation measured on existing triangulation.
  // OCP.OCP.BRepLib.BRepLib.UpdateDeflection_s (method)
  UpdateDeflection_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

  // FindValidRange_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. FindValidRange_s(theCurve: OCP.OCP.Adaptor3d.Adaptor3d_Curve, theTolE: float, theParV1: float, thePntV1: OCP.OCP.gp.gp_Pnt, theTolV1: float, theParV2: float, thePntV2: OCP.OCP.gp.gp_Pnt, theTolV2: float, theFirst: float, theLast: float) -> bool For an edge defined by 3d curve and tolerance and vertices defined by points, parameters on curve and tolerances, finds a range of curve between vertices not covered by vertices tolerances. Returns false if there is no such range. Otherwise, sets theFirst and theLast as its bounds. 2. FindValidRange_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theFirst: float, theLast: float) -> bool Finds a range of 3d curve of the edge not covered by vertices tolerances. Returns false if there is no such range. Otherwise, sets theFirst and theLast as its bounds.
  // OCP.OCP.BRepLib.BRepLib.FindValidRange_s (method)
  FindValidRange_s(*args, **kwargs)
  FindValidRange_s(theCurve: OCP.OCP.Adaptor3d.Adaptor3d_Curve, theTolE: float, theParV1: float, thePntV1: OCP.OCP.gp.gp_Pnt, theTolV1: float, theParV2: float, thePntV2: OCP.OCP.gp.gp_Pnt, theTolV2: float, theFirst: float, theLast: float) -> bool
  FindValidRange_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theFirst: float, theLast: float) -> bool

  // ExtendFace_s(theF
  // Remarks: Enlarges the face on the given value.
  // OCP.OCP.BRepLib.BRepLib.ExtendFace_s (method)
  ExtendFace_s(theF: OCP.OCP.TopoDS.TopoDS_Face, theExtVal: float, theExtUMin: bool, theExtUMax: bool, theExtVMin: bool, theExtVMax: bool, theFExtended: OCP.OCP.TopoDS.TopoDS_Face) -> None

  // BoundingVertex_s(theLV
  // Remarks: Calculates the bounding sphere around the set of vertexes from the theLV list. Returns the center (theNewCenter) and the radius (theNewTol) of this sphere. This can be used to construct the new vertex which covers the given set of other vertices.
  // OCP.OCP.BRepLib.BRepLib.BoundingVertex_s (method)
  BoundingVertex_s(theLV: OCP.OCP.TopTools.TopTools_ListOfShape, theNewCenter: OCP.OCP.gp.gp_Pnt) -> tuple[float]
