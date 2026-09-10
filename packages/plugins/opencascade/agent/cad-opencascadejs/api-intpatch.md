# libcascade — IntPatch

15 top-level symbols. Signatures are verbatim typescript.

// Implementation of an intersection line described by a parametrized curve
IntPatch_ALine: declare class IntPatch_ALine extends IntPatch_Line

constructor

// To add a vertex in the list
AddVertex(Pnt: IntPatch_Point): void;

// Replaces the element of range Index in the list of points
Replace(Index: number, Pnt: IntPatch_Point): void;

SetFirstPoint(IndFirst: number): void;

SetLastPoint(IndLast: number): void;

// Returns the first parameter on the intersection line
FirstParameter(IsIncluded?: boolean): { returnValue: number; IsIncluded: boolean };

// Returns the last parameter on the intersection line
LastParameter(IsIncluded?: boolean): { returnValue: number; IsIncluded: boolean };

// Returns the point of parameter U on the analytic intersection line
Value(U: number): gp_Pnt;

// Returns true when the derivative at parameter U is defined on the analytic intersection line
D1(U: number, P: gp_Pnt, Du: gp_Vec): boolean;
// P: Mutated in place
// Du: Mutated in place

// Tries to find the parameters of the point P on the curve
FindParameter(P: gp_Pnt, theParams: NCollection_List_double): void;
// theParams: Mutated in place

// Returns True if the line has a known First point
HasFirstPoint(): boolean;

// Returns True if the line has a known Last point
HasLastPoint(): boolean;

// Returns the IntPoint corresponding to the FirstPoint
FirstPoint(): IntPatch_Point;

// Returns the IntPoint corresponding to the LastPoint
LastPoint(): IntPatch_Point;

NbVertex(): number;

// Returns the vertex of range Index on the line
Vertex(Index: number): IntPatch_Point;

// Allows modifying the vertex with index theIndex on the line
ChangeVertex(theIndex: number): IntPatch_Point;

// Set the parameters of all the vertex on the line
ComputeVertexParameters(Tol: number): void;

Curve(): IntAna_Curve;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_ALineToWLine: declare class IntPatch_ALineToWLine

constructor

SetTolOpenDomain(aT: number): void;

TolOpenDomain(): number;

SetTolTransition(aT: number): void;

TolTransition(): number;

SetTol3D(aT: number): void;

Tol3D(): number;

// Converts aline to the set of Walking-lines and adds them in theLines
MakeWLine(aline: IntPatch_ALine, theLines: NCollection_Sequence_handle_IntPatch_Line): void;
MakeWLine(aline: IntPatch_ALine, paraminf: number, paramsup: number, theLines: NCollection_Sequence_handle_IntPatch_Line): void;
MakeWLine(aline: IntPatch_ALine, theLines: NCollection_Sequence_handle_IntPatch_Line): void;
MakeWLine(aline: IntPatch_ALine, paraminf: number, paramsup: number, theLines: NCollection_Sequence_handle_IntPatch_Line): void;
// theLines: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_ArcFunction: declare class IntPatch_ArcFunction extends math_FunctionWithDerivative

constructor

SetQuadric(Q: IntSurf_Quadric): void;

Set(A: Adaptor2d_Curve2d): void;
Set(S: Adaptor3d_Surface): void;
Set(A: Adaptor2d_Curve2d): void;
Set(S: Adaptor3d_Surface): void;

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

Arc(): Adaptor2d_Curve2d;

Surface(): Adaptor3d_Surface;

// Returns the point, which has been computed while the last calling `Value()` method
LastComputedPoint(): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Performs `BVH` tree traversal of two polyhedra to find candidate triangle pairs for intersection testing
IntPatch_BVHTraversal: declare class IntPatch_BVHTraversal

constructor

// Performs `BVH` traversal and collects candidate triangle pairs
Perform(theSet1: IntPatch_PolyhedronBVH, theSet2: IntPatch_PolyhedronBVH, theSelfInterference: boolean): number;
// theSet1: `BVH` set for the first polyhedron Mutated in place
// theSet2: `BVH` set for the second polyhedron Mutated in place
// theSelfInterference: if true, skip pairs where first index >= second index (used for self-intersection where we don't want to test same pair twice)

// Returns the collected triangle pairs
Pairs(): any;

// Clears the collected pairs
Clear(): void;

