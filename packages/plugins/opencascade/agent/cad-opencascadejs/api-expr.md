# libcascade — Expr

34 top-level symbols. Signatures are verbatim typescript.

Expr: declare class Expr

  // Expr.constructor (constructor)
  constructor();

  // Expr.CopyShare (method)
  static CopyShare(exp: Expr_GeneralExpression): Expr_GeneralExpression;

  // Expr.NbOfFreeVariables (method)
  static NbOfFreeVariables(exp: Expr_GeneralExpression): number;
  static NbOfFreeVariables(exp: Expr_GeneralRelation): number;

  // Expr.Sign (method)
  static Sign(val: number): number;

  // Expr.delete (method)
  delete(): void;

  // Expr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Absolute: declare class Expr_Absolute extends Expr_UnaryExpression

  // Expr_Absolute.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Absolute.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Absolute.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Absolute.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Absolute.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Absolute.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Absolute.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Absolute.String (method)
  String(): TCollection_AsciiString;

  // Expr_Absolute.get_type_name (method)
  static get_type_name(): string;

  // Expr_Absolute.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Absolute.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Absolute.delete (method)
  delete(): void;

  // Expr_Absolute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_ArcCosine: declare class Expr_ArcCosine extends Expr_UnaryExpression

  // Expr_ArcCosine.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_ArcCosine.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_ArcCosine.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_ArcCosine.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_ArcCosine.IsLinear (method)
  IsLinear(): boolean;

  // Expr_ArcCosine.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_ArcCosine.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_ArcCosine.String (method)
  String(): TCollection_AsciiString;

  // Expr_ArcCosine.get_type_name (method)
  static get_type_name(): string;

  // Expr_ArcCosine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_ArcCosine.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_ArcCosine.delete (method)
  delete(): void;

  // Expr_ArcCosine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_ArcSine: declare class Expr_ArcSine extends Expr_UnaryExpression

  // Expr_ArcSine.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_ArcSine.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_ArcSine.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_ArcSine.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_ArcSine.IsLinear (method)
  IsLinear(): boolean;

  // Expr_ArcSine.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_ArcSine.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_ArcSine.String (method)
  String(): TCollection_AsciiString;

  // Expr_ArcSine.get_type_name (method)
  static get_type_name(): string;

  // Expr_ArcSine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_ArcSine.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_ArcSine.delete (method)
  delete(): void;

  // Expr_ArcSine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_ArcTangent: declare class Expr_ArcTangent extends Expr_UnaryExpression

  // Expr_ArcTangent.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_ArcTangent.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_ArcTangent.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_ArcTangent.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_ArcTangent.IsLinear (method)
  IsLinear(): boolean;

  // Expr_ArcTangent.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_ArcTangent.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_ArcTangent.String (method)
  String(): TCollection_AsciiString;

  // Expr_ArcTangent.get_type_name (method)
  static get_type_name(): string;

  // Expr_ArcTangent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_ArcTangent.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_ArcTangent.delete (method)
  delete(): void;

  // Expr_ArcTangent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_ArgCosh: declare class Expr_ArgCosh extends Expr_UnaryExpression

  // Expr_ArgCosh.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_ArgCosh.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_ArgCosh.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_ArgCosh.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_ArgCosh.IsLinear (method)
  IsLinear(): boolean;

  // Expr_ArgCosh.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_ArgCosh.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_ArgCosh.String (method)
  String(): TCollection_AsciiString;

  // Expr_ArgCosh.get_type_name (method)
  static get_type_name(): string;

  // Expr_ArgCosh.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_ArgCosh.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_ArgCosh.delete (method)
  delete(): void;

  // Expr_ArgCosh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_ArgSinh: declare class Expr_ArgSinh extends Expr_UnaryExpression

  // Expr_ArgSinh.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_ArgSinh.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_ArgSinh.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_ArgSinh.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_ArgSinh.IsLinear (method)
  IsLinear(): boolean;

  // Expr_ArgSinh.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_ArgSinh.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_ArgSinh.String (method)
  String(): TCollection_AsciiString;

  // Expr_ArgSinh.get_type_name (method)
  static get_type_name(): string;

  // Expr_ArgSinh.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_ArgSinh.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_ArgSinh.delete (method)
  delete(): void;

  // Expr_ArgSinh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_ArgTanh: declare class Expr_ArgTanh extends Expr_UnaryExpression

  // Expr_ArgTanh.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_ArgTanh.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_ArgTanh.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_ArgTanh.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_ArgTanh.IsLinear (method)
  IsLinear(): boolean;

  // Expr_ArgTanh.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_ArgTanh.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_ArgTanh.String (method)
  String(): TCollection_AsciiString;

  // Expr_ArgTanh.get_type_name (method)
  static get_type_name(): string;

  // Expr_ArgTanh.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_ArgTanh.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_ArgTanh.delete (method)
  delete(): void;

  // Expr_ArgTanh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_BinaryExpression: declare class Expr_BinaryExpression extends Expr_GeneralExpression

  // Expr_BinaryExpression.FirstOperand (method)
  FirstOperand(): Expr_GeneralExpression;

  // Expr_BinaryExpression.SecondOperand (method)
  SecondOperand(): Expr_GeneralExpression;

  // Expr_BinaryExpression.SetFirstOperand (method)
  SetFirstOperand(exp: Expr_GeneralExpression): void;

  // Expr_BinaryExpression.SetSecondOperand (method)
  SetSecondOperand(exp: Expr_GeneralExpression): void;

  // Expr_BinaryExpression.NbSubExpressions (method)
  NbSubExpressions(): number;

  // Expr_BinaryExpression.SubExpression (method)
  SubExpression(I: number): Expr_GeneralExpression;

  // Expr_BinaryExpression.ContainsUnknowns (method)
  ContainsUnknowns(): boolean;

  // Expr_BinaryExpression.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_BinaryExpression.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_BinaryExpression.Simplified (method)
  Simplified(): Expr_GeneralExpression;

  // Expr_BinaryExpression.get_type_name (method)
  static get_type_name(): string;

  // Expr_BinaryExpression.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_BinaryExpression.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_BinaryExpression.delete (method)
  delete(): void;

  // Expr_BinaryExpression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_BinaryFunction: declare class Expr_BinaryFunction extends Expr_BinaryExpression

  // Expr_BinaryFunction.constructor (constructor)
  constructor(func: Expr_GeneralFunction, exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_BinaryFunction.Function (method)
  Function(): Expr_GeneralFunction;

  // Expr_BinaryFunction.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_BinaryFunction.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_BinaryFunction.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_BinaryFunction.IsLinear (method)
  IsLinear(): boolean;

  // Expr_BinaryFunction.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_BinaryFunction.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_BinaryFunction.String (method)
  String(): TCollection_AsciiString;

  // Expr_BinaryFunction.get_type_name (method)
  static get_type_name(): string;

  // Expr_BinaryFunction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_BinaryFunction.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_BinaryFunction.delete (method)
  delete(): void;

  // Expr_BinaryFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Cosh: declare class Expr_Cosh extends Expr_UnaryExpression

  // Expr_Cosh.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Cosh.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Cosh.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Cosh.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Cosh.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Cosh.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Cosh.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Cosh.String (method)
  String(): TCollection_AsciiString;

  // Expr_Cosh.get_type_name (method)
  static get_type_name(): string;

  // Expr_Cosh.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Cosh.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Cosh.delete (method)
  delete(): void;

  // Expr_Cosh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Cosine: declare class Expr_Cosine extends Expr_UnaryExpression

  // Expr_Cosine.constructor (constructor)
  constructor(Exp: Expr_GeneralExpression);

  // Expr_Cosine.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Cosine.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Cosine.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Cosine.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Cosine.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Cosine.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Cosine.String (method)
  String(): TCollection_AsciiString;

  // Expr_Cosine.get_type_name (method)
  static get_type_name(): string;

  // Expr_Cosine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Cosine.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Cosine.delete (method)
  delete(): void;

  // Expr_Cosine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Difference: declare class Expr_Difference extends Expr_BinaryExpression

  // Expr_Difference.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_Difference.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Difference.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Difference.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Difference.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Difference.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Difference.NDerivative (method)
  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  // Expr_Difference.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Difference.String (method)
  String(): TCollection_AsciiString;

  // Expr_Difference.get_type_name (method)
  static get_type_name(): string;

  // Expr_Difference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Difference.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Difference.delete (method)
  delete(): void;

  // Expr_Difference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Different: declare class Expr_Different extends Expr_SingleRelation

  // Expr_Different.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_Different.IsSatisfied (method)
  IsSatisfied(): boolean;

  // Expr_Different.Simplified (method)
  Simplified(): Expr_GeneralRelation;

  // Expr_Different.Simplify (method)
  Simplify(): void;

  // Expr_Different.Copy (method)
  Copy(): Expr_GeneralRelation;

  // Expr_Different.String (method)
  String(): TCollection_AsciiString;

  // Expr_Different.get_type_name (method)
  static get_type_name(): string;

  // Expr_Different.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Different.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Different.delete (method)
  delete(): void;

  // Expr_Different.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Division: declare class Expr_Division extends Expr_BinaryExpression

  // Expr_Division.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_Division.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Division.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Division.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Division.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Division.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Division.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Division.String (method)
  String(): TCollection_AsciiString;

  // Expr_Division.get_type_name (method)
  static get_type_name(): string;

  // Expr_Division.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Division.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Division.delete (method)
  delete(): void;

  // Expr_Division.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Equal: declare class Expr_Equal extends Expr_SingleRelation

  // Expr_Equal.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_Equal.IsSatisfied (method)
  IsSatisfied(): boolean;

  // Expr_Equal.Simplified (method)
  Simplified(): Expr_GeneralRelation;

  // Expr_Equal.Simplify (method)
  Simplify(): void;

  // Expr_Equal.Copy (method)
  Copy(): Expr_GeneralRelation;

  // Expr_Equal.String (method)
  String(): TCollection_AsciiString;

  // Expr_Equal.get_type_name (method)
  static get_type_name(): string;

  // Expr_Equal.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Equal.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Equal.delete (method)
  delete(): void;

  // Expr_Equal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Exponential: declare class Expr_Exponential extends Expr_UnaryExpression

  // Expr_Exponential.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Exponential.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Exponential.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Exponential.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Exponential.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Exponential.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Exponential.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Exponential.String (method)
  String(): TCollection_AsciiString;

  // Expr_Exponential.get_type_name (method)
  static get_type_name(): string;

  // Expr_Exponential.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Exponential.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Exponential.delete (method)
  delete(): void;

  // Expr_Exponential.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Exponentiate: declare class Expr_Exponentiate extends Expr_BinaryExpression

  // Expr_Exponentiate.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_Exponentiate.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Exponentiate.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Exponentiate.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Exponentiate.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Exponentiate.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Exponentiate.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Exponentiate.String (method)
  String(): TCollection_AsciiString;

  // Expr_Exponentiate.get_type_name (method)
  static get_type_name(): string;

  // Expr_Exponentiate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Exponentiate.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Exponentiate.delete (method)
  delete(): void;

  // Expr_Exponentiate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_ExprFailure: declare class Expr_ExprFailure extends Standard_Failure

  // Expr_ExprFailure.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Expr_ExprFailure.ExceptionType (method)
  ExceptionType(): string;

  // Expr_ExprFailure.delete (method)
  delete(): void;

  // Expr_ExprFailure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_FunctionDerivative: declare class Expr_FunctionDerivative extends Expr_GeneralFunction

  // Expr_FunctionDerivative.constructor (constructor)
  constructor(func: Expr_GeneralFunction, withX: Expr_NamedUnknown, deg: number);

  // Expr_FunctionDerivative.NbOfVariables (method)
  NbOfVariables(): number;

  // Expr_FunctionDerivative.Variable (method)
  Variable(index: number): Expr_NamedUnknown;

  // Expr_FunctionDerivative.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_FunctionDerivative.Copy (method)
  Copy(): Expr_GeneralFunction;

  // Expr_FunctionDerivative.Derivative (method)
  Derivative(var_: Expr_NamedUnknown): Expr_GeneralFunction;
  Derivative(var_: Expr_NamedUnknown, deg: number): Expr_GeneralFunction;

  // Expr_FunctionDerivative.IsIdentical (method)
  IsIdentical(func: Expr_GeneralFunction): boolean;

  // Expr_FunctionDerivative.IsLinearOnVariable (method)
  IsLinearOnVariable(index: number): boolean;

  // Expr_FunctionDerivative.Function (method)
  Function(): Expr_GeneralFunction;

  // Expr_FunctionDerivative.Degree (method)
  Degree(): number;

  // Expr_FunctionDerivative.DerivVariable (method)
  DerivVariable(): Expr_NamedUnknown;

  // Expr_FunctionDerivative.GetStringName (method)
  GetStringName(): TCollection_AsciiString;

  // Expr_FunctionDerivative.Expression (method)
  Expression(): Expr_GeneralExpression;

  // Expr_FunctionDerivative.UpdateExpression (method)
  UpdateExpression(): void;

  // Expr_FunctionDerivative.get_type_name (method)
  static get_type_name(): string;

  // Expr_FunctionDerivative.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_FunctionDerivative.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_FunctionDerivative.delete (method)
  delete(): void;

  // Expr_FunctionDerivative.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_GeneralExpression: declare class Expr_GeneralExpression extends Standard_Transient

  // Expr_GeneralExpression.NbSubExpressions (method)
  NbSubExpressions(): number;

  // Expr_GeneralExpression.SubExpression (method)
  SubExpression(I: number): Expr_GeneralExpression;

  // Expr_GeneralExpression.Simplified (method)
  Simplified(): Expr_GeneralExpression;

  // Expr_GeneralExpression.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_GeneralExpression.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_GeneralExpression.ContainsUnknowns (method)
  ContainsUnknowns(): boolean;

  // Expr_GeneralExpression.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_GeneralExpression.IsLinear (method)
  IsLinear(): boolean;

  // Expr_GeneralExpression.IsShareable (method)
  IsShareable(): boolean;

  // Expr_GeneralExpression.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_GeneralExpression.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_GeneralExpression.NDerivative (method)
  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  // Expr_GeneralExpression.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_GeneralExpression.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_GeneralExpression.EvaluateNumeric (method)
  EvaluateNumeric(): number;

  // Expr_GeneralExpression.String (method)
  String(): TCollection_AsciiString;

  // Expr_GeneralExpression.get_type_name (method)
  static get_type_name(): string;

  // Expr_GeneralExpression.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_GeneralExpression.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_GeneralExpression.delete (method)
  delete(): void;

  // Expr_GeneralExpression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_GeneralFunction: declare class Expr_GeneralFunction extends Standard_Transient

  // Expr_GeneralFunction.NbOfVariables (method)
  NbOfVariables(): number;

  // Expr_GeneralFunction.Variable (method)
  Variable(index: number): Expr_NamedUnknown;

  // Expr_GeneralFunction.Copy (method)
  Copy(): Expr_GeneralFunction;

  // Expr_GeneralFunction.Derivative (method)
  Derivative(var_: Expr_NamedUnknown): Expr_GeneralFunction;
  Derivative(var_: Expr_NamedUnknown, deg: number): Expr_GeneralFunction;

  // Expr_GeneralFunction.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_GeneralFunction.IsIdentical (method)
  IsIdentical(func: Expr_GeneralFunction): boolean;

  // Expr_GeneralFunction.IsLinearOnVariable (method)
  IsLinearOnVariable(index: number): boolean;

  // Expr_GeneralFunction.GetStringName (method)
  GetStringName(): TCollection_AsciiString;

  // Expr_GeneralFunction.get_type_name (method)
  static get_type_name(): string;

  // Expr_GeneralFunction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_GeneralFunction.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_GeneralFunction.delete (method)
  delete(): void;

  // Expr_GeneralFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_GeneralRelation: declare class Expr_GeneralRelation extends Standard_Transient

  // Expr_GeneralRelation.IsSatisfied (method)
  IsSatisfied(): boolean;

  // Expr_GeneralRelation.IsLinear (method)
  IsLinear(): boolean;

  // Expr_GeneralRelation.Simplified (method)
  Simplified(): Expr_GeneralRelation;

  // Expr_GeneralRelation.Simplify (method)
  Simplify(): void;

  // Expr_GeneralRelation.Copy (method)
  Copy(): Expr_GeneralRelation;

  // Expr_GeneralRelation.NbOfSubRelations (method)
  NbOfSubRelations(): number;

  // Expr_GeneralRelation.NbOfSingleRelations (method)
  NbOfSingleRelations(): number;

  // Expr_GeneralRelation.SubRelation (method)
  SubRelation(index: number): Expr_GeneralRelation;

  // Expr_GeneralRelation.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_GeneralRelation.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_GeneralRelation.String (method)
  String(): TCollection_AsciiString;

  // Expr_GeneralRelation.get_type_name (method)
  static get_type_name(): string;

  // Expr_GeneralRelation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_GeneralRelation.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_GeneralRelation.delete (method)
  delete(): void;

  // Expr_GeneralRelation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_GreaterThan: declare class Expr_GreaterThan extends Expr_SingleRelation

  // Expr_GreaterThan.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_GreaterThan.IsSatisfied (method)
  IsSatisfied(): boolean;

  // Expr_GreaterThan.Simplified (method)
  Simplified(): Expr_GeneralRelation;

  // Expr_GreaterThan.Simplify (method)
  Simplify(): void;

  // Expr_GreaterThan.Copy (method)
  Copy(): Expr_GeneralRelation;

  // Expr_GreaterThan.String (method)
  String(): TCollection_AsciiString;

  // Expr_GreaterThan.get_type_name (method)
  static get_type_name(): string;

  // Expr_GreaterThan.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_GreaterThan.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_GreaterThan.delete (method)
  delete(): void;

  // Expr_GreaterThan.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_GreaterThanOrEqual: declare class Expr_GreaterThanOrEqual extends Expr_SingleRelation

  // Expr_GreaterThanOrEqual.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_GreaterThanOrEqual.IsSatisfied (method)
  IsSatisfied(): boolean;

  // Expr_GreaterThanOrEqual.Simplified (method)
  Simplified(): Expr_GeneralRelation;

  // Expr_GreaterThanOrEqual.Simplify (method)
  Simplify(): void;

  // Expr_GreaterThanOrEqual.Copy (method)
  Copy(): Expr_GeneralRelation;

  // Expr_GreaterThanOrEqual.String (method)
  String(): TCollection_AsciiString;

  // Expr_GreaterThanOrEqual.get_type_name (method)
  static get_type_name(): string;

  // Expr_GreaterThanOrEqual.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_GreaterThanOrEqual.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_GreaterThanOrEqual.delete (method)
  delete(): void;

  // Expr_GreaterThanOrEqual.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_InvalidAssignment: declare class Expr_InvalidAssignment extends Expr_ExprFailure

  // Expr_InvalidAssignment.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Expr_InvalidAssignment.ExceptionType (method)
  ExceptionType(): string;

  // Expr_InvalidAssignment.delete (method)
  delete(): void;

  // Expr_InvalidAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_InvalidFunction: declare class Expr_InvalidFunction extends Expr_ExprFailure

  // Expr_InvalidFunction.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Expr_InvalidFunction.ExceptionType (method)
  ExceptionType(): string;

  // Expr_InvalidFunction.delete (method)
  delete(): void;

  // Expr_InvalidFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_InvalidOperand: declare class Expr_InvalidOperand extends Expr_ExprFailure

  // Expr_InvalidOperand.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Expr_InvalidOperand.ExceptionType (method)
  ExceptionType(): string;

  // Expr_InvalidOperand.delete (method)
  delete(): void;

  // Expr_InvalidOperand.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_LessThan: declare class Expr_LessThan extends Expr_SingleRelation

  // Expr_LessThan.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_LessThan.IsSatisfied (method)
  IsSatisfied(): boolean;

  // Expr_LessThan.Simplified (method)
  Simplified(): Expr_GeneralRelation;

  // Expr_LessThan.Simplify (method)
  Simplify(): void;

  // Expr_LessThan.Copy (method)
  Copy(): Expr_GeneralRelation;

  // Expr_LessThan.String (method)
  String(): TCollection_AsciiString;

  // Expr_LessThan.get_type_name (method)
  static get_type_name(): string;

  // Expr_LessThan.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_LessThan.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_LessThan.delete (method)
  delete(): void;

  // Expr_LessThan.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_LessThanOrEqual: declare class Expr_LessThanOrEqual extends Expr_SingleRelation

  // Expr_LessThanOrEqual.constructor (constructor)
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_LessThanOrEqual.IsSatisfied (method)
  IsSatisfied(): boolean;

  // Expr_LessThanOrEqual.Simplified (method)
  Simplified(): Expr_GeneralRelation;

  // Expr_LessThanOrEqual.Simplify (method)
  Simplify(): void;

  // Expr_LessThanOrEqual.Copy (method)
  Copy(): Expr_GeneralRelation;

  // Expr_LessThanOrEqual.String (method)
  String(): TCollection_AsciiString;

  // Expr_LessThanOrEqual.get_type_name (method)
  static get_type_name(): string;

  // Expr_LessThanOrEqual.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_LessThanOrEqual.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_LessThanOrEqual.delete (method)
  delete(): void;

  // Expr_LessThanOrEqual.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_LogOf10: declare class Expr_LogOf10 extends Expr_UnaryExpression

  // Expr_LogOf10.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_LogOf10.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_LogOf10.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_LogOf10.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_LogOf10.IsLinear (method)
  IsLinear(): boolean;

  // Expr_LogOf10.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_LogOf10.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_LogOf10.String (method)
  String(): TCollection_AsciiString;

  // Expr_LogOf10.get_type_name (method)
  static get_type_name(): string;

  // Expr_LogOf10.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_LogOf10.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_LogOf10.delete (method)
  delete(): void;

  // Expr_LogOf10.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_LogOfe: declare class Expr_LogOfe extends Expr_UnaryExpression

  // Expr_LogOfe.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_LogOfe.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_LogOfe.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_LogOfe.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_LogOfe.IsLinear (method)
  IsLinear(): boolean;

  // Expr_LogOfe.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_LogOfe.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_LogOfe.String (method)
  String(): TCollection_AsciiString;

  // Expr_LogOfe.get_type_name (method)
  static get_type_name(): string;

  // Expr_LogOfe.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_LogOfe.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_LogOfe.delete (method)
  delete(): void;

  // Expr_LogOfe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_NamedConstant: declare class Expr_NamedConstant extends Expr_NamedExpression

  // Expr_NamedConstant.constructor (constructor)
  constructor(name: TCollection_AsciiString, value: number);

  // Expr_NamedConstant.GetValue (method)
  GetValue(): number;

  // Expr_NamedConstant.NbSubExpressions (method)
  NbSubExpressions(): number;

  // Expr_NamedConstant.SubExpression (method)
  SubExpression(I: number): Expr_GeneralExpression;

  // Expr_NamedConstant.Simplified (method)
  Simplified(): Expr_GeneralExpression;

  // Expr_NamedConstant.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_NamedConstant.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_NamedConstant.ContainsUnknowns (method)
  ContainsUnknowns(): boolean;

  // Expr_NamedConstant.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_NamedConstant.IsLinear (method)
  IsLinear(): boolean;

  // Expr_NamedConstant.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_NamedConstant.NDerivative (method)
  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  // Expr_NamedConstant.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_NamedConstant.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_NamedConstant.get_type_name (method)
  static get_type_name(): string;

  // Expr_NamedConstant.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_NamedConstant.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_NamedConstant.delete (method)
  delete(): void;

  // Expr_NamedConstant.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_NamedExpression: declare class Expr_NamedExpression extends Expr_GeneralExpression

  // Expr_NamedExpression.GetName (method)
  GetName(): TCollection_AsciiString;

  // Expr_NamedExpression.SetName (method)
  SetName(name: TCollection_AsciiString): void;

  // Expr_NamedExpression.IsShareable (method)
  IsShareable(): boolean;

  // Expr_NamedExpression.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_NamedExpression.String (method)
  String(): TCollection_AsciiString;

  // Expr_NamedExpression.get_type_name (method)
  static get_type_name(): string;

  // Expr_NamedExpression.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_NamedExpression.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_NamedExpression.delete (method)
  delete(): void;

  // Expr_NamedExpression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
