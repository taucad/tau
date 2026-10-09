# libcascade — Approx

13 top-level symbols. Signatures are verbatim typescript.

Approx_Curve2d: declare class Approx_Curve2d

  // Approx_Curve2d.constructor (constructor)
  constructor(C2D: Adaptor2d_Curve2d, First: number, Last: number, TolU: number, TolV: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegments: number);

  // Approx_Curve2d.IsDone (method)
  IsDone(): boolean;

  // Approx_Curve2d.HasResult (method)
  HasResult(): boolean;

  // Approx_Curve2d.Curve (method)
  Curve(): Geom2d_BSplineCurve;

  // Approx_Curve2d.MaxError2dU (method)
  MaxError2dU(): number;

  // Approx_Curve2d.MaxError2dV (method)
  MaxError2dV(): number;

  // Approx_Curve2d.delete (method)
  delete(): void;

  // Approx_Curve2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_Curve3d: declare class Approx_Curve3d

  // Approx_Curve3d.constructor (constructor)
  constructor(Curve: Adaptor3d_Curve, Tol3d: number, Order: GeomAbs_Shape, MaxSegments: number, MaxDegree: number);

  // Approx_Curve3d.Curve (method)
  Curve(): Geom_BSplineCurve;

  // Approx_Curve3d.IsDone (method)
  IsDone(): boolean;

  // Approx_Curve3d.HasResult (method)
  HasResult(): boolean;

  // Approx_Curve3d.MaxError (method)
  MaxError(): number;

  // Approx_Curve3d.delete (method)
  delete(): void;

  // Approx_Curve3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_CurveOnSurface: declare class Approx_CurveOnSurface

  // Approx_CurveOnSurface.constructor (constructor)
  constructor(theC2D: Adaptor2d_Curve2d, theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTol: number);
  constructor(C2D: Adaptor2d_Curve2d, Surf: Adaptor3d_Surface, First: number, Last: number, Tol: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegments: number, Only3d?: boolean, Only2d?: boolean);

  // Approx_CurveOnSurface.IsDone (method)
  IsDone(): boolean;

  // Approx_CurveOnSurface.HasResult (method)
  HasResult(): boolean;

  // Approx_CurveOnSurface.Curve3d (method)
  Curve3d(): Geom_BSplineCurve;

  // Approx_CurveOnSurface.MaxError3d (method)
  MaxError3d(): number;

  // Approx_CurveOnSurface.Curve2d (method)
  Curve2d(): Geom2d_BSplineCurve;

  // Approx_CurveOnSurface.MaxError2dU (method)
  MaxError2dU(): number;

  // Approx_CurveOnSurface.MaxError2dV (method)
  MaxError2dV(): number;

  // Approx_CurveOnSurface.Perform (method)
  Perform(theMaxSegments: number, theMaxDegree: number, theContinuity: GeomAbs_Shape, theOnly3d?: boolean, theOnly2d?: boolean): void;

  // Approx_CurveOnSurface.delete (method)
  delete(): void;

  // Approx_CurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_CurvilinearParameter: declare class Approx_CurvilinearParameter

  // Approx_CurvilinearParameter.constructor (constructor)
  constructor(C3D: Adaptor3d_Curve, Tol: number, Order: GeomAbs_Shape, MaxDegree: number, MaxSegments: number);
  constructor(C2D: Adaptor2d_Curve2d, Surf: Adaptor3d_Surface, Tol: number, Order: GeomAbs_Shape, MaxDegree: number, MaxSegments: number);
  constructor(C2D1: Adaptor2d_Curve2d, Surf1: Adaptor3d_Surface, C2D2: Adaptor2d_Curve2d, Surf2: Adaptor3d_Surface, Tol: number, Order: GeomAbs_Shape, MaxDegree: number, MaxSegments: number);

  // Approx_CurvilinearParameter.IsDone (method)
  IsDone(): boolean;

  // Approx_CurvilinearParameter.HasResult (method)
  HasResult(): boolean;

  // Approx_CurvilinearParameter.Curve3d (method)
  Curve3d(): Geom_BSplineCurve;

  // Approx_CurvilinearParameter.MaxError3d (method)
  MaxError3d(): number;

  // Approx_CurvilinearParameter.Curve2d1 (method)
  Curve2d1(): Geom2d_BSplineCurve;

  // Approx_CurvilinearParameter.MaxError2d1 (method)
  MaxError2d1(): number;

  // Approx_CurvilinearParameter.Curve2d2 (method)
  Curve2d2(): Geom2d_BSplineCurve;

  // Approx_CurvilinearParameter.MaxError2d2 (method)
  MaxError2d2(): number;

  // Approx_CurvilinearParameter.delete (method)
  delete(): void;

  // Approx_CurvilinearParameter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_CurvlinFunc: declare class Approx_CurvlinFunc extends Standard_Transient

  // Approx_CurvlinFunc.constructor (constructor)
  constructor(C: Adaptor3d_Curve, Tol: number);
  constructor(C2D: Adaptor2d_Curve2d, S: Adaptor3d_Surface, Tol: number);
  constructor(C2D1: Adaptor2d_Curve2d, C2D2: Adaptor2d_Curve2d, S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, Tol: number);

  // Approx_CurvlinFunc.SetTol (method)
  SetTol(Tol: number): void;

  // Approx_CurvlinFunc.FirstParameter (method)
  FirstParameter(): number;

  // Approx_CurvlinFunc.LastParameter (method)
  LastParameter(): number;

  // Approx_CurvlinFunc.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Approx_CurvlinFunc.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Approx_CurvlinFunc.Trim (method)
  Trim(First: number, Last: number, Tol: number): void;

  // Approx_CurvlinFunc.Length (method)
  Length(): void;
  Length(C: Adaptor3d_Curve, FirstU: number, LasrU: number): number;

  // Approx_CurvlinFunc.GetLength (method)
  GetLength(): number;

  // Approx_CurvlinFunc.GetUParameter (method)
  GetUParameter(C: Adaptor3d_Curve, S: number, NumberOfCurve: number): number;

  // Approx_CurvlinFunc.GetSParameter (method)
  GetSParameter(U: number): number;

  // Approx_CurvlinFunc.EvalCase1 (method)
  EvalCase1(S: number, Order: number, Result: NCollection_Array1_double): boolean;

  // Approx_CurvlinFunc.EvalCase2 (method)
  EvalCase2(S: number, Order: number, Result: NCollection_Array1_double): boolean;

  // Approx_CurvlinFunc.EvalCase3 (method)
  EvalCase3(S: number, Order: number, Result: NCollection_Array1_double): boolean;

  // Approx_CurvlinFunc.get_type_name (method)
  static get_type_name(): string;

  // Approx_CurvlinFunc.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Approx_CurvlinFunc.DynamicType (method)
  DynamicType(): Standard_Type;

  // Approx_CurvlinFunc.delete (method)
  delete(): void;

  // Approx_CurvlinFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_FitAndDivide: declare class Approx_FitAndDivide

  // Approx_FitAndDivide.constructor (constructor)
  constructor(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, cutting?: boolean, FirstC?: AppParCurves_Constraint, LastC?: AppParCurves_Constraint);
  constructor(Line: AppCont_Function, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, cutting?: boolean, FirstC?: AppParCurves_Constraint, LastC?: AppParCurves_Constraint);

  // Approx_FitAndDivide.Perform (method)
  Perform(Line: AppCont_Function): void;

  // Approx_FitAndDivide.SetDegrees (method)
  SetDegrees(degreemin: number, degreemax: number): void;

  // Approx_FitAndDivide.SetTolerances (method)
  SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

  // Approx_FitAndDivide.SetConstraints (method)
  SetConstraints(FirstC: AppParCurves_Constraint, LastC: AppParCurves_Constraint): void;

  // Approx_FitAndDivide.SetMaxSegments (method)
  SetMaxSegments(theMaxSegments: number): void;

  // Approx_FitAndDivide.SetInvOrder (method)
  SetInvOrder(theInvOrder: boolean): void;

  // Approx_FitAndDivide.SetHangChecking (method)
  SetHangChecking(theHangChecking: boolean): void;

  // Approx_FitAndDivide.IsAllApproximated (method)
  IsAllApproximated(): boolean;

  // Approx_FitAndDivide.IsToleranceReached (method)
  IsToleranceReached(): boolean;

  // Approx_FitAndDivide.Error (method)
  Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

  // Approx_FitAndDivide.NbMultiCurves (method)
  NbMultiCurves(): number;

  // Approx_FitAndDivide.Value (method)
  Value(Index?: number): AppParCurves_MultiCurve;

  // Approx_FitAndDivide.Parameters (method)
  Parameters(Index: number, firstp?: number, lastp?: number): { firstp: number; lastp: number };

  // Approx_FitAndDivide.delete (method)
  delete(): void;

  // Approx_FitAndDivide.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_FitAndDivide2d: declare class Approx_FitAndDivide2d

  // Approx_FitAndDivide2d.constructor (constructor)
  constructor(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, cutting?: boolean, FirstC?: AppParCurves_Constraint, LastC?: AppParCurves_Constraint);
  constructor(Line: AppCont_Function, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, cutting?: boolean, FirstC?: AppParCurves_Constraint, LastC?: AppParCurves_Constraint);

  // Approx_FitAndDivide2d.Perform (method)
  Perform(Line: AppCont_Function): void;

  // Approx_FitAndDivide2d.SetDegrees (method)
  SetDegrees(degreemin: number, degreemax: number): void;

  // Approx_FitAndDivide2d.SetTolerances (method)
  SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

  // Approx_FitAndDivide2d.SetConstraints (method)
  SetConstraints(FirstC: AppParCurves_Constraint, LastC: AppParCurves_Constraint): void;

  // Approx_FitAndDivide2d.SetMaxSegments (method)
  SetMaxSegments(theMaxSegments: number): void;

  // Approx_FitAndDivide2d.SetInvOrder (method)
  SetInvOrder(theInvOrder: boolean): void;

  // Approx_FitAndDivide2d.SetHangChecking (method)
  SetHangChecking(theHangChecking: boolean): void;

  // Approx_FitAndDivide2d.IsAllApproximated (method)
  IsAllApproximated(): boolean;

  // Approx_FitAndDivide2d.IsToleranceReached (method)
  IsToleranceReached(): boolean;

  // Approx_FitAndDivide2d.Error (method)
  Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

  // Approx_FitAndDivide2d.NbMultiCurves (method)
  NbMultiCurves(): number;

  // Approx_FitAndDivide2d.Value (method)
  Value(Index?: number): AppParCurves_MultiCurve;

  // Approx_FitAndDivide2d.Parameters (method)
  Parameters(Index: number, firstp?: number, lastp?: number): { firstp: number; lastp: number };

  // Approx_FitAndDivide2d.delete (method)
  delete(): void;

  // Approx_FitAndDivide2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_MCurvesToBSpCurve: declare class Approx_MCurvesToBSpCurve

  // Approx_MCurvesToBSpCurve.constructor (constructor)
  constructor();

  // Approx_MCurvesToBSpCurve.Reset (method)
  Reset(): void;

  // Approx_MCurvesToBSpCurve.Append (method)
  Append(MC: AppParCurves_MultiCurve): void;

  // Approx_MCurvesToBSpCurve.Perform (method)
  Perform(): void;
  Perform(TheSeq: NCollection_Sequence_AppParCurves_MultiCurve): void;

  // Approx_MCurvesToBSpCurve.Value (method)
  Value(): AppParCurves_MultiBSpCurve;

  // Approx_MCurvesToBSpCurve.ChangeValue (method)
  ChangeValue(): AppParCurves_MultiBSpCurve;

  // Approx_MCurvesToBSpCurve.delete (method)
  delete(): void;

  // Approx_MCurvesToBSpCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_ParametrizationType: typeof Approx_ParametrizationType[keyof typeof Approx_ParametrizationType]

  readonly Approx_ChordLength: 'Approx_ChordLength'

  readonly Approx_Centripetal: 'Approx_Centripetal'

  readonly Approx_IsoParametric: 'Approx_IsoParametric'

