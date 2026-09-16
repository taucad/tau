# libcascade — Approx

13 top-level symbols. Signatures are verbatim typescript.

Approx_Curve2d: declare class Approx_Curve2d

  constructor

  IsDone(): boolean;

  HasResult(): boolean;

  Curve(): Geom2d_BSplineCurve;

  MaxError2dU(): number;

  MaxError2dV(): number;

  delete(): void;

  [Symbol.dispose](): void;

Approx_Curve3d: declare class Approx_Curve3d

  constructor

  Curve(): Geom_BSplineCurve;

  IsDone(): boolean;

  HasResult(): boolean;

  MaxError(): number;

  delete(): void;

  [Symbol.dispose](): void;

Approx_CurveOnSurface: declare class Approx_CurveOnSurface

  constructor

  IsDone(): boolean;

  HasResult(): boolean;

  Curve3d(): Geom_BSplineCurve;

  MaxError3d(): number;

  Curve2d(): Geom2d_BSplineCurve;

  MaxError2dU(): number;

  MaxError2dV(): number;

  Perform(theMaxSegments: number, theMaxDegree: number, theContinuity: GeomAbs_Shape, theOnly3d?: boolean, theOnly2d?: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

Approx_CurvilinearParameter: declare class Approx_CurvilinearParameter

  constructor

  IsDone(): boolean;

  HasResult(): boolean;

  Curve3d(): Geom_BSplineCurve;

  MaxError3d(): number;

  Curve2d1(): Geom2d_BSplineCurve;

  MaxError2d1(): number;

  Curve2d2(): Geom2d_BSplineCurve;

  MaxError2d2(): number;

  delete(): void;

  [Symbol.dispose](): void;

Approx_CurvlinFunc: declare class Approx_CurvlinFunc extends Standard_Transient

  constructor

  SetTol(Tol: number): void;

  FirstParameter(): number;

  LastParameter(): number;

  NbIntervals(S: GeomAbs_Shape): number;

  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  Trim(First: number, Last: number, Tol: number): void;

  Length(): void;
  Length(C: Adaptor3d_Curve, FirstU: number, LasrU: number): number;
  Length(): void;
  Length(C: Adaptor3d_Curve, FirstU: number, LasrU: number): number;

  GetLength(): number;

  GetUParameter(C: Adaptor3d_Curve, S: number, NumberOfCurve: number): number;

  GetSParameter(U: number): number;

  EvalCase1(S: number, Order: number, Result: NCollection_Array1_double): boolean;

  EvalCase2(S: number, Order: number, Result: NCollection_Array1_double): boolean;

  EvalCase3(S: number, Order: number, Result: NCollection_Array1_double): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Approx_FitAndDivide: declare class Approx_FitAndDivide

  constructor

  Perform(Line: AppCont_Function): void;

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

Approx_FitAndDivide2d: declare class Approx_FitAndDivide2d

  constructor

  Perform(Line: AppCont_Function): void;

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

Approx_MCurvesToBSpCurve: declare class Approx_MCurvesToBSpCurve

  constructor

  Reset(): void;

  Append(MC: AppParCurves_MultiCurve): void;

  Perform(): void;
  Perform(TheSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;
  Perform(): void;
  Perform(TheSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

  Value(): AppParCurves_MultiBSpCurve;

  ChangeValue(): AppParCurves_MultiBSpCurve;

  delete(): void;

  [Symbol.dispose](): void;

Approx_ParametrizationType: typeof Approx_ParametrizationType[keyof typeof Approx_ParametrizationType]

Approx_SameParameter: declare class Approx_SameParameter

  constructor

  IsDone(): boolean;

  TolReached(): number;

  IsSameParameter(): boolean;

  Curve2d(): Geom2d_Curve;

  Curve3d(): Adaptor3d_Curve;

  CurveOnSurface(): Adaptor3d_CurveOnSurface;

  delete(): void;

  [Symbol.dispose](): void;

Approx_Status: typeof Approx_Status[keyof typeof Approx_Status]

Approx_SweepApproximation: declare class Approx_SweepApproximation

  constructor

  Perform(First: number, Last: number, Tol3d: number, BoundTol: number, Tol2d: number, TolAngular: number, Continuity?: GeomAbs_Shape, Degmax?: number, Segmax?: number): void;

  Eval(Parameter: number, DerivativeRequest: number, First: number, Last: number, Result?: number): { returnValue: number; Result: number };

  IsDone(): boolean;

  SurfShape(UDegree?: number, VDegree?: number, NbUPoles?: number, NbVPoles?: number, NbUKnots?: number, NbVKnots?: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

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

  AverageErrorOnSurf(): number;

  NbCurves2d(): number;

  Curves2dShape(Degree?: number, NbPoles?: number, NbKnots?: number): { Degree: number; NbPoles: number; NbKnots: number };

  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  Curves2dDegree(): number;

  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  Curves2dKnots(): NCollection_Array1_double;

  Curves2dMults(): NCollection_Array1_int;

  Max2dError(Index: number): number;

  Average2dError(Index: number): number;

  TolCurveOnSurf(Index: number): number;

  delete(): void;

  [Symbol.dispose](): void;

Approx_SweepFunction: declare class Approx_SweepFunction extends Standard_Transient

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

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
