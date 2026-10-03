# libcascade — ShapeAnalysis (2)

6 top-level symbols. Signatures are verbatim typescript.

ShapeAnalysis_Wire: declare class ShapeAnalysis_Wire extends Standard_Transient

  // ShapeAnalysis_Wire.constructor (constructor)
  constructor();
  constructor(wire: TopoDS_Wire, face: TopoDS_Face, precision: number);
  constructor(sbwd: ShapeExtend_WireData, face: TopoDS_Face, precision: number);

  // ShapeAnalysis_Wire.Init (method)
  Init(wire: TopoDS_Wire, face: TopoDS_Face, precision: number): void;
  Init(sbwd: ShapeExtend_WireData, face: TopoDS_Face, precision: number): void;

  // ShapeAnalysis_Wire.Load (method)
  Load(wire: TopoDS_Wire): void;
  Load(sbwd: ShapeExtend_WireData): void;

  // ShapeAnalysis_Wire.SetFace (method)
  SetFace(face: TopoDS_Face): void;
  SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;

  // ShapeAnalysis_Wire.SetSurface (method)
  SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
  SetSurface(surface: Geom_Surface): void;
  SetSurface(surface: Geom_Surface, location: TopLoc_Location): void;

  // ShapeAnalysis_Wire.SetPrecision (method)
  SetPrecision(precision: number): void;

  // ShapeAnalysis_Wire.ClearStatuses (method)
  ClearStatuses(): void;

  // ShapeAnalysis_Wire.IsLoaded (method)
  IsLoaded(): boolean;

  // ShapeAnalysis_Wire.IsReady (method)
  IsReady(): boolean;

  // ShapeAnalysis_Wire.Precision (method)
  Precision(): number;

  // ShapeAnalysis_Wire.WireData (method)
  WireData(): ShapeExtend_WireData;

  // ShapeAnalysis_Wire.NbEdges (method)
  NbEdges(): number;

  // ShapeAnalysis_Wire.Face (method)
  Face(): TopoDS_Face;

  // ShapeAnalysis_Wire.Surface (method)
  Surface(): ShapeAnalysis_Surface;

  // ShapeAnalysis_Wire.Perform (method)
  Perform(): boolean;

  // ShapeAnalysis_Wire.CheckOrder (method)
  CheckOrder(isClosed: boolean, mode3d: boolean): boolean;
  CheckOrder(sawo: ShapeAnalysis_WireOrder, isClosed: boolean, theMode3D: boolean, theModeBoth: boolean): boolean;

  // ShapeAnalysis_Wire.CheckConnected (method)
  CheckConnected(prec: number): boolean;
  CheckConnected(num: number, prec: number): boolean;

  // ShapeAnalysis_Wire.CheckSmall (method)
  CheckSmall(precsmall: number): boolean;
  CheckSmall(num: number, precsmall: number): boolean;

  // ShapeAnalysis_Wire.CheckEdgeCurves (method)
  CheckEdgeCurves(): boolean;

  // ShapeAnalysis_Wire.CheckDegenerated (method)
  CheckDegenerated(): boolean;
  CheckDegenerated(num: number, dgnr1: gp_Pnt2d, dgnr2: gp_Pnt2d): boolean;
  CheckDegenerated(num: number): boolean;

  // ShapeAnalysis_Wire.CheckClosed (method)
  CheckClosed(prec?: number): boolean;

  // ShapeAnalysis_Wire.CheckSelfIntersection (method)
  CheckSelfIntersection(): boolean;

  // ShapeAnalysis_Wire.CheckLacking (method)
  CheckLacking(): boolean;
  CheckLacking(num: number, Tolerance: number, p2d1: gp_Pnt2d, p2d2: gp_Pnt2d): boolean;
  CheckLacking(num: number, Tolerance: number): boolean;

  // ShapeAnalysis_Wire.CheckGaps3d (method)
  CheckGaps3d(): boolean;

  // ShapeAnalysis_Wire.CheckGaps2d (method)
  CheckGaps2d(): boolean;

  // ShapeAnalysis_Wire.CheckCurveGaps (method)
  CheckCurveGaps(): boolean;

  // ShapeAnalysis_Wire.CheckSeam (method)
  CheckSeam(num: number, cf?: number, cl?: number): { returnValue: boolean; C1: Geom2d_Curve; C2: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
  CheckSeam(num: number): boolean;

  // ShapeAnalysis_Wire.CheckGap3d (method)
  CheckGap3d(num?: number): boolean;

  // ShapeAnalysis_Wire.CheckGap2d (method)
  CheckGap2d(num?: number): boolean;

  // ShapeAnalysis_Wire.CheckCurveGap (method)
  CheckCurveGap(num?: number): boolean;

  // ShapeAnalysis_Wire.CheckSelfIntersectingEdge (method)
  CheckSelfIntersectingEdge(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt): boolean;
  CheckSelfIntersectingEdge(num: number): boolean;

  // ShapeAnalysis_Wire.CheckIntersectingEdges (method)
  CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num: number): boolean;
  CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num1: number, num2: number): boolean;

  // ShapeAnalysis_Wire.CheckOuterBound (method)
  CheckOuterBound(APIMake?: boolean): boolean;

  // ShapeAnalysis_Wire.CheckNotchedEdges (method)
  CheckNotchedEdges(num: number, shortNum: number, param: number, Tolerance: number): { returnValue: boolean; shortNum: number; param: number };

  // ShapeAnalysis_Wire.CheckSmallArea (method)
  CheckSmallArea(theWire: TopoDS_Wire): boolean;

  // ShapeAnalysis_Wire.CheckShapeConnect (method)
  CheckShapeConnect(shape: TopoDS_Shape, prec: number): boolean;
  CheckShapeConnect(tailhead: number, tailtail: number, headtail: number, headhead: number, shape: TopoDS_Shape, prec: number): { returnValue: boolean; tailhead: number; tailtail: number; headtail: number; headhead: number };

  // ShapeAnalysis_Wire.CheckLoop (method)
  CheckLoop(aMapLoopVertices: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, aMapVertexEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, aMapSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, aMapSeemEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

  // ShapeAnalysis_Wire.CheckTail (method)
  CheckTail(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theMaxSine: number, theMaxWidth: number, theMaxTolerance: number, theEdge11: TopoDS_Edge, theEdge12: TopoDS_Edge, theEdge21: TopoDS_Edge, theEdge22: TopoDS_Edge): boolean;

  // ShapeAnalysis_Wire.StatusOrder (method)
  StatusOrder(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusConnected (method)
  StatusConnected(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusEdgeCurves (method)
  StatusEdgeCurves(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusDegenerated (method)
  StatusDegenerated(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusClosed (method)
  StatusClosed(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusSmall (method)
  StatusSmall(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusSelfIntersection (method)
  StatusSelfIntersection(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusLacking (method)
  StatusLacking(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusGaps3d (method)
  StatusGaps3d(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusGaps2d (method)
  StatusGaps2d(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusCurveGaps (method)
  StatusCurveGaps(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.StatusLoop (method)
  StatusLoop(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.LastCheckStatus (method)
  LastCheckStatus(Status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Wire.MinDistance3d (method)
  MinDistance3d(): number;

  // ShapeAnalysis_Wire.MinDistance2d (method)
  MinDistance2d(): number;

  // ShapeAnalysis_Wire.MaxDistance3d (method)
  MaxDistance3d(): number;

  // ShapeAnalysis_Wire.MaxDistance2d (method)
  MaxDistance2d(): number;

  // ShapeAnalysis_Wire.get_type_name (method)
  static get_type_name(): string;

  // ShapeAnalysis_Wire.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeAnalysis_Wire.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeAnalysis_Wire.delete (method)
  delete(): void;

  // ShapeAnalysis_Wire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_WireOrder: declare class ShapeAnalysis_WireOrder

  // ShapeAnalysis_WireOrder.constructor (constructor)
  constructor();
  constructor(theMode3D: boolean, theTolerance: number, theModeBoth?: boolean);

  // ShapeAnalysis_WireOrder.SetMode (method)
  SetMode(theMode3D: boolean, theTolerance: number, theModeBoth?: boolean): void;

  // ShapeAnalysis_WireOrder.Tolerance (method)
  Tolerance(): number;

  // ShapeAnalysis_WireOrder.Clear (method)
  Clear(): void;

  // ShapeAnalysis_WireOrder.Add (method)
  Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ): void;
  Add(theStart2d: gp_XY, theEnd2d: gp_XY): void;
  Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ, theStart2d: gp_XY, theEnd2d: gp_XY): void;

  // ShapeAnalysis_WireOrder.NbEdges (method)
  NbEdges(): number;

  // ShapeAnalysis_WireOrder.KeepLoopsMode (method)
  KeepLoopsMode(): boolean;

  // ShapeAnalysis_WireOrder.Perform (method)
  Perform(closed?: boolean): void;

  // ShapeAnalysis_WireOrder.IsDone (method)
  IsDone(): boolean;

  // ShapeAnalysis_WireOrder.Status (method)
  Status(): number;

  // ShapeAnalysis_WireOrder.Ordered (method)
  Ordered(theIdx: number): number;

  // ShapeAnalysis_WireOrder.XYZ (method)
  XYZ(theIdx: number, theStart3D: gp_XYZ, theEnd3D: gp_XYZ): void;

  // ShapeAnalysis_WireOrder.XY (method)
  XY(theIdx: number, theStart2D: gp_XY, theEnd2D: gp_XY): void;

  // ShapeAnalysis_WireOrder.Gap (method)
  Gap(num?: number): number;

  // ShapeAnalysis_WireOrder.SetChains (method)
  SetChains(gap: number): void;

  // ShapeAnalysis_WireOrder.NbChains (method)
  NbChains(): number;

  // ShapeAnalysis_WireOrder.Chain (method)
  Chain(num: number, n1?: number, n2?: number): { n1: number; n2: number };

  // ShapeAnalysis_WireOrder.SetCouples (method)
  SetCouples(gap: number): void;

  // ShapeAnalysis_WireOrder.NbCouples (method)
  NbCouples(): number;

  // ShapeAnalysis_WireOrder.Couple (method)
  Couple(num: number, n1?: number, n2?: number): { n1: number; n2: number };

  // ShapeAnalysis_WireOrder.delete (method)
  delete(): void;

  // ShapeAnalysis_WireOrder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_WireVertex: declare class ShapeAnalysis_WireVertex

  // ShapeAnalysis_WireVertex.constructor (constructor)
  constructor();

  // ShapeAnalysis_WireVertex.Init (method)
  Init(wire: TopoDS_Wire, preci: number): void;
  Init(swbd: ShapeExtend_WireData, preci: number): void;

  // ShapeAnalysis_WireVertex.Load (method)
  Load(wire: TopoDS_Wire): void;
  Load(sbwd: ShapeExtend_WireData): void;

  // ShapeAnalysis_WireVertex.SetPrecision (method)
  SetPrecision(preci: number): void;

  // ShapeAnalysis_WireVertex.Analyze (method)
  Analyze(): void;

  // ShapeAnalysis_WireVertex.SetSameVertex (method)
  SetSameVertex(num: number): void;

  // ShapeAnalysis_WireVertex.SetSameCoords (method)
  SetSameCoords(num: number): void;

  // ShapeAnalysis_WireVertex.SetClose (method)
  SetClose(num: number): void;

  // ShapeAnalysis_WireVertex.SetEnd (method)
  SetEnd(num: number, pos: gp_XYZ, ufol: number): void;

  // ShapeAnalysis_WireVertex.SetStart (method)
  SetStart(num: number, pos: gp_XYZ, upre: number): void;

  // ShapeAnalysis_WireVertex.SetInters (method)
  SetInters(num: number, pos: gp_XYZ, upre: number, ufol: number): void;

  // ShapeAnalysis_WireVertex.SetDisjoined (method)
  SetDisjoined(num: number): void;

  // ShapeAnalysis_WireVertex.IsDone (method)
  IsDone(): boolean;

  // ShapeAnalysis_WireVertex.Precision (method)
  Precision(): number;

  // ShapeAnalysis_WireVertex.NbEdges (method)
  NbEdges(): number;

  // ShapeAnalysis_WireVertex.WireData (method)
  WireData(): ShapeExtend_WireData;

  // ShapeAnalysis_WireVertex.Status (method)
  Status(num: number): number;

  // ShapeAnalysis_WireVertex.Position (method)
  Position(num: number): gp_XYZ;

  // ShapeAnalysis_WireVertex.UPrevious (method)
  UPrevious(num: number): number;

  // ShapeAnalysis_WireVertex.UFollowing (method)
  UFollowing(num: number): number;

  // ShapeAnalysis_WireVertex.Data (method)
  Data(num: number, pos: gp_XYZ, upre?: number, ufol?: number): { returnValue: number; upre: number; ufol: number };

  // ShapeAnalysis_WireVertex.NextStatus (method)
  NextStatus(stat: number, num?: number): number;

  // ShapeAnalysis_WireVertex.NextCriter (method)
  NextCriter(crit: number, num?: number): number;

  // ShapeAnalysis_WireVertex.delete (method)
  delete(): void;

  // ShapeAnalysis_WireVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_DataMapOfShapeListOfReal: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher

ShapeAnalysis_HSequenceOfFreeBounds: NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData

ShapeAnalysis_SequenceOfFreeBounds: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData
