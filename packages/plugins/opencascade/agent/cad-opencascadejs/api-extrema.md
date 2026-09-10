# libcascade — Extrema

15 top-level symbols. Signatures are verbatim typescript.

Extrema_Curve2dTool: declare class Extrema_Curve2dTool

constructor

static FirstParameter(theC: Adaptor2d_Curve2d): number;

static LastParameter(theC: Adaptor2d_Curve2d): number;

static Continuity(theC: Adaptor2d_Curve2d): GeomAbs_Shape;

// If necessary, breaks the curve in intervals of continuity
static NbIntervals(theC: Adaptor2d_Curve2d, theS: GeomAbs_Shape): number;

// Stores in <T> the parameters bounding the intervals of continuity
static Intervals(theC: Adaptor2d_Curve2d, theT: NCollection_Array1_double, theS: GeomAbs_Shape): void;
// theT: Mutated in place

// Returns the parameters bounding the intervals of subdivision of curve according to Curvature deflection
static DeflCurvIntervals(theC: Adaptor2d_Curve2d): NCollection_HArray1_double;

static IsClosed(theC: Adaptor2d_Curve2d): boolean;

static IsPeriodic(theC: Adaptor2d_Curve2d): boolean;

static Period(theC: Adaptor2d_Curve2d): number;

// Computes the point of parameter U on the curve
static Value(theC: Adaptor2d_Curve2d, theU: number): gp_Pnt2d;

// Computes the point of parameter U on the curve
static D0(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d): void;
// theP: Mutated in place

// Computes the point of parameter U on the curve with its first derivative
static D1(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV: gp_Vec2d): void;
// theP: Mutated in place
// theV: Mutated in place

// Returns the point P of parameter U, the first and second derivatives V1 and V2
static D2(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV1: gp_Vec2d, theV2: gp_Vec2d): void;
// theP: Mutated in place
// theV1: Mutated in place
// theV2: Mutated in place

// Returns the point P of parameter U, the first, the second and the third derivative
static D3(theC: Adaptor2d_Curve2d, theU: number, theP: gp_Pnt2d, theV1: gp_Vec2d, theV2: gp_Vec2d, theV3: gp_Vec2d): void;
// theP: Mutated in place
// theV1: Mutated in place
// theV2: Mutated in place
// theV3: Mutated in place

// The returned vector gives the value of the derivative for the order of derivation N
static DN(theC: Adaptor2d_Curve2d, theU: number, theN: number): gp_Vec2d;

// Returns the parametric resolution corresponding to the real space resolution <R3d>
static Resolution(theC: Adaptor2d_Curve2d, theR3d: number): number;

// Returns the type of the curve in the current interval
static GetType(theC: Adaptor2d_Curve2d): GeomAbs_CurveType;

static Line(theC: Adaptor2d_Curve2d): gp_Lin2d;

static Circle(theC: Adaptor2d_Curve2d): gp_Circ2d;

static Ellipse(theC: Adaptor2d_Curve2d): gp_Elips2d;

static Hyperbola(theC: Adaptor2d_Curve2d): gp_Hypr2d;

static Parabola(theC: Adaptor2d_Curve2d): gp_Parab2d;

static Degree(theC: Adaptor2d_Curve2d): number;

static IsRational(theC: Adaptor2d_Curve2d): boolean;

static NbPoles(theC: Adaptor2d_Curve2d): number;

static NbKnots(theC: Adaptor2d_Curve2d): number;

static Bezier(theC: Adaptor2d_Curve2d): Geom2d_BezierCurve;

static BSpline(theC: Adaptor2d_Curve2d): Geom2d_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Extrema_CurveTool: declare class Extrema_CurveTool

constructor

static FirstParameter(theC: Adaptor3d_Curve): number;

static LastParameter(theC: Adaptor3d_Curve): number;

static Continuity(theC: Adaptor3d_Curve): GeomAbs_Shape;

// Returns the number of intervals for continuity
static NbIntervals(theC: Adaptor3d_Curve, theS: GeomAbs_Shape): number;
// theC: Mutated in place

// Stores in <T> the parameters bounding the intervals of continuity
static Intervals(theC: Adaptor3d_Curve, theT: NCollection_Array1_double, theS: GeomAbs_Shape): void;
// theC: Mutated in place
// theT: Mutated in place

// Returns the parameters bounding the intervals of subdivision of curve according to Curvature deflection
static DeflCurvIntervals(theC: Adaptor3d_Curve): NCollection_HArray1_double;

static IsPeriodic(theC: Adaptor3d_Curve): boolean;

static Period(theC: Adaptor3d_Curve): number;

static Resolution(theC: Adaptor3d_Curve, theR3d: number): number;

static GetType(theC: Adaptor3d_Curve): GeomAbs_CurveType;

static Value(theC: Adaptor3d_Curve, theU: number): gp_Pnt;

static D0(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt): void;

static D1(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV: gp_Vec): void;

static D2(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec): void;

static D3(theC: Adaptor3d_Curve, theU: number, theP: gp_Pnt, theV1: gp_Vec, theV2: gp_Vec, theV3: gp_Vec): void;

