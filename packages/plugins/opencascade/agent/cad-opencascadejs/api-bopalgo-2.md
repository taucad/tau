# libcascade — BOPAlgo (2)

15 top-level symbols. Signatures are verbatim typescript.

BOPAlgo_MakePeriodic_PeriodicityParams: declare class BOPAlgo_MakePeriodic_PeriodicityParams

  // BOPAlgo_MakePeriodic_PeriodicityParams.constructor (constructor)
  constructor();

  // BOPAlgo_MakePeriodic_PeriodicityParams.Clear (method)
  Clear(): void;

  // BOPAlgo_MakePeriodic_PeriodicityParams.delete (method)
  delete(): void;

  // BOPAlgo_MakePeriodic_PeriodicityParams.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_MakerVolume: declare class BOPAlgo_MakerVolume extends BOPAlgo_Builder

  // BOPAlgo_MakerVolume.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPAlgo_MakerVolume.Clear (method)
  Clear(): void;

  // BOPAlgo_MakerVolume.SetIntersect (method)
  SetIntersect(bIntersect: boolean): void;

  // BOPAlgo_MakerVolume.IsIntersect (method)
  IsIntersect(): boolean;

  // BOPAlgo_MakerVolume.Box (method)
  Box(): TopoDS_Solid;

  // BOPAlgo_MakerVolume.Faces (method)
  Faces(): NCollection_List_TopoDS_Shape;

  // BOPAlgo_MakerVolume.SetAvoidInternalShapes (method)
  SetAvoidInternalShapes(theAvoidInternal: boolean): void;

  // BOPAlgo_MakerVolume.IsAvoidInternalShapes (method)
  IsAvoidInternalShapes(): boolean;

  // BOPAlgo_MakerVolume.Perform (method)
  Perform(theRange?: Message_ProgressRange): void;

  // BOPAlgo_MakerVolume.delete (method)
  delete(): void;

  // BOPAlgo_MakerVolume.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_Operation: typeof BOPAlgo_Operation[keyof typeof BOPAlgo_Operation]

  readonly BOPAlgo_COMMON: 'BOPAlgo_COMMON'

  readonly BOPAlgo_FUSE: 'BOPAlgo_FUSE'

  readonly BOPAlgo_CUT: 'BOPAlgo_CUT'

  readonly BOPAlgo_CUT21: 'BOPAlgo_CUT21'

  readonly BOPAlgo_SECTION: 'BOPAlgo_SECTION'

  readonly BOPAlgo_UNKNOWN: 'BOPAlgo_UNKNOWN'

