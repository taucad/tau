# libcascade — BRepLib

22 top-level symbols. Signatures are verbatim typescript.

BRepLib: declare class BRepLib

  constructor

  static Precision(P: number): void;
  static Precision(): number;
  static Precision(P: number): void;
  static Precision(): number;

  static Plane(P: Geom_Plane): void;
  static Plane(): Geom_Plane;
  static Plane(P: Geom_Plane): void;
  static Plane(): Geom_Plane;

  static CheckSameRange(E: TopoDS_Edge, Confusion?: number): boolean;

  static SameRange(E: TopoDS_Edge, Tolerance?: number): void;

  static BuildCurve3d(E: TopoDS_Edge, Tolerance?: number, Continuity?: GeomAbs_Shape, MaxDegree?: number, MaxSegment?: number): boolean;

  static BuildCurves3d(S: TopoDS_Shape, Tolerance: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegment: number): boolean;
  static BuildCurves3d(S: TopoDS_Shape): boolean;
  static BuildCurves3d(S: TopoDS_Shape, Tolerance: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegment: number): boolean;
  static BuildCurves3d(S: TopoDS_Shape): boolean;

  static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face): void;
  static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face, bToUpdate?: boolean): { aC2D: Geom2d_Curve; bToUpdate: boolean; [Symbol.dispose](): void };
  static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face): void;
  static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face, bToUpdate?: boolean): { aC2D: Geom2d_Curve; bToUpdate: boolean; [Symbol.dispose](): void };

  static UpdateEdgeTol(E: TopoDS_Edge, MinToleranceRequest: number, MaxToleranceToCheck: number): boolean;

  static UpdateEdgeTolerance(S: TopoDS_Shape, MinToleranceRequest: number, MaxToleranceToCheck: number): boolean;

  static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
  static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
  static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
  static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;
  static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
  static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
  static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
  static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;
  static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
  static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
  static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
  static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;
  static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
  static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
  static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
  static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;

  static UpdateTolerances(S: TopoDS_Shape, verifyFaceTolerance: boolean): void;
  static UpdateTolerances(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, verifyFaceTolerance: boolean): void;
  static UpdateTolerances(S: TopoDS_Shape, verifyFaceTolerance: boolean): void;
  static UpdateTolerances(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, verifyFaceTolerance: boolean): void;

  static UpdateInnerTolerances(S: TopoDS_Shape): void;

  static OrientClosedSolid(solid: TopoDS_Solid): boolean;

  static ContinuityOfFaces(theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theAngleTol: number): GeomAbs_Shape;

  static EncodeRegularity(S: TopoDS_Shape, TolAng: number): void;
  static EncodeRegularity(S: TopoDS_Shape, LE: NCollection_List_TopoDS_Shape, TolAng: number): void;
  static EncodeRegularity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, TolAng: number): void;
  static EncodeRegularity(S: TopoDS_Shape, TolAng: number): void;
  static EncodeRegularity(S: TopoDS_Shape, LE: NCollection_List_TopoDS_Shape, TolAng: number): void;
  static EncodeRegularity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, TolAng: number): void;
  static EncodeRegularity(S: TopoDS_Shape, TolAng: number): void;
  static EncodeRegularity(S: TopoDS_Shape, LE: NCollection_List_TopoDS_Shape, TolAng: number): void;
  static EncodeRegularity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, TolAng: number): void;

  static SortFaces(S: TopoDS_Shape, LF: NCollection_List_TopoDS_Shape): void;

  static ReverseSortFaces(S: TopoDS_Shape, LF: NCollection_List_TopoDS_Shape): void;

  static EnsureNormalConsistency(S: TopoDS_Shape, theAngTol?: number, ForceComputeNormals?: boolean): boolean;

  static UpdateDeflection(S: TopoDS_Shape): void;

  static BoundingVertex(theLV: NCollection_List_TopoDS_Shape, theNewCenter: gp_Pnt, theNewTol?: number): { theNewTol: number };

  static FindValidRange(theCurve: Adaptor3d_Curve, theTolE: number, theParV1: number, thePntV1: gp_Pnt, theTolV1: number, theParV2: number, thePntV2: gp_Pnt, theTolV2: number, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };
  static FindValidRange(theEdge: TopoDS_Edge, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };
  static FindValidRange(theCurve: Adaptor3d_Curve, theTolE: number, theParV1: number, thePntV1: gp_Pnt, theTolV1: number, theParV2: number, thePntV2: gp_Pnt, theTolV2: number, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };
  static FindValidRange(theEdge: TopoDS_Edge, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };

  static ExtendFace(theF: TopoDS_Face, theExtVal: number, theExtUMin: boolean, theExtUMax: boolean, theExtVMin: boolean, theExtVMax: boolean, theFExtended: TopoDS_Face): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_CheckCurveOnSurface: declare class BRepLib_CheckCurveOnSurface

  constructor

  Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;

  Perform(): void;

  IsDone(): boolean;

  SetParallel(theIsParallel: boolean): void;

  IsParallel(): boolean;

  ErrorStatus(): number;

  MaxDistance(): number;

  MaxParameter(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_Command: declare class BRepLib_Command

  IsDone(): boolean;

  Check(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_EdgeError: typeof BRepLib_EdgeError[keyof typeof BRepLib_EdgeError]

BRepLib_FaceError: typeof BRepLib_FaceError[keyof typeof BRepLib_FaceError]

BRepLib_FindSurface: declare class BRepLib_FindSurface

  constructor

  Init(S: TopoDS_Shape, Tol?: number, OnlyPlane?: boolean, OnlyClosed?: boolean): void;

  Found(): boolean;

  Surface(): Geom_Surface;

  Tolerance(): number;

  ToleranceReached(): number;

  Existed(): boolean;

  Location(): TopLoc_Location;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_FuseEdges: declare class BRepLib_FuseEdges

  constructor

  AvoidEdges(theMapEdg: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  SetConcatBSpl(theConcatBSpl?: boolean): void;

  Edges(theMapLstEdg: NCollection_DataMap_int_NCollection_List_TopoDS_Shape): void;

  ResultEdges(theMapEdg: NCollection_DataMap_int_TopoDS_Shape): void;

  Faces(theMapFac: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  Shape(): TopoDS_Shape;

  NbVertices(): number;

  Perform(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakeEdge: declare class BRepLib_MakeEdge extends BRepLib_MakeShape

  constructor

  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom_Curve): void;
  Init(C: Geom2d_Curve, S: Geom_Surface): void;
  Init(C: Geom_Curve, p1: number, p2: number): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

  Error(): BRepLib_EdgeError;

  Edge(): TopoDS_Edge;

  Vertex1(): TopoDS_Vertex;

  Vertex2(): TopoDS_Vertex;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakeEdge2d: declare class BRepLib_MakeEdge2d extends BRepLib_MakeShape

  constructor

  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

  Error(): BRepLib_EdgeError;

  Edge(): TopoDS_Edge;

  Vertex1(): TopoDS_Vertex;

  Vertex2(): TopoDS_Vertex;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakeFace: declare class BRepLib_MakeFace extends BRepLib_MakeShape

  constructor

  Init(F: TopoDS_Face): void;
  Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
  Init(F: TopoDS_Face): void;
  Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;
  Init(F: TopoDS_Face): void;
  Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;

  Add(W: TopoDS_Wire): void;

  Error(): BRepLib_FaceError;

  Face(): TopoDS_Face;

  static IsDegenerated(theCurve: Geom_Curve, theMaxTol: number, theActTol?: number): { returnValue: boolean; theActTol: number };

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakePolygon: declare class BRepLib_MakePolygon extends BRepLib_MakeShape

  constructor

  Add(P: gp_Pnt): void;
  Add(V: TopoDS_Vertex): void;
  Add(P: gp_Pnt): void;
  Add(V: TopoDS_Vertex): void;

  Added(): boolean;

  Close(): void;

  FirstVertex(): TopoDS_Vertex;

  LastVertex(): TopoDS_Vertex;

  Edge(): TopoDS_Edge;

  Wire(): TopoDS_Wire;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakeShape: declare class BRepLib_MakeShape extends BRepLib_Command

  Build(): void;

  Shape(): TopoDS_Shape;

  FaceStatus(F: TopoDS_Face): BRepLib_ShapeModification;

  HasDescendants(F: TopoDS_Face): boolean;

  DescendantFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  NbSurfaces(): number;

  NewFaces(I: number): NCollection_List_TopoDS_Shape;

  FacesFromEdges(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakeShell: declare class BRepLib_MakeShell extends BRepLib_MakeShape

  constructor

  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Segment?: boolean): void;

  Error(): BRepLib_ShellError;

  Shell(): TopoDS_Shell;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakeSolid: declare class BRepLib_MakeSolid extends BRepLib_MakeShape

  constructor

  Add(S: TopoDS_Shell): void;

  Solid(): TopoDS_Solid;

  FaceStatus(F: TopoDS_Face): BRepLib_ShapeModification;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakeVertex: declare class BRepLib_MakeVertex extends BRepLib_MakeShape

  constructor

  Vertex(): TopoDS_Vertex;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_MakeWire: declare class BRepLib_MakeWire extends BRepLib_MakeShape

  constructor

  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;
  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;
  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;

  Error(): BRepLib_WireError;

  Wire(): TopoDS_Wire;

  Edge(): TopoDS_Edge;

  Vertex(): TopoDS_Vertex;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_PointCloudShape: declare class BRepLib_PointCloudShape

  Shape(): TopoDS_Shape;

  SetShape(theShape: TopoDS_Shape): void;

  Tolerance(): number;

  SetTolerance(theTol: number): void;

  GetDistance(): number;

  SetDistance(theDist: number): void;

  NbPointsByDensity(theDensity?: number): number;

  NbPointsByTriangulation(): number;

  GeneratePointsByDensity(theDensity?: number): boolean;

  GeneratePointsByTriangulation(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_ShapeModification: typeof BRepLib_ShapeModification[keyof typeof BRepLib_ShapeModification]

BRepLib_ShellError: typeof BRepLib_ShellError[keyof typeof BRepLib_ShellError]

BRepLib_ToolTriangulatedShape: declare class BRepLib_ToolTriangulatedShape

  constructor

  static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation): void;
  static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation, thePolyConnect: Poly_Connect): void;
  static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation): void;
  static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation, thePolyConnect: Poly_Connect): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_ValidateEdge: declare class BRepLib_ValidateEdge

  constructor

  SetExactMethod(theIsExact: boolean): void;

  IsExactMethod(): boolean;

  SetParallel(theIsMultiThread: boolean): void;

  IsParallel(): boolean;

  SetControlPointsNumber(theControlPointsNumber: number): void;

  SetExitIfToleranceExceeded(theToleranceForChecking: number): void;

  Process(): void;

  IsDone(): boolean;

  CheckTolerance(theToleranceToCheck: number): boolean;

  GetMaxDistance(): number;

  UpdateTolerance(theToleranceToUpdate?: number): { theToleranceToUpdate: number };

  delete(): void;

  [Symbol.dispose](): void;

BRepLib_WireError: typeof BRepLib_WireError[keyof typeof BRepLib_WireError]
