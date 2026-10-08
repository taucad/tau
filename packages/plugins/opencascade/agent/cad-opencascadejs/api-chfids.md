# libcascade — ChFiDS

23 top-level symbols. Signatures are verbatim typescript.

ChFiDS_ChamfMethod: typeof ChFiDS_ChamfMethod[keyof typeof ChFiDS_ChamfMethod]

  readonly ChFiDS_Sym: 'ChFiDS_Sym'

  readonly ChFiDS_TwoDist: 'ChFiDS_TwoDist'

  readonly ChFiDS_DistAngle: 'ChFiDS_DistAngle'

ChFiDS_ChamfMode: typeof ChFiDS_ChamfMode[keyof typeof ChFiDS_ChamfMode]

  readonly ChFiDS_ClassicChamfer: 'ChFiDS_ClassicChamfer'

  readonly ChFiDS_ConstThroatChamfer: 'ChFiDS_ConstThroatChamfer'

  readonly ChFiDS_ConstThroatWithPenetrationChamfer: 'ChFiDS_ConstThroatWithPenetrationChamfer'

ChFiDS_ChamfSpine: declare class ChFiDS_ChamfSpine extends ChFiDS_Spine

  // ChFiDS_ChamfSpine.constructor (constructor)
  constructor();
  constructor(Tol: number);

  // ChFiDS_ChamfSpine.SetDist (method)
  SetDist(Dis: number): void;

  // ChFiDS_ChamfSpine.GetDist (method)
  GetDist(Dis?: number): { Dis: number };

  // ChFiDS_ChamfSpine.SetDists (method)
  SetDists(Dis1: number, Dis2: number): void;

  // ChFiDS_ChamfSpine.Dists (method)
  Dists(Dis1?: number, Dis2?: number): { Dis1: number; Dis2: number };

  // ChFiDS_ChamfSpine.GetDistAngle (method)
  GetDistAngle(Dis?: number, Angle?: number): { Dis: number; Angle: number };

  // ChFiDS_ChamfSpine.SetDistAngle (method)
  SetDistAngle(Dis: number, Angle: number): void;

  // ChFiDS_ChamfSpine.SetMode (method)
  SetMode(theMode: ChFiDS_ChamfMode): void;

  // ChFiDS_ChamfSpine.IsChamfer (method)
  IsChamfer(): ChFiDS_ChamfMethod;

  // ChFiDS_ChamfSpine.get_type_name (method)
  static get_type_name(): string;

  // ChFiDS_ChamfSpine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ChFiDS_ChamfSpine.DynamicType (method)
  DynamicType(): Standard_Type;

  // ChFiDS_ChamfSpine.delete (method)
  delete(): void;

  // ChFiDS_ChamfSpine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_CircSection: declare class ChFiDS_CircSection

  // ChFiDS_CircSection.constructor (constructor)
  constructor();

  // ChFiDS_CircSection.Set (method)
  Set(C: gp_Circ, F: number, L: number): void;
  Set(C: gp_Lin, F: number, L: number): void;

  // ChFiDS_CircSection.Get (method)
  Get(C: gp_Circ, F: number, L: number): { F: number; L: number };
  Get(C: gp_Lin, F: number, L: number): { F: number; L: number };

  // ChFiDS_CircSection.delete (method)
  delete(): void;

  // ChFiDS_CircSection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_CommonPoint: declare class ChFiDS_CommonPoint

  // ChFiDS_CommonPoint.constructor (constructor)
  constructor();

  // ChFiDS_CommonPoint.Reset (method)
  Reset(): void;

  // ChFiDS_CommonPoint.SetVertex (method)
  SetVertex(theVertex: TopoDS_Vertex): void;

  // ChFiDS_CommonPoint.SetArc (method)
  SetArc(Tol: number, A: TopoDS_Edge, Param: number, TArc: TopAbs_Orientation): void;

  // ChFiDS_CommonPoint.SetParameter (method)
  SetParameter(Param: number): void;

  // ChFiDS_CommonPoint.SetPoint (method)
  SetPoint(thePoint: gp_Pnt): void;

  // ChFiDS_CommonPoint.SetVector (method)
  SetVector(theVector: gp_Vec): void;

  // ChFiDS_CommonPoint.SetTolerance (method)
  SetTolerance(Tol: number): void;

  // ChFiDS_CommonPoint.Tolerance (method)
  Tolerance(): number;

  // ChFiDS_CommonPoint.IsVertex (method)
  IsVertex(): boolean;

  // ChFiDS_CommonPoint.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // ChFiDS_CommonPoint.IsOnArc (method)
  IsOnArc(): boolean;

  // ChFiDS_CommonPoint.Arc (method)
  Arc(): TopoDS_Edge;

  // ChFiDS_CommonPoint.TransitionOnArc (method)
  TransitionOnArc(): TopAbs_Orientation;

  // ChFiDS_CommonPoint.ParameterOnArc (method)
  ParameterOnArc(): number;

  // ChFiDS_CommonPoint.Parameter (method)
  Parameter(): number;

  // ChFiDS_CommonPoint.Point (method)
  Point(): gp_Pnt;

  // ChFiDS_CommonPoint.HasVector (method)
  HasVector(): boolean;

  // ChFiDS_CommonPoint.Vector (method)
  Vector(): gp_Vec;

  // ChFiDS_CommonPoint.delete (method)
  delete(): void;

  // ChFiDS_CommonPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_ElSpine: declare class ChFiDS_ElSpine extends Adaptor3d_Curve

  // ChFiDS_ElSpine.constructor (constructor)
  constructor();

  // ChFiDS_ElSpine.get_type_name (method)
  static get_type_name(): string;

  // ChFiDS_ElSpine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ChFiDS_ElSpine.DynamicType (method)
  DynamicType(): Standard_Type;

  // ChFiDS_ElSpine.ShallowCopy (method)
  ShallowCopy(): Adaptor3d_Curve;

  // ChFiDS_ElSpine.FirstParameter (method)
  FirstParameter(): number;
  FirstParameter(P: number): void;

  // ChFiDS_ElSpine.LastParameter (method)
  LastParameter(): number;
  LastParameter(P: number): void;

  // ChFiDS_ElSpine.GetSavedFirstParameter (method)
  GetSavedFirstParameter(): number;

  // ChFiDS_ElSpine.GetSavedLastParameter (method)
  GetSavedLastParameter(): number;

  // ChFiDS_ElSpine.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // ChFiDS_ElSpine.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // ChFiDS_ElSpine.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // ChFiDS_ElSpine.Trim (method)
  Trim(First: number, Last: number, Tol: number): Adaptor3d_Curve;

  // ChFiDS_ElSpine.Resolution (method)
  Resolution(R3d: number): number;

  // ChFiDS_ElSpine.GetType (method)
  GetType(): GeomAbs_CurveType;

  // ChFiDS_ElSpine.IsPeriodic (method)
  IsPeriodic(): boolean;

  // ChFiDS_ElSpine.SetPeriodic (method)
  SetPeriodic(I: boolean): void;

  // ChFiDS_ElSpine.Period (method)
  Period(): number;

  // ChFiDS_ElSpine.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // ChFiDS_ElSpine.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // ChFiDS_ElSpine.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // ChFiDS_ElSpine.EvalD3 (method)
  EvalD3(theU: number): Geom_Curve_ResD3;

  // ChFiDS_ElSpine.SaveFirstParameter (method)
  SaveFirstParameter(): void;

  // ChFiDS_ElSpine.SaveLastParameter (method)
  SaveLastParameter(): void;

  // ChFiDS_ElSpine.SetOrigin (method)
  SetOrigin(O: number): void;

  // ChFiDS_ElSpine.FirstPointAndTgt (method)
  FirstPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

  // ChFiDS_ElSpine.LastPointAndTgt (method)
  LastPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

  // ChFiDS_ElSpine.NbVertices (method)
  NbVertices(): number;

  // ChFiDS_ElSpine.VertexWithTangent (method)
  VertexWithTangent(Index: number): gp_Ax1;

  // ChFiDS_ElSpine.SetFirstPointAndTgt (method)
  SetFirstPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

  // ChFiDS_ElSpine.SetLastPointAndTgt (method)
  SetLastPointAndTgt(P: gp_Pnt, T: gp_Vec): void;

  // ChFiDS_ElSpine.AddVertexWithTangent (method)
  AddVertexWithTangent(anAx1: gp_Ax1): void;

  // ChFiDS_ElSpine.SetCurve (method)
  SetCurve(C: Geom_Curve): void;

  // ChFiDS_ElSpine.Previous (method)
  Previous(): ChFiDS_SurfData;

  // ChFiDS_ElSpine.ChangePrevious (method)
  ChangePrevious(): ChFiDS_SurfData;

  // ChFiDS_ElSpine.Next (method)
  Next(): ChFiDS_SurfData;

  // ChFiDS_ElSpine.ChangeNext (method)
  ChangeNext(): ChFiDS_SurfData;

  // ChFiDS_ElSpine.Line (method)
  Line(): gp_Lin;

  // ChFiDS_ElSpine.Circle (method)
  Circle(): gp_Circ;

  // ChFiDS_ElSpine.Ellipse (method)
  Ellipse(): gp_Elips;

  // ChFiDS_ElSpine.Hyperbola (method)
  Hyperbola(): gp_Hypr;

  // ChFiDS_ElSpine.Parabola (method)
  Parabola(): gp_Parab;

  // ChFiDS_ElSpine.Bezier (method)
  Bezier(): Geom_BezierCurve;

  // ChFiDS_ElSpine.BSpline (method)
  BSpline(): Geom_BSplineCurve;

  // ChFiDS_ElSpine.delete (method)
  delete(): void;

  // ChFiDS_ElSpine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_ErrorStatus: typeof ChFiDS_ErrorStatus[keyof typeof ChFiDS_ErrorStatus]

  readonly ChFiDS_Ok: 'ChFiDS_Ok'

  readonly ChFiDS_Error: 'ChFiDS_Error'

  readonly ChFiDS_WalkingFailure: 'ChFiDS_WalkingFailure'

  readonly ChFiDS_StartsolFailure: 'ChFiDS_StartsolFailure'

  readonly ChFiDS_TwistedSurface: 'ChFiDS_TwistedSurface'

