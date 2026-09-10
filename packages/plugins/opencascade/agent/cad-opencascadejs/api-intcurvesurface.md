# libcascade — IntCurveSurface

13 top-level symbols. Signatures are verbatim typescript.

IntCurveSurface_HInter: declare class IntCurveSurface_HInter extends IntCurveSurface_Intersection

constructor

// Compute the Intersection between the curve and the surface
Perform(Curve: Adaptor3d_Curve, Surface: Adaptor3d_Surface): void;
Perform(Curve: Adaptor3d_Curve, Polygon: IntCurveSurface_ThePolygonOfHInter, Surface: Adaptor3d_Surface): void;
Perform(Curve: Adaptor3d_Curve, Surface: Adaptor3d_Surface): void;
Perform(Curve: Adaptor3d_Curve, Polygon: IntCurveSurface_ThePolygonOfHInter, Surface: Adaptor3d_Surface): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_Intersection: declare class IntCurveSurface_Intersection

// returns the <done> field
IsDone(): boolean;

// returns the number of IntersectionPoint if IsDone returns True
NbPoints(): number;

// returns the number of IntersectionSegment if IsDone returns True
NbSegments(): number;

// returns the IntersectionSegment of range <Index> raises NotDone if the computation has failed or if the computation has not been done raises OutOfRange if Index is not in the range <1..NbSegment>
Segment(Index: number): IntCurveSurface_IntersectionSegment;

// Returns true if curve is parallel or belongs surface This case is recognized only for some pairs of analytical curves and surfaces (plane - line, ...)
IsParallel(): boolean;

// Dump all the fields
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A IntersectionSegment describes a segment of curve (w1,w2) where distance(C(w),Surface) is less than a given tolerances
IntCurveSurface_IntersectionSegment: declare class IntCurveSurface_IntersectionSegment

constructor

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_TheCSFunctionOfHInter: declare class IntCurveSurface_TheCSFunctionOfHInter extends math_FunctionSetWithDerivatives

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

AuxillarCurve(): Adaptor3d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_TheExactHInter: declare class IntCurveSurface_TheExactHInter

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
Function(): IntCurveSurface_TheCSFunctionOfHInter;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_TheHCurveTool: declare class IntCurveSurface_TheHCurveTool

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

// Returns sample parameters for the curve within [U0, U1] range, computed based on deflection and minimum number of points
static SamplePars(C: Adaptor3d_Curve, U0: number, U1: number, Defl: number, NbMin: number): NCollection_HArray1_double;
// C: the curve adaptor
// U0: start parameter
// U1: end parameter
// Defl: deflection tolerance
// NbMin: minimum number of sample points

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_TheInterferenceOfHInter: declare class IntCurveSurface_TheInterferenceOfHInter extends Intf_Interference

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_ThePolygonOfHInter: declare class IntCurveSurface_ThePolygonOfHInter

constructor

// Give the bounding box of the polygon
Bounding(): Bnd_Box;

DeflectionOverEstimation(): number;

SetDeflectionOverEstimation(x: number): void;

Closed(flag: boolean): void;
Closed(): boolean;
Closed(flag: boolean): void;
Closed(): boolean;

// Give the number of Segments in the polyline
NbSegments(): number;

// Give the point of range Index in the Polygon
BeginOfSeg(theIndex: number): gp_Pnt;

// Give the point of range Index in the Polygon
EndOfSeg(theIndex: number): gp_Pnt;

// Returns the parameter (On the curve) of the first point of the Polygon
InfParameter(): number;

// Returns the parameter (On the curve) of the last point of the Polygon
SupParameter(): number;

// Give an approximation of the parameter on the curve according to the discretization of the Curve
ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_ThePolygonToolOfHInter: declare class IntCurveSurface_ThePolygonToolOfHInter

constructor

// Give the bounding box of the polygon
static Bounding(thePolygon: IntCurveSurface_ThePolygonOfHInter): Bnd_Box;

static DeflectionOverEstimation(thePolygon: IntCurveSurface_ThePolygonOfHInter): number;

static Closed(thePolygon: IntCurveSurface_ThePolygonOfHInter): boolean;

static NbSegments(thePolygon: IntCurveSurface_ThePolygonOfHInter): number;

// Give the point of range Index in the Polygon
static BeginOfSeg(thePolygon: IntCurveSurface_ThePolygonOfHInter, Index: number): gp_Pnt;

// Give the point of range Index in the Polygon
static EndOfSeg(thePolygon: IntCurveSurface_ThePolygonOfHInter, Index: number): gp_Pnt;

static Dump(thePolygon: IntCurveSurface_ThePolygonOfHInter): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_ThePolyhedronToolOfHInter: declare class IntCurveSurface_ThePolyhedronToolOfHInter

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_TheQuadCurvExactHInter: declare class IntCurveSurface_TheQuadCurvExactHInter

constructor

IsDone(): boolean;

NbRoots(): number;

Root(Index: number): number;

NbIntervals(): number;

// U1 and U2 are the parameters of a segment on the curve
Intervals(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter: declare class IntCurveSurface_TheQuadCurvFuncOfTheQuadCurvExactHInter extends math_FunctionWithDerivative

constructor

// Computes the value of the signed distance between the implicit surface and the point at parameter Param on the parametrised curve
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative of the previous function at parameter Param
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value and the derivative of the function
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// \ Uo ^ \ U1 ^ \ | n \ | n Surf ==========|=== ==========|=== \
IntCurveSurface_TransitionOnCurve: typeof IntCurveSurface_TransitionOnCurve[keyof typeof IntCurveSurface_TransitionOnCurve]
