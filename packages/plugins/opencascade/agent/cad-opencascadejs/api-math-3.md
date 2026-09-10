# libcascade — math (3)

16 top-level symbols. Signatures are verbatim typescript.

// This class implements the calculation of a root of a function of a single variable starting from an initial near guess using the Newton algorithm
math_NewtonFunctionRoot: declare class math_NewtonFunctionRoot

constructor

// is used internally by the constructors
Perform(F: math_FunctionWithDerivative, Guess: number): void;

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Returns the value of the root of function <F>
Root(): number;

// returns the value of the derivative at the root
Derivative(): number;

// returns the value of the function at the root
Value(): number;

// Returns the number of iterations really done on the computation of the Root
NbIterations(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

math_NotSquare: declare class math_NotSquare extends Standard_DimensionError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// In this class implemented variation of Particle Swarm Optimization (PSO) method
math_PSO: declare class math_PSO

constructor

// Perform computations, particles array is constructed inside of this function
Perform(theSteps: math_VectorBase_double, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };
Perform(theParticles: math_PSOParticlesPool, theNbParticles: number, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };
Perform(theSteps: math_VectorBase_double, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };
Perform(theParticles: math_PSOParticlesPool, theNbParticles: number, theValue: number, theOutPnt: math_VectorBase_double, theNbIter: number): { theValue: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

math_PSOParticlesPool: declare class math_PSOParticlesPool

constructor

GetParticle(theIdx: number): PSO_Particle;

GetBestParticle(): PSO_Particle;

GetWorstParticle(): PSO_Particle;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the Powell method to find the minimum of function of multiple variables (the gradient does not have to be known)
math_Powell: declare class math_Powell

constructor

// Computes Powell minimization on the function F given theStartingPoint, and an initial matrix theStartingDirection whose columns contain the initial set of directions
Perform(theFunction: math_MultipleVarFunction, theStartingPoint: math_VectorBase_double, theStartingDirections: math_Matrix): void;

// Solution F = Fi is found when
IsSolutionReached(theFunction: math_MultipleVarFunction): boolean;

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// returns the location vector of the minimum
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;
Location(): math_VectorBase_double;
Location(Loc: math_VectorBase_double): void;

// Returns the value of the minimum
Minimum(): number;

// Returns the number of iterations really done during the computation of the minimum
NbIterations(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// SVD implements the solution of a set of N linear equations of M unknowns without condition on N or M
math_SVD: declare class math_SVD

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Given the input Vector B this routine solves the set of linear equations A
Solve(B: math_VectorBase_double, X: math_VectorBase_double, Eps?: number): void;

// Computes the inverse Inv of matrix A such as A \* Inverse = Identity
PseudoInverse(Inv: math_Matrix, Eps?: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

math_SingularMatrix: declare class math_SingularMatrix extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

math_Status: typeof math_Status[keyof typeof math_Status]

// This is function, which corresponds trigonometric equation a*std::cos(x)*std::cos(x) + 2*b*std::cos(x)*Sin(x) + c*std::cos(x) + d\*Sin(x) + e = 0 See class {@link math_TrigonometricFunctionRoots`math_TrigonometricFunctionRoots`}
math_TrigonometricEquationFunction: declare class math_TrigonometricEquationFunction extends math_FunctionWithDerivative

constructor

// Computes the value <F>of the function for the variable <X>
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative <D> of the function for the variable <X>
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value <F> and the derivative <D> of the function for the variable <X>
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the solutions of the equation a*std::cos(x)*std::cos(x) + 2*b*std::cos(x)*Sin(x) + c*std::cos(x) + d\*Sin(x) + e The degree of this equation can be 4, 3 or 2
math_TrigonometricFunctionRoots: declare class math_TrigonometricFunctionRoots

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Returns true if there is an infinity of roots, otherwise returns false
InfiniteRoots(): boolean;

// Returns the solution of range Index
Value(Index: number): number;

// Returns the number of solutions found
NbSolutions(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements a system resolution C\*X = B with an approach solution X0
math_Uzawa: declare class math_Uzawa

constructor

// Returns true if the computations are successful, otherwise returns false
IsDone(): boolean;

// Returns the vector solution of the system above
Value(): math_VectorBase_double;

// Returns the initial error Cont\*StartingPoint-Secont
InitialError(): math_VectorBase_double;

// returns the duale variables V of the systeme
Duale(V: math_VectorBase_double): void;

// Returns the difference between X solution and the StartingPoint
Error(): math_VectorBase_double;

// returns the number of iterations really done
NbIterations(): number;

// returns the inverse matrix of (C \* Transposed(C))
InverseCont(): math_Matrix;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Simple container storing two reals
math_ValueAndWeight: declare class math_ValueAndWeight

constructor

Value(): number;

Weight(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the real vector abstract data type
math_VectorBase_double: declare class math_VectorBase_double

constructor

// Initialize all the elements of a vector with "theInitialValue"
Init(theInitialValue: number): void;

// Returns the length of a vector
Length(): number;

// Returns the lower index of the vector
Lower(): number;

// Returns the upper index of the vector
Upper(): number;

// Returns the value or the square of the norm of this vector
Norm(): number;

// Returns the value of the square of the norm of a vector
Norm2(): number;

// Returns the index of the maximum element of a vector
Max(): number;

// Returns the index of the minimum element of a vector
Min(): number;

// Normalizes this vector (the norm of the result is equal to 1.0) and assigns the result to this vector Exceptions Standard_NullValue if this vector is null (i.e
Normalize(): void;

// Normalizes this vector (the norm of the result is equal to 1.0) and creates a new vector Exceptions Standard_NullValue if this vector is null (i.e
Normalized(): math_VectorBase_double;

// Inverts this vector and assigns the result to this vector
Invert(): void;

// Inverts this vector and creates a new vector
Inverse(): math_VectorBase_double;

// sets a vector from "theI1" to "theI2" to the vector "theV"
Set(theI1: number, theI2: number, theV: math_VectorBase_double): void;

// Creates a new vector by inverting the values of this vector between indexes "theI1" and "theI2"
Slice(theI1: number, theI2: number): math_VectorBase_double;

// Updates current vector by multiplying each element on current value
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
Multiply(theLeft: number, theRight: math_VectorBase_double): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
Multiply(theLeft: number, theRight: math_VectorBase_double): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
Multiply(theLeft: number, theRight: math_VectorBase_double): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
Multiply(theLeft: number, theRight: math_VectorBase_double): void;

// returns the product of a vector and a real value
Multiplied(theRight: number): math_VectorBase_double;
Multiplied(theRight: math_VectorBase_double): number;
Multiplied(theRight: math_Matrix): math_VectorBase_double;
Multiplied(theRight: number): math_VectorBase_double;
Multiplied(theRight: math_VectorBase_double): number;
Multiplied(theRight: math_Matrix): math_VectorBase_double;
Multiplied(theRight: number): math_VectorBase_double;
Multiplied(theRight: math_VectorBase_double): number;
Multiplied(theRight: math_Matrix): math_VectorBase_double;

// returns the product of a vector and a real value
TMultiplied(theRight: number): math_VectorBase_double;

// divides a vector by the value "theRight"
Divide(theRight: number): void;

// Returns new vector as dividing current vector with the value "theRight"
Divided(theRight: number): math_VectorBase_double;

// adds the vector "theRight" to a vector
Add(theRight: math_VectorBase_double): void;
Add(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;
Add(theRight: math_VectorBase_double): void;
Add(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;

// Returns new vector as adding current vector with the value "theRight"
Added(theRight: math_VectorBase_double): math_VectorBase_double;

// sets a vector to the product of the transpose of the matrix "theTLeft" by the vector "theRight"
TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_double): void;
TMultiply(theLeft: math_VectorBase_double, theTRight: math_Matrix): void;
TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_double): void;
TMultiply(theLeft: math_VectorBase_double, theTRight: math_Matrix): void;

// sets a vector to the Subtraction of the vector theRight from the vector theLeft
Subtract(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;
Subtract(theRight: math_VectorBase_double): void;
Subtract(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;
Subtract(theRight: math_VectorBase_double): void;

// accesses the value of index "theNum" of a vector
Value(theNum: number): number;

// Initialises a vector by copying "theOther"
Initialized(theOther: math_VectorBase_double): math_VectorBase_double;

// returns the opposite of a vector
Opposite(): math_VectorBase_double;

// returns the subtraction of "theRight" from "me"
Subtracted(theRight: math_VectorBase_double): math_VectorBase_double;

// Returns the underlying array for interoperability with legacy APIs
Array1(): NCollection_Array1_double;

// Resizes the vector to a new size, keeping the same lower bound
Resize(theSize: number): void;
// theSize: new size of the vector

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class implements the real vector abstract data type
math_VectorBase_int: declare class math_VectorBase_int

constructor

// Initialize all the elements of a vector with "theInitialValue"
Init(theInitialValue: number): void;

// Returns the length of a vector
Length(): number;

// Returns the lower index of the vector
Lower(): number;

// Returns the upper index of the vector
Upper(): number;

// Returns the value or the square of the norm of this vector
Norm(): number;

// Returns the value of the square of the norm of a vector
Norm2(): number;

// Returns the index of the maximum element of a vector
Max(): number;

// Returns the index of the minimum element of a vector
Min(): number;

// Normalizes this vector (the norm of the result is equal to 1.0) and assigns the result to this vector Exceptions Standard_NullValue if this vector is null (i.e
Normalize(): void;

// Normalizes this vector (the norm of the result is equal to 1.0) and creates a new vector Exceptions Standard_NullValue if this vector is null (i.e
Normalized(): math_VectorBase_int;

// Inverts this vector and assigns the result to this vector
Invert(): void;

// Inverts this vector and creates a new vector
Inverse(): math_VectorBase_int;

// sets a vector from "theI1" to "theI2" to the vector "theV"
Set(theI1: number, theI2: number, theV: math_VectorBase_int): void;

// Creates a new vector by inverting the values of this vector between indexes "theI1" and "theI2"
Slice(theI1: number, theI2: number): math_VectorBase_int;

// Updates current vector by multiplying each element on current value
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
Multiply(theLeft: number, theRight: math_VectorBase_int): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
Multiply(theLeft: number, theRight: math_VectorBase_int): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
Multiply(theLeft: number, theRight: math_VectorBase_int): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
Multiply(theLeft: number, theRight: math_VectorBase_int): void;

// returns the product of a vector and a real value
Multiplied(theRight: number): math_VectorBase_int;
Multiplied(theRight: math_VectorBase_int): number;
Multiplied(theRight: math_Matrix): math_VectorBase_int;
Multiplied(theRight: number): math_VectorBase_int;
Multiplied(theRight: math_VectorBase_int): number;
Multiplied(theRight: math_Matrix): math_VectorBase_int;
Multiplied(theRight: number): math_VectorBase_int;
Multiplied(theRight: math_VectorBase_int): number;
Multiplied(theRight: math_Matrix): math_VectorBase_int;

// returns the product of a vector and a real value
TMultiplied(theRight: number): math_VectorBase_int;

// divides a vector by the value "theRight"
Divide(theRight: number): void;

// Returns new vector as dividing current vector with the value "theRight"
Divided(theRight: number): math_VectorBase_int;

// adds the vector "theRight" to a vector
Add(theRight: math_VectorBase_int): void;
Add(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;
Add(theRight: math_VectorBase_int): void;
Add(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;

// Returns new vector as adding current vector with the value "theRight"
Added(theRight: math_VectorBase_int): math_VectorBase_int;

// sets a vector to the product of the transpose of the matrix "theTLeft" by the vector "theRight"
TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_int): void;
TMultiply(theLeft: math_VectorBase_int, theTRight: math_Matrix): void;
TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_int): void;
TMultiply(theLeft: math_VectorBase_int, theTRight: math_Matrix): void;

// sets a vector to the Subtraction of the vector theRight from the vector theLeft
Subtract(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;
Subtract(theRight: math_VectorBase_int): void;
Subtract(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;
Subtract(theRight: math_VectorBase_int): void;

// accesses the value of index "theNum" of a vector
Value(theNum: number): number;

// Initialises a vector by copying "theOther"
Initialized(theOther: math_VectorBase_int): math_VectorBase_int;

// returns the opposite of a vector
Opposite(): math_VectorBase_int;

// returns the subtraction of "theRight" from "me"
Subtracted(theRight: math_VectorBase_int): math_VectorBase_int;

// Returns the underlying array for interoperability with legacy APIs
Array1(): NCollection_Array1_int;

// Resizes the vector to a new size, keeping the same lower bound
Resize(theSize: number): void;
// theSize: new size of the vector

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

math_IntegerVector: math_VectorBase_int

math_Vector: math_VectorBase_double
