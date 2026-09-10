# libcascade — ExprIntrp

9 top-level symbols. Signatures are verbatim typescript.

// Describes an interpreter for GeneralExpressions, GeneralFunctions, and GeneralRelations defined in package {@link Expr `Expr`}
ExprIntrp: declare class ExprIntrp

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ExprIntrp_Analysis: declare class ExprIntrp_Analysis

constructor

SetMaster(agen: ExprIntrp_Generator): void;

Push(exp: Expr_GeneralExpression): void;

PushRelation(rel: Expr_GeneralRelation): void;

PushName(name: TCollection_AsciiString): void;

PushValue(degree: number): void;

PushFunction(func: Expr_GeneralFunction): void;

Pop(): Expr_GeneralExpression;

PopRelation(): Expr_GeneralRelation;

PopName(): TCollection_AsciiString;

PopValue(): number;

PopFunction(): Expr_GeneralFunction;

IsExpStackEmpty(): boolean;

IsRelStackEmpty(): boolean;

ResetAll(): void;

Use(func: Expr_NamedFunction): void;
Use(named: Expr_NamedExpression): void;
Use(func: Expr_NamedFunction): void;
Use(named: Expr_NamedExpression): void;

GetNamed(name: TCollection_AsciiString): Expr_NamedExpression;

GetFunction(name: TCollection_AsciiString): Expr_NamedFunction;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class permits, from a string, to create any kind of expression of package {@link Expr `Expr`} by using built-in functions such as Sin,Cos, etc, and by creating variables
ExprIntrp_GenExp: declare class ExprIntrp_GenExp extends ExprIntrp_Generator

static Create(): ExprIntrp_GenExp;

// Processes given string
Process(str: TCollection_AsciiString): void;

// Returns false if any syntax error has occurred during process
IsDone(): boolean;

// Returns expression generated
Expression(): Expr_GeneralExpression;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements an interpreter for defining functions
ExprIntrp_GenFct: declare class ExprIntrp_GenFct extends ExprIntrp_Generator

static Create(): ExprIntrp_GenFct;

Process(str: TCollection_AsciiString): void;

IsDone(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements an interpreter for equations or system of equations made of expressions of package {@link Expr `Expr`}
ExprIntrp_GenRel: declare class ExprIntrp_GenRel extends ExprIntrp_Generator

static Create(): ExprIntrp_GenRel;

// Processes given string
Process(str: TCollection_AsciiString): void;

// Returns false if any syntax error has occurred during process
IsDone(): boolean;

// Returns relation generated
Relation(): Expr_GeneralRelation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements general services for interpretation of expressions
ExprIntrp_Generator: declare class ExprIntrp_Generator extends Standard_Transient

Use(func: Expr_NamedFunction): void;
Use(named: Expr_NamedExpression): void;
Use(func: Expr_NamedFunction): void;
Use(named: Expr_NamedExpression): void;

// Returns NamedExpression with name <name> already interpreted if it exists
GetNamed(): NCollection_Sequence_handle_Expr_NamedExpression;
GetNamed(name: TCollection_AsciiString): Expr_NamedExpression;
GetNamed(): NCollection_Sequence_handle_Expr_NamedExpression;
GetNamed(name: TCollection_AsciiString): Expr_NamedExpression;

GetFunctions(): NCollection_Sequence_handle_Expr_NamedFunction;

// Returns NamedFunction with name <name> already interpreted if it exists
GetFunction(name: TCollection_AsciiString): Expr_NamedFunction;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ExprIntrp_SyntaxError: declare class ExprIntrp_SyntaxError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ExprIntrp_SequenceOfNamedExpression: NCollection_Sequence_handle_Expr_NamedExpression

ExprIntrp_SequenceOfNamedFunction: NCollection_Sequence_handle_Expr_NamedFunction
