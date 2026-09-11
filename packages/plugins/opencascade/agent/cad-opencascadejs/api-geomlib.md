# libcascade — GeomLib

12 top-level symbols. Signatures are verbatim typescript.

GeomLib: declare class GeomLib

constructor

static To3d(Position: gp_Ax2, Curve2d: Geom2d_Curve): Geom_Curve;

static GTransform(Curve: Geom2d_Curve, GTrsf: gp_GTrsf2d): Geom2d_Curve;

static SameRange(Tolerance: number, Curve2dPtr: Geom2d_Curve, First: number, Last: number, RequestedFirst: number, RequestedLast: number): { NewCurve2dPtr: Geom2d_Curve; [Symbol.dispose](): void };

static BuildCurve3d(Tolerance: number, CurvePtr: Adaptor3d_CurveOnSurface, FirstParameter: number, LastParameter: number, MaxDeviation: number, AverageDeviation: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegment: number): { NewCurvePtr: Geom_Curve; MaxDeviation: number; AverageDeviation: number; [Symbol.dispose](): void };

static AdjustExtremity(P1: gp_Pnt, P2: gp_Pnt, T1: gp_Vec, T2: gp_Vec): { Curve: Geom_BoundedCurve; [Symbol.dispose](): void };

static ExtendCurveToPoint(Point: gp_Pnt, Cont: number, After: boolean): { Curve: Geom_BoundedCurve; [Symbol.dispose](): void };

static ExtendSurfByLength(Length: number, Cont: number, InU: boolean, After: boolean): { Surf: Geom_BoundedSurface; [Symbol.dispose](): void };

static AxeOfInertia(Points: NCollection_Array1_gp_Pnt, Axe: gp_Ax2, IsSingular: boolean, Tol: number): { IsSingular: boolean };

static Inertia(Points: NCollection_Array1_gp_Pnt, Bary: gp_Pnt, XDir: gp_Dir, YDir: gp_Dir, Xgap?: number, YGap?: number, ZGap?: number): { Xgap: number; YGap: number; ZGap: number };

static RemovePointsFromArray(NumPoints: number, InParameters: NCollection_Array1_double): { OutParameters: NCollection_HArray1_double; [Symbol.dispose](): void };

static DensifyArray1OfReal(MinNumPoints: number, InParameters: NCollection_Array1_double): { OutParameters: NCollection_HArray1_double; [Symbol.dispose](): void };

static FuseIntervals(Interval1: NCollection_Array1_double, Interval2: NCollection_Array1_double, Fusion: NCollection_Sequence_double, Confusion: number, IsAdjustToFirstInterval: boolean): void;

static EvalMaxParametricDistance(Curve: Adaptor3d_Curve, AReferenceCurve: Adaptor3d_Curve, Tolerance: number, Parameters: NCollection_Array1_double, MaxDistance?: number): { MaxDistance: number };

static EvalMaxDistanceAlongParameter(Curve: Adaptor3d_Curve, AReferenceCurve: Adaptor3d_Curve, Tolerance: number, Parameters: NCollection_Array1_double, MaxDistance?: number): { MaxDistance: number };