Approx_SameParameter: declare class Approx_SameParameter

  // Approx_SameParameter.constructor (constructor)
  constructor(C3D: Geom_Curve, C2D: Geom2d_Curve, S: Geom_Surface, Tol: number);
  constructor(C3D: Adaptor3d_Curve, C2D: Geom2d_Curve, S: Adaptor3d_Surface, Tol: number);
  constructor(C3D: Adaptor3d_Curve, C2D: Adaptor2d_Curve2d, S: Adaptor3d_Surface, Tol: number);

  // Approx_SameParameter.IsDone (method)
  IsDone(): boolean;

  // Approx_SameParameter.TolReached (method)
  TolReached(): number;

  // Approx_SameParameter.IsSameParameter (method)
  IsSameParameter(): boolean;

  // Approx_SameParameter.Curve2d (method)
  Curve2d(): Geom2d_Curve;

  // Approx_SameParameter.Curve3d (method)
  Curve3d(): Adaptor3d_Curve;

  // Approx_SameParameter.CurveOnSurface (method)
  CurveOnSurface(): Adaptor3d_CurveOnSurface;

  // Approx_SameParameter.delete (method)
  delete(): void;

  // Approx_SameParameter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_Status: typeof Approx_Status[keyof typeof Approx_Status]

  readonly Approx_PointsAdded: 'Approx_PointsAdded'

  readonly Approx_NoPointsAdded: 'Approx_NoPointsAdded'

  readonly Approx_NoApproximation: 'Approx_NoApproximation'

