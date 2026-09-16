# libcascade — ShapeAnalysis (2)

7 top-level symbols. Signatures are verbatim typescript.

ShapeAnalysis_TransferParametersProj: declare class ShapeAnalysis_TransferParametersProj extends ShapeAnalysis_TransferParameters

  constructor

  Init(E: TopoDS_Edge, F: TopoDS_Face): void;

  Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
  Perform(Param: number, To2d: boolean): number;
  Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
  Perform(Param: number, To2d: boolean): number;

  ForceProjection(): boolean;

  TransferRange(newEdge: TopoDS_Edge, prevPar: number, currPar: number, To2d: boolean): void;

  IsSameRange(): boolean;

  static CopyNMVertex(theVert: TopoDS_Vertex, toedge: TopoDS_Edge, fromedge: TopoDS_Edge): TopoDS_Vertex;
  static CopyNMVertex(theVert: TopoDS_Vertex, toFace: TopoDS_Face, fromFace: TopoDS_Face): TopoDS_Vertex;
  static CopyNMVertex(theVert: TopoDS_Vertex, toedge: TopoDS_Edge, fromedge: TopoDS_Edge): TopoDS_Vertex;
  static CopyNMVertex(theVert: TopoDS_Vertex, toFace: TopoDS_Face, fromFace: TopoDS_Face): TopoDS_Vertex;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeAnalysis_Wire: declare class ShapeAnalysis_Wire extends Standard_Transient

  constructor

  Init(wire: TopoDS_Wire, face: TopoDS_Face, precision: number): void;
  Init(sbwd: ShapeExtend_WireData, face: TopoDS_Face, precision: number): void;
  Init(wire: TopoDS_Wire, face: TopoDS_Face, precision: number): void;
  Init(sbwd: ShapeExtend_WireData, face: TopoDS_Face, precision: number): void;

  Load(wire: TopoDS_Wire): void;
  Load(sbwd: ShapeExtend_WireData): void;
  Load(wire: TopoDS_Wire): void;
  Load(sbwd: ShapeExtend_WireData): void;

  SetFace(face: TopoDS_Face): void;
  SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;
  SetFace(face: TopoDS_Face): void;
  SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;

  SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
  SetSurface(surface: Geom_Surface): void;
  SetSurface(surface: Geom_Surface, location: TopLoc_Location): void;
  SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
  SetSurface(surface: Geom_Surface): void;
  SetSurface(surface: Geom_Surface, location: TopLoc_Location): void;
  SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
  SetSurface(surface: Geom_Surface): void;
  SetSurface(surface: Geom_Surface, location: TopLoc_Location): void;

  SetPrecision(precision: number): void;

  ClearStatuses(): void;

  IsLoaded(): boolean;

  IsReady(): boolean;

  Precision(): number;

  WireData(): ShapeExtend_WireData;

  NbEdges(): number;

  Face(): TopoDS_Face;

  Surface(): ShapeAnalysis_Surface;

  Perform(): boolean;

  CheckOrder(isClosed: boolean, mode3d: boolean): boolean;
  CheckOrder(sawo: ShapeAnalysis_WireOrder, isClosed: boolean, theMode3D: boolean, theModeBoth: boolean): boolean;
  CheckOrder(isClosed: boolean, mode3d: boolean): boolean;
  CheckOrder(sawo: ShapeAnalysis_WireOrder, isClosed: boolean, theMode3D: boolean, theModeBoth: boolean): boolean;

  CheckConnected(prec: number): boolean;
  CheckConnected(num: number, prec: number): boolean;
  CheckConnected(prec: number): boolean;
  CheckConnected(num: number, prec: number): boolean;

  CheckSmall(precsmall: number): boolean;
  CheckSmall(num: number, precsmall: number): boolean;
  CheckSmall(precsmall: number): boolean;
  CheckSmall(num: number, precsmall: number): boolean;

  CheckEdgeCurves(): boolean;

  CheckDegenerated(): boolean;
  CheckDegenerated(num: number, dgnr1: gp_Pnt2d, dgnr2: gp_Pnt2d): boolean;
  CheckDegenerated(num: number): boolean;
  CheckDegenerated(): boolean;
  CheckDegenerated(num: number, dgnr1: gp_Pnt2d, dgnr2: gp_Pnt2d): boolean;
  CheckDegenerated(num: number): boolean;
  CheckDegenerated(): boolean;
  CheckDegenerated(num: number, dgnr1: gp_Pnt2d, dgnr2: gp_Pnt2d): boolean;
  CheckDegenerated(num: number): boolean;

  CheckClosed(prec?: number): boolean;

  CheckSelfIntersection(): boolean;

  CheckLacking(): boolean;
  CheckLacking(num: number, Tolerance: number, p2d1: gp_Pnt2d, p2d2: gp_Pnt2d): boolean;
  CheckLacking(num: number, Tolerance: number): boolean;
  CheckLacking(): boolean;
  CheckLacking(num: number, Tolerance: number, p2d1: gp_Pnt2d, p2d2: gp_Pnt2d): boolean;
  CheckLacking(num: number, Tolerance: number): boolean;
  CheckLacking(): boolean;
  CheckLacking(num: number, Tolerance: number, p2d1: gp_Pnt2d, p2d2: gp_Pnt2d): boolean;
  CheckLacking(num: number, Tolerance: number): boolean;

  CheckGaps3d(): boolean;

  CheckGaps2d(): boolean;

  CheckCurveGaps(): boolean;

  CheckSeam(num: number, cf?: number, cl?: number): { returnValue: boolean; C1: Geom2d_Curve; C2: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
  CheckSeam(num: number): boolean;
  CheckSeam(num: number, cf?: number, cl?: number): { returnValue: boolean; C1: Geom2d_Curve; C2: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
  CheckSeam(num: number): boolean;

  CheckGap3d(num?: number): boolean;

  CheckGap2d(num?: number): boolean;

  CheckCurveGap(num?: number): boolean;

  CheckSelfIntersectingEdge(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt): boolean;
  CheckSelfIntersectingEdge(num: number): boolean;
  CheckSelfIntersectingEdge(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt): boolean;
  CheckSelfIntersectingEdge(num: number): boolean;

  CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num: number): boolean;
  CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num1: number, num2: number): boolean;
  CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num: number): boolean;
  CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num1: number, num2: number): boolean;
  CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num: number): boolean;
  CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num1: number, num2: number): boolean;
  CheckIntersectingEdges(num: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num: number): boolean;
  CheckIntersectingEdges(num1: number, num2: number, points2d: NCollection_Sequence_IntRes2d_IntersectionPoint, points3d: NCollection_Sequence_gp_Pnt, errors: NCollection_Sequence_double): boolean;
  CheckIntersectingEdges(num1: number, num2: number): boolean;

  CheckOuterBound(APIMake?: boolean): boolean;

  CheckNotchedEdges(num: number, shortNum: number, param: number, Tolerance: number): { returnValue: boolean; shortNum: number; param: number };

  CheckSmallArea(theWire: TopoDS_Wire): boolean;

  CheckShapeConnect(shape: TopoDS_Shape, prec: number): boolean;
  CheckShapeConnect(tailhead: number, tailtail: number, headtail: number, headhead: number, shape: TopoDS_Shape, prec: number): { returnValue: boolean; tailhead: number; tailtail: number; headtail: number; headhead: number };
  CheckShapeConnect(shape: TopoDS_Shape, prec: number): boolean;
  CheckShapeConnect(tailhead: number, tailtail: number, headtail: number, headhead: number, shape: TopoDS_Shape, prec: number): { returnValue: boolean; tailhead: number; tailtail: number; headtail: number; headhead: number };

  CheckLoop(aMapLoopVertices: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, aMapVertexEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, aMapSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, aMapSeemEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

  CheckTail(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theMaxSine: number, theMaxWidth: number, theMaxTolerance: number, theEdge11: TopoDS_Edge, theEdge12: TopoDS_Edge, theEdge21: TopoDS_Edge, theEdge22: TopoDS_Edge): boolean;

  StatusOrder(Status: ShapeExtend_Status): boolean;

  StatusConnected(Status: ShapeExtend_Status): boolean;

  StatusEdgeCurves(Status: ShapeExtend_Status): boolean;

  StatusDegenerated(Status: ShapeExtend_Status): boolean;

  StatusClosed(Status: ShapeExtend_Status): boolean;

  StatusSmall(Status: ShapeExtend_Status): boolean;

  StatusSelfIntersection(Status: ShapeExtend_Status): boolean;

  StatusLacking(Status: ShapeExtend_Status): boolean;

  StatusGaps3d(Status: ShapeExtend_Status): boolean;

  StatusGaps2d(Status: ShapeExtend_Status): boolean;

  StatusCurveGaps(Status: ShapeExtend_Status): boolean;

  StatusLoop(Status: ShapeExtend_Status): boolean;

  LastCheckStatus(Status: ShapeExtend_Status): boolean;

  MinDistance3d(): number;

  MinDistance2d(): number;

  MaxDistance3d(): number;

  MaxDistance2d(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ShapeAnalysis_WireOrder: declare class ShapeAnalysis_WireOrder

  constructor

  SetMode(theMode3D: boolean, theTolerance: number, theModeBoth?: boolean): void;

  Tolerance(): number;

  Clear(): void;

  Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ): void;
  Add(theStart2d: gp_XY, theEnd2d: gp_XY): void;
  Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ, theStart2d: gp_XY, theEnd2d: gp_XY): void;
  Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ): void;
  Add(theStart2d: gp_XY, theEnd2d: gp_XY): void;
  Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ, theStart2d: gp_XY, theEnd2d: gp_XY): void;
  Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ): void;
  Add(theStart2d: gp_XY, theEnd2d: gp_XY): void;
  Add(theStart3d: gp_XYZ, theEnd3d: gp_XYZ, theStart2d: gp_XY, theEnd2d: gp_XY): void;

  NbEdges(): number;

  KeepLoopsMode(): boolean;

  Perform(closed?: boolean): void;

  IsDone(): boolean;

  Status(): number;

  Ordered(theIdx: number): number;

  XYZ(theIdx: number, theStart3D: gp_XYZ, theEnd3D: gp_XYZ): void;

  XY(theIdx: number, theStart2D: gp_XY, theEnd2D: gp_XY): void;

  Gap(num?: number): number;

  SetChains(gap: number): void;

  NbChains(): number;

  Chain(num: number, n1?: number, n2?: number): { n1: number; n2: number };

  SetCouples(gap: number): void;

  NbCouples(): number;

  Couple(num: number, n1?: number, n2?: number): { n1: number; n2: number };

  delete(): void;

  [Symbol.dispose](): void;

