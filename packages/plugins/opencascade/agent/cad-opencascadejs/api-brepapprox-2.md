# libcascade — BRepApprox (2)

8 top-level symbols. Signatures are verbatim typescript.

BRepApprox_TheComputeLineBezierOfApprox: declare class BRepApprox_TheComputeLineBezierOfApprox

constructor

// Initializes the fields of the algorithm
Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

// runs the algorithm after having initialized the fields
Perform(Line: BRepApprox_TheMultiLineOfApprox): void;

// changes the degrees of the approximation
SetDegrees(degreemin: number, degreemax: number): void;

// Changes the tolerances of the approximation
SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

// changes the first and the last constraint points
SetConstraints(firstC: AppParCurves_Constraint, lastC: AppParCurves_Constraint): void;

// returns False if at a moment of the approximation, the status NoApproximation has been sent by the user when more points were needed
IsAllApproximated(): boolean;

// returns False if the status NoPointsAdded has been sent
IsToleranceReached(): boolean;

// returns the tolerances 2d and 3d of the <Index> MultiCurve
Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

// Returns the number of MultiCurve doing the approximation of the MultiLine
NbMultiCurves(): number;

// returns the result of the approximation
Value(Index?: number): AppParCurves_MultiCurve;

// returns the result of the approximation
ChangeValue(Index?: number): AppParCurves_MultiCurve;

// returns the result of the approximation
SplineValue(): AppParCurves_MultiBSpCurve;

// returns the type of parametrization
Parametrization(): Approx_ParametrizationType;

// returns the new parameters of the approximation corresponding to the points of the multicurve <Index>
Parameters(Index: number): NCollection_Array1_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheComputeLineOfApprox: declare class BRepApprox_TheComputeLineOfApprox

constructor

// Constructs an interpolation of the MultiLine <Line> The result will be a C2 curve of degree 3
Interpol(Line: BRepApprox_TheMultiLineOfApprox): void;

// Initializes the fields of the algorithm
Init(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, NbIterations?: number, cutting?: boolean, parametrization?: Approx_ParametrizationType, Squares?: boolean): void;

// runs the algorithm after having initialized the fields
Perform(Line: BRepApprox_TheMultiLineOfApprox): void;

// The approximation will begin with the set of parameters <ThePar>
SetParameters(ThePar: math_VectorBase_double): void;

// The approximation will be done with the set of knots <Knots>
SetKnots(Knots: NCollection_Array1_double): void;

// The approximation will be done with the set of knots <Knots> and the multiplicities <Mults>
SetKnotsAndMultiplicities(Knots: NCollection_Array1_double, Mults: NCollection_Array1_int): void;

// changes the degrees of the approximation
SetDegrees(degreemin: number, degreemax: number): void;

// Changes the tolerances of the approximation
SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

// sets the continuity of the spline
SetContinuity(C: number): void;

// changes the first and the last constraint points
SetConstraints(firstC: AppParCurves_Constraint, lastC: AppParCurves_Constraint): void;

// Sets periodic flag
SetPeriodic(thePeriodic: boolean): void;

// returns False if at a moment of the approximation, the status NoApproximation has been sent by the user when more points were needed
IsAllApproximated(): boolean;

// returns False if the status NoPointsAdded has been sent
IsToleranceReached(): boolean;

// returns the tolerances 2d and 3d of the MultiBSpCurve
Error(tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

// returns the result of the approximation
Value(): AppParCurves_MultiBSpCurve;

// returns the result of the approximation
ChangeValue(): AppParCurves_MultiBSpCurve;

// returns the new parameters of the approximation corresponding to the points of the MultiBSpCurve
Parameters(): NCollection_Array1_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheImpPrmSvSurfacesOfApprox: declare class BRepApprox_TheImpPrmSvSurfacesOfApprox extends ApproxInt_SvSurfaces

constructor

// returns True if Tg,Tguv1 Tguv2 can be computed
Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };
// Pt: Mutated in place
// Tg: Mutated in place
// Tguv1: Mutated in place
// Tguv2: Mutated in place

Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

// computes point on curve and parameters on the surfaces
SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;
// Point: Mutated in place

Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

