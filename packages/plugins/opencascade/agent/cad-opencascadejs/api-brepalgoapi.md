# libcascade — BRepAlgoAPI

10 top-level symbols. Signatures are verbatim typescript.

BRepAlgoAPI_Algo: declare class BRepAlgoAPI_Algo extends BRepBuilderAPI_MakeShape

  // BRepAlgoAPI_Algo.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepAlgoAPI_Algo.Clear (method)
  Clear(): void;

  // BRepAlgoAPI_Algo.ClearWarnings (method)
  ClearWarnings(): void;

  // BRepAlgoAPI_Algo.FuzzyValue (method)
  FuzzyValue(): number;

  // BRepAlgoAPI_Algo.GetReport (method)
  GetReport(): Message_Report;

  // BRepAlgoAPI_Algo.HasError (method)
  HasError(theType: Standard_Type): boolean;

  // BRepAlgoAPI_Algo.HasErrors (method)
  HasErrors(): boolean;

  // BRepAlgoAPI_Algo.HasWarning (method)
  HasWarning(theType: Standard_Type): boolean;

  // BRepAlgoAPI_Algo.HasWarnings (method)
  HasWarnings(): boolean;

  // BRepAlgoAPI_Algo.RunParallel (method)
  RunParallel(): boolean;

  // BRepAlgoAPI_Algo.SetFuzzyValue (method)
  SetFuzzyValue(theFuzz: number): void;

  // BRepAlgoAPI_Algo.SetRunParallel (method)
  SetRunParallel(theFlag: boolean): void;

  // BRepAlgoAPI_Algo.SetUseOBB (method)
  SetUseOBB(theUseOBB: boolean): void;

  // BRepAlgoAPI_Algo.delete (method)
  delete(): void;

  // BRepAlgoAPI_Algo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_BooleanOperation: declare class BRepAlgoAPI_BooleanOperation extends BRepAlgoAPI_BuilderAlgo

  // BRepAlgoAPI_BooleanOperation.constructor (constructor)
  constructor();

  // BRepAlgoAPI_BooleanOperation.Shape1 (method)
  Shape1(): TopoDS_Shape;

  // BRepAlgoAPI_BooleanOperation.Shape2 (method)
  Shape2(): TopoDS_Shape;

  // BRepAlgoAPI_BooleanOperation.SetTools (method)
  SetTools(theLS: NCollection_List_TopoDS_Shape): void;

  // BRepAlgoAPI_BooleanOperation.Tools (method)
  Tools(): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_BooleanOperation.SetOperation (method)
  SetOperation(theBOP: BOPAlgo_Operation): void;

  // BRepAlgoAPI_BooleanOperation.Operation (method)
  Operation(): BOPAlgo_Operation;

  // BRepAlgoAPI_BooleanOperation.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepAlgoAPI_BooleanOperation.delete (method)
  delete(): void;

  // BRepAlgoAPI_BooleanOperation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_BuilderAlgo: declare class BRepAlgoAPI_BuilderAlgo extends BRepAlgoAPI_Algo

  // BRepAlgoAPI_BuilderAlgo.constructor (constructor)
  constructor();

  // BRepAlgoAPI_BuilderAlgo.SetArguments (method)
  SetArguments(theLS: NCollection_List_TopoDS_Shape): void;

  // BRepAlgoAPI_BuilderAlgo.Arguments (method)
  Arguments(): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_BuilderAlgo.SetNonDestructive (method)
  SetNonDestructive(theFlag: boolean): void;

  // BRepAlgoAPI_BuilderAlgo.NonDestructive (method)
  NonDestructive(): boolean;

  // BRepAlgoAPI_BuilderAlgo.SetGlue (method)
  SetGlue(theGlue: BOPAlgo_GlueEnum): void;

  // BRepAlgoAPI_BuilderAlgo.Glue (method)
  Glue(): BOPAlgo_GlueEnum;

  // BRepAlgoAPI_BuilderAlgo.SetCheckInverted (method)
  SetCheckInverted(theCheck: boolean): void;

  // BRepAlgoAPI_BuilderAlgo.CheckInverted (method)
  CheckInverted(): boolean;

  // BRepAlgoAPI_BuilderAlgo.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepAlgoAPI_BuilderAlgo.SimplifyResult (method)
  SimplifyResult(theUnifyEdges?: boolean, theUnifyFaces?: boolean, theAngularTol?: number): void;

  // BRepAlgoAPI_BuilderAlgo.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_BuilderAlgo.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_BuilderAlgo.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepAlgoAPI_BuilderAlgo.HasModified (method)
  HasModified(): boolean;

  // BRepAlgoAPI_BuilderAlgo.HasGenerated (method)
  HasGenerated(): boolean;

  // BRepAlgoAPI_BuilderAlgo.HasDeleted (method)
  HasDeleted(): boolean;

  // BRepAlgoAPI_BuilderAlgo.SetToFillHistory (method)
  SetToFillHistory(theHistFlag: boolean): void;

  // BRepAlgoAPI_BuilderAlgo.HasHistory (method)
  HasHistory(): boolean;

  // BRepAlgoAPI_BuilderAlgo.SectionEdges (method)
  SectionEdges(): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_BuilderAlgo.Builder (method)
  Builder(): BOPAlgo_Builder;

  // BRepAlgoAPI_BuilderAlgo.History (method)
  History(): BRepTools_History;

  // BRepAlgoAPI_BuilderAlgo.delete (method)
  delete(): void;

  // BRepAlgoAPI_BuilderAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_Check: declare class BRepAlgoAPI_Check extends BOPAlgo_Options

  // BRepAlgoAPI_Check.constructor (constructor)
  constructor();
  constructor(theS: TopoDS_Shape, bTestSE?: boolean, bTestSI?: boolean, theRange?: Message_ProgressRange);
  constructor(theS1: TopoDS_Shape, theS2: TopoDS_Shape, theOp?: BOPAlgo_Operation, bTestSE?: boolean, bTestSI?: boolean, theRange?: Message_ProgressRange);

  // BRepAlgoAPI_Check.SetData (method)
  SetData(theS: TopoDS_Shape, bTestSE: boolean, bTestSI: boolean): void;
  SetData(theS1: TopoDS_Shape, theS2: TopoDS_Shape, theOp: BOPAlgo_Operation, bTestSE: boolean, bTestSI: boolean): void;

  // BRepAlgoAPI_Check.Perform (method)
  Perform(theRange?: Message_ProgressRange): void;

  // BRepAlgoAPI_Check.IsValid (method)
  IsValid(): boolean;

  // BRepAlgoAPI_Check.Result (method)
  Result(): NCollection_List_BOPAlgo_CheckResult;

  // BRepAlgoAPI_Check.delete (method)
  delete(): void;

  // BRepAlgoAPI_Check.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_Common: declare class BRepAlgoAPI_Common extends BRepAlgoAPI_BooleanOperation

  // BRepAlgoAPI_Common.constructor (constructor)
  constructor();
  constructor(S1: TopoDS_Shape, S2: TopoDS_Shape, theRange?: Message_ProgressRange);

  // BRepAlgoAPI_Common.delete (method)
  delete(): void;

  // BRepAlgoAPI_Common.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_Cut: declare class BRepAlgoAPI_Cut extends BRepAlgoAPI_BooleanOperation

  // BRepAlgoAPI_Cut.constructor (constructor)
  constructor();
  constructor(S1: TopoDS_Shape, S2: TopoDS_Shape, theRange?: Message_ProgressRange);

  // BRepAlgoAPI_Cut.delete (method)
  delete(): void;

  // BRepAlgoAPI_Cut.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_Defeaturing: declare class BRepAlgoAPI_Defeaturing extends BRepAlgoAPI_Algo

  // BRepAlgoAPI_Defeaturing.constructor (constructor)
  constructor();

  // BRepAlgoAPI_Defeaturing.SetShape (method)
  SetShape(theShape: TopoDS_Shape): void;

  // BRepAlgoAPI_Defeaturing.InputShape (method)
  InputShape(): TopoDS_Shape;

  // BRepAlgoAPI_Defeaturing.AddFaceToRemove (method)
  AddFaceToRemove(theFace: TopoDS_Shape): void;

  // BRepAlgoAPI_Defeaturing.AddFacesToRemove (method)
  AddFacesToRemove(theFaces: NCollection_List_TopoDS_Shape): void;

  // BRepAlgoAPI_Defeaturing.FacesToRemove (method)
  FacesToRemove(): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_Defeaturing.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepAlgoAPI_Defeaturing.SetToFillHistory (method)
  SetToFillHistory(theFlag: boolean): void;

  // BRepAlgoAPI_Defeaturing.HasHistory (method)
  HasHistory(): boolean;

  // BRepAlgoAPI_Defeaturing.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_Defeaturing.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_Defeaturing.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepAlgoAPI_Defeaturing.HasModified (method)
  HasModified(): boolean;

  // BRepAlgoAPI_Defeaturing.HasGenerated (method)
  HasGenerated(): boolean;

  // BRepAlgoAPI_Defeaturing.HasDeleted (method)
  HasDeleted(): boolean;

  // BRepAlgoAPI_Defeaturing.History (method)
  History(): BRepTools_History;

  // BRepAlgoAPI_Defeaturing.delete (method)
  delete(): void;

  // BRepAlgoAPI_Defeaturing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_Fuse: declare class BRepAlgoAPI_Fuse extends BRepAlgoAPI_BooleanOperation

  // BRepAlgoAPI_Fuse.constructor (constructor)
  constructor();
  constructor(S1: TopoDS_Shape, S2: TopoDS_Shape, theRange?: Message_ProgressRange);

  // BRepAlgoAPI_Fuse.delete (method)
  delete(): void;

  // BRepAlgoAPI_Fuse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_Section: declare class BRepAlgoAPI_Section extends BRepAlgoAPI_BooleanOperation

  // BRepAlgoAPI_Section.constructor (constructor)
  constructor();
  constructor(S1: TopoDS_Shape, S2: TopoDS_Shape, PerformNow?: boolean);
  constructor(S1: TopoDS_Shape, Pl: gp_Pln, PerformNow?: boolean);
  constructor(S1: TopoDS_Shape, Sf: Geom_Surface, PerformNow?: boolean);
  constructor(Sf: Geom_Surface, S2: TopoDS_Shape, PerformNow?: boolean);
  constructor(Sf1: Geom_Surface, Sf2: Geom_Surface, PerformNow?: boolean);

  // BRepAlgoAPI_Section.Init1 (method)
  Init1(S1: TopoDS_Shape): void;
  Init1(Pl: gp_Pln): void;
  Init1(Sf: Geom_Surface): void;

  // BRepAlgoAPI_Section.Init2 (method)
  Init2(S2: TopoDS_Shape): void;
  Init2(Pl: gp_Pln): void;
  Init2(Sf: Geom_Surface): void;

  // BRepAlgoAPI_Section.Approximation (method)
  Approximation(B: boolean): void;

  // BRepAlgoAPI_Section.ComputePCurveOn1 (method)
  ComputePCurveOn1(B: boolean): void;

  // BRepAlgoAPI_Section.ComputePCurveOn2 (method)
  ComputePCurveOn2(B: boolean): void;

  // BRepAlgoAPI_Section.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepAlgoAPI_Section.HasAncestorFaceOn1 (method)
  HasAncestorFaceOn1(E: TopoDS_Shape, F: TopoDS_Shape): boolean;

  // BRepAlgoAPI_Section.HasAncestorFaceOn2 (method)
  HasAncestorFaceOn2(E: TopoDS_Shape, F: TopoDS_Shape): boolean;

  // BRepAlgoAPI_Section.delete (method)
  delete(): void;

  // BRepAlgoAPI_Section.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepAlgoAPI_Splitter: declare class BRepAlgoAPI_Splitter extends BRepAlgoAPI_BuilderAlgo

  // BRepAlgoAPI_Splitter.constructor (constructor)
  constructor();

  // BRepAlgoAPI_Splitter.SetTools (method)
  SetTools(theLS: NCollection_List_TopoDS_Shape): void;

  // BRepAlgoAPI_Splitter.Tools (method)
  Tools(): NCollection_List_TopoDS_Shape;

  // BRepAlgoAPI_Splitter.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepAlgoAPI_Splitter.delete (method)
  delete(): void;

  // BRepAlgoAPI_Splitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