static CancelDenominatorDerivative(UDirection: boolean, VDirection: boolean): { BSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

static NormEstim(theSurf: Geom_Surface, theUV: gp_Pnt2d, theTol: number, theNorm: gp_Dir): number;

static IsClosed(S: Geom_Surface, Tol: number, isUClosed?: boolean, isVClosed?: boolean): { isUClosed: boolean; isVClosed: boolean };

static IsBSplUClosed(S: Geom_BSplineSurface, U1: number, U2: number, Tol: number): boolean;

static IsBSplVClosed(S: Geom_BSplineSurface, V1: number, V2: number, Tol: number): boolean;

static IsBzUClosed(S: Geom_BezierSurface, U1: number, U2: number, Tol: number): boolean;

static IsBzVClosed(S: Geom_BezierSurface, V1: number, V2: number, Tol: number): boolean;

static isIsoLine(theC2D: Adaptor2d_Curve2d, theIsU?: boolean, theParam?: number, theIsForward?: boolean): { returnValue: boolean; theIsU: boolean; theParam: number; theIsForward: boolean };

static buildC3dOnIsoLine(theC2D: Adaptor2d_Curve2d, theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTolerance: number, theIsU: boolean, theParam: number, theIsForward: boolean): Geom_Curve;

delete(): void;

[Symbol.dispose](): void;

GeomLib_Check2dBSplineCurve: declare class GeomLib_Check2dBSplineCurve

constructor

IsDone(): boolean;

NeedTangentFix(FirstFlag?: boolean, SecondFlag?: boolean): { FirstFlag: boolean; SecondFlag: boolean };

FixTangent(FirstFlag: boolean, LastFlag: boolean): void;

FixedTangent(FirstFlag: boolean, LastFlag: boolean): Geom2d_BSplineCurve;

delete(): void;

[Symbol.dispose](): void;

GeomLib_CheckBSplineCurve: declare class GeomLib_CheckBSplineCurve

constructor

IsDone(): boolean;

NeedTangentFix(FirstFlag?: boolean, SecondFlag?: boolean): { FirstFlag: boolean; SecondFlag: boolean };

FixTangent(FirstFlag: boolean, LastFlag: boolean): void;

FixedTangent(FirstFlag: boolean, LastFlag: boolean): Geom_BSplineCurve;

delete(): void;

[Symbol.dispose](): void;

GeomLib_CheckCurveOnSurface: declare class GeomLib_CheckCurveOnSurface

constructor

Init(theCurve: Adaptor3d_Curve, theTolRange: number): void;
Init(): void;
Init(theCurve: Adaptor3d_Curve, theTolRange: number): void;
Init(): void;

Perform(theCurveOnSurface: Adaptor3d_CurveOnSurface): void;

SetParallel(theIsParallel: boolean): void;

IsParallel(): boolean;

IsDone(): boolean;

ErrorStatus(): number;

MaxDistance(): number;

MaxParameter(): number;

delete(): void;

[Symbol.dispose](): void;

GeomLib_DenominatorMultiplier: declare class GeomLib_DenominatorMultiplier

constructor

Value(UParameter: number, VParameter: number): number;

delete(): void;

[Symbol.dispose](): void;

GeomLib_Interpolate: declare class GeomLib_Interpolate

constructor

IsDone(): boolean;

Error(): GeomLib_InterpolationErrors;

Curve(): Geom_BSplineCurve;

delete(): void;

[Symbol.dispose](): void;

GeomLib_InterpolationErrors: typeof GeomLib_InterpolationErrors[keyof typeof GeomLib_InterpolationErrors]

GeomLib_IsPlanarSurface: declare class GeomLib_IsPlanarSurface

constructor

IsPlanar(): boolean;

Plan(): gp_Pln;

delete(): void;

[Symbol.dispose](): void;

GeomLib_LogSample: declare class GeomLib_LogSample extends math_FunctionSample

constructor

GetParameter(Index: number): number;

delete(): void;

[Symbol.dispose](): void;

GeomLib_MakeCurvefromApprox: declare class GeomLib_MakeCurvefromApprox

constructor

IsDone(): boolean;

Nb1DSpaces(): number;

Nb2DSpaces(): number;

Nb3DSpaces(): number;

Curve2d(Index2d: number): Geom2d_BSplineCurve;
Curve2d(Index1d: number, Index2d: number): Geom2d_BSplineCurve;
Curve2d(Index2d: number): Geom2d_BSplineCurve;
Curve2d(Index1d: number, Index2d: number): Geom2d_BSplineCurve;

Curve2dFromTwo1d(Index1d: number, Index2d: number): Geom2d_BSplineCurve;

Curve(Index3d: number): Geom_BSplineCurve;
Curve(Index1D: number, Index3D: number): Geom_BSplineCurve;
Curve(Index3d: number): Geom_BSplineCurve;
Curve(Index1D: number, Index3D: number): Geom_BSplineCurve;

delete(): void;

[Symbol.dispose](): void;

GeomLib_PolyFunc: declare class GeomLib_PolyFunc extends math_FunctionWithDerivative

constructor

Value(X: number, F: number): { returnValue: boolean; F: number };

Derivative(X: number, D: number): { returnValue: boolean; D: number };

Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

delete(): void;

[Symbol.dispose](): void;

GeomLib_Tool: declare class GeomLib_Tool

constructor

static Parameter(Curve: Geom_Curve, Point: gp_Pnt, MaxDist: number, U: number): { returnValue: boolean; U: number };
static Parameter(Curve: Geom2d_Curve, Point: gp_Pnt2d, MaxDist: number, U: number): { returnValue: boolean; U: number };
static Parameter(Curve: Geom_Curve, Point: gp_Pnt, MaxDist: number, U: number): { returnValue: boolean; U: number };
static Parameter(Curve: Geom2d_Curve, Point: gp_Pnt2d, MaxDist: number, U: number): { returnValue: boolean; U: number };

static Parameters(Surface: Geom_Surface, Point: gp_Pnt, MaxDist: number, U?: number, V?: number): { returnValue: boolean; U: number; V: number };

static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theStartParameter: number, theNbIters: number, thePrmOnCurve: number, thePtOnCurve: gp_Pnt2d, theVecCurvLine: gp_Vec2d, theLine: gp_Lin2d): number;
static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theNbSubIntervals: number, theNbIters: number, thePrmOnCurve: number): number;
static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theStartParameter: number, theNbIters: number, thePrmOnCurve: number, thePtOnCurve: gp_Pnt2d, theVecCurvLine: gp_Vec2d, theLine: gp_Lin2d): number;
static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theNbSubIntervals: number, theNbIters: number, thePrmOnCurve: number): number;

delete(): void;

[Symbol.dispose](): void;
