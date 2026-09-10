# libcascade — Contap

12 top-level symbols. Signatures are verbatim typescript.

Contap_ArcFunction: declare class Contap_ArcFunction extends math_FunctionWithDerivative

constructor

Set(S: Adaptor3d_Surface): void;
Set(Direction: gp_Dir): void;
Set(Eye: gp_Pnt): void;
Set(A: Adaptor2d_Curve2d): void;
Set(Direction: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Direction: gp_Dir): void;
Set(Eye: gp_Pnt): void;
Set(A: Adaptor2d_Curve2d): void;
Set(Direction: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Direction: gp_Dir): void;
Set(Eye: gp_Pnt): void;
Set(A: Adaptor2d_Curve2d): void;
Set(Direction: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Direction: gp_Dir): void;
Set(Eye: gp_Pnt): void;
Set(A: Adaptor2d_Curve2d): void;
Set(Direction: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Direction: gp_Dir): void;
Set(Eye: gp_Pnt): void;
Set(A: Adaptor2d_Curve2d): void;
Set(Direction: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Direction: gp_Dir): void;
Set(Eye: gp_Pnt): void;
Set(A: Adaptor2d_Curve2d): void;
Set(Direction: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;

// Computes the value <F>of the function for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value <F> and the derivative <D> of the function for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

NbSamples(): number;

// returns the state of the function corresponding to the latest call of any methods associated with the function
GetStateNumber(): number;

Valpoint(Index: number): gp_Pnt;

Quadric(): IntSurf_Quadric;

// Returns mySurf field
Surface(): Adaptor3d_Surface;

// Returns the point, which has been computed while the last calling `Value()` method
LastComputedPoint(): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides the computation of the contours for quadric surfaces
Contap_ContAna: declare class Contap_ContAna

constructor

Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;
Perform(S: gp_Sphere, D: gp_Dir): void;
Perform(S: gp_Sphere, Eye: gp_Pnt): void;
Perform(C: gp_Cylinder, D: gp_Dir): void;
Perform(C: gp_Cylinder, Eye: gp_Pnt): void;
Perform(C: gp_Cone, D: gp_Dir): void;
Perform(C: gp_Cone, Eye: gp_Pnt): void;
Perform(S: gp_Sphere, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cylinder, D: gp_Dir, Ang: number): void;
Perform(C: gp_Cone, D: gp_Dir, Ang: number): void;

IsDone(): boolean;

NbContours(): number;

// Returns GeomAbs_Line or GeomAbs_Circle, when `IsDone()` returns True
TypeContour(): GeomAbs_CurveType;

Circle(): gp_Circ;

Line(Index: number): gp_Lin;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Contap_Contour: declare class Contap_Contour

constructor

// Creates the contour in a given direction
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Eye: gp_Pnt): void;
Perform(Surf: Adaptor3d_Surface, Domain: Adaptor3d_TopolTool, Direction: gp_Vec, Angle: number): void;

Init(Direction: gp_Vec): void;
Init(Eye: gp_Pnt): void;
Init(Direction: gp_Vec, Angle: number): void;
Init(Direction: gp_Vec): void;
Init(Eye: gp_Pnt): void;
Init(Direction: gp_Vec, Angle: number): void;
Init(Direction: gp_Vec): void;
Init(Eye: gp_Pnt): void;
Init(Direction: gp_Vec, Angle: number): void;

IsDone(): boolean;

// Returns true if the is no line
IsEmpty(): boolean;

NbLines(): number;

Line(Index: number): Contap_Line;

// Returns a reference on the internal SurfaceFunction
SurfaceFunction(): Contap_SurfFunction;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool for the intersection between 2 surfaces
Contap_HContTool: declare class Contap_HContTool

constructor

static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

static NbSamplePoints(S: Adaptor3d_Surface): number;

static SamplePoint(S: Adaptor3d_Surface, Index: number, U?: number, V?: number): { U: number; V: number };

// Returns True if all the intersection point and edges are known on the Arc
static HasBeenSeen(C: Adaptor2d_Curve2d): boolean;

// returns the number of points which is used to make a sample on the arc
static NbSamplesOnArc(A: Adaptor2d_Curve2d): number;

// Returns the parametric limits on the arc C
static Bounds(C: Adaptor2d_Curve2d, Ufirst?: number, Ulast?: number): { Ufirst: number; Ulast: number };

// Projects the point P on the arc C
static Project(C: Adaptor2d_Curve2d, P: gp_Pnt2d, Paramproj: number, Ptproj: gp_Pnt2d): { returnValue: boolean; Paramproj: number };
// Ptproj: Mutated in place

