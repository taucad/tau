# libcascade — GeomLib

12 top-level symbols. Signatures are verbatim typescript.

GeomLib: declare class GeomLib

  // GeomLib.constructor (constructor)
  constructor();

  // GeomLib.To3d (method)
  static To3d(Position: gp_Ax2, Curve2d: Geom2d_Curve): Geom_Curve;

  // GeomLib.GTransform (method)
  static GTransform(Curve: Geom2d_Curve, GTrsf: gp_GTrsf2d): Geom2d_Curve;

  // GeomLib.SameRange (method)
  static SameRange(Tolerance: number, Curve2dPtr: Geom2d_Curve, First: number, Last: number, RequestedFirst: number, RequestedLast: number): { NewCurve2dPtr: Geom2d_Curve; [Symbol.dispose](): void };

  // GeomLib.BuildCurve3d (method)
  static BuildCurve3d(Tolerance: number, CurvePtr: Adaptor3d_CurveOnSurface, FirstParameter: number, LastParameter: number, MaxDeviation: number, AverageDeviation: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegment: number): { NewCurvePtr: Geom_Curve; MaxDeviation: number; AverageDeviation: number; [Symbol.dispose](): void };

  // GeomLib.AdjustExtremity (method)
  static AdjustExtremity(P1: gp_Pnt, P2: gp_Pnt, T1: gp_Vec, T2: gp_Vec): { Curve: Geom_BoundedCurve; [Symbol.dispose](): void };

  // GeomLib.ExtendCurveToPoint (method)
  static ExtendCurveToPoint(Point: gp_Pnt, Cont: number, After: boolean): { Curve: Geom_BoundedCurve; [Symbol.dispose](): void };

  // GeomLib.ExtendSurfByLength (method)
  static ExtendSurfByLength(Length: number, Cont: number, InU: boolean, After: boolean): { Surf: Geom_BoundedSurface; [Symbol.dispose](): void };

  // GeomLib.AxeOfInertia (method)
  static AxeOfInertia(Points: NCollection_Array1_gp_Pnt, Axe: gp_Ax2, IsSingular: boolean, Tol: number): { IsSingular: boolean };

  // GeomLib.Inertia (method)
  static Inertia(Points: NCollection_Array1_gp_Pnt, Bary: gp_Pnt, XDir: gp_Dir, YDir: gp_Dir, Xgap?: number, YGap?: number, ZGap?: number): { Xgap: number; YGap: number; ZGap: number };

  // GeomLib.RemovePointsFromArray (method)
  static RemovePointsFromArray(NumPoints: number, InParameters: NCollection_Array1_double): { OutParameters: NCollection_HArray1_double; [Symbol.dispose](): void };

  // GeomLib.DensifyArray1OfReal (method)
  static DensifyArray1OfReal(MinNumPoints: number, InParameters: NCollection_Array1_double): { OutParameters: NCollection_HArray1_double; [Symbol.dispose](): void };

  // GeomLib.FuseIntervals (method)
  static FuseIntervals(Interval1: NCollection_Array1_double, Interval2: NCollection_Array1_double, Fusion: NCollection_Sequence_double, Confusion: number, IsAdjustToFirstInterval: boolean): void;

  // GeomLib.EvalMaxParametricDistance (method)
  static EvalMaxParametricDistance(Curve: Adaptor3d_Curve, AReferenceCurve: Adaptor3d_Curve, Tolerance: number, Parameters: NCollection_Array1_double, MaxDistance?: number): { MaxDistance: number };

  // GeomLib.EvalMaxDistanceAlongParameter (method)
  static EvalMaxDistanceAlongParameter(Curve: Adaptor3d_Curve, AReferenceCurve: Adaptor3d_Curve, Tolerance: number, Parameters: NCollection_Array1_double, MaxDistance?: number): { MaxDistance: number };

  // GeomLib.CancelDenominatorDerivative (method)
  static CancelDenominatorDerivative(UDirection: boolean, VDirection: boolean): { BSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

  // GeomLib.NormEstim (method)
  static NormEstim(theSurf: Geom_Surface, theUV: gp_Pnt2d, theTol: number, theNorm: gp_Dir): number;

  // GeomLib.IsClosed (method)
  static IsClosed(S: Geom_Surface, Tol: number, isUClosed?: boolean, isVClosed?: boolean): { isUClosed: boolean; isVClosed: boolean };

  // GeomLib.IsBSplUClosed (method)
  static IsBSplUClosed(S: Geom_BSplineSurface, U1: number, U2: number, Tol: number): boolean;

  // GeomLib.IsBSplVClosed (method)
  static IsBSplVClosed(S: Geom_BSplineSurface, V1: number, V2: number, Tol: number): boolean;

  // GeomLib.IsBzUClosed (method)
  static IsBzUClosed(S: Geom_BezierSurface, U1: number, U2: number, Tol: number): boolean;

  // GeomLib.IsBzVClosed (method)
  static IsBzVClosed(S: Geom_BezierSurface, V1: number, V2: number, Tol: number): boolean;

  // GeomLib.isIsoLine (method)
  static isIsoLine(theC2D: Adaptor2d_Curve2d, theIsU?: boolean, theParam?: number, theIsForward?: boolean): { returnValue: boolean; theIsU: boolean; theParam: number; theIsForward: boolean };

  // GeomLib.buildC3dOnIsoLine (method)
  static buildC3dOnIsoLine(theC2D: Adaptor2d_Curve2d, theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTolerance: number, theIsU: boolean, theParam: number, theIsForward: boolean): Geom_Curve;

  // GeomLib.delete (method)
  delete(): void;

  // GeomLib.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_Check2dBSplineCurve: declare class GeomLib_Check2dBSplineCurve

  // GeomLib_Check2dBSplineCurve.constructor (constructor)
  constructor(Curve: Geom2d_BSplineCurve, Tolerance: number, AngularTolerance: number);

  // GeomLib_Check2dBSplineCurve.IsDone (method)
  IsDone(): boolean;

  // GeomLib_Check2dBSplineCurve.NeedTangentFix (method)
  NeedTangentFix(FirstFlag?: boolean, SecondFlag?: boolean): { FirstFlag: boolean; SecondFlag: boolean };

  // GeomLib_Check2dBSplineCurve.FixTangent (method)
  FixTangent(FirstFlag: boolean, LastFlag: boolean): void;

  // GeomLib_Check2dBSplineCurve.FixedTangent (method)
  FixedTangent(FirstFlag: boolean, LastFlag: boolean): Geom2d_BSplineCurve;

  // GeomLib_Check2dBSplineCurve.delete (method)
  delete(): void;

  // GeomLib_Check2dBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_CheckBSplineCurve: declare class GeomLib_CheckBSplineCurve

  // GeomLib_CheckBSplineCurve.constructor (constructor)
  constructor(Curve: Geom_BSplineCurve, Tolerance: number, AngularTolerance: number);

  // GeomLib_CheckBSplineCurve.IsDone (method)
  IsDone(): boolean;

  // GeomLib_CheckBSplineCurve.NeedTangentFix (method)
  NeedTangentFix(FirstFlag?: boolean, SecondFlag?: boolean): { FirstFlag: boolean; SecondFlag: boolean };

  // GeomLib_CheckBSplineCurve.FixTangent (method)
  FixTangent(FirstFlag: boolean, LastFlag: boolean): void;

  // GeomLib_CheckBSplineCurve.FixedTangent (method)
  FixedTangent(FirstFlag: boolean, LastFlag: boolean): Geom_BSplineCurve;

  // GeomLib_CheckBSplineCurve.delete (method)
  delete(): void;

  // GeomLib_CheckBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_CheckCurveOnSurface: declare class GeomLib_CheckCurveOnSurface

  // GeomLib_CheckCurveOnSurface.constructor (constructor)
  constructor();
  constructor(theCurve: Adaptor3d_Curve, theTolRange?: number);

  // GeomLib_CheckCurveOnSurface.Init (method)
  Init(theCurve: Adaptor3d_Curve, theTolRange: number): void;
  Init(): void;

  // GeomLib_CheckCurveOnSurface.Perform (method)
  Perform(theCurveOnSurface: Adaptor3d_CurveOnSurface): void;

  // GeomLib_CheckCurveOnSurface.SetParallel (method)
  SetParallel(theIsParallel: boolean): void;

  // GeomLib_CheckCurveOnSurface.IsParallel (method)
  IsParallel(): boolean;

  // GeomLib_CheckCurveOnSurface.IsDone (method)
  IsDone(): boolean;

  // GeomLib_CheckCurveOnSurface.ErrorStatus (method)
  ErrorStatus(): number;

  // GeomLib_CheckCurveOnSurface.MaxDistance (method)
  MaxDistance(): number;

  // GeomLib_CheckCurveOnSurface.MaxParameter (method)
  MaxParameter(): number;

  // GeomLib_CheckCurveOnSurface.delete (method)
  delete(): void;

  // GeomLib_CheckCurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_DenominatorMultiplier: declare class GeomLib_DenominatorMultiplier

  // GeomLib_DenominatorMultiplier.constructor (constructor)
  constructor(Surface: Geom_BSplineSurface, KnotVector: NCollection_Array1_double);

  // GeomLib_DenominatorMultiplier.Value (method)
  Value(UParameter: number, VParameter: number): number;

  // GeomLib_DenominatorMultiplier.delete (method)
  delete(): void;

  // GeomLib_DenominatorMultiplier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_Interpolate: declare class GeomLib_Interpolate

  // GeomLib_Interpolate.constructor (constructor)
  constructor(Degree: number, NumPoints: number, Points: NCollection_Array1_gp_Pnt, Parameters: NCollection_Array1_double);

  // GeomLib_Interpolate.IsDone (method)
  IsDone(): boolean;

  // GeomLib_Interpolate.Error (method)
  Error(): GeomLib_InterpolationErrors;

  // GeomLib_Interpolate.Curve (method)
  Curve(): Geom_BSplineCurve;

  // GeomLib_Interpolate.delete (method)
  delete(): void;

  // GeomLib_Interpolate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_InterpolationErrors: typeof GeomLib_InterpolationErrors[keyof typeof GeomLib_InterpolationErrors]

  readonly GeomLib_NoError: 'GeomLib_NoError'

  readonly GeomLib_NotEnoughtPoints: 'GeomLib_NotEnoughtPoints'

  readonly GeomLib_DegreeSmallerThan3: 'GeomLib_DegreeSmallerThan3'

  readonly GeomLib_InversionProblem: 'GeomLib_InversionProblem'

GeomLib_IsPlanarSurface: declare class GeomLib_IsPlanarSurface

  // GeomLib_IsPlanarSurface.constructor (constructor)
  constructor(S: Geom_Surface, Tol?: number);

  // GeomLib_IsPlanarSurface.IsPlanar (method)
  IsPlanar(): boolean;

  // GeomLib_IsPlanarSurface.Plan (method)
  Plan(): gp_Pln;

  // GeomLib_IsPlanarSurface.delete (method)
  delete(): void;

  // GeomLib_IsPlanarSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_LogSample: declare class GeomLib_LogSample extends math_FunctionSample

  // GeomLib_LogSample.constructor (constructor)
  constructor(A: number, B: number, N: number);

  // GeomLib_LogSample.GetParameter (method)
  GetParameter(Index: number): number;

  // GeomLib_LogSample.delete (method)
  delete(): void;

  // GeomLib_LogSample.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_MakeCurvefromApprox: declare class GeomLib_MakeCurvefromApprox

  // GeomLib_MakeCurvefromApprox.constructor (constructor)
  constructor(Approx: AdvApprox_ApproxAFunction);

  // GeomLib_MakeCurvefromApprox.IsDone (method)
  IsDone(): boolean;

  // GeomLib_MakeCurvefromApprox.Nb1DSpaces (method)
  Nb1DSpaces(): number;

  // GeomLib_MakeCurvefromApprox.Nb2DSpaces (method)
  Nb2DSpaces(): number;

  // GeomLib_MakeCurvefromApprox.Nb3DSpaces (method)
  Nb3DSpaces(): number;

  // GeomLib_MakeCurvefromApprox.Curve2d (method)
  Curve2d(Index2d: number): Geom2d_BSplineCurve;
  Curve2d(Index1d: number, Index2d: number): Geom2d_BSplineCurve;

  // GeomLib_MakeCurvefromApprox.Curve2dFromTwo1d (method)
  Curve2dFromTwo1d(Index1d: number, Index2d: number): Geom2d_BSplineCurve;

  // GeomLib_MakeCurvefromApprox.Curve (method)
  Curve(Index3d: number): Geom_BSplineCurve;
  Curve(Index1D: number, Index3D: number): Geom_BSplineCurve;

  // GeomLib_MakeCurvefromApprox.delete (method)
  delete(): void;

  // GeomLib_MakeCurvefromApprox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_PolyFunc: declare class GeomLib_PolyFunc extends math_FunctionWithDerivative

  // GeomLib_PolyFunc.constructor (constructor)
  constructor(Coeffs: math_VectorBase_double);

  // GeomLib_PolyFunc.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // GeomLib_PolyFunc.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // GeomLib_PolyFunc.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // GeomLib_PolyFunc.delete (method)
  delete(): void;

  // GeomLib_PolyFunc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

GeomLib_Tool: declare class GeomLib_Tool

  // GeomLib_Tool.constructor (constructor)
  constructor();

  // GeomLib_Tool.Parameter (method)
  static Parameter(Curve: Geom_Curve, Point: gp_Pnt, MaxDist: number, U: number): { returnValue: boolean; U: number };
  static Parameter(Curve: Geom2d_Curve, Point: gp_Pnt2d, MaxDist: number, U: number): { returnValue: boolean; U: number };

  // GeomLib_Tool.Parameters (method)
  static Parameters(Surface: Geom_Surface, Point: gp_Pnt, MaxDist: number, U?: number, V?: number): { returnValue: boolean; U: number; V: number };

  // GeomLib_Tool.ComputeDeviation (method)
  static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theStartParameter: number, theNbIters: number, thePrmOnCurve: number, thePtOnCurve: gp_Pnt2d, theVecCurvLine: gp_Vec2d, theLine: gp_Lin2d): number;
  static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theNbSubIntervals: number, theNbIters: number, thePrmOnCurve: number): number;

  // GeomLib_Tool.delete (method)
  delete(): void;

  // GeomLib_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