ChFiDS_FaceInterference: declare class ChFiDS_FaceInterference

  // ChFiDS_FaceInterference.constructor (constructor)
  constructor();

  // ChFiDS_FaceInterference.SetInterference (method)
  SetInterference(LineIndex: number, Trans: TopAbs_Orientation, PCurv1: Geom2d_Curve, PCurv2: Geom2d_Curve): void;

  // ChFiDS_FaceInterference.SetTransition (method)
  SetTransition(Trans: TopAbs_Orientation): void;

  // ChFiDS_FaceInterference.SetFirstParameter (method)
  SetFirstParameter(U1: number): void;

  // ChFiDS_FaceInterference.SetLastParameter (method)
  SetLastParameter(U1: number): void;

  // ChFiDS_FaceInterference.SetParameter (method)
  SetParameter(U1: number, IsFirst: boolean): void;

  // ChFiDS_FaceInterference.LineIndex (method)
  LineIndex(): number;

  // ChFiDS_FaceInterference.SetLineIndex (method)
  SetLineIndex(I: number): void;

  // ChFiDS_FaceInterference.Transition (method)
  Transition(): TopAbs_Orientation;

  // ChFiDS_FaceInterference.PCurveOnFace (method)
  PCurveOnFace(): Geom2d_Curve;

  // ChFiDS_FaceInterference.PCurveOnSurf (method)
  PCurveOnSurf(): Geom2d_Curve;

  // ChFiDS_FaceInterference.ChangePCurveOnFace (method)
  ChangePCurveOnFace(): Geom2d_Curve;

  // ChFiDS_FaceInterference.ChangePCurveOnSurf (method)
  ChangePCurveOnSurf(): Geom2d_Curve;

  // ChFiDS_FaceInterference.FirstParameter (method)
  FirstParameter(): number;

  // ChFiDS_FaceInterference.LastParameter (method)
  LastParameter(): number;

  // ChFiDS_FaceInterference.Parameter (method)
  Parameter(IsFirst: boolean): number;

  // ChFiDS_FaceInterference.delete (method)
  delete(): void;

  // ChFiDS_FaceInterference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_FilSpine: declare class ChFiDS_FilSpine extends ChFiDS_Spine

  // ChFiDS_FilSpine.constructor (constructor)
  constructor();
  constructor(Tol: number);

  // ChFiDS_FilSpine.Reset (method)
  Reset(AllData?: boolean): void;

  // ChFiDS_FilSpine.SetRadius (method)
  SetRadius(Radius: number): void;
  SetRadius(Radius: number, E: TopoDS_Edge): void;
  SetRadius(Radius: number, V: TopoDS_Vertex): void;
  SetRadius(UandR: gp_XY, IinC: number): void;
  SetRadius(C: Law_Function, IinC: number): void;

  // ChFiDS_FilSpine.UnSetRadius (method)
  UnSetRadius(E: TopoDS_Edge): void;
  UnSetRadius(V: TopoDS_Vertex): void;

  // ChFiDS_FilSpine.IsConstant (method)
  IsConstant(): boolean;
  IsConstant(IE: number): boolean;

  // ChFiDS_FilSpine.Radius (method)
  Radius(): number;
  Radius(IE: number): number;
  Radius(E: TopoDS_Edge): number;

  // ChFiDS_FilSpine.AppendElSpine (method)
  AppendElSpine(Els: ChFiDS_ElSpine): void;

  // ChFiDS_FilSpine.Law (method)
  Law(Els: ChFiDS_ElSpine): Law_Composite;

  // ChFiDS_FilSpine.ChangeLaw (method)
  ChangeLaw(E: TopoDS_Edge): Law_Function;

  // ChFiDS_FilSpine.MaxRadFromSeqAndLaws (method)
  MaxRadFromSeqAndLaws(): number;

  // ChFiDS_FilSpine.get_type_name (method)
  static get_type_name(): string;

  // ChFiDS_FilSpine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ChFiDS_FilSpine.DynamicType (method)
  DynamicType(): Standard_Type;

  // ChFiDS_FilSpine.delete (method)
  delete(): void;

  // ChFiDS_FilSpine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_Map: declare class ChFiDS_Map

  // ChFiDS_Map.constructor (constructor)
  constructor();

  // ChFiDS_Map.Fill (method)
  Fill(S: TopoDS_Shape, T1: TopAbs_ShapeEnum, T2: TopAbs_ShapeEnum): void;

  // ChFiDS_Map.Contains (method)
  Contains(S: TopoDS_Shape): boolean;

  // ChFiDS_Map.FindFromKey (method)
  FindFromKey(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // ChFiDS_Map.FindFromIndex (method)
  FindFromIndex(I: number): NCollection_List_TopoDS_Shape;

  // ChFiDS_Map.delete (method)
  delete(): void;

  // ChFiDS_Map.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_Regul: declare class ChFiDS_Regul

  // ChFiDS_Regul.constructor (constructor)
  constructor();

  // ChFiDS_Regul.SetCurve (method)
  SetCurve(IC: number): void;

  // ChFiDS_Regul.SetS1 (method)
  SetS1(IS1: number, IsFace?: boolean): void;

  // ChFiDS_Regul.SetS2 (method)
  SetS2(IS2: number, IsFace?: boolean): void;

  // ChFiDS_Regul.IsSurface1 (method)
  IsSurface1(): boolean;

  // ChFiDS_Regul.IsSurface2 (method)
  IsSurface2(): boolean;

  // ChFiDS_Regul.Curve (method)
  Curve(): number;

  // ChFiDS_Regul.S1 (method)
  S1(): number;

  // ChFiDS_Regul.S2 (method)
  S2(): number;

  // ChFiDS_Regul.delete (method)
  delete(): void;

  // ChFiDS_Regul.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_Spine: declare class ChFiDS_Spine extends Standard_Transient

  // ChFiDS_Spine.constructor (constructor)
  constructor();
  constructor(Tol: number);

  // ChFiDS_Spine.SetEdges (method)
  SetEdges(E: TopoDS_Edge): void;

  // ChFiDS_Spine.SetOffsetEdges (method)
  SetOffsetEdges(E: TopoDS_Edge): void;

  // ChFiDS_Spine.PutInFirst (method)
  PutInFirst(E: TopoDS_Edge): void;

  // ChFiDS_Spine.PutInFirstOffset (method)
  PutInFirstOffset(E: TopoDS_Edge): void;

  // ChFiDS_Spine.NbEdges (method)
  NbEdges(): number;

  // ChFiDS_Spine.Edges (method)
  Edges(I: number): TopoDS_Edge;

  // ChFiDS_Spine.OffsetEdges (method)
  OffsetEdges(I: number): TopoDS_Edge;

  // ChFiDS_Spine.SetFirstStatus (method)
  SetFirstStatus(S: ChFiDS_State): void;

  // ChFiDS_Spine.SetLastStatus (method)
  SetLastStatus(S: ChFiDS_State): void;

  // ChFiDS_Spine.AppendElSpine (method)
  AppendElSpine(Els: ChFiDS_ElSpine): void;

  // ChFiDS_Spine.AppendOffsetElSpine (method)
  AppendOffsetElSpine(Els: ChFiDS_ElSpine): void;

  // ChFiDS_Spine.ElSpine (method)
  ElSpine(IE: number): ChFiDS_ElSpine;
  ElSpine(E: TopoDS_Edge): ChFiDS_ElSpine;
  ElSpine(W: number): ChFiDS_ElSpine;

  // ChFiDS_Spine.ChangeElSpines (method)
  ChangeElSpines(): NCollection_List_handle_ChFiDS_ElSpine;

  // ChFiDS_Spine.ChangeOffsetElSpines (method)
  ChangeOffsetElSpines(): NCollection_List_handle_ChFiDS_ElSpine;

  // ChFiDS_Spine.Reset (method)
  Reset(AllData?: boolean): void;

  // ChFiDS_Spine.SplitDone (method)
  SplitDone(): boolean;
  SplitDone(B: boolean): void;

  // ChFiDS_Spine.Load (method)
  Load(): void;

  // ChFiDS_Spine.Resolution (method)
  Resolution(R3d: number): number;

  // ChFiDS_Spine.IsClosed (method)
  IsClosed(): boolean;

  // ChFiDS_Spine.FirstParameter (method)
  FirstParameter(): number;
  FirstParameter(IndexSpine: number): number;

  // ChFiDS_Spine.LastParameter (method)
  LastParameter(): number;
  LastParameter(IndexSpine: number): number;

  // ChFiDS_Spine.SetFirstParameter (method)
  SetFirstParameter(Par: number): void;

  // ChFiDS_Spine.SetLastParameter (method)
  SetLastParameter(Par: number): void;

  // ChFiDS_Spine.Length (method)
  Length(IndexSpine: number): number;

  // ChFiDS_Spine.IsPeriodic (method)
  IsPeriodic(): boolean;

  // ChFiDS_Spine.Period (method)
  Period(): number;

  // ChFiDS_Spine.Absc (method)
  Absc(U: number): number;
  Absc(V: TopoDS_Vertex): number;
  Absc(U: number, I: number): number;

  // ChFiDS_Spine.Parameter (method)
  Parameter(AbsC: number, U: number, Oriented: boolean): { U: number };
  Parameter(Index: number, AbsC: number, U: number, Oriented: boolean): { U: number };

  // ChFiDS_Spine.Value (method)
  Value(AbsC: number): gp_Pnt;

  // ChFiDS_Spine.D0 (method)
  D0(AbsC: number, P: gp_Pnt): void;

  // ChFiDS_Spine.D1 (method)
  D1(AbsC: number, P: gp_Pnt, V1: gp_Vec): void;

  // ChFiDS_Spine.D2 (method)
  D2(AbsC: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  // ChFiDS_Spine.SetCurrent (method)
  SetCurrent(Index: number): void;

  // ChFiDS_Spine.CurrentElementarySpine (method)
  CurrentElementarySpine(Index: number): BRepAdaptor_Curve;

  // ChFiDS_Spine.CurrentIndexOfElementarySpine (method)
  CurrentIndexOfElementarySpine(): number;

  // ChFiDS_Spine.GetType (method)
  GetType(): GeomAbs_CurveType;

  // ChFiDS_Spine.Line (method)
  Line(): gp_Lin;

  // ChFiDS_Spine.Circle (method)
  Circle(): gp_Circ;

  // ChFiDS_Spine.FirstStatus (method)
  FirstStatus(): ChFiDS_State;

  // ChFiDS_Spine.LastStatus (method)
  LastStatus(): ChFiDS_State;

  // ChFiDS_Spine.Status (method)
  Status(IsFirst: boolean): ChFiDS_State;

  // ChFiDS_Spine.GetTypeOfConcavity (method)
  GetTypeOfConcavity(): ChFiDS_TypeOfConcavity;

  // ChFiDS_Spine.SetStatus (method)
  SetStatus(S: ChFiDS_State, IsFirst: boolean): void;

  // ChFiDS_Spine.SetTypeOfConcavity (method)
  SetTypeOfConcavity(theType: ChFiDS_TypeOfConcavity): void;

  // ChFiDS_Spine.IsTangencyExtremity (method)
  IsTangencyExtremity(IsFirst: boolean): boolean;

  // ChFiDS_Spine.SetTangencyExtremity (method)
  SetTangencyExtremity(IsTangency: boolean, IsFirst: boolean): void;

  // ChFiDS_Spine.FirstVertex (method)
  FirstVertex(): TopoDS_Vertex;

  // ChFiDS_Spine.LastVertex (method)
  LastVertex(): TopoDS_Vertex;

  // ChFiDS_Spine.SetFirstTgt (method)
  SetFirstTgt(W: number): void;

  // ChFiDS_Spine.SetLastTgt (method)
  SetLastTgt(W: number): void;

  // ChFiDS_Spine.HasFirstTgt (method)
  HasFirstTgt(): boolean;

  // ChFiDS_Spine.HasLastTgt (method)
  HasLastTgt(): boolean;

  // ChFiDS_Spine.SetReference (method)
  SetReference(W: number): void;
  SetReference(I: number): void;

  // ChFiDS_Spine.Index (method)
  Index(W: number, Forward: boolean): number;
  Index(E: TopoDS_Edge): number;

  // ChFiDS_Spine.UnsetReference (method)
  UnsetReference(): void;

  // ChFiDS_Spine.SetErrorStatus (method)
  SetErrorStatus(state: ChFiDS_ErrorStatus): void;

  // ChFiDS_Spine.ErrorStatus (method)
  ErrorStatus(): ChFiDS_ErrorStatus;

  // ChFiDS_Spine.Mode (method)
  Mode(): ChFiDS_ChamfMode;

  // ChFiDS_Spine.GetTolesp (method)
  GetTolesp(): number;

  // ChFiDS_Spine.get_type_name (method)
  static get_type_name(): string;

  // ChFiDS_Spine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ChFiDS_Spine.DynamicType (method)
  DynamicType(): Standard_Type;

  // ChFiDS_Spine.delete (method)
  delete(): void;

  // ChFiDS_Spine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_State: typeof ChFiDS_State[keyof typeof ChFiDS_State]

  readonly ChFiDS_OnSame: 'ChFiDS_OnSame'

  readonly ChFiDS_OnDiff: 'ChFiDS_OnDiff'

  readonly ChFiDS_AllSame: 'ChFiDS_AllSame'

  readonly ChFiDS_BreakPoint: 'ChFiDS_BreakPoint'

  readonly ChFiDS_FreeBoundary: 'ChFiDS_FreeBoundary'

  readonly ChFiDS_Closed: 'ChFiDS_Closed'

  readonly ChFiDS_Tangent: 'ChFiDS_Tangent'

ChFiDS_Stripe: declare class ChFiDS_Stripe extends Standard_Transient

  // ChFiDS_Stripe.constructor (constructor)
  constructor();

  // ChFiDS_Stripe.Reset (method)
  Reset(): void;

  // ChFiDS_Stripe.SetOfSurfData (method)
  SetOfSurfData(): NCollection_HSequence_handle_ChFiDS_SurfData;

  // ChFiDS_Stripe.Spine (method)
  Spine(): ChFiDS_Spine;

  // ChFiDS_Stripe.OrientationOnFace1 (method)
  OrientationOnFace1(): TopAbs_Orientation;
  OrientationOnFace1(Or1: TopAbs_Orientation): void;

  // ChFiDS_Stripe.OrientationOnFace2 (method)
  OrientationOnFace2(): TopAbs_Orientation;
  OrientationOnFace2(Or2: TopAbs_Orientation): void;

  // ChFiDS_Stripe.Choix (method)
  Choix(): number;
  Choix(C: number): void;

  // ChFiDS_Stripe.ChangeSetOfSurfData (method)
  ChangeSetOfSurfData(): NCollection_HSequence_handle_ChFiDS_SurfData;

  // ChFiDS_Stripe.ChangeSpine (method)
  ChangeSpine(): ChFiDS_Spine;

  // ChFiDS_Stripe.FirstParameters (method)
  FirstParameters(Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

  // ChFiDS_Stripe.LastParameters (method)
  LastParameters(Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

  // ChFiDS_Stripe.ChangeFirstParameters (method)
  ChangeFirstParameters(Pdeb: number, Pfin: number): void;

  // ChFiDS_Stripe.ChangeLastParameters (method)
  ChangeLastParameters(Pdeb: number, Pfin: number): void;

  // ChFiDS_Stripe.FirstCurve (method)
  FirstCurve(): number;

  // ChFiDS_Stripe.LastCurve (method)
  LastCurve(): number;

  // ChFiDS_Stripe.ChangeFirstCurve (method)
  ChangeFirstCurve(Index: number): void;

  // ChFiDS_Stripe.ChangeLastCurve (method)
  ChangeLastCurve(Index: number): void;

  // ChFiDS_Stripe.FirstPCurve (method)
  FirstPCurve(): Geom2d_Curve;

  // ChFiDS_Stripe.LastPCurve (method)
  LastPCurve(): Geom2d_Curve;

  // ChFiDS_Stripe.ChangeFirstPCurve (method)
  ChangeFirstPCurve(): Geom2d_Curve;

  // ChFiDS_Stripe.ChangeLastPCurve (method)
  ChangeLastPCurve(): Geom2d_Curve;

  // ChFiDS_Stripe.FirstPCurveOrientation (method)
  FirstPCurveOrientation(): TopAbs_Orientation;
  FirstPCurveOrientation(O: TopAbs_Orientation): void;

  // ChFiDS_Stripe.LastPCurveOrientation (method)
  LastPCurveOrientation(): TopAbs_Orientation;
  LastPCurveOrientation(O: TopAbs_Orientation): void;

  // ChFiDS_Stripe.IndexFirstPointOnS1 (method)
  IndexFirstPointOnS1(): number;

  // ChFiDS_Stripe.IndexFirstPointOnS2 (method)
  IndexFirstPointOnS2(): number;

  // ChFiDS_Stripe.IndexLastPointOnS1 (method)
  IndexLastPointOnS1(): number;

  // ChFiDS_Stripe.IndexLastPointOnS2 (method)
  IndexLastPointOnS2(): number;

  // ChFiDS_Stripe.ChangeIndexFirstPointOnS1 (method)
  ChangeIndexFirstPointOnS1(Index: number): void;

  // ChFiDS_Stripe.ChangeIndexFirstPointOnS2 (method)
  ChangeIndexFirstPointOnS2(Index: number): void;

  // ChFiDS_Stripe.ChangeIndexLastPointOnS1 (method)
  ChangeIndexLastPointOnS1(Index: number): void;

  // ChFiDS_Stripe.ChangeIndexLastPointOnS2 (method)
  ChangeIndexLastPointOnS2(Index: number): void;

  // ChFiDS_Stripe.Parameters (method)
  Parameters(First: boolean, Pdeb?: number, Pfin?: number): { Pdeb: number; Pfin: number };

  // ChFiDS_Stripe.SetParameters (method)
  SetParameters(First: boolean, Pdeb: number, Pfin: number): void;

  // ChFiDS_Stripe.Curve (method)
  Curve(First: boolean): number;

  // ChFiDS_Stripe.SetCurve (method)
  SetCurve(Index: number, First: boolean): void;

  // ChFiDS_Stripe.PCurve (method)
  PCurve(First: boolean): Geom2d_Curve;

  // ChFiDS_Stripe.ChangePCurve (method)
  ChangePCurve(First: boolean): Geom2d_Curve;

  // ChFiDS_Stripe.Orientation (method)
  Orientation(OnS: number): TopAbs_Orientation;
  Orientation(First: boolean): TopAbs_Orientation;

  // ChFiDS_Stripe.SetOrientation (method)
  SetOrientation(Or: TopAbs_Orientation, OnS: number): void;
  SetOrientation(Or: TopAbs_Orientation, First: boolean): void;

  // ChFiDS_Stripe.IndexPoint (method)
  IndexPoint(First: boolean, OnS: number): number;

  // ChFiDS_Stripe.SetIndexPoint (method)
  SetIndexPoint(Index: number, First: boolean, OnS: number): void;

  // ChFiDS_Stripe.SolidIndex (method)
  SolidIndex(): number;

  // ChFiDS_Stripe.SetSolidIndex (method)
  SetSolidIndex(Index: number): void;

  // ChFiDS_Stripe.InDS (method)
  InDS(First: boolean, Nb?: number): void;

  // ChFiDS_Stripe.IsInDS (method)
  IsInDS(First: boolean): number;

  // ChFiDS_Stripe.get_type_name (method)
  static get_type_name(): string;

  // ChFiDS_Stripe.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ChFiDS_Stripe.DynamicType (method)
  DynamicType(): Standard_Type;

  // ChFiDS_Stripe.delete (method)
  delete(): void;

  // ChFiDS_Stripe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_StripeMap: declare class ChFiDS_StripeMap

  // ChFiDS_StripeMap.constructor (constructor)
  constructor();

  // ChFiDS_StripeMap.Add (method)
  Add(V: TopoDS_Vertex, F: ChFiDS_Stripe): void;

  // ChFiDS_StripeMap.Extent (method)
  Extent(): number;

  // ChFiDS_StripeMap.FindFromKey (method)
  FindFromKey(V: TopoDS_Vertex): NCollection_List_handle_ChFiDS_Stripe;

  // ChFiDS_StripeMap.FindFromIndex (method)
  FindFromIndex(I: number): NCollection_List_handle_ChFiDS_Stripe;

  // ChFiDS_StripeMap.FindKey (method)
  FindKey(I: number): TopoDS_Vertex;

  // ChFiDS_StripeMap.Clear (method)
  Clear(): void;

  // ChFiDS_StripeMap.delete (method)
  delete(): void;

  // ChFiDS_StripeMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_SurfData: declare class ChFiDS_SurfData extends Standard_Transient

  // ChFiDS_SurfData.constructor (constructor)
  constructor();

  // ChFiDS_SurfData.Copy (method)
  Copy(Other: ChFiDS_SurfData): void;

  // ChFiDS_SurfData.IndexOfS1 (method)
  IndexOfS1(): number;

  // ChFiDS_SurfData.IndexOfS2 (method)
  IndexOfS2(): number;

  // ChFiDS_SurfData.IsOnCurve1 (method)
  IsOnCurve1(): boolean;

  // ChFiDS_SurfData.IsOnCurve2 (method)
  IsOnCurve2(): boolean;

  // ChFiDS_SurfData.IndexOfC1 (method)
  IndexOfC1(): number;

  // ChFiDS_SurfData.IndexOfC2 (method)
  IndexOfC2(): number;

  // ChFiDS_SurfData.Surf (method)
  Surf(): number;

  // ChFiDS_SurfData.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // ChFiDS_SurfData.InterferenceOnS1 (method)
  InterferenceOnS1(): ChFiDS_FaceInterference;

  // ChFiDS_SurfData.InterferenceOnS2 (method)
  InterferenceOnS2(): ChFiDS_FaceInterference;

  // ChFiDS_SurfData.VertexFirstOnS1 (method)
  VertexFirstOnS1(): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.VertexFirstOnS2 (method)
  VertexFirstOnS2(): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.VertexLastOnS1 (method)
  VertexLastOnS1(): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.VertexLastOnS2 (method)
  VertexLastOnS2(): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.ChangeIndexOfS1 (method)
  ChangeIndexOfS1(Index: number): void;

  // ChFiDS_SurfData.ChangeIndexOfS2 (method)
  ChangeIndexOfS2(Index: number): void;

  // ChFiDS_SurfData.ChangeSurf (method)
  ChangeSurf(Index: number): void;

  // ChFiDS_SurfData.SetIndexOfC1 (method)
  SetIndexOfC1(Index: number): void;

  // ChFiDS_SurfData.SetIndexOfC2 (method)
  SetIndexOfC2(Index: number): void;

  // ChFiDS_SurfData.ChangeOrientation (method)
  ChangeOrientation(): TopAbs_Orientation;

  // ChFiDS_SurfData.ChangeInterferenceOnS1 (method)
  ChangeInterferenceOnS1(): ChFiDS_FaceInterference;

  // ChFiDS_SurfData.ChangeInterferenceOnS2 (method)
  ChangeInterferenceOnS2(): ChFiDS_FaceInterference;

  // ChFiDS_SurfData.ChangeVertexFirstOnS1 (method)
  ChangeVertexFirstOnS1(): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.ChangeVertexFirstOnS2 (method)
  ChangeVertexFirstOnS2(): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.ChangeVertexLastOnS1 (method)
  ChangeVertexLastOnS1(): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.ChangeVertexLastOnS2 (method)
  ChangeVertexLastOnS2(): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.Interference (method)
  Interference(OnS: number): ChFiDS_FaceInterference;

  // ChFiDS_SurfData.ChangeInterference (method)
  ChangeInterference(OnS: number): ChFiDS_FaceInterference;

  // ChFiDS_SurfData.Index (method)
  Index(OfS: number): number;

  // ChFiDS_SurfData.Vertex (method)
  Vertex(First: boolean, OnS: number): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.ChangeVertex (method)
  ChangeVertex(First: boolean, OnS: number): ChFiDS_CommonPoint;

  // ChFiDS_SurfData.IsOnCurve (method)
  IsOnCurve(OnS: number): boolean;

  // ChFiDS_SurfData.IndexOfC (method)
  IndexOfC(OnS: number): number;

  // ChFiDS_SurfData.FirstSpineParam (method)
  FirstSpineParam(): number;
  FirstSpineParam(Par: number): void;

  // ChFiDS_SurfData.LastSpineParam (method)
  LastSpineParam(): number;
  LastSpineParam(Par: number): void;

  // ChFiDS_SurfData.FirstExtensionValue (method)
  FirstExtensionValue(): number;
  FirstExtensionValue(Extend: number): void;

  // ChFiDS_SurfData.LastExtensionValue (method)
  LastExtensionValue(): number;
  LastExtensionValue(Extend: number): void;

  // ChFiDS_SurfData.Simul (method)
  Simul(): Standard_Transient;

  // ChFiDS_SurfData.SetSimul (method)
  SetSimul(S: Standard_Transient): void;

  // ChFiDS_SurfData.ResetSimul (method)
  ResetSimul(): void;

  // ChFiDS_SurfData.Get2dPoints (method)
  Get2dPoints(First: boolean, OnS: number): gp_Pnt2d;
  Get2dPoints(P2df1: gp_Pnt2d, P2dl1: gp_Pnt2d, P2df2: gp_Pnt2d, P2dl2: gp_Pnt2d): void;

  // ChFiDS_SurfData.Set2dPoints (method)
  Set2dPoints(P2df1: gp_Pnt2d, P2dl1: gp_Pnt2d, P2df2: gp_Pnt2d, P2dl2: gp_Pnt2d): void;

  // ChFiDS_SurfData.TwistOnS1 (method)
  TwistOnS1(): boolean;
  TwistOnS1(T: boolean): void;

  // ChFiDS_SurfData.TwistOnS2 (method)
  TwistOnS2(): boolean;
  TwistOnS2(T: boolean): void;

  // ChFiDS_SurfData.get_type_name (method)
  static get_type_name(): string;

  // ChFiDS_SurfData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ChFiDS_SurfData.DynamicType (method)
  DynamicType(): Standard_Type;

  // ChFiDS_SurfData.delete (method)
  delete(): void;

  // ChFiDS_SurfData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ChFiDS_TypeOfConcavity: typeof ChFiDS_TypeOfConcavity[keyof typeof ChFiDS_TypeOfConcavity]

  readonly ChFiDS_Concave: 'ChFiDS_Concave'

  readonly ChFiDS_Convex: 'ChFiDS_Convex'

  readonly ChFiDS_Tangential: 'ChFiDS_Tangential'

  readonly ChFiDS_FreeBound: 'ChFiDS_FreeBound'

  readonly ChFiDS_Other: 'ChFiDS_Other'

  readonly ChFiDS_Mixed: 'ChFiDS_Mixed'

ChFiDS_HData: NCollection_HSequence_handle_ChFiDS_SurfData

ChFiDS_ListOfHElSpine: NCollection_List_handle_ChFiDS_ElSpine

ChFiDS_ListOfStripe: NCollection_List_handle_ChFiDS_Stripe

ChFiDS_SecArray1: NCollection_Array1_ChFiDS_CircSection

ChFiDS_SecHArray1: NCollection_HArray1_ChFiDS_CircSection

ChFiDS_SequenceOfSurfData: NCollection_Sequence_handle_ChFiDS_SurfData
