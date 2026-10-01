# libcascade — BRepBlend

16 top-level symbols. Signatures are verbatim typescript.

BRepBlend_AppFunc: declare class BRepBlend_AppFunc extends BRepBlend_AppFuncRoot

  // BRepBlend_AppFunc.constructor (constructor)
  constructor(Line: BRepBlend_Line, Func: Blend_Function, Tol3d: number, Tol2d: number);

  // BRepBlend_AppFunc.Point (method)
  Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  // BRepBlend_AppFunc.Vec (method)
  Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  // BRepBlend_AppFunc.get_type_name (method)
  static get_type_name(): string;

  // BRepBlend_AppFunc.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepBlend_AppFunc.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepBlend_AppFunc.delete (method)
  delete(): void;

  // BRepBlend_AppFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_AppFuncRoot: declare class BRepBlend_AppFuncRoot extends Approx_SweepFunction

  // BRepBlend_AppFuncRoot.D0 (method)
  D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;

  // BRepBlend_AppFuncRoot.D1 (method)
  D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  // BRepBlend_AppFuncRoot.D2 (method)
  D2(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // BRepBlend_AppFuncRoot.Nb2dCurves (method)
  Nb2dCurves(): number;

  // BRepBlend_AppFuncRoot.SectionShape (method)
  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  // BRepBlend_AppFuncRoot.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BRepBlend_AppFuncRoot.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BRepBlend_AppFuncRoot.IsRational (method)
  IsRational(): boolean;

  // BRepBlend_AppFuncRoot.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BRepBlend_AppFuncRoot.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepBlend_AppFuncRoot.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // BRepBlend_AppFuncRoot.Resolution (method)
  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BRepBlend_AppFuncRoot.GetTolerance (method)
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  // BRepBlend_AppFuncRoot.SetTolerance (method)
  SetTolerance(Tol3d: number, Tol2d: number): void;

  // BRepBlend_AppFuncRoot.BarycentreOfSurf (method)
  BarycentreOfSurf(): gp_Pnt;

  // BRepBlend_AppFuncRoot.MaximalSection (method)
  MaximalSection(): number;

  // BRepBlend_AppFuncRoot.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BRepBlend_AppFuncRoot.Point (method)
  Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  // BRepBlend_AppFuncRoot.Vec (method)
  Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  // BRepBlend_AppFuncRoot.get_type_name (method)
  static get_type_name(): string;

  // BRepBlend_AppFuncRoot.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepBlend_AppFuncRoot.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepBlend_AppFuncRoot.delete (method)
  delete(): void;

  // BRepBlend_AppFuncRoot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_AppFuncRst: declare class BRepBlend_AppFuncRst extends BRepBlend_AppFuncRoot

  // BRepBlend_AppFuncRst.constructor (constructor)
  constructor(Line: BRepBlend_Line, Func: Blend_SurfRstFunction, Tol3d: number, Tol2d: number);

  // BRepBlend_AppFuncRst.Point (method)
  Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  // BRepBlend_AppFuncRst.Vec (method)
  Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  // BRepBlend_AppFuncRst.get_type_name (method)
  static get_type_name(): string;

  // BRepBlend_AppFuncRst.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepBlend_AppFuncRst.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepBlend_AppFuncRst.delete (method)
  delete(): void;

  // BRepBlend_AppFuncRst.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_AppFuncRstRst: declare class BRepBlend_AppFuncRstRst extends BRepBlend_AppFuncRoot

  // BRepBlend_AppFuncRstRst.constructor (constructor)
  constructor(Line: BRepBlend_Line, Func: Blend_RstRstFunction, Tol3d: number, Tol2d: number);

  // BRepBlend_AppFuncRstRst.Point (method)
  Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  // BRepBlend_AppFuncRstRst.Vec (method)
  Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  // BRepBlend_AppFuncRstRst.get_type_name (method)
  static get_type_name(): string;

  // BRepBlend_AppFuncRstRst.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepBlend_AppFuncRstRst.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepBlend_AppFuncRstRst.delete (method)
  delete(): void;

  // BRepBlend_AppFuncRstRst.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_AppSurf: declare class BRepBlend_AppSurf extends AppBlend_Approx

  // BRepBlend_AppSurf.constructor (constructor)
  constructor();
  constructor(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean);

  // BRepBlend_AppSurf.Init (method)
  Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

  // BRepBlend_AppSurf.SetParType (method)
  SetParType(ParType: Approx_ParametrizationType): void;

  // BRepBlend_AppSurf.SetContinuity (method)
  SetContinuity(C: GeomAbs_Shape): void;

  // BRepBlend_AppSurf.SetCriteriumWeight (method)
  SetCriteriumWeight(W1: number, W2: number, W3: number): void;

  // BRepBlend_AppSurf.ParType (method)
  ParType(): Approx_ParametrizationType;

  // BRepBlend_AppSurf.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // BRepBlend_AppSurf.CriteriumWeight (method)
  CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

  // BRepBlend_AppSurf.Perform (method)
  Perform(Lin: BRepBlend_Line, SecGen: Blend_AppFunction, SpApprox: boolean): void;
  Perform(Lin: BRepBlend_Line, SecGen: Blend_AppFunction, NbMaxP: number): void;

  // BRepBlend_AppSurf.PerformSmoothing (method)
  PerformSmoothing(Lin: BRepBlend_Line, SecGen: Blend_AppFunction): void;

  // BRepBlend_AppSurf.IsDone (method)
  IsDone(): boolean;

  // BRepBlend_AppSurf.SurfShape (method)
  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  // BRepBlend_AppSurf.Surface (method)
  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  // BRepBlend_AppSurf.UDegree (method)
  UDegree(): number;

  // BRepBlend_AppSurf.VDegree (method)
  VDegree(): number;

  // BRepBlend_AppSurf.SurfPoles (method)
  SurfPoles(): NCollection_Array2_gp_Pnt;

  // BRepBlend_AppSurf.SurfWeights (method)
  SurfWeights(): NCollection_Array2_double;

  // BRepBlend_AppSurf.SurfUKnots (method)
  SurfUKnots(): NCollection_Array1_double;

  // BRepBlend_AppSurf.SurfVKnots (method)
  SurfVKnots(): NCollection_Array1_double;

  // BRepBlend_AppSurf.SurfUMults (method)
  SurfUMults(): NCollection_Array1_int;

  // BRepBlend_AppSurf.SurfVMults (method)
  SurfVMults(): NCollection_Array1_int;

  // BRepBlend_AppSurf.NbCurves2d (method)
  NbCurves2d(): number;

  // BRepBlend_AppSurf.Curves2dShape (method)
  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  // BRepBlend_AppSurf.Curve2d (method)
  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  // BRepBlend_AppSurf.Curves2dDegree (method)
  Curves2dDegree(): number;

  // BRepBlend_AppSurf.Curve2dPoles (method)
  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  // BRepBlend_AppSurf.Curves2dKnots (method)
  Curves2dKnots(): NCollection_Array1_double;

  // BRepBlend_AppSurf.Curves2dMults (method)
  Curves2dMults(): NCollection_Array1_int;

  // BRepBlend_AppSurf.TolReached (method)
  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  // BRepBlend_AppSurf.TolCurveOnSurf (method)
  TolCurveOnSurf(Index: number): number;

  // BRepBlend_AppSurf.delete (method)
  delete(): void;

  // BRepBlend_AppSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_AppSurface: declare class BRepBlend_AppSurface extends AppBlend_Approx

  // BRepBlend_AppSurface.constructor (constructor)
  constructor(Funct: Approx_SweepFunction, First: number, Last: number, Tol3d: number, Tol2d: number, TolAngular: number, Continuity?: GeomAbs_Shape, Degmax?: number, Segmax?: number);

  // BRepBlend_AppSurface.IsDone (method)
  IsDone(): boolean;

  // BRepBlend_AppSurface.SurfShape (method)
  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  // BRepBlend_AppSurface.Surface (method)
  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  // BRepBlend_AppSurface.UDegree (method)
  UDegree(): number;

  // BRepBlend_AppSurface.VDegree (method)
  VDegree(): number;

  // BRepBlend_AppSurface.SurfPoles (method)
  SurfPoles(): NCollection_Array2_gp_Pnt;

  // BRepBlend_AppSurface.SurfWeights (method)
  SurfWeights(): NCollection_Array2_double;

  // BRepBlend_AppSurface.SurfUKnots (method)
  SurfUKnots(): NCollection_Array1_double;

  // BRepBlend_AppSurface.SurfVKnots (method)
  SurfVKnots(): NCollection_Array1_double;

  // BRepBlend_AppSurface.SurfUMults (method)
  SurfUMults(): NCollection_Array1_int;

  // BRepBlend_AppSurface.SurfVMults (method)
  SurfVMults(): NCollection_Array1_int;

  // BRepBlend_AppSurface.MaxErrorOnSurf (method)
  MaxErrorOnSurf(): number;

  // BRepBlend_AppSurface.NbCurves2d (method)
  NbCurves2d(): number;

  // BRepBlend_AppSurface.Curves2dShape (method)
  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  // BRepBlend_AppSurface.Curve2d (method)
  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  // BRepBlend_AppSurface.Curves2dDegree (method)
  Curves2dDegree(): number;

  // BRepBlend_AppSurface.Curve2dPoles (method)
  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  // BRepBlend_AppSurface.Curves2dKnots (method)
  Curves2dKnots(): NCollection_Array1_double;

  // BRepBlend_AppSurface.Curves2dMults (method)
  Curves2dMults(): NCollection_Array1_int;

  // BRepBlend_AppSurface.TolReached (method)
  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  // BRepBlend_AppSurface.Max2dError (method)
  Max2dError(Index: number): number;

  // BRepBlend_AppSurface.TolCurveOnSurf (method)
  TolCurveOnSurf(Index: number): number;

  // BRepBlend_AppSurface.delete (method)
  delete(): void;

  // BRepBlend_AppSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_BlendTool: declare class BRepBlend_BlendTool

  // BRepBlend_BlendTool.constructor (constructor)
  constructor();

  // BRepBlend_BlendTool.Project (method)
  static Project(P: gp_Pnt2d, S: Adaptor3d_Surface, C: Adaptor2d_Curve2d, Paramproj?: number, Dist?: number): { returnValue: boolean; Paramproj: number; Dist: number };

  // BRepBlend_BlendTool.Inters (method)
  static Inters(P1: gp_Pnt2d, P2: gp_Pnt2d, S: Adaptor3d_Surface, C: Adaptor2d_Curve2d, Param?: number, Dist?: number): { returnValue: boolean; Param: number; Dist: number };

  // BRepBlend_BlendTool.Parameter (method)
  static Parameter(V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d): number;

  // BRepBlend_BlendTool.Tolerance (method)
  static Tolerance(V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d): number;

  // BRepBlend_BlendTool.SingularOnUMin (method)
  static SingularOnUMin(S: Adaptor3d_Surface): boolean;

  // BRepBlend_BlendTool.SingularOnUMax (method)
  static SingularOnUMax(S: Adaptor3d_Surface): boolean;

  // BRepBlend_BlendTool.SingularOnVMin (method)
  static SingularOnVMin(S: Adaptor3d_Surface): boolean;

  // BRepBlend_BlendTool.SingularOnVMax (method)
  static SingularOnVMax(S: Adaptor3d_Surface): boolean;

  // BRepBlend_BlendTool.NbSamplesU (method)
  static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

  // BRepBlend_BlendTool.NbSamplesV (method)
  static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

  // BRepBlend_BlendTool.Bounds (method)
  static Bounds(C: Adaptor2d_Curve2d, Ufirst?: number, Ulast?: number): { Ufirst: number; Ulast: number };

  // BRepBlend_BlendTool.CurveOnSurf (method)
  static CurveOnSurf(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): Adaptor2d_Curve2d;

  // BRepBlend_BlendTool.delete (method)
  delete(): void;

  // BRepBlend_BlendTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_CSWalking: declare class BRepBlend_CSWalking

  // BRepBlend_CSWalking.constructor (constructor)
  constructor(Curv: Adaptor3d_Curve, Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool);

  // BRepBlend_CSWalking.Perform (method)
  Perform(F: Blend_CSFunction, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

  // BRepBlend_CSWalking.Complete (method)
  Complete(F: Blend_CSFunction, Pmin: number): boolean;

  // BRepBlend_CSWalking.IsDone (method)
  IsDone(): boolean;

  // BRepBlend_CSWalking.Line (method)
  Line(): BRepBlend_Line;

  // BRepBlend_CSWalking.delete (method)
  delete(): void;

  // BRepBlend_CSWalking.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_CurvPointRadInv: declare class BRepBlend_CurvPointRadInv extends Blend_CurvPointFuncInv

  // BRepBlend_CurvPointRadInv.constructor (constructor)
  constructor(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve);

  // BRepBlend_CurvPointRadInv.Set (method)
  Set(Choix: number): void;
  Set(P: gp_Pnt): void;

  // BRepBlend_CurvPointRadInv.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_CurvPointRadInv.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_CurvPointRadInv.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_CurvPointRadInv.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_CurvPointRadInv.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  // BRepBlend_CurvPointRadInv.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_CurvPointRadInv.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_CurvPointRadInv.delete (method)
  delete(): void;

  // BRepBlend_CurvPointRadInv.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_Extremity: declare class BRepBlend_Extremity

  // BRepBlend_Extremity.constructor (constructor)
  constructor();
  constructor(P: gp_Pnt, W: number, Param: number, Tol: number);
  constructor(P: gp_Pnt, U: number, V: number, Param: number, Tol: number);
  constructor(P: gp_Pnt, U: number, V: number, Param: number, Tol: number, Vtx: Adaptor3d_HVertex);

  // BRepBlend_Extremity.SetValue (method)
  SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number): void;
  SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number, Vtx: Adaptor3d_HVertex): void;
  SetValue(P: gp_Pnt, W: number, Param: number, Tol: number): void;

  // BRepBlend_Extremity.Value (method)
  Value(): gp_Pnt;

  // BRepBlend_Extremity.SetTangent (method)
  SetTangent(Tangent: gp_Vec): void;

  // BRepBlend_Extremity.HasTangent (method)
  HasTangent(): boolean;

  // BRepBlend_Extremity.Tangent (method)
  Tangent(): gp_Vec;

  // BRepBlend_Extremity.Tolerance (method)
  Tolerance(): number;

  // BRepBlend_Extremity.SetVertex (method)
  SetVertex(V: Adaptor3d_HVertex): void;

  // BRepBlend_Extremity.AddArc (method)
  AddArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

  // BRepBlend_Extremity.Parameters (method)
  Parameters(U?: number, V?: number): { U: number; V: number };

  // BRepBlend_Extremity.IsVertex (method)
  IsVertex(): boolean;

  // BRepBlend_Extremity.Vertex (method)
  Vertex(): Adaptor3d_HVertex;

  // BRepBlend_Extremity.NbPointOnRst (method)
  NbPointOnRst(): number;

  // BRepBlend_Extremity.PointOnRst (method)
  PointOnRst(Index: number): BRepBlend_PointOnRst;

  // BRepBlend_Extremity.Parameter (method)
  Parameter(): number;

  // BRepBlend_Extremity.ParameterOnGuide (method)
  ParameterOnGuide(): number;

  // BRepBlend_Extremity.delete (method)
  delete(): void;

  // BRepBlend_Extremity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_HCurve2dTool: declare class BRepBlend_HCurve2dTool

  // BRepBlend_HCurve2dTool.constructor (constructor)
  constructor();

  // BRepBlend_HCurve2dTool.FirstParameter (method)
  static FirstParameter(C: Adaptor2d_Curve2d): number;

  // BRepBlend_HCurve2dTool.LastParameter (method)
  static LastParameter(C: Adaptor2d_Curve2d): number;

  // BRepBlend_HCurve2dTool.Continuity (method)
  static Continuity(C: Adaptor2d_Curve2d): GeomAbs_Shape;

  // BRepBlend_HCurve2dTool.NbIntervals (method)
  static NbIntervals(C: Adaptor2d_Curve2d, S: GeomAbs_Shape): number;

  // BRepBlend_HCurve2dTool.Intervals (method)
  static Intervals(C: Adaptor2d_Curve2d, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepBlend_HCurve2dTool.IsClosed (method)
  static IsClosed(C: Adaptor2d_Curve2d): boolean;

  // BRepBlend_HCurve2dTool.IsPeriodic (method)
  static IsPeriodic(C: Adaptor2d_Curve2d): boolean;

  // BRepBlend_HCurve2dTool.Period (method)
  static Period(C: Adaptor2d_Curve2d): number;

  // BRepBlend_HCurve2dTool.Value (method)
  static Value(C: Adaptor2d_Curve2d, U: number): gp_Pnt2d;

  // BRepBlend_HCurve2dTool.D0 (method)
  static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;

  // BRepBlend_HCurve2dTool.D1 (method)
  static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  // BRepBlend_HCurve2dTool.D2 (method)
  static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  // BRepBlend_HCurve2dTool.D3 (method)
  static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  // BRepBlend_HCurve2dTool.DN (method)
  static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

  // BRepBlend_HCurve2dTool.Resolution (method)
  static Resolution(C: Adaptor2d_Curve2d, R3d: number): number;

  // BRepBlend_HCurve2dTool.GetType (method)
  static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

  // BRepBlend_HCurve2dTool.Line (method)
  static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

  // BRepBlend_HCurve2dTool.Circle (method)
  static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

  // BRepBlend_HCurve2dTool.Ellipse (method)
  static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

  // BRepBlend_HCurve2dTool.Hyperbola (method)
  static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

  // BRepBlend_HCurve2dTool.Parabola (method)
  static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

  // BRepBlend_HCurve2dTool.Bezier (method)
  static Bezier(C: Adaptor2d_Curve2d): Geom2d_BezierCurve;

  // BRepBlend_HCurve2dTool.BSpline (method)
  static BSpline(C: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

  // BRepBlend_HCurve2dTool.NbSamples (method)
  static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

  // BRepBlend_HCurve2dTool.delete (method)
  delete(): void;

  // BRepBlend_HCurve2dTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_HCurveTool: declare class BRepBlend_HCurveTool

  // BRepBlend_HCurveTool.constructor (constructor)
  constructor();

  // BRepBlend_HCurveTool.FirstParameter (method)
  static FirstParameter(C: Adaptor3d_Curve): number;

  // BRepBlend_HCurveTool.LastParameter (method)
  static LastParameter(C: Adaptor3d_Curve): number;

  // BRepBlend_HCurveTool.Continuity (method)
  static Continuity(C: Adaptor3d_Curve): GeomAbs_Shape;

  // BRepBlend_HCurveTool.NbIntervals (method)
  static NbIntervals(C: Adaptor3d_Curve, S: GeomAbs_Shape): number;

  // BRepBlend_HCurveTool.Intervals (method)
  static Intervals(C: Adaptor3d_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepBlend_HCurveTool.IsClosed (method)
  static IsClosed(C: Adaptor3d_Curve): boolean;

  // BRepBlend_HCurveTool.IsPeriodic (method)
  static IsPeriodic(C: Adaptor3d_Curve): boolean;

  // BRepBlend_HCurveTool.Period (method)
  static Period(C: Adaptor3d_Curve): number;

  // BRepBlend_HCurveTool.Value (method)
  static Value(C: Adaptor3d_Curve, U: number): gp_Pnt;

  // BRepBlend_HCurveTool.D0 (method)
  static D0(C: Adaptor3d_Curve, U: number, P: gp_Pnt): void;

  // BRepBlend_HCurveTool.D1 (method)
  static D1(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V: gp_Vec): void;

  // BRepBlend_HCurveTool.D2 (method)
  static D2(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  // BRepBlend_HCurveTool.D3 (method)
  static D3(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  // BRepBlend_HCurveTool.DN (method)
  static DN(C: Adaptor3d_Curve, U: number, N: number): gp_Vec;

  // BRepBlend_HCurveTool.Resolution (method)
  static Resolution(C: Adaptor3d_Curve, R3d: number): number;

  // BRepBlend_HCurveTool.GetType (method)
  static GetType(C: Adaptor3d_Curve): GeomAbs_CurveType;

  // BRepBlend_HCurveTool.Line (method)
  static Line(C: Adaptor3d_Curve): gp_Lin;

  // BRepBlend_HCurveTool.Circle (method)
  static Circle(C: Adaptor3d_Curve): gp_Circ;

  // BRepBlend_HCurveTool.Ellipse (method)
  static Ellipse(C: Adaptor3d_Curve): gp_Elips;

  // BRepBlend_HCurveTool.Hyperbola (method)
  static Hyperbola(C: Adaptor3d_Curve): gp_Hypr;

  // BRepBlend_HCurveTool.Parabola (method)
  static Parabola(C: Adaptor3d_Curve): gp_Parab;

  // BRepBlend_HCurveTool.Bezier (method)
  static Bezier(C: Adaptor3d_Curve): Geom_BezierCurve;

  // BRepBlend_HCurveTool.BSpline (method)
  static BSpline(C: Adaptor3d_Curve): Geom_BSplineCurve;

  // BRepBlend_HCurveTool.NbSamples (method)
  static NbSamples(C: Adaptor3d_Curve, U0: number, U1: number): number;

  // BRepBlend_HCurveTool.delete (method)
  delete(): void;

  // BRepBlend_HCurveTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_Line: declare class BRepBlend_Line extends Standard_Transient

  // BRepBlend_Line.constructor (constructor)
  constructor();

  // BRepBlend_Line.Clear (method)
  Clear(): void;

  // BRepBlend_Line.Append (method)
  Append(P: Blend_Point): void;

  // BRepBlend_Line.Prepend (method)
  Prepend(P: Blend_Point): void;

  // BRepBlend_Line.InsertBefore (method)
  InsertBefore(Index: number, P: Blend_Point): void;

  // BRepBlend_Line.Remove (method)
  Remove(FromIndex: number, ToIndex: number): void;

  // BRepBlend_Line.Set (method)
  Set(TranS1: IntSurf_TypeTrans, TranS2: IntSurf_TypeTrans): void;
  Set(Trans: IntSurf_TypeTrans): void;

  // BRepBlend_Line.SetStartPoints (method)
  SetStartPoints(StartPt1: BRepBlend_Extremity, StartPt2: BRepBlend_Extremity): void;

  // BRepBlend_Line.SetEndPoints (method)
  SetEndPoints(EndPt1: BRepBlend_Extremity, EndPt2: BRepBlend_Extremity): void;

  // BRepBlend_Line.NbPoints (method)
  NbPoints(): number;

  // BRepBlend_Line.Point (method)
  Point(Index: number): Blend_Point;

  // BRepBlend_Line.TransitionOnS1 (method)
  TransitionOnS1(): IntSurf_TypeTrans;

  // BRepBlend_Line.TransitionOnS2 (method)
  TransitionOnS2(): IntSurf_TypeTrans;

  // BRepBlend_Line.StartPointOnFirst (method)
  StartPointOnFirst(): BRepBlend_Extremity;

  // BRepBlend_Line.StartPointOnSecond (method)
  StartPointOnSecond(): BRepBlend_Extremity;

  // BRepBlend_Line.EndPointOnFirst (method)
  EndPointOnFirst(): BRepBlend_Extremity;

  // BRepBlend_Line.EndPointOnSecond (method)
  EndPointOnSecond(): BRepBlend_Extremity;

  // BRepBlend_Line.TransitionOnS (method)
  TransitionOnS(): IntSurf_TypeTrans;

  // BRepBlend_Line.get_type_name (method)
  static get_type_name(): string;

  // BRepBlend_Line.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepBlend_Line.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepBlend_Line.delete (method)
  delete(): void;

  // BRepBlend_Line.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_PointOnRst: declare class BRepBlend_PointOnRst

  // BRepBlend_PointOnRst.constructor (constructor)
  constructor();
  constructor(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition);

  // BRepBlend_PointOnRst.SetArc (method)
  SetArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

  // BRepBlend_PointOnRst.Arc (method)
  Arc(): Adaptor2d_Curve2d;

  // BRepBlend_PointOnRst.TransitionOnLine (method)
  TransitionOnLine(): IntSurf_Transition;

  // BRepBlend_PointOnRst.TransitionOnArc (method)
  TransitionOnArc(): IntSurf_Transition;

  // BRepBlend_PointOnRst.ParameterOnArc (method)
  ParameterOnArc(): number;

  // BRepBlend_PointOnRst.delete (method)
  delete(): void;

  // BRepBlend_PointOnRst.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_RstRstConstRad: declare class BRepBlend_RstRstConstRad extends Blend_RstRstFunction

  // BRepBlend_RstRstConstRad.constructor (constructor)
  constructor(Surf1: Adaptor3d_Surface, Rst1: Adaptor2d_Curve2d, Surf2: Adaptor3d_Surface, Rst2: Adaptor2d_Curve2d, CGuide: Adaptor3d_Curve);

  // BRepBlend_RstRstConstRad.NbVariables (method)
  NbVariables(): number;

  // BRepBlend_RstRstConstRad.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_RstRstConstRad.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_RstRstConstRad.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_RstRstConstRad.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_RstRstConstRad.Set (method)
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;

  // BRepBlend_RstRstConstRad.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BRepBlend_RstRstConstRad.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_RstRstConstRad.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_RstRstConstRad.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BRepBlend_RstRstConstRad.PointOnRst1 (method)
  PointOnRst1(): gp_Pnt;

  // BRepBlend_RstRstConstRad.PointOnRst2 (method)
  PointOnRst2(): gp_Pnt;

  // BRepBlend_RstRstConstRad.Pnt2dOnRst1 (method)
  Pnt2dOnRst1(): gp_Pnt2d;

  // BRepBlend_RstRstConstRad.Pnt2dOnRst2 (method)
  Pnt2dOnRst2(): gp_Pnt2d;

  // BRepBlend_RstRstConstRad.ParameterOnRst1 (method)
  ParameterOnRst1(): number;

  // BRepBlend_RstRstConstRad.ParameterOnRst2 (method)
  ParameterOnRst2(): number;

  // BRepBlend_RstRstConstRad.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BRepBlend_RstRstConstRad.TangentOnRst1 (method)
  TangentOnRst1(): gp_Vec;

  // BRepBlend_RstRstConstRad.Tangent2dOnRst1 (method)
  Tangent2dOnRst1(): gp_Vec2d;

  // BRepBlend_RstRstConstRad.TangentOnRst2 (method)
  TangentOnRst2(): gp_Vec;

  // BRepBlend_RstRstConstRad.Tangent2dOnRst2 (method)
  Tangent2dOnRst2(): gp_Vec2d;

  // BRepBlend_RstRstConstRad.Decroch (method)
  Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;

  // BRepBlend_RstRstConstRad.CenterCircleRst1Rst2 (method)
  CenterCircleRst1Rst2(PtRst1: gp_Pnt, PtRst2: gp_Pnt, np: gp_Vec, Center: gp_Pnt, VdMed: gp_Vec): boolean;

  // BRepBlend_RstRstConstRad.Section (method)
  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // BRepBlend_RstRstConstRad.IsRational (method)
  IsRational(): boolean;

  // BRepBlend_RstRstConstRad.GetSectionSize (method)
  GetSectionSize(): number;

  // BRepBlend_RstRstConstRad.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BRepBlend_RstRstConstRad.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BRepBlend_RstRstConstRad.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepBlend_RstRstConstRad.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BRepBlend_RstRstConstRad.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BRepBlend_RstRstConstRad.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BRepBlend_RstRstConstRad.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BRepBlend_RstRstConstRad.delete (method)
  delete(): void;

  // BRepBlend_RstRstConstRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepBlend_RstRstEvolRad: declare class BRepBlend_RstRstEvolRad extends Blend_RstRstFunction

  // BRepBlend_RstRstEvolRad.constructor (constructor)
  constructor(Surf1: Adaptor3d_Surface, Rst1: Adaptor2d_Curve2d, Surf2: Adaptor3d_Surface, Rst2: Adaptor2d_Curve2d, CGuide: Adaptor3d_Curve, Evol: Law_Function);

  // BRepBlend_RstRstEvolRad.NbVariables (method)
  NbVariables(): number;

  // BRepBlend_RstRstEvolRad.NbEquations (method)
  NbEquations(): number;

  // BRepBlend_RstRstEvolRad.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // BRepBlend_RstRstEvolRad.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_RstRstEvolRad.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // BRepBlend_RstRstEvolRad.Set (method)
  Set(Param: number): void;
  Set(Choix: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;

  // BRepBlend_RstRstEvolRad.GetTolerance (method)
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  // BRepBlend_RstRstEvolRad.GetBounds (method)
  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  // BRepBlend_RstRstEvolRad.IsSolution (method)
  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  // BRepBlend_RstRstEvolRad.GetMinimalDistance (method)
  GetMinimalDistance(): number;

  // BRepBlend_RstRstEvolRad.PointOnRst1 (method)
  PointOnRst1(): gp_Pnt;

  // BRepBlend_RstRstEvolRad.PointOnRst2 (method)
  PointOnRst2(): gp_Pnt;

  // BRepBlend_RstRstEvolRad.Pnt2dOnRst1 (method)
  Pnt2dOnRst1(): gp_Pnt2d;

  // BRepBlend_RstRstEvolRad.Pnt2dOnRst2 (method)
  Pnt2dOnRst2(): gp_Pnt2d;

  // BRepBlend_RstRstEvolRad.ParameterOnRst1 (method)
  ParameterOnRst1(): number;

  // BRepBlend_RstRstEvolRad.ParameterOnRst2 (method)
  ParameterOnRst2(): number;

  // BRepBlend_RstRstEvolRad.IsTangencyPoint (method)
  IsTangencyPoint(): boolean;

  // BRepBlend_RstRstEvolRad.TangentOnRst1 (method)
  TangentOnRst1(): gp_Vec;

  // BRepBlend_RstRstEvolRad.Tangent2dOnRst1 (method)
  Tangent2dOnRst1(): gp_Vec2d;

  // BRepBlend_RstRstEvolRad.TangentOnRst2 (method)
  TangentOnRst2(): gp_Vec;

  // BRepBlend_RstRstEvolRad.Tangent2dOnRst2 (method)
  Tangent2dOnRst2(): gp_Vec2d;

  // BRepBlend_RstRstEvolRad.Decroch (method)
  Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;

  // BRepBlend_RstRstEvolRad.CenterCircleRst1Rst2 (method)
  CenterCircleRst1Rst2(PtRst1: gp_Pnt, PtRst2: gp_Pnt, np: gp_Vec, Center: gp_Pnt, VdMed: gp_Vec): boolean;

  // BRepBlend_RstRstEvolRad.Section (method)
  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // BRepBlend_RstRstEvolRad.IsRational (method)
  IsRational(): boolean;

  // BRepBlend_RstRstEvolRad.GetSectionSize (method)
  GetSectionSize(): number;

  // BRepBlend_RstRstEvolRad.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // BRepBlend_RstRstEvolRad.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // BRepBlend_RstRstEvolRad.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepBlend_RstRstEvolRad.GetShape (method)
  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  // BRepBlend_RstRstEvolRad.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // BRepBlend_RstRstEvolRad.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // BRepBlend_RstRstEvolRad.Resolution (method)
  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // BRepBlend_RstRstEvolRad.delete (method)
  delete(): void;

  // BRepBlend_RstRstEvolRad.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
