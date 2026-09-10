# libcascade — ExtremaPC

20 top-level symbols. Signatures are verbatim typescript.

ExtremaPC_Config: declare class ExtremaPC_Config

constructor

Tolerance: number

Domain: unknown | null | undefined

NbSamples: number

Mode: ExtremaPC_SearchMode

IncludeEndpoints: boolean

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ExtremaPC_ExtremumResult: declare class ExtremaPC_ExtremumResult

constructor

Parameter: number

Point: gp_Pnt

SquareDistance: number

IsMinimum: boolean

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ExtremaPC_Result: declare class ExtremaPC_Result

constructor

Status: ExtremaPC_Status

Extrema: NCollection_DynamicArray_ExtremaPC_ExtremumResult

InfiniteSquareDistance: number

IsDone(): boolean;

IsInfinite(): boolean;

NbExt(): number;

MinSquareDistance(): number;

MinIndex(): number;

MaxSquareDistance(): number;

MaxIndex(): number;

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ExtremaPC_SearchMode: typeof ExtremaPC_SearchMode[keyof typeof ExtremaPC_SearchMode]

ExtremaPC_Status: typeof ExtremaPC_Status[keyof typeof ExtremaPC_Status]

// Point-BSplineCurve extrema computation using grid-based approach
ExtremaPC_BSplineCurve: declare class ExtremaPC_BSplineCurve

constructor

// Evaluates point on curve at parameter
Value(theU: number): gp_Pnt;
// theU: parameter

// Returns true if domain is bounded (subset of curve domain)
IsBounded(): boolean;

// Returns the domain
Domain(): unknown;

// Compute extrema between point P and the curve
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for root finding
// theMode: search mode (MinMax, Min, or Max)

// Compute extrema between point P and the curve including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for root finding
// theMode: search mode (MinMax, Min, or Max)

// Returns the BSpline curve
Curve(): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Point-BezierCurve extrema computation using grid-based approach
ExtremaPC_BezierCurve: declare class ExtremaPC_BezierCurve

constructor

// Evaluates point on curve at parameter
Value(theU: number): gp_Pnt;
// theU: parameter

// Returns true if domain is bounded (subset of curve domain)
IsBounded(): boolean;

// Returns the domain
Domain(): unknown;

// Compute extrema between point P and the curve
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for root finding
// theMode: search mode (MinMax, Min, or Max)

// Compute extrema between point P and the curve including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for root finding
// theMode: search mode (MinMax, Min, or Max)

// Returns the Bezier curve
Curve(): Geom_BezierCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Point-Circle extrema computation
ExtremaPC_Circle: declare class ExtremaPC_Circle

constructor

// Evaluates point on circle at parameter
Value(theU: number): gp_Pnt;
// theU: parameter (radians)

// Returns true if domain is bounded (partial arc)
IsBounded(): boolean;

// Returns the domain (only valid if `IsBounded()` is true)
Domain(): unknown;

// Compute extrema between point P and the circle
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for degenerate case detection
// theMode: search mode (MinMax, Min, or Max)

// Compute extrema between point P and the circle arc including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for degenerate case detection
// theMode: search mode (MinMax, Min, or Max)

// Returns the circle geometry
Circle(): gp_Circ;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Main aggregator for Point-Curve extrema computation
ExtremaPC_Curve: declare class ExtremaPC_Curve

constructor

// Computes extrema between point P and the curve
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for extrema computation
// theMode: search mode (MinMax, Min, or Max)

// Computes extrema between point P and the curve, including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for extrema computation
// theMode: search mode (MinMax, Min, or Max)

