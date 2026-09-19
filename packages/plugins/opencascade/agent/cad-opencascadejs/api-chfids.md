# libcascade — ChFiDS

23 top-level symbols. Signatures are verbatim typescript.

ChFiDS_ChamfMethod: typeof ChFiDS_ChamfMethod[keyof typeof ChFiDS_ChamfMethod]

ChFiDS_ChamfMode: typeof ChFiDS_ChamfMode[keyof typeof ChFiDS_ChamfMode]

ChFiDS_ChamfSpine: declare class ChFiDS_ChamfSpine extends ChFiDS_Spine

  constructor

  SetDist(Dis: number): void;

  GetDist(Dis?: number): { Dis: number };

  SetDists(Dis1: number, Dis2: number): void;

  Dists(Dis1?: number, Dis2?: number): { Dis1: number; Dis2: number };

  GetDistAngle(Dis?: number, Angle?: number): { Dis: number; Angle: number };

  SetDistAngle(Dis: number, Angle: number): void;

  SetMode(theMode: ChFiDS_ChamfMode): void;

  IsChamfer(): ChFiDS_ChamfMethod;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_CircSection: declare class ChFiDS_CircSection

  constructor

  Set(C: gp_Circ, F: number, L: number): void;
  Set(C: gp_Lin, F: number, L: number): void;
  Set(C: gp_Circ, F: number, L: number): void;
  Set(C: gp_Lin, F: number, L: number): void;

  Get(C: gp_Circ, F: number, L: number): { F: number; L: number };
  Get(C: gp_Lin, F: number, L: number): { F: number; L: number };
  Get(C: gp_Circ, F: number, L: number): { F: number; L: number };
  Get(C: gp_Lin, F: number, L: number): { F: number; L: number };

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_CommonPoint: declare class ChFiDS_CommonPoint

  constructor

  Reset(): void;

  SetVertex(theVertex: TopoDS_Vertex): void;

  SetArc(Tol: number, A: TopoDS_Edge, Param: number, TArc: TopAbs_Orientation): void;

  SetParameter(Param: number): void;

  SetPoint(thePoint: gp_Pnt): void;

  SetVector(theVector: gp_Vec): void;

  SetTolerance(Tol: number): void;

  Tolerance(): number;

  IsVertex(): boolean;

  Vertex(): TopoDS_Vertex;

  IsOnArc(): boolean;

  Arc(): TopoDS_Edge;

  TransitionOnArc(): TopAbs_Orientation;

  ParameterOnArc(): number;

  Parameter(): number;

  Point(): gp_Pnt;

  HasVector(): boolean;

  Vector(): gp_Vec;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_ElSpine: declare class ChFiDS_ElSpine extends Adaptor3d_Curve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  ShallowCopy(): Adaptor3d_Curve;

  FirstParameter(): number;
  FirstParameter(P: number): void;
  FirstParameter(): number;
  FirstParameter(P: number): void;

  LastParameter(): number;
  LastParameter(P: number): void;
  LastParameter(): number;
  LastParameter(P: number): void;

  GetSavedFirstParameter(): number;

  GetSavedLastParameter(): number;

  Continuity(): GeomAbs_Shape;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  Resolution(R3d: number): number;

  GetType(): GeomAbs_CurveType;

  IsPeriodic(): boolean;

  SetPeriodic(I: boolean): void;

  Period(): number;

  EvalD0(theU: number): gp_Pnt;

  EvalD1(theU: number): Geom_Curve_ResD1;

  EvalD2(theU: number): Geom_Curve_ResD2;

  EvalD3(theU: number): Geom_Curve_ResD3;

  SaveFirstParameter(): void;

  SaveLastParameter(): void;

  SetOrigin(O: number): void;

  FirstPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

  LastPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

  NbVertices(): number;

  VertexWithTangent(Index: number): gp_Ax1;

  SetFirstPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

  SetLastPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

  AddVertexWithTangent(anAx1: gp_Ax1): void;

  SetCurve(C: Geom_Curve): void;

  Previous(): ChFiDS_SurfData;

  ChangePrevious(): ChFiDS_SurfData;

  Next(): ChFiDS_SurfData;

  ChangeNext(): ChFiDS_SurfData;

  Line(): gp_Lin;

  Circle(): gp_Circ;

  Ellipse(): gp_Elips;

  Hyperbola(): gp_Hypr;

  Parabola(): gp_Parab;

  Bezier(): Geom_BezierCurve;

  BSpline(): Geom_BSplineCurve;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_ErrorStatus: typeof ChFiDS_ErrorStatus[keyof typeof ChFiDS_ErrorStatus]

