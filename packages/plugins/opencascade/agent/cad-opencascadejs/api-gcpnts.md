# libcascade — GCPnts

10 top-level symbols. Signatures are verbatim typescript.

// Provides an algorithm to compute a point on a curve situated at a given distance from another point on the curve, the distance being measured along the curve (curvilinear abscissa on the curve)
GCPnts_AbscissaPoint: declare class GCPnts_AbscissaPoint

constructor

// Computes the length of the 3D Curve
static Length(theC: Adaptor3d_Curve): number;
static Length(theC: Adaptor2d_Curve2d): number;
static Length(theC: Adaptor3d_Curve, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor3d_Curve): number;
static Length(theC: Adaptor2d_Curve2d): number;
static Length(theC: Adaptor3d_Curve, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor3d_Curve): number;
static Length(theC: Adaptor2d_Curve2d): number;
static Length(theC: Adaptor3d_Curve, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor3d_Curve): number;
static Length(theC: Adaptor2d_Curve2d): number;
static Length(theC: Adaptor3d_Curve, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor3d_Curve): number;
static Length(theC: Adaptor2d_Curve2d): number;
static Length(theC: Adaptor3d_Curve, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor3d_Curve): number;
static Length(theC: Adaptor2d_Curve2d): number;
static Length(theC: Adaptor3d_Curve, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor3d_Curve): number;
static Length(theC: Adaptor2d_Curve2d): number;
static Length(theC: Adaptor3d_Curve, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor3d_Curve): number;
static Length(theC: Adaptor2d_Curve2d): number;
static Length(theC: Adaptor3d_Curve, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theTol: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number): number;
static Length(theC: Adaptor3d_Curve, theU1: number, theU2: number, theTol: number): number;
static Length(theC: Adaptor2d_Curve2d, theU1: number, theU2: number, theTol: number): number;

// True if the computation was successful, False otherwise
IsDone(): boolean;

// Returns the parameter on the curve of the point solution of this algorithm
Parameter(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

GCPnts_AbscissaType: typeof GCPnts_AbscissaType[keyof typeof GCPnts_AbscissaType]

GCPnts_DeflectionType: typeof GCPnts_DeflectionType[keyof typeof GCPnts_DeflectionType]

// The same as class `GCPnts_DistFunction`, but it can be used in minimization algorithms that requires multi variable function
GCPnts_DistFunctionMV: declare class GCPnts_DistFunctionMV extends math_MultipleVarFunction

// Computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Returns the number of variables of the function
NbVariables(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The same as class `GCPnts_DistFunction2d`, but it can be used in minimization algorithms that requires multi variable function
GCPnts_DistFunction2dMV: declare class GCPnts_DistFunction2dMV extends math_MultipleVarFunction

// Computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Returns the number of variables of the function
NbVariables(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides an algorithm to compute a uniform abscissa distribution of points on a curve, i.e
GCPnts_QuasiUniformAbscissa: declare class GCPnts_QuasiUniformAbscissa

constructor

// Initialize the algorithms with 3D curve and target number of points
Initialize(theC: Adaptor3d_Curve, theNbPoints: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number): void;
// theC: input 3D curve
// theNbPoints: defines the number of desired points

// Returns true if the computation was successful
IsDone(): boolean;

// Returns the number of points of the distribution computed by this algorithm
NbPoints(): number;

// Returns the parameter of the point of index Index in the distribution computed by this algorithm
Parameter(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class computes a distribution of points on a curve
GCPnts_QuasiUniformDeflection: declare class GCPnts_QuasiUniformDeflection

constructor

// Initialize the algorithms with 3D curve and deflection
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theContinuity: GeomAbs_Shape): void;

// Returns true if the computation was successful
IsDone(): boolean;

// Returns the number of points of the distribution computed by this algorithm
NbPoints(): number;

// Returns the parameter of the point of index Index in the distribution computed by this algorithm
Parameter(Index: number): number;

// Returns the point of index Index in the distribution computed by this algorithm
Value(Index: number): gp_Pnt;

// Returns the deflection between the curve and the polygon resulting from the points of the distribution computed by this algorithm
Deflection(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes a set of points on a curve from package Adaptor3d such as between two successive points P1(u1)and P2(u2)
GCPnts_TangentialDeflection: declare class GCPnts_TangentialDeflection

constructor

// Initialize algorithm for 3D curve
Initialize(theC: Adaptor3d_Curve, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor3d_Curve, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor2d_Curve2d, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor3d_Curve, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor3d_Curve, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor2d_Curve2d, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor3d_Curve, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor3d_Curve, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor2d_Curve2d, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor3d_Curve, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor3d_Curve, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
Initialize(theC: Adaptor2d_Curve2d, theFirstParameter: number, theLastParameter: number, theAngularDeflection: number, theCurvatureDeflection: number, theMinimumOfPoints: number, theUTol: number, theMinLen: number): void;
// theC: 3d curve
// theAngularDeflection: angular deflection in radians
// theCurvatureDeflection: linear deflection
// theMinimumOfPoints: minimum number of points
// theUTol: tolerance in curve parametric scope
// theMinLen: minimal length

// Add point to already calculated points (or replace existing) Returns index of new added point or founded with parametric tolerance (replaced if theIsReplace is true)
AddPoint(thePnt: gp_Pnt, theParam: number, theIsReplace?: boolean): number;

NbPoints(): number;

Parameter(I: number): number;

Value(I: number): gp_Pnt;

// Computes angular step for the arc using the given parameters
static ArcAngularStep(theRadius: number, theLinearDeflection: number, theAngularDeflection: number, theMinLength: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows to compute a uniform distribution of points on a curve (i.e
GCPnts_UniformAbscissa: declare class GCPnts_UniformAbscissa

constructor

// Initialize the algorithms with 3D curve, Abscissa, and Tolerance
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor3d_Curve, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theAbscissa: number, theU1: number, theU2: number, theToler: number): void;
Initialize(theC: Adaptor2d_Curve2d, theNbPoints: number, theU1: number, theU2: number, theToler: number): void;
// theC: input curve
// theAbscissa: abscissa (distance between two consecutive points)
// theToler: used for more precise calculation of curve length (`Precision::Confusion()` by default)

IsDone(): boolean;

NbPoints(): number;

// returns the computed Parameter of index <Index>
Parameter(Index: number): number;

// Returns the current abscissa, i.e
Abscissa(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides an algorithm to compute a distribution of points on a 'C2' continuous curve
GCPnts_UniformDeflection: declare class GCPnts_UniformDeflection

constructor

// Initialize the algorithms with 3D curve and deflection
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theWithControl: boolean): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theWithControl: boolean): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theWithControl: boolean): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theWithControl: boolean): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theWithControl: boolean): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theWithControl: boolean): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theWithControl: boolean): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theWithControl: boolean): void;
Initialize(theC: Adaptor3d_Curve, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;
Initialize(theC: Adaptor2d_Curve2d, theDeflection: number, theU1: number, theU2: number, theWithControl: boolean): void;

// Returns true if the computation was successful
IsDone(): boolean;

// Returns the number of points of the distribution computed by this algorithm
NbPoints(): number;

// Returns the parameter of the point of index Index in the distribution computed by this algorithm
Parameter(Index: number): number;

// Returns the point of index Index in the distribution computed by this algorithm
Value(Index: number): gp_Pnt;

// Returns the deflection between the curve and the polygon resulting from the points of the distribution computed by this algorithm
Deflection(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
