# libcascade — GeomLib

12 top-level symbols. Signatures are verbatim typescript.

// Geom Library
GeomLib: declare class GeomLib

constructor

// Computes the curve 3d from package Geom corresponding to curve 2d from package Geom2d, on the plan defined with the local coordinate system Position
static To3d(Position: gp_Ax2, Curve2d: Geom2d_Curve): Geom_Curve;

// Computes the curve 3d from package Geom corresponding to the curve 3d from package Geom, transformed with the transformation <GTrsf> WARNING
static GTransform(Curve: Geom2d_Curve, GTrsf: gp_GTrsf2d): Geom2d_Curve;

// Make the curve Curve2dPtr have the imposed range First to List the most economic way, that is if it can change the range without changing the nature of the curve it will try to do that
static SameRange(Tolerance: number, Curve2dPtr: Geom2d_Curve, First: number, Last: number, RequestedFirst: number, RequestedLast: number): { NewCurve2dPtr: Geom2d_Curve; [Symbol.dispose](): void };

static BuildCurve3d(Tolerance: number, CurvePtr: Adaptor3d_CurveOnSurface, FirstParameter: number, LastParameter: number, MaxDeviation: number, AverageDeviation: number, Continuity: GeomAbs_Shape, MaxDegree: number, MaxSegment: number): { NewCurvePtr: Geom_Curve; MaxDeviation: number; AverageDeviation: number; [Symbol.dispose](): void };

static AdjustExtremity(P1: gp_Pnt, P2: gp_Pnt, T1: gp_Vec, T2: gp_Vec): { Curve: Geom_BoundedCurve; [Symbol.dispose](): void };

// Extends the bounded curve Curve to the point Point
static ExtendCurveToPoint(Point: gp_Pnt, Cont: number, After: boolean): { Curve: Geom_BoundedCurve; [Symbol.dispose](): void };

// Extends the bounded surface Surf along one of its boundaries
static ExtendSurfByLength(Length: number, Cont: number, InU: boolean, After: boolean): { Surf: Geom_BoundedSurface; [Symbol.dispose](): void };

// Compute axes of inertia, of some points <Axe>.Location() is the BaryCentre <Axe>.XDirection is the axe of upper inertia <Axe>.Direction is the Normal to the average plane IsSingular is True if points are on line Tol is used to determine singular cases
static AxeOfInertia(Points: NCollection_Array1_gp_Pnt, Axe: gp_Ax2, IsSingular: boolean, Tol: number): { IsSingular: boolean };
// Axe: Mutated in place

// Compute principale axes of inertia, and dispersion value of some points
static Inertia(Points: NCollection_Array1_gp_Pnt, Bary: gp_Pnt, XDir: gp_Dir, YDir: gp_Dir, Xgap?: number, YGap?: number, ZGap?: number): { Xgap: number; YGap: number; ZGap: number };
// Bary: Mutated in place
// XDir: Mutated in place
// YDir: Mutated in place

// Warning! This assume that the InParameter is an increasing sequence of real number and it will not check for that
static RemovePointsFromArray(NumPoints: number, InParameters: NCollection_Array1_double): { OutParameters: NCollection_HArray1_double; [Symbol.dispose](): void };

// this makes sure that there is at least MinNumPoints in OutParameters taking into account the parameters in the InParameters array provided those are in order, that is the sequence of real in the InParameter is strictly non decreasing
static DensifyArray1OfReal(MinNumPoints: number, InParameters: NCollection_Array1_double): { OutParameters: NCollection_HArray1_double; [Symbol.dispose](): void };

// This method fuse intervals Interval1 and Interval2 with specified Confusion
static FuseIntervals(Interval1: NCollection_Array1_double, Interval2: NCollection_Array1_double, Fusion: NCollection_Sequence_double, Confusion: number, IsAdjustToFirstInterval: boolean): void;
// Interval1: first interval to fuse
// Interval2: second interval to fuse
// Fusion: output interval Mutated in place
// IsAdjustToFirstInterval: flag to set method of fusion, if intervals are close if false, intervals are fusing by half-division method if true, intervals are fusing by selecting value from Interval1

// this will compute the maximum distance at the parameters given in the Parameters array by evaluating each parameter the two curves and taking the maximum of the evaluated distance
static EvalMaxParametricDistance(Curve: Adaptor3d_Curve, AReferenceCurve: Adaptor3d_Curve, Tolerance: number, Parameters: NCollection_Array1_double, MaxDistance?: number): { MaxDistance: number };

// this will compute the maximum distance at the parameters given in the Parameters array by projecting from the Curve to the reference curve and taking the minimum distance Than the maximum will be taken on those minimas
static EvalMaxDistanceAlongParameter(Curve: Adaptor3d_Curve, AReferenceCurve: Adaptor3d_Curve, Tolerance: number, Parameters: NCollection_Array1_double, MaxDistance?: number): { MaxDistance: number };

// Cancel,on the boundaries,the denominator first derivative in the directions wished by the user and set its value to 1
static CancelDenominatorDerivative(UDirection: boolean, VDirection: boolean): { BSurf: Geom_BSplineSurface; [Symbol.dispose](): void };

