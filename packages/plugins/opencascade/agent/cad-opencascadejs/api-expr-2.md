# libcascade — Expr (2)

25 top-level symbols. Signatures are verbatim typescript.

Expr_NamedUnknown: declare class Expr_NamedUnknown extends Expr_NamedExpression

  constructor

  IsAssigned(): boolean;

  AssignedExpression(): Expr_GeneralExpression;

  Assign(exp: Expr_GeneralExpression): void;

  Deassign(): void;

  NbSubExpressions(): number;

  SubExpression(I: number): Expr_GeneralExpression;

  Simplified(): Expr_GeneralExpression;

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  ContainsUnknowns(): boolean;

  Contains(exp: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_NotAssigned: declare class Expr_NotAssigned extends Expr_ExprFailure

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Expr_NotEvaluable: declare class Expr_NotEvaluable extends Expr_ExprFailure

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Expr_NumericValue: declare class Expr_NumericValue extends Expr_GeneralExpression

  constructor

  GetValue(): number;

  SetValue(val: number): void;

  NbSubExpressions(): number;

  SubExpression(I: number): Expr_GeneralExpression;

  Simplified(): Expr_GeneralExpression;

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  ContainsUnknowns(): boolean;

  Contains(exp: Expr_GeneralExpression): boolean;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_PolyExpression: declare class Expr_PolyExpression extends Expr_GeneralExpression

  NbOperands(): number;

  Operand(index: number): Expr_GeneralExpression;

  SetOperand(exp: Expr_GeneralExpression, index: number): void;

  NbSubExpressions(): number;

  SubExpression(I: number): Expr_GeneralExpression;

  ContainsUnknowns(): boolean;

  Contains(exp: Expr_GeneralExpression): boolean;

  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  Simplified(): Expr_GeneralExpression;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_PolyFunction: declare class Expr_PolyFunction extends Expr_PolyExpression

  constructor

  Function(): Expr_GeneralFunction;

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Product: declare class Expr_Product extends Expr_PolyExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_RUIterator: declare class Expr_RUIterator

  constructor

  More(): boolean;

  Next(): void;

  Value(): Expr_NamedUnknown;

  delete(): void;

  [Symbol.dispose](): void;

Expr_RelationIterator: declare class Expr_RelationIterator

  constructor

  More(): boolean;

  Next(): void;

  Value(): Expr_SingleRelation;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Sign: declare class Expr_Sign extends Expr_UnaryExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Sine: declare class Expr_Sine extends Expr_UnaryExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_SingleRelation: declare class Expr_SingleRelation extends Expr_GeneralRelation

  SetFirstMember(exp: Expr_GeneralExpression): void;

  SetSecondMember(exp: Expr_GeneralExpression): void;

  FirstMember(): Expr_GeneralExpression;

  SecondMember(): Expr_GeneralExpression;

  IsLinear(): boolean;

  NbOfSubRelations(): number;

  NbOfSingleRelations(): number;

  SubRelation(index: number): Expr_GeneralRelation;

  Contains(exp: Expr_GeneralExpression): boolean;

  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Sinh: declare class Expr_Sinh extends Expr_UnaryExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Square: declare class Expr_Square extends Expr_UnaryExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_SquareRoot: declare class Expr_SquareRoot extends Expr_UnaryExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Sum: declare class Expr_Sum extends Expr_PolyExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_SystemRelation: declare class Expr_SystemRelation extends Expr_GeneralRelation

  constructor

  Add(relation: Expr_GeneralRelation): void;

  Remove(relation: Expr_GeneralRelation): void;

  IsLinear(): boolean;

  NbOfSubRelations(): number;

  NbOfSingleRelations(): number;

  SubRelation(index: number): Expr_GeneralRelation;

  IsSatisfied(): boolean;

  Simplified(): Expr_GeneralRelation;

  Simplify(): void;

  Copy(): Expr_GeneralRelation;

  Contains(exp: Expr_GeneralExpression): boolean;

  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Tangent: declare class Expr_Tangent extends Expr_UnaryExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Tanh: declare class Expr_Tanh extends Expr_UnaryExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_UnaryExpression: declare class Expr_UnaryExpression extends Expr_GeneralExpression

  Operand(): Expr_GeneralExpression;

  SetOperand(exp: Expr_GeneralExpression): void;

  NbSubExpressions(): number;

  SubExpression(I: number): Expr_GeneralExpression;

  ContainsUnknowns(): boolean;

  Contains(exp: Expr_GeneralExpression): boolean;

  Replace(var_: Expr_NamedUnknown, with_: Expr_GeneralExpression): void;

  Simplified(): Expr_GeneralExpression;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_UnaryFunction: declare class Expr_UnaryFunction extends Expr_UnaryExpression

  constructor

  Function(): Expr_GeneralFunction;

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_UnaryMinus: declare class Expr_UnaryMinus extends Expr_UnaryExpression

  constructor

  ShallowSimplified(): Expr_GeneralExpression;

  Copy(): Expr_GeneralExpression;

  IsIdentical(Other: Expr_GeneralExpression): boolean;

  IsLinear(): boolean;

  Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

  NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

  Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

  String(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Expr_UnknownIterator: declare class Expr_UnknownIterator

  constructor

  More(): boolean;

  Next(): void;

  Value(): Expr_NamedUnknown;

  delete(): void;

  [Symbol.dispose](): void;

Expr_Array1OfGeneralExpression: NCollection_Array1_handle_Expr_GeneralExpression

Expr_SequenceOfGeneralExpression: NCollection_Sequence_handle_Expr_GeneralExpression
