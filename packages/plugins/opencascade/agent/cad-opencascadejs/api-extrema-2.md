# libcascade — Extrema (2)

25 top-level symbols. Signatures are verbatim typescript.

// It calculates all the extremum (minimum and maximum) distances between a point and a linear extrusion surface
Extrema_ExtPExtS: declare class Extrema_ExtPExtS extends Standard_Transient

constructor

// Initializes the fields of the algorithm
Initialize(S: GeomAdaptor_SurfaceOfLinearExtrusion, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolU: number, TolV: number): void;

Perform(P: gp_Pnt): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
Point(N: number): Extrema_POnSurf;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the extremum (minimum and maximum) distances between a point and a surface of revolution
Extrema_ExtPRevS: declare class Extrema_ExtPRevS extends Standard_Transient

constructor

Initialize(S: GeomAdaptor_SurfaceOfRevolution, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number): void;

Perform(P: gp_Pnt): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
Point(N: number): Extrema_POnSurf;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the extremum distances between a point and a surface
Extrema_ExtPS: declare class Extrema_ExtPS

constructor

// Initializes the fields of the algorithm
Initialize(S: Adaptor3d_Surface, Uinf: number, Usup: number, Vinf: number, Vsup: number, TolU: number, TolV: number): void;

// Computes the distances
Perform(P: gp_Pnt): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
Point(N: number): Extrema_POnSurf;

// if the surface is a trimmed surface, dUfVf is a square distance between
TrimmedSquareDistances(dUfVf: number, dUfVl: number, dUlVf: number, dUlVl: number, PUfVf: gp_Pnt, PUfVl: gp_Pnt, PUlVf: gp_Pnt, PUlVl: gp_Pnt): { dUfVf: number; dUfVl: number; dUlVf: number; dUlVl: number };
// PUfVf: Mutated in place
// PUfVl: Mutated in place
// PUlVf: Mutated in place
// PUlVl: Mutated in place

SetFlag(F: Extrema_ExtFlag): void;

SetAlgo(A: Extrema_ExtAlgo): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the extremum distances between two surfaces
Extrema_ExtSS: declare class Extrema_ExtSS

constructor

// Initializes the fields of the algorithm
Initialize(S2: Adaptor3d_Surface, Uinf2: number, Usup2: number, Vinf2: number, Vsup2: number, TolS1: number): void;

// Computes the distances
Perform(S1: Adaptor3d_Surface, Uinf1: number, Usup1: number, Vinf1: number, Vsup1: number, TolS1: number): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns True if the surfaces are parallel
IsParallel(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
Points(N: number, P1: Extrema_POnSurf, P2: Extrema_POnSurf): void;
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function to find extrema of the distance between a curve and a surface
Extrema_FuncExtCS: declare class Extrema_FuncExtCS extends math_FunctionSetWithDerivatives

constructor

// sets the field mysurf of the function
Initialize(C: Adaptor3d_Curve, S: Adaptor3d_Surface): void;

// Returns the number of variables of the function
NbVariables(): number;

// Returns the number of equations of the function
NbEquations(): number;

// Calculation of Fi(U,V)
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Calculation of Fi'(U,V)
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Calculation of Fi(U,V) and Fi'(U,V)
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Save the found extremum
GetStateNumber(): number;

// Return the number of found extrema
NbExt(): number;

// Return the value of the Nth distance
SquareDistance(N: number): number;

// Returns the Nth extremum on C
PointOnCurve(N: number): Extrema_POnCurv;

// Return the Nth extremum on S
PointOnSurface(N: number): Extrema_POnSurf;

// Change Sequence of SquareDistance
SquareDistances(): NCollection_Sequence_double;

// Change Sequence of PointOnCurv
PointsOnCurve(): NCollection_Sequence_Extrema_POnCurv;

// Change Sequence of PointOnSurf
PointsOnSurf(): NCollection_Sequence_Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Function to find extrema of the distance between two surfaces
Extrema_FuncExtSS: declare class Extrema_FuncExtSS extends math_FunctionSetWithDerivatives

constructor

// sets the field mysurf of the function
Initialize(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface): void;

// Returns the number of variables of the function
NbVariables(): number;

// Returns the number of equations of the function
NbEquations(): number;

// Calculate Fi(U,V)
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Calculate Fi'(U,V)
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Calculate Fi(U,V) and Fi'(U,V)
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Save the found extremum
GetStateNumber(): number;

// Return the number of found extrema
NbExt(): number;

// Return the value of the Nth distance
SquareDistance(N: number): number;

// Return the Nth extremum on S1
PointOnS1(N: number): Extrema_POnSurf;

// Renvoie le Nieme extremum sur S2
PointOnS2(N: number): Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Functional for search of extremum of the square Euclidean distance between point P and surface S, starting from approximate solution (u0, v0)
Extrema_FuncPSDist: declare class Extrema_FuncPSDist extends math_MultipleVarFunctionWithGradient

constructor

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

// Functional for search of extremum of the distance between point P and surface S, starting from approximate solution (u0, v0)
Extrema_FuncPSNorm: declare class Extrema_FuncPSNorm extends math_FunctionSetWithDerivatives

constructor

// sets the field mysurf of the function
Initialize(S: Adaptor3d_Surface): void;

// sets the field mysurf of the function
SetPoint(P: gp_Pnt): void;

// Returns the number of variables of the function
NbVariables(): number;

// Returns the number of equations of the function
NbEquations(): number;

// Calculate Fi(U,V)
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Calculate Fi'(U,V)
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// Calculate Fi(U,V) and Fi'(U,V)
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Save the found extremum
GetStateNumber(): number;

// Return the number of found extrema
NbExt(): number;

// Return the value of the Nth distance
SquareDistance(N: number): number;

// Returns the Nth extremum
Point(N: number): Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the extremum distances between acurve and a surface
Extrema_GenExtCS: declare class Extrema_GenExtCS

constructor

Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, Tol2: number): void;
Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, Tol2: number): void;

