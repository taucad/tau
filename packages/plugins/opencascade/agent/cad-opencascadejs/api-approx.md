# libcascade — Approx

13 top-level symbols. Signatures are verbatim typescript.

// Makes an approximation for HCurve2d from Adaptor3d
Approx_Curve2d: declare class Approx_Curve2d

constructor

IsDone(): boolean;

HasResult(): boolean;

Curve(): Geom2d_BSplineCurve;

MaxError2dU(): number;

MaxError2dV(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Approx_Curve3d: declare class Approx_Curve3d

constructor

Curve(): Geom_BSplineCurve;

// returns true if the approximation has been done within required tolerance
IsDone(): boolean;

// returns true if the approximation did come out with a result that is not NECESSARILY within the required tolerance
HasResult(): boolean;

// returns the Maximum Error (>0 when an approximation has been done, 0 if no approximation)
MaxError(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Approximation of curve on surface
Approx_CurveOnSurface: declare class Approx_CurveOnSurface

constructor

IsDone(): boolean;

HasResult(): boolean;

Curve3d(): Geom_BSplineCurve;

MaxError3d(): number;

Curve2d(): Geom2d_BSplineCurve;

MaxError2dU(): number;

// returns the maximum errors relatively to the U component or the V component of the 2d Curve
MaxError2dV(): number;

// Constructs the 3d curve
Perform(theMaxSegments: number, theMaxDegree: number, theContinuity: GeomAbs_Shape, theOnly3d?: boolean, theOnly2d?: boolean): void;
// theMaxSegments: Maximal number of segments in the resulting spline
// theMaxDegree: Maximal degree of the result
// theContinuity: Resulting continuity
// theOnly3d: Determines building only 3D curve
// theOnly2d: Determines building only 2D curve

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Approximation of a Curve to make its parameter be its curvilinear abscissa
Approx_CurvilinearParameter: declare class Approx_CurvilinearParameter

constructor

IsDone(): boolean;

HasResult(): boolean;

// returns the Bspline curve corresponding to the reparametrized 3D curve
Curve3d(): Geom_BSplineCurve;

// returns the maximum error on the reparametrized 3D curve
MaxError3d(): number;

// returns the BsplineCurve representing the reparametrized 2D curve on the first surface (case of a curve on one or two surfaces)
Curve2d1(): Geom2d_BSplineCurve;

// returns the maximum error on the first reparametrized 2D curve
MaxError2d1(): number;

// returns the BsplineCurve representing the reparametrized 2D curve on the second surface (case of a curve on two surfaces)
Curve2d2(): Geom2d_BSplineCurve;

// returns the maximum error on the second reparametrized 2D curve
MaxError2d2(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines an abstract curve with curvilinear parametrization
Approx_CurvlinFunc: declare class Approx_CurvlinFunc extends Standard_Transient

constructor

// --Purpose Update the tolerance to used
SetTol(Tol: number): void;

FirstParameter(): number;

LastParameter(): number;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// if First < 0 or Last > 1
Trim(First: number, Last: number, Tol: number): void;

// Computes length of the curve
Length(): void;
Length(C: Adaptor3d_Curve, FirstU: number, LasrU: number): number;
Length(): void;
Length(C: Adaptor3d_Curve, FirstU: number, LasrU: number): number;

GetLength(): number;

// returns original parameter corresponding S
GetUParameter(C: Adaptor3d_Curve, S: number, NumberOfCurve: number): number;
// C: Mutated in place

// returns original parameter corresponding S
GetSParameter(U: number): number;

// if myCase != 1
EvalCase1(S: number, Order: number, Result: NCollection_Array1_double): boolean;
// Result: Mutated in place

// if myCase != 2
EvalCase2(S: number, Order: number, Result: NCollection_Array1_double): boolean;
// Result: Mutated in place

// if myCase != 3
EvalCase3(S: number, Order: number, Result: NCollection_Array1_double): boolean;
// Result: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Approx_FitAndDivide: declare class Approx_FitAndDivide

constructor

// runs the algorithm after having initialized the fields
Perform(Line: AppCont_Function): void;

// changes the degrees of the approximation
SetDegrees(degreemin: number, degreemax: number): void;

// Changes the tolerances of the approximation
SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

// Changes the constraints of the approximation
SetConstraints(FirstC: AppParCurves_Constraint, LastC: AppParCurves_Constraint): void;

// Changes the max number of segments, which is allowed for cutting
SetMaxSegments(theMaxSegments: number): void;

// Set inverse order of degree selection
SetInvOrder(theInvOrder: boolean): void;

// Set value of hang checking flag if this flag = true, possible hang of algorithm is checked and algorithm is forced to stop
SetHangChecking(theHangChecking: boolean): void;

// returns False if at a moment of the approximation, the status NoApproximation has been sent by the user when more points were needed
IsAllApproximated(): boolean;

// returns False if the status NoPointsAdded has been sent
IsToleranceReached(): boolean;

// returns the tolerances 2d and 3d of the <Index> MultiCurve
Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

// Returns the number of MultiCurve doing the approximation of the MultiLine
NbMultiCurves(): number;

// returns the approximation MultiCurve of range <Index>
Value(Index?: number): AppParCurves_MultiCurve;

Parameters(Index: number, firstp?: number, lastp?: number): { firstp: number; lastp: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Approx_FitAndDivide2d: declare class Approx_FitAndDivide2d

constructor

// runs the algorithm after having initialized the fields
Perform(Line: AppCont_Function): void;

// changes the degrees of the approximation
SetDegrees(degreemin: number, degreemax: number): void;

// Changes the tolerances of the approximation
SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

// Changes the constraints of the approximation
SetConstraints(FirstC: AppParCurves_Constraint, LastC: AppParCurves_Constraint): void;

// Changes the max number of segments, which is allowed for cutting
SetMaxSegments(theMaxSegments: number): void;

// Set inverse order of degree selection
SetInvOrder(theInvOrder: boolean): void;

// Set value of hang checking flag if this flag = true, possible hang of algorithm is checked and algorithm is forced to stop
SetHangChecking(theHangChecking: boolean): void;

// returns False if at a moment of the approximation, the status NoApproximation has been sent by the user when more points were needed
IsAllApproximated(): boolean;

// returns False if the status NoPointsAdded has been sent
IsToleranceReached(): boolean;

// returns the tolerances 2d and 3d of the <Index> MultiCurve
Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

// Returns the number of MultiCurve doing the approximation of the MultiLine
NbMultiCurves(): number;

// returns the approximation MultiCurve of range <Index>
Value(Index?: number): AppParCurves_MultiCurve;

Parameters(Index: number, firstp?: number, lastp?: number): { firstp: number; lastp: number };

// Releases the C++ object
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

// return the composite MultiCurves as a MultiBSpCurve
Value(): AppParCurves_MultiBSpCurve;

// return the composite MultiCurves as a MultiBSpCurve
ChangeValue(): AppParCurves_MultiBSpCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Approx_ParametrizationType: typeof Approx_ParametrizationType[keyof typeof Approx_ParametrizationType]

// Approximation of a PCurve on a surface to make its parameter be the same that the parameter of a given 3d reference curve
Approx_SameParameter: declare class Approx_SameParameter

constructor

IsDone(): boolean;

TolReached(): number;

// Tells whether the original data had already the same parameter up to the tolerance
IsSameParameter(): boolean;

// Returns the 2D curve that has the same parameter as the 3D curve once evaluated on the surface up to the specified tolerance
Curve2d(): Geom2d_Curve;

// Returns the 3D curve that has the same parameter as the 3D curve once evaluated on the surface up to the specified tolerance
Curve3d(): Adaptor3d_Curve;

// Returns the 3D curve on surface that has the same parameter as the 3D curve up to the specified tolerance
CurveOnSurface(): Adaptor3d_CurveOnSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It is an auxiliary flag being used in inner computations
Approx_Status: typeof Approx_Status[keyof typeof Approx_Status]

// Approximation of an Surface S(u,v) (and eventually associate 2d Curves) defined by section's law
Approx_SweepApproximation: declare class Approx_SweepApproximation

constructor

// Perform the Approximation [First, Last]
Perform(First: number, Last: number, Tol3d: number, BoundTol: number, Tol2d: number, TolAngular: number, Continuity?: GeomAbs_Shape, Degmax?: number, Segmax?: number): void;

// The EvaluatorFunction from AdvApprox;
Eval(Parameter: number, DerivativeRequest: number, First: number, Last: number, Result?: number): { returnValue: number; Result: number };

// returns if we have an result
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

// returns the maximum error in the surface approximation
MaxErrorOnSurf(): number;

// returns the average error in the surface approximation
AverageErrorOnSurf(): number;

NbCurves2d(): number;

Curves2dShape(Degree?: number, NbPoles?: number, NbKnots?: number): { Degree: number; NbPoles: number; NbKnots: number };

Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

Curves2dDegree(): number;

Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

Curves2dKnots(): NCollection_Array1_double;

Curves2dMults(): NCollection_Array1_int;

// returns the maximum error of the <Index> 2d curve approximation
Max2dError(Index: number): number;

// returns the average error of the <Index> 2d curve approximation
Average2dError(Index: number): number;

// returns the maximum 3d error of the <Index> 2d curve approximation on the Surface
TolCurveOnSurf(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defined the function used by SweepApproximation to perform sweeping application
Approx_SweepFunction: declare class Approx_SweepFunction extends Standard_Transient

// compute the section for v = param
D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// Poles2d: Mutated in place
// Weigths: Mutated in place

// compute the first derivative in v direction of the section for v = param Warning
D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place

// compute the second derivative in v direction of the section for v = param Warning
D2(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, D2Poles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, D2Poles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double, D2Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// D2Poles: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// D2Poles2d: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place
// D2Weigths: Mutated in place

// get the number of 2d curves to approximate
Nb2dCurves(): number;

// get the format of an section
SectionShape(NbPoles: number, NbKnots: number, Degree: number): { NbPoles: number; NbKnots: number; Degree: number };

// get the Knots of the section
Knots(TKnots: NCollection_Array1_double): void;
// TKnots: Mutated in place

// get the Multplicities of the section
Mults(TMults: NCollection_Array1_int): void;
// TMults: Mutated in place

// Returns if the sections are rational or not
IsRational(): boolean;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Sets the bounds of the parametric interval on the function This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Returns the resolutions in the sub-space 2d <Index> This information is useful to find a good tolerance in 2d approximation
Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Returns the tolerance to reach in approximation to satisfy
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;
// Tol3d: Mutated in place

// Is useful, if (me) have to run numerical algorithm to perform D0, D1 or D2
SetTolerance(Tol3d: number, Tol2d: number): void;

// Get the barycentre of Surface
BarycentreOfSurf(): gp_Pnt;

// Returns the length of the greater section
MaximalSection(): number;

// Compute the minimal value of weight for each poles in all sections
GetMinimalWeight(Weigths: NCollection_Array1_double): void;
// Weigths: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
