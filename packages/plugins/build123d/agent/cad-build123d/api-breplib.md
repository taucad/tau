# build123d — BRepLib

1 top-level symbols. Signatures are verbatim python.

// The BRepLib package provides general utilities for BRep
BRepLib

// **init**(self
**init**(self: OCP.OCP.BRepLib.BRepLib) -> None

// Precision_s(*args, \*\*kwargs)
Precision_s(*args, \*\*kwargs)
Precision_s(P: float) -> None
Precision_s() -> float

// Plane_s(*args, \*\*kwargs)
Plane_s(*args, \*\*kwargs)
Plane_s(P: OCP.OCP.Geom.Geom_Plane) -> None
Plane_s() -> OCP.OCP.Geom.Geom_Plane

// CheckSameRange_s(E
CheckSameRange_s(E: OCP.OCP.TopoDS.TopoDS_Edge, Confusion: float = 1e-12) -> bool

// SameRange_s(E
SameRange_s(E: OCP.OCP.TopoDS.TopoDS_Edge, Tolerance: float = 1e-05) -> None

// BuildCurve3d_s(E
BuildCurve3d_s(E: OCP.OCP.TopoDS.TopoDS_Edge, Tolerance: float = 1e-05, Continuity: OCP.OCP.GeomAbs.GeomAbs_Shape = <GeomAbs_Shape.GeomAbs_C1: 2>, MaxDegree: int = 14, MaxSegment: int = 0) -> bool

// BuildCurves3d_s(*args, \*\*kwargs)
BuildCurves3d_s(*args, \*\*kwargs)
BuildCurves3d_s(S: OCP.OCP.TopoDS.TopoDS_Shape, Tolerance: float, Continuity: OCP.OCP.GeomAbs.GeomAbs_Shape = <GeomAbs_Shape.GeomAbs_C1: 2>, MaxDegree: int = 14, MaxSegment: int = 0) -> bool
BuildCurves3d_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> bool

// BuildPCurveForEdgeOnPlane_s(*args, \*\*kwargs)
BuildPCurveForEdgeOnPlane_s(*args, \*\*kwargs)
BuildPCurveForEdgeOnPlane_s(theE: OCP.OCP.TopoDS.TopoDS_Edge, theF: OCP.OCP.TopoDS.TopoDS_Face) -> None
BuildPCurveForEdgeOnPlane_s(theE: OCP.OCP.TopoDS.TopoDS_Edge, theF: OCP.OCP.TopoDS.TopoDS_Face, aC2D: OCP.OCP.Geom2d.Geom2d_Curve) -> tuple[bool]

// UpdateEdgeTol_s(E
UpdateEdgeTol_s(E: OCP.OCP.TopoDS.TopoDS_Edge, MinToleranceRequest: float, MaxToleranceToCheck: float) -> bool

// UpdateEdgeTolerance_s(S
UpdateEdgeTolerance_s(S: OCP.OCP.TopoDS.TopoDS_Shape, MinToleranceRequest: float, MaxToleranceToCheck: float) -> bool

// SameParameter_s(*args, \*\*kwargs)
SameParameter_s(*args, \*\*kwargs)
SameParameter_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, Tolerance: float = 1e-05) -> None
SameParameter_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theTolerance: float, theNewTol: float, IsUseOldEdge: bool) -> OCP.OCP.TopoDS.TopoDS_Edge
SameParameter_s(S: OCP.OCP.TopoDS.TopoDS_Shape, Tolerance: float = 1e-05, forced: bool = False) -> None
SameParameter_s(S: OCP.OCP.TopoDS.TopoDS_Shape, theReshaper: OCP.OCP.BRepTools.BRepTools_ReShape, Tolerance: float = 1e-05, forced: bool = False) -> None

// UpdateTolerances_s(*args, \*\*kwargs)
UpdateTolerances_s(*args, \*\*kwargs)
UpdateTolerances_s(S: OCP.OCP.TopoDS.TopoDS_Shape, verifyFaceTolerance: bool = False) -> None
UpdateTolerances_s(S: OCP.OCP.TopoDS.TopoDS_Shape, theReshaper: OCP.OCP.BRepTools.BRepTools_ReShape, verifyFaceTolerance: bool = False) -> None

// UpdateInnerTolerances_s(S
UpdateInnerTolerances_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

// OrientClosedSolid_s(solid
OrientClosedSolid_s(solid: OCP.OCP.TopoDS.TopoDS_Solid) -> bool

// ContinuityOfFaces_s(theEdge
ContinuityOfFaces_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theFace1: OCP.OCP.TopoDS.TopoDS_Face, theFace2: OCP.OCP.TopoDS.TopoDS_Face, theAngleTol: float) -> OCP.OCP.GeomAbs.GeomAbs_Shape

// EncodeRegularity_s(*args, \*\*kwargs)
EncodeRegularity_s(*args, \*\*kwargs)
EncodeRegularity_s(S: OCP.OCP.TopoDS.TopoDS_Shape, TolAng: float = 1e-10) -> None
EncodeRegularity_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LE: OCP.OCP.TopTools.TopTools_ListOfShape, TolAng: float = 1e-10) -> None
EncodeRegularity_s(E: OCP.OCP.TopoDS.TopoDS_Edge, F1: OCP.OCP.TopoDS.TopoDS_Face, F2: OCP.OCP.TopoDS.TopoDS_Face, TolAng: float = 1e-10) -> None

// SortFaces_s(S
SortFaces_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LF: OCP.OCP.TopTools.TopTools_ListOfShape) -> None

// ReverseSortFaces_s(S
ReverseSortFaces_s(S: OCP.OCP.TopoDS.TopoDS_Shape, LF: OCP.OCP.TopTools.TopTools_ListOfShape) -> None

// EnsureNormalConsistency_s(S
EnsureNormalConsistency_s(S: OCP.OCP.TopoDS.TopoDS_Shape, theAngTol: float = 0.001, ForceComputeNormals: bool = False) -> bool

// UpdateDeflection_s(S
UpdateDeflection_s(S: OCP.OCP.TopoDS.TopoDS_Shape) -> None

// FindValidRange_s(*args, \*\*kwargs)
FindValidRange_s(*args, \*\*kwargs)
FindValidRange_s(theCurve: OCP.OCP.Adaptor3d.Adaptor3d_Curve, theTolE: float, theParV1: float, thePntV1: OCP.OCP.gp.gp_Pnt, theTolV1: float, theParV2: float, thePntV2: OCP.OCP.gp.gp_Pnt, theTolV2: float, theFirst: float, theLast: float) -> bool
FindValidRange_s(theEdge: OCP.OCP.TopoDS.TopoDS_Edge, theFirst: float, theLast: float) -> bool

// ExtendFace_s(theF
ExtendFace_s(theF: OCP.OCP.TopoDS.TopoDS_Face, theExtVal: float, theExtUMin: bool, theExtUMax: bool, theExtVMin: bool, theExtVMax: bool, theFExtended: OCP.OCP.TopoDS.TopoDS_Face) -> None

// BoundingVertex_s(theLV
BoundingVertex_s(theLV: OCP.OCP.TopTools.TopTools_ListOfShape, theNewCenter: OCP.OCP.gp.gp_Pnt) -> tuple[float]
