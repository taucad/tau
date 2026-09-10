# libcascade — Expr (2)

20 top-level symbols. Signatures are verbatim typescript.

// Defines the general purposes of any expression
Expr_GeneralExpression: declare class Expr_GeneralExpression extends Standard_Transient

// Returns the number of sub-expressions contained in <me> ( >= 0)
NbSubExpressions(): number;

// Returns the _-th sub-expression of <me> raises OutOfRange if _> NbSubExpressions(me)\*\*
SubExpression(I: number): Expr_GeneralExpression;

// Returns a GeneralExpression after replacement of NamedUnknowns by an associated expression and after values computation
Simplified(): Expr_GeneralExpression;

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> contains NamedUnknowns
ContainsUnknowns(): boolean;

// Tests if <exp> is contained in <me>
Contains(exp: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Tests if <me> can be shared by one or more expressions or must be copied
IsShareable(): boolean;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the <N>-th derivative on <X> unknown of <me>
NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

// Replaces all occurrences of \*with copies of <with> in <me>
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
EvaluateNumeric(): number;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the general purposes of any function
Expr_GeneralFunction: declare class Expr_GeneralFunction extends Standard_Transient

// Returns the number of variables of <me>
NbOfVariables(): number;

// Returns the variable denoted by <index> in <me>
Variable(index: number): Expr_NamedUnknown;

// Returns a copy of <me> with the same form
Copy(): Expr_GeneralFunction;

// Returns Derivative of <me> for variable _._ Returns Derivative of <me> for variable _with degree <deg>._
Derivative(var*: Expr_NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown, deg: number): Expr_GeneralFunction;
Derivative(var*: Expr*NamedUnknown): Expr_GeneralFunction;
Derivative(var*: Expr_NamedUnknown, deg: number): Expr_GeneralFunction;

// Computes the value of <me> with the given variables
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

// Tests if <me> and <func> are similar functions (same name and same used expression)
IsIdentical(func: Expr_GeneralFunction): boolean;

// Tests if <me> is linear on variable on range <index>
IsLinearOnVariable(index: number): boolean;

GetStringName(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the general purposes of any relation between expressions
Expr_GeneralRelation: declare class Expr_GeneralRelation extends Standard_Transient

// Returns the current status of the relation
IsSatisfied(): boolean;

// Tests if <me> is linear between its NamedUnknowns
IsLinear(): boolean;

// Returns a GeneralRelation after replacement of NamedUnknowns by an associated expression, and after values computation
Simplified(): Expr_GeneralRelation;

// Replaces NamedUnknowns by associated expressions, and computes values in <me>
Simplify(): void;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralRelation;

// Returns the number of relations contained in <me>
NbOfSubRelations(): number;

// Returns the number of SingleRelations contained in <me>
NbOfSingleRelations(): number;

// Returns the relation denoted by <index> in <me>
SubRelation(index: number): Expr_GeneralRelation;

// Tests if <exp> contains _._
Contains(exp: Expr_GeneralExpression): boolean;

// Replaces all occurrences of _with <with> in <me>._
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_GreaterThan: declare class Expr_GreaterThan extends Expr_SingleRelation

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

Expr_GreaterThanOrEqual: declare class Expr_GreaterThanOrEqual extends Expr_SingleRelation

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

Expr_InvalidAssignment: declare class Expr_InvalidAssignment extends Expr_ExprFailure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_InvalidFunction: declare class Expr_InvalidFunction extends Expr_ExprFailure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_InvalidOperand: declare class Expr_InvalidOperand extends Expr_ExprFailure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_LessThan: declare class Expr_LessThan extends Expr_SingleRelation

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

Expr_LessThanOrEqual: declare class Expr_LessThanOrEqual extends Expr_SingleRelation

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

Expr_LogOf10: declare class Expr_LogOf10 extends Expr_UnaryExpression

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

Expr_LogOfe: declare class Expr_LogOfe extends Expr_UnaryExpression

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

// Describes any numeric constant known by a special name (as PI, e,...)
Expr_NamedConstant: declare class Expr_NamedConstant extends Expr_NamedExpression

constructor

GetValue(): number;

// returns the number of sub-expressions contained in <me> (always returns zero)
NbSubExpressions(): number;

// returns the _-th sub-expression of <me> raises OutOfRange_
SubExpression(I: number): Expr_GeneralExpression;

// returns a GeneralExpression after replacement of NamedUnknowns by an associated expression and after values computation
Simplified(): Expr_GeneralExpression;

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> contains NamedUnknown
ContainsUnknowns(): boolean;

// Tests if <exp> is contained in <me>
Contains(exp: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the <N>-th derivative on <X> unknown of <me>
NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

// Replaces all occurrences of _with <with> in <me>_
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describe an expression used by its name (as constants or variables)
Expr_NamedExpression: declare class Expr_NamedExpression extends Expr_GeneralExpression

GetName(): TCollection_AsciiString;

SetName(name: TCollection_AsciiString): void;

// Tests if <me> can be shared by one or more expressions or must be copied
IsShareable(): boolean;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// returns a string representing <me> in a readable way
String(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_NamedFunction: declare class Expr_NamedFunction extends Expr_GeneralFunction

constructor

// Sets the name <newname> to <me>
SetName(newname: TCollection_AsciiString): void;

// Returns the name assigned to <me>
GetName(): TCollection_AsciiString;

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

GetStringName(): TCollection_AsciiString;

// Returns equivalent expression of <me>
Expression(): Expr_GeneralExpression;

// Modifies expression of <me>
SetExpression(exp: Expr_GeneralExpression): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes any variable of an expression
Expr_NamedUnknown: declare class Expr_NamedUnknown extends Expr_NamedExpression

constructor

// Tests if an expression is assigned to <me>
IsAssigned(): boolean;

// If exists, returns the assigned expression
AssignedExpression(): Expr_GeneralExpression;

// Assigns <me> to <exp> expression
Assign(exp: Expr_GeneralExpression): void;

// Suppresses the assigned expression
Deassign(): void;

// Returns the number of sub-expressions contained in <me> ( >= 0)
NbSubExpressions(): number;

// Returns the _-th sub-expression of <me> raises OutOfRange if _> NbSubExpressions(me)\*\*
SubExpression(I: number): Expr_GeneralExpression;

// Returns a GeneralExpression after replacement of NamedUnknowns by an associated expression and after values computation
Simplified(): Expr_GeneralExpression;

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> contains NamedUnknown
ContainsUnknowns(): boolean;

// Tests if <exp> is contained in <me>
Contains(exp: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Replaces all occurrences of _with <with> in <me> Raises InvalidOperand if <with> contains <me>._
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

// Returns the value of <me> (as a Real) by replacement of <vars> by <vals>
Evaluate(vars: NCollection_Array1_handle_Expr_NamedUnknown, vals: NCollection_Array1_double): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_NotAssigned: declare class Expr_NotAssigned extends Expr_ExprFailure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_NotEvaluable: declare class Expr_NotEvaluable extends Expr_ExprFailure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes any reel value defined in an expression
Expr_NumericValue: declare class Expr_NumericValue extends Expr_GeneralExpression

constructor

GetValue(): number;

SetValue(val: number): void;

// Returns the number of sub-expressions contained in <me> ( >= 0)
NbSubExpressions(): number;

// Returns the _-th sub-expression of <me> raises OutOfRange if _> NbSubExpressions(me)\*\*
SubExpression(I: number): Expr_GeneralExpression;

// Returns a GeneralExpression after replacement of NamedUnknowns by an associated expression and after values computation
Simplified(): Expr_GeneralExpression;

// Returns a GeneralExpression after a simplification of the arguments of <me>
ShallowSimplified(): Expr_GeneralExpression;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralExpression;

// Tests if <me> contains NamedUnknown
ContainsUnknowns(): boolean;

// Tests if <exp> is contained in <me>
Contains(exp: Expr_GeneralExpression): boolean;

// Tests if <me> and <Other> define the same expression
IsIdentical(Other: Expr_GeneralExpression): boolean;

// Tests if <me> is linear on every NamedUnknown it contains
IsLinear(): boolean;

// Returns the derivative on <X> unknown of <me>
Derivative(X: Expr_NamedUnknown): Expr_GeneralExpression;

// Returns the <N>-th derivative on <X> unknown of <me>
NDerivative(X: Expr_NamedUnknown, N: number): Expr_GeneralExpression;

// Replaces all occurrences of _with <with> in <me>_
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

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

Expr_PolyExpression: declare class Expr_PolyExpression extends Expr_GeneralExpression

// returns the number of operands contained in <me>
NbOperands(): number;

// Returns the <index>-th operand used in <me>
Operand(index: number): Expr_GeneralExpression;

// Sets the <index>-th operand used in <me>
SetOperand(exp: Expr_GeneralExpression, index: number): void;

// returns the number of sub-expressions contained in <me> ( >= 2)
NbSubExpressions(): number;

// Returns the sub-expression denoted by _in <me> Raises OutOfRange if _> NbSubExpressions(me)\*\*
SubExpression(I: number): Expr_GeneralExpression;

// Does <me> contains NamedUnknown ?
ContainsUnknowns(): boolean;

// Tests if <exp> is contained in <me>
Contains(exp: Expr_GeneralExpression): boolean;

// Replaces all occurrences of _with <with> in <me> Raises InvalidOperand if <with> contains <me>._
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

// Returns a GeneralExpression after replacement of NamedUnknowns by an associated expression and after values computation
Simplified(): Expr_GeneralExpression;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
