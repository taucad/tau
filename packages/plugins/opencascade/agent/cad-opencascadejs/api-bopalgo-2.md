# libcascade — BOPAlgo (2)

12 top-level symbols. Signatures are verbatim typescript.

BOPAlgo_Options: declare class BOPAlgo_Options

  constructor

  Allocator(): NCollection_BaseAllocator;

  Clear(): void;

  AddError(theAlert: Message_Alert): void;

  AddWarning(theAlert: Message_Alert): void;

  HasErrors(): boolean;

  HasError(theType: Standard_Type): boolean;

  HasWarnings(): boolean;

  HasWarning(theType: Standard_Type): boolean;

  GetReport(): Message_Report;

  ClearWarnings(): void;

  static GetParallelMode(): boolean;

  static SetParallelMode(theNewMode: boolean): void;

  SetRunParallel(theFlag: boolean): void;

  RunParallel(): boolean;

  SetFuzzyValue(theFuzz: number): void;

  FuzzyValue(): number;

  SetUseOBB(theUseOBB: boolean): void;

  UseOBB(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_RemoveFeatures: declare class BOPAlgo_RemoveFeatures extends BOPAlgo_BuilderShape

  constructor

  SetShape(theShape: TopoDS_Shape): void;

  InputShape(): TopoDS_Shape;

  AddFaceToRemove(theFace: TopoDS_Shape): void;

  AddFacesToRemove(theFaces: NCollection_List_TopoDS_Shape): void;

  FacesToRemove(): NCollection_List_TopoDS_Shape;

  Perform(theRange?: Message_ProgressRange): void;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_Section: declare class BOPAlgo_Section extends BOPAlgo_Builder

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_SectionAttribute: declare class BOPAlgo_SectionAttribute

  constructor

  Approximation(theApprox: boolean): void;
  Approximation(): boolean;
  Approximation(theApprox: boolean): void;
  Approximation(): boolean;

  PCurveOnS1(thePCurveOnS1: boolean): void;
  PCurveOnS1(): boolean;
  PCurveOnS1(thePCurveOnS1: boolean): void;
  PCurveOnS1(): boolean;

  PCurveOnS2(thePCurveOnS2: boolean): void;
  PCurveOnS2(): boolean;
  PCurveOnS2(thePCurveOnS2: boolean): void;
  PCurveOnS2(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_ShellSplitter: declare class BOPAlgo_ShellSplitter extends BOPAlgo_Algo

  constructor

  AddStartElement(theS: TopoDS_Shape): void;

  StartElements(): NCollection_List_TopoDS_Shape;

  Perform(theRange?: Message_ProgressRange): void;

  Shells(): NCollection_List_TopoDS_Shape;

  static SplitBlock(theCB: BOPTools_ConnexityBlock): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_Splitter: declare class BOPAlgo_Splitter extends BOPAlgo_ToolsProvider

  constructor

  Perform(theRange?: Message_ProgressRange): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_Tools: declare class BOPAlgo_Tools

  constructor

  static FillMap(thePB1: BOPDS_PaveBlock, theF: number, theMILI: NCollection_IndexedDataMap_handle_BOPDS_PaveBlock_NCollection_List_int, theAllocator: NCollection_BaseAllocator): void;

  static ComputeToleranceOfCB(theCB: BOPDS_CommonBlock, theDS: BOPDS_DS, theContext: IntTools_Context): number;

  static EdgesToWires(theEdges: TopoDS_Shape, theWires: TopoDS_Shape, theShared: boolean, theAngTol: number): number;

  static WiresToFaces(theWires: TopoDS_Shape, theFaces: TopoDS_Shape, theAngTol: number): boolean;

  static IntersectVertices(theVertices: NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher, theFuzzyValue: number, theChains: NCollection_List_NCollection_List_TopoDS_Shape): void;

  static ClassifyFaces(theFaces: NCollection_List_TopoDS_Shape, theSolids: NCollection_List_TopoDS_Shape, theRunParallel: boolean, theInParts: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theShapeBoxMap: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher, theSolidsIF: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): { theContext: IntTools_Context; [Symbol.dispose](): void };

  static FillInternals(theSolids: NCollection_List_TopoDS_Shape, theParts: NCollection_List_TopoDS_Shape, theImages: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theContext: IntTools_Context): void;

  static TrsfToPoint(theBox1: Bnd_Box, theBox2: Bnd_Box, theTrsf: gp_Trsf, thePoint: gp_Pnt, theCriteria: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_ToolsProvider: declare class BOPAlgo_ToolsProvider extends BOPAlgo_Builder

  constructor

  Clear(): void;

  AddTool(theShape: TopoDS_Shape): void;

  SetTools(theShapes: NCollection_List_TopoDS_Shape): void;

  Tools(): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_WireEdgeSet: declare class BOPAlgo_WireEdgeSet

  constructor

  Clear(): void;

  SetFace(aF: TopoDS_Face): void;

  Face(): TopoDS_Face;

  AddStartElement(sS: TopoDS_Shape): void;

  StartElements(): NCollection_List_TopoDS_Shape;

  AddShape(sS: TopoDS_Shape): void;

  Shapes(): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_WireSplitter: declare class BOPAlgo_WireSplitter extends BOPAlgo_Algo

  constructor

  SetWES(theWES: BOPAlgo_WireEdgeSet): void;

  WES(): BOPAlgo_WireEdgeSet;

  SetContext(theContext: IntTools_Context): void;

  Context(): IntTools_Context;

  Perform(theRange?: Message_ProgressRange): void;

  static MakeWire(theLE: NCollection_List_TopoDS_Shape, theW: TopoDS_Wire): void;

  static SplitBlock(theF: TopoDS_Face, theCB: BOPTools_ConnexityBlock, theContext: IntTools_Context): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_EdgeInfo: declare class BOPAlgo_EdgeInfo

  constructor

  SetEdge(theE: TopoDS_Edge): void;

  Edge(): TopoDS_Edge;

  SetPassed(theFlag: boolean): void;

  Passed(): boolean;

  SetInFlag(theFlag: boolean): void;

  IsIn(): boolean;

  SetAngle(theAngle: number): void;

  Angle(): number;

  IsInside(): boolean;

  SetIsInside(theIsInside: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

BOPAlgo_ListOfCheckResult: NCollection_List_BOPAlgo_CheckResult
