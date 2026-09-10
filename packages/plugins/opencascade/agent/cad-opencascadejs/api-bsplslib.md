# libcascade — BSplSLib

3 top-level symbols. Signatures are verbatim typescript.

// {@link BSplSLib`BSplSLib`} B-spline surface Library This package provides an implementation of geometric functions for rational and non rational, periodic and non periodic B-spline surface computation
BSplSLib: declare class BSplSLib

constructor

// this is a one dimensional function typedef void (_EvaluatorFunction) ( int // Derivative Request double _ // StartEnd[2][2] // [0] = U // [1] = V // [0] = start // [1] = end double // UParameter double // VParamerer double & // Result int &) ;// Error Code serves to multiply a given vectorial BSpline by a function Computes the derivatives of a ratio of two-variables functions x(u,v) / w(u,v) at orders <N,M>, x(u,v) is a vector in dimension <3>
static RationalDerivative(UDeg: number, VDeg: number, N: number, M: number, Ders: number, RDers: number, All: boolean): { Ders: number; RDers: number };

static D0(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt): void;

static D1(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, Degree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec): void;

static D2(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec): void;

static D3(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, P: gp_Pnt, Vu: gp_Vec, Vv: gp_Vec, Vuu: gp_Vec, Vvv: gp_Vec, Vuv: gp_Vec, Vuuu: gp_Vec, Vvvv: gp_Vec, Vuuv: gp_Vec, Vuvv: gp_Vec): void;

static DN(U: number, V: number, Nu: number, Nv: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, Vn: gp_Vec): void;

// Computes the poles and weights of an isoparametric curve at parameter (UIso if <IsU> is True, VIso else)
static Iso(Param: number, IsU: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, Degree: number, Periodic: boolean, CPoles: NCollection_Array1_gp_Pnt, CWeights: NCollection_Array1_double): void;
// CPoles: Mutated in place

// Reverses the array of poles
static Reverse(Poles: NCollection_Array2_gp_Pnt, Last: number, UDirection: boolean): void;
static Reverse(Weights: NCollection_Array2_double, Last: number, UDirection: boolean): void;
static Reverse(Poles: NCollection_Array2_gp_Pnt, Last: number, UDirection: boolean): void;
static Reverse(Weights: NCollection_Array2_double, Last: number, UDirection: boolean): void;
// Poles: Mutated in place

// Makes an homogeneous evaluation of Poles and Weights any and returns in P the Numerator value and in W the Denominator value if Weights are present otherwise returns 1.0e0
static HomogeneousD0(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, W: number, P: gp_Pnt): { W: number };
// P: Mutated in place

// Makes an homogeneous evaluation of Poles and Weights any and returns in P the Numerator value and in W the Denominator value if Weights are present otherwise returns 1.0e0
static HomogeneousD1(U: number, V: number, UIndex: number, VIndex: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, N: gp_Pnt, Nu: gp_Vec, Nv: gp_Vec, D?: number, Du?: number, Dv?: number): { D: number; Du: number; Dv: number };
// N: Mutated in place
// Nu: Mutated in place
// Nv: Mutated in place

// Returns False if all the weights of the array <Weights> in the area [I1,I2] \* [J1,J2] are identic
static IsRational(Weights: NCollection_Array2_double, I1: number, I2: number, J1: number, J2: number, Epsilon?: number): boolean;

// Copy in FP the coordinates of the poles
static SetPoles(Poles: NCollection_Array2_gp_Pnt, FP: NCollection_Array1_double, UDirection: boolean): void;
static SetPoles(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, FP: NCollection_Array1_double, UDirection: boolean): void;
static SetPoles(Poles: NCollection_Array2_gp_Pnt, FP: NCollection_Array1_double, UDirection: boolean): void;
static SetPoles(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, FP: NCollection_Array1_double, UDirection: boolean): void;
// FP: Mutated in place

// Get from FP the coordinates of the poles
static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, UDirection: boolean): void;
static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UDirection: boolean): void;
static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, UDirection: boolean): void;
static GetPoles(FP: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UDirection: boolean): void;
// Poles: Mutated in place

