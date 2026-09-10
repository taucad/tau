# libcascade — Expr

20 top-level symbols. Signatures are verbatim typescript.

// This package describes the data structure of any expression, relation or function used in mathematics
Expr: declare class Expr

constructor

static CopyShare(exp: Expr_GeneralExpression): Expr_GeneralExpression;

static NbOfFreeVariables(exp: Expr_GeneralExpression): number;
static NbOfFreeVariables(exp: Expr_GeneralRelation): number;
static NbOfFreeVariables(exp: Expr_GeneralExpression): number;
static NbOfFreeVariables(exp: Expr_GeneralRelation): number;

static Sign(val: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Absolute: declare class Expr_Absolute extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_ArcCosine: declare class Expr_ArcCosine extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_ArcSine: declare class Expr_ArcSine extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_ArcTangent: declare class Expr_ArcTangent extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_ArgCosh: declare class Expr_ArgCosh extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_ArgSinh: declare class Expr_ArgSinh extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_ArgTanh: declare class Expr_ArgTanh extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines all binary expressions
Expr_BinaryExpression: declare class Expr_BinaryExpression extends Expr_GeneralExpression

FirstOperand(): Expr_GeneralExpression;

SecondOperand(): Expr_GeneralExpression;

// Sets first operand of <me> Raises InvalidOperand if exp = me
SetFirstOperand(exp: Expr_GeneralExpression): void;

// Sets second operand of <me> Raises InvalidOperand if <exp> contains <me>
SetSecondOperand(exp: Expr_GeneralExpression): void;

// returns the number of sub-expressions contained in <me> ( >= 0)
NbSubExpressions(): number;

// returns the _-th sub-expression of <me> raises OutOfRange if _> NbSubExpressions(me)\*\*
SubExpression(I: number): Expr_GeneralExpression;

// Does <me> contain NamedUnknown ?
ContainsUnknowns(): boolean;

// Tests if <me> contains <exp>
Contains(exp: Expr_GeneralExpression): boolean;

// Replaces all occurrences of \*with <with> in <me>
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

// Returns a GeneralExpression after replacement of NamedUnknowns by an associated expression and after values computation
Simplified(): Expr_GeneralExpression;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the use of a binary function in an expression with given arguments
Expr_BinaryFunction: declare class Expr_BinaryFunction extends Expr_BinaryExpression

constructor

// Returns the function defining <me>
Function(): Expr_GeneralFunction;

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Cosh: declare class Expr_Cosh extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Cosine: declare class Expr_Cosine extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Difference: declare class Expr_Difference extends Expr_BinaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the <N>-th derivative on <X> unknown of <me>
NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Different: declare class Expr_Different extends Expr_SingleRelation

constructor

// Returns the current status of the relation
IsSatisfied(): boolean;

// Returns a GeneralRelation after replacement of NamedUnknowns by an associated expression, and after values computation
Simplified(): Expr_GeneralRelation;

// Replaces NamedUnknowns by associated expressions, and computes values in <me>
Simplify(): void;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralRelation;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Division: declare class Expr_Division extends Expr_BinaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Equal: declare class Expr_Equal extends Expr_SingleRelation

constructor

// Returns the current status of the relation
IsSatisfied(): boolean;

// returns a GeneralRelation after replacement of NamedUnknowns by an associated expression and after values computation
Simplified(): Expr_GeneralRelation;

// Replaces NamedUnknowns by an associated expressions and computes values in <me>
Simplify(): void;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralRelation;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Exponential: declare class Expr_Exponential extends Expr_UnaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Exponentiate: declare class Expr_Exponentiate extends Expr_BinaryExpression

constructor

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_ExprFailure: declare class Expr_ExprFailure extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_FunctionDerivative: declare class Expr_FunctionDerivative extends Expr_GeneralFunction

constructor

// Returns the number of variables of <me>
NbOfVariables(): number;

// Returns the variable denoted by <index> in <me>
Variable(index: number): Expr_NamedUnknown;

// Computes the value of <me> with the given variables
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// Returns a copy of <me> with the same form
Copy(): Expr_GeneralFunction;

// Returns Derivative of <me> for variable _._ Returns Derivative of <me> for variable _with degree <deg>._
Derivative(var*: Expr_NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown, deg: number): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr_NamedUnknown, deg: number): Expr_GeneralFunction;

// Tests if <me> and <func> are similar functions (same name and same used expression)
IsIdentical(func: Expr_GeneralFunction): boolean;

// Tests if <me> is linear on variable on range <index>
IsLinearOnVariable(index: number): boolean;

// Returns the function of which <me> is the derivative
Function(): Expr_GeneralFunction;

// Returns the degree of derivation of <me>
Degree(): number;

// Returns the derivation variable of <me>
DerivVariable(): Expr_NamedUnknown;

GetStringName(): TCollection_AsciiString;

Expression(): Expr_GeneralExpression;

UpdateExpression(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
