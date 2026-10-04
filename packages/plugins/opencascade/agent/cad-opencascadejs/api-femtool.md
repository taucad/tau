# libcascade — FEmTool

11 top-level symbols. Signatures are verbatim typescript.

FEmTool_Assembly: declare class FEmTool_Assembly

  // FEmTool_Assembly.constructor (constructor)
  constructor(Dependence: NCollection_Array2_int, Table: NCollection_HArray2_handle_NCollection_HArray1_int);

  // FEmTool_Assembly.NullifyMatrix (method)
  NullifyMatrix(): void;

  // FEmTool_Assembly.AddMatrix (method)
  AddMatrix(Element: number, Dimension1: number, Dimension2: number, Mat: math_Matrix): void;

  // FEmTool_Assembly.NullifyVector (method)
  NullifyVector(): void;

  // FEmTool_Assembly.AddVector (method)
  AddVector(Element: number, Dimension: number, Vec: math_VectorBase_double): void;

  // FEmTool_Assembly.ResetConstraint (method)
  ResetConstraint(): void;

  // FEmTool_Assembly.NullifyConstraint (method)
  NullifyConstraint(): void;

  // FEmTool_Assembly.AddConstraint (method)
  AddConstraint(IndexofConstraint: number, Element: number, Dimension: number, LinearForm: math_VectorBase_double, Value: number): void;

  // FEmTool_Assembly.Solve (method)
  Solve(): boolean;

  // FEmTool_Assembly.Solution (method)
  Solution(Solution: math_VectorBase_double): void;

  // FEmTool_Assembly.NbGlobVar (method)
  NbGlobVar(): number;

  // FEmTool_Assembly.AssemblyTable (method)
  AssemblyTable(): NCollection_HArray2_handle_NCollection_HArray1_int;

  // DEPRECATED
  // FEmTool_Assembly.GetAssemblyTable (method)
  GetAssemblyTable(): { AssTable: NCollection_HArray2_handle_NCollection_HArray1_int; [Symbol.dispose](): void };

  // FEmTool_Assembly.delete (method)
  delete(): void;

  // FEmTool_Assembly.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_Curve: declare class FEmTool_Curve extends Standard_Transient

  // FEmTool_Curve.constructor (constructor)
  constructor(Dimension: number, NbElements: number, TheBase: PLib_HermitJacobi, Tolerance: number);

  // FEmTool_Curve.Knots (method)
  Knots(): NCollection_Array1_double;

  // FEmTool_Curve.SetElement (method)
  SetElement(IndexOfElement: number, Coeffs: NCollection_Array2_double): void;

  // FEmTool_Curve.D0 (method)
  D0(U: number, Pnt: NCollection_Array1_double): void;

  // FEmTool_Curve.D1 (method)
  D1(U: number, Vec: NCollection_Array1_double): void;

  // FEmTool_Curve.D2 (method)
  D2(U: number, Vec: NCollection_Array1_double): void;

  // FEmTool_Curve.Length (method)
  Length(FirstU: number, LastU: number, Length?: number): { Length: number };

  // FEmTool_Curve.GetElement (method)
  GetElement(IndexOfElement: number, Coeffs: NCollection_Array2_double): void;

  // FEmTool_Curve.GetPolynom (method)
  GetPolynom(Coeffs: NCollection_Array1_double): void;

  // FEmTool_Curve.NbElements (method)
  NbElements(): number;

  // FEmTool_Curve.Dimension (method)
  Dimension(): number;

  // FEmTool_Curve.Base (method)
  Base(): PLib_HermitJacobi;

  // FEmTool_Curve.Degree (method)
  Degree(IndexOfElement: number): number;

  // FEmTool_Curve.SetDegree (method)
  SetDegree(IndexOfElement: number, Degree: number): void;

  // FEmTool_Curve.ReduceDegree (method)
  ReduceDegree(IndexOfElement: number, Tol: number, NewDegree?: number, MaxError?: number): { NewDegree: number; MaxError: number };

  // FEmTool_Curve.get_type_name (method)
  static get_type_name(): string;

  // FEmTool_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // FEmTool_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // FEmTool_Curve.delete (method)
  delete(): void;

  // FEmTool_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_ElementaryCriterion: declare class FEmTool_ElementaryCriterion extends Standard_Transient

  // FEmTool_ElementaryCriterion.Set (method)
  Set(Coeff: NCollection_HArray2_double): void;
  Set(FirstKnot: number, LastKnot: number): void;

  // FEmTool_ElementaryCriterion.DependenceTable (method)
  DependenceTable(): NCollection_HArray2_int;

  // FEmTool_ElementaryCriterion.Value (method)
  Value(): number;

  // FEmTool_ElementaryCriterion.Hessian (method)
  Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

  // FEmTool_ElementaryCriterion.Gradient (method)
  Gradient(Dim: number, G: math_VectorBase_double): void;

  // FEmTool_ElementaryCriterion.get_type_name (method)
  static get_type_name(): string;

  // FEmTool_ElementaryCriterion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // FEmTool_ElementaryCriterion.DynamicType (method)
  DynamicType(): Standard_Type;

  // FEmTool_ElementaryCriterion.delete (method)
  delete(): void;

  // FEmTool_ElementaryCriterion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_ElementsOfRefMatrix: declare class FEmTool_ElementsOfRefMatrix extends math_FunctionSet

  // FEmTool_ElementsOfRefMatrix.constructor (constructor)
  constructor(TheBase: PLib_HermitJacobi, DerOrder: number);

  // FEmTool_ElementsOfRefMatrix.NbVariables (method)
  NbVariables(): number;

  // FEmTool_ElementsOfRefMatrix.NbEquations (method)
  NbEquations(): number;

  // FEmTool_ElementsOfRefMatrix.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // FEmTool_ElementsOfRefMatrix.delete (method)
  delete(): void;

  // FEmTool_ElementsOfRefMatrix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_LinearFlexion: declare class FEmTool_LinearFlexion extends FEmTool_ElementaryCriterion

  // FEmTool_LinearFlexion.constructor (constructor)
  constructor(WorkDegree: number, ConstraintOrder: GeomAbs_Shape);

  // FEmTool_LinearFlexion.DependenceTable (method)
  DependenceTable(): NCollection_HArray2_int;

  // FEmTool_LinearFlexion.Value (method)
  Value(): number;

  // FEmTool_LinearFlexion.Hessian (method)
  Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

  // FEmTool_LinearFlexion.Gradient (method)
  Gradient(Dim: number, G: math_VectorBase_double): void;

  // FEmTool_LinearFlexion.get_type_name (method)
  static get_type_name(): string;

  // FEmTool_LinearFlexion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // FEmTool_LinearFlexion.DynamicType (method)
  DynamicType(): Standard_Type;

  // FEmTool_LinearFlexion.delete (method)
  delete(): void;

  // FEmTool_LinearFlexion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_LinearJerk: declare class FEmTool_LinearJerk extends FEmTool_ElementaryCriterion

  // FEmTool_LinearJerk.constructor (constructor)
  constructor(WorkDegree: number, ConstraintOrder: GeomAbs_Shape);

  // FEmTool_LinearJerk.DependenceTable (method)
  DependenceTable(): NCollection_HArray2_int;

  // FEmTool_LinearJerk.Value (method)
  Value(): number;

  // FEmTool_LinearJerk.Hessian (method)
  Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

  // FEmTool_LinearJerk.Gradient (method)
  Gradient(Dim: number, G: math_VectorBase_double): void;

  // FEmTool_LinearJerk.get_type_name (method)
  static get_type_name(): string;

  // FEmTool_LinearJerk.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // FEmTool_LinearJerk.DynamicType (method)
  DynamicType(): Standard_Type;

  // FEmTool_LinearJerk.delete (method)
  delete(): void;

  // FEmTool_LinearJerk.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_LinearTension: declare class FEmTool_LinearTension extends FEmTool_ElementaryCriterion

  // FEmTool_LinearTension.constructor (constructor)
  constructor(WorkDegree: number, ConstraintOrder: GeomAbs_Shape);

  // FEmTool_LinearTension.DependenceTable (method)
  DependenceTable(): NCollection_HArray2_int;

  // FEmTool_LinearTension.Value (method)
  Value(): number;

  // FEmTool_LinearTension.Hessian (method)
  Hessian(Dim1: number, Dim2: number, H: math_Matrix): void;

  // FEmTool_LinearTension.Gradient (method)
  Gradient(Dim: number, G: math_VectorBase_double): void;

  // FEmTool_LinearTension.get_type_name (method)
  static get_type_name(): string;

  // FEmTool_LinearTension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // FEmTool_LinearTension.DynamicType (method)
  DynamicType(): Standard_Type;

  // FEmTool_LinearTension.delete (method)
  delete(): void;

  // FEmTool_LinearTension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_ProfileMatrix: declare class FEmTool_ProfileMatrix extends FEmTool_SparseMatrix

  // FEmTool_ProfileMatrix.constructor (constructor)
  constructor(FirstIndexes: NCollection_Array1_int);

  // FEmTool_ProfileMatrix.Init (method)
  Init(Value: number): void;

  // FEmTool_ProfileMatrix.ChangeValue (method)
  ChangeValue(I: number, J: number): number;

  // FEmTool_ProfileMatrix.Decompose (method)
  Decompose(): boolean;

  // FEmTool_ProfileMatrix.Solve (method)
  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
  Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;

  // FEmTool_ProfileMatrix.Prepare (method)
  Prepare(): boolean;

  // FEmTool_ProfileMatrix.Multiplied (method)
  Multiplied(X: math_VectorBase_double, MX: math_VectorBase_double): void;

  // FEmTool_ProfileMatrix.RowNumber (method)
  RowNumber(): number;

  // FEmTool_ProfileMatrix.ColNumber (method)
  ColNumber(): number;

  // FEmTool_ProfileMatrix.IsInProfile (method)
  IsInProfile(i: number, j: number): boolean;

  // FEmTool_ProfileMatrix.OutM (method)
  OutM(): void;

  // FEmTool_ProfileMatrix.OutS (method)
  OutS(): void;

  // FEmTool_ProfileMatrix.get_type_name (method)
  static get_type_name(): string;

  // FEmTool_ProfileMatrix.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // FEmTool_ProfileMatrix.DynamicType (method)
  DynamicType(): Standard_Type;

  // FEmTool_ProfileMatrix.delete (method)
  delete(): void;

  // FEmTool_ProfileMatrix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_SparseMatrix: declare class FEmTool_SparseMatrix extends Standard_Transient

  // FEmTool_SparseMatrix.Init (method)
  Init(Value: number): void;

  // FEmTool_SparseMatrix.ChangeValue (method)
  ChangeValue(I: number, J: number): number;

  // FEmTool_SparseMatrix.Decompose (method)
  Decompose(): boolean;

  // FEmTool_SparseMatrix.Solve (method)
  Solve(B: math_VectorBase_double, X: math_VectorBase_double): void;
  Solve(B: math_VectorBase_double, Init: math_VectorBase_double, X: math_VectorBase_double, Residual: math_VectorBase_double, Tolerance: number, NbIterations: number): void;

  // FEmTool_SparseMatrix.Prepare (method)
  Prepare(): boolean;

  // FEmTool_SparseMatrix.Multiplied (method)
  Multiplied(X: math_VectorBase_double, MX: math_VectorBase_double): void;

  // FEmTool_SparseMatrix.RowNumber (method)
  RowNumber(): number;

  // FEmTool_SparseMatrix.ColNumber (method)
  ColNumber(): number;

  // FEmTool_SparseMatrix.get_type_name (method)
  static get_type_name(): string;

  // FEmTool_SparseMatrix.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // FEmTool_SparseMatrix.DynamicType (method)
  DynamicType(): Standard_Type;

  // FEmTool_SparseMatrix.delete (method)
  delete(): void;

  // FEmTool_SparseMatrix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

FEmTool_AssemblyTable: NCollection_Array2_handle_NCollection_HArray1_int

FEmTool_HAssemblyTable: NCollection_HArray2_handle_NCollection_HArray1_int
