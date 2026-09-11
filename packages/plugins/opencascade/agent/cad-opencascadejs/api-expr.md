# libcascade — Expr

35 top-level symbols. Signatures are verbatim typescript.

Expr: declare class Expr

constructor

static CopyShare(exp: Expr_GeneralExpression): Expr_GeneralExpression;

static NbOfFreeVariables(exp: Expr_GeneralExpression): number;
static NbOfFreeVariables(exp: Expr_GeneralRelation): number;
static NbOfFreeVariables(exp: Expr_GeneralExpression): number;
static NbOfFreeVariables(exp: Expr_GeneralRelation): number;

static Sign(val: number): number;

delete(): void;

[Symbol.dispose](): void;

Expr_Absolute: declare class Expr_Absolute extends Expr_UnaryExpression

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

Expr_ArcCosine: declare class Expr_ArcCosine extends Expr_UnaryExpression

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

Expr_ArcSine: declare class Expr_ArcSine extends Expr_UnaryExpression

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

Expr_ArcTangent: declare class Expr_ArcTangent extends Expr_UnaryExpression

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

Expr_ArgCosh: declare class Expr_ArgCosh extends Expr_UnaryExpression

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

Expr_ArgSinh: declare class Expr_ArgSinh extends Expr_UnaryExpression

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

Expr_ArgTanh: declare class Expr_ArgTanh extends Expr_UnaryExpression

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

Expr_BinaryExpression: declare class Expr_BinaryExpression extends Expr_GeneralExpression

FirstOperand(): Expr_GeneralExpression;

SecondOperand(): Expr_GeneralExpression;

SetFirstOperand(exp: Expr_GeneralExpression): void;

SetSecondOperand(exp: Expr_GeneralExpression): void;

NbSubExpressions(): number;

SubExpression(I: number): Expr_GeneralExpression;

ContainsUnknowns(): boolean;

Contains(exp: Expr_GeneralExpression): boolean;

Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

Simplified(): Expr_GeneralExpression;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_BinaryFunction: declare class Expr_BinaryFunction extends Expr_BinaryExpression

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

Expr_Cosh: declare class Expr_Cosh extends Expr_UnaryExpression

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

Expr_Cosine: declare class Expr_Cosine extends Expr_UnaryExpression

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

Expr_Difference: declare class Expr_Difference extends Expr_BinaryExpression

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

Expr_Different: declare class Expr_Different extends Expr_SingleRelation

constructor

IsSatisfied(): boolean;

Simplified(): Expr_GeneralRelation;

Simplify(): void;

Copy(): Expr_GeneralRelation;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_Division: declare class Expr_Division extends Expr_BinaryExpression

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

Expr_Equal: declare class Expr_Equal extends Expr_SingleRelation

constructor

IsSatisfied(): boolean;

Simplified(): Expr_GeneralRelation;

Simplify(): void;

Copy(): Expr_GeneralRelation;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_Exponential: declare class Expr_Exponential extends Expr_UnaryExpression

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

Expr_Exponentiate: declare class Expr_Exponentiate extends Expr_BinaryExpression

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

Expr_ExprFailure: declare class Expr_ExprFailure extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Expr_FunctionDerivative: declare class Expr_FunctionDerivative extends Expr_GeneralFunction

constructor

NbOfVariables(): number;

Variable(index: number): Expr_NamedUnknown;

Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

Copy(): Expr_GeneralFunction;

Derivative(var*: Expr_NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown, deg: number): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr_NamedUnknown, deg: number): Expr_GeneralFunction;

IsIdentical(func: Expr_GeneralFunction): boolean;

IsLinearOnVariable(index: number): boolean;

Function(): Expr_GeneralFunction;

Degree(): number;

DerivVariable(): Expr_NamedUnknown;

GetStringName(): TCollection_AsciiString;

Expression(): Expr_GeneralExpression;

