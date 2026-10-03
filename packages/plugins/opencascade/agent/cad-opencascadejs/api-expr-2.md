# libcascade — Expr (2)

26 top-level symbols. Signatures are verbatim typescript.

Expr_NamedFunction: declare class Expr_NamedFunction extends Expr_GeneralFunction

  // Expr_NamedFunction.constructor (constructor)
  constructor(name: TCollection_AsciiString, exp: Expr_GeneralExpression, vars: NCollection_Array1_handle_Expr_NamedUnknown);

  // Expr_NamedFunction.SetName (method)
  SetName(newname: TCollection_AsciiString): void;

  // Expr_NamedFunction.GetName (method)
  GetName(): TCollection_AsciiString;

  // Expr_NamedFunction.NbOfVariables (method)
  NbOfVariables(): number;

  // Expr_NamedFunction.Variable (method)
  Variable(index: number): Expr_NamedUnknown;

  // Expr_NamedFunction.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_NamedFunction.Copy (method)
  Copy(): Expr_GeneralFunction;

  // Expr_NamedFunction.Derivative (method)
  Derivative(var_: Expr_NamedUnknown): Expr_GeneralFunction;
  Derivative(var_: Expr_NamedUnknown, deg: number): Expr_GeneralFunction;

  // Expr_NamedFunction.IsIdentical (method)
  IsIdentical(func: Expr_GeneralFunction): boolean;

  // Expr_NamedFunction.IsLinearOnVariable (method)
  IsLinearOnVariable(index: number): boolean;

  // Expr_NamedFunction.GetStringName (method)
  GetStringName(): TCollection_AsciiString;

  // Expr_NamedFunction.Expression (method)
  Expression(): Expr_GeneralExpression;

  // Expr_NamedFunction.SetExpression (method)
  SetExpression(exp: Expr_GeneralExpression): void;

  // Expr_NamedFunction.get_type_name (method)
  static get_type_name(): string;

  // Expr_NamedFunction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_NamedFunction.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_NamedFunction.delete (method)
  delete(): void;

  // Expr_NamedFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_NamedUnknown: declare class Expr_NamedUnknown extends Expr_NamedExpression

  // Expr_NamedUnknown.constructor (constructor)
  constructor(name: TCollection_AsciiString);

  // Expr_NamedUnknown.IsAssigned (method)
  IsAssigned(): boolean;

  // Expr_NamedUnknown.AssignedExpression (method)
  AssignedExpression(): Expr_GeneralExpression;

  // Expr_NamedUnknown.Assign (method)
  Assign(exp: Expr_GeneralExpression): void;

  // Expr_NamedUnknown.Deassign (method)
  Deassign(): void;

  // Expr_NamedUnknown.NbSubExpressions (method)
  NbSubExpressions(): number;

  // Expr_NamedUnknown.SubExpression (method)
  SubExpression(I: number): Expr_GeneralExpression;

  // Expr_NamedUnknown.Simplified (method)
  Simplified(): Expr_GeneralExpression;

  // Expr_NamedUnknown.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_NamedUnknown.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_NamedUnknown.ContainsUnknowns (method)
  ContainsUnknowns(): boolean;

  // Expr_NamedUnknown.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_NamedUnknown.IsLinear (method)
  IsLinear(): boolean;

  // Expr_NamedUnknown.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_NamedUnknown.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_NamedUnknown.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_NamedUnknown.get_type_name (method)
  static get_type_name(): string;

  // Expr_NamedUnknown.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_NamedUnknown.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_NamedUnknown.delete (method)
  delete(): void;

  // Expr_NamedUnknown.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_NotAssigned: declare class Expr_NotAssigned extends Expr_ExprFailure

  // Expr_NotAssigned.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Expr_NotAssigned.ExceptionType (method)
  ExceptionType(): string;

  // Expr_NotAssigned.delete (method)
  delete(): void;

  // Expr_NotAssigned.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_NotEvaluable: declare class Expr_NotEvaluable extends Expr_ExprFailure

  // Expr_NotEvaluable.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Expr_NotEvaluable.ExceptionType (method)
  ExceptionType(): string;

  // Expr_NotEvaluable.delete (method)
  delete(): void;

  // Expr_NotEvaluable.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_NumericValue: declare class Expr_NumericValue extends Expr_GeneralExpression

  // Expr_NumericValue.constructor (constructor)
  constructor(val: number);

  // Expr_NumericValue.GetValue (method)
  GetValue(): number;

  // Expr_NumericValue.SetValue (method)
  SetValue(val: number): void;

  // Expr_NumericValue.NbSubExpressions (method)
  NbSubExpressions(): number;

  // Expr_NumericValue.SubExpression (method)
  SubExpression(I: number): Expr_GeneralExpression;

  // Expr_NumericValue.Simplified (method)
  Simplified(): Expr_GeneralExpression;

  // Expr_NumericValue.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_NumericValue.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_NumericValue.ContainsUnknowns (method)
  ContainsUnknowns(): boolean;

  // Expr_NumericValue.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_NumericValue.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_NumericValue.IsLinear (method)
  IsLinear(): boolean;

  // Expr_NumericValue.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_NumericValue.NDerivative (method)
  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  // Expr_NumericValue.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_NumericValue.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_NumericValue.String (method)
  String(): TCollection_AsciiString;

  // Expr_NumericValue.get_type_name (method)
  static get_type_name(): string;

  // Expr_NumericValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_NumericValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_NumericValue.delete (method)
  delete(): void;

  // Expr_NumericValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_PolyExpression: declare class Expr_PolyExpression extends Expr_GeneralExpression

  // Expr_PolyExpression.NbOperands (method)
  NbOperands(): number;

  // Expr_PolyExpression.Operand (method)
  Operand(index: number): Expr_GeneralExpression;

  // Expr_PolyExpression.SetOperand (method)
  SetOperand(exp: Expr_GeneralExpression, index: number): void;

  // Expr_PolyExpression.NbSubExpressions (method)
  NbSubExpressions(): number;

  // Expr_PolyExpression.SubExpression (method)
  SubExpression(I: number): Expr_GeneralExpression;

  // Expr_PolyExpression.ContainsUnknowns (method)
  ContainsUnknowns(): boolean;

  // Expr_PolyExpression.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_PolyExpression.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_PolyExpression.Simplified (method)
  Simplified(): Expr_GeneralExpression;

  // Expr_PolyExpression.get_type_name (method)
  static get_type_name(): string;

  // Expr_PolyExpression.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_PolyExpression.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_PolyExpression.delete (method)
  delete(): void;

  // Expr_PolyExpression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_PolyFunction: declare class Expr_PolyFunction extends Expr_PolyExpression

  // Expr_PolyFunction.constructor (constructor)
  constructor(func: Expr_GeneralFunction, exps: NCollection_Array1_handle_Expr_GeneralExpression);

  // Expr_PolyFunction.Function (method)
  Function(): Expr_GeneralFunction;

  // Expr_PolyFunction.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_PolyFunction.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_PolyFunction.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_PolyFunction.IsLinear (method)
  IsLinear(): boolean;

  // Expr_PolyFunction.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_PolyFunction.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_PolyFunction.String (method)
  String(): TCollection_AsciiString;

  // Expr_PolyFunction.get_type_name (method)
  static get_type_name(): string;

  // Expr_PolyFunction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_PolyFunction.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_PolyFunction.delete (method)
  delete(): void;

  // Expr_PolyFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Product: declare class Expr_Product extends Expr_PolyExpression

  // Expr_Product.constructor (constructor)
  constructor(exps: NCollection_Sequence_handle_Expr_GeneralExpression);
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_Product.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Product.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Product.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Product.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Product.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Product.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Product.String (method)
  String(): TCollection_AsciiString;

  // Expr_Product.get_type_name (method)
  static get_type_name(): string;

  // Expr_Product.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Product.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Product.delete (method)
  delete(): void;

  // Expr_Product.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_RUIterator: declare class Expr_RUIterator

  // Expr_RUIterator.constructor (constructor)
  constructor(rel: Expr_GeneralRelation);

  // Expr_RUIterator.More (method)
  More(): boolean;

  // Expr_RUIterator.Next (method)
  Next(): void;

  // Expr_RUIterator.Value (method)
  Value(): Expr_NamedUnknown;

  // Expr_RUIterator.delete (method)
  delete(): void;

  // Expr_RUIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_RelationIterator: declare class Expr_RelationIterator

  // Expr_RelationIterator.constructor (constructor)
  constructor(rel: Expr_GeneralRelation);

  // Expr_RelationIterator.More (method)
  More(): boolean;

  // Expr_RelationIterator.Next (method)
  Next(): void;

  // Expr_RelationIterator.Value (method)
  Value(): Expr_SingleRelation;

  // Expr_RelationIterator.delete (method)
  delete(): void;

  // Expr_RelationIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Sign: declare class Expr_Sign extends Expr_UnaryExpression

  // Expr_Sign.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Sign.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Sign.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Sign.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Sign.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Sign.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Sign.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Sign.String (method)
  String(): TCollection_AsciiString;

  // Expr_Sign.get_type_name (method)
  static get_type_name(): string;

  // Expr_Sign.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Sign.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Sign.delete (method)
  delete(): void;

  // Expr_Sign.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Sine: declare class Expr_Sine extends Expr_UnaryExpression

  // Expr_Sine.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Sine.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Sine.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Sine.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Sine.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Sine.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Sine.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Sine.String (method)
  String(): TCollection_AsciiString;

  // Expr_Sine.get_type_name (method)
  static get_type_name(): string;

  // Expr_Sine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Sine.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Sine.delete (method)
  delete(): void;

  // Expr_Sine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_SingleRelation: declare class Expr_SingleRelation extends Expr_GeneralRelation

  // Expr_SingleRelation.SetFirstMember (method)
  SetFirstMember(exp: Expr_GeneralExpression): void;

  // Expr_SingleRelation.SetSecondMember (method)
  SetSecondMember(exp: Expr_GeneralExpression): void;

  // Expr_SingleRelation.FirstMember (method)
  FirstMember(): Expr_GeneralExpression;

  // Expr_SingleRelation.SecondMember (method)
  SecondMember(): Expr_GeneralExpression;

  // Expr_SingleRelation.IsLinear (method)
  IsLinear(): boolean;

  // Expr_SingleRelation.NbOfSubRelations (method)
  NbOfSubRelations(): number;

  // Expr_SingleRelation.NbOfSingleRelations (method)
  NbOfSingleRelations(): number;

  // Expr_SingleRelation.SubRelation (method)
  SubRelation(index: number): Expr_GeneralRelation;

  // Expr_SingleRelation.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_SingleRelation.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_SingleRelation.get_type_name (method)
  static get_type_name(): string;

  // Expr_SingleRelation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_SingleRelation.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_SingleRelation.delete (method)
  delete(): void;

  // Expr_SingleRelation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Sinh: declare class Expr_Sinh extends Expr_UnaryExpression

  // Expr_Sinh.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Sinh.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Sinh.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Sinh.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Sinh.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Sinh.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Sinh.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Sinh.String (method)
  String(): TCollection_AsciiString;

  // Expr_Sinh.get_type_name (method)
  static get_type_name(): string;

  // Expr_Sinh.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Sinh.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Sinh.delete (method)
  delete(): void;

  // Expr_Sinh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Square: declare class Expr_Square extends Expr_UnaryExpression

  // Expr_Square.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Square.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Square.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Square.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Square.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Square.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Square.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Square.String (method)
  String(): TCollection_AsciiString;

  // Expr_Square.get_type_name (method)
  static get_type_name(): string;

  // Expr_Square.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Square.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Square.delete (method)
  delete(): void;

  // Expr_Square.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_SquareRoot: declare class Expr_SquareRoot extends Expr_UnaryExpression

  // Expr_SquareRoot.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_SquareRoot.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_SquareRoot.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_SquareRoot.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_SquareRoot.IsLinear (method)
  IsLinear(): boolean;

  // Expr_SquareRoot.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_SquareRoot.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_SquareRoot.String (method)
  String(): TCollection_AsciiString;

  // Expr_SquareRoot.get_type_name (method)
  static get_type_name(): string;

  // Expr_SquareRoot.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_SquareRoot.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_SquareRoot.delete (method)
  delete(): void;

  // Expr_SquareRoot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Sum: declare class Expr_Sum extends Expr_PolyExpression

  // Expr_Sum.constructor (constructor)
  constructor(exps: NCollection_Sequence_handle_Expr_GeneralExpression);
  constructor(exp1: Expr_GeneralExpression, exp2: Expr_GeneralExpression);

  // Expr_Sum.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Sum.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Sum.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Sum.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Sum.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Sum.NDerivative (method)
  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  // Expr_Sum.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Sum.String (method)
  String(): TCollection_AsciiString;

  // Expr_Sum.get_type_name (method)
  static get_type_name(): string;

  // Expr_Sum.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Sum.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Sum.delete (method)
  delete(): void;

  // Expr_Sum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_SystemRelation: declare class Expr_SystemRelation extends Expr_GeneralRelation

  // Expr_SystemRelation.constructor (constructor)
  constructor(relation: Expr_GeneralRelation);

  // Expr_SystemRelation.Add (method)
  Add(relation: Expr_GeneralRelation): void;

  // Expr_SystemRelation.Remove (method)
  Remove(relation: Expr_GeneralRelation): void;

  // Expr_SystemRelation.IsLinear (method)
  IsLinear(): boolean;

  // Expr_SystemRelation.NbOfSubRelations (method)
  NbOfSubRelations(): number;

  // Expr_SystemRelation.NbOfSingleRelations (method)
  NbOfSingleRelations(): number;

  // Expr_SystemRelation.SubRelation (method)
  SubRelation(index: number): Expr_GeneralRelation;

  // Expr_SystemRelation.IsSatisfied (method)
  IsSatisfied(): boolean;

  // Expr_SystemRelation.Simplified (method)
  Simplified(): Expr_GeneralRelation;

  // Expr_SystemRelation.Simplify (method)
  Simplify(): void;

  // Expr_SystemRelation.Copy (method)
  Copy(): Expr_GeneralRelation;

  // Expr_SystemRelation.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_SystemRelation.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_SystemRelation.String (method)
  String(): TCollection_AsciiString;

  // Expr_SystemRelation.get_type_name (method)
  static get_type_name(): string;

  // Expr_SystemRelation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_SystemRelation.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_SystemRelation.delete (method)
  delete(): void;

  // Expr_SystemRelation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Tangent: declare class Expr_Tangent extends Expr_UnaryExpression

  // Expr_Tangent.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Tangent.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Tangent.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Tangent.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Tangent.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Tangent.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Tangent.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Tangent.String (method)
  String(): TCollection_AsciiString;

  // Expr_Tangent.get_type_name (method)
  static get_type_name(): string;

  // Expr_Tangent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Tangent.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Tangent.delete (method)
  delete(): void;

  // Expr_Tangent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Tanh: declare class Expr_Tanh extends Expr_UnaryExpression

  // Expr_Tanh.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_Tanh.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_Tanh.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_Tanh.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_Tanh.IsLinear (method)
  IsLinear(): boolean;

  // Expr_Tanh.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_Tanh.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_Tanh.String (method)
  String(): TCollection_AsciiString;

  // Expr_Tanh.get_type_name (method)
  static get_type_name(): string;

  // Expr_Tanh.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_Tanh.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_Tanh.delete (method)
  delete(): void;

  // Expr_Tanh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_UnaryExpression: declare class Expr_UnaryExpression extends Expr_GeneralExpression

  // Expr_UnaryExpression.Operand (method)
  Operand(): Expr_GeneralExpression;

  // Expr_UnaryExpression.SetOperand (method)
  SetOperand(exp: Expr_GeneralExpression): void;

  // Expr_UnaryExpression.NbSubExpressions (method)
  NbSubExpressions(): number;

  // Expr_UnaryExpression.SubExpression (method)
  SubExpression(I: number): Expr_GeneralExpression;

  // Expr_UnaryExpression.ContainsUnknowns (method)
  ContainsUnknowns(): boolean;

  // Expr_UnaryExpression.Contains (method)
  Contains(exp: Expr_GeneralExpression): boolean;

  // Expr_UnaryExpression.Replace (method)
  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  // Expr_UnaryExpression.Simplified (method)
  Simplified(): Expr_GeneralExpression;

  // Expr_UnaryExpression.get_type_name (method)
  static get_type_name(): string;

  // Expr_UnaryExpression.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_UnaryExpression.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_UnaryExpression.delete (method)
  delete(): void;

  // Expr_UnaryExpression.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_UnaryFunction: declare class Expr_UnaryFunction extends Expr_UnaryExpression

  // Expr_UnaryFunction.constructor (constructor)
  constructor(func: Expr_GeneralFunction, exp: Expr_GeneralExpression);

  // Expr_UnaryFunction.Function (method)
  Function(): Expr_GeneralFunction;

  // Expr_UnaryFunction.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_UnaryFunction.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_UnaryFunction.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_UnaryFunction.IsLinear (method)
  IsLinear(): boolean;

  // Expr_UnaryFunction.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_UnaryFunction.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_UnaryFunction.String (method)
  String(): TCollection_AsciiString;

  // Expr_UnaryFunction.get_type_name (method)
  static get_type_name(): string;

  // Expr_UnaryFunction.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_UnaryFunction.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_UnaryFunction.delete (method)
  delete(): void;

  // Expr_UnaryFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_UnaryMinus: declare class Expr_UnaryMinus extends Expr_UnaryExpression

  // Expr_UnaryMinus.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_UnaryMinus.ShallowSimplified (method)
  ShallowSimplified(): Expr_GeneralExpression;

  // Expr_UnaryMinus.Copy (method)
  Copy(): Expr_GeneralExpression;

  // Expr_UnaryMinus.IsIdentical (method)
  IsIdentical(Other: Expr_GeneralExpression): boolean;

  // Expr_UnaryMinus.IsLinear (method)
  IsLinear(): boolean;

  // Expr_UnaryMinus.Derivative (method)
  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  // Expr_UnaryMinus.NDerivative (method)
  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  // Expr_UnaryMinus.Evaluate (method)
  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  // Expr_UnaryMinus.String (method)
  String(): TCollection_AsciiString;

  // Expr_UnaryMinus.get_type_name (method)
  static get_type_name(): string;

  // Expr_UnaryMinus.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Expr_UnaryMinus.DynamicType (method)
  DynamicType(): Standard_Type;

  // Expr_UnaryMinus.delete (method)
  delete(): void;

  // Expr_UnaryMinus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_UnknownIterator: declare class Expr_UnknownIterator

  // Expr_UnknownIterator.constructor (constructor)
  constructor(exp: Expr_GeneralExpression);

  // Expr_UnknownIterator.More (method)
  More(): boolean;

  // Expr_UnknownIterator.Next (method)
  Next(): void;

  // Expr_UnknownIterator.Value (method)
  Value(): Expr_NamedUnknown;

  // Expr_UnknownIterator.delete (method)
  delete(): void;

  // Expr_UnknownIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Expr_Array1OfGeneralExpression: NCollection_Array1_handle_Expr_GeneralExpression

Expr_SequenceOfGeneralExpression: NCollection_Sequence_handle_Expr_GeneralExpression