// Find the new poles which allows an old point (with a given u,v as parameters) to reach a new position UIndex1,UIndex2 indicate the range of poles we can move for U (1, UNbPoles-1) or (2, UNbPoles) -> no constraint for one side in U (2, UNbPoles-1) -> the ends are enforced for U don't enter (1,NbPoles) and (1,VNbPoles) -> error
static MovePoint(U: number, V: number, Displ: gp_Vec, UIndex1: number, UIndex2: number, VIndex1: number, VIndex2: number, UDegree: number, VDegree: number, Rational: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UFirstIndex: number, ULastIndex: number, VFirstIndex: number, VLastIndex: number, NewPoles: NCollection_Array2_gp_Pnt): { UFirstIndex: number; ULastIndex: number; VFirstIndex: number; VLastIndex: number };
// NewPoles: Mutated in place

static InsertKnots(UDirection: boolean, Degree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, AddKnots: NCollection_Array1_double, AddMults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int, Epsilon: number, Add: boolean): void;

static RemoveKnot(UDirection: boolean, Index: number, Mult: number, Degree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int, Tolerance: number): boolean;

static IncreaseDegree(UDirection: boolean, Degree: number, NewDegree: number, Periodic: boolean, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Knots: NCollection_Array1_double, Mults: NCollection_Array1_int, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double, NewKnots: NCollection_Array1_double, NewMults: NCollection_Array1_int): void;

static Unperiodize(UDirection: boolean, Degree: number, Mults: NCollection_Array1_int, Knots: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, NewMults: NCollection_Array1_int, NewKnots: NCollection_Array1_double, NewPoles: NCollection_Array2_gp_Pnt, NewWeights: NCollection_Array2_double): void;

// Used as argument for a non rational curve
static NoWeights(): NCollection_Array2_double;

// Perform the evaluation of the Taylor expansion of the Bspline normalized between 0 and 1
static BuildCache(U: number, V: number, USpanDomain: number, VSpanDomain: number, UPeriodicFlag: boolean, VPeriodicFlag: boolean, UDegree: number, VDegree: number, UIndex: number, VIndex: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, CachePoles: NCollection_Array2_gp_Pnt, CacheWeights: NCollection_Array2_double): void;
static BuildCache(theU: number, theV: number, theUSpanDomain: number, theVSpanDomain: number, theUPeriodic: boolean, theVPeriodic: boolean, theUDegree: number, theVDegree: number, theUIndex: number, theVIndex: number, theUFlatKnots: NCollection_Array1_double, theVFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array2_gp_Pnt, theWeights: NCollection_Array2_double, theCacheArray: NCollection_Array2_double): void;
static BuildCache(U: number, V: number, USpanDomain: number, VSpanDomain: number, UPeriodicFlag: boolean, VPeriodicFlag: boolean, UDegree: number, VDegree: number, UIndex: number, VIndex: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, CachePoles: NCollection_Array2_gp_Pnt, CacheWeights: NCollection_Array2_double): void;
static BuildCache(theU: number, theV: number, theUSpanDomain: number, theVSpanDomain: number, theUPeriodic: boolean, theVPeriodic: boolean, theUDegree: number, theVDegree: number, theUIndex: number, theVIndex: number, theUFlatKnots: NCollection_Array1_double, theVFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array2_gp_Pnt, theWeights: NCollection_Array2_double, theCacheArray: NCollection_Array2_double): void;
// CachePoles: Mutated in place

// Perform the evaluation of the of the cache the parameter must be normalized between the 0 and 1 for the span
static CacheD0(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt): void;
// Point: Mutated in place

// Calls CacheD0 for Bezier Surfaces Arrays computed with the method PolesCoefficients
static CoefsD0(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt): void;
// Point: Mutated in place

// Perform the evaluation of the of the cache the parameter must be normalized between the 0 and 1 for the span
static CacheD1(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec): void;
// Point: Mutated in place
// VecU: Mutated in place
// VecV: Mutated in place

