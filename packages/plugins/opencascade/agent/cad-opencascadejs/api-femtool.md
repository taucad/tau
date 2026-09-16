# libcascade — FEmTool

11 top-level symbols. Signatures are verbatim typescript.

FEmTool_Assembly: declare class FEmTool_Assembly

  constructor

  NullifyMatrix(): void;

  AddMatrix(Element: number, Dimension1: number, Dimension2: number, Mat: math_Matrix): void;

  NullifyVector(): void;

  AddVector(Element: number, Dimension: number, Vec: math_VectorBase_double): void;

  ResetConstraint(): void;

  NullifyConstraint(): void;

  AddConstraint(IndexofConstraint: number, Element: number, Dimension: number, LinearForm: math_VectorBase_double, Value: number): void;

  Solve(): boolean;

  Solution(Solution: math_VectorBase_double): void;

  NbGlobVar(): number;

  AssemblyTable(): NCollection_HArray2_handle_NCollection_HArray1_int;

  // DEPRECATED
  GetAssemblyTable(): { AssTable: NCollection_HArray2_handle_NCollection_HArray1_int; [Symbol.dispose](): void };

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_Curve: declare class FEmTool_Curve extends Standard_Transient

  constructor

  Knots(): NCollection_Array1_double;

  SetElement(IndexOfElement: number, Coeffs: NCollection_Array2_double): void;

  D0(U: number, Pnt: NCollection_Array1_double): void;

  D1(U: number, Vec: NCollection_Array1_double): void;

  D2(U: number, Vec: NCollection_Array1_double): void;

  Length(FirstU: number, LastU: number, Length?: number): { Length: number };

  GetElement(IndexOfElement: number, Coeffs: NCollection_Array2_double): void;

  GetPolynom(Coeffs: NCollection_Array1_double): void;

  NbElements(): number;

  Dimension(): number;

  Base(): PLib_HermitJacobi;

  Degree(IndexOfElement: number): number;

  SetDegree(IndexOfElement: number, Degree: number): void;

  ReduceDegree(IndexOfElement: number, Tol: number, NewDegree?: number, MaxError?: number): { NewDegree: number; MaxError: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_ElementaryCriterion: declare class FEmTool_ElementaryCriterion extends Standard_Transient

  Set(Coeff: NCollection_HArray2_double): void;
  Set(FirstKnot: number, LastKnot: number): void;
  Set(Coeff: NCollection_HArray2_double): void;
  Set(FirstKnot: number, LastKnot: number): void;

  DependenceTable(): NCollection_HArray2_int;

  Value(): number;

  Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

  Gradient(Dim: number, G: math_VectorBase_double): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_ElementsOfRefMatrix: declare class FEmTool_ElementsOfRefMatrix extends math_FunctionSet

  constructor

  NbVariables(): number;

  NbEquations(): number;

  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_LinearFlexion: declare class FEmTool_LinearFlexion extends FEmTool_ElementaryCriterion

  constructor

  DependenceTable(): NCollection_HArray2_int;

  Value(): number;

  Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

  Gradient(Dim: number, G: math_VectorBase_double): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_LinearJerk: declare class FEmTool_LinearJerk extends FEmTool_ElementaryCriterion

  constructor

  DependenceTable(): NCollection_HArray2_int;

  Value(): number;

  Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

  Gradient(Dim: number, G: math_VectorBase_double): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_LinearTension: declare class FEmTool_LinearTension extends FEmTool_ElementaryCriterion

  constructor

  DependenceTable(): NCollection_HArray2_int;

  Value(): number;

  Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

  Gradient(Dim: number, G: math_VectorBase_double): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_ProfileMatrix: declare class FEmTool_ProfileMatrix extends FEmTool_SparseMatrix

  constructor

  Init(Value: number): void;

  ChangeValue(I: number, J: number): number;

  Decompose(): boolean;

  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
  Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;
  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
  Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;

  Prepare(): boolean;

  Multiplied(X: math_VectorBase_double, MX: math_VectorBase_double): void;

  RowNumber(): number;

  ColNumber(): number;

  IsInProfile(i: number, j: number): boolean;

  OutM(): void;

  OutS(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_SparseMatrix: declare class FEmTool_SparseMatrix extends Standard_Transient

  Init(Value: number): void;

  ChangeValue(I: number, J: number): number;

  Decompose(): boolean;

  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
  Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;
  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
  Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;

  Prepare(): boolean;

  Multiplied(X: math_VectorBase_double, MX: math_VectorBase_double): void;

  RowNumber(): number;

  ColNumber(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

FEmTool_AssemblyTable: NCollection_Array2_handle_NCollection_HArray1_int

FEmTool_HAssemblyTable: NCollection_HArray2_handle_NCollection_HArray1_int
