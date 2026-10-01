# libcascade — BRepOffsetAPI

12 top-level symbols. Signatures are verbatim typescript.

BRepOffsetAPI_DraftAngle: declare class BRepOffsetAPI_DraftAngle extends BRepBuilderAPI_ModifyShape

  // BRepOffsetAPI_DraftAngle.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // BRepOffsetAPI_DraftAngle.Clear (method)
  Clear(): void;

  // BRepOffsetAPI_DraftAngle.Init (method)
  Init(S: TopoDS_Shape): void;

  // BRepOffsetAPI_DraftAngle.Add (method)
  Add(F: TopoDS_Face, Direction: gp_Dir, Angle: number, NeutralPlane: gp_Pln, Flag?: boolean): void;

  // BRepOffsetAPI_DraftAngle.AddDone (method)
  AddDone(): boolean;

  // BRepOffsetAPI_DraftAngle.Remove (method)
  Remove(F: TopoDS_Face): void;

  // BRepOffsetAPI_DraftAngle.ProblematicShape (method)
  ProblematicShape(): TopoDS_Shape;

  // BRepOffsetAPI_DraftAngle.Status (method)
  Status(): Draft_ErrorStatus;

  // BRepOffsetAPI_DraftAngle.ConnectedFaces (method)
  ConnectedFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_DraftAngle.ModifiedFaces (method)
  ModifiedFaces(): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_DraftAngle.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_DraftAngle.CorrectWires (method)
  CorrectWires(): void;

  // BRepOffsetAPI_DraftAngle.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_DraftAngle.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_DraftAngle.ModifiedShape (method)
  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  // BRepOffsetAPI_DraftAngle.delete (method)
  delete(): void;

  // BRepOffsetAPI_DraftAngle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MakeDraft: declare class BRepOffsetAPI_MakeDraft extends BRepBuilderAPI_MakeShape

  // BRepOffsetAPI_MakeDraft.constructor (constructor)
  constructor(Shape: TopoDS_Shape, Dir: gp_Dir, Angle: number);

  // BRepOffsetAPI_MakeDraft.SetOptions (method)
  SetOptions(Style?: BRepBuilderAPI_TransitionMode, AngleMin?: number, AngleMax?: number): void;

  // BRepOffsetAPI_MakeDraft.SetDraft (method)
  SetDraft(IsInternal?: boolean): void;

  // BRepOffsetAPI_MakeDraft.Perform (method)
  Perform(LengthMax: number): void;
  Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
  Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;

  // BRepOffsetAPI_MakeDraft.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepOffsetAPI_MakeDraft.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_MakeDraft.delete (method)
  delete(): void;

  // BRepOffsetAPI_MakeDraft.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MakeEvolved: declare class BRepOffsetAPI_MakeEvolved extends BRepBuilderAPI_MakeShape

  // BRepOffsetAPI_MakeEvolved.constructor (constructor)
  constructor();
  constructor(theSpine: TopoDS_Shape, theProfile: TopoDS_Wire, theJoinType?: GeomAbs_JoinType, theIsAxeProf?: boolean, theIsSolid?: boolean, theIsProfOnSpine?: boolean, theTol?: number, theIsVolume?: boolean, theRunInParallel?: boolean);

  // BRepOffsetAPI_MakeEvolved.Evolved (method)
  Evolved(): BRepFill_Evolved;

  // BRepOffsetAPI_MakeEvolved.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakeEvolved.GeneratedShapes (method)
  GeneratedShapes(SpineShape: TopoDS_Shape, ProfShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_MakeEvolved.Top (method)
  Top(): TopoDS_Shape;

  // BRepOffsetAPI_MakeEvolved.Bottom (method)
  Bottom(): TopoDS_Shape;

  // BRepOffsetAPI_MakeEvolved.delete (method)
  delete(): void;

  // BRepOffsetAPI_MakeEvolved.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MakeFilling: declare class BRepOffsetAPI_MakeFilling extends BRepBuilderAPI_MakeShape

  // BRepOffsetAPI_MakeFilling.constructor (constructor)
  constructor(Degree?: number, NbPtsOnCur?: number, NbIter?: number, Anisotropie?: boolean, Tol2d?: number, Tol3d?: number, TolAng?: number, TolCurv?: number, MaxDeg?: number, MaxSegments?: number);

  // BRepOffsetAPI_MakeFilling.SetConstrParam (method)
  SetConstrParam(Tol2d?: number, Tol3d?: number, TolAng?: number, TolCurv?: number): void;

  // BRepOffsetAPI_MakeFilling.SetResolParam (method)
  SetResolParam(Degree?: number, NbPtsOnCur?: number, NbIter?: number, Anisotropie?: boolean): void;

  // BRepOffsetAPI_MakeFilling.SetApproxParam (method)
  SetApproxParam(MaxDeg?: number, MaxSegments?: number): void;

  // BRepOffsetAPI_MakeFilling.LoadInitSurface (method)
  LoadInitSurface(Surf: TopoDS_Face): void;

  // BRepOffsetAPI_MakeFilling.Add (method)
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;

  // BRepOffsetAPI_MakeFilling.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakeFilling.IsDone (method)
  IsDone(): boolean;

  // BRepOffsetAPI_MakeFilling.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_MakeFilling.G0Error (method)
  G0Error(): number;
  G0Error(Index: number): number;

  // BRepOffsetAPI_MakeFilling.G1Error (method)
  G1Error(): number;
  G1Error(Index: number): number;

  // BRepOffsetAPI_MakeFilling.G2Error (method)
  G2Error(): number;
  G2Error(Index: number): number;

  // BRepOffsetAPI_MakeFilling.delete (method)
  delete(): void;

  // BRepOffsetAPI_MakeFilling.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MakeOffset: declare class BRepOffsetAPI_MakeOffset extends BRepBuilderAPI_MakeShape

  // BRepOffsetAPI_MakeOffset.constructor (constructor)
  constructor();
  constructor(Spine: TopoDS_Face, Join?: GeomAbs_JoinType, IsOpenResult?: boolean);
  constructor(Spine: TopoDS_Wire, Join?: GeomAbs_JoinType, IsOpenResult?: boolean);

  // BRepOffsetAPI_MakeOffset.Init (method)
  Init(Spine: TopoDS_Face, Join: GeomAbs_JoinType, IsOpenResult: boolean): void;
  Init(Join: GeomAbs_JoinType, IsOpenResult: boolean): void;

  // BRepOffsetAPI_MakeOffset.SetApprox (method)
  SetApprox(ToApprox: boolean): void;

  // BRepOffsetAPI_MakeOffset.AddWire (method)
  AddWire(Spine: TopoDS_Wire): void;

  // BRepOffsetAPI_MakeOffset.Perform (method)
  Perform(Offset: number, Alt?: number): void;

  // BRepOffsetAPI_MakeOffset.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakeOffset.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_MakeOffset.ConvertFace (method)
  static ConvertFace(theFace: TopoDS_Face, theAngleTolerance: number): TopoDS_Face;

  // BRepOffsetAPI_MakeOffset.delete (method)
  delete(): void;

  // BRepOffsetAPI_MakeOffset.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MakeOffsetShape: declare class BRepOffsetAPI_MakeOffsetShape extends BRepBuilderAPI_MakeShape

  // BRepOffsetAPI_MakeOffsetShape.constructor (constructor)
  constructor();

  // BRepOffsetAPI_MakeOffsetShape.PerformBySimple (method)
  PerformBySimple(theS: TopoDS_Shape, theOffsetValue: number): void;

  // BRepOffsetAPI_MakeOffsetShape.PerformByJoin (method)
  PerformByJoin(S: TopoDS_Shape, Offset: number, Tol: number, Mode?: BRepOffset_Mode, Intersection?: boolean, SelfInter?: boolean, Join?: GeomAbs_JoinType, RemoveIntEdges?: boolean, theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakeOffsetShape.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakeOffsetShape.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_MakeOffsetShape.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_MakeOffsetShape.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepOffsetAPI_MakeOffsetShape.GetJoinType (method)
  GetJoinType(): GeomAbs_JoinType;

  // BRepOffsetAPI_MakeOffsetShape.delete (method)
  delete(): void;

  // BRepOffsetAPI_MakeOffsetShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MakePipe: declare class BRepOffsetAPI_MakePipe extends BRepPrimAPI_MakeSweep

  // BRepOffsetAPI_MakePipe.constructor (constructor)
  constructor(Spine: TopoDS_Wire, Profile: TopoDS_Shape);
  constructor(Spine: TopoDS_Wire, Profile: TopoDS_Shape, aMode: GeomFill_Trihedron, ForceApproxC1?: boolean);

  // BRepOffsetAPI_MakePipe.Pipe (method)
  Pipe(): BRepFill_Pipe;

  // BRepOffsetAPI_MakePipe.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakePipe.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // BRepOffsetAPI_MakePipe.LastShape (method)
  LastShape(): TopoDS_Shape;

  // BRepOffsetAPI_MakePipe.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  Generated(SSpine: TopoDS_Shape, SProfile: TopoDS_Shape): TopoDS_Shape;

  // BRepOffsetAPI_MakePipe.ErrorOnSurface (method)
  ErrorOnSurface(): number;

  // BRepOffsetAPI_MakePipe.delete (method)
  delete(): void;

  // BRepOffsetAPI_MakePipe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MakePipeShell: declare class BRepOffsetAPI_MakePipeShell extends BRepPrimAPI_MakeSweep

  // BRepOffsetAPI_MakePipeShell.constructor (constructor)
  constructor(Spine: TopoDS_Wire);

  // BRepOffsetAPI_MakePipeShell.SetMode (method)
  SetMode(IsFrenet: boolean): void;
  SetMode(Axe: gp_Ax2): void;
  SetMode(BiNormal: gp_Dir): void;
  SetMode(SpineSupport: TopoDS_Shape): boolean;
  SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;

  // BRepOffsetAPI_MakePipeShell.SetDiscreteMode (method)
  SetDiscreteMode(): void;

  // BRepOffsetAPI_MakePipeShell.Add (method)
  Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

  // BRepOffsetAPI_MakePipeShell.SetLaw (method)
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

  // BRepOffsetAPI_MakePipeShell.Delete (method)
  Delete(Profile: TopoDS_Shape): void;

  // BRepOffsetAPI_MakePipeShell.IsReady (method)
  IsReady(): boolean;

  // BRepOffsetAPI_MakePipeShell.GetStatus (method)
  GetStatus(): BRepBuilderAPI_PipeError;

  // BRepOffsetAPI_MakePipeShell.SetTolerance (method)
  SetTolerance(Tol3d?: number, BoundTol?: number, TolAngular?: number): void;

  // BRepOffsetAPI_MakePipeShell.SetMaxDegree (method)
  SetMaxDegree(NewMaxDegree: number): void;

  // BRepOffsetAPI_MakePipeShell.SetMaxSegments (method)
  SetMaxSegments(NewMaxSegments: number): void;

  // BRepOffsetAPI_MakePipeShell.SetForceApproxC1 (method)
  SetForceApproxC1(ForceApproxC1: boolean): void;

  // BRepOffsetAPI_MakePipeShell.SetTransitionMode (method)
  SetTransitionMode(Mode?: BRepBuilderAPI_TransitionMode): void;

  // BRepOffsetAPI_MakePipeShell.Simulate (method)
  Simulate(NumberOfSection: number, Result: NCollection_List_TopoDS_Shape): void;

  // BRepOffsetAPI_MakePipeShell.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakePipeShell.MakeSolid (method)
  MakeSolid(): boolean;

  // BRepOffsetAPI_MakePipeShell.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // BRepOffsetAPI_MakePipeShell.LastShape (method)
  LastShape(): TopoDS_Shape;

  // BRepOffsetAPI_MakePipeShell.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_MakePipeShell.ErrorOnSurface (method)
  ErrorOnSurface(): number;

  // BRepOffsetAPI_MakePipeShell.SetIsBuildHistory (method)
  SetIsBuildHistory(theIsBuildHistory: boolean): void;

  // BRepOffsetAPI_MakePipeShell.IsBuildHistory (method)
  IsBuildHistory(): boolean;

  // BRepOffsetAPI_MakePipeShell.Profiles (method)
  Profiles(theProfiles: NCollection_List_TopoDS_Shape): void;

  // BRepOffsetAPI_MakePipeShell.Spine (method)
  Spine(): TopoDS_Wire;

  // BRepOffsetAPI_MakePipeShell.delete (method)
  delete(): void;

  // BRepOffsetAPI_MakePipeShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MakeThickSolid: declare class BRepOffsetAPI_MakeThickSolid extends BRepOffsetAPI_MakeOffsetShape

  // BRepOffsetAPI_MakeThickSolid.constructor (constructor)
  constructor();

  // BRepOffsetAPI_MakeThickSolid.MakeThickSolidBySimple (method)
  MakeThickSolidBySimple(theS: TopoDS_Shape, theOffsetValue: number): void;

  // BRepOffsetAPI_MakeThickSolid.MakeThickSolidByJoin (method)
  MakeThickSolidByJoin(S: TopoDS_Shape, ClosingFaces: NCollection_List_TopoDS_Shape, Offset: number, Tol: number, Mode?: BRepOffset_Mode, Intersection?: boolean, SelfInter?: boolean, Join?: GeomAbs_JoinType, RemoveIntEdges?: boolean, theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakeThickSolid.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MakeThickSolid.Modified (method)
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_MakeThickSolid.delete (method)
  delete(): void;

  // BRepOffsetAPI_MakeThickSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_MiddlePath: declare class BRepOffsetAPI_MiddlePath extends BRepBuilderAPI_MakeShape

  // BRepOffsetAPI_MiddlePath.constructor (constructor)
  constructor(aShape: TopoDS_Shape, StartShape: TopoDS_Shape, EndShape: TopoDS_Shape);

  // BRepOffsetAPI_MiddlePath.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_MiddlePath.delete (method)
  delete(): void;

  // BRepOffsetAPI_MiddlePath.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_NormalProjection: declare class BRepOffsetAPI_NormalProjection extends BRepBuilderAPI_MakeShape

  // BRepOffsetAPI_NormalProjection.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape);

  // BRepOffsetAPI_NormalProjection.Init (method)
  Init(S: TopoDS_Shape): void;

  // BRepOffsetAPI_NormalProjection.Add (method)
  Add(ToProj: TopoDS_Shape): void;

  // BRepOffsetAPI_NormalProjection.SetParams (method)
  SetParams(Tol3D: number, Tol2D: number, InternalContinuity: GeomAbs_Shape, MaxDegree: number, MaxSeg: number): void;

  // BRepOffsetAPI_NormalProjection.SetMaxDistance (method)
  SetMaxDistance(MaxDist: number): void;

  // BRepOffsetAPI_NormalProjection.SetLimit (method)
  SetLimit(FaceBoundaries?: boolean): void;

  // BRepOffsetAPI_NormalProjection.Compute3d (method)
  Compute3d(With3d?: boolean): void;

  // BRepOffsetAPI_NormalProjection.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_NormalProjection.IsDone (method)
  IsDone(): boolean;

  // BRepOffsetAPI_NormalProjection.Projection (method)
  Projection(): TopoDS_Shape;

  // BRepOffsetAPI_NormalProjection.Couple (method)
  Couple(E: TopoDS_Edge): TopoDS_Shape;

  // BRepOffsetAPI_NormalProjection.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_NormalProjection.Ancestor (method)
  Ancestor(E: TopoDS_Edge): TopoDS_Shape;

  // BRepOffsetAPI_NormalProjection.BuildWire (method)
  BuildWire(Liste: NCollection_List_TopoDS_Shape): boolean;

  // BRepOffsetAPI_NormalProjection.delete (method)
  delete(): void;

  // BRepOffsetAPI_NormalProjection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepOffsetAPI_ThruSections: declare class BRepOffsetAPI_ThruSections extends BRepBuilderAPI_MakeShape

  // BRepOffsetAPI_ThruSections.constructor (constructor)
  constructor(isSolid?: boolean, ruled?: boolean, pres3d?: number);

  // BRepOffsetAPI_ThruSections.Init (method)
  Init(isSolid?: boolean, ruled?: boolean, pres3d?: number): void;

  // BRepOffsetAPI_ThruSections.AddWire (method)
  AddWire(wire: TopoDS_Wire): void;

  // BRepOffsetAPI_ThruSections.AddVertex (method)
  AddVertex(aVertex: TopoDS_Vertex): void;

  // BRepOffsetAPI_ThruSections.CheckCompatibility (method)
  CheckCompatibility(check?: boolean): void;

  // BRepOffsetAPI_ThruSections.SetSmoothing (method)
  SetSmoothing(UseSmoothing: boolean): void;

  // BRepOffsetAPI_ThruSections.SetParType (method)
  SetParType(ParType: Approx_ParametrizationType): void;

  // BRepOffsetAPI_ThruSections.SetContinuity (method)
  SetContinuity(C: GeomAbs_Shape): void;

  // BRepOffsetAPI_ThruSections.SetCriteriumWeight (method)
  SetCriteriumWeight(W1: number, W2: number, W3: number): void;

  // BRepOffsetAPI_ThruSections.SetMaxDegree (method)
  SetMaxDegree(MaxDeg: number): void;

  // BRepOffsetAPI_ThruSections.ParType (method)
  ParType(): Approx_ParametrizationType;

  // BRepOffsetAPI_ThruSections.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // BRepOffsetAPI_ThruSections.MaxDegree (method)
  MaxDegree(): number;

  // BRepOffsetAPI_ThruSections.UseSmoothing (method)
  UseSmoothing(): boolean;

  // BRepOffsetAPI_ThruSections.CriteriumWeight (method)
  CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

  // BRepOffsetAPI_ThruSections.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepOffsetAPI_ThruSections.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // BRepOffsetAPI_ThruSections.LastShape (method)
  LastShape(): TopoDS_Shape;

  // BRepOffsetAPI_ThruSections.GeneratedFace (method)
  GeneratedFace(Edge: TopoDS_Shape): TopoDS_Shape;

  // BRepOffsetAPI_ThruSections.SetMutableInput (method)
  SetMutableInput(theIsMutableInput: boolean): void;

  // BRepOffsetAPI_ThruSections.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_ThruSections.Wires (method)
  Wires(): NCollection_List_TopoDS_Shape;

  // BRepOffsetAPI_ThruSections.IsMutableInput (method)
  IsMutableInput(): boolean;

  // BRepOffsetAPI_ThruSections.GetStatus (method)
  GetStatus(): BRepFill_ThruSectionErrorStatus;

  // BRepOffsetAPI_ThruSections.delete (method)
  delete(): void;

  // BRepOffsetAPI_ThruSections.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