// Estimate surface normal at the given (U, V) point
static NormEstim(theSurf: Geom_Surface, theUV: gp_Pnt2d, theTol: number, theNorm: gp_Dir): number;
// theSurf: input surface
// theUV: (U, V) point coordinates on the surface
// theTol: estimation tolerance
// theNorm: computed normal Mutated in place

// This method defines if opposite boundaries of surface coincide with given tolerance
static IsClosed(S: Geom_Surface, Tol: number, isUClosed?: boolean, isVClosed?: boolean): { isUClosed: boolean; isVClosed: boolean };

// Returns true if the poles of U1 isoline and the poles of U2 isoline of surface are identical according to tolerance criterion
static IsBSplUClosed(S: Geom_BSplineSurface, U1: number, U2: number, Tol: number): boolean;

// Returns true if the poles of V1 isoline and the poles of V2 isoline of surface are identical according to tolerance criterion
static IsBSplVClosed(S: Geom_BSplineSurface, V1: number, V2: number, Tol: number): boolean;

// Returns true if the poles of U1 isoline and the poles of U2 isoline of surface are identical according to tolerance criterion
static IsBzUClosed(S: Geom_BezierSurface, U1: number, U2: number, Tol: number): boolean;

// Returns true if the poles of V1 isoline and the poles of V2 isoline of surface are identical according to tolerance criterion
static IsBzVClosed(S: Geom_BezierSurface, V1: number, V2: number, Tol: number): boolean;

// Checks whether the 2d curve is a isoline
static isIsoLine(theC2D: Adaptor2d_Curve2d, theIsU?: boolean, theParam?: number, theIsForward?: boolean): { returnValue: boolean; theIsU: boolean; theParam: number; theIsForward: boolean };
// theC2D: Trimmed curve to be checked
// theIsU: Flag indicating that line is u const
// theParam: Line parameter
// theIsForward: Flag indicating forward parameterization on a isoline

// Builds 3D curve for a isoline
static buildC3dOnIsoLine(theC2D: Adaptor2d_Curve2d, theSurf: Adaptor3d_Surface, theFirst: number, theLast: number, theTolerance: number, theIsU: boolean, theParam: number, theIsForward: boolean): Geom_Curve;
// theC2D: Trimmed curve to be approximated
// theIsU: Flag indicating that line is u const
// theParam: Line parameter
// theIsForward: Flag indicating forward parameterization on a isoline

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Checks for the end tangents
GeomLib_Check2dBSplineCurve: declare class GeomLib_Check2dBSplineCurve

constructor

IsDone(): boolean;

NeedTangentFix(FirstFlag?: boolean, SecondFlag?: boolean): { FirstFlag: boolean; SecondFlag: boolean };

FixTangent(FirstFlag: boolean, LastFlag: boolean): void;

// modifies the curve by fixing the first or the last tangencies
FixedTangent(FirstFlag: boolean, LastFlag: boolean): Geom2d_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Checks for the end tangents
GeomLib_CheckBSplineCurve: declare class GeomLib_CheckBSplineCurve

constructor

IsDone(): boolean;

NeedTangentFix(FirstFlag?: boolean, SecondFlag?: boolean): { FirstFlag: boolean; SecondFlag: boolean };

FixTangent(FirstFlag: boolean, LastFlag: boolean): void;

// modifies the curve by fixing the first or the last tangencies
FixedTangent(FirstFlag: boolean, LastFlag: boolean): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the max distance between 3D-curve and 2D-curve in some surface
GeomLib_CheckCurveOnSurface: declare class GeomLib_CheckCurveOnSurface

constructor

// Sets the data for the algorithm
Init(theCurve: Adaptor3d_Curve, theTolRange: number): void;
Init(): void;
Init(theCurve: Adaptor3d_Curve, theTolRange: number): void;
Init(): void;

// Computes the max distance for the 3d curve <myCurve> and 2d curve <theCurveOnSurface> If isMultiThread == true then computation will be performed in parallel
Perform(theCurveOnSurface: Adaptor3d_CurveOnSurface): void;

// Sets parallel flag
SetParallel(theIsParallel: boolean): void;

// Returns true if parallel flag is set
IsParallel(): boolean;

// Returns true if the max distance has been found
IsDone(): boolean;

// Returns error status The possible values are
ErrorStatus(): number;

// Returns max distance
MaxDistance(): number;

