# libcascade — BRepBlend

13 top-level symbols. Signatures are verbatim typescript.

// Function to approximate by AppSurface for Surface/Surface contact
BRepBlend_AppFunc: declare class BRepBlend_AppFunc extends BRepBlend_AppFuncRoot

constructor

Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function to approximate by AppSurface
BRepBlend_AppFuncRoot: declare class BRepBlend_AppFuncRoot extends Approx_SweepFunction

// compute the section for v = param
D0(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, Poles2d: NCollection_Array1_gp_Pnt2d, Weigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// Poles2d: Mutated in place
// Weigths: Mutated in place

// compute the first derivative in v direction of the section for v = param
D1(Param: number, First: number, Last: number, Poles: NCollection_Array1_gp_Pnt, DPoles: NCollection_Array1_gp_Vec, Poles2d: NCollection_Array1_gp_Pnt2d, DPoles2d: NCollection_Array1_gp_Vec2d, Weigths: NCollection_Array1_double, DWeigths: NCollection_Array1_double): boolean;
// Poles: Mutated in place
// DPoles: Mutated in place
// Poles2d: Mutated in place
// DPoles2d: Mutated in place
// Weigths: Mutated in place
// DWeigths: Mutated in place

// compute the second derivative in v direction of the section for v = param
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

// Returns if the section is rational or not
IsRational(): boolean;

// Returns the number of intervals for continuity
NbIntervals(S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

// Sets the bounds of the parametric interval on the fonction This determines the derivatives in these values if the function is not Cn
SetInterval(First: number, Last: number): void;

// Returns the resolutions in the sub-space 2d <Index> - This information is useful to find a good tolerance in 2d approximation
Resolution(Index: number, Tol: number, TolU: number, TolV: number): { TolU: number; TolV: number };

// Returns the tolerance to reach in approximation to respect BoundTol error at the Boundary AngleTol tangent error at the Boundary (in radian) SurfTol error inside the surface
GetTolerance(BoundTol: number, SurfTol: number, AngleTol: number, Tol3d: NCollection_Array1_double): void;
// Tol3d: Mutated in place

// Is useful, if (me) has to be run numerical algorithm to perform D0, D1 or D2
SetTolerance(Tol3d: number, Tol2d: number): void;

// Get the barycentre of Surface
BarycentreOfSurf(): gp_Pnt;

// Returns the length of the maximum section
MaximalSection(): number;

// Compute the minimal value of weight for each poles of all sections
GetMinimalWeight(Weigths: NCollection_Array1_double): void;
// Weigths: Mutated in place

Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function to approximate by AppSurface for Curve/Surface contact
BRepBlend_AppFuncRst: declare class BRepBlend_AppFuncRst extends BRepBlend_AppFuncRoot

constructor

Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function to approximate by AppSurface for Edge/Face (Curve/Curve contact)
BRepBlend_AppFuncRstRst: declare class BRepBlend_AppFuncRstRst extends BRepBlend_AppFuncRoot

constructor

Point(Func: Blend_AppFunction, Param: number, Sol: math_VectorBase_double, Pnt: Blend_Point): void;

Vec(Sol: math_VectorBase_double, Pnt: Blend_Point): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepBlend_AppSurf: declare class BRepBlend_AppSurf extends AppBlend_Approx

constructor

Init(Degmin: number, Degmax: number, Tol3d: number, Tol2d: number, NbIt: number, KnownParameters?: boolean): void;

// Define the type of parametrization used in the approximation
SetParType(ParType: Approx_ParametrizationType): void;

// Define the Continuity used in the approximation
SetContinuity(C: GeomAbs_Shape): void;

// define the Weights associed to the criterium used in the optimization
SetCriteriumWeight(W1: number, W2: number, W3: number): void;

// returns the type of parametrization used in the approximation
ParType(): Approx_ParametrizationType;

// returns the Continuity used in the approximation
Continuity(): GeomAbs_Shape;

// returns the Weights (as percent) associed to the criterium used in the optimization
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Used to Approximate the blending surfaces
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

// returns the maximum error in the surface approximation
MaxErrorOnSurf(): number;

NbCurves2d(): number;

Curves2dShape(Degree: number, NbPoles: number, NbKnots: number): { Degree: number; NbPoles: number; NbKnots: number };

Curve2d(Index: number, TPoles: NCollection_Array1_gp_Pnt2d, TKnots: NCollection_Array1_double, TMults: NCollection_Array1_int): void;

Curves2dDegree(): number;

Curve2dPoles(Index: number): NCollection_Array1_gp_Pnt2d;

Curves2dKnots(): NCollection_Array1_double;

Curves2dMults(): NCollection_Array1_int;

TolReached(Tol3d: number, Tol2d: number): { Tol3d: number; Tol2d: number };

// returns the maximum error in the <Index> 2d curve approximation
Max2dError(Index: number): number;

TolCurveOnSurf(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepBlend_BlendTool: declare class BRepBlend_BlendTool

constructor

// Projects the point P on the arc C
static Project(P: gp_Pnt2d, S: Adaptor3d_Surface, C: Adaptor2d_Curve2d, Paramproj?: number, Dist?: number): { returnValue: boolean; Paramproj: number; Dist: number };

static Inters(P1: gp_Pnt2d, P2: gp_Pnt2d, S: Adaptor3d_Surface, C: Adaptor2d_Curve2d, Param?: number, Dist?: number): { returnValue: boolean; Param: number; Dist: number };

// Returns the parameter of the vertex V on the edge A
static Parameter(V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d): number;

// Returns the parametric tolerance on the arc A used to consider that the vertex and another point meet, i-e if std::abs(Parameter(Vertex)-Parameter(OtherPnt))<= Tolerance, the points are "merged"
static Tolerance(V: Adaptor3d_HVertex, A: Adaptor2d_Curve2d): number;

static SingularOnUMin(S: Adaptor3d_Surface): boolean;

static SingularOnUMax(S: Adaptor3d_Surface): boolean;

static SingularOnVMin(S: Adaptor3d_Surface): boolean;

static SingularOnVMax(S: Adaptor3d_Surface): boolean;

static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

// Returns the parametric limits on the arc C
static Bounds(C: Adaptor2d_Curve2d, Ufirst?: number, Ulast?: number): { Ufirst: number; Ulast: number };

static CurveOnSurf(C: Adaptor2d_Curve2d, S: Adaptor3d_Surface): Adaptor2d_Curve2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepBlend_CSWalking: declare class BRepBlend_CSWalking

constructor

Perform(F: Blend_CSFunction, Pdep: number, Pmax: number, MaxStep: number, Tol3d: number, TolGuide: number, Soldep: math_VectorBase_double, Fleche: number, Appro?: boolean): void;

Complete(F: Blend_CSFunction, Pmin: number): boolean;

IsDone(): boolean;

Line(): BRepBlend_Line;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function of reframing between a point and a curve
BRepBlend_CurvPointRadInv: declare class BRepBlend_CurvPointRadInv extends Blend_CurvPointFuncInv

constructor

// Set the Point on which a solution has to be found
Set(Choix: number): void;
Set(P: gp_Pnt): void;
Set(Choix: number): void;
Set(P: gp_Pnt): void;

// returns 2
NbEquations(): number;

// computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Returns in the vector Tolerance the parametric tolerance for each of the 3 variables
GetTolerance(Tolerance: math_VectorBase_double, Tol: number): void;

// Returns in the vector InfBound the lowest values allowed for each of the 3 variables
GetBounds(InfBound: math_VectorBase_double, SupBound: math_VectorBase_double): void;

// Returns true if Sol is a zero of the function
IsSolution(Sol: math_VectorBase_double, Tol: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepBlend_Extremity: declare class BRepBlend_Extremity

constructor

// Set the values for an extremity on a surface
SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number): void;
SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number, Vtx: Adaptor3d_HVertex): void;
SetValue(P: gp_Pnt, W: number, Param: number, Tol: number): void;
SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number): void;
SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number, Vtx: Adaptor3d_HVertex): void;
SetValue(P: gp_Pnt, W: number, Param: number, Tol: number): void;
SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number): void;
SetValue(P: gp_Pnt, U: number, V: number, Param: number, Tol: number, Vtx: Adaptor3d_HVertex): void;
SetValue(P: gp_Pnt, W: number, Param: number, Tol: number): void;

