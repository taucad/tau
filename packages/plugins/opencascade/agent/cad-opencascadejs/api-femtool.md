# libcascade — FEmTool

11 top-level symbols. Signatures are verbatim typescript.

// Assemble and solve system from (one dimensional) Finite Elements
FEmTool_Assembly: declare class FEmTool_Assembly

constructor

// Nullify all Matrix's Coefficient
NullifyMatrix(): void;

// Add an elementary Matrix in the assembly Matrix if Dependence(Dimension1,Dimension2) is False
AddMatrix(Element: number, Dimension1: number, Dimension2: number, Mat: math_Matrix): void;

// Nullify all Coordinate of assembly Vector (second member)
NullifyVector(): void;

// Add an elementary Vector in the assembly Vector (second member)
AddVector(Element: number, Dimension: number, Vec: math_VectorBase_double): void;

// Delete all Constraints
ResetConstraint(): void;

// Nullify all Constraints
NullifyConstraint(): void;

AddConstraint(IndexofConstraint: number, Element: number, Dimension: number, LinearForm: math_VectorBase_double, Value: number): void;

// Solve the assembly system Returns false if the computation failed
Solve(): boolean;

Solution(Solution: math_VectorBase_double): void;

NbGlobVar(): number;

// Returns the assembly table mapping element-local indices to global indices
AssemblyTable(): NCollection_HArray2_handle_NCollection_HArray1_int;

// Returns the assembly table via output parameter
// DEPRECATED
GetAssemblyTable(): { AssTable: NCollection_HArray2_handle_NCollection_HArray1_int; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Curve defined by Polynomial Elements
FEmTool_Curve: declare class FEmTool_Curve extends Standard_Transient

constructor

Knots(): NCollection_Array1_double;

SetElement(IndexOfElement: number, Coeffs: NCollection_Array2_double): void;

D0(U: number, Pnt: NCollection_Array1_double): void;

D1(U: number, Vec: NCollection_Array1_double): void;

D2(U: number, Vec: NCollection_Array1_double): void;

Length(FirstU: number, LastU: number, Length?: number): { Length: number };

GetElement(IndexOfElement: number, Coeffs: NCollection_Array2_double): void;

// returns coefficients of all elements in canonical base
GetPolynom(Coeffs: NCollection_Array1_double): void;
// Coeffs: Mutated in place

NbElements(): number;

Dimension(): number;

Base(): PLib_HermitJacobi;

Degree(IndexOfElement: number): number;

SetDegree(IndexOfElement: number, Degree: number): void;

ReduceDegree(IndexOfElement: number, Tol: number, NewDegree?: number, MaxError?: number): { NewDegree: number; MaxError: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defined J Criteria to used in minimisation
FEmTool_ElementaryCriterion: declare class FEmTool_ElementaryCriterion extends Standard_Transient

// Set the coefficient of the Element (the Curve) Set the definition interval of the Element
Set(Coeff: NCollection_HArray2_double): void;
Set(FirstKnot: number, LastKnot: number): void;
Set(Coeff: NCollection_HArray2_double): void;
Set(FirstKnot: number, LastKnot: number): void;

// To know if two dimension are independent
DependenceTable(): NCollection_HArray2_int;

// To Compute J(E) where E is the current Element
Value(): number;

// To Compute J(E) the coefficients of Hessian matrix of J(E) which are crossed derivatives in dimensions <Dim1> and <Dim2>
Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

// To Compute the coefficients in the dimension <dim> of the J(E)'s Gradient where E is the current Element
Gradient(Dim: number, G: math_VectorBase_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class describes the functions needed for calculating matrix elements of RefMatrix for linear criteriums (Tension, Flexion and Jerk) by Gauss integration
FEmTool_ElementsOfRefMatrix: declare class FEmTool_ElementsOfRefMatrix extends math_FunctionSet

constructor

// returns the number of variables of the function
NbVariables(): number;

// returns the number of equations of the function
NbEquations(): number;

// computes the values <F> of the functions for the variable <X>
Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Criterium of LinearFlexion To Hermit-Jacobi elements
FEmTool_LinearFlexion: declare class FEmTool_LinearFlexion extends FEmTool_ElementaryCriterion

constructor

// To know if two dimension are independent
DependenceTable(): NCollection_HArray2_int;

// To Compute J(E) where E is the current Element
Value(): number;

// To Compute J(E) the coefficients of Hessian matrix of J(E) which are crossed derivatives in dimensions <Dim1> and <Dim2>
Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

// To Compute the coefficients in the dimension <dim> of the J(E)'s Gradient where E is the current Element
Gradient(Dim: number, G: math_VectorBase_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Criterion of LinearJerk To Hermit-Jacobi elements
FEmTool_LinearJerk: declare class FEmTool_LinearJerk extends FEmTool_ElementaryCriterion

constructor

// To know if two dimension are independent
DependenceTable(): NCollection_HArray2_int;

// To Compute J(E) where E is the current Element
Value(): number;

// To Compute J(E) the coefficients of Hessian matrix of J(E) which are crossed derivatives in dimensions <Dim1> and <Dim2>
Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

// To Compute the coefficients in the dimension <dim> of the J(E)'s Gradient where E is the current Element
Gradient(Dim: number, G: math_VectorBase_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Criterium of LinearTension To Hermit-Jacobi elements
FEmTool_LinearTension: declare class FEmTool_LinearTension extends FEmTool_ElementaryCriterion

constructor

// To know if two dimension are independent
DependenceTable(): NCollection_HArray2_int;

// To Compute J(E) where E is the current Element
Value(): number;

// To Compute J(E) the coefficients of Hessian matrix of J(E) which are crossed derivatives in dimensions <Dim1> and <Dim2>
Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

// To Compute the coefficients in the dimension <dim> of the J(E)'s Gradient where E is the current Element
Gradient(Dim: number, G: math_VectorBase_double): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Symmetric Sparse ProfileMatrix useful for 1D Finite Element methods
FEmTool_ProfileMatrix: declare class FEmTool_ProfileMatrix extends FEmTool_SparseMatrix

constructor

Init(Value: number): void;

ChangeValue(I: number, J: number): number;

// To make a Factorization of <me>
Decompose(): boolean;

// Direct Solve of AX = B
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;

// Make Preparation to iterative solve
Prepare(): boolean;

// returns the product of a SparseMatrix by a vector
Multiplied(X: math_VectorBase_double, MX: math_VectorBase_double): void;

// returns the row range of a matrix
RowNumber(): number;

// returns the column range of the matrix
ColNumber(): number;

IsInProfile(i: number, j: number): boolean;

OutM(): void;

OutS(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Sparse Matrix definition
FEmTool_SparseMatrix: declare class FEmTool_SparseMatrix extends Standard_Transient

Init(Value: number): void;

ChangeValue(I: number, J: number): number;

// To make a Factorization of <me>
Decompose(): boolean;

// Direct Solve of AX = B
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;
Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;

// Make Preparation to iterative solve
Prepare(): boolean;

// returns the product of a SparseMatrix by a vector
Multiplied(X: math_VectorBase_double, MX: math_VectorBase_double): void;

// returns the row range of a matrix
RowNumber(): number;

// returns the column range of the matrix
ColNumber(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

FEmTool_AssemblyTable: NCollection_Array2_handle_NCollection_HArray1_int

FEmTool_HAssemblyTable: NCollection_HArray2_handle_NCollection_HArray1_int
