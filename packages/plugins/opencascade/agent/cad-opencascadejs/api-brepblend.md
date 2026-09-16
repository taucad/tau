# libcascade — BRepBlend

15 top-level symbols. Signatures are verbatim typescript.

BRepBlend_AppFunc: declare class BRepBlend_AppFunc extends BRepBlend_AppFuncRoot

  constructor

  Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_AppFuncRoot: declare class BRepBlend_AppFuncRoot extends Approx_SweepFunction

  D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;

  D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  D2(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  Nb2dCurves(): number;

  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  IsRational(): boolean;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  SetInterval(First: number, Last: number): void;

  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  SetTolerance(Tol3d: number, Tol2d: number): void;

  BarycentreOfSurf(): gp_Pnt;

  MaximalSection(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_AppFuncRst: declare class BRepBlend_AppFuncRst extends BRepBlend_AppFuncRoot

  constructor

  Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_AppFuncRstRst: declare class BRepBlend_AppFuncRstRst extends BRepBlend_AppFuncRoot

  constructor

  Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_AppSurf: declare class BRepBlend_AppSurf extends AppBlend_Approx

  constructor

  Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

  SetParType(ParType: Approx_ParametrizationType): void;

  SetContinuity(C: GeomAbs_Shape): void;

  SetCriteriumWeight(W1: number, W2: number, W3: number): void;

  ParType(): Approx_ParametrizationType;

  Continuity(): GeomAbs_Shape;

  CriteriumWeight(W1?: number, W2?: number, W3?: number): { W1: number; W2: number; W3: number };

  Perform(Lin: BRepBlend_Line, SecGen: Blend_AppFunction, SpApprox: boolean): void;
  Perform(Lin: BRepBlend_Line, SecGen: Blend_AppFunction, NbMaxP: number): void;
  Perform(Lin: BRepBlend_Line, SecGen: Blend_AppFunction, SpApprox: boolean): void;
  Perform(Lin: BRepBlend_Line, SecGen: Blend_AppFunction, NbMaxP: number): void;

  PerformSmoothing(Lin: BRepBlend_Line, SecGen: Blend_AppFunction): void;

  IsDone(): boolean;

  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  UDegree(): number;

  VDegree(): number;

  SurfPoles(): NCollection_Array2_gp_Pnt;

  SurfWeights(): NCollection_Array2_double;

  SurfUKnots(): NCollection_Array1_double;

  SurfVKnots(): NCollection_Array1_double;

  SurfUMults(): NCollection_Array1_int;

  SurfVMults(): NCollection_Array1_int;

  NbCurves2d(): number;

  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  Curves2dDegree(): number;

  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  Curves2dKnots(): NCollection_Array1_double;

  Curves2dMults(): NCollection_Array1_int;

  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  TolCurveOnSurf(Index: number): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_AppSurface: declare class BRepBlend_AppSurface extends AppBlend_Approx

  constructor

  IsDone(): boolean;

  SurfShape(UDegree: number, VDegree: number, NbUPoles: number, NbVPoles: number, NbUKnots: number, NbVKnots: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  UDegree(): number;

  VDegree(): number;

  SurfPoles(): NCollection_Array2_gp_Pnt;

  SurfWeights(): NCollection_Array2_double;

  SurfUKnots(): NCollection_Array1_double;

  SurfVKnots(): NCollection_Array1_double;

  SurfUMults(): NCollection_Array1_int;

  SurfVMults(): NCollection_Array1_int;

  MaxErrorOnSurf(): number;

  NbCurves2d(): number;

  Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  Curves2dDegree(): number;

  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  Curves2dKnots(): NCollection_Array1_double;

  Curves2dMults(): NCollection_Array1_int;

  TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

  Max2dError(Index: number): number;

  TolCurveOnSurf(Index: number): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_BlendTool: declare class BRepBlend_BlendTool

  constructor

  static Project(P: gp_Pnt2d, S: Adaptor3d_Surface, C: Adaptor2d_Curve2d, Paramproj?: number, Dist?: number): { returnValue: boolean; Paramproj: number; Dist: number };

  static Inters(P1: gp_Pnt2d, P2: gp_Pnt2d, S: Adaptor3d_Surface, C: Adaptor2d_Curve2d, Param?: number, Dist?: number): { returnValue: boolean; Param: number; Dist: number };

  static Parameter(V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d): number;

  static Tolerance(V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d): number;

  static SingularOnUMin(S: Adaptor3d_Surface): boolean;

  static SingularOnUMax(S: Adaptor3d_Surface): boolean;

  static SingularOnVMin(S: Adaptor3d_Surface): boolean;

  static SingularOnVMax(S: Adaptor3d_Surface): boolean;

  static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

  static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

  static Bounds(C: Adaptor2d_Curve2d, Ufirst?: number, Ulast?: number): { Ufirst: number; Ulast: number };

  static CurveOnSurf(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): Adaptor2d_Curve2d;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_CSWalking: declare class BRepBlend_CSWalking

  constructor

  Perform(F: Blend_CSFunction, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

  Complete(F: Blend_CSFunction, Pmin: number): boolean;

  IsDone(): boolean;

  Line(): BRepBlend_Line;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_CurvPointRadInv: declare class BRepBlend_CurvPointRadInv extends Blend_CurvPointFuncInv

  constructor

  Set(Choix: number): void;
  Set(P: gp_Pnt): void;
  Set(Choix: number): void;
  Set(P: gp_Pnt): void;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_Extremity: declare class BRepBlend_Extremity

  constructor

  SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number): void;
  SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number, Vtx: Adaptor3d_HVertex): void;
  SetValue(P: gp_Pnt, W: number, Param: number, Tol: number): void;
  SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number): void;
  SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number, Vtx: Adaptor3d_HVertex): void;
  SetValue(P: gp_Pnt, W: number, Param: number, Tol: number): void;
  SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number): void;
  SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number, Vtx: Adaptor3d_HVertex): void;
  SetValue(P: gp_Pnt, W: number, Param: number, Tol: number): void;

  Value(): gp_Pnt;

  SetTangent(Tangent: gp_Vec): void;

  HasTangent(): boolean;

  Tangent(): gp_Vec;

  Tolerance(): number;

  SetVertex(V: Adaptor3d_HVertex): void;

  AddArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

  Parameters(U?: number, V?: number): { U: number; V: number };

  IsVertex(): boolean;

  Vertex(): Adaptor3d_HVertex;

  NbPointOnRst(): number;

  PointOnRst(Index: number): BRepBlend_PointOnRst;

  Parameter(): number;

  ParameterOnGuide(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_HCurve2dTool: declare class BRepBlend_HCurve2dTool

  constructor

  static FirstParameter(C: Adaptor2d_Curve2d): number;

  static LastParameter(C: Adaptor2d_Curve2d): number;

  static Continuity(C: Adaptor2d_Curve2d): GeomAbs_Shape;

  static NbIntervals(C: Adaptor2d_Curve2d, S: GeomAbs_Shape): number;

  static Intervals(C: Adaptor2d_Curve2d, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  static IsClosed(C: Adaptor2d_Curve2d): boolean;

  static IsPeriodic(C: Adaptor2d_Curve2d): boolean;

  static Period(C: Adaptor2d_Curve2d): number;

  static Value(C: Adaptor2d_Curve2d, U: number): gp_Pnt2d;

  static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;

  static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V: gp_Vec2d): void;

  static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;

  static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;

  static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

  static Resolution(C: Adaptor2d_Curve2d, R3d: number): number;

  static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

  static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

  static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

  static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

  static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

  static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

  static Bezier(C: Adaptor2d_Curve2d): Geom2d_BezierCurve;

  static BSpline(C: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

  static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_HCurveTool: declare class BRepBlend_HCurveTool

  constructor

  static FirstParameter(C: Adaptor3d_Curve): number;

  static LastParameter(C: Adaptor3d_Curve): number;

  static Continuity(C: Adaptor3d_Curve): GeomAbs_Shape;

  static NbIntervals(C: Adaptor3d_Curve, S: GeomAbs_Shape): number;

  static Intervals(C: Adaptor3d_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  static IsClosed(C: Adaptor3d_Curve): boolean;

  static IsPeriodic(C: Adaptor3d_Curve): boolean;

  static Period(C: Adaptor3d_Curve): number;

  static Value(C: Adaptor3d_Curve, U: number): gp_Pnt;

  static D0(C: Adaptor3d_Curve, U: number, P: gp_Pnt): void;

  static D1(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V: gp_Vec): void;

  static D2(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;

  static D3(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;

  static DN(C: Adaptor3d_Curve, U: number, N: number): gp_Vec;

  static Resolution(C: Adaptor3d_Curve, R3d: number): number;

  static GetType(C: Adaptor3d_Curve): GeomAbs_CurveType;

  static Line(C: Adaptor3d_Curve): gp_Lin;

  static Circle(C: Adaptor3d_Curve): gp_Circ;

  static Ellipse(C: Adaptor3d_Curve): gp_Elips;

  static Hyperbola(C: Adaptor3d_Curve): gp_Hypr;

  static Parabola(C: Adaptor3d_Curve): gp_Parab;

  static Bezier(C: Adaptor3d_Curve): Geom_BezierCurve;

  static BSpline(C: Adaptor3d_Curve): Geom_BSplineCurve;

  static NbSamples(C: Adaptor3d_Curve, U0: number, U1: number): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_Line: declare class BRepBlend_Line extends Standard_Transient

  constructor

  Clear(): void;

  Append(P: Blend_Point): void;

  Prepend(P: Blend_Point): void;

  InsertBefore(Index: number, P: Blend_Point): void;

  Remove(FromIndex: number, ToIndex: number): void;

  Set(TranS1: IntSurf_TypeTrans, TranS2: IntSurf_TypeTrans): void;
  Set(Trans: IntSurf_TypeTrans): void;
  Set(TranS1: IntSurf_TypeTrans, TranS2: IntSurf_TypeTrans): void;
  Set(Trans: IntSurf_TypeTrans): void;

  SetStartPoints(StartPt1: BRepBlend_Extremity, StartPt2: BRepBlend_Extremity): void;

  SetEndPoints(EndPt1: BRepBlend_Extremity, EndPt2: BRepBlend_Extremity): void;

  NbPoints(): number;

  Point(Index: number): Blend_Point;

  TransitionOnS1(): IntSurf_TypeTrans;

  TransitionOnS2(): IntSurf_TypeTrans;

  StartPointOnFirst(): BRepBlend_Extremity;

  StartPointOnSecond(): BRepBlend_Extremity;

  EndPointOnFirst(): BRepBlend_Extremity;

  EndPointOnSecond(): BRepBlend_Extremity;

  TransitionOnS(): IntSurf_TypeTrans;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_PointOnRst: declare class BRepBlend_PointOnRst

  constructor

  SetArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

  Arc(): Adaptor2d_Curve2d;

  TransitionOnLine(): IntSurf_Transition;

  TransitionOnArc(): IntSurf_Transition;

  ParameterOnArc(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepBlend_RstRstConstRad: declare class BRepBlend_RstRstConstRad extends Blend_RstRstFunction

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;
  Set(Param: number): void;
  Set(TypeSection: BlendFunc_SectionShape): void;
  Set(First: number, Last: number): void;
  Set(Radius: number, Choix: number): void;
  Set(SurfRef1: Adaptor3d_Surface, RstRef1: Adaptor2d_Curve2d, SurfRef2: Adaptor3d_Surface, RstRef2: Adaptor2d_Curve2d): void;

  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;
  GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: math_VectorBase_double, Tol1D: math_VectorBase_double): void;

  GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

  IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

  GetMinimalDistance(): number;

  PointOnRst1(): gp_Pnt;

  PointOnRst2(): gp_Pnt;

  Pnt2dOnRst1(): gp_Pnt2d;

  Pnt2dOnRst2(): gp_Pnt2d;

  ParameterOnRst1(): number;

  ParameterOnRst2(): number;

  IsTangencyPoint(): boolean;

  TangentOnRst1(): gp_Vec;

  Tangent2dOnRst1(): gp_Vec2d;

  TangentOnRst2(): gp_Vec;

  Tangent2dOnRst2(): gp_Vec2d;

  Decroch(Sol: math_VectorBase_double, NRst1: gp_Vec, TgRst1: gp_Vec, NRst2: gp_Vec, TgRst2: gp_Vec): Blend_DecrochStatus;

  CenterCircleRst1Rst2(PtRst1: gp_Pnt, PtRst2: gp_Pnt, np: gp_Vec, Center: gp_Pnt, VdMed: gp_Vec): boolean;

  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
  Section(Param: number, U: number, V: number, Pdeb: number, Pfin: number, C: gp_Circ): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): void;
  Section(P: Blend_Point, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  IsRational(): boolean;

  GetSectionSize(): number;

  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  GetShape(NbPoles: number, NbKnots: number, Degree: number, NbPoles2d: number): { NbPoles: number; NbKnots: number; Degree: number; NbPoles2d: number };

  Knots(TKnots: NCollection_Array1_double): void;

  Mults(TMults: NCollection_Array1_int): void;

  Resolution(IC2d: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  delete(): void;

  [Symbol.dispose](): void;