ShapeAnalysis_WireVertex: declare class ShapeAnalysis_WireVertex

  constructor

  Init(wire: TopoDS_Wire, preci: number): void;
  Init(swbd: ShapeExtend_WireData, preci: number): void;
  Init(wire: TopoDS_Wire, preci: number): void;
  Init(swbd: ShapeExtend_WireData, preci: number): void;

  Load(wire: TopoDS_Wire): void;
  Load(sbwd: ShapeExtend_WireData): void;
  Load(wire: TopoDS_Wire): void;
  Load(sbwd: ShapeExtend_WireData): void;

  SetPrecision(preci: number): void;

  Analyze(): void;

  SetSameVertex(num: number): void;

  SetSameCoords(num: number): void;

  SetClose(num: number): void;

  SetEnd(num: number, pos: gp_XYZ, ufol: number): void;

  SetStart(num: number, pos: gp_XYZ, upre: number): void;

  SetInters(num: number, pos: gp_XYZ, upre: number, ufol: number): void;

  SetDisjoined(num: number): void;

  IsDone(): boolean;

  Precision(): number;

  NbEdges(): number;

  WireData(): ShapeExtend_WireData;

  Status(num: number): number;

  Position(num: number): gp_XYZ;

  UPrevious(num: number): number;

  UFollowing(num: number): number;

  Data(num: number, pos: gp_XYZ, upre?: number, ufol?: number): { returnValue: number; upre: number; ufol: number };

  NextStatus(stat: number, num?: number): number;

  NextCriter(crit: number, num?: number): number;

  delete(): void;

  [Symbol.dispose](): void;

ShapeAnalysis_DataMapOfShapeListOfReal: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher

ShapeAnalysis_HSequenceOfFreeBounds: NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData

ShapeAnalysis_SequenceOfFreeBounds: NCollection_Sequence_handle_ShapeAnalysis_FreeBoundData