// Calls CacheD0 for Bezier Surfaces Arrays computed with the method PolesCoefficients
static CoefsD1(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec): void;
// Point: Mutated in place
// VecU: Mutated in place
// VecV: Mutated in place

// Perform the evaluation of the of the cache the parameter must be normalized between the 0 and 1 for the span
static CacheD2(U: number, V: number, UDegree: number, VDegree: number, UCacheParameter: number, VCacheParameter: number, USpanLenght: number, VSpanLength: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec, VecUU: gp_Vec, VecUV: gp_Vec, VecVV: gp_Vec): void;
// Point: Mutated in place
// VecU: Mutated in place
// VecV: Mutated in place
// VecUU: Mutated in place
// VecUV: Mutated in place
// VecVV: Mutated in place

// Calls CacheD0 for Bezier Surfaces Arrays computed with the method PolesCoefficients
static CoefsD2(U: number, V: number, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, Point: gp_Pnt, VecU: gp_Vec, VecV: gp_Vec, VecUU: gp_Vec, VecUV: gp_Vec, VecVV: gp_Vec): void;
// Point: Mutated in place
// VecU: Mutated in place
// VecV: Mutated in place
// VecUU: Mutated in place
// VecUV: Mutated in place
// VecVV: Mutated in place

// Warning! To be used for BezierSurfaces ONLY!!!
static PolesCoefficients(Poles: NCollection_Array2_gp_Pnt, CachePoles: NCollection_Array2_gp_Pnt): void;
// CachePoles: Mutated in place

// Given a tolerance in 3D space returns two tolerances, one in U one in V such that for all (u1,v1) and (u0,v0) in the domain of the surface f(u,v) we have
static Resolution(Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UKnots: NCollection_Array1_double, VKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, UDegree: number, VDegree: number, URat: boolean, VRat: boolean, UPer: boolean, VPer: boolean, Tolerance3D: number, UTolerance?: number, VTolerance?: number): { UTolerance: number; VTolerance: number };

// Performs the interpolation of the data points given in the Poles array in the form [1,...,RL][1,...,RC][1...PolesDimension]
static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, InversionProblem?: number): { InversionProblem: number };
static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, InversionProblem?: number): { InversionProblem: number };
static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, InversionProblem?: number): { InversionProblem: number };
static Interpolate(UDegree: number, VDegree: number, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UParameters: NCollection_Array1_double, VParameters: NCollection_Array1_double, Poles: NCollection_Array2_gp_Pnt, InversionProblem?: number): { InversionProblem: number };
// Poles: Mutated in place
// Weights: Mutated in place

// this will multiply a given BSpline numerator N(u,v) and denominator D(u,v) defined by its U/VBSplineDegree and U/VBSplineKnots, and U/VMults
static FunctionMultiply(Function: BSplSLib_EvaluatorFunction, UBSplineDegree: number, VBSplineDegree: number, UBSplineKnots: NCollection_Array1_double, VBSplineKnots: NCollection_Array1_double, UMults: NCollection_Array1_int, VMults: NCollection_Array1_int, Poles: NCollection_Array2_gp_Pnt, Weights: NCollection_Array2_double, UFlatKnots: NCollection_Array1_double, VFlatKnots: NCollection_Array1_double, UNewDegree: number, VNewDegree: number, NewNumerator: NCollection_Array2_gp_Pnt, NewDenominator: NCollection_Array2_double, theStatus?: number): { theStatus: number };
// NewNumerator: Mutated in place
// NewDenominator: Mutated in place

// Returns an `NCollection_Array2<double>` filled with 1.0 values
static UnitWeights(theNbUPoles: number, theNbVPoles: number): NCollection_Array2_double;
// theNbUPoles: number of poles in U direction
// theNbVPoles: number of poles in V direction

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A cache class for Bezier and B-spline surfaces
BSplSLib_Cache: declare class BSplSLib_Cache extends Standard_Transient

constructor

