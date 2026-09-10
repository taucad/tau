# libcascade — Expr (3)

20 top-level symbols. Signatures are verbatim typescript.

// Defines the use of an n-ary function in an expression with given arguments
Expr_PolyFunction: declare class Expr_PolyFunction extends Expr_PolyExpression

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

Expr_Product: declare class Expr_Product extends Expr_PolyExpression

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

// Iterates on NamedUnknowns in a GeneralRelation
Expr_RUIterator: declare class Expr_RUIterator

constructor

// Returns False if on other unknown remains
More(): boolean;

Next(): void;

// Returns current NamedUnknown
Value(): Expr_NamedUnknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterates on every basic relation contained in a GeneralRelation
Expr_RelationIterator: declare class Expr_RelationIterator

constructor

// Returns False if no other relation remains
More(): boolean;

Next(): void;

// Returns current basic relation
Value(): Expr_SingleRelation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Sign: declare class Expr_Sign extends Expr_UnaryExpression

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

Expr_Sine: declare class Expr_Sine extends Expr_UnaryExpression

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

Expr_SingleRelation: declare class Expr_SingleRelation extends Expr_GeneralRelation

// Defines the first member of the relation
SetFirstMember(exp: Expr_GeneralExpression): void;

// Defines the second member of the relation
SetSecondMember(exp: Expr_GeneralExpression): void;

// Returns the first member of the relation
FirstMember(): Expr_GeneralExpression;

// Returns the second member of the relation
SecondMember(): Expr_GeneralExpression;

// Tests if <me> is linear between its NamedUnknowns
IsLinear(): boolean;

// Returns the number of relations contained in <me>
NbOfSubRelations(): number;

// Returns the number of SingleRelations contained in <me> (Always 1)
NbOfSingleRelations(): number;

// Returns the relation denoted by <index> in <me>
SubRelation(index: number): Expr_GeneralRelation;

// Tests if <me> contains <exp>
Contains(exp: Expr_GeneralExpression): boolean;

// Replaces all occurrences of _with <with> in <me>._
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Sinh: declare class Expr_Sinh extends Expr_UnaryExpression

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

Expr_Square: declare class Expr_Square extends Expr_UnaryExpression

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

Expr_SquareRoot: declare class Expr_SquareRoot extends Expr_UnaryExpression

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

Expr_Sum: declare class Expr_Sum extends Expr_PolyExpression

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

Expr_SystemRelation: declare class Expr_SystemRelation extends Expr_GeneralRelation

constructor

// Appends <relation> in the list of components of <me>
Add(relation: Expr_GeneralRelation): void;

Remove(relation: Expr_GeneralRelation): void;

// Tests if <me> is linear between its NamedUnknowns
IsLinear(): boolean;

// Returns the number of relations contained in <me>
NbOfSubRelations(): number;

// Returns the number of SingleRelations contained in <me>
NbOfSingleRelations(): number;

// Returns the relation denoted by <index> in <me>
SubRelation(index: number): Expr_GeneralRelation;

// Returns the current status of the relation
IsSatisfied(): boolean;

// Returns a GeneralRelation after replacement of NamedUnknowns by an associated expression, and after values computation
Simplified(): Expr_GeneralRelation;

// Replaces NamedUnknowns by associated expressions, and computes values in <me>
Simplify(): void;

// Returns a copy of <me> having the same unknowns and functions
Copy(): Expr_GeneralRelation;

// Tests if <me> contains <exp>
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

Expr_Tangent: declare class Expr_Tangent extends Expr_UnaryExpression

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

Expr_Tanh: declare class Expr_Tanh extends Expr_UnaryExpression

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

Expr_UnaryExpression: declare class Expr_UnaryExpression extends Expr_GeneralExpression

// Returns the operand used
Operand(): Expr_GeneralExpression;

// Sets the operand used Raises InvalidOperand if <exp> contains <me>
SetOperand(exp: Expr_GeneralExpression): void;

// Returns the number of sub-expressions contained in <me> ( >= 0)
NbSubExpressions(): number;

// Returns the \*-th sub-expression of <me>
SubExpression(I: number): Expr_GeneralExpression;

// Does <me> contains NamedUnknown ?
ContainsUnknowns(): boolean;

// Tests if <exp> is contained in <me>
Contains(exp: Expr_GeneralExpression): boolean;

// Replaces all occurrences of _with <with> in <me> Raises InvalidOperand if <with> contains <me>._
Replace(var*: Expr_NamedUnknown, with*: Expr_GeneralExpression): void;

// Returns a GeneralExpression after replacement of NamedUnknowns by an associated expression, and after values computation
Simplified(): Expr_GeneralExpression;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the use of an unary function in an expression with a given argument
Expr_UnaryFunction: declare class Expr_UnaryFunction extends Expr_UnaryExpression

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

// returns the derivative on <X> unknown of <me>
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

Expr_UnaryMinus: declare class Expr_UnaryMinus extends Expr_UnaryExpression

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

// Describes an iterator on NamedUnknowns contained in any GeneralExpression
Expr_UnknownIterator: declare class Expr_UnknownIterator

constructor

More(): boolean;

Next(): void;

Value(): Expr_NamedUnknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Expr_Array1OfGeneralExpression: NCollection_Array1_handle_Expr_GeneralExpression

Expr_SequenceOfGeneralExpression: NCollection_Sequence_handle_Expr_GeneralExpression
