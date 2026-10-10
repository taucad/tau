# libcascade — BRepLib

22 top-level symbols. Signatures are verbatim typescript.

BRepLib: declare class BRepLib

  // BRepLib.constructor (constructor)
  constructor();

  // BRepLib.Precision (method)
  static Precision(P: number): void;
  static Precision(): number;

  // BRepLib.Plane (method)
  static Plane(P: Geom_Plane): void;
  static Plane(): Geom_Plane;

  // BRepLib.CheckSameRange (method)
  static CheckSameRange(E: TopoDS_Edge, Confusion?: number): boolean;

  // BRepLib.SameRange (method)
  static SameRange(E: TopoDS_Edge, Tolerance?: number): void;

  // BRepLib.BuildCurve3d (method)
  static BuildCurve3d(E: TopoDS_Edge, Tolerance?: number, Continuity?: GeomAbs_Shape, MaxDegree?: number, MaxSegment?: number): boolean;

  // BRepLib.BuildCurves3d (method)
  static BuildCurves3d(S: TopoDS_Shape, Tolerance: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegment: number): boolean;
  static BuildCurves3d(S: TopoDS_Shape): boolean;

  // BRepLib.BuildPCurveForEdgeOnPlane (method)
  static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face): void;
  static BuildPCurveForEdgeOnPlane(theE: TopoDS_Edge, theF: TopoDS_Face, bToUpdate?: boolean): { aC2D: Geom2d_Curve; bToUpdate: boolean; [Symbol.dispose](): void };

  // BRepLib.UpdateEdgeTol (method)
  static UpdateEdgeTol(E: TopoDS_Edge, MinToleranceRequest: number, MaxToleranceToCheck: number): boolean;

  // BRepLib.UpdateEdgeTolerance (method)
  static UpdateEdgeTolerance(S: TopoDS_Shape, MinToleranceRequest: number, MaxToleranceToCheck: number): boolean;

  // BRepLib.SameParameter (method)
  static SameParameter(theEdge: TopoDS_Edge, Tolerance: number): void;
  static SameParameter(S: TopoDS_Shape, Tolerance: number, forced: boolean): void;
  static SameParameter(theEdge: TopoDS_Edge, theTolerance: number, theNewTol: number, IsUseOldEdge: boolean): { returnValue: TopoDS_Edge; theNewTol: number; [Symbol.dispose](): void };
  static SameParameter(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, Tolerance: number, forced: boolean): void;

  // BRepLib.UpdateTolerances (method)
  static UpdateTolerances(S: TopoDS_Shape, verifyFaceTolerance: boolean): void;
  static UpdateTolerances(S: TopoDS_Shape, theReshaper: BRepTools_ReShape, verifyFaceTolerance: boolean): void;

  // BRepLib.UpdateInnerTolerances (method)
  static UpdateInnerTolerances(S: TopoDS_Shape): void;

  // BRepLib.OrientClosedSolid (method)
  static OrientClosedSolid(solid: TopoDS_Solid): boolean;

  // BRepLib.ContinuityOfFaces (method)
  static ContinuityOfFaces(theEdge: TopoDS_Edge, theFace1: TopoDS_Face, theFace2: TopoDS_Face, theAngleTol: number): GeomAbs_Shape;

  // BRepLib.EncodeRegularity (method)
  static EncodeRegularity(S: TopoDS_Shape, TolAng: number): void;
  static EncodeRegularity(S: TopoDS_Shape, LE: NCollection_List_TopoDS_Shape, TolAng: number): void;
  static EncodeRegularity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, TolAng: number): void;

  // BRepLib.SortFaces (method)
  static SortFaces(S: TopoDS_Shape, LF: NCollection_List_TopoDS_Shape): void;

  // BRepLib.ReverseSortFaces (method)
  static ReverseSortFaces(S: TopoDS_Shape, LF: NCollection_List_TopoDS_Shape): void;

  // BRepLib.EnsureNormalConsistency (method)
  static EnsureNormalConsistency(S: TopoDS_Shape, theAngTol?: number, ForceComputeNormals?: boolean): boolean;

  // BRepLib.UpdateDeflection (method)
  static UpdateDeflection(S: TopoDS_Shape): void;

  // BRepLib.BoundingVertex (method)
  static BoundingVertex(theLV: NCollection_List_TopoDS_Shape, theNewCenter: gp_Pnt, theNewTol?: number): { theNewTol: number };

  // BRepLib.FindValidRange (method)
  static FindValidRange(theCurve: Adaptor3d_Curve, theTolE: number, theParV1: number, thePntV1: gp_Pnt, theTolV1: number, theParV2: number, thePntV2: gp_Pnt, theTolV2: number, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };
  static FindValidRange(theEdge: TopoDS_Edge, theFirst?: number, theLast?: number): { returnValue: boolean; theFirst: number; theLast: number };

  // BRepLib.ExtendFace (method)
  static ExtendFace(theF: TopoDS_Face, theExtVal: number, theExtUMin: boolean, theExtUMax: boolean, theExtVMin: boolean, theExtVMax: boolean, theFExtended: TopoDS_Face): void;

  // BRepLib.delete (method)
  delete(): void;

  // BRepLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_CheckCurveOnSurface: declare class BRepLib_CheckCurveOnSurface

  // BRepLib_CheckCurveOnSurface.constructor (constructor)
  constructor();
  constructor(theEdge: TopoDS_Edge, theFace: TopoDS_Face);

  // BRepLib_CheckCurveOnSurface.Init (method)
  Init(theEdge: TopoDS_Edge, theFace: TopoDS_Face): void;

  // BRepLib_CheckCurveOnSurface.Perform (method)
  Perform(): void;

  // BRepLib_CheckCurveOnSurface.IsDone (method)
  IsDone(): boolean;

  // BRepLib_CheckCurveOnSurface.SetParallel (method)
  SetParallel(theIsParallel: boolean): void;

  // BRepLib_CheckCurveOnSurface.IsParallel (method)
  IsParallel(): boolean;

  // BRepLib_CheckCurveOnSurface.ErrorStatus (method)
  ErrorStatus(): number;

  // BRepLib_CheckCurveOnSurface.MaxDistance (method)
  MaxDistance(): number;

  // BRepLib_CheckCurveOnSurface.MaxParameter (method)
  MaxParameter(): number;

  // BRepLib_CheckCurveOnSurface.delete (method)
  delete(): void;

  // BRepLib_CheckCurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_Command: declare class BRepLib_Command

  // BRepLib_Command.IsDone (method)
  IsDone(): boolean;

  // BRepLib_Command.Check (method)
  Check(): void;

  // BRepLib_Command.delete (method)
  delete(): void;

  // BRepLib_Command.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_EdgeError: typeof BRepLib_EdgeError[keyof typeof BRepLib_EdgeError]

  readonly BRepLib_EdgeDone: 'BRepLib_EdgeDone'

  readonly BRepLib_PointProjectionFailed: 'BRepLib_PointProjectionFailed'

  readonly BRepLib_ParameterOutOfRange: 'BRepLib_ParameterOutOfRange'

  readonly BRepLib_DifferentPointsOnClosedCurve: 'BRepLib_DifferentPointsOnClosedCurve'

  readonly BRepLib_PointWithInfiniteParameter: 'BRepLib_PointWithInfiniteParameter'

  readonly BRepLib_DifferentsPointAndParameter: 'BRepLib_DifferentsPointAndParameter'

  readonly BRepLib_LineThroughIdenticPoints: 'BRepLib_LineThroughIdenticPoints'

