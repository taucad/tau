# libcascade — BRepApprox

19 top-level symbols. Signatures are verbatim typescript.

BRepApprox_ApproxLine: declare class BRepApprox_ApproxLine extends Standard_Transient

constructor

NbPnts(): number;

Point(Index: number): IntSurf_PntOn2S;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfApprox extends math_BFGS

constructor

IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfApprox extends math_MultipleVarFunctionWithGradient

constructor

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

NewParameters(): math_VectorBase_double;

CurveValue(): AppParCurves_MultiBSpCurve;

Error(IPoint: number, CurveIndex: number): number;

MaxError3d(): number;

MaxError2d(): number;

FunctionMatrix(): math_Matrix;

DerivativeFunctionMatrix(): math_Matrix;

Index(): math_VectorBase_int;

FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

SetFirstLambda(l1: number): void;

SetLastLambda(l2: number): void;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfApprox

constructor

Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

IsDone(): boolean;

BezierValue(): AppParCurves_MultiCurve;

BSplineValue(): AppParCurves_MultiBSpCurve;

FunctionMatrix(): math_Matrix;

DerivativeFunctionMatrix(): math_Matrix;

ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

Distance(): math_Matrix;

Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

FirstLambda(): number;

LastLambda(): number;

Points(): math_Matrix;

Poles(): math_Matrix;

KIndex(): math_VectorBase_int;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfApprox extends math_BFGS

constructor

IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfApprox extends math_BFGS

constructor

IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_MyBSplGradientOfTheComputeLineOfApprox: declare class BRepApprox_MyBSplGradientOfTheComputeLineOfApprox

constructor

IsDone(): boolean;

Value(): AppParCurves_MultiBSpCurve;

Error(Index: number): number;

MaxError3d(): number;

MaxError2d(): number;

AverageError(): number;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_MyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_MyGradientOfTheComputeLineBezierOfApprox

constructor

IsDone(): boolean;

Value(): AppParCurves_MultiCurve;

Error(Index: number): number;

MaxError3d(): number;

MaxError2d(): number;

AverageError(): number;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_MyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_MyGradientbisOfTheComputeLineOfApprox

constructor

IsDone(): boolean;

Value(): AppParCurves_MultiCurve;

Error(Index: number): number;

MaxError3d(): number;

MaxError2d(): number;

AverageError(): number;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_ParFunctionOfMyGradientOfTheComputeLineBezierOfApprox extends math_MultipleVarFunctionWithGradient

constructor

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

NewParameters(): math_VectorBase_double;

CurveValue(): AppParCurves_MultiCurve;

Error(IPoint: number, CurveIndex: number): number;

MaxError3d(): number;

MaxError2d(): number;

FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_ParFunctionOfMyGradientbisOfTheComputeLineOfApprox extends math_MultipleVarFunctionWithGradient

constructor

NbVariables(): number;

Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

NewParameters(): math_VectorBase_double;

CurveValue(): AppParCurves_MultiCurve;

Error(IPoint: number, CurveIndex: number): number;

MaxError3d(): number;

MaxError2d(): number;

FirstConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, FirstPoint: number): AppParCurves_Constraint;

LastConstraint(TheConstraints: NCollection_HArray1_AppParCurves_ConstraintCouple, LastPoint: number): AppParCurves_Constraint;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox: declare class BRepApprox_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfApprox

constructor

Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

IsDone(): boolean;

BezierValue(): AppParCurves_MultiCurve;

BSplineValue(): AppParCurves_MultiBSpCurve;

FunctionMatrix(): math_Matrix;

DerivativeFunctionMatrix(): math_Matrix;

ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

Distance(): math_Matrix;

Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

FirstLambda(): number;

LastLambda(): number;

Points(): math_Matrix;

Poles(): math_Matrix;

KIndex(): math_VectorBase_int;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox: declare class BRepApprox_ParLeastSquareOfMyGradientbisOfTheComputeLineOfApprox