// Returns the parametric tolerance used to consider that the vertex and another point meet, i-e if std::abs(parameter(Vertex) - parameter(OtherPnt))<= Tolerance, the points are "merged"
static Tolerance(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

// Returns the parameter of the vertex V on the arc A
static Parameter(V: Adaptor3d_HVertex, C: Adaptor2d_Curve2d): number;

// Returns the number of intersection points on the arc A
static NbPoints(C: Adaptor2d_Curve2d): number;

// Returns the value (Pt), the tolerance (Tol), and the parameter (U) on the arc A , of the intersection point of range Index
static Value(C: Adaptor2d_Curve2d, Index: number, Pt: gp_Pnt, Tol?: number, U?: number): { Tol: number; U: number };
// Pt: Mutated in place

// Returns True if the intersection point of range Index corresponds with a vertex on the arc A
static IsVertex(C: Adaptor2d_Curve2d, Index: number): boolean;

// When IsVertex returns True, this method returns the vertex on the arc A
static Vertex(C: Adaptor2d_Curve2d, Index: number): { V: Adaptor3d_HVertex; [Symbol.dispose](): void };

// returns the number of part of A solution of the of intersection problem
static NbSegments(C: Adaptor2d_Curve2d): number;

// Returns True when the segment of range Index is not open at the left side
static HasFirstPoint(C: Adaptor2d_Curve2d, Index: number, IndFirst?: number): { returnValue: boolean; IndFirst: number };

// Returns True when the segment of range Index is not open at the right side
static HasLastPoint(C: Adaptor2d_Curve2d, Index: number, IndLast?: number): { returnValue: boolean; IndLast: number };

// Returns True when the whole restriction is solution of the intersection problem
static IsAllSolution(C: Adaptor2d_Curve2d): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Contap_HCurve2dTool: declare class Contap_HCurve2dTool

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

Contap_IType: typeof Contap_IType[keyof typeof Contap_IType]

Contap_Line: declare class Contap_Line

constructor

SetLineOn2S(L: IntSurf_LineOn2S): void;

Clear(): void;

LineOn2S(): IntSurf_LineOn2S;

ResetSeqOfVertex(): void;

Add(P: IntSurf_PntOn2S): void;
Add(P: Contap_Point): void;
Add(P: IntSurf_PntOn2S): void;
Add(P: Contap_Point): void;

SetValue(L: gp_Lin): void;
SetValue(C: gp_Circ): void;
SetValue(A: Adaptor2d_Curve2d): void;
SetValue(L: gp_Lin): void;
SetValue(C: gp_Circ): void;
SetValue(A: Adaptor2d_Curve2d): void;
SetValue(L: gp_Lin): void;
SetValue(C: gp_Circ): void;
SetValue(A: Adaptor2d_Curve2d): void;

NbVertex(): number;

Vertex(Index: number): Contap_Point;

// Returns Contap_Lin for a line, Contap_Circle for a circle, and Contap_Walking for a Walking line, Contap_Restriction for a part of boundary
TypeContour(): Contap_IType;

NbPnts(): number;

Point(Index: number): IntSurf_PntOn2S;

Line(): gp_Lin;

Circle(): gp_Circ;

Arc(): Adaptor2d_Curve2d;

// Set The Transition of the line
SetTransitionOnS(T: IntSurf_TypeTrans): void;

// returns IN if at the "left" of the line, the normale of the surface is oriented to the observator
TransitionOnS(): IntSurf_TypeTrans;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of a vertex on the contour line
Contap_Point: declare class Contap_Point

constructor

// Sets the values for a point
SetValue(Pt: gp_Pnt, U: number, V: number): void;

// Set the value of the parameter on the intersection line
SetParameter(Para: number): void;

// Sets the values of a point which is a vertex on the initial facet of restriction of one of the surface
SetVertex(V: Adaptor3d_HVertex): void;

// Sets the value of the arc and of the parameter on this arc of the point
SetArc(A: Adaptor2d_Curve2d, Param: number, TLine: IntSurf_Transition, TArc: IntSurf_Transition): void;

SetMultiple(): void;

SetInternal(): void;

// Returns the intersection point (geometric information)
Value(): gp_Pnt;

// This method returns the parameter of the point on the intersection line
ParameterOnLine(): number;

// Returns the parameters on the surface of the point
Parameters(U1?: number, V1?: number): { U1: number; V1: number };

// Returns True when the point is an intersection between the contour and a restriction
IsOnArc(): boolean;

// Returns the arc of restriction containing the vertex
Arc(): Adaptor2d_Curve2d;

// Returns the parameter of the point on the arc returned by the method `Arc()`
ParameterOnArc(): number;

// Returns the transition of the point on the contour
TransitionOnLine(): IntSurf_Transition;

// Returns the transition of the point on the arc
TransitionOnArc(): IntSurf_Transition;

// Returns TRUE if the point is a vertex on the initial restriction facet of the surface
IsVertex(): boolean;

// Returns the information about the point when it is on the domain of the patch, i-e when the function IsVertex returns True
Vertex(): Adaptor3d_HVertex;

// Returns True if the point belongs to several lines
IsMultiple(): boolean;

// Returns True if the point is an internal one, i.e if the tangent to the line on the point and the eye direction are parallel
IsInternal(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes the function on a parametric surface
Contap_SurfFunction: declare class Contap_SurfFunction extends math_FunctionSetWithDerivatives

constructor

Set(S: Adaptor3d_Surface): void;
Set(Eye: gp_Pnt): void;
Set(Dir: gp_Dir): void;
Set(Tolerance: number): void;
Set(Dir: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Eye: gp_Pnt): void;
Set(Dir: gp_Dir): void;
Set(Tolerance: number): void;
Set(Dir: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Eye: gp_Pnt): void;
Set(Dir: gp_Dir): void;
Set(Tolerance: number): void;
Set(Dir: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Eye: gp_Pnt): void;
Set(Dir: gp_Dir): void;
Set(Tolerance: number): void;
Set(Dir: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Eye: gp_Pnt): void;
Set(Dir: gp_Dir): void;
Set(Tolerance: number): void;
Set(Dir: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;
Set(S: Adaptor3d_Surface): void;
Set(Eye: gp_Pnt): void;
Set(Dir: gp_Dir): void;
Set(Tolerance: number): void;
Set(Dir: gp_Dir, Angle: number): void;
Set(Eye: gp_Pnt, Angle: number): void;

// This method has to return 2
NbVariables(): number;

// This method has to return 1
NbEquations(): number;

// The dimension of F is 1
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// The dimension of D is (1,2)
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Root is the value of the function at the solution
Root(): number;

// Returns the value Tol so that if std::abs(Func.Root())<Tol the function is considered null
Tolerance(): number;

// Returns the value of the solution point on the surface
Point(): gp_Pnt;

IsTangent(): boolean;

Direction3d(): gp_Vec;

Direction2d(): gp_Dir2d;

FunctionType(): Contap_TFunction;

Eye(): gp_Pnt;

Direction(): gp_Dir;

Angle(): number;

Surface(): Adaptor3d_Surface;

// Method is entered for compatibility with {@link IntPatch_TheSurfFunction `IntPatch_TheSurfFunction`}
PSurface(): Adaptor3d_Surface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Internal tool used to compute the normal and its derivatives
Contap_SurfProps: declare class Contap_SurfProps

constructor

// Computes the point
static Normale(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, N: gp_Vec): void;
// P: Mutated in place
// N: Mutated in place

// Computes the point
static DerivAndNorm(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, d1u: gp_Vec, d1v: gp_Vec, N: gp_Vec): void;
// P: Mutated in place
// d1u: Mutated in place
// d1v: Mutated in place
// N: Mutated in place

// Computes the point
static NormAndDn(S: Adaptor3d_Surface, U: number, V: number, P: gp_Pnt, N: gp_Vec, Dnu: gp_Vec, Dnv: gp_Vec): void;
// P: Mutated in place
// N: Mutated in place
// Dnu: Mutated in place
// Dnv: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Contap_TFunction: typeof Contap_TFunction[keyof typeof Contap_TFunction]

Contap_TheIWLineOfTheIWalking: declare class Contap_TheIWLineOfTheIWalking extends Standard_Transient

constructor

// reverse the points in the line
Reverse(): void;

// Cut the line at the point of rank Index
Cut(Index: number): void;

// Add a point in the line
AddPoint(P: IntSurf_PntOn2S): void;

AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;
AddStatusFirst(Closed: boolean, HasFirst: boolean): void;
AddStatusFirst(Closed: boolean, HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

AddStatusFirstLast(Closed: boolean, HasFirst: boolean, HasLast: boolean): void;

AddStatusLast(HasLast: boolean): void;
AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;
AddStatusLast(HasLast: boolean): void;
AddStatusLast(HasLast: boolean, Index: number, P: IntSurf_PathPoint): void;

// associate the index of the point on the line with the index of the point passing through the starting iterator
AddIndexPassing(Index: number): void;

SetTangentVector(V: gp_Vec, Index: number): void;

SetTangencyAtBegining(IsTangent: boolean): void;

SetTangencyAtEnd(IsTangent: boolean): void;

// Returns the number of points of the line (including first point and end point
NbPoints(): number;

// Returns the point of range Index
Value(Index: number): IntSurf_PntOn2S;

// Returns the LineOn2S contained in the walking line
Line(): IntSurf_LineOn2S;

// Returns True if the line is closed
IsClosed(): boolean;

// Returns True if the first point of the line is a marching point
HasFirstPoint(): boolean;

// Returns True if the end point of the line is a marching point (Point from IntWS)
HasLastPoint(): boolean;

// Returns the first point of the line when it is a marching point
FirstPoint(): IntSurf_PathPoint;

// Returns the Index of first point of the line when it is a marching point
FirstPointIndex(): number;

// Returns the last point of the line when it is a marching point
LastPoint(): IntSurf_PathPoint;

// Returns the index of last point of the line when it is a marching point
LastPointIndex(): number;

// returns the number of points belonging to Pnts1 which are passing point
NbPassingPoint(): number;

// returns the index of the point belonging to the line which is associated to the passing point belonging to Pnts1 an exception is raised if Index > `NbPassingPoint()`
PassingPoint(Index: number, IndexLine?: number, IndexPnts?: number): { IndexLine: number; IndexPnts: number };

TangentVector(Index?: number): { returnValue: gp_Vec; Index: number; [Symbol.dispose](): void };

IsTangentAtBegining(): boolean;

IsTangentAtEnd(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
