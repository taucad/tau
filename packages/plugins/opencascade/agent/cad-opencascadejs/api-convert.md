# libcascade — Convert

15 top-level symbols. Signatures are verbatim typescript.

// This algorithm converts a circle into a rational B-spline curve
Convert_CircleToBSplineCurve: declare class Convert_CircleToBSplineCurve extends Convert_ConicToBSplineCurve

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Converts a list of connecting Bezier Curves 2d to a BSplineCurve 2d
Convert_CompBezierCurves2dToBSplineCurve2d: declare class Convert_CompBezierCurves2dToBSplineCurve2d

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An algorithm to convert a sequence of adjacent non-rational Bezier curves into a BSpline curve
Convert_CompBezierCurvesToBSplineCurve: declare class Convert_CompBezierCurvesToBSplineCurve

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Convert a serie of Polynomial N-Dimensional Curves that are have continuity CM to an N-Dimensional Bspline Curve that has continuity CM
Convert_CompPolynomialToPoles: declare class Convert_CompPolynomialToPoles

constructor

// Returns the number of poles of the n-dimensional BSpline
NbPoles(): number;

// Returns the poles of the n-dimensional BSpline in the following format
Poles(): NCollection_Array2_double;

// Returns the degree of the n-dimensional BSpline
Degree(): number;

// Returns the number of knots of the n-dimensional BSpline
NbKnots(): number;

// Returns the knots of the n-dimensional BSpline
Knots(): NCollection_Array1_double;

// Returns the multiplicities of the knots in the BSpline
Multiplicities(): NCollection_Array1_int;

// Returns true if the conversion was successful
IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm converts a bounded Cone into a rational B-spline surface
Convert_ConeToBSplineSurface: declare class Convert_ConeToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for algorithms which convert a conic curve into a BSpline curve (CircleToBSplineCurve, EllipseToBSplineCurve, HyperbolaToBSplineCurve, ParabolaToBSplineCurve)
Convert_ConicToBSplineCurve: declare class Convert_ConicToBSplineCurve

// Returns the degree of the BSpline curve whose data is computed in this framework
Degree(): number;

// Returns the number of poles of the BSpline curve whose data is computed in this framework
NbPoles(): number;

// Returns the number of knots of the BSpline curve whose data is computed in this framework
NbKnots(): number;

// Returns true if the BSpline curve whose data is computed in this framework is periodic
IsPeriodic(): boolean;

// Returns the pole of index Index to the poles table of the BSpline curve whose data is computed in this framework
// DEPRECATED
Pole(theIndex: number): gp_Pnt2d;
// theIndex: pole index (1-based)

// Returns the weight of the pole of index Index to the poles table of the BSpline curve whose data is computed in this framework
// DEPRECATED
Weight(theIndex: number): number;
// theIndex: weight index (1-based)

// Returns the knot of index Index to the knots table of the BSpline curve whose data is computed in this framework
// DEPRECATED
Knot(theIndex: number): number;
// theIndex: knot index (1-based)

// Returns the multiplicity of the knot of index Index to the knots table of the BSpline curve whose data is computed in this framework
// DEPRECATED
Multiplicity(theIndex: number): number;
// theIndex: multiplicity index (1-based)

// Returns the poles of the BSpline curve
Poles(): NCollection_Array1_gp_Pnt2d;

// Returns the weights of the BSpline curve
Weights(): NCollection_Array1_double;

// Returns the knots of the BSpline curve
Knots(): NCollection_Array1_double;

// Returns the multiplicities of the BSpline curve
Multiplicities(): NCollection_Array1_int;

