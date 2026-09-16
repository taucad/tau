# libcascade — BRepFill

34 top-level symbols. Signatures are verbatim typescript.

BRepFill: declare class BRepFill

  constructor

  static Face(Edge1: TopoDS_Edge, Edge2: TopoDS_Edge): TopoDS_Face;

  static Shell(Wire1: TopoDS_Wire, Wire2: TopoDS_Wire): TopoDS_Shell;

  static Axe(Spine: TopoDS_Shape, Profile: TopoDS_Wire, AxeProf: gp_Ax3, ProfOnSpine: boolean, Tol: number): { ProfOnSpine: boolean };

  static ComputeACR(wire: TopoDS_Wire, ACR: NCollection_Array1_double): void;

  static InsertACR(wire: TopoDS_Wire, ACRcuts: NCollection_Array1_double, prec: number): TopoDS_Wire;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_ACRLaw: declare class BRepFill_ACRLaw extends BRepFill_LocationLaw

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_AdvancedEvolved: declare class BRepFill_AdvancedEvolved

  constructor

  Perform(theSpine: TopoDS_Wire, theProfile: TopoDS_Wire, theTolerance: number, theSolidReq?: boolean): void;

  IsDone(theErrorCode?: number): boolean;

  Shape(): TopoDS_Shape;

  SetTemporaryDirectory(thePath: string): void;

  SetParallelMode(theVal: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_ApproxSeewing: declare class BRepFill_ApproxSeewing

  constructor

  Perform(ML: BRepFill_MultiLine): void;

  IsDone(): boolean;

  Curve(): Geom_Curve;

  CurveOnF1(): Geom2d_Curve;

  CurveOnF2(): Geom2d_Curve;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_CompatibleWires: declare class BRepFill_CompatibleWires

  constructor

  Init(Sections: NCollection_Sequence_TopoDS_Shape): void;

  SetPercent(percent?: number): void;

  Perform(WithRotation?: boolean): void;

  IsDone(): boolean;

  GetStatus(): BRepFill_ThruSectionErrorStatus;

  Shape(): NCollection_Sequence_TopoDS_Shape;

  GeneratedShapes(SubSection: TopoDS_Edge): NCollection_List_TopoDS_Shape;

  Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  IsDegeneratedFirstSection(): boolean;

  IsDegeneratedLastSection(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_ComputeCLine: declare class BRepFill_ComputeCLine

  constructor

  Perform(Line: BRepFill_MultiLine): void;

  SetDegrees(degreemin: number, degreemax: number): void;

  SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

  SetConstraints(FirstC: AppParCurves_Constraint, LastC: AppParCurves_Constraint): void;

  SetMaxSegments(theMaxSegments: number): void;

  SetInvOrder(theInvOrder: boolean): void;

  SetHangChecking(theHangChecking: boolean): void;

  IsAllApproximated(): boolean;

  IsToleranceReached(): boolean;

  Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

  NbMultiCurves(): number;

  Value(Index?: number): AppParCurves_MultiCurve;

  Parameters(Index: number, firstp?: number, lastp?: number): { firstp: number; lastp: number };

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_CurveConstraint: declare class BRepFill_CurveConstraint extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_Draft: declare class BRepFill_Draft

  constructor

  SetOptions(Style?: BRepFill_TransitionStyle, AngleMin?: number, AngleMax?: number): void;

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

  IsDone(): boolean;

  Shell(): TopoDS_Shell;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  Shape(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_DraftLaw: declare class BRepFill_DraftLaw extends BRepFill_Edge3DLaw

  constructor

  CleanLaw(TolAngular: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_Edge3DLaw: declare class BRepFill_Edge3DLaw extends BRepFill_LocationLaw

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_EdgeFaceAndOrder: declare class BRepFill_EdgeFaceAndOrder

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_EdgeOnSurfLaw: declare class BRepFill_EdgeOnSurfLaw extends BRepFill_LocationLaw

  constructor

  HasResult(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_Evolved: declare class BRepFill_Evolved

  constructor

  Perform(Spine: TopoDS_Wire, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;
  Perform(Spine: TopoDS_Face, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;
  Perform(Spine: TopoDS_Wire, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;
  Perform(Spine: TopoDS_Face, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;

  IsDone(): boolean;

  Shape(): TopoDS_Shape;

  GeneratedShapes(SpineShape: TopoDS_Shape, ProfShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  JoinType(): GeomAbs_JoinType;

  Top(): TopoDS_Shape;

  Bottom(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_FaceAndOrder: declare class BRepFill_FaceAndOrder

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_Filling: declare class BRepFill_Filling

  constructor

  SetConstrParam(Tol2d?: number, Tol3d?: number, TolAng?: number, TolCurv?: number): void;

  SetResolParam(Degree?: number, NbPtsOnCur?: number, NbIter?: number, Anisotropie?: boolean): void;

  SetApproxParam(MaxDeg?: number, MaxSegments?: number): void;

  LoadInitSurface(aFace: TopoDS_Face): void;

  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;

  Build(): void;

  IsDone(): boolean;

  Face(): TopoDS_Face;

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

BRepFill_Generator: declare class BRepFill_Generator

  constructor

  AddWire(Wire: TopoDS_Wire): void;

  Perform(): void;

  Shell(): TopoDS_Shell;

  Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  GeneratedShapes(SSection: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  ResultShape(theShape: TopoDS_Shape): TopoDS_Shape;

  SetMutableInput(theIsMutableInput: boolean): void;

  IsMutableInput(): boolean;

  GetStatus(): BRepFill_ThruSectionErrorStatus;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_LocationLaw: declare class BRepFill_LocationLaw extends Standard_Transient

  constructor

  GetStatus(): GeomFill_PipeError;

  TransformInG0Law(): void;

  TransformInCompatibleLaw(AngularTolerance: number): void;

  DeleteTransform(): void;

  NbHoles(Tol?: number): number;

  Holes(Interval: NCollection_Array1_int): void;

  NbLaw(): number;

  Law(Index: number): GeomFill_LocationLaw;

  Wire(): TopoDS_Wire;

  Edge(Index: number): TopoDS_Edge;

  Vertex(Index: number): TopoDS_Vertex;

  PerformVertex(Index: number, InputVertex: TopoDS_Vertex, TolMin: number, OutputVertex: TopoDS_Vertex, Location: number): void;

  CurvilinearBounds(Index: number, First?: number, Last?: number): { First: number; Last: number };

  IsClosed(): boolean;

  IsG1(Index: number, SpatialTolerance?: number, AngularTolerance?: number): number;

  D0(Abscissa: number, Section: TopoDS_Shape): void;

  Parameter(Abscissa: number, Index?: number, Param?: number): { Index: number; Param: number };

  Abscissa(Index: number, Param: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_MultiLine: declare class BRepFill_MultiLine extends AppCont_Function

  constructor

  IsParticularCase(): boolean;

  Continuity(): GeomAbs_Shape;

  Curves(): { Curve: Geom_Curve; PCurve1: Geom2d_Curve; PCurve2: Geom2d_Curve; [Symbol.dispose](): void };

  FirstParameter(): number;

  LastParameter(): number;

  Value(U: number): gp_Pnt;
  Value(theU: number, thePnt2d: NCollection_Array1_gp_Pnt2d, thePnt: NCollection_Array1_gp_Pnt): boolean;
  Value(U: number): gp_Pnt;
  Value(theU: number, thePnt2d: NCollection_Array1_gp_Pnt2d, thePnt: NCollection_Array1_gp_Pnt): boolean;

  ValueOnF1(U: number): gp_Pnt2d;

  ValueOnF2(U: number): gp_Pnt2d;

  Value3dOnF1OnF2(U: number, P3d: gp_Pnt, PF1: gp_Pnt2d, PF2: gp_Pnt2d): void;

  D1(theU: number, theVec2d: NCollection_Array1_gp_Vec2d, theVec: NCollection_Array1_gp_Vec): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_NSections: declare class BRepFill_NSections extends BRepFill_SectionLaw

  constructor

  IsVertex(): boolean;

  IsConstant(): boolean;

  ConcatenedLaw(): GeomFill_SectionLaw;

  Continuity(Index: number, TolAngular: number): GeomAbs_Shape;

  VertexTol(Index: number, Param: number): number;

  Vertex(Index: number, Param: number): TopoDS_Vertex;

  D0(U: number, S: TopoDS_Shape): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_OffsetAncestors: declare class BRepFill_OffsetAncestors

  constructor

  Perform(Paral: BRepFill_OffsetWire): void;

  IsDone(): boolean;

  HasAncestor(S1: TopoDS_Edge): boolean;

  Ancestor(S1: TopoDS_Edge): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_OffsetWire: declare class BRepFill_OffsetWire

  constructor

  Init(Spine: TopoDS_Face, Join?: GeomAbs_JoinType, IsOpenResult?: boolean): void;

  Perform(Offset: number, Alt?: number): void;

  PerformWithBiLo(WSP: TopoDS_Face, Offset: number, Locus: BRepMAT2d_BisectingLocus, Link: BRepMAT2d_LinkTopoBilo, Join: GeomAbs_JoinType, Alt: number): void;

  IsDone(): boolean;

  Spine(): TopoDS_Face;

  Shape(): TopoDS_Shape;

  GeneratedShapes(SpineShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  JoinType(): GeomAbs_JoinType;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_Pipe: declare class BRepFill_Pipe

  constructor

  Perform(Spine: TopoDS_Wire, Profile: TopoDS_Shape, GeneratePartCase?: boolean): void;

  Spine(): TopoDS_Shape;

  Profile(): TopoDS_Shape;

  Shape(): TopoDS_Shape;

  ErrorOnSurface(): number;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  Generated(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;

  Face(ESpine: TopoDS_Edge, EProfile: TopoDS_Edge): TopoDS_Face;

  Edge(ESpine: TopoDS_Edge, VProfile: TopoDS_Vertex): TopoDS_Edge;

  Section(VSpine: TopoDS_Vertex): TopoDS_Shape;

  PipeLine(Point: gp_Pnt): TopoDS_Wire;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_PipeShell: declare class BRepFill_PipeShell extends Standard_Transient

  constructor

  Set(Frenet: boolean): void;
  Set(Axe: gp_Ax2): void;
  Set(BiNormal: gp_Dir): void;
  Set(SpineSupport: TopoDS_Shape): boolean;
  Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
  Set(Frenet: boolean): void;
  Set(Axe: gp_Ax2): void;
  Set(BiNormal: gp_Dir): void;
  Set(SpineSupport: TopoDS_Shape): boolean;
  Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
  Set(Frenet: boolean): void;
  Set(Axe: gp_Ax2): void;
  Set(BiNormal: gp_Dir): void;
  Set(SpineSupport: TopoDS_Shape): boolean;
  Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
  Set(Frenet: boolean): void;
  Set(Axe: gp_Ax2): void;
  Set(BiNormal: gp_Dir): void;
  Set(SpineSupport: TopoDS_Shape): boolean;
  Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;
  Set(Frenet: boolean): void;
  Set(Axe: gp_Ax2): void;
  Set(BiNormal: gp_Dir): void;
  Set(SpineSupport: TopoDS_Shape): boolean;
  Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;

  SetDiscrete(): void;

  SetMaxDegree(NewMaxDegree: number): void;

  SetMaxSegments(NewMaxSegments: number): void;

  SetForceApproxC1(ForceApproxC1: boolean): void;

  SetIsBuildHistory(theIsBuildHistory: boolean): void;

  IsBuildHistory(): boolean;

  Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

  SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

  DeleteProfile(Profile: TopoDS_Shape): void;

  IsReady(): boolean;

  GetStatus(): GeomFill_PipeError;

  SetTolerance(Tol3d?: number, BoundTol?: number, TolAngular?: number): void;

  SetTransition(Mode?: BRepFill_TransitionStyle, Angmin?: number, Angmax?: number): void;

  Simulate(NumberOfSection: number, Sections: NCollection_List_TopoDS_Shape): void;

  Build(): boolean;

  MakeSolid(): boolean;

  Shape(): TopoDS_Shape;

  ErrorOnSurface(): number;

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  Profiles(theProfiles: NCollection_List_TopoDS_Shape): void;

  Spine(): TopoDS_Wire;

  Generated(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_Section: declare class BRepFill_Section

  constructor

  Set(IsLaw: boolean): void;

  OriginalShape(): TopoDS_Shape;

  Wire(): TopoDS_Wire;

  Vertex(): TopoDS_Vertex;

  ModifiedShape(theShape: TopoDS_Shape): TopoDS_Shape;

  IsLaw(): boolean;

  IsPunctual(): boolean;

  WithContact(): boolean;

  WithCorrection(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_SectionLaw: declare class BRepFill_SectionLaw extends Standard_Transient

  NbLaw(): number;

  Law(Index: number): GeomFill_SectionLaw;

  IndexOfEdge(anEdge: TopoDS_Shape): number;

  IsConstant(): boolean;

  IsUClosed(): boolean;

  IsVClosed(): boolean;

  IsDone(): boolean;

  IsVertex(): boolean;

  ConcatenedLaw(): GeomFill_SectionLaw;

  Continuity(Index: number, TolAngular: number): GeomAbs_Shape;

  VertexTol(Index: number, Param: number): number;

  Vertex(Index: number, Param: number): TopoDS_Vertex;

  D0(U: number, S: TopoDS_Shape): void;

  Init(W: TopoDS_Wire): void;

  CurrentEdge(): TopoDS_Edge;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_SectionPlacement: declare class BRepFill_SectionPlacement

  constructor

  Transformation(): gp_Trsf;

  AbscissaOnPath(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_ShapeLaw: declare class BRepFill_ShapeLaw extends BRepFill_SectionLaw

  constructor

  IsVertex(): boolean;

  IsConstant(): boolean;

  ConcatenedLaw(): GeomFill_SectionLaw;

  Continuity(Index: number, TolAngular: number): GeomAbs_Shape;

  VertexTol(Index: number, Param: number): number;

  Vertex(Index: number, Param: number): TopoDS_Vertex;

  D0(U: number, S: TopoDS_Shape): void;

  Edge(Index: number): TopoDS_Edge;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_Sweep: declare class BRepFill_Sweep

  constructor

  SetBounds(FirstShape: TopoDS_Wire, LastShape: TopoDS_Wire): void;

  SetTolerance(Tol3d: number, BoundTol?: number, Tol2d?: number, TolAngular?: number): void;

  SetAngularControl(AngleMin?: number, AngleMax?: number): void;

  SetForceApproxC1(ForceApproxC1: boolean): void;

  Build(ReversedEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, Tapes: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher, Rails: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher, Transition: BRepFill_TransitionStyle, Continuity: GeomAbs_Shape, Approx: GeomFill_ApproxStyle, Degmax: number, Segmax: number): void;

  IsDone(): boolean;

  Shape(): TopoDS_Shape;

  ErrorOnSurface(): number;

  SubShape(): NCollection_HArray2_TopoDS_Shape;

  InterFaces(): NCollection_HArray2_TopoDS_Shape;

  Sections(): NCollection_HArray2_TopoDS_Shape;

  Tape(Index: number): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_ThruSectionErrorStatus: typeof BRepFill_ThruSectionErrorStatus[keyof typeof BRepFill_ThruSectionErrorStatus]

BRepFill_TransitionStyle: typeof BRepFill_TransitionStyle[keyof typeof BRepFill_TransitionStyle]

BRepFill_TrimEdgeTool: declare class BRepFill_TrimEdgeTool

  constructor

  IntersectWith(Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, InitShape1: TopoDS_Shape, InitShape2: TopoDS_Shape, End1: TopoDS_Vertex, End2: TopoDS_Vertex, theJoinType: GeomAbs_JoinType, IsOpenResult: boolean, Params: NCollection_Sequence_gp_Pnt): void;

  AddOrConfuse(Start: boolean, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Params: NCollection_Sequence_gp_Pnt): void;

  IsInside(P: gp_Pnt2d): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_TrimShellCorner: declare class BRepFill_TrimShellCorner

  constructor

  AddBounds(Bounds: NCollection_HArray2_TopoDS_Shape): void;

  AddUEdges(theUEdges: NCollection_HArray2_TopoDS_Shape): void;

  AddVEdges(theVEdges: NCollection_HArray2_TopoDS_Shape, theIndex: number): void;

  Perform(): void;

  IsDone(): boolean;

  HasSection(): boolean;

  Modified(S: TopoDS_Shape, theModified: NCollection_List_TopoDS_Shape): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepFill_TypeOfContact: typeof BRepFill_TypeOfContact[keyof typeof BRepFill_TypeOfContact]

BRepFill_DataMapOfShapeHArray2OfShape: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher
