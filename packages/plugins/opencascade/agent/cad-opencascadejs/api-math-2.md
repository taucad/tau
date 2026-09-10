# libcascade — math (2)

15 top-level symbols. Signatures are verbatim typescript.

// The {@link math_FunctionSetRoot`math_FunctionSetRoot`} class calculates the root of a set of N functions of M variables (N<M, N=M or N>M)
math_FunctionSetRoot: declare class math_FunctionSetRoot

constructor

// Initializes the tolerance values
SetTolerance(Tolerance: math_VectorBase_double): void;

// This routine is called at the end of each iteration to check if the solution was found
IsSolutionReached(argNo0: math_FunctionSetWithDerivatives): boolean;

// Improves the root of function from the initial guess point
Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theStopOnDivergent: boolean): void;
Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theInfBound: math_VectorBase_double, theSupBound: math_VectorBase_double, theStopOnDivergent: boolean): void;
Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theStopOnDivergent: boolean): void;
Perform(theFunction: math_FunctionSetWithDerivatives, theStartingPoint: math_VectorBase_double, theInfBound: math_VectorBase_double, theSupBound: math_VectorBase_double, theStopOnDivergent: boolean): void;

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Returns the number of iterations really done during the computation of the root
NbIterations(): number;

// returns the stateNumber (as returned by F.GetStateNumber()) associated to the root found
StateNumber(): number;

// Returns the value of the root of function F
Root(): math_VectorBase_double;
Root(Root: math_VectorBase_double): void;
Root(): math_VectorBase_double;
Root(Root: math_VectorBase_double): void;

// Returns the matrix value of the derivative at the root
Derivative(): math_Matrix;
Derivative(Der: math_Matrix): void;
Derivative(): math_Matrix;
Derivative(Der: math_Matrix): void;

// returns the vector value of the error done on the functions at the root
FunctionSetErrors(): math_VectorBase_double;
FunctionSetErrors(Err: math_VectorBase_double): void;
FunctionSetErrors(): math_VectorBase_double;
FunctionSetErrors(Err: math_VectorBase_double): void;

