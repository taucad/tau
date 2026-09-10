# libcascade — Geom2dConvert

8 top-level symbols. Signatures are verbatim typescript.

// This package provides an implementation of algorithms to do the conversion between equivalent geometric entities from package Geom2d
Geom2dConvert: declare class Geom2dConvert

constructor

// Convert a curve to BSpline by Approximation
static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom2d_BSplineCurve;
static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom2d_BSplineCurve;
static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom2d_BSplineCurve;
static SplitBSplineCurve(C: Geom2d_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom2d_BSplineCurve;

// This function converts a non infinite curve from Geom into a B-spline curve
static CurveToBSplineCurve(C: Geom2d_Curve, Parameterisation?: Convert_ParameterisationType): Geom2d_BSplineCurve;

// This Method concatenates G1 the ArrayOfCurves as far as it is possible
static ConcatG1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
// ArrayOfCurves: Mutated in place

// This Method concatenates C1 the ArrayOfCurves as far as it is possible
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom2d_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom2d_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
// ArrayOfCurves: Mutated in place

// This Method reduces as far as it is possible the multiplicities of the knots of the BSpline BS.(keeping the geometry)
static C0BSplineToC1BSplineCurve(Tolerance: number): { BS: Geom2d_BSplineCurve; [Symbol.dispose](): void };

// This Method reduces as far as it is possible the multiplicities of the knots of the BSpline BS.(keeping the geometry)
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, AngularTolerance: number, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom2d_BSplineCurve, AngularTolerance: number, Tolerance: number): { tabBS: NCollection_HArray1_handle_Geom2d_BSplineCurve; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Approximation of a free-form curve by a sequence of arcs+segments
Geom2dConvert_ApproxArcsSegments: declare class Geom2dConvert_ApproxArcsSegments

constructor

// Get the result curve after approximation
GetResult(): NCollection_Sequence_handle_Geom2d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dConvert_ApproxArcsSegments_Status: typeof Geom2dConvert_ApproxArcsSegments_Status[keyof typeof Geom2dConvert_ApproxArcsSegments_Status]

// A framework to convert a 2D curve to a BSpline
Geom2dConvert_ApproxCurve: declare class Geom2dConvert_ApproxCurve

constructor

// Returns the 2D BSpline curve resulting from the approximation algorithm
Curve(): Geom2d_BSplineCurve;

// returns true if the approximation has been done with within required tolerance
IsDone(): boolean;

// returns true if the approximation did come out with a result that is not NECESSARELY within the required tolerance
HasResult(): boolean;

// Returns the greatest distance between a point on the source conic and the BSpline curve resulting from the approximation
MaxError(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An algorithm to determine points at which a BSpline curve should be split in order to obtain arcs of the same continuity
Geom2dConvert_BSplineCurveKnotSplitting: declare class Geom2dConvert_BSplineCurveKnotSplitting

constructor

// Returns the number of points at which the analysed BSpline curve should be split, in order to obtain arcs with the continuity required by this framework
NbSplits(): number;

// Loads the SplitValues table with the split knots values computed in this framework
Splitting(SplitValues: NCollection_Array1_int): void;
// SplitValues: Mutated in place

// Returns the split knot of index Index to the split knots table computed in this framework
SplitValue(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An algorithm to convert a BSpline curve into a series of adjacent Bezier curves
Geom2dConvert_BSplineCurveToBezierCurve: declare class Geom2dConvert_BSplineCurveToBezierCurve

constructor

// Constructs and returns the Bezier curve of index Index to the table of adjacent Bezier arcs computed by this algorithm
Arc(Index: number): Geom2d_BezierCurve;

// Constructs all the Bezier curves whose data is computed by this algorithm and loads these curves into the Curves table
Arcs(Curves: NCollection_Array1_handle_Geom2d_BezierCurve): void;
// Curves: Mutated in place

// This methode returns the bspline's knots associated to the converted arcs Raises DimensionError if the length of Curves is not equal to NbArcs + 1
Knots(TKnots: NCollection_Array1_double): void;
// TKnots: Mutated in place

// Returns the number of BezierCurve arcs
NbArcs(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm converts and concat several curve in an BSplineCurve
Geom2dConvert_CompCurveToBSplineCurve: declare class Geom2dConvert_CompCurveToBSplineCurve

constructor

// Append a curve in the BSpline Return False if the curve is not G0 with the BSplineCurve
Add(NewCurve: Geom2d_BoundedCurve, Tolerance: number, After: boolean): boolean;

BSplineCurve(): Geom2d_BSplineCurve;

// Clear result curve
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class representing a point on curve, with 2D coordinate and the tangent
Geom2dConvert_PPoint: declare class Geom2dConvert_PPoint

constructor

// Compute the distance between two 2d points
Dist(theOth: Geom2dConvert_PPoint): number;

// Query the parameter value
Parameter(): number;

// Query the point location
Point(): gp_XY;

// Query the first derivatives
D1(): gp_XY;

// Change the value of the derivative at the point
SetD1(theD1: gp_XY): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