BOPAlgo_Options: declare class BOPAlgo_Options

  // BOPAlgo_Options.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPAlgo_Options.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // BOPAlgo_Options.Clear (method)
  Clear(): void;

  // BOPAlgo_Options.AddError (method)
  AddError(theAlert: Message_Alert): void;

  // BOPAlgo_Options.AddWarning (method)
  AddWarning(theAlert: Message_Alert): void;

  // BOPAlgo_Options.HasErrors (method)
  HasErrors(): boolean;

  // BOPAlgo_Options.HasError (method)
  HasError(theType: Standard_Type): boolean;

  // BOPAlgo_Options.HasWarnings (method)
  HasWarnings(): boolean;

  // BOPAlgo_Options.HasWarning (method)
  HasWarning(theType: Standard_Type): boolean;

  // BOPAlgo_Options.GetReport (method)
  GetReport(): Message_Report;

  // BOPAlgo_Options.ClearWarnings (method)
  ClearWarnings(): void;

  // BOPAlgo_Options.GetParallelMode (method)
  static GetParallelMode(): boolean;

  // BOPAlgo_Options.SetParallelMode (method)
  static SetParallelMode(theNewMode: boolean): void;

  // BOPAlgo_Options.SetRunParallel (method)
  SetRunParallel(theFlag: boolean): void;

  // BOPAlgo_Options.RunParallel (method)
  RunParallel(): boolean;

  // BOPAlgo_Options.SetFuzzyValue (method)
  SetFuzzyValue(theFuzz: number): void;

  // BOPAlgo_Options.FuzzyValue (method)
  FuzzyValue(): number;

  // BOPAlgo_Options.SetUseOBB (method)
  SetUseOBB(theUseOBB: boolean): void;

  // BOPAlgo_Options.UseOBB (method)
  UseOBB(): boolean;

  // BOPAlgo_Options.delete (method)
  delete(): void;

  // BOPAlgo_Options.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_RemoveFeatures: declare class BOPAlgo_RemoveFeatures extends BOPAlgo_BuilderShape

  // BOPAlgo_RemoveFeatures.constructor (constructor)
  constructor();

  // BOPAlgo_RemoveFeatures.SetShape (method)
  SetShape(theShape: TopoDS_Shape): void;

  // BOPAlgo_RemoveFeatures.InputShape (method)
  InputShape(): TopoDS_Shape;

  // BOPAlgo_RemoveFeatures.AddFaceToRemove (method)
  AddFaceToRemove(theFace: TopoDS_Shape): void;

  // BOPAlgo_RemoveFeatures.AddFacesToRemove (method)
  AddFacesToRemove(theFaces: NCollection_List_TopoDS_Shape): void;

  // BOPAlgo_RemoveFeatures.FacesToRemove (method)
  FacesToRemove(): NCollection_List_TopoDS_Shape;

  // BOPAlgo_RemoveFeatures.Perform (method)
  Perform(theRange?: Message_ProgressRange): void;

  // BOPAlgo_RemoveFeatures.Clear (method)
  Clear(): void;

  // BOPAlgo_RemoveFeatures.delete (method)
  delete(): void;

  // BOPAlgo_RemoveFeatures.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_Section: declare class BOPAlgo_Section extends BOPAlgo_Builder

  // BOPAlgo_Section.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPAlgo_Section.delete (method)
  delete(): void;

  // BOPAlgo_Section.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_SectionAttribute: declare class BOPAlgo_SectionAttribute

  // BOPAlgo_SectionAttribute.constructor (constructor)
  constructor();
  constructor(theAproximation: boolean, thePCurveOnS1: boolean, thePCurveOnS2: boolean);

  // BOPAlgo_SectionAttribute.Approximation (method)
  Approximation(theApprox: boolean): void;
  Approximation(): boolean;

  // BOPAlgo_SectionAttribute.PCurveOnS1 (method)
  PCurveOnS1(thePCurveOnS1: boolean): void;
  PCurveOnS1(): boolean;

  // BOPAlgo_SectionAttribute.PCurveOnS2 (method)
  PCurveOnS2(thePCurveOnS2: boolean): void;
  PCurveOnS2(): boolean;

  // BOPAlgo_SectionAttribute.delete (method)
  delete(): void;

  // BOPAlgo_SectionAttribute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_ShellSplitter: declare class BOPAlgo_ShellSplitter extends BOPAlgo_Algo

  // BOPAlgo_ShellSplitter.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPAlgo_ShellSplitter.AddStartElement (method)
  AddStartElement(theS: TopoDS_Shape): void;

  // BOPAlgo_ShellSplitter.StartElements (method)
  StartElements(): NCollection_List_TopoDS_Shape;

  // BOPAlgo_ShellSplitter.Perform (method)
  Perform(theRange?: Message_ProgressRange): void;

  // BOPAlgo_ShellSplitter.Shells (method)
  Shells(): NCollection_List_TopoDS_Shape;

  // BOPAlgo_ShellSplitter.SplitBlock (method)
  static SplitBlock(theCB: BOPTools_ConnexityBlock): void;

  // BOPAlgo_ShellSplitter.delete (method)
  delete(): void;

  // BOPAlgo_ShellSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_Splitter: declare class BOPAlgo_Splitter extends BOPAlgo_ToolsProvider

  // BOPAlgo_Splitter.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPAlgo_Splitter.Perform (method)
  Perform(theRange?: Message_ProgressRange): void;

  // BOPAlgo_Splitter.delete (method)
  delete(): void;

  // BOPAlgo_Splitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_Tools: declare class BOPAlgo_Tools

  // BOPAlgo_Tools.constructor (constructor)
  constructor();

  // BOPAlgo_Tools.FillMap (method)
  static FillMap(thePB1: BOPDS_PaveBlock, theF: number, theMILI: NCollection_IndexedDataMap_handle_BOPDS_PaveBlock_NCollection_List_int, theAllocator: NCollection_BaseAllocator): void;

  // BOPAlgo_Tools.ComputeToleranceOfCB (method)
  static ComputeToleranceOfCB(theCB: BOPDS_CommonBlock, theDS: BOPDS_DS, theContext: IntTools_Context): number;

  // BOPAlgo_Tools.EdgesToWires (method)
  static EdgesToWires(theEdges: TopoDS_Shape, theWires: TopoDS_Shape, theShared: boolean, theAngTol: number): number;

  // BOPAlgo_Tools.WiresToFaces (method)
  static WiresToFaces(theWires: TopoDS_Shape, theFaces: TopoDS_Shape, theAngTol: number): boolean;

  // BOPAlgo_Tools.IntersectVertices (method)
  static IntersectVertices(theVertices: NCollection_IndexedDataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher, theFuzzyValue: number, theChains: NCollection_List_NCollection_List_TopoDS_Shape): void;

  // BOPAlgo_Tools.ClassifyFaces (method)
  static ClassifyFaces(theFaces: NCollection_List_TopoDS_Shape, theSolids: NCollection_List_TopoDS_Shape, theRunParallel: boolean, theInParts: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theShapeBoxMap: NCollection_DataMap_TopoDS_Shape_Bnd_Box_TopTools_ShapeMapHasher, theSolidsIF: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): { theContext: IntTools_Context; [Symbol.dispose](): void };

  // BOPAlgo_Tools.FillInternals (method)
  static FillInternals(theSolids: NCollection_List_TopoDS_Shape, theParts: NCollection_List_TopoDS_Shape, theImages: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theContext: IntTools_Context): void;

  // BOPAlgo_Tools.TrsfToPoint (method)
  static TrsfToPoint(theBox1: Bnd_Box, theBox2: Bnd_Box, theTrsf: gp_Trsf, thePoint: gp_Pnt, theCriteria: number): boolean;

  // BOPAlgo_Tools.delete (method)
  delete(): void;

  // BOPAlgo_Tools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_ToolsProvider: declare class BOPAlgo_ToolsProvider extends BOPAlgo_Builder

  // BOPAlgo_ToolsProvider.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPAlgo_ToolsProvider.Clear (method)
  Clear(): void;

  // BOPAlgo_ToolsProvider.AddTool (method)
  AddTool(theShape: TopoDS_Shape): void;

  // BOPAlgo_ToolsProvider.SetTools (method)
  SetTools(theShapes: NCollection_List_TopoDS_Shape): void;

  // BOPAlgo_ToolsProvider.Tools (method)
  Tools(): NCollection_List_TopoDS_Shape;

  // BOPAlgo_ToolsProvider.delete (method)
  delete(): void;

  // BOPAlgo_ToolsProvider.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_WireEdgeSet: declare class BOPAlgo_WireEdgeSet

  // BOPAlgo_WireEdgeSet.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPAlgo_WireEdgeSet.Clear (method)
  Clear(): void;

  // BOPAlgo_WireEdgeSet.SetFace (method)
  SetFace(aF: TopoDS_Face): void;

  // BOPAlgo_WireEdgeSet.Face (method)
  Face(): TopoDS_Face;

  // BOPAlgo_WireEdgeSet.AddStartElement (method)
  AddStartElement(sS: TopoDS_Shape): void;

  // BOPAlgo_WireEdgeSet.StartElements (method)
  StartElements(): NCollection_List_TopoDS_Shape;

  // BOPAlgo_WireEdgeSet.AddShape (method)
  AddShape(sS: TopoDS_Shape): void;

  // BOPAlgo_WireEdgeSet.Shapes (method)
  Shapes(): NCollection_List_TopoDS_Shape;

  // BOPAlgo_WireEdgeSet.delete (method)
  delete(): void;

  // BOPAlgo_WireEdgeSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_WireSplitter: declare class BOPAlgo_WireSplitter extends BOPAlgo_Algo

  // BOPAlgo_WireSplitter.constructor (constructor)
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);

  // BOPAlgo_WireSplitter.SetWES (method)
  SetWES(theWES: BOPAlgo_WireEdgeSet): void;

  // BOPAlgo_WireSplitter.WES (method)
  WES(): BOPAlgo_WireEdgeSet;

  // BOPAlgo_WireSplitter.SetContext (method)
  SetContext(theContext: IntTools_Context): void;

  // BOPAlgo_WireSplitter.Context (method)
  Context(): IntTools_Context;

  // BOPAlgo_WireSplitter.Perform (method)
  Perform(theRange?: Message_ProgressRange): void;

  // BOPAlgo_WireSplitter.MakeWire (method)
  static MakeWire(theLE: NCollection_List_TopoDS_Shape, theW: TopoDS_Wire): void;

  // BOPAlgo_WireSplitter.SplitBlock (method)
  static SplitBlock(theF: TopoDS_Face, theCB: BOPTools_ConnexityBlock, theContext: IntTools_Context): void;

  // BOPAlgo_WireSplitter.delete (method)
  delete(): void;

  // BOPAlgo_WireSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_EdgeInfo: declare class BOPAlgo_EdgeInfo

  // BOPAlgo_EdgeInfo.constructor (constructor)
  constructor();

  // BOPAlgo_EdgeInfo.SetEdge (method)
  SetEdge(theE: TopoDS_Edge): void;

  // BOPAlgo_EdgeInfo.Edge (method)
  Edge(): TopoDS_Edge;

  // BOPAlgo_EdgeInfo.SetPassed (method)
  SetPassed(theFlag: boolean): void;

  // BOPAlgo_EdgeInfo.Passed (method)
  Passed(): boolean;

  // BOPAlgo_EdgeInfo.SetInFlag (method)
  SetInFlag(theFlag: boolean): void;

  // BOPAlgo_EdgeInfo.IsIn (method)
  IsIn(): boolean;

  // BOPAlgo_EdgeInfo.SetAngle (method)
  SetAngle(theAngle: number): void;

  // BOPAlgo_EdgeInfo.Angle (method)
  Angle(): number;

  // BOPAlgo_EdgeInfo.IsInside (method)
  IsInside(): boolean;

  // BOPAlgo_EdgeInfo.SetIsInside (method)
  SetIsInside(theIsInside: boolean): void;

  // BOPAlgo_EdgeInfo.delete (method)
  delete(): void;

  // BOPAlgo_EdgeInfo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BOPAlgo_ListOfCheckResult: NCollection_List_BOPAlgo_CheckResult
