# libcascade — ShapeFix

22 top-level symbols. Signatures are verbatim typescript.

ShapeFix: declare class ShapeFix

  // ShapeFix.constructor (constructor)
  constructor();

  // ShapeFix.SameParameter (method)
  static SameParameter(shape: TopoDS_Shape, enforce: boolean, preci?: number, theProgress?: Message_ProgressRange, theMsgReg?: ShapeExtend_BasicMsgRegistrator): boolean;

  // ShapeFix.EncodeRegularity (method)
  static EncodeRegularity(shape: TopoDS_Shape, tolang?: number): void;

  // ShapeFix.RemoveSmallEdges (method)
  static RemoveSmallEdges(shape: TopoDS_Shape, Tolerance: number): { returnValue: TopoDS_Shape; context: ShapeBuild_ReShape; [Symbol.dispose](): void };

  // ShapeFix.FixVertexPosition (method)
  static FixVertexPosition(theshape: TopoDS_Shape, theTolerance: number, thecontext: ShapeBuild_ReShape): boolean;

  // ShapeFix.LeastEdgeSize (method)
  static LeastEdgeSize(theshape: TopoDS_Shape): number;

  // ShapeFix.delete (method)
  delete(): void;

  // ShapeFix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_ComposeShell: declare class ShapeFix_ComposeShell extends ShapeFix_Root

  // ShapeFix_ComposeShell.constructor (constructor)
  constructor();

  // ShapeFix_ComposeShell.Init (method)
  Init(Grid: ShapeExtend_CompositeSurface, L: TopLoc_Location, Face: TopoDS_Face, Prec: number): void;

  // ShapeFix_ComposeShell.ClosedMode (method)
  ClosedMode(): boolean;

  // ShapeFix_ComposeShell.Perform (method)
  Perform(): boolean;

  // ShapeFix_ComposeShell.SplitEdges (method)
  SplitEdges(): void;

  // ShapeFix_ComposeShell.Result (method)
  Result(): TopoDS_Shape;

  // ShapeFix_ComposeShell.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeFix_ComposeShell.SetTransferParamTool (method)
  SetTransferParamTool(TransferParam: ShapeAnalysis_TransferParameters): void;

  // ShapeFix_ComposeShell.GetTransferParamTool (method)
  GetTransferParamTool(): ShapeAnalysis_TransferParameters;

  // ShapeFix_ComposeShell.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_ComposeShell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_ComposeShell.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_ComposeShell.delete (method)
  delete(): void;

  // ShapeFix_ComposeShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_Edge: declare class ShapeFix_Edge extends Standard_Transient

  // ShapeFix_Edge.constructor (constructor)
  constructor();

  // ShapeFix_Edge.Projector (method)
  Projector(): ShapeConstruct_ProjectCurveOnSurface;

  // ShapeFix_Edge.FixRemovePCurve (method)
  FixRemovePCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
  FixRemovePCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

  // ShapeFix_Edge.FixRemoveCurve3d (method)
  FixRemoveCurve3d(edge: TopoDS_Edge): boolean;

  // ShapeFix_Edge.FixAddPCurve (method)
  FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, prec: number): boolean;
  FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, prec: number): boolean;
  FixAddPCurve(edge: TopoDS_Edge, face: TopoDS_Face, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;
  FixAddPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, isSeam: boolean, surfana: ShapeAnalysis_Surface, prec: number): boolean;

  // ShapeFix_Edge.FixAddCurve3d (method)
  FixAddCurve3d(edge: TopoDS_Edge): boolean;

  // ShapeFix_Edge.FixVertexTolerance (method)
  FixVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
  FixVertexTolerance(edge: TopoDS_Edge): boolean;

  // ShapeFix_Edge.FixReversed2d (method)
  FixReversed2d(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
  FixReversed2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

  // ShapeFix_Edge.FixSameParameter (method)
  FixSameParameter(edge: TopoDS_Edge, tolerance: number): boolean;
  FixSameParameter(edge: TopoDS_Edge, face: TopoDS_Face, tolerance: number): boolean;

  // ShapeFix_Edge.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeFix_Edge.SetContext (method)
  SetContext(context: ShapeBuild_ReShape): void;

  // ShapeFix_Edge.Context (method)
  Context(): ShapeBuild_ReShape;

  // ShapeFix_Edge.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_Edge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_Edge.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_Edge.delete (method)
  delete(): void;

  // ShapeFix_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_EdgeConnect: declare class ShapeFix_EdgeConnect

  // ShapeFix_EdgeConnect.constructor (constructor)
  constructor();

  // ShapeFix_EdgeConnect.Add (method)
  Add(aFirst: TopoDS_Edge, aSecond: TopoDS_Edge): void;
  Add(aShape: TopoDS_Shape): void;

  // ShapeFix_EdgeConnect.Build (method)
  Build(): void;

  // ShapeFix_EdgeConnect.Clear (method)
  Clear(): void;

  // ShapeFix_EdgeConnect.delete (method)
  delete(): void;

  // ShapeFix_EdgeConnect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_EdgeProjAux: declare class ShapeFix_EdgeProjAux extends Standard_Transient

  // ShapeFix_EdgeProjAux.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face, E: TopoDS_Edge);

  // ShapeFix_EdgeProjAux.Init (method)
  Init(F: TopoDS_Face, E: TopoDS_Edge): void;

  // ShapeFix_EdgeProjAux.Compute (method)
  Compute(preci: number): void;

  // ShapeFix_EdgeProjAux.IsFirstDone (method)
  IsFirstDone(): boolean;

  // ShapeFix_EdgeProjAux.IsLastDone (method)
  IsLastDone(): boolean;

  // ShapeFix_EdgeProjAux.FirstParam (method)
  FirstParam(): number;

  // ShapeFix_EdgeProjAux.LastParam (method)
  LastParam(): number;

  // ShapeFix_EdgeProjAux.IsIso (method)
  IsIso(C: Geom2d_Curve): boolean;

  // ShapeFix_EdgeProjAux.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_EdgeProjAux.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_EdgeProjAux.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_EdgeProjAux.delete (method)
  delete(): void;

  // ShapeFix_EdgeProjAux.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_Face: declare class ShapeFix_Face extends ShapeFix_Root

  // ShapeFix_Face.constructor (constructor)
  constructor();
  constructor(face: TopoDS_Face);

  // ShapeFix_Face.ClearModes (method)
  ClearModes(): void;

  // ShapeFix_Face.Init (method)
  Init(face: TopoDS_Face): void;
  Init(surf: Geom_Surface, preci: number, fwd: boolean): void;
  Init(surf: ShapeAnalysis_Surface, preci: number, fwd: boolean): void;

  // ShapeFix_Face.SetMsgRegistrator (method)
  SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

  // ShapeFix_Face.SetPrecision (method)
  SetPrecision(preci: number): void;

  // ShapeFix_Face.SetMinTolerance (method)
  SetMinTolerance(mintol: number): void;

  // ShapeFix_Face.SetMaxTolerance (method)
  SetMaxTolerance(maxtol: number): void;

  // ShapeFix_Face.FixWireMode (method)
  FixWireMode(): number;

  // ShapeFix_Face.FixOrientationMode (method)
  FixOrientationMode(): number;

  // ShapeFix_Face.FixAddNaturalBoundMode (method)
  FixAddNaturalBoundMode(): number;

  // ShapeFix_Face.FixMissingSeamMode (method)
  FixMissingSeamMode(): number;

  // ShapeFix_Face.FixSmallAreaWireMode (method)
  FixSmallAreaWireMode(): number;

  // ShapeFix_Face.RemoveSmallAreaFaceMode (method)
  RemoveSmallAreaFaceMode(): number;

  // ShapeFix_Face.FixIntersectingWiresMode (method)
  FixIntersectingWiresMode(): number;

  // ShapeFix_Face.FixLoopWiresMode (method)
  FixLoopWiresMode(): number;

  // ShapeFix_Face.FixSplitFaceMode (method)
  FixSplitFaceMode(): number;

  // ShapeFix_Face.AutoCorrectPrecisionMode (method)
  AutoCorrectPrecisionMode(): number;

  // ShapeFix_Face.FixPeriodicDegeneratedMode (method)
  FixPeriodicDegeneratedMode(): number;

  // ShapeFix_Face.Face (method)
  Face(): TopoDS_Face;

  // ShapeFix_Face.Result (method)
  Result(): TopoDS_Shape;

  // ShapeFix_Face.Add (method)
  Add(wire: TopoDS_Wire): void;

  // ShapeFix_Face.Perform (method)
  Perform(theProgress?: Message_ProgressRange): boolean;

  // ShapeFix_Face.FixOrientation (method)
  FixOrientation(): boolean;
  FixOrientation(MapWires: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

  // ShapeFix_Face.FixAddNaturalBound (method)
  FixAddNaturalBound(): boolean;

  // ShapeFix_Face.FixMissingSeam (method)
  FixMissingSeam(): boolean;

  // ShapeFix_Face.FixSmallAreaWire (method)
  FixSmallAreaWire(theIsRemoveSmallFace: boolean): boolean;

  // ShapeFix_Face.FixLoopWire (method)
  FixLoopWire(aResWires: NCollection_Sequence_TopoDS_Shape): boolean;

  // ShapeFix_Face.FixIntersectingWires (method)
  FixIntersectingWires(): boolean;

  // ShapeFix_Face.FixWiresTwoCoincEdges (method)
  FixWiresTwoCoincEdges(): boolean;

  // ShapeFix_Face.FixSplitFace (method)
  FixSplitFace(MapWires: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

  // ShapeFix_Face.FixPeriodicDegenerated (method)
  FixPeriodicDegenerated(): boolean;

  // ShapeFix_Face.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeFix_Face.FixWireTool (method)
  FixWireTool(): ShapeFix_Wire;

  // ShapeFix_Face.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_Face.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_Face.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_Face.delete (method)
  delete(): void;

  // ShapeFix_Face.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_FaceConnect: declare class ShapeFix_FaceConnect

  // ShapeFix_FaceConnect.constructor (constructor)
  constructor();

  // ShapeFix_FaceConnect.Add (method)
  Add(aFirst: TopoDS_Face, aSecond: TopoDS_Face): boolean;

  // ShapeFix_FaceConnect.Build (method)
  Build(shell: TopoDS_Shell, sewtoler: number, fixtoler: number): TopoDS_Shell;

  // ShapeFix_FaceConnect.Clear (method)
  Clear(): void;

  // ShapeFix_FaceConnect.delete (method)
  delete(): void;

  // ShapeFix_FaceConnect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_FixSmallFace: declare class ShapeFix_FixSmallFace extends ShapeFix_Root

  // ShapeFix_FixSmallFace.constructor (constructor)
  constructor();

  // ShapeFix_FixSmallFace.Init (method)
  Init(S: TopoDS_Shape): void;

  // ShapeFix_FixSmallFace.Perform (method)
  Perform(): void;

  // ShapeFix_FixSmallFace.FixSpotFace (method)
  FixSpotFace(): TopoDS_Shape;

  // ShapeFix_FixSmallFace.ReplaceVerticesInCaseOfSpot (method)
  ReplaceVerticesInCaseOfSpot(F: TopoDS_Face, tol: number): boolean;

  // ShapeFix_FixSmallFace.RemoveFacesInCaseOfSpot (method)
  RemoveFacesInCaseOfSpot(F: TopoDS_Face): boolean;

  // ShapeFix_FixSmallFace.FixStripFace (method)
  FixStripFace(wasdone?: boolean): TopoDS_Shape;

  // ShapeFix_FixSmallFace.ReplaceInCaseOfStrip (method)
  ReplaceInCaseOfStrip(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;

  // ShapeFix_FixSmallFace.RemoveFacesInCaseOfStrip (method)
  RemoveFacesInCaseOfStrip(F: TopoDS_Face): boolean;

  // ShapeFix_FixSmallFace.ComputeSharedEdgeForStripFace (method)
  ComputeSharedEdgeForStripFace(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, F1: TopoDS_Face, tol: number): TopoDS_Edge;

  // ShapeFix_FixSmallFace.FixSplitFace (method)
  FixSplitFace(S: TopoDS_Shape): TopoDS_Shape;

  // ShapeFix_FixSmallFace.SplitOneFace (method)
  SplitOneFace(F: TopoDS_Face, theSplittedFaces: TopoDS_Compound): boolean;

  // ShapeFix_FixSmallFace.FixFace (method)
  FixFace(F: TopoDS_Face): TopoDS_Face;

  // ShapeFix_FixSmallFace.FixShape (method)
  FixShape(): TopoDS_Shape;

  // ShapeFix_FixSmallFace.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeFix_FixSmallFace.FixPinFace (method)
  FixPinFace(F: TopoDS_Face): boolean;

  // ShapeFix_FixSmallFace.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_FixSmallFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_FixSmallFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_FixSmallFace.delete (method)
  delete(): void;

  // ShapeFix_FixSmallFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_FixSmallSolid: declare class ShapeFix_FixSmallSolid extends ShapeFix_Root

  // ShapeFix_FixSmallSolid.constructor (constructor)
  constructor();

  // ShapeFix_FixSmallSolid.SetFixMode (method)
  SetFixMode(theMode: number): void;

  // ShapeFix_FixSmallSolid.SetVolumeThreshold (method)
  SetVolumeThreshold(theThreshold?: number): void;

  // ShapeFix_FixSmallSolid.SetWidthFactorThreshold (method)
  SetWidthFactorThreshold(theThreshold?: number): void;

  // ShapeFix_FixSmallSolid.Remove (method)
  Remove(theShape: TopoDS_Shape, theContext: ShapeBuild_ReShape): TopoDS_Shape;

  // ShapeFix_FixSmallSolid.Merge (method)
  Merge(theShape: TopoDS_Shape, theContext: ShapeBuild_ReShape): TopoDS_Shape;

  // ShapeFix_FixSmallSolid.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_FixSmallSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_FixSmallSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_FixSmallSolid.delete (method)
  delete(): void;

  // ShapeFix_FixSmallSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_FreeBounds: declare class ShapeFix_FreeBounds

  // ShapeFix_FreeBounds.constructor (constructor)
  constructor();
  constructor(shape: TopoDS_Shape, closetoler: number, splitclosed: boolean, splitopen: boolean);
  constructor(shape: TopoDS_Shape, sewtoler: number, closetoler: number, splitclosed: boolean, splitopen: boolean);

  // ShapeFix_FreeBounds.GetClosedWires (method)
  GetClosedWires(): TopoDS_Compound;

  // ShapeFix_FreeBounds.GetOpenWires (method)
  GetOpenWires(): TopoDS_Compound;

  // ShapeFix_FreeBounds.GetShape (method)
  GetShape(): TopoDS_Shape;

  // ShapeFix_FreeBounds.delete (method)
  delete(): void;

  // ShapeFix_FreeBounds.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_IntersectionTool: declare class ShapeFix_IntersectionTool

  // ShapeFix_IntersectionTool.constructor (constructor)
  constructor(context: ShapeBuild_ReShape, preci: number, maxtol?: number);

  // ShapeFix_IntersectionTool.Context (method)
  Context(): ShapeBuild_ReShape;

  // ShapeFix_IntersectionTool.SplitEdge (method)
  SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, preci: number): boolean;

  // ShapeFix_IntersectionTool.CutEdge (method)
  CutEdge(edge: TopoDS_Edge, pend: number, cut: number, face: TopoDS_Face, iscutline?: boolean): { returnValue: boolean; iscutline: boolean };

  // ShapeFix_IntersectionTool.FixSelfIntersectWire (method)
  FixSelfIntersectWire(face: TopoDS_Face, NbSplit?: number, NbCut?: number, NbRemoved?: number): { returnValue: boolean; sewd: ShapeExtend_WireData; NbSplit: number; NbCut: number; NbRemoved: number; [Symbol.dispose](): void };

  // ShapeFix_IntersectionTool.FixIntersectingWires (method)
  FixIntersectingWires(face: TopoDS_Face): boolean;

  // ShapeFix_IntersectionTool.delete (method)
  delete(): void;

  // ShapeFix_IntersectionTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_Root: declare class ShapeFix_Root extends Standard_Transient

  // ShapeFix_Root.constructor (constructor)
  constructor();

  // ShapeFix_Root.Set (method)
  Set(Root: ShapeFix_Root): void;

  // ShapeFix_Root.SetContext (method)
  SetContext(context: ShapeBuild_ReShape): void;

  // ShapeFix_Root.Context (method)
  Context(): ShapeBuild_ReShape;

  // ShapeFix_Root.SetMsgRegistrator (method)
  SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

  // ShapeFix_Root.MsgRegistrator (method)
  MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

  // ShapeFix_Root.SetPrecision (method)
  SetPrecision(preci: number): void;

  // ShapeFix_Root.Precision (method)
  Precision(): number;

  // ShapeFix_Root.SetMinTolerance (method)
  SetMinTolerance(mintol: number): void;

  // ShapeFix_Root.MinTolerance (method)
  MinTolerance(): number;

  // ShapeFix_Root.SetMaxTolerance (method)
  SetMaxTolerance(maxtol: number): void;

  // ShapeFix_Root.MaxTolerance (method)
  MaxTolerance(): number;

  // ShapeFix_Root.LimitTolerance (method)
  LimitTolerance(toler: number): number;

  // ShapeFix_Root.SendMsg (method)
  SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
  SendMsg(message: Message_Msg, gravity: Message_Gravity): void;

  // ShapeFix_Root.SendWarning (method)
  SendWarning(shape: TopoDS_Shape, message: Message_Msg): void;
  SendWarning(message: Message_Msg): void;

  // ShapeFix_Root.SendFail (method)
  SendFail(shape: TopoDS_Shape, message: Message_Msg): void;
  SendFail(message: Message_Msg): void;

  // ShapeFix_Root.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_Root.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_Root.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_Root.delete (method)
  delete(): void;

  // ShapeFix_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_Shape: declare class ShapeFix_Shape extends ShapeFix_Root

  // ShapeFix_Shape.constructor (constructor)
  constructor();
  constructor(shape: TopoDS_Shape);

  // ShapeFix_Shape.Init (method)
  Init(shape: TopoDS_Shape): void;

  // ShapeFix_Shape.Perform (method)
  Perform(theProgress?: Message_ProgressRange): boolean;

  // ShapeFix_Shape.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeFix_Shape.FixSolidTool (method)
  FixSolidTool(): ShapeFix_Solid;

  // ShapeFix_Shape.FixShellTool (method)
  FixShellTool(): ShapeFix_Shell;

  // ShapeFix_Shape.FixFaceTool (method)
  FixFaceTool(): ShapeFix_Face;

  // ShapeFix_Shape.FixWireTool (method)
  FixWireTool(): ShapeFix_Wire;

  // ShapeFix_Shape.FixEdgeTool (method)
  FixEdgeTool(): ShapeFix_Edge;

  // ShapeFix_Shape.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeFix_Shape.SetMsgRegistrator (method)
  SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

  // ShapeFix_Shape.SetPrecision (method)
  SetPrecision(preci: number): void;

  // ShapeFix_Shape.SetMinTolerance (method)
  SetMinTolerance(mintol: number): void;

  // ShapeFix_Shape.SetMaxTolerance (method)
  SetMaxTolerance(maxtol: number): void;

  // ShapeFix_Shape.FixSolidMode (method)
  FixSolidMode(): number;

  // ShapeFix_Shape.FixFreeShellMode (method)
  FixFreeShellMode(): number;

  // ShapeFix_Shape.FixFreeFaceMode (method)
  FixFreeFaceMode(): number;

  // ShapeFix_Shape.FixFreeWireMode (method)
  FixFreeWireMode(): number;

  // ShapeFix_Shape.FixSameParameterMode (method)
  FixSameParameterMode(): number;

  // ShapeFix_Shape.FixVertexPositionMode (method)
  FixVertexPositionMode(): number;

  // ShapeFix_Shape.FixVertexTolMode (method)
  FixVertexTolMode(): number;

  // ShapeFix_Shape.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_Shape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_Shape.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_Shape.delete (method)
  delete(): void;

  // ShapeFix_Shape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_ShapeTolerance: declare class ShapeFix_ShapeTolerance

  // ShapeFix_ShapeTolerance.constructor (constructor)
  constructor();

  // ShapeFix_ShapeTolerance.LimitTolerance (method)
  LimitTolerance(shape: TopoDS_Shape, tmin: number, tmax?: number, styp?: TopAbs_ShapeEnum): boolean;

  // ShapeFix_ShapeTolerance.SetTolerance (method)
  SetTolerance(shape: TopoDS_Shape, preci: number, styp?: TopAbs_ShapeEnum): void;

  // ShapeFix_ShapeTolerance.delete (method)
  delete(): void;

  // ShapeFix_ShapeTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_Shell: declare class ShapeFix_Shell extends ShapeFix_Root

  // ShapeFix_Shell.constructor (constructor)
  constructor();
  constructor(shape: TopoDS_Shell);

  // ShapeFix_Shell.Init (method)
  Init(shell: TopoDS_Shell): void;

  // ShapeFix_Shell.Perform (method)
  Perform(theProgress?: Message_ProgressRange): boolean;

  // ShapeFix_Shell.FixFaceOrientation (method)
  FixFaceOrientation(shell: TopoDS_Shell, isAccountMultiConex?: boolean, NonManifold?: boolean): boolean;

  // ShapeFix_Shell.Shell (method)
  Shell(): TopoDS_Shell;

  // ShapeFix_Shell.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeFix_Shell.NbShells (method)
  NbShells(): number;

  // ShapeFix_Shell.ErrorFaces (method)
  ErrorFaces(): TopoDS_Compound;

  // ShapeFix_Shell.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeFix_Shell.FixFaceTool (method)
  FixFaceTool(): ShapeFix_Face;

  // ShapeFix_Shell.SetMsgRegistrator (method)
  SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

  // ShapeFix_Shell.SetPrecision (method)
  SetPrecision(preci: number): void;

  // ShapeFix_Shell.SetMinTolerance (method)
  SetMinTolerance(mintol: number): void;

  // ShapeFix_Shell.SetMaxTolerance (method)
  SetMaxTolerance(maxtol: number): void;

  // ShapeFix_Shell.FixFaceMode (method)
  FixFaceMode(): number;

  // ShapeFix_Shell.FixOrientationMode (method)
  FixOrientationMode(): number;

  // ShapeFix_Shell.SetNonManifoldFlag (method)
  SetNonManifoldFlag(isNonManifold: boolean): void;

  // ShapeFix_Shell.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_Shell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_Shell.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_Shell.delete (method)
  delete(): void;

  // ShapeFix_Shell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_Solid: declare class ShapeFix_Solid extends ShapeFix_Root

  // ShapeFix_Solid.constructor (constructor)
  constructor();
  constructor(solid: TopoDS_Solid);

  // ShapeFix_Solid.Init (method)
  Init(solid: TopoDS_Solid): void;

  // ShapeFix_Solid.Perform (method)
  Perform(theProgress?: Message_ProgressRange): boolean;

  // ShapeFix_Solid.SolidFromShell (method)
  SolidFromShell(shell: TopoDS_Shell): TopoDS_Solid;

  // ShapeFix_Solid.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeFix_Solid.Solid (method)
  Solid(): TopoDS_Shape;

  // ShapeFix_Solid.FixShellTool (method)
  FixShellTool(): ShapeFix_Shell;

  // ShapeFix_Solid.SetMsgRegistrator (method)
  SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

  // ShapeFix_Solid.SetPrecision (method)
  SetPrecision(preci: number): void;

  // ShapeFix_Solid.SetMinTolerance (method)
  SetMinTolerance(mintol: number): void;

  // ShapeFix_Solid.SetMaxTolerance (method)
  SetMaxTolerance(maxtol: number): void;

  // ShapeFix_Solid.FixShellMode (method)
  FixShellMode(): number;

  // ShapeFix_Solid.FixShellOrientationMode (method)
  FixShellOrientationMode(): number;

  // ShapeFix_Solid.CreateOpenSolidMode (method)
  CreateOpenSolidMode(): boolean;

  // ShapeFix_Solid.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeFix_Solid.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_Solid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_Solid.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_Solid.delete (method)
  delete(): void;

  // ShapeFix_Solid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_SplitCommonVertex: declare class ShapeFix_SplitCommonVertex extends ShapeFix_Root

  // ShapeFix_SplitCommonVertex.constructor (constructor)
  constructor();

  // ShapeFix_SplitCommonVertex.Init (method)
  Init(S: TopoDS_Shape): void;

  // ShapeFix_SplitCommonVertex.Perform (method)
  Perform(): void;

  // ShapeFix_SplitCommonVertex.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeFix_SplitCommonVertex.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_SplitCommonVertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_SplitCommonVertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_SplitCommonVertex.delete (method)
  delete(): void;

  // ShapeFix_SplitCommonVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_SplitTool: declare class ShapeFix_SplitTool

  // ShapeFix_SplitTool.constructor (constructor)
  constructor();

  // ShapeFix_SplitTool.SplitEdge (method)
  SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
  SplitEdge(edge: TopoDS_Edge, param1: number, param2: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
  SplitEdge(edge: TopoDS_Edge, fp: number, V1: TopoDS_Vertex, lp: number, V2: TopoDS_Vertex, face: TopoDS_Face, SeqE: NCollection_Sequence_TopoDS_Shape, aNum: number, context: ShapeBuild_ReShape, tol3d: number, tol2d: number): { returnValue: boolean; aNum: number };

  // ShapeFix_SplitTool.CutEdge (method)
  CutEdge(edge: TopoDS_Edge, pend: number, cut: number, face: TopoDS_Face, iscutline?: boolean): { returnValue: boolean; iscutline: boolean };

  // ShapeFix_SplitTool.delete (method)
  delete(): void;

  // ShapeFix_SplitTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_Wire: declare class ShapeFix_Wire extends ShapeFix_Root

  // ShapeFix_Wire.constructor (constructor)
  constructor();
  constructor(wire: TopoDS_Wire, face: TopoDS_Face, prec: number);

  // ShapeFix_Wire.ClearModes (method)
  ClearModes(): void;

  // ShapeFix_Wire.ClearStatuses (method)
  ClearStatuses(): void;

  // ShapeFix_Wire.Init (method)
  Init(wire: TopoDS_Wire, face: TopoDS_Face, prec: number): void;
  Init(saw: ShapeAnalysis_Wire): void;

  // ShapeFix_Wire.Load (method)
  Load(wire: TopoDS_Wire): void;
  Load(sbwd: ShapeExtend_WireData): void;

  // ShapeFix_Wire.SetFace (method)
  SetFace(face: TopoDS_Face): void;
  SetFace(theFace: TopoDS_Face, theSurfaceAnalysis: ShapeAnalysis_Surface): void;

  // ShapeFix_Wire.SetSurface (method)
  SetSurface(theSurfaceAnalysis: ShapeAnalysis_Surface): void;
  SetSurface(surf: Geom_Surface): void;
  SetSurface(surf: Geom_Surface, loc: TopLoc_Location): void;

  // ShapeFix_Wire.SetPrecision (method)
  SetPrecision(preci: number): void;

  // ShapeFix_Wire.SetMaxTailAngle (method)
  SetMaxTailAngle(theMaxTailAngle: number): void;

  // ShapeFix_Wire.SetMaxTailWidth (method)
  SetMaxTailWidth(theMaxTailWidth: number): void;

  // ShapeFix_Wire.IsLoaded (method)
  IsLoaded(): boolean;

  // ShapeFix_Wire.IsReady (method)
  IsReady(): boolean;

  // ShapeFix_Wire.NbEdges (method)
  NbEdges(): number;

  // ShapeFix_Wire.Wire (method)
  Wire(): TopoDS_Wire;

  // ShapeFix_Wire.WireAPIMake (method)
  WireAPIMake(): TopoDS_Wire;

  // ShapeFix_Wire.Analyzer (method)
  Analyzer(): ShapeAnalysis_Wire;

  // ShapeFix_Wire.WireData (method)
  WireData(): ShapeExtend_WireData;

  // ShapeFix_Wire.Face (method)
  Face(): TopoDS_Face;

  // ShapeFix_Wire.ModifyTopologyMode (method)
  ModifyTopologyMode(): boolean;

  // ShapeFix_Wire.ModifyGeometryMode (method)
  ModifyGeometryMode(): boolean;

  // ShapeFix_Wire.ModifyRemoveLoopMode (method)
  ModifyRemoveLoopMode(): number;

  // ShapeFix_Wire.ClosedWireMode (method)
  ClosedWireMode(): boolean;

  // ShapeFix_Wire.PreferencePCurveMode (method)
  PreferencePCurveMode(): boolean;

  // ShapeFix_Wire.FixGapsByRangesMode (method)
  FixGapsByRangesMode(): boolean;

  // ShapeFix_Wire.FixReorderMode (method)
  FixReorderMode(): number;

  // ShapeFix_Wire.FixSmallMode (method)
  FixSmallMode(): number;

  // ShapeFix_Wire.FixConnectedMode (method)
  FixConnectedMode(): number;

  // ShapeFix_Wire.FixEdgeCurvesMode (method)
  FixEdgeCurvesMode(): number;

  // ShapeFix_Wire.FixDegeneratedMode (method)
  FixDegeneratedMode(): number;

  // ShapeFix_Wire.FixSelfIntersectionMode (method)
  FixSelfIntersectionMode(): number;

  // ShapeFix_Wire.FixLackingMode (method)
  FixLackingMode(): number;

  // ShapeFix_Wire.FixGaps3dMode (method)
  FixGaps3dMode(): number;

  // ShapeFix_Wire.FixGaps2dMode (method)
  FixGaps2dMode(): number;

  // ShapeFix_Wire.FixReversed2dMode (method)
  FixReversed2dMode(): number;

  // ShapeFix_Wire.FixRemovePCurveMode (method)
  FixRemovePCurveMode(): number;

  // ShapeFix_Wire.FixAddPCurveMode (method)
  FixAddPCurveMode(): number;

  // ShapeFix_Wire.FixRemoveCurve3dMode (method)
  FixRemoveCurve3dMode(): number;

  // ShapeFix_Wire.FixAddCurve3dMode (method)
  FixAddCurve3dMode(): number;

  // ShapeFix_Wire.FixSeamMode (method)
  FixSeamMode(): number;

  // ShapeFix_Wire.FixShiftedMode (method)
  FixShiftedMode(): number;

  // ShapeFix_Wire.FixSameParameterMode (method)
  FixSameParameterMode(): number;

  // ShapeFix_Wire.FixVertexToleranceMode (method)
  FixVertexToleranceMode(): number;

  // ShapeFix_Wire.FixNotchedEdgesMode (method)
  FixNotchedEdgesMode(): number;

  // ShapeFix_Wire.FixSelfIntersectingEdgeMode (method)
  FixSelfIntersectingEdgeMode(): number;

  // ShapeFix_Wire.FixIntersectingEdgesMode (method)
  FixIntersectingEdgesMode(): number;

  // ShapeFix_Wire.FixNonAdjacentIntersectingEdgesMode (method)
  FixNonAdjacentIntersectingEdgesMode(): number;

  // ShapeFix_Wire.FixTailMode (method)
  FixTailMode(): number;

  // ShapeFix_Wire.Perform (method)
  Perform(theProgress?: Message_ProgressRange): boolean;

  // ShapeFix_Wire.FixReorder (method)
  FixReorder(theModeBoth: boolean): boolean;
  FixReorder(wi: ShapeAnalysis_WireOrder): boolean;

  // ShapeFix_Wire.FixSmall (method)
  FixSmall(lockvtx: boolean, precsmall: number): number;
  FixSmall(num: number, lockvtx: boolean, precsmall: number): boolean;

  // ShapeFix_Wire.FixConnected (method)
  FixConnected(prec: number): boolean;
  FixConnected(num: number, prec: number, theUpdateWire: boolean): boolean;

  // ShapeFix_Wire.FixEdgeCurves (method)
  FixEdgeCurves(): boolean;

  // ShapeFix_Wire.FixDegenerated (method)
  FixDegenerated(): boolean;
  FixDegenerated(num: number): boolean;

  // ShapeFix_Wire.FixSelfIntersection (method)
  FixSelfIntersection(): boolean;

  // ShapeFix_Wire.FixLacking (method)
  FixLacking(force: boolean): boolean;
  FixLacking(num: number, force: boolean): boolean;

  // ShapeFix_Wire.FixClosed (method)
  FixClosed(prec?: number): boolean;

  // ShapeFix_Wire.FixGaps3d (method)
  FixGaps3d(): boolean;

  // ShapeFix_Wire.FixGaps2d (method)
  FixGaps2d(): boolean;

  // ShapeFix_Wire.FixSeam (method)
  FixSeam(num: number): boolean;

  // ShapeFix_Wire.FixShifted (method)
  FixShifted(): boolean;

  // ShapeFix_Wire.FixNotchedEdges (method)
  FixNotchedEdges(): boolean;

  // ShapeFix_Wire.FixGap3d (method)
  FixGap3d(num: number, convert?: boolean): boolean;

  // ShapeFix_Wire.FixGap2d (method)
  FixGap2d(num: number, convert?: boolean): boolean;

  // ShapeFix_Wire.FixTails (method)
  FixTails(): boolean;

  // ShapeFix_Wire.StatusReorder (method)
  StatusReorder(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusSmall (method)
  StatusSmall(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusConnected (method)
  StatusConnected(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusEdgeCurves (method)
  StatusEdgeCurves(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusDegenerated (method)
  StatusDegenerated(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusSelfIntersection (method)
  StatusSelfIntersection(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusLacking (method)
  StatusLacking(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusClosed (method)
  StatusClosed(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusGaps3d (method)
  StatusGaps3d(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusGaps2d (method)
  StatusGaps2d(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusNotches (method)
  StatusNotches(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.StatusRemovedSegment (method)
  StatusRemovedSegment(): boolean;

  // ShapeFix_Wire.StatusFixTails (method)
  StatusFixTails(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.LastFixStatus (method)
  LastFixStatus(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wire.FixEdgeTool (method)
  FixEdgeTool(): ShapeFix_Edge;

  // ShapeFix_Wire.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_Wire.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_Wire.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_Wire.delete (method)
  delete(): void;

  // ShapeFix_Wire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_WireVertex: declare class ShapeFix_WireVertex

  // ShapeFix_WireVertex.constructor (constructor)
  constructor();

  // ShapeFix_WireVertex.Init (method)
  Init(sawv: ShapeAnalysis_WireVertex): void;
  Init(wire: TopoDS_Wire, preci: number): void;
  Init(sbwd: ShapeExtend_WireData, preci: number): void;

  // ShapeFix_WireVertex.Analyzer (method)
  Analyzer(): ShapeAnalysis_WireVertex;

  // ShapeFix_WireVertex.WireData (method)
  WireData(): ShapeExtend_WireData;

  // ShapeFix_WireVertex.Wire (method)
  Wire(): TopoDS_Wire;

  // ShapeFix_WireVertex.FixSame (method)
  FixSame(): number;

  // ShapeFix_WireVertex.Fix (method)
  Fix(): number;

  // ShapeFix_WireVertex.delete (method)
  delete(): void;

  // ShapeFix_WireVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_Wireframe: declare class ShapeFix_Wireframe extends ShapeFix_Root

  // ShapeFix_Wireframe.constructor (constructor)
  constructor();
  constructor(shape: TopoDS_Shape);

  // ShapeFix_Wireframe.ClearStatuses (method)
  ClearStatuses(): void;

  // ShapeFix_Wireframe.Load (method)
  Load(shape: TopoDS_Shape): void;

  // ShapeFix_Wireframe.FixWireGaps (method)
  FixWireGaps(): boolean;

  // ShapeFix_Wireframe.FixSmallEdges (method)
  FixSmallEdges(): boolean;

  // ShapeFix_Wireframe.CheckSmallEdges (method)
  CheckSmallEdges(theSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theEdgeToFaces: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theFaceWithSmall: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theMultyEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher): boolean;

  // ShapeFix_Wireframe.MergeSmallEdges (method)
  MergeSmallEdges(theSmallEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theEdgeToFaces: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theFaceWithSmall: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theMultyEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theModeDrop: boolean, theLimitAngle: number): boolean;

  // ShapeFix_Wireframe.StatusWireGaps (method)
  StatusWireGaps(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wireframe.StatusSmallEdges (method)
  StatusSmallEdges(status: ShapeExtend_Status): boolean;

  // ShapeFix_Wireframe.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeFix_Wireframe.ModeDropSmallEdges (method)
  ModeDropSmallEdges(): boolean;

  // ShapeFix_Wireframe.SetLimitAngle (method)
  SetLimitAngle(theLimitAngle: number): void;

  // ShapeFix_Wireframe.LimitAngle (method)
  LimitAngle(): number;

  // ShapeFix_Wireframe.get_type_name (method)
  static get_type_name(): string;

  // ShapeFix_Wireframe.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeFix_Wireframe.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeFix_Wireframe.delete (method)
  delete(): void;

  // ShapeFix_Wireframe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeFix_SequenceOfWireSegment: NCollection_Sequence_ShapeFix_WireSegment
