# libcascade — GeomInt

24 top-level symbols. Signatures are verbatim typescript.

GeomInt: declare class GeomInt

constructor

static AdjustPeriodic(thePar: number, theParMin: number, theParMax: number, thePeriod: number, theNewPar: number, theOffset: number, theEps: number): { returnValue: boolean; theNewPar: number; theOffset: number };

delete(): void;

[Symbol.dispose](): void;

GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpGradient_BFGSOfMyBSplGradientOfTheComputeLineOfWLApprox extends math_BFGS

constructor

IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

delete(): void;

[Symbol.dispose](): void;

GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpParFunctionOfMyBSplGradientOfTheComputeLineOfWLApprox extends math_MultipleVarFunctionWithGradient

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

GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_BSpParLeastSquareOfMyBSplGradientOfTheComputeLineOfWLApprox

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

GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_Gradient_BFGSOfMyGradientOfTheComputeLineBezierOfWLApprox extends math_BFGS

constructor

IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

delete(): void;

[Symbol.dispose](): void;

GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_Gradient_BFGSOfMyGradientbisOfTheComputeLineOfWLApprox extends math_BFGS

constructor

IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

delete(): void;

[Symbol.dispose](): void;

GeomInt_IntSS: declare class GeomInt_IntSS

constructor

Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(S1: Geom_Surface, S2: Geom_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;
Perform(HS1: GeomAdaptor_Surface, HS2: GeomAdaptor_Surface, Tol: number, U1: number, V1: number, U2: number, V2: number, Approx: boolean, ApproxS1: boolean, ApproxS2: boolean): void;

IsDone(): boolean;

TolReached3d(): number;

TolReached2d(): number;

NbLines(): number;

Line(Index: number): Geom_Curve;

HasLineOnS1(Index: number): boolean;

LineOnS1(Index: number): Geom2d_Curve;

HasLineOnS2(Index: number): boolean;

LineOnS2(Index: number): Geom2d_Curve;

NbBoundaries(): number;

Boundary(Index: number): Geom_Curve;

NbPoints(): number;

Point(Index: number): gp_Pnt;

Pnt2d(Index: number, OnFirst: boolean): gp_Pnt2d;

static BuildPCurves(theFirst: number, theLast: number, theUmin: number, theUmax: number, theVmin: number, theVmax: number, theTol: number, theSurface: Geom_Surface, theCurve: Geom_Curve): { theTol: number; theCurve2d: Geom2d_Curve; [Symbol.dispose](): void };
static BuildPCurves(f: number, l: number, Tol: number, S: Geom_Surface, C: Geom_Curve): { Tol: number; C2d: Geom2d_Curve; [Symbol.dispose](): void };
static BuildPCurves(theFirst: number, theLast: number, theUmin: number, theUmax: number, theVmin: number, theVmax: number, theTol: number, theSurface: Geom_Surface, theCurve: Geom_Curve): { theTol: number; theCurve2d: Geom2d_Curve; [Symbol.dispose](): void };
static BuildPCurves(f: number, l: number, Tol: number, S: Geom_Surface, C: Geom_Curve): { Tol: number; C2d: Geom2d_Curve; [Symbol.dispose](): void };

static TrimILineOnSurfBoundaries(theC2d1: Geom2d_Curve, theC2d2: Geom2d_Curve, theBound1: Bnd_Box2d, theBound2: Bnd_Box2d, theArrayOfParameters: NCollection_DynamicArray_double): void;

static MakeBSpline(WL: IntPatch_WLine, ideb: number, ifin: number): Geom_Curve;

static MakeBSpline2d(theWLine: IntPatch_WLine, ideb: number, ifin: number, onFirst: boolean): Geom2d_BSplineCurve;

delete(): void;

[Symbol.dispose](): void;

GeomInt_LineConstructor: declare class GeomInt_LineConstructor

constructor

Load(D1: Adaptor3d_TopolTool, D2: Adaptor3d_TopolTool, S1: GeomAdaptor_Surface, S2: GeomAdaptor_Surface): void;

Perform(L: IntPatch_Line): void;

IsDone(): boolean;

NbParts(): number;

Part(I: number, WFirst?: number, WLast?: number): { WFirst: number; WLast: number };

delete(): void;

[Symbol.dispose](): void;

GeomInt_LineTool: declare class GeomInt_LineTool

constructor

static NbVertex(L: IntPatch_Line): number;

static Vertex(L: IntPatch_Line, I: number): IntPatch_Point;

static FirstParameter(L: IntPatch_Line): number;

static LastParameter(L: IntPatch_Line): number;

static DecompositionOfWLine(theWLine: IntPatch_WLine, theSurface1: GeomAdaptor_Surface, theSurface2: GeomAdaptor_Surface, aTolSum: number, theLConstructor: GeomInt_LineConstructor, theNewLines: NCollection_Sequence_handle_IntPatch_Line): boolean;

delete(): void;

[Symbol.dispose](): void;

GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox: declare class GeomInt_MyBSplGradientOfTheComputeLineOfWLApprox

constructor

IsDone(): boolean;

Value(): AppParCurves_MultiBSpCurve;

Error(Index: number): number;

MaxError3d(): number;

MaxError2d(): number;

AverageError(): number;

delete(): void;

[Symbol.dispose](): void;

GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_MyGradientOfTheComputeLineBezierOfWLApprox

constructor

IsDone(): boolean;

Value(): AppParCurves_MultiCurve;

Error(Index: number): number;

MaxError3d(): number;

MaxError2d(): number;

AverageError(): number;

delete(): void;

[Symbol.dispose](): void;

GeomInt_MyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_MyGradientbisOfTheComputeLineOfWLApprox

constructor

IsDone(): boolean;

Value(): AppParCurves_MultiCurve;

Error(Index: number): number;

MaxError3d(): number;

MaxError2d(): number;

AverageError(): number;

delete(): void;

[Symbol.dispose](): void;

GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_ParFunctionOfMyGradientOfTheComputeLineBezierOfWLApprox extends math_MultipleVarFunctionWithGradient

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

GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_ParFunctionOfMyGradientbisOfTheComputeLineOfWLApprox extends math_MultipleVarFunctionWithGradient

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

GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_ParLeastSquareOfMyGradientOfTheComputeLineBezierOfWLApprox

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

GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_ParLeastSquareOfMyGradientbisOfTheComputeLineOfWLApprox

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

GeomInt_ParameterAndOrientation: declare class GeomInt_ParameterAndOrientation

constructor

SetOrientation1(Or: TopAbs_Orientation): void;

SetOrientation2(Or: TopAbs_Orientation): void;

Parameter(): number;

Orientation1(): TopAbs_Orientation;

Orientation2(): TopAbs_Orientation;

delete(): void;

[Symbol.dispose](): void;

GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox: declare class GeomInt_ResConstraintOfMyGradientOfTheComputeLineBezierOfWLApprox

constructor

IsDone(): boolean;

ConstraintMatrix(): math_Matrix;

Duale(): math_VectorBase_double;

ConstraintDerivative(SSP: GeomInt_TheMultiLineOfWLApprox, Parameters: math_VectorBase_double, Deg: number, DA: math_Matrix): math_Matrix;

InverseMatrix(): math_Matrix;

delete(): void;

[Symbol.dispose](): void;

GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox: declare class GeomInt_ResConstraintOfMyGradientbisOfTheComputeLineOfWLApprox

constructor

IsDone(): boolean;

ConstraintMatrix(): math_Matrix;

Duale(): math_VectorBase_double;

ConstraintDerivative(SSP: GeomInt_TheMultiLineOfWLApprox, Parameters: math_VectorBase_double, Deg: number, DA: math_Matrix): math_Matrix;

InverseMatrix(): math_Matrix;

delete(): void;

[Symbol.dispose](): void;

GeomInt_TheComputeLineBezierOfWLApprox: declare class GeomInt_TheComputeLineBezierOfWLApprox

constructor

Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

Perform(Line: GeomInt_TheMultiLineOfWLApprox): void;

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

GeomInt_TheComputeLineOfWLApprox: declare class GeomInt_TheComputeLineOfWLApprox

constructor

Interpol(Line: GeomInt_TheMultiLineOfWLApprox): void;

Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

Perform(Line: GeomInt_TheMultiLineOfWLApprox): void;

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

GeomInt_TheImpPrmSvSurfacesOfWLApprox: declare class GeomInt_TheImpPrmSvSurfacesOfWLApprox extends ApproxInt_SvSurfaces

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

GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox: declare class GeomInt_TheInt2SOfThePrmPrmSvSurfacesOfWLApprox

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

GeomInt_TheMultiLineOfWLApprox: declare class GeomInt_TheMultiLineOfWLApprox

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

MakeMLBetween(Low: number, High: number, NbPointsToInsert: number): GeomInt_TheMultiLineOfWLApprox;

MakeMLOneMorePoint(Low: number, High: number, indbad: number, OtherLine: GeomInt_TheMultiLineOfWLApprox): boolean;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;