// Verifies validity of the cache using parameters of the point
IsCacheValid(theParameterU: number, theParameterV: number): boolean;
// theParameterU: first parameter of the point placed in the span
// theParameterV: second parameter of the point placed in the span

// Recomputes the cache data
BuildCache(theParameterU: number, theParameterV: number, theFlatKnotsU: NCollection_Array1_double, theFlatKnotsV: NCollection_Array1_double, thePoles: NCollection_Array2_gp_Pnt, theWeights?: NCollection_Array2_double): void;
// theParameterU: the parametric value on the U axis to identify the span
// theParameterV: the parametric value on the V axis to identify the span
// theFlatKnotsU: flat knots of the surface along U axis
// theFlatKnotsV: flat knots of the surface along V axis
// thePoles: array of poles of the surface
// theWeights: array of weights of corresponding poles

// Calculates the point on the surface for specified parameters
D0(theU: number, theV: number, thePoint: gp_Pnt): void;
// theU: first parameter for calculation of the value
// theV: second parameter for calculation of the value
// thePoint: the result of calculation (the point on the surface) Mutated in place

// Calculates the point on the surface and its first derivative
D1(theU: number, theV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec): void;
// theU: first parameter of calculation of the value
// theV: second parameter of calculation of the value
// thePoint: the result of calculation (the point on the surface) Mutated in place
// theTangentU: tangent vector along U axis in the calculated point Mutated in place
// theTangentV: tangent vector along V axis in the calculated point Mutated in place

// Calculates the point on the surface and derivatives till second order
D2(theU: number, theV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec, theCurvatureU: gp_Vec, theCurvatureV: gp_Vec, theCurvatureUV: gp_Vec): void;
// theU: first parameter of calculation of the value
// theV: second parameter of calculation of the value
// thePoint: the result of calculation (the point on the surface) Mutated in place
// theTangentU: tangent vector along U axis in the calculated point Mutated in place
// theTangentV: tangent vector along V axis in the calculated point Mutated in place
// theCurvatureU: curvature vector (2nd derivative on U) along U axis Mutated in place
// theCurvatureV: curvature vector (2nd derivative on V) along V axis Mutated in place
// theCurvatureUV: 2nd mixed derivative on U anv V Mutated in place

// Calculates the point using pre-computed local parameters in [-1, 1] range
D0Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt): void;
// theLocalU: pre-computed local U parameter
// theLocalV: pre-computed local V parameter
// thePoint: the result of calculation (the point on the surface) Mutated in place

// Calculates the point and first derivatives using pre-computed local parameters in [-1, 1] range
D1Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec): void;
// theLocalU: pre-computed local U parameter
// theLocalV: pre-computed local V parameter
// thePoint: the result of calculation (the point on the surface) Mutated in place
// theTangentU: tangent vector along U axis in the calculated point Mutated in place
// theTangentV: tangent vector along V axis in the calculated point Mutated in place

// Calculates the point and derivatives till second order using pre-computed local parameters
D2Local(theLocalU: number, theLocalV: number, thePoint: gp_Pnt, theTangentU: gp_Vec, theTangentV: gp_Vec, theCurvatureU: gp_Vec, theCurvatureV: gp_Vec, theCurvatureUV: gp_Vec): void;
// theLocalU: pre-computed local U parameter
// theLocalV: pre-computed local V parameter
// thePoint: the result of calculation (the point on the surface) Mutated in place
// theTangentU: tangent vector along U axis in the calculated point Mutated in place
// theTangentV: tangent vector along V axis in the calculated point Mutated in place
// theCurvatureU: curvature vector (2nd derivative on U) along U axis Mutated in place
// theCurvatureV: curvature vector (2nd derivative on V) along V axis Mutated in place
// theCurvatureUV: 2nd mixed derivative on U and V Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BSplSLib_EvaluatorFunction: declare class BSplSLib_EvaluatorFunction

// Function evaluation method to be defined by descendant
Evaluate(theDerivativeRequest: number, theUParameter: number, theVParameter: number, theResult: number, theErrorCode: number): { theResult: number; theErrorCode: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