// Returns parameter in which the distance is maximal
MaxParameter(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this defines an evaluator for a function of 2 variables that will be used by CancelDenominatorDerivative in one direction
GeomLib_DenominatorMultiplier: declare class GeomLib_DenominatorMultiplier

constructor

// Returns the value of a(UParameter,VParameter)=
Value(UParameter: number, VParameter: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is used to construct a BSpline curve by interpolation of points at given parameters
GeomLib_Interpolate: declare class GeomLib_Interpolate

constructor

// returns if everything went OK
IsDone(): boolean;

// returns the error type if any
Error(): GeomLib_InterpolationErrors;

// returns the interpolated curve of the requested degree
Curve(): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// in case the interpolation errors out, this tells what happened
GeomLib_InterpolationErrors: typeof GeomLib_InterpolationErrors[keyof typeof GeomLib_InterpolationErrors]

// Find if a surface is a planar surface
GeomLib_IsPlanarSurface: declare class GeomLib_IsPlanarSurface

constructor

// Return if the Surface is a plan
IsPlanar(): boolean;

// Return the plan definition
Plan(): gp_Pln;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GeomLib_LogSample: declare class GeomLib_LogSample extends math_FunctionSample

constructor

// Returns the value of parameter of the point of range Index
GetParameter(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class is used to construct the BSpline curve from an Approximation (ApproxAFunction from AdvApprox)
GeomLib_MakeCurvefromApprox: declare class GeomLib_MakeCurvefromApprox

constructor

IsDone(): boolean;

// returns the number of 1D spaces of the Approx
Nb1DSpaces(): number;

// returns the number of 3D spaces of the Approx
Nb2DSpaces(): number;

// returns the number of 3D spaces of the Approx
Nb3DSpaces(): number;

// returns a polynomial curve whose poles correspond to the Index2d 2D space if Index2d not in the Range [1,Nb2dSpaces] if the Approx is not Done returns a rational curve whose poles correspond to the index2d of the 2D space and whose weights correspond to one dimensional space of index 1d if Index1d not in the Range [1,Nb1dSpaces] if Index2d not in the Range [1,Nb2dSpaces] if the Approx is not Done
Curve2d(Index2d: number): Geom2d_BSplineCurve;
Curve2d(Index1d: number, Index2d: number): Geom2d_BSplineCurve;
Curve2d(Index2d: number): Geom2d_BSplineCurve;
Curve2d(Index1d: number, Index2d: number): Geom2d_BSplineCurve;

// returns a 2D curve building it from the 1D curve in x at Index1d and y at Index2d amongst the 1D curves if Index1d not in the Range [1,Nb1dSpaces] if Index2d not in the Range [1,Nb1dSpaces] if the Approx is not Done
Curve2dFromTwo1d(Index1d: number, Index2d: number): Geom2d_BSplineCurve;

// returns a polynomial curve whose poles correspond to the Index3D 3D space if Index3D not in the Range [1,Nb3dSpaces] if the Approx is not Done returns a rational curve whose poles correspond to the index3D of the 3D space and whose weights correspond to the index1d 1D space
Curve(Index3d: number): Geom_BSplineCurve;
Curve(Index1D: number, Index3D: number): Geom_BSplineCurve;
Curve(Index3d: number): Geom_BSplineCurve;
Curve(Index1D: number, Index3D: number): Geom_BSplineCurve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Polynomial Function
GeomLib_PolyFunc: declare class GeomLib_PolyFunc extends math_FunctionWithDerivative

constructor

// computes the value <F>of the function for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// computes the value <F> and the derivative <D> of the function for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides various methods with Geom2d and Geom curves and surfaces
GeomLib_Tool: declare class GeomLib_Tool

constructor

// Extracts the parameter of a 3D point lying on a 3D curve or at a distance less than the MaxDist value
static Parameter(Curve: Geom_Curve, Point: gp_Pnt, MaxDist: number, U: number): { returnValue: boolean; U: number };
static Parameter(Curve: Geom2d_Curve, Point: gp_Pnt2d, MaxDist: number, U: number): { returnValue: boolean; U: number };
static Parameter(Curve: Geom_Curve, Point: gp_Pnt, MaxDist: number, U: number): { returnValue: boolean; U: number };
static Parameter(Curve: Geom2d_Curve, Point: gp_Pnt2d, MaxDist: number, U: number): { returnValue: boolean; U: number };

// Extracts the parameter of a 3D point lying on a surface or at a distance less than the MaxDist value
static Parameters(Surface: Geom_Surface, Point: gp_Pnt, MaxDist: number, U?: number, V?: number): { returnValue: boolean; U: number; V: number };

// Computes parameter in theCurve (\*thePrmOnCurve) where maximal deviation between theCurve and the linear segment joining its points with the parameters theFPar and theLPar is obtained
static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theStartParameter: number, theNbIters: number, thePrmOnCurve: number, thePtOnCurve: gp_Pnt2d, theVecCurvLine: gp_Vec2d, theLine: gp_Lin2d): number;
static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theNbSubIntervals: number, theNbIters: number, thePrmOnCurve: number): number;
static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theStartParameter: number, theNbIters: number, thePrmOnCurve: number, thePtOnCurve: gp_Pnt2d, theVecCurvLine: gp_Vec2d, theLine: gp_Lin2d): number;
static ComputeDeviation(theCurve: Geom2dAdaptor_Curve, theFPar: number, theLPar: number, theNbSubIntervals: number, theNbIters: number, thePrmOnCurve: number): number;
// thePrmOnCurve: the parameter of thePtOnCurve
// thePtOnCurve: the point on curve where maximal deviation is achieved
// theVecCurvLine: the vector along which is computed (this vector is always perpendicular theLine)
// theLine: the linear segment joining the point of theCurve having parameters theFPar and theLPar

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