// the algorithm is done with S An exception is raised if the fields have not been initialized
Perform(C: Adaptor3d_Curve, NbT: number, Tol1: number): void;
Perform(C: Adaptor3d_Curve, NbT: number, tmin: number, tsup: number, Tol1: number): void;
Perform(C: Adaptor3d_Curve, NbT: number, Tol1: number): void;
Perform(C: Adaptor3d_Curve, NbT: number, tmin: number, tsup: number, Tol1: number): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
PointOnCurve(N: number): Extrema_POnCurv;

// Returns the point of the Nth resulting distance
PointOnSurface(N: number): Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the extremum distances between a point and a surface
Extrema_GenExtPS: declare class Extrema_GenExtPS

constructor

Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, TolU: number, TolV: number): void;
Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number): void;
Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, TolU: number, TolV: number): void;
Initialize(S: Adaptor3d_Surface, NbU: number, NbV: number, Umin: number, Usup: number, Vmin: number, Vsup: number, TolU: number, TolV: number): void;

// the algorithm is done with the point P
Perform(P: gp_Pnt): void;

SetFlag(F: Extrema_ExtFlag): void;

SetAlgo(A: Extrema_ExtAlgo): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
Point(N: number): Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates all the extremum distances between two surfaces
Extrema_GenExtSS: declare class Extrema_GenExtSS

constructor

Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, U2min: number, U2sup: number, V2min: number, V2sup: number, Tol2: number): void;
Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, Tol2: number): void;
Initialize(S2: Adaptor3d_Surface, NbU: number, NbV: number, U2min: number, U2sup: number, V2min: number, V2sup: number, Tol2: number): void;

// the algorithm is done with S1 An exception is raised if the fields have not been initialized
Perform(S1: Adaptor3d_Surface, Tol1: number): void;
Perform(S1: Adaptor3d_Surface, U1min: number, U1sup: number, V1min: number, V1sup: number, Tol1: number): void;
Perform(S1: Adaptor3d_Surface, Tol1: number): void;
Perform(S1: Adaptor3d_Surface, U1min: number, U1sup: number, V1min: number, V1sup: number, Tol1: number): void;

// Returns True if the distances are found
IsDone(): boolean;

// Returns the number of extremum distances
NbExt(): number;

// Returns the value of the Nth resulting square distance
SquareDistance(N: number): number;

// Returns the point of the Nth resulting distance
PointOnS1(N: number): Extrema_POnSurf;

// Returns the point of the Nth resulting distance
PointOnS2(N: number): Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// With two close points it calculates the distance between two surfaces
Extrema_GenLocateExtCS: declare class Extrema_GenLocateExtCS

constructor

Perform(C: Adaptor3d_Curve, S: Adaptor3d_Surface, T: number, U: number, V: number, Tol1: number, Tol2: number): void;

// Returns True if the distance is found
IsDone(): boolean;

// Returns the value of the extremum square distance
SquareDistance(): number;

// Returns the point of the extremum distance on C
PointOnCurve(): Extrema_POnCurv;

// Returns the point of the extremum distance on S
PointOnSurface(): Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// With a close point, it calculates the distance between a point and a surface
Extrema_GenLocateExtPS: declare class Extrema_GenLocateExtPS

constructor

// Calculates the extrema between the point and the surface using a close point
Perform(theP: gp_Pnt, theU0: number, theV0: number, isDistanceCriteria?: boolean): void;

// Returns True if the distance is found
IsDone(): boolean;

// Returns the value of the extremum square distance
SquareDistance(): number;

// Returns the point of the extremum distance
Point(): Extrema_POnSurf;