BRepLib_FaceError: typeof BRepLib_FaceError[keyof typeof BRepLib_FaceError]

  readonly BRepLib_FaceDone: 'BRepLib_FaceDone'

  readonly BRepLib_NoFace: 'BRepLib_NoFace'

  readonly BRepLib_NotPlanar: 'BRepLib_NotPlanar'

  readonly BRepLib_CurveProjectionFailed: 'BRepLib_CurveProjectionFailed'

  readonly BRepLib_ParametersOutOfRange: 'BRepLib_ParametersOutOfRange'

BRepLib_FindSurface: declare class BRepLib_FindSurface

  // BRepLib_FindSurface.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, Tol?: number, OnlyPlane?: boolean, OnlyClosed?: boolean);

  // BRepLib_FindSurface.Init (method)
  Init(S: TopoDS_Shape, Tol?: number, OnlyPlane?: boolean, OnlyClosed?: boolean): void;

  // BRepLib_FindSurface.Found (method)
  Found(): boolean;

  // BRepLib_FindSurface.Surface (method)
  Surface(): Geom_Surface;

  // BRepLib_FindSurface.Tolerance (method)
  Tolerance(): number;

  // BRepLib_FindSurface.ToleranceReached (method)
  ToleranceReached(): number;

  // BRepLib_FindSurface.Existed (method)
  Existed(): boolean;

  // BRepLib_FindSurface.Location (method)
  Location(): TopLoc_Location;

  // BRepLib_FindSurface.delete (method)
  delete(): void;

  // BRepLib_FindSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_FuseEdges: declare class BRepLib_FuseEdges

  // BRepLib_FuseEdges.constructor (constructor)
  constructor(theShape: TopoDS_Shape, PerformNow?: boolean);

  // BRepLib_FuseEdges.AvoidEdges (method)
  AvoidEdges(theMapEdg: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BRepLib_FuseEdges.SetConcatBSpl (method)
  SetConcatBSpl(theConcatBSpl?: boolean): void;

  // BRepLib_FuseEdges.Edges (method)
  Edges(theMapLstEdg: NCollection_DataMap_int_NCollection_List_TopoDS_Shape): void;

  // BRepLib_FuseEdges.ResultEdges (method)
  ResultEdges(theMapEdg: NCollection_DataMap_int_TopoDS_Shape): void;

  // BRepLib_FuseEdges.Faces (method)
  Faces(theMapFac: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BRepLib_FuseEdges.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepLib_FuseEdges.NbVertices (method)
  NbVertices(): number;

  // BRepLib_FuseEdges.Perform (method)
  Perform(): void;

  // BRepLib_FuseEdges.delete (method)
  delete(): void;

  // BRepLib_FuseEdges.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakeEdge: declare class BRepLib_MakeEdge extends BRepLib_MakeShape

  // BRepLib_MakeEdge.constructor (constructor)
  constructor();
  constructor(L: gp_Lin);
  constructor(L: gp_Circ);
  constructor(L: gp_Elips);
  constructor(L: gp_Hypr);
  constructor(L: gp_Parab);
  constructor(L: Geom_Curve);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom2d_Curve, S: Geom_Surface);
  constructor(L: gp_Lin, p1: number, p2: number);
  constructor(L: gp_Lin, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Lin, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Circ, p1: number, p2: number);
  constructor(L: gp_Circ, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Circ, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Elips, p1: number, p2: number);
  constructor(L: gp_Elips, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Elips, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Hypr, p1: number, p2: number);
  constructor(L: gp_Hypr, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Hypr, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Parab, p1: number, p2: number);
  constructor(L: gp_Parab, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Parab, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom_Curve, p1: number, p2: number);
  constructor(L: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number);
  constructor(L: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number);

  // BRepLib_MakeEdge.Init (method)
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

  // BRepLib_MakeEdge.Error (method)
  Error(): BRepLib_EdgeError;

  // BRepLib_MakeEdge.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepLib_MakeEdge.Vertex1 (method)
  Vertex1(): TopoDS_Vertex;

  // BRepLib_MakeEdge.Vertex2 (method)
  Vertex2(): TopoDS_Vertex;

  // BRepLib_MakeEdge.delete (method)
  delete(): void;

  // BRepLib_MakeEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakeEdge2d: declare class BRepLib_MakeEdge2d extends BRepLib_MakeShape

  // BRepLib_MakeEdge2d.constructor (constructor)
  constructor(L: gp_Lin2d);
  constructor(L: gp_Circ2d);
  constructor(L: gp_Elips2d);
  constructor(L: gp_Hypr2d);
  constructor(L: gp_Parab2d);
  constructor(L: Geom2d_Curve);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Lin2d, p1: number, p2: number);
  constructor(L: gp_Lin2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Lin2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Circ2d, p1: number, p2: number);
  constructor(L: gp_Circ2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Circ2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Elips2d, p1: number, p2: number);
  constructor(L: gp_Elips2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Elips2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Hypr2d, p1: number, p2: number);
  constructor(L: gp_Hypr2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Hypr2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Parab2d, p1: number, p2: number);
  constructor(L: gp_Parab2d, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: gp_Parab2d, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom2d_Curve, p1: number, p2: number);
  constructor(L: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d);
  constructor(L: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number);
  constructor(L: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number);

  // BRepLib_MakeEdge2d.Init (method)
  Init(C: Geom2d_Curve): void;
  Init(C: Geom2d_Curve, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;
  Init(C: Geom2d_Curve, P1: gp_Pnt2d, P2: gp_Pnt2d, p1: number, p2: number): void;
  Init(C: Geom2d_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number): void;

  // BRepLib_MakeEdge2d.Error (method)
  Error(): BRepLib_EdgeError;

  // BRepLib_MakeEdge2d.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepLib_MakeEdge2d.Vertex1 (method)
  Vertex1(): TopoDS_Vertex;

  // BRepLib_MakeEdge2d.Vertex2 (method)
  Vertex2(): TopoDS_Vertex;

  // BRepLib_MakeEdge2d.delete (method)
  delete(): void;

  // BRepLib_MakeEdge2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakeFace: declare class BRepLib_MakeFace extends BRepLib_MakeShape

  // BRepLib_MakeFace.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face);
  constructor(P: gp_Pln);
  constructor(C: gp_Cylinder);
  constructor(C: gp_Cone);
  constructor(S: gp_Sphere);
  constructor(C: gp_Torus);
  constructor(S: Geom_Surface, TolDegen: number);
  constructor(W: TopoDS_Wire, OnlyPlane?: boolean);
  constructor(F: TopoDS_Face, W: TopoDS_Wire);
  constructor(P: gp_Pln, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Cylinder, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Cone, W: TopoDS_Wire, Inside?: boolean);
  constructor(S: gp_Sphere, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Torus, W: TopoDS_Wire, Inside?: boolean);
  constructor(S: Geom_Surface, W: TopoDS_Wire, Inside?: boolean);
  constructor(P: gp_Pln, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Cylinder, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Cone, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(S: gp_Sphere, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Torus, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number);

  // BRepLib_MakeFace.Init (method)
  Init(F: TopoDS_Face): void;
  Init(S: Geom_Surface, Bound: boolean, TolDegen: number): void;
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number): void;

  // BRepLib_MakeFace.Add (method)
  Add(W: TopoDS_Wire): void;

  // BRepLib_MakeFace.Error (method)
  Error(): BRepLib_FaceError;

  // BRepLib_MakeFace.Face (method)
  Face(): TopoDS_Face;

  // BRepLib_MakeFace.IsDegenerated (method)
  static IsDegenerated(theCurve: Geom_Curve, theMaxTol: number, theActTol?: number): { returnValue: boolean; theActTol: number };

  // BRepLib_MakeFace.delete (method)
  delete(): void;

  // BRepLib_MakeFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakePolygon: declare class BRepLib_MakePolygon extends BRepLib_MakeShape

  // BRepLib_MakePolygon.constructor (constructor)
  constructor();
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, Close?: boolean);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex, V3: TopoDS_Vertex, Close?: boolean);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, P4: gp_Pnt, Close?: boolean);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex, V3: TopoDS_Vertex, V4: TopoDS_Vertex, Close?: boolean);

  // BRepLib_MakePolygon.Add (method)
  Add(P: gp_Pnt): void;
  Add(V: TopoDS_Vertex): void;

  // BRepLib_MakePolygon.Added (method)
  Added(): boolean;

  // BRepLib_MakePolygon.Close (method)
  Close(): void;

  // BRepLib_MakePolygon.FirstVertex (method)
  FirstVertex(): TopoDS_Vertex;

  // BRepLib_MakePolygon.LastVertex (method)
  LastVertex(): TopoDS_Vertex;

  // BRepLib_MakePolygon.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepLib_MakePolygon.Wire (method)
  Wire(): TopoDS_Wire;

  // BRepLib_MakePolygon.delete (method)
  delete(): void;

  // BRepLib_MakePolygon.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakeShape: declare class BRepLib_MakeShape extends BRepLib_Command

  // BRepLib_MakeShape.Build (method)
  Build(): void;

  // BRepLib_MakeShape.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepLib_MakeShape.FaceStatus (method)
  FaceStatus(F: TopoDS_Face): BRepLib_ShapeModification;

  // BRepLib_MakeShape.HasDescendants (method)
  HasDescendants(F: TopoDS_Face): boolean;

  // BRepLib_MakeShape.DescendantFaces (method)
  DescendantFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // BRepLib_MakeShape.NbSurfaces (method)
  NbSurfaces(): number;

  // BRepLib_MakeShape.NewFaces (method)
  NewFaces(I: number): NCollection_List_TopoDS_Shape;

  // BRepLib_MakeShape.FacesFromEdges (method)
  FacesFromEdges(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

  // BRepLib_MakeShape.delete (method)
  delete(): void;

  // BRepLib_MakeShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakeShell: declare class BRepLib_MakeShell extends BRepLib_MakeShape

  // BRepLib_MakeShell.constructor (constructor)
  constructor();
  constructor(S: Geom_Surface, Segment?: boolean);
  constructor(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Segment?: boolean);

  // BRepLib_MakeShell.Init (method)
  Init(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, Segment?: boolean): void;

  // BRepLib_MakeShell.Error (method)
  Error(): BRepLib_ShellError;

  // BRepLib_MakeShell.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepLib_MakeShell.delete (method)
  delete(): void;

  // BRepLib_MakeShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakeSolid: declare class BRepLib_MakeSolid extends BRepLib_MakeShape

  // BRepLib_MakeSolid.constructor (constructor)
  constructor();
  constructor(S: TopoDS_CompSolid);
  constructor(S: TopoDS_Shell);
  constructor(So: TopoDS_Solid);
  constructor(S1: TopoDS_Shell, S2: TopoDS_Shell);
  constructor(So: TopoDS_Solid, S: TopoDS_Shell);
  constructor(S1: TopoDS_Shell, S2: TopoDS_Shell, S3: TopoDS_Shell);

  // BRepLib_MakeSolid.Add (method)
  Add(S: TopoDS_Shell): void;

  // BRepLib_MakeSolid.Solid (method)
  Solid(): TopoDS_Solid;

  // BRepLib_MakeSolid.FaceStatus (method)
  FaceStatus(F: TopoDS_Face): BRepLib_ShapeModification;

  // BRepLib_MakeSolid.delete (method)
  delete(): void;

  // BRepLib_MakeSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakeVertex: declare class BRepLib_MakeVertex extends BRepLib_MakeShape

  // BRepLib_MakeVertex.constructor (constructor)
  constructor(P: gp_Pnt);

  // BRepLib_MakeVertex.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // BRepLib_MakeVertex.delete (method)
  delete(): void;

  // BRepLib_MakeVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_MakeWire: declare class BRepLib_MakeWire extends BRepLib_MakeShape

  // BRepLib_MakeWire.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge);
  constructor(W: TopoDS_Wire);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge);
  constructor(W: TopoDS_Wire, E: TopoDS_Edge);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge, E3: TopoDS_Edge);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge, E3: TopoDS_Edge, E4: TopoDS_Edge);

  // BRepLib_MakeWire.Add (method)
  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;

  // BRepLib_MakeWire.Error (method)
  Error(): BRepLib_WireError;

  // BRepLib_MakeWire.Wire (method)
  Wire(): TopoDS_Wire;

  // BRepLib_MakeWire.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepLib_MakeWire.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // BRepLib_MakeWire.delete (method)
  delete(): void;

  // BRepLib_MakeWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_PointCloudShape: declare class BRepLib_PointCloudShape

  // BRepLib_PointCloudShape.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepLib_PointCloudShape.SetShape (method)
  SetShape(theShape: TopoDS_Shape): void;

  // BRepLib_PointCloudShape.Tolerance (method)
  Tolerance(): number;

  // BRepLib_PointCloudShape.SetTolerance (method)
  SetTolerance(theTol: number): void;

  // BRepLib_PointCloudShape.GetDistance (method)
  GetDistance(): number;

  // BRepLib_PointCloudShape.SetDistance (method)
  SetDistance(theDist: number): void;

  // BRepLib_PointCloudShape.NbPointsByDensity (method)
  NbPointsByDensity(theDensity?: number): number;

  // BRepLib_PointCloudShape.NbPointsByTriangulation (method)
  NbPointsByTriangulation(): number;

  // BRepLib_PointCloudShape.GeneratePointsByDensity (method)
  GeneratePointsByDensity(theDensity?: number): boolean;

  // BRepLib_PointCloudShape.GeneratePointsByTriangulation (method)
  GeneratePointsByTriangulation(): boolean;

  // BRepLib_PointCloudShape.delete (method)
  delete(): void;

  // BRepLib_PointCloudShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_ShapeModification: typeof BRepLib_ShapeModification[keyof typeof BRepLib_ShapeModification]

  readonly BRepLib_Preserved: 'BRepLib_Preserved'

  readonly BRepLib_Deleted: 'BRepLib_Deleted'

  readonly BRepLib_Trimmed: 'BRepLib_Trimmed'

  readonly BRepLib_Merged: 'BRepLib_Merged'

  readonly BRepLib_BoundaryModified: 'BRepLib_BoundaryModified'