static DN(theC: Adaptor3d_Curve, theU: number, theN: number): gp_Vec;

static Line(theC: Adaptor3d_Curve): gp_Lin;

static Circle(theC: Adaptor3d_Curve): gp_Circ;

static Ellipse(theC: Adaptor3d_Curve): gp_Elips;

static Hyperbola(theC: Adaptor3d_Curve): gp_Hypr;

static Parabola(theC: Adaptor3d_Curve): gp_Parab;

static Degree(theC: Adaptor3d_Curve): number;

static IsRational(theC: Adaptor3d_Curve): boolean;

static NbPoles(theC: Adaptor3d_Curve): number;

static NbKnots(theC: Adaptor3d_Curve): number;

static Bezier(theC: Adaptor3d_Curve): Geom_BezierCurve;

static BSpline(theC: Adaptor3d_Curve): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Extrema_ElementType: typeof Extrema_ElementType[keyof typeof Extrema_ElementType]

Extrema_ExtAlgo: typeof Extrema_ExtAlgo[keyof typeof Extrema_ExtAlgo]

// It calculates all the distance between two curves
Extrema_ExtCC: declare class Extrema_ExtCC

constructor

// Initializes but does not perform algorithm
Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, TolC1: number, TolC2: number): void;
Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, U1: number, U2: number, V1: number, V2: number, TolC1: number, TolC2: number): void;
Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, TolC1: number, TolC2: number): void;
Initialize(C1: Adaptor3d_Curve, C2: Adaptor3d_Curve, U1: number, U2: number, V1: number, V2: number, TolC1: number, TolC2: number): void;

SetCurve(theRank: number, C: Adaptor3d_Curve): void;
SetCurve(theRank: number, C: Adaptor3d_Curve, Uinf: number, Usup: number): void;
SetCurve(theRank: number, C: Adaptor3d_Curve): void;
SetCurve(theRank: number, C: Adaptor3d_Curve, Uinf: number, Usup: number): void;

SetRange(theRank: number, Uinf: number, Usup: number): void;

SetTolerance(theRank: number, Tol: number): void;

Perform(): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns True if the two curves are parallel
IsParallel(): boolean;

// Returns the value of the Nth extremum square distance
SquareDistance(N?: number): number;

// Returns the points of the Nth extremum distance
Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;
// P1: Mutated in place
// P2: Mutated in place

// if the curve is a trimmed curve, dist11 is a square distance between the point on C1 of parameter FirstParameter and the point of parameter FirstParameter on C2
TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt, P12: gp_Pnt, P21: gp_Pnt, P22: gp_Pnt): { dist11: number; distP12: number; distP21: number; distP22: number };
// P11: Mutated in place
// P12: Mutated in place
// P21: Mutated in place
// P22: Mutated in place

// Set flag for single extrema computation
SetSingleSolutionFlag(theSingleSolutionFlag: boolean): void;