UpdateExpression(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_GeneralExpression: declare class Expr_GeneralExpression extends Standard_Transient

NbSubExpressions(): number;

SubExpression(I: number): Expr_GeneralExpression;

Simplified(): Expr_GeneralExpression;

ShallowSimplified(): Expr_GeneralExpression;

Copy(): Expr_GeneralExpression;

ContainsUnknowns(): boolean;

Contains(exp: Expr_GeneralExpression): boolean;

IsLinear(): boolean;

IsShareable(): boolean;

IsIdentical(Other: Expr_GeneralExpression): boolean;

Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

EvaluateNumeric(): number;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_GeneralFunction: declare class Expr_GeneralFunction extends Standard_Transient

NbOfVariables(): number;

Variable(index: number): Expr_NamedUnknown;

Copy(): Expr_GeneralFunction;

Derivative(var*: Expr_NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown, deg: number): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr_NamedUnknown, deg: number): Expr_GeneralFunction;

Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

IsIdentical(func: Expr_GeneralFunction): boolean;

IsLinearOnVariable(index: number): boolean;

GetStringName(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_GeneralRelation: declare class Expr_GeneralRelation extends Standard_Transient

IsSatisfied(): boolean;

IsLinear(): boolean;

Simplified(): Expr_GeneralRelation;

Simplify(): void;

Copy(): Expr_GeneralRelation;

NbOfSubRelations(): number;

NbOfSingleRelations(): number;

SubRelation(index: number): Expr_GeneralRelation;

Contains(exp: Expr_GeneralExpression): boolean;

Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_GreaterThan: declare class Expr_GreaterThan extends Expr_SingleRelation

constructor

IsSatisfied(): boolean;

Simplified(): Expr_GeneralRelation;

Simplify(): void;

Copy(): Expr_GeneralRelation;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_GreaterThanOrEqual: declare class Expr_GreaterThanOrEqual extends Expr_SingleRelation

constructor

IsSatisfied(): boolean;

Simplified(): Expr_GeneralRelation;

Simplify(): void;

Copy(): Expr_GeneralRelation;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_InvalidAssignment: declare class Expr_InvalidAssignment extends Expr_ExprFailure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Expr_InvalidFunction: declare class Expr_InvalidFunction extends Expr_ExprFailure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Expr_InvalidOperand: declare class Expr_InvalidOperand extends Expr_ExprFailure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Expr_LessThan: declare class Expr_LessThan extends Expr_SingleRelation

constructor

IsSatisfied(): boolean;

Simplified(): Expr_GeneralRelation;

Simplify(): void;

Copy(): Expr_GeneralRelation;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_LessThanOrEqual: declare class Expr_LessThanOrEqual extends Expr_SingleRelation

constructor

IsSatisfied(): boolean;

Simplified(): Expr_GeneralRelation;

Simplify(): void;

Copy(): Expr_GeneralRelation;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_LogOf10: declare class Expr_LogOf10 extends Expr_UnaryExpression

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

Expr_LogOfe: declare class Expr_LogOfe extends Expr_UnaryExpression

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

Expr_NamedConstant: declare class Expr_NamedConstant extends Expr_NamedExpression

constructor

GetValue(): number;

NbSubExpressions(): number;

SubExpression(I: number): Expr_GeneralExpression;

Simplified(): Expr_GeneralExpression;

ShallowSimplified(): Expr_GeneralExpression;

Copy(): Expr_GeneralExpression;

ContainsUnknowns(): boolean;

Contains(exp: Expr_GeneralExpression): boolean;

IsLinear(): boolean;

Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_NamedExpression: declare class Expr_NamedExpression extends Expr_GeneralExpression

GetName(): TCollection_AsciiString;

SetName(name: TCollection_AsciiString): void;

IsShareable(): boolean;

IsIdentical(Other: Expr_GeneralExpression): boolean;

String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Expr_NamedFunction: declare class Expr_NamedFunction extends Expr_GeneralFunction

constructor

SetName(newname: TCollection_AsciiString): void;

GetName(): TCollection_AsciiString;

NbOfVariables(): number;

Variable(index: number): Expr_NamedUnknown;

Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

Copy(): Expr_GeneralFunction;

Derivative(var*: Expr_NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown, deg: number): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr_NamedUnknown, deg: number): Expr_GeneralFunction;

IsIdentical(func: Expr_GeneralFunction): boolean;

IsLinearOnVariable(index: number): boolean;

GetStringName(): TCollection_AsciiString;

Expression(): Expr_GeneralExpression;

SetExpression(exp: Expr_GeneralExpression): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