BRepLib_ShellError: typeof BRepLib_ShellError[keyof typeof BRepLib_ShellError]

  readonly BRepLib_ShellDone: 'BRepLib_ShellDone'

  readonly BRepLib_EmptyShell: 'BRepLib_EmptyShell'

  readonly BRepLib_DisconnectedShell: 'BRepLib_DisconnectedShell'

  readonly BRepLib_ShellParametersOutOfRange: 'BRepLib_ShellParametersOutOfRange'

BRepLib_ToolTriangulatedShape: declare class BRepLib_ToolTriangulatedShape

  // BRepLib_ToolTriangulatedShape.constructor (constructor)
  constructor();

  // BRepLib_ToolTriangulatedShape.ComputeNormals (method)
  static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation): void;
  static ComputeNormals(theFace: TopoDS_Face, theTris: Poly_Triangulation, thePolyConnect: Poly_Connect): void;

  // BRepLib_ToolTriangulatedShape.delete (method)
  delete(): void;

  // BRepLib_ToolTriangulatedShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_ValidateEdge: declare class BRepLib_ValidateEdge

  // BRepLib_ValidateEdge.constructor (constructor)
  constructor(theReferenceCurve: Adaptor3d_Curve, theOtherCurve: Adaptor3d_CurveOnSurface, theSameParameter: boolean);

  // BRepLib_ValidateEdge.SetExactMethod (method)
  SetExactMethod(theIsExact: boolean): void;

  // BRepLib_ValidateEdge.IsExactMethod (method)
  IsExactMethod(): boolean;

  // BRepLib_ValidateEdge.SetParallel (method)
  SetParallel(theIsMultiThread: boolean): void;

  // BRepLib_ValidateEdge.IsParallel (method)
  IsParallel(): boolean;

  // BRepLib_ValidateEdge.SetControlPointsNumber (method)
  SetControlPointsNumber(theControlPointsNumber: number): void;

  // BRepLib_ValidateEdge.SetExitIfToleranceExceeded (method)
  SetExitIfToleranceExceeded(theToleranceForChecking: number): void;

  // BRepLib_ValidateEdge.Process (method)
  Process(): void;

  // BRepLib_ValidateEdge.IsDone (method)
  IsDone(): boolean;

  // BRepLib_ValidateEdge.CheckTolerance (method)
  CheckTolerance(theToleranceToCheck: number): boolean;

  // BRepLib_ValidateEdge.GetMaxDistance (method)
  GetMaxDistance(): number;

  // BRepLib_ValidateEdge.UpdateTolerance (method)
  UpdateTolerance(theToleranceToUpdate?: number): { theToleranceToUpdate: number };

  // BRepLib_ValidateEdge.delete (method)
  delete(): void;

  // BRepLib_ValidateEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepLib_WireError: typeof BRepLib_WireError[keyof typeof BRepLib_WireError]

  readonly BRepLib_WireDone: 'BRepLib_WireDone'

  readonly BRepLib_EmptyWire: 'BRepLib_EmptyWire'

  readonly BRepLib_DisconnectedWire: 'BRepLib_DisconnectedWire'

  readonly BRepLib_NonManifoldWire: 'BRepLib_NonManifoldWire'