// Legacy API returning handle arrays for compatibility
// DEPRECATED
BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };
BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theUFirst: number, theULast: number, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };
BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };
BuildCosAndSin(theParametrisation: Convert_ParameterisationType, theUFirst: number, theULast: number, theDegree?: number): { theCosNumerator: NCollection_HArray1_double; theSinNumerator: NCollection_HArray1_double; theDenominator: NCollection_HArray1_double; theDegree: number; theKnots: NCollection_HArray1_double; theMults: NCollection_HArray1_int; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm converts a bounded cylinder into a rational B-spline surface
Convert_CylinderToBSplineSurface: declare class Convert_CylinderToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for algorithms which convert an elementary surface (cylinder, cone, sphere or torus) into a BSpline surface
Convert_ElementarySurfaceToBSplineSurface: declare class Convert_ElementarySurfaceToBSplineSurface

// Returns the degree in the U parametric direction
UDegree(): number;

// Returns the degree in the V parametric direction
VDegree(): number;

// Returns the number of poles in the U parametric direction
NbUPoles(): number;

// Returns the number of poles in the V parametric direction
NbVPoles(): number;

// Returns the number of knots in the U parametric direction
NbUKnots(): number;

// Returns the number of knots in the V parametric direction
NbVKnots(): number;

// Returns true if the surface is periodic in the U parametric direction
IsUPeriodic(): boolean;

// Returns true if the surface is periodic in the V parametric direction
IsVPeriodic(): boolean;

// Returns the pole of index (UIndex, VIndex)
// DEPRECATED
Pole(UIndex: number, VIndex: number): gp_Pnt;

// Returns the weight of the pole of index (UIndex, VIndex)
// DEPRECATED
Weight(UIndex: number, VIndex: number): number;

// Returns the U-knot of range UIndex
// DEPRECATED
UKnot(UIndex: number): number;

// Returns the V-knot of range VIndex
// DEPRECATED
VKnot(VIndex: number): number;

// Returns the multiplicity of the U-knot of range UIndex
// DEPRECATED
UMultiplicity(UIndex: number): number;

// Returns the multiplicity of the V-knot of range VIndex
// DEPRECATED
VMultiplicity(VIndex: number): number;

// Returns the poles of the BSpline surface
Poles(): NCollection_Array2_gp_Pnt;

// Returns the weights of the BSpline surface
Weights(): NCollection_Array2_double;

// Returns the U-knots of the BSpline surface
UKnots(): NCollection_Array1_double;

// Returns the V-knots of the BSpline surface
VKnots(): NCollection_Array1_double;

// Returns the U-multiplicities of the BSpline surface
UMultiplicities(): NCollection_Array1_int;

// Returns the V-multiplicities of the BSpline surface
VMultiplicities(): NCollection_Array1_int;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm converts a ellipse into a rational B-spline curve
Convert_EllipseToBSplineCurve: declare class Convert_EllipseToBSplineCurve extends Convert_ConicToBSplineCurve

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Convert a grid of Polynomial Surfaces that are have continuity CM to an Bspline Surface that has continuity CM
Convert_GridPolynomialToPoles: declare class Convert_GridPolynomialToPoles

constructor

// Returns the number of poles in the U parametric direction
NbUPoles(): number;

// Returns the number of poles in the V parametric direction
NbVPoles(): number;

// Returns the poles of the BSpline Surface
Poles(): NCollection_Array2_gp_Pnt;

// Returns the degree in the U parametric direction
UDegree(): number;

// Returns the degree in the V parametric direction
VDegree(): number;

// Returns the number of knots in the U parametric direction
NbUKnots(): number;

// Returns the number of knots in the V parametric direction
NbVKnots(): number;

// Returns the knots in the U direction
UKnots(): NCollection_Array1_double;

// Returns the knots in the V direction
VKnots(): NCollection_Array1_double;

// Returns the multiplicities of the knots in the U direction
UMultiplicities(): NCollection_Array1_int;

// Returns the multiplicities of the knots in the V direction
VMultiplicities(): NCollection_Array1_int;

// Returns true if the conversion was successful
IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm converts a hyperbola into a rational B-spline curve
Convert_HyperbolaToBSplineCurve: declare class Convert_HyperbolaToBSplineCurve extends Convert_ConicToBSplineCurve

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm converts a parabola into a non rational B-spline curve
Convert_ParabolaToBSplineCurve: declare class Convert_ParabolaToBSplineCurve extends Convert_ConicToBSplineCurve

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Identifies a type of parameterization of a circle or ellipse represented as a BSpline curve
Convert_ParameterisationType: typeof Convert_ParameterisationType[keyof typeof Convert_ParameterisationType]

// This algorithm converts a bounded Sphere into a rational B-spline surface
Convert_SphereToBSplineSurface: declare class Convert_SphereToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm converts a bounded Torus into a rational B-spline surface
Convert_TorusToBSplineSurface: declare class Convert_TorusToBSplineSurface extends Convert_ElementarySurfaceToBSplineSurface

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