IsDivergent(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This abstract class describes the virtual functions associated with a set of N Functions each of M independent variables
math_FunctionSetWithDerivatives: declare class math_FunctionSetWithDerivatives extends math_FunctionSet

// Returns the number of variables of the function
NbVariables(): number;

// Returns the number of equations of the function
NbEquations(): number;

// Computes the values <F> of the Functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Returns the values <D> of the derivatives for the variable <X>
Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

// returns the values <F> of the functions and the derivatives <D> for the variable <X>
Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This abstract class describes the virtual functions associated with a function of a single variable for which the first derivative is available
math_FunctionWithDerivative: declare class math_FunctionWithDerivative extends math_Function

// Computes the value <F>of the function for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value <F> and the derivative <D> of the function for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the Gauss LU decomposition (Crout algorithm) with partial pivoting (rows interchange) of a square matrix and the different possible derived calculation
math_Gauss: declare class math_Gauss

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Given the input Vector B this routine returns the solution X of the set of linear equations A
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
Solve(B: math_VectorBase_double): void;
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
Solve(B: math_VectorBase_double): void;

// This routine returns the value of the determinant of the previously LU decomposed matrix A
Determinant(): number;

// This routine outputs Inv the inverse of the previously LU decomposed matrix A
Invert(Inv: math_Matrix): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the least square solution of a set of n linear equations of m unknowns (n >= m) using the gauss LU decomposition algorithm
math_GaussLeastSquare: declare class math_GaussLeastSquare

constructor

// Returns true if the computations are successful, otherwise returns false.e
IsDone(): boolean;

// Given the input Vector \*\*this routine solves the set of linear equations A
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the integration of a function of multiple variables between the parameter bounds Lower[a..b] and Upper[a..b]
math_GaussMultipleIntegration: declare class math_GaussMultipleIntegration

constructor

// returns True if all has been correctly done
IsDone(): boolean;

// returns the value of the integral
Value(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the integration of a set of N functions of M variables variables between the parameter bounds Lower[a..b] and Upper[a..b]
math_GaussSetIntegration: declare class math_GaussSetIntegration

constructor

// returns True if all has been correctly done
IsDone(): boolean;

// returns the value of the integral
Value(): math_VectorBase_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the integration of a function of a single variable between the parameter bounds Lower and Upper
math_GaussSingleIntegration: declare class math_GaussSingleIntegration

constructor

// returns True if all has been correctly done
IsDone(): boolean;

// returns the value of the integral
Value(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class represents Evtushenko's algorithm of global optimization based on non-uniform mesh
math_GlobOptMin: declare class math_GlobOptMin

constructor

SetGlobalParams(theFunc: math_MultipleVarFunction, theLowerBorder: math_VectorBase_double, theUpperBorder: math_VectorBase_double, theC?: number, theDiscretizationTol?: number, theSameTol?: number): void;
// theFunc: objective functional
// theLowerBorder: lower corner of the search box
// theUpperBorder: upper corner of the search box
// theC: Lipschitz constant
// theDiscretizationTol: parameter space discretization tolerance
// theSameTol: functional value space indifference tolerance

// Method to reduce bounding box
SetLocalParams(theLocalA: math_VectorBase_double, theLocalB: math_VectorBase_double): void;
// theLocalA: lower corner of the local box
// theLocalB: upper corner of the local box

// Method to set tolerances
SetTol(theDiscretizationTol: number, theSameTol: number): void;
// theDiscretizationTol: parameter space discretization tolerance
// theSameTol: functional value space indifference tolerance

// Method to get tolerances
GetTol(theDiscretizationTol?: number, theSameTol?: number): { theDiscretizationTol: number; theSameTol: number };
// theDiscretizationTol: parameter space discretization tolerance
// theSameTol: functional value space indifference tolerance

Perform(isFindSingleSolution?: boolean): void;
// isFindSingleSolution: defines whether to find single solution or all solutions

// Return solution theIndex, 1 <= theIndex <= NbExtrema
Points(theIndex: number, theSol: math_VectorBase_double): void;

// Set / Get continuity of local borders splits (0 ~ C0, 1 ~ C1, 2 ~ C2)
SetContinuity(theCont: number): void;

GetContinuity(): number;

// Set / Get functional minimal value
SetFunctionalMinimalValue(theMinimalValue: number): void;

GetFunctionalMinimalValue(): number;

// Set / Get Lipchitz constant modification state
SetLipConstState(theFlag: boolean): void;

GetLipConstState(): boolean;

// Return computation state of the algorithm
isDone(): boolean;

// Get best functional value
GetF(): number;

// Return count of global extremas
NbExtrema(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the Jacobi method to find the eigenvalues and the eigenvectors of a real symmetric square matrix
math_Jacobi: declare class math_Jacobi

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Returns the eigenvalues vector
Values(): math_VectorBase_double;

// returns the eigenvalue number Num
Value(Num: number): number;

// returns the eigenvectors matrix
Vectors(): math_Matrix;

// Returns the eigenvector V of number Num
Vector(Num: number, V: math_VectorBase_double): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the Gauss-Kronrod method of integral computation
math_KronrodSingleIntegration: declare class math_KronrodSingleIntegration

constructor

// Computation of the integral
Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number): void;
Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number, theTolerance: number, theMaxNbIter: number): void;
Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number): void;
Perform(theFunction: math_Function, theLower: number, theUpper: number, theNbPnts: number, theTolerance: number, theMaxNbIter: number): void;

// Returns true if computation is performed successfully
IsDone(): boolean;

// Returns the value of the integral
Value(): number;

// Returns the value of the relative error reached
ErrorReached(): number;

// Returns the value of the relative error reached
AbsolutError(): number;

// Returns the number of Kronrod points for which the result is computed
OrderReached(): number;

// Returns the number of iterations that were made to compute result
NbIterReached(): number;

static GKRule(theFunction: math_Function, theLower: number, theUpper: number, theGaussP: math_VectorBase_double, theGaussW: math_VectorBase_double, theKronrodP: math_VectorBase_double, theKronrodW: math_VectorBase_double, theValue?: number, theError?: number): { returnValue: boolean; theValue: number; theError: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the real matrix abstract data type
math_Matrix: declare class math_Matrix

constructor

// Initialize all the elements of a matrix to InitialValue
Init(InitialValue: number): void;

// Returns the number of rows of this matrix
RowNumber(): number;

// Returns the number of rows of this matrix
ColNumber(): number;

// Returns the value of the Lower index of the row range of a matrix
LowerRow(): number;

// Returns the Upper index of the row range of a matrix
UpperRow(): number;

// Returns the value of the Lower index of the column range of a matrix
LowerCol(): number;

// Returns the value of the upper index of the column range of a matrix
UpperCol(): number;

// Computes the determinant of a matrix
Determinant(): number;

// Transposes a given matrix
Transpose(): void;

// Inverts a matrix using Gauss algorithm
Invert(): void;

// Sets this matrix to the product of the matrix Left, and the matrix Right
Multiply(Right: number): void;
Multiply(Right: math_Matrix): void;
Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
Multiply(Left: math_Matrix, Right: math_Matrix): void;
Multiply(Right: number): void;
Multiply(Right: math_Matrix): void;
Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
Multiply(Left: math_Matrix, Right: math_Matrix): void;
Multiply(Right: number): void;
Multiply(Right: math_Matrix): void;
Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
Multiply(Left: math_Matrix, Right: math_Matrix): void;
Multiply(Right: number): void;
Multiply(Right: math_Matrix): void;
Multiply(Left: math_VectorBase_double, Right: math_VectorBase_double): void;
Multiply(Left: math_Matrix, Right: math_Matrix): void;

// multiplies all the elements of a matrix by the value <Right>
Multiplied(Right: number): math_Matrix;
Multiplied(Right: math_Matrix): math_Matrix;
Multiplied(Right: math_VectorBase_double): math_VectorBase_double;
Multiplied(Right: number): math_Matrix;
Multiplied(Right: math_Matrix): math_Matrix;
Multiplied(Right: math_VectorBase_double): math_VectorBase_double;
Multiplied(Right: number): math_Matrix;
Multiplied(Right: math_Matrix): math_Matrix;
Multiplied(Right: math_VectorBase_double): math_VectorBase_double;

// Sets this matrix to the product of the transposed matrix TLeft, and the matrix Right
TMultiplied(Right: number): math_Matrix;

// divides all the elements of a matrix by the value <Right>
Divide(Right: number): void;

// divides all the elements of a matrix by the value <Right>
Divided(Right: number): math_Matrix;

// adds the matrix <Right> to a matrix
Add(Right: math_Matrix): void;
Add(Left: math_Matrix, Right: math_Matrix): void;
Add(Right: math_Matrix): void;
Add(Left: math_Matrix, Right: math_Matrix): void;

// adds the matrix <Right> to a matrix
Added(Right: math_Matrix): math_Matrix;

// Subtracts the matrix <Right> from <me>
Subtract(Right: math_Matrix): void;
Subtract(Left: math_Matrix, Right: math_Matrix): void;
Subtract(Right: math_Matrix): void;
Subtract(Left: math_Matrix, Right: math_Matrix): void;

// Returns the result of the subtraction of <Right> from <me>
Subtracted(Right: math_Matrix): math_Matrix;

// Sets the values of this matrix,
Set(I1: number, I2: number, J1: number, J2: number, M: math_Matrix): void;

// Sets the row of index Row of a matrix to the vector <V>
SetRow(Row: number, V: math_VectorBase_double): void;

// Sets the column of index Col of a matrix to the vector <V>
SetCol(Col: number, V: math_VectorBase_double): void;

// Sets the diagonal of a matrix to the value
SetDiag(Value: number): void;

// Returns the row of index Row of a matrix
Row(Row: number): math_VectorBase_double;

// Returns the column of index <Col> of a matrix
Col(Col: number): math_VectorBase_double;

// Swaps the rows of index Row1 and Row2
SwapRow(Row1: number, Row2: number): void;

// Swaps the columns of index <Col1> and <Col2>
SwapCol(Col1: number, Col2: number): void;

// Teturns the transposed of a matrix
Transposed(): math_Matrix;

// Returns the inverse of a matrix
Inverse(): math_Matrix;

// Returns the product of the transpose of a matrix with the matrix <Right>
TMultiply(Right: math_Matrix): math_Matrix;
TMultiply(TLeft: math_Matrix, Right: math_Matrix): void;
TMultiply(Right: math_Matrix): math_Matrix;
TMultiply(TLeft: math_Matrix, Right: math_Matrix): void;

// Accesses the value of index <Row> and <Col> of a matrix
Value(Row: number, Col: number): number;

// Matrixes are copied through assignment
Initialized(Other: math_Matrix): math_Matrix;

// Returns the opposite of a matrix
Opposite(): math_Matrix;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes the virtual functions associated with a multiple variable function
math_MultipleVarFunction: declare class math_MultipleVarFunction

// Returns the number of variables of the function
NbVariables(): number;

// Computes the values of the Functions <F> for the variable <X>
Value(X: math_VectorBase_double, F: number): { returnValue: boolean; F: number };

// return the state of the function corresponding to the latestt call of any methods associated to the function
GetStateNumber(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract class MultipleVarFunctionWithGradient describes the virtual functions associated with a multiple variable function
math_MultipleVarFunctionWithGradient: declare class math_MultipleVarFunctionWithGradient extends math_MultipleVarFunction

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

math_MultipleVarFunctionWithHessian: declare class math_MultipleVarFunctionWithHessian extends math_MultipleVarFunctionWithGradient

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
