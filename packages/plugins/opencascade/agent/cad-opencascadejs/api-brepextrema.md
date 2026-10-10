# libcascade — BRepExtrema

20 top-level symbols. Signatures are verbatim typescript.

BRepExtrema_DistShapeShape: declare class BRepExtrema_DistShapeShape

  // BRepExtrema_DistShapeShape.constructor (constructor)
  constructor();
  constructor(Shape1: TopoDS_Shape, Shape2: TopoDS_Shape, F?: Extrema_ExtFlag, A?: Extrema_ExtAlgo, theRange?: Message_ProgressRange);
  constructor(Shape1: TopoDS_Shape, Shape2: TopoDS_Shape, theDeflection: number, F?: Extrema_ExtFlag, A?: Extrema_ExtAlgo, theRange?: Message_ProgressRange);

  // BRepExtrema_DistShapeShape.SetDeflection (method)
  SetDeflection(theDeflection: number): void;

  // BRepExtrema_DistShapeShape.LoadS1 (method)
  LoadS1(Shape1: TopoDS_Shape): void;

  // BRepExtrema_DistShapeShape.LoadS2 (method)
  LoadS2(Shape1: TopoDS_Shape): void;

  // BRepExtrema_DistShapeShape.Perform (method)
  Perform(theRange?: Message_ProgressRange): boolean;

  // BRepExtrema_DistShapeShape.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_DistShapeShape.NbSolution (method)
  NbSolution(): number;

  // BRepExtrema_DistShapeShape.Value (method)
  Value(): number;

  // BRepExtrema_DistShapeShape.InnerSolution (method)
  InnerSolution(): boolean;

  // BRepExtrema_DistShapeShape.PointOnShape1 (method)
  PointOnShape1(N: number): gp_Pnt;

  // BRepExtrema_DistShapeShape.PointOnShape2 (method)
  PointOnShape2(N: number): gp_Pnt;

  // BRepExtrema_DistShapeShape.SupportTypeShape1 (method)
  SupportTypeShape1(N: number): BRepExtrema_SupportType;

  // BRepExtrema_DistShapeShape.SupportTypeShape2 (method)
  SupportTypeShape2(N: number): BRepExtrema_SupportType;

  // BRepExtrema_DistShapeShape.SupportOnShape1 (method)
  SupportOnShape1(N: number): TopoDS_Shape;

  // BRepExtrema_DistShapeShape.SupportOnShape2 (method)
  SupportOnShape2(N: number): TopoDS_Shape;

  // BRepExtrema_DistShapeShape.ParOnEdgeS1 (method)
  ParOnEdgeS1(N: number, t?: number): { t: number };

  // BRepExtrema_DistShapeShape.ParOnEdgeS2 (method)
  ParOnEdgeS2(N: number, t?: number): { t: number };

  // BRepExtrema_DistShapeShape.ParOnFaceS1 (method)
  ParOnFaceS1(N: number, u?: number, v?: number): { u: number; v: number };

  // BRepExtrema_DistShapeShape.ParOnFaceS2 (method)
  ParOnFaceS2(N: number, u?: number, v?: number): { u: number; v: number };

  // BRepExtrema_DistShapeShape.SetFlag (method)
  SetFlag(F: Extrema_ExtFlag): void;

  // BRepExtrema_DistShapeShape.SetAlgo (method)
  SetAlgo(A: Extrema_ExtAlgo): void;

  // BRepExtrema_DistShapeShape.SetMultiThread (method)
  SetMultiThread(theIsMultiThread: boolean): void;

  // BRepExtrema_DistShapeShape.IsMultiThread (method)
  IsMultiThread(): boolean;

  // BRepExtrema_DistShapeShape.delete (method)
  delete(): void;

  // BRepExtrema_DistShapeShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_DistanceSS: declare class BRepExtrema_DistanceSS

  // BRepExtrema_DistanceSS.constructor (constructor)
  constructor(theS1: TopoDS_Shape, theS2: TopoDS_Shape, theBox1: Bnd_Box, theBox2: Bnd_Box, theDstRef: number, theDeflection?: number, theExtFlag?: Extrema_ExtFlag, theExtAlgo?: Extrema_ExtAlgo);

  // BRepExtrema_DistanceSS.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_DistanceSS.DistValue (method)
  DistValue(): number;

  // BRepExtrema_DistanceSS.Seq1Value (method)
  Seq1Value(): NCollection_Sequence_BRepExtrema_SolutionElem;

  // BRepExtrema_DistanceSS.Seq2Value (method)
  Seq2Value(): NCollection_Sequence_BRepExtrema_SolutionElem;

  // BRepExtrema_DistanceSS.delete (method)
  delete(): void;

  // BRepExtrema_DistanceSS.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_ElementFilter: declare class BRepExtrema_ElementFilter

  // BRepExtrema_ElementFilter.constructor (constructor)
  constructor();

  // BRepExtrema_ElementFilter.PreCheckElements (method)
  PreCheckElements(argNo0: number, argNo1: number): BRepExtrema_ElementFilter_FilterResult;

  // BRepExtrema_ElementFilter.delete (method)
  delete(): void;

  // BRepExtrema_ElementFilter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_ElementFilter_FilterResult: typeof BRepExtrema_ElementFilter_FilterResult[keyof typeof BRepExtrema_ElementFilter_FilterResult]

  readonly NoCheck: 'NoCheck'

  readonly Overlap: 'Overlap'

  readonly DoCheck: 'DoCheck'

