# libcascade — BRepOffsetAPI

12 top-level symbols. Signatures are verbatim typescript.

BRepOffsetAPI_DraftAngle: declare class BRepOffsetAPI_DraftAngle extends BRepBuilderAPI_ModifyShape

  constructor

  Clear(): void;

  Init(S: TopoDS_Shape): void;

  Add(F: TopoDS_Face, Direction: gp_Dir, Angle: number, NeutralPlane: gp_Pln, Flag?: boolean): void;

  AddDone(): boolean;

  Remove(F: TopoDS_Face): void;

  ProblematicShape(): TopoDS_Shape;

  Status(): Draft_ErrorStatus;

  ConnectedFaces(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

  ModifiedFaces(): NCollection_List_TopoDS_Shape;

  Build(theRange?: Message_ProgressRange): void;

  CorrectWires(): void;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MakeDraft: declare class BRepOffsetAPI_MakeDraft extends BRepBuilderAPI_MakeShape

  constructor

  SetOptions(Style?: BRepBuilderAPI_TransitionMode, AngleMin?: number, AngleMax?: number): void;

  SetDraft(IsInternal?: boolean): void;

  Perform(LengthMax: number): void;
  Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
  Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;
  Perform(LengthMax: number): void;
  Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
  Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;
  Perform(LengthMax: number): void;
  Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
  Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;

  Shell(): TopoDS_Shell;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MakeEvolved: declare class BRepOffsetAPI_MakeEvolved extends BRepBuilderAPI_MakeShape

  constructor

  Evolved(): BRepFill_Evolved;

  Build(theRange?: Message_ProgressRange): void;

  GeneratedShapes(SpineShape: TopoDS_Shape, ProfShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Top(): TopoDS_Shape;

  Bottom(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MakeFilling: declare class BRepOffsetAPI_MakeFilling extends BRepBuilderAPI_MakeShape

  constructor

  SetConstrParam(Tol2d?: number, Tol3d?: number, TolAng?: number, TolCurv?: number): void;

  SetResolParam(Degree?: number, NbPtsOnCur?: number, NbIter?: number, Anisotropie?: boolean): void;

  SetApproxParam(MaxDeg?: number, MaxSegments?: number): void;

  LoadInitSurface(Surf: TopoDS_Face): void;

  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Constr: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(Constr: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;

  Build(theRange?: Message_ProgressRange): void;

  IsDone(): boolean;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  G0Error(): number;
  G0Error(Index: number): number;
  G0Error(): number;
  G0Error(Index: number): number;

  G1Error(): number;
  G1Error(Index: number): number;
  G1Error(): number;
  G1Error(Index: number): number;

  G2Error(): number;
  G2Error(Index: number): number;
  G2Error(): number;
  G2Error(Index: number): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MakeOffset: declare class BRepOffsetAPI_MakeOffset extends BRepBuilderAPI_MakeShape

  constructor

  Init(Spine: TopoDS_Face, Join: GeomAbs_JoinType, IsOpenResult: boolean): void;
  Init(Join: GeomAbs_JoinType, IsOpenResult: boolean): void;
  Init(Spine: TopoDS_Face, Join: GeomAbs_JoinType, IsOpenResult: boolean): void;
  Init(Join: GeomAbs_JoinType, IsOpenResult: boolean): void;

  SetApprox(ToApprox: boolean): void;

  AddWire(Spine: TopoDS_Wire): void;

  Perform(Offset: number, Alt?: number): void;

  Build(theRange?: Message_ProgressRange): void;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  static ConvertFace(theFace: TopoDS_Face, theAngleTolerance: number): TopoDS_Face;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MakeOffsetShape: declare class BRepOffsetAPI_MakeOffsetShape extends BRepBuilderAPI_MakeShape

  constructor

  PerformBySimple(theS: TopoDS_Shape, theOffsetValue: number): void;

  PerformByJoin(S: TopoDS_Shape, Offset: number, Tol: number, Mode?: BRepOffset_Mode, Intersection?: boolean, SelfInter?: boolean, Join?: GeomAbs_JoinType, RemoveIntEdges?: boolean, theRange?: Message_ProgressRange): void;

  Build(theRange?: Message_ProgressRange): void;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  IsDeleted(S: TopoDS_Shape): boolean;

  GetJoinType(): GeomAbs_JoinType;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MakePipe: declare class BRepOffsetAPI_MakePipe extends BRepPrimAPI_MakeSweep

  constructor

  Pipe(): BRepFill_Pipe;

  Build(theRange?: Message_ProgressRange): void;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  Generated(SSpine: TopoDS_Shape, SProfile: TopoDS_Shape): TopoDS_Shape;
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  Generated(SSpine: TopoDS_Shape, SProfile: TopoDS_Shape): TopoDS_Shape;

  ErrorOnSurface(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MakePipeShell: declare class BRepOffsetAPI_MakePipeShell extends BRepPrimAPI_MakeSweep

  constructor

  SetMode(IsFrenet: boolean): void;
  SetMode(Axe: gp_Ax2): void;
  SetMode(BiNormal: gp_Dir): void;
  SetMode(SpineSupport: TopoDS_Shape): boolean;
  SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
  SetMode(IsFrenet: boolean): void;
  SetMode(Axe: gp_Ax2): void;
  SetMode(BiNormal: gp_Dir): void;
  SetMode(SpineSupport: TopoDS_Shape): boolean;
  SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
  SetMode(IsFrenet: boolean): void;
  SetMode(Axe: gp_Ax2): void;
  SetMode(BiNormal: gp_Dir): void;
  SetMode(SpineSupport: TopoDS_Shape): boolean;
  SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
  SetMode(IsFrenet: boolean): void;
  SetMode(Axe: gp_Ax2): void;
  SetMode(BiNormal: gp_Dir): void;
  SetMode(SpineSupport: TopoDS_Shape): boolean;
  SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
  SetMode(IsFrenet: boolean): void;
  SetMode(Axe: gp_Ax2): void;
  SetMode(BiNormal: gp_Dir): void;
  SetMode(SpineSupport: TopoDS_Shape): boolean;
  SetMode(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;

  SetDiscreteMode(): void;

  Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

  SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

  Delete(Profile: TopoDS_Shape): void;

  IsReady(): boolean;

  GetStatus(): BRepBuilderAPI_PipeError;

  SetTolerance(Tol3d?: number, BoundTol?: number, TolAngular?: number): void;

  SetMaxDegree(NewMaxDegree: number): void;

  SetMaxSegments(NewMaxSegments: number): void;

  SetForceApproxC1(ForceApproxC1: boolean): void;

  SetTransitionMode(Mode?: BRepBuilderAPI_TransitionMode): void;

  Simulate(NumberOfSection: number, Result: NCollection_List_TopoDS_Shape): void;

  Build(theRange?: Message_ProgressRange): void;

  MakeSolid(): boolean;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  ErrorOnSurface(): number;

  SetIsBuildHistory(theIsBuildHistory: boolean): void;

  IsBuildHistory(): boolean;

  Profiles(theProfiles: NCollection_List_TopoDS_Shape): void;

  Spine(): TopoDS_Wire;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MakeThickSolid: declare class BRepOffsetAPI_MakeThickSolid extends BRepOffsetAPI_MakeOffsetShape

  constructor

  MakeThickSolidBySimple(theS: TopoDS_Shape, theOffsetValue: number): void;

  MakeThickSolidByJoin(S: TopoDS_Shape, ClosingFaces: NCollection_List_TopoDS_Shape, Offset: number, Tol: number, Mode?: BRepOffset_Mode, Intersection?: boolean, SelfInter?: boolean, Join?: GeomAbs_JoinType, RemoveIntEdges?: boolean, theRange?: Message_ProgressRange): void;

  Build(theRange?: Message_ProgressRange): void;

  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_MiddlePath: declare class BRepOffsetAPI_MiddlePath extends BRepBuilderAPI_MakeShape

  constructor

  Build(theRange?: Message_ProgressRange): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_NormalProjection: declare class BRepOffsetAPI_NormalProjection extends BRepBuilderAPI_MakeShape

  constructor

  Init(S: TopoDS_Shape): void;

  Add(ToProj: TopoDS_Shape): void;

  SetParams(Tol3D: number, Tol2D: number, InternalContinuity: GeomAbs_Shape, MaxDegree: number, MaxSeg: number): void;

  SetMaxDistance(MaxDist: number): void;

  SetLimit(FaceBoundaries?: boolean): void;

  Compute3d(With3d?: boolean): void;

  Build(theRange?: Message_ProgressRange): void;

  IsDone(): boolean;

  Projection(): TopoDS_Shape;

  Couple(E: TopoDS_Edge): TopoDS_Shape;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Ancestor(E: TopoDS_Edge): TopoDS_Shape;

  BuildWire(Liste: NCollection_List_TopoDS_Shape): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepOffsetAPI_ThruSections: declare class BRepOffsetAPI_ThruSections extends BRepBuilderAPI_MakeShape

  constructor

  Init(isSolid?: boolean, ruled?: boolean, pres3d?: number): void;

  AddWire(wire: TopoDS_Wire): void;

  AddVertex(aVertex: TopoDS_Vertex): void;

  CheckCompatibility(check?: boolean): void;

  SetSmoothing(UseSmoothing: boolean): void;

  SetParType(ParType: Approx_ParametrizationType): void;

  SetContinuity(C: GeomAbs_Shape): void;

  SetCriteriumWeight(W1: number, W2: number, W3: number): void;

  SetMaxDegree(MaxDeg: number): void;

  ParType(): Approx_ParametrizationType;

  Continuity(): GeomAbs_Shape;

  MaxDegree(): number;

  UseSmoothing(): boolean;

  CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

  Build(theRange?: Message_ProgressRange): void;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  GeneratedFace(Edge: TopoDS_Shape): TopoDS_Shape;

  SetMutableInput(theIsMutableInput: boolean): void;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Wires(): NCollection_List_TopoDS_Shape;

  IsMutableInput(): boolean;

  GetStatus(): BRepFill_ThruSectionErrorStatus;

  delete(): void;

  [Symbol.dispose](): void;
