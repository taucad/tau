# libcascade — GeomConvert

10 top-level symbols. Signatures are verbatim typescript.

// The {@link GeomConvert`GeomConvert`} package provides some global functions as follows
GeomConvert: declare class GeomConvert

constructor

// Convert a curve from Geom by an approximation method
static SplitBSplineCurve(C: Geom_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom_BSplineCurve;
static SplitBSplineCurve(C: Geom_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineCurve;
static SplitBSplineCurve(C: Geom_BSplineCurve, FromK1: number, ToK2: number, SameOrientation: boolean): Geom_BSplineCurve;
static SplitBSplineCurve(C: Geom_BSplineCurve, FromU1: number, ToU2: number, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineCurve;

// Computes the B-spline surface patche between the knots values FromUK1, ToUK2, FromVK1, ToVK2
static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromUK1: number, ToUK2: number, FromVK1: number, ToVK2: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromK1: number, ToK2: number, USplit: boolean, SameOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromU1: number, ToU2: number, FromV1: number, ToV2: number, ParametricTolerance: number, SameUOrientation: boolean, SameVOrientation: boolean): Geom_BSplineSurface;
static SplitBSplineSurface(S: Geom_BSplineSurface, FromParam1: number, ToParam2: number, USplit: boolean, ParametricTolerance: number, SameOrientation: boolean): Geom_BSplineSurface;

// This function converts a non infinite curve from Geom into a B-spline curve
static CurveToBSplineCurve(C: Geom_Curve, Parameterisation?: Convert_ParameterisationType): Geom_BSplineCurve;

// This algorithm converts a non infinite surface from Geom into a B-spline surface
static SurfaceToBSplineSurface(S: Geom_Surface): Geom_BSplineSurface;

// This Method concatenates G1 the ArrayOfCurves as far as it is possible
static ConcatG1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
// ArrayOfCurves: Mutated in place

// This Method concatenates C1 the ArrayOfCurves as far as it is possible
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
static ConcatC1(ArrayOfCurves: NCollection_Array1_handle_Geom_BSplineCurve, ArrayOfToler: NCollection_Array1_double, ClosedFlag: boolean, ClosedTolerance: number, AngularTolerance: number): { ArrayOfIndices: NCollection_HArray1_int; ArrayOfConcatenated: NCollection_HArray1_handle_Geom_BSplineCurve; ClosedFlag: boolean; [Symbol.dispose](): void };
// ArrayOfCurves: Mutated in place

// This Method reduces as far as it is possible the multiplicities of the knots of the BSpline BS.(keeping the geometry)
static C0BSplineToC1BSplineCurve(tolerance: number, AngularTolerance: number): { BS: Geom_BSplineCurve; [Symbol.dispose](): void };

// This Method reduces as far as it is possible the multiplicities of the knots of the BSpline BS.(keeping the geometry)
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, AngularTolerance: number, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };
static C0BSplineToArrayOfC1BSplineCurve(BS: Geom_BSplineCurve, AngularTolerance: number, tolerance: number): { tabBS: NCollection_HArray1_handle_Geom_BSplineCurve; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A framework to convert a 3D curve to a 3D BSpline
GeomConvert_ApproxCurve: declare class GeomConvert_ApproxCurve

constructor

// Returns the BSpline curve resulting from the approximation algorithm
Curve(): Geom_BSplineCurve;

// returns true if the approximation has been done within required tolerance
IsDone(): boolean;

// Returns true if the approximation did come out with a result that is not NECESSARELY within the required tolerance
HasResult(): boolean;

// Returns the greatest distance between a point on the source conic and the BSpline curve resulting from the approximation
MaxError(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A framework to convert a surface to a BSpline surface
GeomConvert_ApproxSurface: declare class GeomConvert_ApproxSurface

constructor

// Returns the BSpline surface resulting from the approximation algorithm
Surface(): Geom_BSplineSurface;

// Returns true if the approximation has be done
IsDone(): boolean;

// Returns true if the approximation did come out with a result that is not NECESSARILY within the required tolerance or a result that is not recognized with the wished continuities
HasResult(): boolean;

// Returns the greatest distance between a point on the source conic surface and the BSpline surface resulting from the approximation (>0 when an approximation has been done, 0 if no approximation )
MaxError(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An algorithm to determine points at which a BSpline curve should be split in order to obtain arcs of the same continuity
GeomConvert_BSplineCurveKnotSplitting: declare class GeomConvert_BSplineCurveKnotSplitting

constructor

// Returns the number of points at which the analyzed BSpline curve should be split, in order to obtain arcs with the continuity required by this framework
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
GeomConvert_BSplineCurveToBezierCurve: declare class GeomConvert_BSplineCurveToBezierCurve

constructor

// Constructs and returns the Bezier curve of index Index to the table of adjacent Bezier arcs computed by this algorithm
Arc(Index: number): Geom_BezierCurve;

// Constructs all the Bezier curves whose data is computed by this algorithm and loads these curves into the Curves table
Arcs(Curves: NCollection_Array1_handle_Geom_BezierCurve): void;
// Curves: Mutated in place

// This methode returns the bspline's knots associated to the converted arcs Raised if the length of Curves is not equal to NbArcs + 1
Knots(TKnots: NCollection_Array1_double): void;
// TKnots: Mutated in place

// Returns the number of BezierCurve arcs
NbArcs(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An algorithm to determine isoparametric curves along which a BSpline surface should be split in order to obtain patches of the same continuity
GeomConvert_BSplineSurfaceKnotSplitting: declare class GeomConvert_BSplineSurfaceKnotSplitting

constructor

// Returns the number of u-isoparametric curves along which the analysed BSpline surface should be split in order to obtain patches with the continuity required by this framework
NbUSplits(): number;

// Returns the number of v-isoparametric curves along which the analysed BSpline surface should be split in order to obtain patches with the continuity required by this framework
NbVSplits(): number;

// Loads the USplit and VSplit tables with the split knots values computed in this framework
Splitting(USplit: NCollection_Array1_int, VSplit: NCollection_Array1_int): void;
// USplit: Mutated in place
// VSplit: Mutated in place

// Returns the split knot of index UIndex to the split knots table for the u parametric direction computed in this framework
USplitValue(UIndex: number): number;

// Returns the split knot of index VIndex to the split knots table for the v parametric direction computed in this framework
VSplitValue(VIndex: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm converts a B-spline surface into several Bezier surfaces
GeomConvert_BSplineSurfaceToBezierSurface: declare class GeomConvert_BSplineSurfaceToBezierSurface

constructor

// Constructs and returns the Bezier surface of indices (UIndex, VIndex) to the patch grid computed on the BSpline surface analyzed by this algorithm
Patch(UIndex: number, VIndex: number): Geom_BezierSurface;

// Constructs all the Bezier surfaces whose data is computed by this algorithm, and loads them into the Surfaces table
Patches(Surfaces: NCollection_Array2_handle_Geom_BezierSurface): void;
// Surfaces: Mutated in place

// This methode returns the bspline's u-knots associated to the converted Patches Raised if the length of Curves is not equal to NbUPatches + 1
UKnots(TKnots: NCollection_Array1_double): void;
// TKnots: Mutated in place

// This methode returns the bspline's v-knots associated to the converted Patches Raised if the length of Curves is not equal to NbVPatches + 1
VKnots(TKnots: NCollection_Array1_double): void;
// TKnots: Mutated in place

// Returns the number of Bezier surfaces in the U direction
NbUPatches(): number;

// Returns the number of Bezier surfaces in the V direction
NbVPatches(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An algorithm to convert a grid of adjacent non-rational Bezier surfaces (with continuity CM) into a BSpline surface (with continuity CM)
GeomConvert_CompBezierSurfacesToBSplineSurface: declare class GeomConvert_CompBezierSurfacesToBSplineSurface

constructor

// Returns the number of knots in the U direction of the BSpline surface whose data is computed in this framework
NbUKnots(): number;

// Returns number of poles in the U direction of the BSpline surface whose data is computed in this framework
NbUPoles(): number;

// Returns the number of knots in the V direction of the BSpline surface whose data is computed in this framework
NbVKnots(): number;

// Returns the number of poles in the V direction of the BSpline surface whose data is computed in this framework
NbVPoles(): number;

// Returns the table of poles of the BSpline surface whose data is computed in this framework
Poles(): NCollection_HArray2_gp_Pnt;

// Returns the knots table for the u parametric direction of the BSpline surface whose data is computed in this framework
UKnots(): NCollection_HArray1_double;

// Returns the degree for the u parametric direction of the BSpline surface whose data is computed in this framework
UDegree(): number;

// Returns the knots table for the v parametric direction of the BSpline surface whose data is computed in this framework
VKnots(): NCollection_HArray1_double;

// Returns the degree for the v parametric direction of the BSpline surface whose data is computed in this framework
VDegree(): number;

// Returns the multiplicities table for the u parametric direction of the knots of the BSpline surface whose data is computed in this framework
UMultiplicities(): NCollection_HArray1_int;

// - Returns the multiplicities table for the v parametric direction of the knots of the BSpline surface whose data is computed in this framework
VMultiplicities(): NCollection_HArray1_int;

// Returns true if the conversion was successful
IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Algorithm converts and concat several curve in an BSplineCurve
GeomConvert_CompCurveToBSplineCurve: declare class GeomConvert_CompCurveToBSplineCurve

constructor

// Append a curve in the BSpline Return False if the curve is not G0 with the BSplineCurve
Add(NewCurve: Geom_BoundedCurve, Tolerance: number, After: boolean, WithRatio: boolean, MinM: number): boolean;

BSplineCurve(): Geom_BSplineCurve;

// Clear a result curve
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomConvert_ConvType: typeof GeomConvert_ConvType[keyof typeof GeomConvert_ConvType]