// Returns true if the evaluator is properly initialized
IsInitialized(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Distance function for point-curve extrema computation
ExtremaPC_DistanceFunction: declare class ExtremaPC_DistanceFunction

constructor

// Computes F(u) = (C(u) - P)
Value(theU: number, theF?: number): { returnValue: boolean; theF: number };
// theU: parameter value
// theF: output

// Computes F(u) and F'(u)
Values(theU: number, theF?: number, theDF?: number): { returnValue: boolean; theF: number; theDF: number };
// theU: parameter value
// theF: output
// theDF: output

// Computes the derivative F'(u)
Derivative(theU: number, theDF?: number): { returnValue: boolean; theDF: number };
// theU: parameter value
// theDF: output

// Returns the first parameter of the curve
FirstParameter(): number;

// Returns the last parameter of the curve
LastParameter(): number;

// Returns the query point
Point(): gp_Pnt;

// Returns the curve
Curve(): Adaptor3d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Point-Ellipse extrema computation
ExtremaPC_Ellipse: declare class ExtremaPC_Ellipse

constructor

// Evaluates point on ellipse at parameter
Value(theU: number): gp_Pnt;
// theU: parameter (radians)

// Returns true if domain is bounded (partial arc)
IsBounded(): boolean;

// Returns the domain (only valid if `IsBounded()` is true)
Domain(): unknown;

// Compute extrema between point P and the ellipse
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for degenerate case detection
// theMode: search mode (MinMax, Min, or Max)

// Compute extrema between point P and the ellipse arc including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for degenerate case detection
// theMode: search mode (MinMax, Min, or Max)

// Returns the ellipse geometry
Ellipse(): gp_Elips;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Grid-based point-curve extrema computation class
ExtremaPC_GridEvaluator: declare class ExtremaPC_GridEvaluator

constructor

// Returns the cached grid
Grid(): any;

// Returns mutable reference to the result for post-processing
Result(): ExtremaPC_Result;

// Perform extrema computation using cached grid (interior only)
Perform(theCurve: Adaptor3d_Curve, theP: gp_Pnt, theDomain: unknown, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theCurve: curve adaptor
// theP: query point
// theDomain: parameter domain
// theTol: tolerance
// theMode: search mode

// Build uniform parameter grid
static BuildUniformParams(theUMin: number, theUMax: number, theNbSamples: number): math_VectorBase_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Type of candidate extremum detected during grid scan
ExtremaPC_GridEvaluator_CandidateType: typeof ExtremaPC_GridEvaluator_CandidateType[keyof typeof ExtremaPC_GridEvaluator_CandidateType]

// Point-Hyperbola extrema computation
ExtremaPC_Hyperbola: declare class ExtremaPC_Hyperbola

constructor

// Evaluates point on hyperbola at parameter using cached geometry
Value(theU: number): gp_Pnt;
// theU: parameter

// Returns true if domain is bounded
IsBounded(): boolean;

// Returns the domain (only valid if `IsBounded()` is true)
Domain(): unknown;

// Compute extrema between point P and the hyperbola
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for duplicate detection
// theMode: search mode (MinMax, Min, or Max)

// Compute extrema between point P and the hyperbola arc including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for duplicate detection
// theMode: search mode (MinMax, Min, or Max)

// Returns the hyperbola geometry
Hyperbola(): gp_Hypr;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Point-Line extrema computation
ExtremaPC_Line: declare class ExtremaPC_Line

constructor

// Evaluates point on line at parameter
Value(theU: number): gp_Pnt;
// theU: parameter

// Returns true if domain is bounded
IsBounded(): boolean;

// Returns the domain (only valid if `IsBounded()` is true)
Domain(): unknown;

// Compute extrema between point P and the line
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for parameter comparison
// theMode: search mode (unused for lines - always returns minimum)

// Compute extrema between point P and the line segment including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for parameter comparison
// theMode: search mode (MinMax, Min, or Max)

// Returns the line geometry
Line(): gp_Lin;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Point-OffsetCurve extrema computation using grid-based approach
ExtremaPC_OffsetCurve: declare class ExtremaPC_OffsetCurve

constructor

// Evaluates point on curve at parameter
Value(theU: number): gp_Pnt;
// theU: parameter

// Returns true if domain is bounded
IsBounded(): boolean;

// Returns the domain
Domain(): unknown;

// Compute extrema between point P and the curve
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for root finding
// theMode: search mode (MinMax, Min, or Max)

// Compute extrema between point P and the curve including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for root finding
// theMode: search mode (MinMax, Min, or Max)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Point-Curve extrema computation for general curves using grid-based approach
ExtremaPC_OtherCurve: declare class ExtremaPC_OtherCurve

constructor

// Evaluates point on curve at parameter
Value(theU: number): gp_Pnt;
// theU: parameter

// Returns true if domain is bounded
IsBounded(): boolean;

// Returns the domain
Domain(): unknown;

// Compute extrema between point P and the curve
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for root finding
// theMode: search mode (MinMax, Min, or Max)

// Compute extrema between point P and the curve including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for root finding
// theMode: search mode (MinMax, Min, or Max)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Point-Parabola extrema computation
ExtremaPC_Parabola: declare class ExtremaPC_Parabola

constructor

// Evaluates point on parabola at parameter using cached geometry
Value(theU: number): gp_Pnt;
// theU: parameter

// Returns true if domain is bounded
IsBounded(): boolean;

// Returns the domain (only valid if `IsBounded()` is true)
Domain(): unknown;

// Compute extrema between point P and the parabola
Perform(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for duplicate detection
// theMode: search mode (MinMax, Min, or Max)

// Compute extrema between point P and the parabola arc including endpoints
PerformWithEndpoints(theP: gp_Pnt, theTol: number, theMode: ExtremaPC_SearchMode): ExtremaPC_Result;
// theP: query point
// theTol: tolerance for duplicate detection
// theMode: search mode (MinMax, Min, or Max)

// Returns the parabola geometry
Parabola(): gp_Parab;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ExtremaPC_GridEvaluator_GridPoint: interface ExtremaPC_GridEvaluator_GridPoint

Param: number

Point: gp_Pnt

D1: gp_Vec

ExtremaPC_GridEvaluator_Candidate: interface ExtremaPC_GridEvaluator_Candidate

Type: ExtremaPC_GridEvaluator_CandidateType

IdxLo: number

IdxHi: number

StartU: number
