# libcascade — BRepOffset

13 top-level symbols. Signatures are verbatim typescript.

BRepOffset_Analyse: declare class BRepOffset_Analyse

  // BRepOffset_Analyse.constructor (constructor)
  constructor();
  constructor(theS: TopoDS_Shape, theAngle: number);

  // BRepOffset_Analyse.Perform (method)
  Perform(theS: TopoDS_Shape, theAngle: number, theRange?: Message_ProgressRange): void;

  // BRepOffset_Analyse.IsDone (method)
  IsDone(): boolean;

  // BRepOffset_Analyse.Type (method)
  Type(theE: TopoDS_Edge): NCollection_List_BRepOffset_Interval;

  // BRepOffset_Analyse.Edges (method)
  Edges(theV: TopoDS_Vertex, theType: ChFiDS_TypeOfConcavity, theL: NCollection_List_TopoDS_Shape): void;
  Edges(theF: TopoDS_Face, theType: ChFiDS_TypeOfConcavity, theL: NCollection_List_TopoDS_Shape): void;

  // BRepOffset_Analyse.TangentEdges (method)
  TangentEdges(theEdge: TopoDS_Edge, theVertex: TopoDS_Vertex, theEdges: NCollection_List_TopoDS_Shape): void;

  // BRepOffset_Analyse.HasAncestor (method)
  HasAncestor(theS: TopoDS_Shape): boolean;

  // BRepOffset_Analyse.Ancestors (method)
  Ancestors(theS: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffset_Analyse.Explode (method)
  Explode(theL: NCollection_List_TopoDS_Shape, theType: ChFiDS_TypeOfConcavity): void;
  Explode(theL: NCollection_List_TopoDS_Shape, theType1: ChFiDS_TypeOfConcavity, theType2: ChFiDS_TypeOfConcavity): void;

  // BRepOffset_Analyse.AddFaces (method)
  AddFaces(theFace: TopoDS_Face, theCo: TopoDS_Compound, theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theType: ChFiDS_TypeOfConcavity): void;
  AddFaces(theFace: TopoDS_Face, theCo: TopoDS_Compound, theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theType1: ChFiDS_TypeOfConcavity, theType2: ChFiDS_TypeOfConcavity): void;

  // BRepOffset_Analyse.SetOffsetValue (method)
  SetOffsetValue(theOffset: number): void;

  // BRepOffset_Analyse.SetFaceOffsetMap (method)
  SetFaceOffsetMap(theMap: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher): void;

  // BRepOffset_Analyse.NewFaces (method)
  NewFaces(): NCollection_List_TopoDS_Shape;

  // BRepOffset_Analyse.Generated (method)
  Generated(theS: TopoDS_Shape): TopoDS_Shape;

  // BRepOffset_Analyse.HasGenerated (method)
  HasGenerated(theS: TopoDS_Shape): boolean;

  // BRepOffset_Analyse.EdgeReplacement (method)
  EdgeReplacement(theFace: TopoDS_Face, theEdge: TopoDS_Edge): TopoDS_Edge;

  // BRepOffset_Analyse.Descendants (method)
  Descendants(theS: TopoDS_Shape, theUpdate?: boolean): NCollection_List_TopoDS_Shape;

  // BRepOffset_Analyse.Clear (method)
  Clear(): void;

  // BRepOffset_Analyse.delete (method)
  delete(): void;

  // BRepOffset_Analyse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffset_Error: typeof BRepOffset_Error[keyof typeof BRepOffset_Error]

  readonly BRepOffset_NoError: 'BRepOffset_NoError'

  readonly BRepOffset_UnknownError: 'BRepOffset_UnknownError'

  readonly BRepOffset_BadNormalsOnGeometry: 'BRepOffset_BadNormalsOnGeometry'

  readonly BRepOffset_C0Geometry: 'BRepOffset_C0Geometry'

  readonly BRepOffset_NullOffset: 'BRepOffset_NullOffset'

  readonly BRepOffset_NotConnectedShell: 'BRepOffset_NotConnectedShell'

  readonly BRepOffset_CannotTrimEdges: 'BRepOffset_CannotTrimEdges'

  readonly BRepOffset_CannotFuseVertices: 'BRepOffset_CannotFuseVertices'

  readonly BRepOffset_CannotExtentEdge: 'BRepOffset_CannotExtentEdge'

  readonly BRepOffset_UserBreak: 'BRepOffset_UserBreak'

  readonly BRepOffset_MixedConnectivity: 'BRepOffset_MixedConnectivity'

BRepOffset_Inter2d: declare class BRepOffset_Inter2d

  // BRepOffset_Inter2d.constructor (constructor)
  constructor();

  // BRepOffset_Inter2d.Compute (method)
  static Compute(AsDes: BRepAlgo_AsDes, F: TopoDS_Face, NewEdges: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, Tol: number, theEdgeIntEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): void;

  // BRepOffset_Inter2d.ConnexIntByInt (method)
  static ConnexIntByInt(FI: TopoDS_Face, OFI: BRepOffset_Offset, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theAsDes: BRepAlgo_AsDes, AsDes2d: BRepAlgo_AsDes, Offset: number, Tol: number, Analyse: BRepOffset_Analyse, FacesWithVerts: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theImageVV: BRepAlgo_Image, theEdgeIntEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): boolean;

  // BRepOffset_Inter2d.ConnexIntByIntInVert (method)
  static ConnexIntByIntInVert(FI: TopoDS_Face, OFI: BRepOffset_Offset, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, AsDes: BRepAlgo_AsDes, AsDes2d: BRepAlgo_AsDes, Tol: number, Analyse: BRepOffset_Analyse, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): void;

  // BRepOffset_Inter2d.FuseVertices (method)
  static FuseVertices(theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theAsDes: BRepAlgo_AsDes, theImageVV: BRepAlgo_Image): boolean;

  // BRepOffset_Inter2d.ExtentEdge (method)
  static ExtentEdge(E: TopoDS_Edge, NE: TopoDS_Edge, theOffset: number): boolean;

  // BRepOffset_Inter2d.delete (method)
  delete(): void;

  // BRepOffset_Inter2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffset_Inter3d: declare class BRepOffset_Inter3d

  // BRepOffset_Inter3d.constructor (constructor)
  constructor(AsDes: BRepAlgo_AsDes, Side: TopAbs_State, Tol: number);

  // BRepOffset_Inter3d.CompletInt (method)
  CompletInt(SetOfFaces: NCollection_List_TopoDS_Shape, InitOffsetFace: BRepAlgo_Image, theRange: Message_ProgressRange): void;

  // BRepOffset_Inter3d.FaceInter (method)
  FaceInter(F1: TopoDS_Face, F2: TopoDS_Face, InitOffsetFace: BRepAlgo_Image): void;

  // BRepOffset_Inter3d.ConnexIntByArc (method)
  ConnexIntByArc(SetOfFaces: NCollection_List_TopoDS_Shape, ShapeInit: TopoDS_Shape, Analyse: BRepOffset_Analyse, InitOffsetFace: BRepAlgo_Image, theRange: Message_ProgressRange): void;

  // BRepOffset_Inter3d.ConnexIntByInt (method)
  ConnexIntByInt(SI: TopoDS_Shape, MapSF: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher, A: BRepOffset_Analyse, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Failed: NCollection_List_TopoDS_Shape, theRange: Message_ProgressRange, bIsPlanar: boolean): void;

  // BRepOffset_Inter3d.ContextIntByInt (method)
  ContextIntByInt(ContextFaces: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, ExtentContext: boolean, MapSF: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher, A: BRepOffset_Analyse, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Failed: NCollection_List_TopoDS_Shape, theRange: Message_ProgressRange, bIsPlanar: boolean): void;

  // BRepOffset_Inter3d.ContextIntByArc (method)
  ContextIntByArc(ContextFaces: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, ExtentContext: boolean, Analyse: BRepOffset_Analyse, InitOffsetFace: BRepAlgo_Image, InitOffsetEdge: BRepAlgo_Image, theRange: Message_ProgressRange): void;

  // BRepOffset_Inter3d.SetDone (method)
  SetDone(F1: TopoDS_Face, F2: TopoDS_Face): void;

  // BRepOffset_Inter3d.IsDone (method)
  IsDone(F1: TopoDS_Face, F2: TopoDS_Face): boolean;

  // BRepOffset_Inter3d.TouchedFaces (method)
  TouchedFaces(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

  // BRepOffset_Inter3d.AsDes (method)
  AsDes(): BRepAlgo_AsDes;

  // BRepOffset_Inter3d.NewEdges (method)
  NewEdges(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

  // BRepOffset_Inter3d.delete (method)
  delete(): void;

  // BRepOffset_Inter3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffset_Interval: declare class BRepOffset_Interval

  // BRepOffset_Interval.constructor (constructor)
  constructor();
  constructor(U1: number, U2: number, Type: ChFiDS_TypeOfConcavity);

  // BRepOffset_Interval.First (method)
  First(U: number): void;
  First(): number;

  // BRepOffset_Interval.Last (method)
  Last(U: number): void;
  Last(): number;

  // BRepOffset_Interval.Type (method)
  Type(T: ChFiDS_TypeOfConcavity): void;
  Type(): ChFiDS_TypeOfConcavity;

  // BRepOffset_Interval.delete (method)
  delete(): void;

  // BRepOffset_Interval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffset_MakeLoops: declare class BRepOffset_MakeLoops

  // BRepOffset_MakeLoops.constructor (constructor)
  constructor();

  // BRepOffset_MakeLoops.Build (method)
  Build(LF: NCollection_List_TopoDS_Shape, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, theImageVV: BRepAlgo_Image, theRange: Message_ProgressRange): void;

  // BRepOffset_MakeLoops.BuildOnContext (method)
  BuildOnContext(LContext: NCollection_List_TopoDS_Shape, Analyse: BRepOffset_Analyse, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, InSide: boolean, theRange: Message_ProgressRange): void;

  // BRepOffset_MakeLoops.BuildFaces (method)
  BuildFaces(LF: NCollection_List_TopoDS_Shape, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, theRange: Message_ProgressRange): void;

  // BRepOffset_MakeLoops.delete (method)
  delete(): void;

  // BRepOffset_MakeLoops.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffset_MakeSimpleOffset: declare class BRepOffset_MakeSimpleOffset

  // BRepOffset_MakeSimpleOffset.constructor (constructor)
  constructor();
  constructor(theInputShape: TopoDS_Shape, theOffsetValue: number);

  // BRepOffset_MakeSimpleOffset.Initialize (method)
  Initialize(theInputShape: TopoDS_Shape, theOffsetValue: number): void;

  // BRepOffset_MakeSimpleOffset.Perform (method)
  Perform(): void;

  // BRepOffset_MakeSimpleOffset.GetErrorMessage (method)
  GetErrorMessage(): TCollection_AsciiString;

  // BRepOffset_MakeSimpleOffset.GetError (method)
  GetError(): BRepOffsetSimple_Status;

  // BRepOffset_MakeSimpleOffset.GetBuildSolidFlag (method)
  GetBuildSolidFlag(): boolean;

  // BRepOffset_MakeSimpleOffset.SetBuildSolidFlag (method)
  SetBuildSolidFlag(theBuildFlag: boolean): void;

  // BRepOffset_MakeSimpleOffset.GetOffsetValue (method)
  GetOffsetValue(): number;

  // BRepOffset_MakeSimpleOffset.SetOffsetValue (method)
  SetOffsetValue(theOffsetValue: number): void;

  // BRepOffset_MakeSimpleOffset.GetTolerance (method)
  GetTolerance(): number;

  // BRepOffset_MakeSimpleOffset.SetTolerance (method)
  SetTolerance(theValue: number): void;

  // BRepOffset_MakeSimpleOffset.IsDone (method)
  IsDone(): boolean;

  // BRepOffset_MakeSimpleOffset.GetResultShape (method)
  GetResultShape(): TopoDS_Shape;

  // BRepOffset_MakeSimpleOffset.GetSafeOffset (method)
  GetSafeOffset(theExpectedToler: number): number;

  // BRepOffset_MakeSimpleOffset.Generated (method)
  Generated(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepOffset_MakeSimpleOffset.Modified (method)
  Modified(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepOffset_MakeSimpleOffset.delete (method)
  delete(): void;

  // BRepOffset_MakeSimpleOffset.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffset_Mode: typeof BRepOffset_Mode[keyof typeof BRepOffset_Mode]

  readonly BRepOffset_Skin: 'BRepOffset_Skin'

  readonly BRepOffset_Pipe: 'BRepOffset_Pipe'

  readonly BRepOffset_RectoVerso: 'BRepOffset_RectoVerso'

BRepOffset_Offset: declare class BRepOffset_Offset

  // BRepOffset_Offset.constructor (constructor)
  constructor();
  constructor(Face: TopoDS_Face, Offset: number, OffsetOutside?: boolean, JoinType?: GeomAbs_JoinType);
  constructor(Face: TopoDS_Face, Offset: number, Created: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, OffsetOutside?: boolean, JoinType?: GeomAbs_JoinType);
  constructor(Vertex: TopoDS_Vertex, LEdge: NCollection_List_TopoDS_Shape, Offset: number, Polynomial?: boolean, Tol?: number, Conti?: GeomAbs_Shape);
  constructor(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, Polynomial?: boolean, Tol?: number, Conti?: GeomAbs_Shape);
  constructor(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, FirstEdge: TopoDS_Edge, LastEdge: TopoDS_Edge, Polynomial?: boolean, Tol?: number, Conti?: GeomAbs_Shape);

  // BRepOffset_Offset.Init (method)
  Init(Face: TopoDS_Face, Offset: number, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
  Init(Face: TopoDS_Face, Offset: number, Created: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
  Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
  Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, FirstEdge: TopoDS_Edge, LastEdge: TopoDS_Edge, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
  Init(Vertex: TopoDS_Vertex, LEdge: NCollection_List_TopoDS_Shape, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
  Init(Edge: TopoDS_Edge, Offset: number): void;

  // BRepOffset_Offset.InitialShape (method)
  InitialShape(): TopoDS_Shape;

  // BRepOffset_Offset.Face (method)
  Face(): TopoDS_Face;

  // BRepOffset_Offset.Generated (method)
  Generated(Shape: TopoDS_Shape): TopoDS_Shape;

  // BRepOffset_Offset.Status (method)
  Status(): BRepOffset_Status;

  // BRepOffset_Offset.delete (method)
  delete(): void;

  // BRepOffset_Offset.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffset_SimpleOffset: declare class BRepOffset_SimpleOffset extends BRepTools_Modification

  // BRepOffset_SimpleOffset.constructor (constructor)
  constructor(theInputShape: TopoDS_Shape, theOffsetValue: number, theTolerance: number);

  // BRepOffset_SimpleOffset.get_type_name (method)
  static get_type_name(): string;

  // BRepOffset_SimpleOffset.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepOffset_SimpleOffset.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepOffset_SimpleOffset.NewSurface (method)
  NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

  // BRepOffset_SimpleOffset.NewCurve (method)
  NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepOffset_SimpleOffset.NewPoint (method)
  NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

  // BRepOffset_SimpleOffset.NewCurve2d (method)
  NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

  // BRepOffset_SimpleOffset.NewParameter (method)
  NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

  // BRepOffset_SimpleOffset.Continuity (method)
  Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

  // BRepOffset_SimpleOffset.delete (method)
  delete(): void;

  // BRepOffset_SimpleOffset.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffset_Status: typeof BRepOffset_Status[keyof typeof BRepOffset_Status]

  readonly BRepOffset_Good: 'BRepOffset_Good'

  readonly BRepOffset_Reversed: 'BRepOffset_Reversed'

  readonly BRepOffset_Degenerated: 'BRepOffset_Degenerated'

  readonly BRepOffset_Unknown: 'BRepOffset_Unknown'

BRepOffset_DataMapOfShapeOffset: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher

BRepOffset_ListOfInterval: NCollection_List_BRepOffset_Interval