ChFiDS_FaceInterference: declare class ChFiDS_FaceInterference

  constructor

  SetInterference(LineIndex: number, Trans: TopAbs_Orientation, PCurv1: Geom2d_Curve, PCurv2: Geom2d_Curve): void;

  SetTransition(Trans: TopAbs_Orientation): void;

  SetFirstParameter(U1: number): void;

  SetLastParameter(U1: number): void;

  SetParameter(U1: number, IsFirst: boolean): void;

  LineIndex(): number;

  SetLineIndex(I: number): void;

  Transition(): TopAbs_Orientation;

  PCurveOnFace(): Geom2d_Curve;

  PCurveOnSurf(): Geom2d_Curve;

  ChangePCurveOnFace(): Geom2d_Curve;

  ChangePCurveOnSurf(): Geom2d_Curve;

  FirstParameter(): number;

  LastParameter(): number;

  Parameter(IsFirst: boolean): number;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_FilSpine: declare class ChFiDS_FilSpine extends ChFiDS_Spine

  constructor

  Reset(AllData?: boolean): void;

  SetRadius(Radius: number): void;
  SetRadius(Radius: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IinC: number): void;
  SetRadius(C: Law_Function, IinC: number): void;
  SetRadius(Radius: number): void;
  SetRadius(Radius: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IinC: number): void;
  SetRadius(C: Law_Function, IinC: number): void;
  SetRadius(Radius: number): void;
  SetRadius(Radius: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IinC: number): void;
  SetRadius(C: Law_Function, IinC: number): void;
  SetRadius(Radius: number): void;
  SetRadius(Radius: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IinC: number): void;
  SetRadius(C: Law_Function, IinC: number): void;
  SetRadius(Radius: number): void;
  SetRadius(Radius: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IinC: number): void;
  SetRadius(C: Law_Function, IinC: number): void;

  UnSetRadius(E: TopoDS_Edge): void;
  UnSetRadius(V: TopoDS_Vertex): void;
  UnSetRadius(E: TopoDS_Edge): void;
  UnSetRadius(V: TopoDS_Vertex): void;

  IsConstant(): boolean;
  IsConstant(IE: number): boolean;
  IsConstant(): boolean;
  IsConstant(IE: number): boolean;

  Radius(): number;
  Radius(IE: number): number;
  Radius(E: TopoDS_Edge): number;
  Radius(): number;
  Radius(IE: number): number;
  Radius(E: TopoDS_Edge): number;
  Radius(): number;
  Radius(IE: number): number;
  Radius(E: TopoDS_Edge): number;

  AppendElSpine(Els: ChFiDS_ElSpine): void;

  Law(Els: ChFiDS_ElSpine): Law_Composite;

  ChangeLaw(E: TopoDS_Edge): Law_Function;

  MaxRadFromSeqAndLaws(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_Map: declare class ChFiDS_Map

  constructor

  Fill(S: TopoDS_Shape, T1: TopAbs_ShapeEnum, T2: TopAbs_ShapeEnum): void;

  Contains(S: TopoDS_Shape): boolean;

  FindFromKey(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  FindFromIndex(I: number): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_Regul: declare class ChFiDS_Regul

  constructor

  SetCurve(IC: number): void;

  SetS1(IS1: number, IsFace?: boolean): void;

  SetS2(IS2: number, IsFace?: boolean): void;

  IsSurface1(): boolean;

  IsSurface2(): boolean;

  Curve(): number;

  S1(): number;

  S2(): number;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_Spine: declare class ChFiDS_Spine extends Standard_Transient

  constructor

  SetEdges(E: TopoDS_Edge): void;

  SetOffsetEdges(E: TopoDS_Edge): void;

  PutInFirst(E: TopoDS_Edge): void;

  PutInFirstOffset(E: TopoDS_Edge): void;

  NbEdges(): number;

  Edges(I: number): TopoDS_Edge;

  OffsetEdges(I: number): TopoDS_Edge;

  SetFirstStatus(S: ChFiDS_State): void;

  SetLastStatus(S: ChFiDS_State): void;

  AppendElSpine(Els: ChFiDS_ElSpine): void;

  AppendOffsetElSpine(Els: ChFiDS_ElSpine): void;

  ElSpine(IE: number): ChFiDS_ElSpine;
  ElSpine(E: TopoDS_Edge): ChFiDS_ElSpine;
  ElSpine(W: number): ChFiDS_ElSpine;
  ElSpine(IE: number): ChFiDS_ElSpine;
  ElSpine(E: TopoDS_Edge): ChFiDS_ElSpine;
  ElSpine(W: number): ChFiDS_ElSpine;
  ElSpine(IE: number): ChFiDS_ElSpine;
  ElSpine(E: TopoDS_Edge): ChFiDS_ElSpine;
  ElSpine(W: number): ChFiDS_ElSpine;

  ChangeElSpines(): NCollection_List_handle_ChFiDS_ElSpine;

  ChangeOffsetElSpines(): NCollection_List_handle_ChFiDS_ElSpine;

  Reset(AllData?: boolean): void;

  SplitDone(): boolean;
  SplitDone(B: boolean): void;
  SplitDone(): boolean;
  SplitDone(B: boolean): void;

  Load(): void;

  Resolution(R3d: number): number;

  IsClosed(): boolean;

  FirstParameter(): number;
  FirstParameter(IndexSpine: number): number;
  FirstParameter(): number;
  FirstParameter(IndexSpine: number): number;

  LastParameter(): number;
  LastParameter(IndexSpine: number): number;
  LastParameter(): number;
  LastParameter(IndexSpine: number): number;

  SetFirstParameter(Par: number): void;

  SetLastParameter(Par: number): void;

  Length(IndexSpine: number): number;

  IsPeriodic(): boolean;

  Period(): number;

  Absc(U: number): number;
  Absc(V: TopoDS_Vertex): number;
  Absc(U: number, I: number): number;
  Absc(U: number): number;
  Absc(V: TopoDS_Vertex): number;
  Absc(U: number, I: number): number;
  Absc(U: number): number;
  Absc(V: TopoDS_Vertex): number;
  Absc(U: number, I: number): number;

  Parameter(AbsC: number, U: number, Oriented: boolean): { U: number };
  Parameter(Index: number, AbsC: number, U: number, Oriented: boolean): { U: number };
  Parameter(AbsC: number, U: number, Oriented: boolean): { U: number };
  Parameter(Index: number, AbsC: number, U: number, Oriented: boolean): { U: number };

  Value(AbsC: number): gp_Pnt;

  D0(AbsC: number, P: gp_Pnt): void;

  D1(AbsC: number, P: gp_Pnt, V1: gp_Vec): void;

  D2(AbsC: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  SetCurrent(Index: number): void;

  CurrentElementarySpine(Index: number): BRepAdaptor_Curve;

  CurrentIndexOfElementarySpine(): number;

  GetType(): GeomAbs_CurveType;

  Line(): gp_Lin;

  Circle(): gp_Circ;

  FirstStatus(): ChFiDS_State;

  LastStatus(): ChFiDS_State;

  Status(IsFirst: boolean): ChFiDS_State;

  GetTypeOfConcavity(): ChFiDS_TypeOfConcavity;

  SetStatus(S: ChFiDS_State, IsFirst: boolean): void;

  SetTypeOfConcavity(theType: ChFiDS_TypeOfConcavity): void;

  IsTangencyExtremity(IsFirst: boolean): boolean;

  SetTangencyExtremity(IsTangency: boolean, IsFirst: boolean): void;

  FirstVertex(): TopoDS_Vertex;

  LastVertex(): TopoDS_Vertex;

  SetFirstTgt(W: number): void;

  SetLastTgt(W: number): void;

  HasFirstTgt(): boolean;

  HasLastTgt(): boolean;

  SetReference(W: number): void;
  SetReference(I: number): void;
  SetReference(W: number): void;
  SetReference(I: number): void;

  Index(W: number, Forward: boolean): number;
  Index(E: TopoDS_Edge): number;
  Index(W: number, Forward: boolean): number;
  Index(E: TopoDS_Edge): number;

  UnsetReference(): void;

  SetErrorStatus(state: ChFiDS_ErrorStatus): void;

  ErrorStatus(): ChFiDS_ErrorStatus;

  Mode(): ChFiDS_ChamfMode;

  GetTolesp(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_State: typeof ChFiDS_State[keyof typeof ChFiDS_State]

ChFiDS_Stripe: declare class ChFiDS_Stripe extends Standard_Transient

  constructor

  Reset(): void;

  SetOfSurfData(): NCollection_HSequence_handle_ChFiDS_SurfData;

  Spine(): ChFiDS_Spine;

  OrientationOnFace1(): TopAbs_Orientation;
  OrientationOnFace1(Or1: TopAbs_Orientation): void;
  OrientationOnFace1(): TopAbs_Orientation;
  OrientationOnFace1(Or1: TopAbs_Orientation): void;

  OrientationOnFace2(): TopAbs_Orientation;
  OrientationOnFace2(Or2: TopAbs_Orientation): void;
  OrientationOnFace2(): TopAbs_Orientation;
  OrientationOnFace2(Or2: TopAbs_Orientation): void;

  Choix(): number;
  Choix(C: number): void;
  Choix(): number;
  Choix(C: number): void;

  ChangeSetOfSurfData(): NCollection_HSequence_handle_ChFiDS_SurfData;

  ChangeSpine(): ChFiDS_Spine;

  FirstParameters(Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

  LastParameters(Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

  ChangeFirstParameters(Pdeb: number, Pfin: number): void;

  ChangeLastParameters(Pdeb: number, Pfin: number): void;

  FirstCurve(): number;

  LastCurve(): number;

  ChangeFirstCurve(Index: number): void;

  ChangeLastCurve(Index: number): void;

  FirstPCurve(): Geom2d_Curve;

  LastPCurve(): Geom2d_Curve;

  ChangeFirstPCurve(): Geom2d_Curve;

  ChangeLastPCurve(): Geom2d_Curve;

  FirstPCurveOrientation(): TopAbs_Orientation;
  FirstPCurveOrientation(O: TopAbs_Orientation): void;
  FirstPCurveOrientation(): TopAbs_Orientation;
  FirstPCurveOrientation(O: TopAbs_Orientation): void;

  LastPCurveOrientation(): TopAbs_Orientation;
  LastPCurveOrientation(O: TopAbs_Orientation): void;
  LastPCurveOrientation(): TopAbs_Orientation;
  LastPCurveOrientation(O: TopAbs_Orientation): void;

  IndexFirstPointOnS1(): number;

  IndexFirstPointOnS2(): number;

  IndexLastPointOnS1(): number;

  IndexLastPointOnS2(): number;

  ChangeIndexFirstPointOnS1(Index: number): void;

  ChangeIndexFirstPointOnS2(Index: number): void;

  ChangeIndexLastPointOnS1(Index: number): void;

  ChangeIndexLastPointOnS2(Index: number): void;

  Parameters(First: boolean, Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

  SetParameters(First: boolean, Pdeb: number, Pfin: number): void;

  Curve(First: boolean): number;

  SetCurve(Index: number, First: boolean): void;

  PCurve(First: boolean): Geom2d_Curve;

  ChangePCurve(First: boolean): Geom2d_Curve;

  Orientation(OnS: number): TopAbs_Orientation;
  Orientation(First: boolean): TopAbs_Orientation;
  Orientation(OnS: number): TopAbs_Orientation;
  Orientation(First: boolean): TopAbs_Orientation;

  SetOrientation(Or: TopAbs_Orientation, OnS: number): void;
  SetOrientation(Or: TopAbs_Orientation, First: boolean): void;
  SetOrientation(Or: TopAbs_Orientation, OnS: number): void;
  SetOrientation(Or: TopAbs_Orientation, First: boolean): void;

  IndexPoint(First: boolean, OnS: number): number;

  SetIndexPoint(Index: number, First: boolean, OnS: number): void;

  SolidIndex(): number;

  SetSolidIndex(Index: number): void;

  InDS(First: boolean, Nb?: number): void;

  IsInDS(First: boolean): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_StripeMap: declare class ChFiDS_StripeMap

  constructor

  Add(V: TopoDS_Vertex, F: ChFiDS_Stripe): void;

  Extent(): number;

  FindFromKey(V: TopoDS_Vertex): NCollection_List_handle_ChFiDS_Stripe;

  FindFromIndex(I: number): NCollection_List_handle_ChFiDS_Stripe;

  FindKey(I: number): TopoDS_Vertex;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_SurfData: declare class ChFiDS_SurfData extends Standard_Transient

  constructor

  Copy(Other: ChFiDS_SurfData): void;

  IndexOfS1(): number;

  IndexOfS2(): number;

  IsOnCurve1(): boolean;

  IsOnCurve2(): boolean;

  IndexOfC1(): number;

  IndexOfC2(): number;

  Surf(): number;

  Orientation(): TopAbs_Orientation;

  InterferenceOnS1(): ChFiDS_FaceInterference;

  InterferenceOnS2(): ChFiDS_FaceInterference;

  VertexFirstOnS1(): ChFiDS_CommonPoint;

  VertexFirstOnS2(): ChFiDS_CommonPoint;

  VertexLastOnS1(): ChFiDS_CommonPoint;

  VertexLastOnS2(): ChFiDS_CommonPoint;

  ChangeIndexOfS1(Index: number): void;

  ChangeIndexOfS2(Index: number): void;

  ChangeSurf(Index: number): void;

  SetIndexOfC1(Index: number): void;

  SetIndexOfC2(Index: number): void;

  ChangeOrientation(): TopAbs_Orientation;

  ChangeInterferenceOnS1(): ChFiDS_FaceInterference;

  ChangeInterferenceOnS2(): ChFiDS_FaceInterference;

  ChangeVertexFirstOnS1(): ChFiDS_CommonPoint;

  ChangeVertexFirstOnS2(): ChFiDS_CommonPoint;

  ChangeVertexLastOnS1(): ChFiDS_CommonPoint;

  ChangeVertexLastOnS2(): ChFiDS_CommonPoint;

  Interference(OnS: number): ChFiDS_FaceInterference;

  ChangeInterference(OnS: number): ChFiDS_FaceInterference;

  Index(OfS: number): number;

  Vertex(First: boolean, OnS: number): ChFiDS_CommonPoint;

  ChangeVertex(First: boolean, OnS: number): ChFiDS_CommonPoint;

  IsOnCurve(OnS: number): boolean;

  IndexOfC(OnS: number): number;

  FirstSpineParam(): number;
  FirstSpineParam(Par: number): void;
  FirstSpineParam(): number;
  FirstSpineParam(Par: number): void;

  LastSpineParam(): number;
  LastSpineParam(Par: number): void;
  LastSpineParam(): number;
  LastSpineParam(Par: number): void;

  FirstExtensionValue(): number;
  FirstExtensionValue(Extend: number): void;
  FirstExtensionValue(): number;
  FirstExtensionValue(Extend: number): void;

  LastExtensionValue(): number;
  LastExtensionValue(Extend: number): void;
  LastExtensionValue(): number;
  LastExtensionValue(Extend: number): void;

  Simul(): Standard_Transient;

  SetSimul(S: Standard_Transient): void;

  ResetSimul(): void;

  Get2dPoints(First: boolean, OnS: number): gp_Pnt2d;
  Get2dPoints(P2df1: gp_Pnt2d, P2dl1: gp_Pnt2d, P2df2: gp_Pnt2d, P2dl2: gp_Pnt2d): void;
  Get2dPoints(First: boolean, OnS: number): gp_Pnt2d;
  Get2dPoints(P2df1: gp_Pnt2d, P2dl1: gp_Pnt2d, P2df2: gp_Pnt2d, P2dl2: gp_Pnt2d): void;

  Set2dPoints(P2df1: gp_Pnt2d, P2dl1: gp_Pnt2d, P2df2: gp_Pnt2d, P2dl2: gp_Pnt2d): void;

  TwistOnS1(): boolean;
  TwistOnS1(T: boolean): void;
  TwistOnS1(): boolean;
  TwistOnS1(T: boolean): void;

  TwistOnS2(): boolean;
  TwistOnS2(T: boolean): void;
  TwistOnS2(): boolean;
  TwistOnS2(T: boolean): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

ChFiDS_TypeOfConcavity: typeof ChFiDS_TypeOfConcavity[keyof typeof ChFiDS_TypeOfConcavity]

ChFiDS_HData: NCollection_HSequence_handle_ChFiDS_SurfData

ChFiDS_ListOfHElSpine: NCollection_List_handle_ChFiDS_ElSpine

ChFiDS_ListOfStripe: NCollection_List_handle_ChFiDS_Stripe

ChFiDS_SecArray1: NCollection_Array1_ChFiDS_CircSection

ChFiDS_SecHArray1: NCollection_HArray1_ChFiDS_CircSection

ChFiDS_SequenceOfSurfData: NCollection_Sequence_handle_ChFiDS_SurfData