BRepExtrema_ExtCC: declare class BRepExtrema_ExtCC

  // BRepExtrema_ExtCC.constructor (constructor)
  constructor();
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge);

  // BRepExtrema_ExtCC.Initialize (method)
  Initialize(E2: TopoDS_Edge): void;

  // BRepExtrema_ExtCC.Perform (method)
  Perform(E1: TopoDS_Edge): void;

  // BRepExtrema_ExtCC.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_ExtCC.NbExt (method)
  NbExt(): number;

  // BRepExtrema_ExtCC.IsParallel (method)
  IsParallel(): boolean;

  // BRepExtrema_ExtCC.SquareDistance (method)
  SquareDistance(N: number): number;

  // BRepExtrema_ExtCC.ParameterOnE1 (method)
  ParameterOnE1(N: number): number;

  // BRepExtrema_ExtCC.PointOnE1 (method)
  PointOnE1(N: number): gp_Pnt;

  // BRepExtrema_ExtCC.ParameterOnE2 (method)
  ParameterOnE2(N: number): number;

  // BRepExtrema_ExtCC.PointOnE2 (method)
  PointOnE2(N: number): gp_Pnt;

  // BRepExtrema_ExtCC.TrimmedSquareDistances (method)
  TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt, P12: gp_Pnt, P21: gp_Pnt, P22: gp_Pnt): { dist11: number; distP12: number; distP21: number; distP22: number };

  // BRepExtrema_ExtCC.delete (method)
  delete(): void;

  // BRepExtrema_ExtCC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_ExtCF: declare class BRepExtrema_ExtCF

  // BRepExtrema_ExtCF.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge, F: TopoDS_Face);

  // BRepExtrema_ExtCF.Initialize (method)
  Initialize(E: TopoDS_Edge, F: TopoDS_Face): void;

  // BRepExtrema_ExtCF.Perform (method)
  Perform(E: TopoDS_Edge, F: TopoDS_Face): void;

  // BRepExtrema_ExtCF.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_ExtCF.NbExt (method)
  NbExt(): number;

  // BRepExtrema_ExtCF.SquareDistance (method)
  SquareDistance(N: number): number;

  // BRepExtrema_ExtCF.IsParallel (method)
  IsParallel(): boolean;

  // BRepExtrema_ExtCF.ParameterOnEdge (method)
  ParameterOnEdge(N: number): number;

  // BRepExtrema_ExtCF.ParameterOnFace (method)
  ParameterOnFace(N: number, U?: number, V?: number): { U: number; V: number };

  // BRepExtrema_ExtCF.PointOnEdge (method)
  PointOnEdge(N: number): gp_Pnt;

  // BRepExtrema_ExtCF.PointOnFace (method)
  PointOnFace(N: number): gp_Pnt;

  // BRepExtrema_ExtCF.delete (method)
  delete(): void;

  // BRepExtrema_ExtCF.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_ExtFF: declare class BRepExtrema_ExtFF

  // BRepExtrema_ExtFF.constructor (constructor)
  constructor();
  constructor(F1: TopoDS_Face, F2: TopoDS_Face);

  // BRepExtrema_ExtFF.Initialize (method)
  Initialize(F2: TopoDS_Face): void;

  // BRepExtrema_ExtFF.Perform (method)
  Perform(F1: TopoDS_Face, F2: TopoDS_Face): void;

  // BRepExtrema_ExtFF.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_ExtFF.IsParallel (method)
  IsParallel(): boolean;

  // BRepExtrema_ExtFF.NbExt (method)
  NbExt(): number;

  // BRepExtrema_ExtFF.SquareDistance (method)
  SquareDistance(N: number): number;

  // BRepExtrema_ExtFF.ParameterOnFace1 (method)
  ParameterOnFace1(N: number, U?: number, V?: number): { U: number; V: number };

  // BRepExtrema_ExtFF.ParameterOnFace2 (method)
  ParameterOnFace2(N: number, U?: number, V?: number): { U: number; V: number };

  // BRepExtrema_ExtFF.PointOnFace1 (method)
  PointOnFace1(N: number): gp_Pnt;

  // BRepExtrema_ExtFF.PointOnFace2 (method)
  PointOnFace2(N: number): gp_Pnt;

  // BRepExtrema_ExtFF.delete (method)
  delete(): void;

  // BRepExtrema_ExtFF.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_ExtPC: declare class BRepExtrema_ExtPC

  // BRepExtrema_ExtPC.constructor (constructor)
  constructor();
  constructor(V: TopoDS_Vertex, E: TopoDS_Edge);

  // BRepExtrema_ExtPC.Initialize (method)
  Initialize(E: TopoDS_Edge): void;

  // BRepExtrema_ExtPC.Perform (method)
  Perform(V: TopoDS_Vertex): void;

  // BRepExtrema_ExtPC.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_ExtPC.NbExt (method)
  NbExt(): number;

  // BRepExtrema_ExtPC.IsMin (method)
  IsMin(N: number): boolean;

  // BRepExtrema_ExtPC.SquareDistance (method)
  SquareDistance(N: number): number;

  // BRepExtrema_ExtPC.Parameter (method)
  Parameter(N: number): number;

  // BRepExtrema_ExtPC.Point (method)
  Point(N: number): gp_Pnt;

  // BRepExtrema_ExtPC.TrimmedSquareDistances (method)
  TrimmedSquareDistances(dist1: number, dist2: number, pnt1: gp_Pnt, pnt2: gp_Pnt): { dist1: number; dist2: number };

  // BRepExtrema_ExtPC.delete (method)
  delete(): void;

  // BRepExtrema_ExtPC.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_ExtPF: declare class BRepExtrema_ExtPF

  // BRepExtrema_ExtPF.constructor (constructor)
  constructor();
  constructor(TheVertex: TopoDS_Vertex, TheFace: TopoDS_Face, TheFlag?: Extrema_ExtFlag, TheAlgo?: Extrema_ExtAlgo);

  // BRepExtrema_ExtPF.Initialize (method)
  Initialize(TheFace: TopoDS_Face, TheFlag?: Extrema_ExtFlag, TheAlgo?: Extrema_ExtAlgo): void;

  // BRepExtrema_ExtPF.Perform (method)
  Perform(TheVertex: TopoDS_Vertex, TheFace: TopoDS_Face): void;

  // BRepExtrema_ExtPF.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_ExtPF.NbExt (method)
  NbExt(): number;

  // BRepExtrema_ExtPF.SquareDistance (method)
  SquareDistance(N: number): number;

  // BRepExtrema_ExtPF.Parameter (method)
  Parameter(N: number, U?: number, V?: number): { U: number; V: number };

  // BRepExtrema_ExtPF.Point (method)
  Point(N: number): gp_Pnt;

  // BRepExtrema_ExtPF.SetFlag (method)
  SetFlag(F: Extrema_ExtFlag): void;

  // BRepExtrema_ExtPF.SetAlgo (method)
  SetAlgo(A: Extrema_ExtAlgo): void;

  // BRepExtrema_ExtPF.delete (method)
  delete(): void;

  // BRepExtrema_ExtPF.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_OverlapTool: declare class BRepExtrema_OverlapTool

  // BRepExtrema_OverlapTool.constructor (constructor)
  constructor();
  constructor(theSet1: BRepExtrema_TriangleSet, theSet2: BRepExtrema_TriangleSet);

  // BRepExtrema_OverlapTool.LoadTriangleSets (method)
  LoadTriangleSets(theSet1: BRepExtrema_TriangleSet, theSet2: BRepExtrema_TriangleSet): void;

  // BRepExtrema_OverlapTool.Perform (method)
  Perform(theTolerance?: number): void;

  // BRepExtrema_OverlapTool.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_OverlapTool.MarkDirty (method)
  MarkDirty(): void;

  // BRepExtrema_OverlapTool.OverlapSubShapes1 (method)
  OverlapSubShapes1(): unknown;

  // BRepExtrema_OverlapTool.OverlapSubShapes2 (method)
  OverlapSubShapes2(): unknown;

  // BRepExtrema_OverlapTool.SetElementFilter (method)
  SetElementFilter(theFilter: BRepExtrema_ElementFilter): void;

  // BRepExtrema_OverlapTool.Accept (method)
  Accept(theLeaf1: number, theLeaf2: number): boolean;

  // BRepExtrema_OverlapTool.delete (method)
  delete(): void;

  // BRepExtrema_OverlapTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_Poly: declare class BRepExtrema_Poly

  // BRepExtrema_Poly.constructor (constructor)
  constructor();

  // BRepExtrema_Poly.Distance (method)
  static Distance(S1: TopoDS_Shape, S2: TopoDS_Shape, P1: gp_Pnt, P2: gp_Pnt, dist?: number): { returnValue: boolean; dist: number };

  // BRepExtrema_Poly.delete (method)
  delete(): void;

  // BRepExtrema_Poly.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_ProximityDistTool_PrjState: declare class BRepExtrema_ProximityDistTool_PrjState

  // BRepExtrema_ProximityDistTool_PrjState.constructor (constructor)
  constructor();
  constructor(theTrgIdx: number, thePrjState: unknown, theNumberOfFirstNode: number, theNumberOfLastNode: number);

  // BRepExtrema_ProximityDistTool_PrjState.GetTrgIdx (method)
  GetTrgIdx(): number;

  // BRepExtrema_ProximityDistTool_PrjState.GetPrjState (method)
  GetPrjState(): unknown;

  // BRepExtrema_ProximityDistTool_PrjState.GetNumberOfFirstNode (method)
  GetNumberOfFirstNode(): number;

  // BRepExtrema_ProximityDistTool_PrjState.GetNumberOfLastNode (method)
  GetNumberOfLastNode(): number;

  // BRepExtrema_ProximityDistTool_PrjState.delete (method)
  delete(): void;

  // BRepExtrema_ProximityDistTool_PrjState.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_VertexInspector: declare class BRepExtrema_VertexInspector

  // BRepExtrema_VertexInspector.constructor (constructor)
  constructor();

  // BRepExtrema_VertexInspector.Coord (method)
  static Coord(i: number, thePnt: gp_XYZ): number;

  // BRepExtrema_VertexInspector.Shift (method)
  static Shift(thePnt: gp_XYZ, theTol: number): gp_XYZ;

  // BRepExtrema_VertexInspector.Add (method)
  Add(thePnt: gp_XYZ): void;

  // BRepExtrema_VertexInspector.SetTol (method)
  SetTol(theTol: number): void;

  // BRepExtrema_VertexInspector.SetCurrent (method)
  SetCurrent(theCurPnt: gp_XYZ): void;

  // BRepExtrema_VertexInspector.IsNeedAdd (method)
  IsNeedAdd(): boolean;

  // BRepExtrema_VertexInspector.Inspect (method)
  Inspect(theTarget: number): NCollection_CellFilter_Action;

  // BRepExtrema_VertexInspector.delete (method)
  delete(): void;

  // BRepExtrema_VertexInspector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_SelfIntersection: declare class BRepExtrema_SelfIntersection extends BRepExtrema_ElementFilter

  // BRepExtrema_SelfIntersection.constructor (constructor)
  constructor(theTolerance?: number);
  constructor(theShape: TopoDS_Shape, theTolerance?: number);

  // BRepExtrema_SelfIntersection.Tolerance (method)
  Tolerance(): number;

  // BRepExtrema_SelfIntersection.SetTolerance (method)
  SetTolerance(theTolerance: number): void;

  // BRepExtrema_SelfIntersection.LoadShape (method)
  LoadShape(theShape: TopoDS_Shape): boolean;

  // BRepExtrema_SelfIntersection.Perform (method)
  Perform(): void;

  // BRepExtrema_SelfIntersection.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_SelfIntersection.OverlapElements (method)
  OverlapElements(): unknown;

  // BRepExtrema_SelfIntersection.GetSubShape (method)
  GetSubShape(theID: number): TopoDS_Face;

  // BRepExtrema_SelfIntersection.ElementSet (method)
  ElementSet(): BRepExtrema_TriangleSet;

  // BRepExtrema_SelfIntersection.delete (method)
  delete(): void;

  // BRepExtrema_SelfIntersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_ShapeProximity: declare class BRepExtrema_ShapeProximity

  // BRepExtrema_ShapeProximity.constructor (constructor)
  constructor(theTolerance?: number);
  constructor(theShape1: TopoDS_Shape, theShape2: TopoDS_Shape, theTolerance?: number);

  // BRepExtrema_ShapeProximity.Tolerance (method)
  Tolerance(): number;

  // BRepExtrema_ShapeProximity.SetTolerance (method)
  SetTolerance(theTolerance: number): void;

  // BRepExtrema_ShapeProximity.Proximity (method)
  Proximity(): number;

  // BRepExtrema_ShapeProximity.LoadShape1 (method)
  LoadShape1(theShape1: TopoDS_Shape): boolean;

  // BRepExtrema_ShapeProximity.LoadShape2 (method)
  LoadShape2(theShape2: TopoDS_Shape): boolean;

  // BRepExtrema_ShapeProximity.SetNbSamples1 (method)
  SetNbSamples1(theNbSamples: number): void;

  // BRepExtrema_ShapeProximity.SetNbSamples2 (method)
  SetNbSamples2(theNbSamples: number): void;

  // BRepExtrema_ShapeProximity.Perform (method)
  Perform(): void;

  // BRepExtrema_ShapeProximity.IsDone (method)
  IsDone(): boolean;

  // BRepExtrema_ShapeProximity.OverlapSubShapes1 (method)
  OverlapSubShapes1(): unknown;

  // BRepExtrema_ShapeProximity.OverlapSubShapes2 (method)
  OverlapSubShapes2(): unknown;

  // BRepExtrema_ShapeProximity.GetSubShape1 (method)
  GetSubShape1(theID: number): TopoDS_Shape;

  // BRepExtrema_ShapeProximity.GetSubShape2 (method)
  GetSubShape2(theID: number): TopoDS_Shape;

  // BRepExtrema_ShapeProximity.ElementSet1 (method)
  ElementSet1(): BRepExtrema_TriangleSet;

  // BRepExtrema_ShapeProximity.ElementSet2 (method)
  ElementSet2(): BRepExtrema_TriangleSet;

  // BRepExtrema_ShapeProximity.ProximityPoint1 (method)
  ProximityPoint1(): gp_Pnt;

  // BRepExtrema_ShapeProximity.ProximityPoint2 (method)
  ProximityPoint2(): gp_Pnt;

  // BRepExtrema_ShapeProximity.ProxPntStatus1 (method)
  ProxPntStatus1(): unknown;

  // BRepExtrema_ShapeProximity.ProxPntStatus2 (method)
  ProxPntStatus2(): unknown;

  // BRepExtrema_ShapeProximity.delete (method)
  delete(): void;

  // BRepExtrema_ShapeProximity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_SolutionElem: declare class BRepExtrema_SolutionElem

  // BRepExtrema_SolutionElem.constructor (constructor)
  constructor();
  constructor(theDist: number, thePoint: gp_Pnt, theSolType: BRepExtrema_SupportType, theVertex: TopoDS_Vertex);
  constructor(theDist: number, thePoint: gp_Pnt, theSolType: BRepExtrema_SupportType, theEdge: TopoDS_Edge, theParam: number);
  constructor(theDist: number, thePoint: gp_Pnt, theSolType: BRepExtrema_SupportType, theFace: TopoDS_Face, theU: number, theV: number);

  // BRepExtrema_SolutionElem.Dist (method)
  Dist(): number;

  // BRepExtrema_SolutionElem.Point (method)
  Point(): gp_Pnt;

  // BRepExtrema_SolutionElem.SupportKind (method)
  SupportKind(): BRepExtrema_SupportType;

  // BRepExtrema_SolutionElem.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // BRepExtrema_SolutionElem.Edge (method)
  Edge(): TopoDS_Edge;

  // BRepExtrema_SolutionElem.Face (method)
  Face(): TopoDS_Face;

  // BRepExtrema_SolutionElem.EdgeParameter (method)
  EdgeParameter(theParam?: number): { theParam: number };

  // BRepExtrema_SolutionElem.FaceParameter (method)
  FaceParameter(theU?: number, theV?: number): { theU: number; theV: number };

  // BRepExtrema_SolutionElem.delete (method)
  delete(): void;

  // BRepExtrema_SolutionElem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_SupportType: typeof BRepExtrema_SupportType[keyof typeof BRepExtrema_SupportType]

  readonly BRepExtrema_IsVertex: 'BRepExtrema_IsVertex'

  readonly BRepExtrema_IsOnEdge: 'BRepExtrema_IsOnEdge'

  readonly BRepExtrema_IsInFace: 'BRepExtrema_IsInFace'