// Returns True if UV point theU0, theV0 is point of local minimum of square distance between point theP and points theS(U, V), U, V are in small area around theU0, theV0
static IsMinDist(theP: gp_Pnt, theS: Adaptor3d_Surface, theU0: number, theV0: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// With two close points it calculates the distance between two surfaces
Extrema_GenLocateExtSS: declare class Extrema_GenLocateExtSS

constructor

Perform(S1: Adaptor3d_Surface, S2: Adaptor3d_Surface, U1: number, V1: number, U2: number, V2: number, Tol1: number, Tol2: number): void;

// Returns True if the distance is found
IsDone(): boolean;

// Returns the value of the extremum square distance
SquareDistance(): number;

// Returns the point of the extremum distance on S1
PointOnS1(): Extrema_POnSurf;

// Returns the point of the extremum distance on S2
PointOnS2(): Extrema_POnSurf;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements function which calculate Eucluidean distance between point on curve and point on other curve in case of C1 and C2 continuity is C0
Extrema_GlobOptFuncCCC0: declare class Extrema_GlobOptFuncCCC0 extends math_MultipleVarFunction

constructor

// Returns the number of variables of the function
NbVariables(): number;

// Computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements function which calculate Eucluidean distance between point on curve and point on other curve in case of C1 and C2 continuity is C1
Extrema_GlobOptFuncCCC1: declare class Extrema_GlobOptFuncCCC1 extends math_MultipleVarFunctionWithGradient

constructor

// Returns the number of variables of the function
NbVariables(): number;

// Computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Computes the gradient <G> of the functions for the variable <X>
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// computes the value <F> and the gradient <G> of the functions for the variable <X>
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements function which calculate Eucluidean distance between point on curve and point on other curve in case of C1 and C2 continuity is C2
Extrema_GlobOptFuncCCC2: declare class Extrema_GlobOptFuncCCC2 extends math_MultipleVarFunctionWithHessian

constructor

// returns the number of variables of the function
NbVariables(): number;

// computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// computes the gradient <G> of the functions for the variable <X>
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// computes the value <F> and the gradient <G> of the functions for the variable <X>
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements function which calculate square Eucluidean distance between point on surface and nearest point on Conic
Extrema_GlobOptFuncCQuadric: declare class Extrema_GlobOptFuncCQuadric extends math_MultipleVarFunction

constructor

LoadQuad(S: Adaptor3d_Surface, theUf: number, theUl: number, theVf: number, theVl: number): void;

// Returns the number of variables of the function
NbVariables(): number;

// Computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Parameters of quadric for point on curve defined by theCT
QuadricParameters(theCT: math_VectorBase_double, theUV: math_VectorBase_double): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements function which calculate square Eucluidean distance between point on curve and point on surface in case of continuity is C2
Extrema_GlobOptFuncCS: declare class Extrema_GlobOptFuncCS extends math_MultipleVarFunctionWithHessian

constructor

// returns the number of variables of the function
NbVariables(): number;

// computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// computes the gradient <G> of the functions for the variable <X>
Gradient(X: math_VectorBase_double, G: math_VectorBase_double): boolean;

// computes the value <F> and the gradient <G> of the functions for the variable <X>
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double): { returnValue: boolean; F: number };
Values(X: math_VectorBase_double, F: number, G: math_VectorBase_double, H: math_Matrix): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements function which calculate square Eucluidean distance between point on surface and nearest point on Conic
Extrema_GlobOptFuncConicS: declare class Extrema_GlobOptFuncConicS extends math_MultipleVarFunction

constructor

LoadConic(S: Adaptor3d_Curve, theTf: number, theTl: number): void;

// Returns the number of variables of the function
NbVariables(): number;

// Computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// Parameter of conic for point on surface defined by theUV
ConicParameter(theUV: math_VectorBase_double): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates the distance between two curves with a close point
Extrema_LocateExtCC: declare class Extrema_LocateExtCC

constructor

// Returns True if the distance is found
IsDone(): boolean;

// Returns the value of the extremum square distance
SquareDistance(): number;

// Returns the points of the extremum distance
Point(P1: Extrema_POnCurv, P2: Extrema_POnCurv): void;
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// It calculates the distance between two curves with a close point
Extrema_LocateExtCC2d: declare class Extrema_LocateExtCC2d

constructor

// Returns True if the distance is found
IsDone(): boolean;

// Returns the value of the extremum square distance
SquareDistance(): number;

// Returns the points of the extremum distance
Point(P1: Extrema_POnCurv2d, P2: Extrema_POnCurv2d): void;
// P1: Mutated in place
// P2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of a point on curve
Extrema_POnCurv: declare class Extrema_POnCurv

constructor

// Sets the point and parameter values
SetValues(theU: number, theP: gp_Pnt): void;

// Returns the point
Value(): gp_Pnt;

// Returns the parameter on the curve
Parameter(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of a point on 2D curve
Extrema_POnCurv2d: declare class Extrema_POnCurv2d

constructor

// Sets the point and parameter values
SetValues(theU: number, theP: gp_Pnt2d): void;

// Returns the point
Value(): gp_Pnt2d;

// Returns the parameter on the curve
Parameter(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of a point on surface
Extrema_POnSurf: declare class Extrema_POnSurf

constructor

// Returns the 3d point
Value(): gp_Pnt;

// Sets the params of current POnSurf instance
SetParameters(theU: number, theV: number, thePnt: gp_Pnt): void;

// Returns the parameter values on the surface
Parameter(theU?: number, theV?: number): { theU: number; theV: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
