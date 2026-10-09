# libcascade — BRepFeat

13 top-level symbols. Signatures are verbatim typescript.

BRepFeat_Builder: declare class BRepFeat_Builder extends BOPAlgo_BOP

  // BRepFeat_Builder.constructor (constructor)
  constructor();

  // BRepFeat_Builder.Clear (method)
  Clear(): void;

  // BRepFeat_Builder.Init (method)
  Init(theShape: TopoDS_Shape): void;
  Init(theShape: TopoDS_Shape, theTool: TopoDS_Shape): void;

  // BRepFeat_Builder.SetOperation (method)
  SetOperation(theFuse: number): void;
  SetOperation(theFuse: number, theFlag: boolean): void;
  SetOperation(theOperation: BOPAlgo_Operation): void;

  // BRepFeat_Builder.PartsOfTool (method)
  PartsOfTool(theLT: NCollection_List_TopoDS_Shape): void;

  // BRepFeat_Builder.KeepParts (method)
  KeepParts(theIm: NCollection_List_TopoDS_Shape): void;

  // BRepFeat_Builder.KeepPart (method)
  KeepPart(theS: TopoDS_Shape): void;

  // BRepFeat_Builder.PerformResult (method)
  PerformResult(theRange?: Message_ProgressRange): void;

  // BRepFeat_Builder.RebuildFaces (method)
  RebuildFaces(): void;

  // BRepFeat_Builder.RebuildEdge (method)
  RebuildEdge(theE: TopoDS_Shape, theF: TopoDS_Face, theME: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, aLEIm: NCollection_List_TopoDS_Shape): void;

  // BRepFeat_Builder.CheckSolidImages (method)
  CheckSolidImages(): void;

  // BRepFeat_Builder.FillRemoved (method)
  FillRemoved(): void;
  FillRemoved(theS: TopoDS_Shape, theM: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // BRepFeat_Builder.delete (method)
  delete(): void;

  // BRepFeat_Builder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_Form: declare class BRepFeat_Form extends BRepBuilderAPI_MakeShape

  // BRepFeat_Form.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFeat_Form.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFeat_Form.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepFeat_Form.FirstShape (method)
  FirstShape(): NCollection_List_TopoDS_Shape;

  // BRepFeat_Form.LastShape (method)
  LastShape(): NCollection_List_TopoDS_Shape;

  // BRepFeat_Form.NewEdges (method)
  NewEdges(): NCollection_List_TopoDS_Shape;

  // BRepFeat_Form.TgtEdges (method)
  TgtEdges(): NCollection_List_TopoDS_Shape;

  // BRepFeat_Form.BasisShapeValid (method)
  BasisShapeValid(): void;

  // BRepFeat_Form.GeneratedShapeValid (method)
  GeneratedShapeValid(): void;

  // BRepFeat_Form.ShapeFromValid (method)
  ShapeFromValid(): void;

  // BRepFeat_Form.ShapeUntilValid (method)
  ShapeUntilValid(): void;

  // BRepFeat_Form.GluedFacesValid (method)
  GluedFacesValid(): void;

  // BRepFeat_Form.SketchFaceValid (method)
  SketchFaceValid(): void;

  // BRepFeat_Form.PerfSelectionValid (method)
  PerfSelectionValid(): void;

  // BRepFeat_Form.Curves (method)
  Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

  // BRepFeat_Form.BarycCurve (method)
  BarycCurve(): Geom_Curve;

  // BRepFeat_Form.CurrentStatusError (method)
  CurrentStatusError(): BRepFeat_StatusError;

  // BRepFeat_Form.delete (method)
  delete(): void;

  // BRepFeat_Form.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_Gluer: declare class BRepFeat_Gluer extends BRepBuilderAPI_MakeShape

  // BRepFeat_Gluer.constructor (constructor)
  constructor();
  constructor(Snew: TopoDS_Shape, Sbase: TopoDS_Shape);

  // BRepFeat_Gluer.Init (method)
  Init(Snew: TopoDS_Shape, Sbase: TopoDS_Shape): void;

  // BRepFeat_Gluer.Bind (method)
  Bind(Fnew: TopoDS_Face, Fbase: TopoDS_Face): void;
  Bind(Enew: TopoDS_Edge, Ebase: TopoDS_Edge): void;

  // BRepFeat_Gluer.OpeType (method)
  OpeType(): LocOpe_Operation;

  // BRepFeat_Gluer.BasisShape (method)
  BasisShape(): TopoDS_Shape;

  // BRepFeat_Gluer.GluedShape (method)
  GluedShape(): TopoDS_Shape;

  // BRepFeat_Gluer.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepFeat_Gluer.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepFeat_Gluer.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFeat_Gluer.delete (method)
  delete(): void;

  // BRepFeat_Gluer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_MakeCylindricalHole: declare class BRepFeat_MakeCylindricalHole extends BRepFeat_Builder

  // BRepFeat_MakeCylindricalHole.constructor (constructor)
  constructor();

  // BRepFeat_MakeCylindricalHole.Init (method)
  Init(Axis: gp_Ax1): void;
  Init(S: TopoDS_Shape, Axis: gp_Ax1): void;
  Init(theShape: TopoDS_Shape): void;
  Init(theShape: TopoDS_Shape, theTool: TopoDS_Shape): void;

  // BRepFeat_MakeCylindricalHole.Perform (method)
  Perform(Radius: number): void;
  Perform(Radius: number, PFrom: number, PTo: number, WithControl: boolean): void;
  Perform(theRange: Message_ProgressRange): void;

  // BRepFeat_MakeCylindricalHole.PerformThruNext (method)
  PerformThruNext(Radius: number, WithControl?: boolean): void;

  // BRepFeat_MakeCylindricalHole.PerformUntilEnd (method)
  PerformUntilEnd(Radius: number, WithControl?: boolean): void;

  // BRepFeat_MakeCylindricalHole.PerformBlind (method)
  PerformBlind(Radius: number, Length: number, WithControl?: boolean): void;

  // BRepFeat_MakeCylindricalHole.Status (method)
  Status(): BRepFeat_Status;

  // BRepFeat_MakeCylindricalHole.Build (method)
  Build(): void;

  // BRepFeat_MakeCylindricalHole.delete (method)
  delete(): void;

  // BRepFeat_MakeCylindricalHole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_MakeDPrism: declare class BRepFeat_MakeDPrism extends BRepFeat_Form

  // BRepFeat_MakeDPrism.constructor (constructor)
  constructor();
  constructor(Sbase: TopoDS_Shape, Pbase: TopoDS_Face, Skface: TopoDS_Face, Angle: number, Fuse: number, Modify: boolean);

  // BRepFeat_MakeDPrism.Init (method)
  Init(Sbase: TopoDS_Shape, Pbase: TopoDS_Face, Skface: TopoDS_Face, Angle: number, Fuse: number, Modify: boolean): void;

  // BRepFeat_MakeDPrism.Add (method)
  Add(E: TopoDS_Edge, OnFace: TopoDS_Face): void;

  // BRepFeat_MakeDPrism.Perform (method)
  Perform(Height: number): void;
  Perform(Until: TopoDS_Shape): void;
  Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;

  // BRepFeat_MakeDPrism.PerformUntilEnd (method)
  PerformUntilEnd(): void;

  // BRepFeat_MakeDPrism.PerformFromEnd (method)
  PerformFromEnd(FUntil: TopoDS_Shape): void;

  // BRepFeat_MakeDPrism.PerformThruAll (method)
  PerformThruAll(): void;

  // BRepFeat_MakeDPrism.PerformUntilHeight (method)
  PerformUntilHeight(Until: TopoDS_Shape, Height: number): void;

  // BRepFeat_MakeDPrism.Curves (method)
  Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

  // BRepFeat_MakeDPrism.BarycCurve (method)
  BarycCurve(): Geom_Curve;

  // BRepFeat_MakeDPrism.BossEdges (method)
  BossEdges(sig: number): void;

  // BRepFeat_MakeDPrism.TopEdges (method)
  TopEdges(): NCollection_List_TopoDS_Shape;

  // BRepFeat_MakeDPrism.LatEdges (method)
  LatEdges(): NCollection_List_TopoDS_Shape;

  // BRepFeat_MakeDPrism.delete (method)
  delete(): void;

  // BRepFeat_MakeDPrism.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_MakePipe: declare class BRepFeat_MakePipe extends BRepFeat_Form

  // BRepFeat_MakePipe.constructor (constructor)
  constructor();
  constructor(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Spine: TopoDS_Wire, Fuse: number, Modify: boolean);

  // BRepFeat_MakePipe.Init (method)
  Init(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Spine: TopoDS_Wire, Fuse: number, Modify: boolean): void;

  // BRepFeat_MakePipe.Add (method)
  Add(E: TopoDS_Edge, OnFace: TopoDS_Face): void;

  // BRepFeat_MakePipe.Perform (method)
  Perform(): void;
  Perform(Until: TopoDS_Shape): void;
  Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;

  // BRepFeat_MakePipe.Curves (method)
  Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

  // BRepFeat_MakePipe.BarycCurve (method)
  BarycCurve(): Geom_Curve;

  // BRepFeat_MakePipe.delete (method)
  delete(): void;

  // BRepFeat_MakePipe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_MakePrism: declare class BRepFeat_MakePrism extends BRepFeat_Form

  // BRepFeat_MakePrism.constructor (constructor)
  constructor();
  constructor(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Direction: gp_Dir, Fuse: number, Modify: boolean);

  // BRepFeat_MakePrism.Init (method)
  Init(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Direction: gp_Dir, Fuse: number, Modify: boolean): void;

  // BRepFeat_MakePrism.Add (method)
  Add(E: TopoDS_Edge, OnFace: TopoDS_Face): void;

  // BRepFeat_MakePrism.Perform (method)
  Perform(Length: number): void;
  Perform(Until: TopoDS_Shape): void;
  Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;

  // BRepFeat_MakePrism.PerformUntilEnd (method)
  PerformUntilEnd(): void;

  // BRepFeat_MakePrism.PerformFromEnd (method)
  PerformFromEnd(FUntil: TopoDS_Shape): void;

  // BRepFeat_MakePrism.PerformThruAll (method)
  PerformThruAll(): void;

  // BRepFeat_MakePrism.PerformUntilHeight (method)
  PerformUntilHeight(Until: TopoDS_Shape, Length: number): void;

  // BRepFeat_MakePrism.Curves (method)
  Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

  // BRepFeat_MakePrism.BarycCurve (method)
  BarycCurve(): Geom_Curve;

  // BRepFeat_MakePrism.delete (method)
  delete(): void;

  // BRepFeat_MakePrism.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_MakeRevol: declare class BRepFeat_MakeRevol extends BRepFeat_Form

  // BRepFeat_MakeRevol.constructor (constructor)
  constructor();
  constructor(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Axis: gp_Ax1, Fuse: number, Modify: boolean);

  // BRepFeat_MakeRevol.Init (method)
  Init(Sbase: TopoDS_Shape, Pbase: TopoDS_Shape, Skface: TopoDS_Face, Axis: gp_Ax1, Fuse: number, Modify: boolean): void;

  // BRepFeat_MakeRevol.Add (method)
  Add(E: TopoDS_Edge, OnFace: TopoDS_Face): void;

  // BRepFeat_MakeRevol.Perform (method)
  Perform(Angle: number): void;
  Perform(Until: TopoDS_Shape): void;
  Perform(From: TopoDS_Shape, Until: TopoDS_Shape): void;

  // BRepFeat_MakeRevol.PerformThruAll (method)
  PerformThruAll(): void;

  // BRepFeat_MakeRevol.PerformUntilAngle (method)
  PerformUntilAngle(Until: TopoDS_Shape, Angle: number): void;

  // BRepFeat_MakeRevol.Curves (method)
  Curves(S: NCollection_Sequence_handle_Geom_Curve): void;

  // BRepFeat_MakeRevol.BarycCurve (method)
  BarycCurve(): Geom_Curve;

  // BRepFeat_MakeRevol.delete (method)
  delete(): void;

  // BRepFeat_MakeRevol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_PerfSelection: typeof BRepFeat_PerfSelection[keyof typeof BRepFeat_PerfSelection]

  readonly BRepFeat_NoSelection: 'BRepFeat_NoSelection'

  readonly BRepFeat_SelectionFU: 'BRepFeat_SelectionFU'

  readonly BRepFeat_SelectionU: 'BRepFeat_SelectionU'

  readonly BRepFeat_SelectionSh: 'BRepFeat_SelectionSh'

  readonly BRepFeat_SelectionShU: 'BRepFeat_SelectionShU'

BRepFeat_RibSlot: declare class BRepFeat_RibSlot extends BRepBuilderAPI_MakeShape

  // BRepFeat_RibSlot.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepFeat_RibSlot.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFeat_RibSlot.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFeat_RibSlot.FirstShape (method)
  FirstShape(): NCollection_List_TopoDS_Shape;

  // BRepFeat_RibSlot.LastShape (method)
  LastShape(): NCollection_List_TopoDS_Shape;

  // BRepFeat_RibSlot.FacesForDraft (method)
  FacesForDraft(): NCollection_List_TopoDS_Shape;

  // BRepFeat_RibSlot.NewEdges (method)
  NewEdges(): NCollection_List_TopoDS_Shape;

  // BRepFeat_RibSlot.TgtEdges (method)
  TgtEdges(): NCollection_List_TopoDS_Shape;

  // BRepFeat_RibSlot.IntPar (method)
  static IntPar(C: Geom_Curve, P: gp_Pnt): number;

  // BRepFeat_RibSlot.ChoiceOfFaces (method)
  static ChoiceOfFaces(faces: NCollection_List_TopoDS_Shape, cc: Geom_Curve, par: number, bnd: number, Pln: Geom_Plane): TopoDS_Face;

  // BRepFeat_RibSlot.CurrentStatusError (method)
  CurrentStatusError(): BRepFeat_StatusError;

  // BRepFeat_RibSlot.delete (method)
  delete(): void;

  // BRepFeat_RibSlot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_SplitShape: declare class BRepFeat_SplitShape extends BRepBuilderAPI_MakeShape

  // BRepFeat_SplitShape.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // BRepFeat_SplitShape.Add (method)
  Add(theEdges: NCollection_Sequence_TopoDS_Shape): boolean;
  Add(W: TopoDS_Wire, F: TopoDS_Face): void;
  Add(E: TopoDS_Edge, F: TopoDS_Face): void;
  Add(Comp: TopoDS_Compound, F: TopoDS_Face): void;
  Add(E: TopoDS_Edge, EOn: TopoDS_Edge): void;

  // BRepFeat_SplitShape.Init (method)
  Init(S: TopoDS_Shape): void;

  // BRepFeat_SplitShape.SetCheckInterior (method)
  SetCheckInterior(ToCheckInterior: boolean): void;

  // BRepFeat_SplitShape.DirectLeft (method)
  DirectLeft(): NCollection_List_TopoDS_Shape;

  // BRepFeat_SplitShape.Left (method)
  Left(): NCollection_List_TopoDS_Shape;

  // BRepFeat_SplitShape.Right (method)
  Right(): NCollection_List_TopoDS_Shape;

  // BRepFeat_SplitShape.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepFeat_SplitShape.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepFeat_SplitShape.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFeat_SplitShape.delete (method)
  delete(): void;

  // BRepFeat_SplitShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFeat_Status: typeof BRepFeat_Status[keyof typeof BRepFeat_Status]

  readonly BRepFeat_NoError: 'BRepFeat_NoError'

  readonly BRepFeat_InvalidPlacement: 'BRepFeat_InvalidPlacement'

  readonly BRepFeat_HoleTooLong: 'BRepFeat_HoleTooLong'

BRepFeat_StatusError: typeof BRepFeat_StatusError[keyof typeof BRepFeat_StatusError]

  readonly BRepFeat_OK: 'BRepFeat_OK'

  readonly BRepFeat_BadDirect: 'BRepFeat_BadDirect'

  readonly BRepFeat_BadIntersect: 'BRepFeat_BadIntersect'

  readonly BRepFeat_EmptyBaryCurve: 'BRepFeat_EmptyBaryCurve'

  readonly BRepFeat_EmptyCutResult: 'BRepFeat_EmptyCutResult'

  readonly BRepFeat_FalseSide: 'BRepFeat_FalseSide'

  readonly BRepFeat_IncDirection: 'BRepFeat_IncDirection'

  readonly BRepFeat_IncSlidFace: 'BRepFeat_IncSlidFace'

  readonly BRepFeat_IncParameter: 'BRepFeat_IncParameter'

  readonly BRepFeat_IncTypes: 'BRepFeat_IncTypes'

  readonly BRepFeat_IntervalOverlap: 'BRepFeat_IntervalOverlap'

  readonly BRepFeat_InvFirstShape: 'BRepFeat_InvFirstShape'

  readonly BRepFeat_InvOption: 'BRepFeat_InvOption'

  readonly BRepFeat_InvShape: 'BRepFeat_InvShape'

  readonly BRepFeat_LocOpeNotDone: 'BRepFeat_LocOpeNotDone'

  readonly BRepFeat_LocOpeInvNotDone: 'BRepFeat_LocOpeInvNotDone'

  readonly BRepFeat_NoExtFace: 'BRepFeat_NoExtFace'

  readonly BRepFeat_NoFaceProf: 'BRepFeat_NoFaceProf'

  readonly BRepFeat_NoGluer: 'BRepFeat_NoGluer'

  readonly BRepFeat_NoIntersectF: 'BRepFeat_NoIntersectF'

  readonly BRepFeat_NoIntersectU: 'BRepFeat_NoIntersectU'

  readonly BRepFeat_NoParts: 'BRepFeat_NoParts'

  readonly BRepFeat_NoProjPt: 'BRepFeat_NoProjPt'

  readonly BRepFeat_NotInitialized: 'BRepFeat_NotInitialized'

  readonly BRepFeat_NotYetImplemented: 'BRepFeat_NotYetImplemented'

  readonly BRepFeat_NullRealTool: 'BRepFeat_NullRealTool'

  readonly BRepFeat_NullToolF: 'BRepFeat_NullToolF'

  readonly BRepFeat_NullToolU: 'BRepFeat_NullToolU'
