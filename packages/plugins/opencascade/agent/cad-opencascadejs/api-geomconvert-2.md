# libcascade — GeomConvert (2)

6 top-level symbols. Signatures are verbatim typescript.

GeomConvert_CurveToAnaCurve: declare class GeomConvert_CurveToAnaCurve

constructor

Init(C: Geom_Curve): void;

// Converts me to analytical if possible with given tolerance
ConvertToAnalytical(theTol: number, F: number, L: number, newF?: number, newL?: number): { returnValue: boolean; theResultCurve: Geom_Curve; newF: number; newL: number; [Symbol.dispose](): void };

static ComputeCurve(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf: number, cl: number, theGap: number, theCurvType: GeomConvert_ConvType, theTarget: GeomAbs_CurveType): { returnValue: Geom_Curve; cf: number; cl: number; theGap: number; [Symbol.dispose](): void };

// Tries to convert the given curve to circle with given tolerance
static ComputeCircle(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Curve; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

// Tries to convert the given curve to ellipse with given tolerance
static ComputeEllipse(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Curve; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

// Tries to convert the given curve to line with given tolerance
static ComputeLine(curve: Geom_Curve, tolerance: number, c1: number, c2: number, cf?: number, cl?: number, Deviation?: number): { returnValue: Geom_Line; cf: number; cl: number; Deviation: number; [Symbol.dispose](): void };

// Returns true if the set of points is linear with given tolerance
static IsLinear(aPoints: NCollection_Array1_gp_Pnt, tolerance: number, Deviation?: number): { returnValue: boolean; Deviation: number };

// Creates line on two points
static GetLine(P1: gp_Pnt, P2: gp_Pnt, cf?: number, cl?: number): { returnValue: gp_Lin; cf: number; cl: number; [Symbol.dispose](): void };

// Creates circle on points
static GetCircle(Circ: gp_Circ, P0: gp_Pnt, P1: gp_Pnt, P2: gp_Pnt): boolean;
// Circ: Mutated in place

// Returns maximal deviation of converted surface from the original one computed by last call to ConvertToAnalytical
Gap(): number;

// Returns conversion type
GetConvType(): GeomConvert_ConvType;

// Sets type of conversion
SetConvType(theConvType: GeomConvert_ConvType): void;

// Returns target curve type
GetTarget(): GeomAbs_CurveType;

// Sets target curve type
SetTarget(theTarget: GeomAbs_CurveType): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function for search of Cone canonic parameters
GeomConvert_FuncConeLSDist: declare class GeomConvert_FuncConeLSDist extends math_MultipleVarFunction

constructor

SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

SetDir(theDir: gp_Dir): void;

// Number of variables
NbVariables(): number;

// Value
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function for search of cylinder canonic parameters
GeomConvert_FuncCylinderLSDist: declare class GeomConvert_FuncCylinderLSDist extends math_MultipleVarFunctionWithGradient

constructor

SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

SetDir(theDir: gp_Dir): void;

// Number of variables
NbVariables(): number;

// Value
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Gradient
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// Value and gradient
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function for search of sphere canonic parameters
GeomConvert_FuncSphereLSDist: declare class GeomConvert_FuncSphereLSDist extends math_MultipleVarFunctionWithGradient

constructor

SetPoints(thePoints: NCollection_HArray1_gp_XYZ): void;

// Number of variables
NbVariables(): number;

// Value
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Gradient
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// Value and gradient
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Converts a surface to the analytical form with given precision
GeomConvert_SurfToAnaSurf: declare class GeomConvert_SurfToAnaSurf

constructor

Init(S: Geom_Surface): void;

SetConvType(theConvType?: GeomConvert_ConvType): void;

SetTarget(theSurfType?: GeomAbs_SurfaceType): void;

// Returns maximal deviation of converted surface from the original one computed by last call to ConvertToAnalytical
Gap(): number;

// Tries to convert the Surface to an Analytic form Returns the result In case of failure, returns a Null Handle
ConvertToAnalytical(InitialToler: number): Geom_Surface;
ConvertToAnalytical(InitialToler: number, Umin: number, Umax: number, Vmin: number, Vmax: number): Geom_Surface;
ConvertToAnalytical(InitialToler: number): Geom_Surface;
ConvertToAnalytical(InitialToler: number, Umin: number, Umax: number, Vmin: number, Vmax: number): Geom_Surface;

// Returns true if surfaces is same with the given tolerance
static IsSame(S1: Geom_Surface, S2: Geom_Surface, tol: number): boolean;

// Returns true, if surface is canonical
static IsCanonical(S: Geom_Surface): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class contains conversion methods for 2d geom objects
GeomConvert_Units: declare class GeomConvert_Units

constructor

// Convert 2d curve for change angle unit from radian to degree
static RadianToDegree(theCurve: Geom2d_Curve, theSurface: Geom_Surface, theLengthFactor: number, theFactorRadianDegree: number): Geom2d_Curve;

// Convert 2d curve for change angle unit from degree to radian
static DegreeToRadian(theCurve: Geom2d_Curve, theSurface: Geom_Surface, theLengthFactor: number, theFactorRadianDegree: number): Geom2d_Curve;

// return 2d curve as 'mirror' for given
static MirrorPCurve(theCurve: Geom2d_Curve): Geom2d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
