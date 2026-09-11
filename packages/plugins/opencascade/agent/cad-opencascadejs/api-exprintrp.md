# libcascade — ExprIntrp

9 top-level symbols. Signatures are verbatim typescript.

ExprIntrp: declare class ExprIntrp

constructor

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

delete(): void;

[Symbol.dispose](): void;

ExprIntrp_GenExp: declare class ExprIntrp_GenExp extends ExprIntrp_Generator

static Create(): ExprIntrp_GenExp;

Process(str: TCollection_AsciiString): void;

IsDone(): boolean;

Expression(): Expr_GeneralExpression;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ExprIntrp_GenFct: declare class ExprIntrp_GenFct extends ExprIntrp_Generator

static Create(): ExprIntrp_GenFct;

Process(str: TCollection_AsciiString): void;

IsDone(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ExprIntrp_GenRel: declare class ExprIntrp_GenRel extends ExprIntrp_Generator

static Create(): ExprIntrp_GenRel;

Process(str: TCollection_AsciiString): void;

IsDone(): boolean;

Relation(): Expr_GeneralRelation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ExprIntrp_Generator: declare class ExprIntrp_Generator extends Standard_Transient

Use(func: Expr_NamedFunction): void;
Use(named: Expr_NamedExpression): void;
Use(func: Expr_NamedFunction): void;
Use(named: Expr_NamedExpression): void;

GetNamed(): NCollection_Sequence_handle_Expr_NamedExpression;
GetNamed(name: TCollection_AsciiString): Expr_NamedExpression;
GetNamed(): NCollection_Sequence_handle_Expr_NamedExpression;
GetNamed(name: TCollection_AsciiString): Expr_NamedExpression;

GetFunctions(): NCollection_Sequence_handle_Expr_NamedFunction;

GetFunction(name: TCollection_AsciiString): Expr_NamedFunction;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

ExprIntrp_SyntaxError: declare class ExprIntrp_SyntaxError extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

ExprIntrp_SequenceOfNamedExpression: NCollection_Sequence_handle_Expr_NamedExpression

ExprIntrp_SequenceOfNamedFunction: NCollection_Sequence_handle_Expr_NamedFunction
