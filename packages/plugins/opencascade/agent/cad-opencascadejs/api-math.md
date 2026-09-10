# libcascade — math

20 top-level symbols. Signatures are verbatim typescript.

math: declare class math

constructor

static GaussPointsMax(): number;

static GaussPoints(Index: number, Points: math_VectorBase_double): void;

static GaussWeights(Index: number, Weights: math_VectorBase_double): void;

// Returns the maximal number of points for that the values are stored in the table
static KronrodPointsMax(): number;

// Returns a vector of Gauss points and a vector of their weights
static OrderedGaussPointsAndWeights(Index: number, Points: math_VectorBase_double, Weights: math_VectorBase_double): boolean;

// Returns a vector of Kronrod points and a vector of their weights for Gauss-Kronrod computation method
static KronrodPointsAndWeights(Index: number, Points: math_VectorBase_double, Weights: math_VectorBase_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the Broyden-Fletcher-Goldfarb-Shanno variant of Davidson-Fletcher-Powell minimization algorithm of a function of multiple variables.Knowledge of the function's gradient is required
math_BFGS: declare class math_BFGS

constructor

// Set boundaries for conditional optimization
SetBoundary(theLeftBorder: math_VectorBase_double, theRightBorder: math_VectorBase_double): void;

// Given the starting point StartingPoint, minimization is done on the function F
Perform(F: math_MultipleVarFunctionWithGradient, StartingPoint: math_VectorBase_double): void;

// This method is called at the end of each iteration to check if the solution is found
IsSolutionReached(F: math_MultipleVarFunctionWithGradient): boolean;

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// returns the location vector of the minimum
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;

// returns the value of the minimum
Minimum(): number;

// Returns the gradient vector at the minimum
Gradient(): math_VectorBase_double;
Gradient(Grad: math_VectorBase_double): void;
Gradient(): math_VectorBase_double;
Gradient(Grad: math_VectorBase_double): void;

// Returns the number of iterations really done in the calculation of the minimum
NbIterations(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements a combination of Newton-Raphson and bissection methods to find the root of the function between two bounds
math_BissecNewton: declare class math_BissecNewton

constructor

// A combination of Newton-Raphson and bissection methods is done to find the root of the function F between the bounds Bound1 and Bound2 on the function F
Perform(F: math_FunctionWithDerivative, Bound1: number, Bound2: number, NbIterations?: number): void;

// This method is called at the end of each iteration to check if the solution has been found
IsSolutionReached(theFunction: math_FunctionWithDerivative): boolean;

// Tests is the root has been successfully found
IsDone(): boolean;

// returns the value of the root
Root(): number;

// returns the value of the derivative at the root
Derivative(): number;

// returns the value of the function at the root
Value(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Given two distinct initial points, BracketMinimum implements the computation of three points (a, b, c) which bracket the minimum of the function and verify A less than B, B less than C and F(B) less than F(A), F(B) less than F(C)
math_BracketMinimum: declare class math_BracketMinimum

constructor

// Set limits of the parameter
SetLimits(theLeft: number, theRight: number): void;

// Set function value at A
SetFA(theValue: number): void;

// Set function value at B
SetFB(theValue: number): void;

// The method performing the job
Perform(F: math_Function): void;

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Returns the bracketed triplet of abscissae
Values(A?: number, B?: number, C?: number): { A: number; B: number; C: number };

// returns the bracketed triplet function values
FunctionValues(FA?: number, FB?: number, FC?: number): { FA: number; FB: number; FC: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the Brent method to find the root of a function located within two bounds
math_BracketedRoot: declare class math_BracketedRoot

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// returns the value of the root
Root(): number;

// returns the value of the function at the root
Value(): number;

// returns the number of iterations really done during the computation of the Root
NbIterations(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the Brent's method to find the minimum of a function of a single variable
math_BrentMinimum: declare class math_BrentMinimum

constructor

// Brent minimization is performed on function F from a given bracketing triplet of abscissas Ax, Bx, Cx (such that Bx is between Ax and Cx, F(Bx) is less than both F(Bx) and F(Cx)) The solution is found when
Perform(F: math_Function, Ax: number, Bx: number, Cx: number): void;

// This method is called at the end of each iteration to check if the solution is found
IsSolutionReached(theFunction: math_Function): boolean;

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// returns the location value of the minimum
Location(): number;

// returns the value of the minimum
Minimum(): number;

// returns the number of iterations really done during the computation of the minimum
NbIterations(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Fast random number generator (the algorithm proposed by Ian C
math_BullardGenerator: declare class math_BullardGenerator

constructor

// Setup new seed / reset defaults
SetSeed(theSeed?: number): void;

// Generates new 64-bit integer value
NextInt(): number;

// Generates new floating-point value
NextReal(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

math_ComputeGaussPointsAndWeights: declare class math_ComputeGaussPointsAndWeights

constructor

IsDone(): boolean;

Points(): math_VectorBase_double;

Weights(): math_VectorBase_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

math_ComputeKronrodPointsAndWeights: declare class math_ComputeKronrodPointsAndWeights

constructor

IsDone(): boolean;

Points(): math_VectorBase_double;

Weights(): math_VectorBase_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the Crout algorithm used to solve a system A\*X = B where A is a symmetric matrix
math_Crout: declare class math_Crout

constructor

// Returns True if all has been correctly done
IsDone(): boolean;

// Given an input vector \*\*, this routine returns the solution of the set of linear equations A
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;

// returns the inverse matrix of A
Inverse(): math_Matrix;

// returns in Inv the inverse matrix of A
Invert(Inv: math_Matrix): void;

// Returns the value of the determinant of the previously LU decomposed matrix A
Determinant(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the calculation of all the real roots of a real polynomial of degree <= 4 using direct algebraic methods
math_DirectPolynomialRoots: declare class math_DirectPolynomialRoots

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Returns true if there is an infinity of roots, otherwise returns false
InfiniteRoots(): boolean;

// Returns the number of distinct real roots found
NbSolutions(): number;

// Returns the value of the Nth root in default ordering
Value(theIndex: number): number;
// theIndex: root index (1-based)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

math_DoubleTab: declare class math_DoubleTab

constructor

// Initialize all elements with theInitValue
Init(theInitValue: number): void;

// Copy data to theOther
Copy(theOther: math_DoubleTab): void;

// Returns true if the internal array is deletable (heap-allocated)
IsDeletable(): boolean;

// Set lower row index
SetLowerRow(theLowerRow: number): void;

// Set lower column index
SetLowerCol(theLowerCol: number): void;

// Get lower row index
LowerRow(): number;

// Get upper row index
UpperRow(): number;

// Get lower column index
LowerCol(): number;

// Get upper column index
UpperCol(): number;

// Get number of rows
NbRows(): number;

// Get number of columns
NbColumns(): number;

// Access element at (theRowIndex, theColIndex)
Value(theRowIndex: number, theColIndex: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class finds eigenvalues and eigenvectors of real symmetric tridiagonal matrices
math_EigenValuesSearcher: declare class math_EigenValuesSearcher

constructor

// Returns true if computation is performed successfully
IsDone(): boolean;

// Returns the dimension of the tridiagonal matrix
Dimension(): number;

// Returns the specified eigenvalue
EigenValue(theIndex: number): number;
// theIndex: index of the desired eigenvalue (1-based indexing)

// Returns the specified eigenvector
EigenVector(theIndex: number): math_VectorBase_double;
// theIndex: index of the desired eigenvector (1-based indexing)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class implements the Fletcher-Reeves-Polak_Ribiere minimization algorithm of a function of multiple variables
math_FRPR: declare class math_FRPR

constructor

// The solution F = Fi is found when 2.0 _ abs(Fi - Fi-1) <= Tolerance _ (abs(Fi) + abs(Fi-1) + ZEPS)
Perform(theFunction: math_MultipleVarFunctionWithGradient, theStartingPoint: math_VectorBase_double): void;

// The solution F = Fi is found when
IsSolutionReached(theFunction: math_MultipleVarFunctionWithGradient): boolean;

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// returns the location vector of the minimum
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;

// returns the value of the minimum
Minimum(): number;

// returns the gradient vector at the minimum
Gradient(): math_VectorBase_double;
Gradient(Grad: math_VectorBase_double): void;
Gradient(): math_VectorBase_double;
Gradient(Grad: math_VectorBase_double): void;

// returns the number of iterations really done during the computation of the minimum
NbIterations(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This abstract class describes the virtual functions associated with a Function of a single variable
math_Function: declare class math_Function

// Computes the value of the function <F> for a given value of variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// returns the state of the function corresponding to the latest call of any methods associated with the function
GetStateNumber(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This algorithm uses a sample of the function to find all intervals on which the function is null, and afterwards uses the FunctionRoots algorithm to find the points where the function is null outside the "null intervals"
math_FunctionAllRoots: declare class math_FunctionAllRoots

constructor

// Returns True if the computation has been done successfully
IsDone(): boolean;

// Returns the number of intervals on which the function is Null
NbIntervals(): number;

// Returns the interval of parameter of range Index
GetInterval(Index: number, A?: number, B?: number): { A: number; B: number };

// returns the State Number associated to the interval Index
GetIntervalState(Index: number, IFirst?: number, ILast?: number): { IFirst: number; ILast: number };

// returns the number of points where the function is Null
NbPoints(): number;

// Returns the parameter of the point of range Index
GetPoint(Index: number): number;

// returns the State Number associated to the point Index
GetPointState(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the computation of a root of a function of a single variable which is near an initial guess using a minimization algorithm.Knowledge of the derivative is required
math_FunctionRoot: declare class math_FunctionRoot

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// returns the value of the root
Root(): number;

// returns the value of the derivative at the root
Derivative(): number;

// returns the value of the function at the root
Value(): number;

// returns the number of iterations really done on the computation of the Root
NbIterations(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements an algorithm which finds all the real roots of a function with derivative within a given range
math_FunctionRoots: declare class math_FunctionRoots

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// returns true if the function is considered as null between A and B
IsAllNull(): boolean;

// Returns the number of solutions found
NbSolutions(): number;

// Returns the Nth value of the root of function F
Value(Nieme: number): number;

// returns the StateNumber of the Nieme root
StateNumber(Nieme: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives a default sample (constant difference of parameter) for a function defined between two bound A,B
math_FunctionSample: declare class math_FunctionSample

constructor

// Returns the bounds of parameters
Bounds(A: number, B: number): { A: number; B: number };

// Returns the number of sample points
NbPoints(): number;

// Returns the value of parameter of the point of range Index
GetParameter(Index: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This abstract class describes the virtual functions associated to a set on N Functions of M independent variables
math_FunctionSet: declare class math_FunctionSet

// Returns the number of variables of the function
NbVariables(): number;

// Returns the number of equations of the function
NbEquations(): number;

// Computes the values <F> of the functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Returns the state of the function corresponding to the latestcall of any methods associated with the function
GetStateNumber(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
