# libcascade — CPnts

4 top-level symbols. Signatures are verbatim typescript.

// the algorithm computes a point on a curve at a given distance from another point on the curve
CPnts_AbscissaPoint: declare class CPnts_AbscissaPoint

constructor

// Computes the length of the Curve `.` Computes the length of the Curve `with the given tolerance.` Computes the length of the Curve `between <U1> and <U2>.` Computes the length of the Curve `between <U1> and <U2> with the given tolerance.` Computes the length of the Curve `between <U1> and <U2> with the given tolerance
static Length(C: Adaptor3d_Curve): number;
static Length(C: Adaptor2d_Curve2d): number;
static Length(C: Adaptor3d_Curve, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, Tol: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor3d_Curve): number;
static Length(C: Adaptor2d_Curve2d): number;
static Length(C: Adaptor3d_Curve, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, Tol: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor3d_Curve): number;
static Length(C: Adaptor2d_Curve2d): number;
static Length(C: Adaptor3d_Curve, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, Tol: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor3d_Curve): number;
static Length(C: Adaptor2d_Curve2d): number;
static Length(C: Adaptor3d_Curve, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, Tol: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor3d_Curve): number;
static Length(C: Adaptor2d_Curve2d): number;
static Length(C: Adaptor3d_Curve, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, Tol: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor3d_Curve): number;
static Length(C: Adaptor2d_Curve2d): number;
static Length(C: Adaptor3d_Curve, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, Tol: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor3d_Curve): number;
static Length(C: Adaptor2d_Curve2d): number;
static Length(C: Adaptor3d_Curve, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, Tol: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor3d_Curve): number;
static Length(C: Adaptor2d_Curve2d): number;
static Length(C: Adaptor3d_Curve, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, Tol: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number): number;
static Length(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): number;
static Length(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): number;

// Initializes the resolution function with `.` Initializes the resolution function with `between U1 and U2.`
Init(C: Adaptor3d_Curve): void;
Init(C: Adaptor2d_Curve2d): void;
Init(C: Adaptor3d_Curve, Tol: number): void;
Init(C: Adaptor2d_Curve2d, Tol: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor3d_Curve): void;
Init(C: Adaptor2d_Curve2d): void;
Init(C: Adaptor3d_Curve, Tol: number): void;
Init(C: Adaptor2d_Curve2d, Tol: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor3d_Curve): void;
Init(C: Adaptor2d_Curve2d): void;
Init(C: Adaptor3d_Curve, Tol: number): void;
Init(C: Adaptor2d_Curve2d, Tol: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor3d_Curve): void;
Init(C: Adaptor2d_Curve2d): void;
Init(C: Adaptor3d_Curve, Tol: number): void;
Init(C: Adaptor2d_Curve2d, Tol: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor3d_Curve): void;
Init(C: Adaptor2d_Curve2d): void;
Init(C: Adaptor3d_Curve, Tol: number): void;
Init(C: Adaptor2d_Curve2d, Tol: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor3d_Curve): void;
Init(C: Adaptor2d_Curve2d): void;
Init(C: Adaptor3d_Curve, Tol: number): void;
Init(C: Adaptor2d_Curve2d, Tol: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor3d_Curve): void;
Init(C: Adaptor2d_Curve2d): void;
Init(C: Adaptor3d_Curve, Tol: number): void;
Init(C: Adaptor2d_Curve2d, Tol: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor3d_Curve): void;
Init(C: Adaptor2d_Curve2d): void;
Init(C: Adaptor3d_Curve, Tol: number): void;
Init(C: Adaptor2d_Curve2d, Tol: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number): void;
Init(C: Adaptor3d_Curve, U1: number, U2: number, Tol: number): void;
Init(C: Adaptor2d_Curve2d, U1: number, U2: number, Tol: number): void;

// Computes the point at the distance <Abscissa> of the curve
Perform(Abscissa: number, U0: number, Resolution: number): void;
Perform(Abscissa: number, U0: number, Ui: number, Resolution: number): void;
Perform(Abscissa: number, U0: number, Resolution: number): void;
Perform(Abscissa: number, U0: number, Ui: number, Resolution: number): void;

// Computes the point at the distance <Abscissa> of the curve
AdvPerform(Abscissa: number, U0: number, Ui: number, Resolution: number): void;

// True if the computation was successful, False otherwise
IsDone(): boolean;

// Returns the parameter of the solution
Parameter(): number;

// Enforce the solution, used by GCPnts
SetParameter(P: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// for implementation, compute values for Gauss
CPnts_MyGaussFunction: declare class CPnts_MyGaussFunction extends math_Function

constructor

// Computes the value of the function <F> for a given value of variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements a function for the Newton algorithm to find the solution of Integral(F) = L (compute Length and Derivative of the curve for Newton)
CPnts_MyRootFunction: declare class CPnts_MyRootFunction extends math_FunctionWithDerivative

constructor

// We want to solve Integral(X0,X,F(X,D)) = L
Init(X0: number, L: number): void;
Init(X0: number, L: number, Tol: number): void;
Init(X0: number, L: number): void;
Init(X0: number, L: number, Tol: number): void;

// This is Integral(X0,X,F(X,D)) - L
Value(X: number, F: number): { returnValue: boolean; F: number };

// This is F(X,D)
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value <F> and the derivative <D> of the function for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines an algorithm to create a set of points (with a given chordal deviation) at the positions of constant deflection of a given parametrized curve or a trimmed circle
CPnts_UniformDeflection: declare class CPnts_UniformDeflection

constructor

// Initialize the algorithms with `, <Deflection>, <UStep>, <Resolution> and <WithControl>` Initialize the algorithms with `, <Deflection>, <UStep>, <U1>, <U2> and <WithControl>`
Initialize(C: Adaptor3d_Curve, Deflection: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor2d_Curve2d, Deflection: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor3d_Curve, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor2d_Curve2d, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor3d_Curve, Deflection: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor2d_Curve2d, Deflection: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor3d_Curve, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor2d_Curve2d, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor3d_Curve, Deflection: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor2d_Curve2d, Deflection: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor3d_Curve, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor2d_Curve2d, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor3d_Curve, Deflection: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor2d_Curve2d, Deflection: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor3d_Curve, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;
Initialize(C: Adaptor2d_Curve2d, Deflection: number, U1: number, U2: number, Resolution: number, WithControl: boolean): void;

// To know if all the calculus were done successfully (ie all the points have been computed)
IsAllDone(): boolean;

// go to the next Point
Next(): void;

// returns True if it exists a next Point
More(): boolean;

// return the computed parameter
Value(): number;

// return the computed parameter
Point(): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