// This method returns the value of the point in 3d space
Value(): gp_Pnt;

// Set the tangent vector for an extremity on a surface
SetTangent(Tangent: gp_Vec): void;

// Returns TRUE if the Tangent is stored
HasTangent(): boolean;

// This method returns the value of tangent in 3d space
Tangent(): gp_Vec;

// This method returns the fuzziness on the point in 3d space
Tolerance(): number;

// Set the values for an extremity on a curve
SetVertex(V: Adaptor3d_HVertex): void;

// Sets the values of a point which is on the arc A, at parameter Param
AddArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

// This method returns the parameters of the point on the concerned surface
Parameters(U?: number, V?: number): { U: number; V: number };

// Returns true when the point coincide with an existing vertex
IsVertex(): boolean;

// Returns the vertex when IsVertex returns true
Vertex(): Adaptor3d_HVertex;

// Returns the number of arc containing the extremity
NbPointOnRst(): number;

PointOnRst(Index: number): BRepBlend_PointOnRst;

Parameter(): number;

ParameterOnGuide(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepBlend_HCurve2dTool: declare class BRepBlend_HCurve2dTool

constructor

static FirstParameter(C: Adaptor2d_Curve2d): number;

static LastParameter(C: Adaptor2d_Curve2d): number;

static Continuity(C: Adaptor2d_Curve2d): GeomAbs_Shape;

// Returns the number of intervals for continuity
static NbIntervals(C: Adaptor2d_Curve2d, S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
static Intervals(C: Adaptor2d_Curve2d, T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

static IsClosed(C: Adaptor2d_Curve2d): boolean;

static IsPeriodic(C: Adaptor2d_Curve2d): boolean;

static Period(C: Adaptor2d_Curve2d): number;

// Computes the point of parameter U on the curve
static Value(C: Adaptor2d_Curve2d, U: number): gp_Pnt2d;

// Computes the point of parameter U on the curve
static D0(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d): void;
// P: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
static D1(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V: gp_Vec2d): void;
// P: Mutated in place
// V: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
static D2(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
static D3(C: Adaptor2d_Curve2d, U: number, P: gp_Pnt2d, V1: gp_Vec2d, V2: gp_Vec2d, V3: gp_Vec2d): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
static DN(C: Adaptor2d_Curve2d, U: number, N: number): gp_Vec2d;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
static Resolution(C: Adaptor2d_Curve2d, R3d: number): number;

// Returns the type of the curve in the current interval
static GetType(C: Adaptor2d_Curve2d): GeomAbs_CurveType;

static Line(C: Adaptor2d_Curve2d): gp_Lin2d;

static Circle(C: Adaptor2d_Curve2d): gp_Circ2d;

static Ellipse(C: Adaptor2d_Curve2d): gp_Elips2d;

static Hyperbola(C: Adaptor2d_Curve2d): gp_Hypr2d;

static Parabola(C: Adaptor2d_Curve2d): gp_Parab2d;

static Bezier(C: Adaptor2d_Curve2d): Geom2d_BezierCurve;

static BSpline(C: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

static NbSamples(C: Adaptor2d_Curve2d, U0: number, U1: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepBlend_HCurveTool: declare class BRepBlend_HCurveTool

constructor

static FirstParameter(C: Adaptor3d_Curve): number;

static LastParameter(C: Adaptor3d_Curve): number;

static Continuity(C: Adaptor3d_Curve): GeomAbs_Shape;

// Returns the number of intervals for continuity
static NbIntervals(C: Adaptor3d_Curve, S: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
static Intervals(C: Adaptor3d_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;
// T: Mutated in place

static IsClosed(C: Adaptor3d_Curve): boolean;

static IsPeriodic(C: Adaptor3d_Curve): boolean;

static Period(C: Adaptor3d_Curve): number;

// Computes the point of parameter U on the curve
static Value(C: Adaptor3d_Curve, U: number): gp_Pnt;

// Computes the point of parameter U on the curve
static D0(C: Adaptor3d_Curve, U: number, P: gp_Pnt): void;
// P: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
static D1(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V: gp_Vec): void;
// P: Mutated in place
// V: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
static D2(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
static D3(C: Adaptor3d_Curve, U: number, P: gp_Pnt, V1: gp_Vec, V2: gp_Vec, V3: gp_Vec): void;
// P: Mutated in place
// V1: Mutated in place
// V2: Mutated in place
// V3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
static DN(C: Adaptor3d_Curve, U: number, N: number): gp_Vec;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
static Resolution(C: Adaptor3d_Curve, R3d: number): number;

// Returns the type of the curve in the current interval
static GetType(C: Adaptor3d_Curve): GeomAbs_CurveType;

static Line(C: Adaptor3d_Curve): gp_Lin;

static Circle(C: Adaptor3d_Curve): gp_Circ;

static Ellipse(C: Adaptor3d_Curve): gp_Elips;

static Hyperbola(C: Adaptor3d_Curve): gp_Hypr;

static Parabola(C: Adaptor3d_Curve): gp_Parab;

static Bezier(C: Adaptor3d_Curve): Geom_BezierCurve;

static BSpline(C: Adaptor3d_Curve): Geom_BSplineCurve;

static NbSamples(C: Adaptor3d_Curve, U0: number, U1: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepBlend_Line: declare class BRepBlend_Line extends Standard_Transient

constructor

// Clears the content of the line
Clear(): void;

// Adds a point in the line
Append(P: Blend_Point): void;

// Adds a point in the line at the first place
Prepend(P: Blend_Point): void;

// Adds a point in the line at the first place
InsertBefore(Index: number, P: Blend_Point): void;

// Removes from <me> all the items of positions between <FromIndex> and <ToIndex>
Remove(FromIndex: number, ToIndex: number): void;

// Sets the value of the transition of the line on S1 and the line on S2
Set(TranS1: IntSurf_TypeTrans, TranS2: IntSurf_TypeTrans): void;
Set(Trans: IntSurf_TypeTrans): void;
Set(TranS1: IntSurf_TypeTrans, TranS2: IntSurf_TypeTrans): void;
Set(Trans: IntSurf_TypeTrans): void;

// Sets the values of the start points for the line
SetStartPoints(StartPt1: BRepBlend_Extremity, StartPt2: BRepBlend_Extremity): void;

// Sets tne values of the end points for the line
SetEndPoints(EndPt1: BRepBlend_Extremity, EndPt2: BRepBlend_Extremity): void;

// Returns the number of points in the line
NbPoints(): number;

// Returns the point of range Index
Point(Index: number): Blend_Point;

// Returns the type of the transition of the line defined on the first surface
TransitionOnS1(): IntSurf_TypeTrans;

// Returns the type of the transition of the line defined on the second surface
TransitionOnS2(): IntSurf_TypeTrans;

// Returns the start point on S1
StartPointOnFirst(): BRepBlend_Extremity;

// Returns the start point on S2
StartPointOnSecond(): BRepBlend_Extremity;

// Returns the end point on S1
EndPointOnFirst(): BRepBlend_Extremity;

// Returns the point on S2
EndPointOnSecond(): BRepBlend_Extremity;

// Returns the type of the transition of the line defined on the surface
TransitionOnS(): IntSurf_TypeTrans;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