Approx_SweepApproximation: declare class Approx_SweepApproximation

  // Approx_SweepApproximation.constructor (constructor)
  constructor(Func: Approx_SweepFunction);

  // Approx_SweepApproximation.Perform (method)
  Perform(First: number, Last: number, Tol3d: number, BoundTol: number, Tol2d: number, TolAngular: number, Continuity?: GeomAbs_Shape, Degmax?: number, Segmax?: number): void;

  // Approx_SweepApproximation.Eval (method)
  Eval(Parameter: number, DerivativeRequest: number, First: number, Last: number, Result?: number): { returnValue: number; Result: number };

  // Approx_SweepApproximation.IsDone (method)
  IsDone(): boolean;

  // Approx_SweepApproximation.SurfShape (method)
  SurfShape(UDegree?: number, VDegree?: number, NbUPoles?: number, NbVPoles?: number, NbUKnots?: number, NbVKnots?: number): { UDegree: number; VDegree: number; NbUPoles: number; NbVPoles: number; NbUKnots: number; NbVKnots: number };

  // Approx_SweepApproximation.Surface (method)
  Surface(TPoles: NCollection_Array2_gp_Pnt, TWeights: NCollection_Array2_double, TUKnots: NCollection_Array1_double, TVKnots: NCollection_Array1_double, TUMults: NCollection_Array1_int, TVMults: NCollection_Array1_int): void;

  // Approx_SweepApproximation.UDegree (method)
  UDegree(): number;

  // Approx_SweepApproximation.VDegree (method)
  VDegree(): number;

  // Approx_SweepApproximation.SurfPoles (method)
  SurfPoles(): NCollection_Array2_gp_Pnt;

  // Approx_SweepApproximation.SurfWeights (method)
  SurfWeights(): NCollection_Array2_double;

  // Approx_SweepApproximation.SurfUKnots (method)
  SurfUKnots(): NCollection_Array1_double;

  // Approx_SweepApproximation.SurfVKnots (method)
  SurfVKnots(): NCollection_Array1_double;

  // Approx_SweepApproximation.SurfUMults (method)
  SurfUMults(): NCollection_Array1_int;

  // Approx_SweepApproximation.SurfVMults (method)
  SurfVMults(): NCollection_Array1_int;

  // Approx_SweepApproximation.MaxErrorOnSurf (method)
  MaxErrorOnSurf(): number;

  // Approx_SweepApproximation.AverageErrorOnSurf (method)
  AverageErrorOnSurf(): number;

  // Approx_SweepApproximation.NbCurves2d (method)
  NbCurves2d(): number;

  // Approx_SweepApproximation.Curves2dShape (method)
  Curves2dShape(Degree?: number, NbPoles?: number, NbKnots?: number): { Degree: number; NbPoles: number; NbKnots: number };

  // Approx_SweepApproximation.Curve2d (method)
  Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

  // Approx_SweepApproximation.Curves2dDegree (method)
  Curves2dDegree(): number;

  // Approx_SweepApproximation.Curve2dPoles (method)
  Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

  // Approx_SweepApproximation.Curves2dKnots (method)
  Curves2dKnots(): NCollection_Array1_double;

  // Approx_SweepApproximation.Curves2dMults (method)
  Curves2dMults(): NCollection_Array1_int;

  // Approx_SweepApproximation.Max2dError (method)
  Max2dError(Index: number): number;

  // Approx_SweepApproximation.Average2dError (method)
  Average2dError(Index: number): number;

  // Approx_SweepApproximation.TolCurveOnSurf (method)
  TolCurveOnSurf(Index: number): number;

  // Approx_SweepApproximation.delete (method)
  delete(): void;

  // Approx_SweepApproximation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Approx_SweepFunction: declare class Approx_SweepFunction extends Standard_Transient

  // Approx_SweepFunction.D0 (method)
  D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;

  // Approx_SweepFunction.D1 (method)
  D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;

  // Approx_SweepFunction.D2 (method)
  D2(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;

  // Approx_SweepFunction.Nb2dCurves (method)
  Nb2dCurves(): number;

  // Approx_SweepFunction.SectionShape (method)
  SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

  // Approx_SweepFunction.Knots (method)
  Knots(TKnots: NCollection_Array1_double): void;

  // Approx_SweepFunction.Mults (method)
  Mults(TMults: NCollection_Array1_int): void;

  // Approx_SweepFunction.IsRational (method)
  IsRational(): boolean;

  // Approx_SweepFunction.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // Approx_SweepFunction.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // Approx_SweepFunction.SetInterval (method)
  SetInterval(First: number, Last: number): void;

  // Approx_SweepFunction.Resolution (method)
  Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

  // Approx_SweepFunction.GetTolerance (method)
  GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;

  // Approx_SweepFunction.SetTolerance (method)
  SetTolerance(Tol3d: number, Tol2d: number): void;

  // Approx_SweepFunction.BarycentreOfSurf (method)
  BarycentreOfSurf(): gp_Pnt;

  // Approx_SweepFunction.MaximalSection (method)
  MaximalSection(): number;

  // Approx_SweepFunction.GetMinimalWeight (method)
  GetMinimalWeight(Weigths: NCollection_Array1_double): void;

  // Approx_SweepFunction.get_type_name (method)
  static get_type_name(): string;

  // Approx_SweepFunction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Approx_SweepFunction.DynamicType (method)
  DynamicType(): Standard_Type;

  // Approx_SweepFunction.delete (method)
  delete(): void;

  // Approx_SweepFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