Accept(theIndex1: number, theIndex2: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_BVHTraversal_TrianglePair: interface IntPatch_BVHTraversal_TrianglePair

First: number

Second: number

constructor

First: number

Second: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this function is associated to the intersection between a curve on surface and a surface
IntPatch_CSFunction: declare class IntPatch_CSFunction extends math_FunctionSetWithDerivatives

constructor

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

Point(): gp_Pnt;

Root(): number;

AuxillarSurface(): Adaptor3d_Surface;

AuxillarCurve(): Adaptor2d_Curve2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_CurvIntSurf: declare class IntPatch_CurvIntSurf

constructor

// compute the solution it's possible to write to optimize
Perform(U: number, V: number, W: number, Rsnld: math_FunctionSetRoot, u0: number, v0: number, u1: number, v1: number, w0: number, w1: number): void;

// Returns TRUE if the creation completed without failure
IsDone(): boolean;

IsEmpty(): boolean;

// returns the intersection point The exception NotDone is raised if IsDone is false
Point(): gp_Pnt;

ParameterOnCurve(): number;

ParameterOnSurface(U?: number, V?: number): { U: number; V: number };

// return the math function which is used to compute the intersection
Function(): IntPatch_CSFunction;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation of an intersection line represented by a conic
IntPatch_GLine: declare class IntPatch_GLine extends IntPatch_Line

constructor

// To add a vertex in the list
AddVertex(Pnt: IntPatch_Point): void;

// To replace the element of range Index in the list of points
Replace(Index: number, Pnt: IntPatch_Point): void;

SetFirstPoint(IndFirst: number): void;

SetLastPoint(IndLast: number): void;

// Returns the Lin from gp corresponding to the intersection when ArcType returns {@link IntPatch_Line`IntPatch_Line`}
Line(): gp_Lin;

// Returns the Circ from gp corresponding to the intersection when ArcType returns IntPatch_Circle
Circle(): gp_Circ;

// Returns the Elips from gp corresponding to the intersection when ArcType returns IntPatch_Ellipse
Ellipse(): gp_Elips;

// Returns the Parab from gp corresponding to the intersection when ArcType returns IntPatch_Parabola
Parabola(): gp_Parab;

// Returns the Hypr from gp corresponding to the intersection when ArcType returns IntPatch_Hyperbola
Hyperbola(): gp_Hypr;

// Returns True if the line has a known First point
HasFirstPoint(): boolean;

// Returns True if the line has a known Last point
HasLastPoint(): boolean;

// Returns the IntPoint corresponding to the FirstPoint
FirstPoint(): IntPatch_Point;

// Returns the IntPoint corresponding to the LastPoint
LastPoint(): IntPatch_Point;

NbVertex(): number;

// Returns the vertex of range Index on the line
Vertex(Index: number): IntPatch_Point;

// Set the parameters of all the vertex on the line
ComputeVertexParameters(Tol: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_HCurve2dTool: declare class IntPatch_HCurve2dTool

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

// Tool for the intersection between 2 surfaces
IntPatch_HInterTool: declare class IntPatch_HInterTool

constructor

static SingularOnUMin(S: Adaptor3d_Surface): boolean;

static SingularOnUMax(S: Adaptor3d_Surface): boolean;

static SingularOnVMin(S: Adaptor3d_Surface): boolean;

static SingularOnVMax(S: Adaptor3d_Surface): boolean;

static NbSamplesU(S: Adaptor3d_Surface, u1: number, u2: number): number;

static NbSamplesV(S: Adaptor3d_Surface, v1: number, v2: number): number;

NbSamplePoints(S: Adaptor3d_Surface): number;

SamplePoint(S: Adaptor3d_Surface, Index: number, U?: number, V?: number): { U: number; V: number };

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

IntPatch_IType: typeof IntPatch_IType[keyof typeof IntPatch_IType]

// Implementation of the intersection between two quadric patches
IntPatch_ImpImpIntersection: declare class IntPatch_ImpImpIntersection

constructor

// Flag theIsReqToKeepRLine has been entered only for compatibility with `TopOpeBRep` package
Perform(S1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, S2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, theIsReqToKeepRLine?: boolean): void;

// Returns True if the calculus was successful
IsDone(): boolean;

// Returns status
GetStatus(): IntPatch_ImpImpIntersection_IntStatus;

// Returns true if the is no intersection
IsEmpty(): boolean;

// Returns True if the two patches are considered as entirely tangent, i.e every restriction arc of one patch is inside the geometric base of the other patch
TangentFaces(): boolean;

// Returns True when the TangentFaces returns True and the normal vectors evaluated at a point on the first and the second surface are opposite
OppositeFaces(): boolean;

// Returns the number of "single" points
NbPnts(): number;

// Returns the point of range Index
Point(Index: number): IntPatch_Point;

// Returns the number of intersection lines
NbLines(): number;

// Returns the line of range Index
Line(Index: number): IntPatch_Line;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPatch_ImpImpIntersection_IntStatus: typeof IntPatch_ImpImpIntersection_IntStatus[keyof typeof IntPatch_ImpImpIntersection_IntStatus]

// Implementation of the intersection between a natural quadric patch
IntPatch_ImpPrmIntersection: declare class IntPatch_ImpPrmIntersection

constructor

// to search for solution from the given point
SetStartPoint(U: number, V: number): void;

Perform(Surf1: Adaptor3d_Surface, D1: Adaptor3d_TopolTool, Surf2: Adaptor3d_Surface, D2: Adaptor3d_TopolTool, TolArc: number, TolTang: number, Fleche: number, Pas: number): void;

// Returns true if the calculus was successful
IsDone(): boolean;

// Returns true if the is no intersection
IsEmpty(): boolean;

// Returns the number of "single" points
NbPnts(): number;

// Returns the point of range Index
Point(Index: number): IntPatch_Point;

// Returns the number of intersection lines
NbLines(): number;

// Returns the line of range Index
Line(Index: number): IntPatch_Line;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the interference between two polyhedra or the self interference of a polyhedron
IntPatch_InterferencePolyhedron: declare class IntPatch_InterferencePolyhedron extends Intf_Interference

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
