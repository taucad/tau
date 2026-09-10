# libcascade — BSplCLib

4 top-level symbols. Signatures are verbatim typescript.

// A cache class for Bezier and B-spline curves
BSplCLib_Cache: declare class BSplCLib_Cache extends Standard_Transient

constructor

// Verifies validity of the cache using flat parameter of the point
IsCacheValid(theParameter: number): boolean;
// theParameter: parameter of the point placed in the span

// Recomputes the cache data for 2D curves
BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles2d: NCollection_Array1_gp_Pnt2d, theWeights: NCollection_Array1_double): void;
BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array1_gp_Pnt, theWeights: NCollection_Array1_double): void;
BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles2d: NCollection_Array1_gp_Pnt2d, theWeights: NCollection_Array1_double): void;
BuildCache(theParameter: number, theFlatKnots: NCollection_Array1_double, thePoles: NCollection_Array1_gp_Pnt, theWeights: NCollection_Array1_double): void;
// theParameter: the value on the knot's axis to identify the span
// theFlatKnots: knots of Bezier/B-spline curve (with repetitions)
// thePoles2d: array of poles of 2D curve
// theWeights: array of weights of corresponding poles

// Calculates the point on the curve in the specified parameter
D0(theParameter: number, thePoint: gp_Pnt2d): void;
D0(theParameter: number, thePoint: gp_Pnt): void;
D0(theParameter: number, thePoint: gp_Pnt2d): void;
D0(theParameter: number, thePoint: gp_Pnt): void;
// theParameter: parameter of calculation of the value
// thePoint: the result of calculation (the point on the curve) Mutated in place

// Calculates the point on the curve and its first derivative in the specified parameter
D1(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;
D1(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;
D1(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;
D1(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;
// theParameter: parameter of calculation of the value
// thePoint: the result of calculation (the point on the curve) Mutated in place
// theTangent: tangent vector (first derivatives) for the curve in the calculated point Mutated in place

// Calculates the point on the curve and two derivatives in the specified parameter
D2(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;
D2(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;
D2(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;
D2(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;
// theParameter: parameter of calculation of the value
// thePoint: the result of calculation (the point on the curve) Mutated in place
// theTangent: tangent vector (1st derivatives) for the curve in the calculated point Mutated in place
// theCurvature: curvature vector (2nd derivatives) for the curve in the calculated point Mutated in place

// Calculates the point on the curve and three derivatives in the specified parameter
D3(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;
D3(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;
D3(theParameter: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;
D3(theParameter: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;
// theParameter: parameter of calculation of the value
// thePoint: the result of calculation (the point on the curve) Mutated in place
// theTangent: tangent vector (1st derivatives) for the curve in the calculated point Mutated in place
// theCurvature: curvature vector (2nd derivatives) for the curve in the calculated point Mutated in place
// theTorsion: second curvature vector (3rd derivatives) for the curve in the calculated point Mutated in place

// Calculates the 3D point using pre-computed local parameter in [0, 1] range
D0Local(theLocalParam: number, thePoint: gp_Pnt): void;
D0Local(theLocalParam: number, thePoint: gp_Pnt2d): void;
D0Local(theLocalParam: number, thePoint: gp_Pnt): void;
D0Local(theLocalParam: number, thePoint: gp_Pnt2d): void;
// theLocalParam: pre-computed local parameter
// thePoint: the result of calculation (the point on the curve) Mutated in place

// Calculates the 3D point and first derivative using pre-computed local parameter
D1Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;
D1Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;
D1Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec): void;
D1Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d): void;
// theLocalParam: pre-computed local parameter
// thePoint: the point on the curve Mutated in place
// theTangent: first derivative (tangent vector) Mutated in place

// Calculates the 3D point, first and second derivatives using pre-computed local parameter
D2Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;
D2Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;
D2Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec): void;
D2Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d): void;
// theLocalParam: pre-computed local parameter
// thePoint: the point on the curve Mutated in place
// theTangent: first derivative (tangent vector) Mutated in place
// theCurvature: second derivative (curvature vector) Mutated in place

// Calculates the 3D point, first, second and third derivatives using pre-computed local parameter
D3Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;
D3Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;
D3Local(theLocalParam: number, thePoint: gp_Pnt, theTangent: gp_Vec, theCurvature: gp_Vec, theTorsion: gp_Vec): void;
D3Local(theLocalParam: number, thePoint: gp_Pnt2d, theTangent: gp_Vec2d, theCurvature: gp_Vec2d, theTorsion: gp_Vec2d): void;
// theLocalParam: pre-computed local parameter
// thePoint: the point on the curve Mutated in place
// theTangent: first derivative (tangent vector) Mutated in place
// theCurvature: second derivative (curvature vector) Mutated in place
// theTorsion: third derivative (torsion vector) Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BSplCLib_EvaluatorFunction: declare class BSplCLib_EvaluatorFunction

// Function evaluation method to be defined by descendant
Evaluate(theDerivativeRequest: number, theStartEnd: number, theParameter: number, theResult: number, theErrorCode: number): { theResult: number; theErrorCode: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This enumeration describes the repartition of the knots sequence
BSplCLib_KnotDistribution: typeof BSplCLib_KnotDistribution[keyof typeof BSplCLib_KnotDistribution]

// This enumeration describes the form of the sequence of multiplicities
BSplCLib_MultDistribution: typeof BSplCLib_MultDistribution[keyof typeof BSplCLib_MultDistribution]