constructor

Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double): void;
Perform(Parameters: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, l1: number, l2: number): void;
Perform(Parameters: math_VectorBase_double, V1t: math_VectorBase_double, V2t: math_VectorBase_double, V1c: math_VectorBase_double, V2c: math_VectorBase_double, l1: number, l2: number): void;

IsDone(): boolean;

BezierValue(): AppParCurves_MultiCurve;

BSplineValue(): AppParCurves_MultiBSpCurve;

FunctionMatrix(): math_Matrix;

DerivativeFunctionMatrix(): math_Matrix;

ErrorGradient(Grad: math_VectorBase_double, F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

Distance(): math_Matrix;

Error(F?: number, MaxE3d?: number, MaxE2d?: number): { F: number; MaxE3d: number; MaxE2d: number };

FirstLambda(): number;

LastLambda(): number;

Points(): math_Matrix;

Poles(): math_Matrix;

KIndex(): math_VectorBase_int;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_SurfaceTool: declare class BRepApprox_SurfaceTool

constructor

static FirstUParameter(S: BRepAdaptor_Surface): number;

static FirstVParameter(S: BRepAdaptor_Surface): number;

static LastUParameter(S: BRepAdaptor_Surface): number;

static LastVParameter(S: BRepAdaptor_Surface): number;

static NbUIntervals(S: BRepAdaptor_Surface, Sh: GeomAbs_Shape): number;

static NbVIntervals(S: BRepAdaptor_Surface, Sh: GeomAbs_Shape): number;

static UIntervals(S: BRepAdaptor_Surface, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;

static VIntervals(S: BRepAdaptor_Surface, T: NCollection_Array1_double, Sh: GeomAbs_Shape): void;

static UTrim(S: BRepAdaptor_Surface, First: number, Last: number, Tol: number): Adaptor3d_Surface;

static VTrim(S: BRepAdaptor_Surface, First: number, Last: number, Tol: number): Adaptor3d_Surface;

static IsUClosed(S: BRepAdaptor_Surface): boolean;

static IsVClosed(S: BRepAdaptor_Surface): boolean;

static IsUPeriodic(S: BRepAdaptor_Surface): boolean;

static UPeriod(S: BRepAdaptor_Surface): number;

static IsVPeriodic(S: BRepAdaptor_Surface): boolean;

static VPeriod(S: BRepAdaptor_Surface): number;

static Value(S: BRepAdaptor_Surface, u: number, v: number): gp_Pnt;

static D0(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt): void;

static D1(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1u: gp_Vec, D1v: gp_Vec): void;

static D2(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec): void;

static D3(S: BRepAdaptor_Surface, u: number, v: number, P: gp_Pnt, D1U: gp_Vec, D1V: gp_Vec, D2U: gp_Vec, D2V: gp_Vec, D2UV: gp_Vec, D3U: gp_Vec, D3V: gp_Vec, D3UUV: gp_Vec, D3UVV: gp_Vec): void;

static DN(S: BRepAdaptor_Surface, u: number, v: number, Nu: number, Nv: number): gp_Vec;

static UResolution(S: BRepAdaptor_Surface, R3d: number): number;

static VResolution(S: BRepAdaptor_Surface, R3d: number): number;

static GetType(S: BRepAdaptor_Surface): GeomAbs_SurfaceType;

static Plane(S: BRepAdaptor_Surface): gp_Pln;

static Cylinder(S: BRepAdaptor_Surface): gp_Cylinder;

static Cone(S: BRepAdaptor_Surface): gp_Cone;

static Torus(S: BRepAdaptor_Surface): gp_Torus;

static Sphere(S: BRepAdaptor_Surface): gp_Sphere;

static Bezier(S: BRepAdaptor_Surface): Geom_BezierSurface;

static BSpline(S: BRepAdaptor_Surface): Geom_BSplineSurface;

static AxeOfRevolution(S: BRepAdaptor_Surface): gp_Ax1;

static Direction(S: BRepAdaptor_Surface): gp_Dir;

static BasisCurve(S: BRepAdaptor_Surface): Adaptor3d_Curve;

static NbSamplesU(S: BRepAdaptor_Surface): number;
static NbSamplesU(S: BRepAdaptor_Surface, u1: number, u2: number): number;
static NbSamplesU(S: BRepAdaptor_Surface): number;
static NbSamplesU(S: BRepAdaptor_Surface, u1: number, u2: number): number;

static NbSamplesV(S: BRepAdaptor_Surface): number;
static NbSamplesV(S: BRepAdaptor_Surface, v1: number, v2: number): number;
static NbSamplesV(S: BRepAdaptor_Surface): number;
static NbSamplesV(S: BRepAdaptor_Surface, v1: number, v2: number): number;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheComputeLineBezierOfApprox: declare class BRepApprox_TheComputeLineBezierOfApprox

constructor

Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

Perform(Line: BRepApprox_TheMultiLineOfApprox): void;

SetDegrees(degreemin: number, degreemax: number): void;

SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

SetConstraints(firstC: AppParCurves_Constraint, lastC: AppParCurves_Constraint): void;

IsAllApproximated(): boolean;

IsToleranceReached(): boolean;

Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

NbMultiCurves(): number;

Value(Index?: number): AppParCurves_MultiCurve;

ChangeValue(Index?: number): AppParCurves_MultiCurve;

SplineValue(): AppParCurves_MultiBSpCurve;

Parametrization(): Approx_ParametrizationType;

Parameters(Index: number): NCollection_Array1_double;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheComputeLineOfApprox: declare class BRepApprox_TheComputeLineOfApprox

constructor

Interpol(Line: BRepApprox_TheMultiLineOfApprox): void;

Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

Perform(Line: BRepApprox_TheMultiLineOfApprox): void;

SetParameters(ThePar: math_VectorBase_double): void;

SetKnots(Knots: NCollection_Array1_double): void;

SetKnotsAndMultiplicities(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int): void;

SetDegrees(degreemin: number, degreemax: number): void;

SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

SetContinuity(C: number): void;

SetConstraints(firstC: AppParCurves_Constraint, lastC: AppParCurves_Constraint): void;

SetPeriodic(thePeriodic: boolean): void;

IsAllApproximated(): boolean;

IsToleranceReached(): boolean;

Error(tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

Value(): AppParCurves_MultiBSpCurve;

ChangeValue(): AppParCurves_MultiBSpCurve;

Parameters(): NCollection_Array1_double;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheImpPrmSvSurfacesOfApprox: declare class BRepApprox_TheImpPrmSvSurfacesOfApprox extends ApproxInt_SvSurfaces

constructor

Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };

Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;

Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

FillInitialVectorOfSolution(u1: number, v1: number, u2: number, v2: number, binfu: number, bsupu: number, binfv: number, bsupv: number, X: math_VectorBase_double, TranslationU?: number, TranslationV?: number): { returnValue: boolean; TranslationU: number; TranslationV: number };

delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox: declare class BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox

constructor

Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;

IsDone(): boolean;

IsEmpty(): boolean;

Point(): IntSurf_PntOn2S;

IsTangent(): boolean;

Direction(): gp_Dir;

DirectionOnS1(): gp_Dir2d;

DirectionOnS2(): gp_Dir2d;

ChangePoint(): IntSurf_PntOn2S;

delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheMultiLineOfApprox: declare class BRepApprox_TheMultiLineOfApprox

constructor

FirstPoint(): number;

LastPoint(): number;

NbP2d(): number;

NbP3d(): number;

WhatStatus(): Approx_Status;

Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
Value(MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
Value(MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
Value(MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;

Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
Tangency(MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
Tangency(MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
Tangency(MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;

MakeMLBetween(Low: number, High: number, NbPointsToInsert: number): BRepApprox_TheMultiLineOfApprox;

MakeMLOneMorePoint(Low: number, High: number, indbad: number, OtherLine: BRepApprox_TheMultiLineOfApprox): boolean;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;
