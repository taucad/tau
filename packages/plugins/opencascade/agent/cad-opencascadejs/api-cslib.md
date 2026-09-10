# libcascade — CSLib

6 top-level symbols. Signatures are verbatim typescript.

// Provides functions for basic geometric computation on curves and surfaces
CSLib: declare class CSLib

constructor

// Computes the derivative of order (theNu, theNv) of the non-normalized normal vector
static DNNUV(theNu: number, theNv: number, theDerSurf: NCollection_Array2_gp_Vec): gp_Vec;
static DNNUV(theNu: number, theNv: number, theDerSurf1: NCollection_Array2_gp_Vec, theDerSurf2: NCollection_Array2_gp_Vec): gp_Vec;
static DNNUV(theNu: number, theNv: number, theDerSurf: NCollection_Array2_gp_Vec): gp_Vec;
static DNNUV(theNu: number, theNv: number, theDerSurf1: NCollection_Array2_gp_Vec, theDerSurf2: NCollection_Array2_gp_Vec): gp_Vec;
// theNu: Derivative order in U direction
// theNv: Derivative order in V direction
// theDerSurf: Surface derivatives array where theDerSurf(i,j) = d^(i+j)S/(du^i \* dv^j) for i = 0..theNu+1, j = 0..theNv+1

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Low-level algorithm for 2D point-in-polygon classification
CSLib_Class2d: declare class CSLib_Class2d

constructor

// Classifies a point relative to the polygon
SiDans(thePoint: gp_Pnt2d): CSLib_Class2d_Result;
// thePoint: The 2D point to classify

// Classifies a point with explicit ON tolerance
SiDans_OnMode(thePoint: gp_Pnt2d, theTol: number): CSLib_Class2d_Result;
// thePoint: The 2D point to classify
// theTol: Tolerance for boundary detection

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Classification result for point-in-polygon tests
CSLib_Class2d_Result: typeof CSLib_Class2d_Result[keyof typeof CSLib_Class2d_Result]

// Status of surface derivatives computation for normal calculation
CSLib_DerivativeStatus: typeof CSLib_DerivativeStatus[keyof typeof CSLib_DerivativeStatus]

// Polynomial definition for surface normal computation at singular points
CSLib_NormalPolyDef: declare class CSLib_NormalPolyDef extends math_FunctionWithDerivative

constructor

// Computes the value of the function for the given variable
Value(X: number, F: number): { returnValue: boolean; F: number };
// X: Input variable (angle in radians)
// F: Computed function value

// Computes the derivative of the function for the given variable
Derivative(X: number, D: number): { returnValue: boolean; D: number };
// X: Input variable (angle in radians)
// D: Computed derivative value

// Computes both the value and derivative of the function
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };
// X: Input variable (angle in radians)
// F: Computed function value
// D: Computed derivative value

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Status of surface normal computation
CSLib_NormalStatus: typeof CSLib_NormalStatus[keyof typeof CSLib_NormalStatus]