// Get flag for single extrema computation
GetSingleSolutionFlag(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the distance between two curves
Extrema_ExtCC2d: declare class Extrema_ExtCC2d

constructor

// initializes the fields
Initialize(C2: Adaptor2d_Curve2d, V1: number, V2: number, TolC1?: number, TolC2?: number): void;

Perform(C1: Adaptor2d_Curve2d, U1: number, U2: number): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns True if the two curves are parallel
IsParallel(): boolean;

// Returns the value of the Nth extremum square distance
SquareDistance(N?: number): number;

// Returns the points of the Nth extremum distance
Points(N: number, P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;
// P1: Mutated in place
// P2: Mutated in place

// if the curve is a trimmed curve, dist11 is a square distance between the point on C1 of parameter FirstParameter and the point of parameter FirstParameter on C2
TrimmedSquareDistances(dist11: number, distP12: number, distP21: number, distP22: number, P11: gp_Pnt2d, P12: gp_Pnt2d, P21: gp_Pnt2d, P22: gp_Pnt2d): { dist11: number; distP12: number; distP21: number; distP22: number };
// P11: Mutated in place
// P12: Mutated in place
// P21: Mutated in place
// P22: Mutated in place

// Set flag for single extrema computation
SetSingleSolutionFlag(theSingleSolutionFlag: boolean): void;

// Get flag for single extrema computation
GetSingleSolutionFlag(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the extremum distances between a curve and a surface
Extrema_ExtCS: declare class Extrema_ExtCS

constructor

// Initializes the fields of the algorithm
Initialize(S: Adaptor3d_Surface, TolC: number, TolS: number): void;
Initialize(S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolC: number, TolS: number): void;
Initialize(S: Adaptor3d_Surface, TolC: number, TolS: number): void;
Initialize(S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolC: number, TolS: number): void;

// Computes the distances
Perform(C: Adaptor3d_Curve, Uinf: number, Usup: number): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns True if the curve is on a parallel surface
IsParallel(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnSurf): void;
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the distance between two elementary curves
Extrema_ExtElC: declare class Extrema_ExtElC

constructor

// Returns True if the distances are found
IsDone(): boolean;

// Returns True if the two curves are parallel
IsParallel(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth extremum square distance
SquareDistance(N?: number): number;

// Returns the points of the Nth extremum distance
Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the distance between two elementary curves
Extrema_ExtElC2d: declare class Extrema_ExtElC2d

constructor

// Returns True if the distances are found
IsDone(): boolean;

// Returns True if the two curves are parallel
IsParallel(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth extremum square distance
SquareDistance(N?: number): number;

// Returns the points of the Nth extremum distance
Points(N: number, P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the distances between a curve and a surface
Extrema_ExtElCS: declare class Extrema_ExtElCS

constructor

Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Pln): void;
Perform(C: gp_Lin, S: gp_Cylinder): void;
Perform(C: gp_Lin, S: gp_Cone): void;
Perform(C: gp_Lin, S: gp_Sphere): void;
Perform(C: gp_Lin, S: gp_Torus): void;
Perform(C: gp_Circ, S: gp_Pln): void;
Perform(C: gp_Circ, S: gp_Cylinder): void;
Perform(C: gp_Circ, S: gp_Cone): void;
Perform(C: gp_Circ, S: gp_Sphere): void;
Perform(C: gp_Circ, S: gp_Torus): void;
Perform(C: gp_Hypr, S: gp_Pln): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns True if the curve is on a parallel surface
IsParallel(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth extremum square distance
SquareDistance(N?: number): number;

// Returns the points of the Nth extremum distance
Points(N: number, P1: Extrema_POnCurv, P2: Extrema_POnSurf): void;
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the distances between 2 elementary surfaces
Extrema_ExtElSS: declare class Extrema_ExtElSS

constructor

Perform(S1: gp_Pln, S2: gp_Pln): void;
Perform(S1: gp_Pln, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
Perform(S1: gp_Sphere, S2: gp_Cone): void;
Perform(S1: gp_Sphere, S2: gp_Torus): void;
Perform(S1: gp_Pln, S2: gp_Pln): void;
Perform(S1: gp_Pln, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
Perform(S1: gp_Sphere, S2: gp_Cone): void;
Perform(S1: gp_Sphere, S2: gp_Torus): void;
Perform(S1: gp_Pln, S2: gp_Pln): void;
Perform(S1: gp_Pln, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
Perform(S1: gp_Sphere, S2: gp_Cone): void;
Perform(S1: gp_Sphere, S2: gp_Torus): void;
Perform(S1: gp_Pln, S2: gp_Pln): void;
Perform(S1: gp_Pln, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
Perform(S1: gp_Sphere, S2: gp_Cone): void;
Perform(S1: gp_Sphere, S2: gp_Torus): void;
Perform(S1: gp_Pln, S2: gp_Pln): void;
Perform(S1: gp_Pln, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
Perform(S1: gp_Sphere, S2: gp_Cone): void;
Perform(S1: gp_Sphere, S2: gp_Torus): void;
Perform(S1: gp_Pln, S2: gp_Pln): void;
Perform(S1: gp_Pln, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Sphere): void;
Perform(S1: gp_Sphere, S2: gp_Cylinder): void;
Perform(S1: gp_Sphere, S2: gp_Cone): void;
Perform(S1: gp_Sphere, S2: gp_Torus): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns True if the two surfaces are parallel
IsParallel(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth extremum square distance
SquareDistance(N?: number): number;

// Returns the points for the Nth resulting distance
Points(N: number, P1: Extrema_POnSurf, P2: Extrema_POnSurf): void;
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Extrema_ExtFlag: typeof Extrema_ExtFlag[keyof typeof Extrema_ExtFlag]

// It calculates all the distances between a point and an elementary curve
Extrema_ExtPElC: declare class Extrema_ExtPElC

constructor

Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Lin, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Circ, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Elips, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Hypr, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt, C: gp_Parab, Tol: number, Uinf: number, Usup: number): void;

// True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth extremum square distance
SquareDistance(N: number): number;

// Returns True if the Nth extremum distance is a minimum
IsMin(N: number): boolean;

// Returns the point of the Nth extremum distance
Point(N: number): Extrema_POnCurv;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the distances between a point and an elementary curve
Extrema_ExtPElC2d: declare class Extrema_ExtPElC2d

constructor

Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, L: gp_Lin2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Circ2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Elips2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Hypr2d, Tol: number, Uinf: number, Usup: number): void;
Perform(P: gp_Pnt2d, C: gp_Parab2d, Tol: number, Uinf: number, Usup: number): void;

// True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth extremum square distance
SquareDistance(N: number): number;

// Returns True if the Nth extremum distance is a minimum
IsMin(N: number): boolean;

// Returns the point of the Nth extremum distance
Point(N: number): Extrema_POnCurv2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the extremum distances between a point and a surface
Extrema_ExtPElS: declare class Extrema_ExtPElS

constructor

Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cylinder, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Pln, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Cone, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Torus, Tol: number): void;
Perform(P: gp_Pnt, S: gp_Sphere, Tol: number): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
Point(N: number): Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