BRepExtrema_TriangleSet: declare class BRepExtrema_TriangleSet

  // BRepExtrema_TriangleSet.constructor (constructor)
  constructor();
  constructor(theFaces: NCollection_DynamicArray_TopoDS_Shape);

  // BRepExtrema_TriangleSet.Size (method)
  Size(): number;

  // BRepExtrema_TriangleSet.Box (method)
  Box(theIndex: number): any;

  // BRepExtrema_TriangleSet.Center (method)
  Center(theIndex: number, theAxis: number): number;

  // BRepExtrema_TriangleSet.Swap (method)
  Swap(theIndex1: number, theIndex2: number): void;

  // BRepExtrema_TriangleSet.Clear (method)
  Clear(): void;

  // BRepExtrema_TriangleSet.Init (method)
  Init(theShapes: NCollection_DynamicArray_TopoDS_Shape): boolean;

  // BRepExtrema_TriangleSet.GetVertices (method)
  GetVertices(): [number, number, number][];

  // BRepExtrema_TriangleSet.GetVtxIndices (method)
  GetVtxIndices(theIndex: number, theVtxIndices: NCollection_Array1_int): void;

  // BRepExtrema_TriangleSet.GetFaceID (method)
  GetFaceID(theIndex: number): number;

  // BRepExtrema_TriangleSet.GetShapeIDOfVtx (method)
  GetShapeIDOfVtx(theIndex: number): number;

  // BRepExtrema_TriangleSet.GetVtxIdxInShape (method)
  GetVtxIdxInShape(theIndex: number): number;

  // BRepExtrema_TriangleSet.GetTrgIdxInShape (method)
  GetTrgIdxInShape(theIndex: number): number;

  // BRepExtrema_TriangleSet.get_type_name (method)
  static get_type_name(): string;

  // BRepExtrema_TriangleSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepExtrema_TriangleSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepExtrema_TriangleSet.delete (method)
  delete(): void;

  // BRepExtrema_TriangleSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_UnCompatibleShape: declare class BRepExtrema_UnCompatibleShape extends Standard_DomainError

  // BRepExtrema_UnCompatibleShape.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // BRepExtrema_UnCompatibleShape.ExceptionType (method)
  ExceptionType(): string;

  // BRepExtrema_UnCompatibleShape.delete (method)
  delete(): void;

  // BRepExtrema_UnCompatibleShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepExtrema_SeqOfSolution: NCollection_Sequence_BRepExtrema_SolutionElem