FillInitialVectorOfSolution(u1: number, v1: number, u2: number, v2: number, binfu: number, bsupu: number, binfv: number, bsupv: number, X: math_VectorBase_double, TranslationU?: number, TranslationV?: number): { returnValue: boolean; TranslationU: number; TranslationV: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox: declare class BRepApprox_TheInt2SOfThePrmPrmSvSurfacesOfApprox

constructor

// returns the best constant isoparametric to find the next intersection's point +stores the solution point (the solution point is found with the close point to intersect the isoparametric with the other patch
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;

// Returns TRUE if the creation completed without failure
IsDone(): boolean;

// Returns TRUE when there is no solution to the problem
IsEmpty(): boolean;

// Returns the intersection point
Point(): IntSurf_PntOn2S;

// Returns True if the surfaces are tangent at the intersection point
IsTangent(): boolean;

// Returns the tangent at the intersection line
Direction(): gp_Dir;

// Returns the tangent at the intersection line in the parametric space of the first surface
DirectionOnS1(): gp_Dir2d;

// Returns the tangent at the intersection line in the parametric space of the second surface
DirectionOnS2(): gp_Dir2d;

// return the intersection point which is enable for changing
ChangePoint(): IntSurf_PntOn2S;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheMultiLineOfApprox: declare class BRepApprox_TheMultiLineOfApprox

constructor

FirstPoint(): number;

LastPoint(): number;

// Returns the number of 2d points of a TheLine
NbP2d(): number;

// Returns the number of 3d points of a TheLine
NbP3d(): number;

WhatStatus(): Approx_Status;

// Returns the 3d points of the multipoint <MPointIndex> when only 3d points exist
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
Value(MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
Value(MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
Value(MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
Value(MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
// tabPt: Mutated in place

// Returns the 3d tangency points of the multipoint <MPointIndex> only when 3d points exist
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
Tangency(MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
Tangency(MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
Tangency(MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
Tangency(MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
// tabV: Mutated in place

// Tries to make a sub-line between <Low> and <High> points of this line by adding <NbPointsToInsert> new points
MakeMLBetween(Low: number, High: number, NbPointsToInsert: number): BRepApprox_TheMultiLineOfApprox;

// Tries to make a sub-line between <Low> and <High> points of this line by adding one more point between (indbad-1)-th and indbad-th points
MakeMLOneMorePoint(Low: number, High: number, indbad: number, OtherLine: BRepApprox_TheMultiLineOfApprox): boolean;
// OtherLine: Mutated in place

// Dump of the current multi-line
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheMultiLineToolOfApprox: declare class BRepApprox_TheMultiLineToolOfApprox

constructor

// Returns the number of multipoints of the TheMultiLine
static FirstPoint(ML: BRepApprox_TheMultiLineOfApprox): number;

// Returns the number of multipoints of the TheMultiLine
static LastPoint(ML: BRepApprox_TheMultiLineOfApprox): number;

// Returns the number of 2d points of a TheMultiLine
static NbP2d(ML: BRepApprox_TheMultiLineOfApprox): number;

// Returns the number of 3d points of a TheMultiLine
static NbP3d(ML: BRepApprox_TheMultiLineOfApprox): number;

// returns the 3d points of the multipoint <MPointIndex> when only 3d points exist
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
static Value(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabPt: NCollection_Array1_gp_Pnt, tabPt2d: NCollection_Array1_gp_Pnt2d): void;
// tabPt: Mutated in place

// returns the 3d points of the multipoint <MPointIndex> when only 3d points exist
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Tangency(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
// tabV: Mutated in place

// returns the 3d curvature of the multipoint <MPointIndex> when only 3d points exist
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
static Curvature(ML: BRepApprox_TheMultiLineOfApprox, MPointIndex: number, tabV: NCollection_Array1_gp_Vec, tabV2d: NCollection_Array1_gp_Vec2d): boolean;
// tabV: Mutated in place

// Is called if WhatStatus returned "PointsAdded"
static MakeMLBetween(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number, NbPMin: number): BRepApprox_TheMultiLineOfApprox;

// Is called when the Bezier curve contains a loop
static MakeMLOneMorePoint(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number, indbad: number, OtherLine: BRepApprox_TheMultiLineOfApprox): boolean;
// OtherLine: Mutated in place

static WhatStatus(ML: BRepApprox_TheMultiLineOfApprox, I1: number, I2: number): Approx_Status;

// Dump of the current multi-line
static Dump(ML: BRepApprox_TheMultiLineOfApprox): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_ThePrmPrmSvSurfacesOfApprox: declare class BRepApprox_ThePrmPrmSvSurfacesOfApprox extends ApproxInt_SvSurfaces

constructor

// returns True if Tg,Tguv1 Tguv2 can be computed
Compute(u1: number, v1: number, u2: number, v2: number, Pt: gp_Pnt, Tg: gp_Vec, Tguv1: gp_Vec2d, Tguv2: gp_Vec2d): { returnValue: boolean; u1: number; v1: number; u2: number; v2: number };
// Pt: Mutated in place
// Tg: Mutated in place
// Tguv1: Mutated in place
// Tguv2: Mutated in place

Pnt(u1: number, v1: number, u2: number, v2: number, P: gp_Pnt): void;

// computes point on curve and parameters on the surfaces
SeekPoint(u1: number, v1: number, u2: number, v2: number, Point: IntSurf_PntOn2S): boolean;
// Point: Mutated in place

Tangency(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec): boolean;

TangencyOnSurf1(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

TangencyOnSurf2(u1: number, v1: number, u2: number, v2: number, Tg: gp_Vec2d): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox: declare class BRepApprox_TheZerImpFuncOfTheImpPrmSvSurfacesOfApprox extends math_FunctionSetWithDerivatives

constructor

Set(PS: BRepAdaptor_Surface): void;
Set(Tolerance: number): void;
Set(PS: BRepAdaptor_Surface): void;
Set(Tolerance: number): void;

SetImplicitSurface(IS: IntSurf_Quadric): void;

// Returns the number of variables of the function
NbVariables(): number;

// Returns the number of equations of the function
NbEquations(): number;

// Computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

Root(): number;

// Returns the value Tol so that if std::abs(Func.Root())<Tol the function is considered null
Tolerance(): number;

Point(): gp_Pnt;

IsTangent(): boolean;

Direction3d(): gp_Vec;

Direction2d(): gp_Dir2d;

PSurface(): BRepAdaptor_Surface;

ISurface(): IntSurf_Quadric;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
