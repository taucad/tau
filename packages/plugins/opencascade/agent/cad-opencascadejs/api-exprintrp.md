# libcascade — ExprIntrp

9 top-level symbols. Signatures are verbatim typescript.

ExprIntrp: declare class ExprIntrp

  // ExprIntrp.constructor (constructor)
  constructor();

  // ExprIntrp.delete (method)
  delete(): void;

  // ExprIntrp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExprIntrp_Analysis: declare class ExprIntrp_Analysis

  // ExprIntrp_Analysis.constructor (constructor)
  constructor();

  // ExprIntrp_Analysis.SetMaster (method)
  SetMaster(agen: ExprIntrp_Generator): void;

  // ExprIntrp_Analysis.Push (method)
  Push(exp: Expr_GeneralExpression): void;

  // ExprIntrp_Analysis.PushRelation (method)
  PushRelation(rel: Expr_GeneralRelation): void;

  // ExprIntrp_Analysis.PushName (method)
  PushName(name: TCollection_AsciiString): void;

  // ExprIntrp_Analysis.PushValue (method)
  PushValue(degree: number): void;

  // ExprIntrp_Analysis.PushFunction (method)
  PushFunction(func: Expr_GeneralFunction): void;

  // ExprIntrp_Analysis.Pop (method)
  Pop(): Expr_GeneralExpression;

  // ExprIntrp_Analysis.PopRelation (method)
  PopRelation(): Expr_GeneralRelation;

  // ExprIntrp_Analysis.PopName (method)
  PopName(): TCollection_AsciiString;

  // ExprIntrp_Analysis.PopValue (method)
  PopValue(): number;

  // ExprIntrp_Analysis.PopFunction (method)
  PopFunction(): Expr_GeneralFunction;

  // ExprIntrp_Analysis.IsExpStackEmpty (method)
  IsExpStackEmpty(): boolean;

  // ExprIntrp_Analysis.IsRelStackEmpty (method)
  IsRelStackEmpty(): boolean;

  // ExprIntrp_Analysis.ResetAll (method)
  ResetAll(): void;

  // ExprIntrp_Analysis.Use (method)
  Use(func: Expr_NamedFunction): void;
  Use(named: Expr_NamedExpression): void;

  // ExprIntrp_Analysis.GetNamed (method)
  GetNamed(name: TCollection_AsciiString): Expr_NamedExpression;

  // ExprIntrp_Analysis.GetFunction (method)
  GetFunction(name: TCollection_AsciiString): Expr_NamedFunction;

  // ExprIntrp_Analysis.delete (method)
  delete(): void;

  // ExprIntrp_Analysis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExprIntrp_GenExp: declare class ExprIntrp_GenExp extends ExprIntrp_Generator

  // ExprIntrp_GenExp.Create (method)
  static Create(): ExprIntrp_GenExp;

  // ExprIntrp_GenExp.Process (method)
  Process(str: TCollection_AsciiString): void;

  // ExprIntrp_GenExp.IsDone (method)
  IsDone(): boolean;

  // ExprIntrp_GenExp.Expression (method)
  Expression(): Expr_GeneralExpression;

  // ExprIntrp_GenExp.get_type_name (method)
  static get_type_name(): string;

  // ExprIntrp_GenExp.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ExprIntrp_GenExp.DynamicType (method)
  DynamicType(): Standard_Type;

  // ExprIntrp_GenExp.delete (method)
  delete(): void;

  // ExprIntrp_GenExp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExprIntrp_GenFct: declare class ExprIntrp_GenFct extends ExprIntrp_Generator

  // ExprIntrp_GenFct.Create (method)
  static Create(): ExprIntrp_GenFct;

  // ExprIntrp_GenFct.Process (method)
  Process(str: TCollection_AsciiString): void;

  // ExprIntrp_GenFct.IsDone (method)
  IsDone(): boolean;

  // ExprIntrp_GenFct.get_type_name (method)
  static get_type_name(): string;

  // ExprIntrp_GenFct.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ExprIntrp_GenFct.DynamicType (method)
  DynamicType(): Standard_Type;

  // ExprIntrp_GenFct.delete (method)
  delete(): void;

  // ExprIntrp_GenFct.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExprIntrp_GenRel: declare class ExprIntrp_GenRel extends ExprIntrp_Generator

  // ExprIntrp_GenRel.Create (method)
  static Create(): ExprIntrp_GenRel;

  // ExprIntrp_GenRel.Process (method)
  Process(str: TCollection_AsciiString): void;

  // ExprIntrp_GenRel.IsDone (method)
  IsDone(): boolean;

  // ExprIntrp_GenRel.Relation (method)
  Relation(): Expr_GeneralRelation;

  // ExprIntrp_GenRel.get_type_name (method)
  static get_type_name(): string;

  // ExprIntrp_GenRel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ExprIntrp_GenRel.DynamicType (method)
  DynamicType(): Standard_Type;

  // ExprIntrp_GenRel.delete (method)
  delete(): void;

  // ExprIntrp_GenRel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExprIntrp_Generator: declare class ExprIntrp_Generator extends Standard_Transient

  // ExprIntrp_Generator.Use (method)
  Use(func: Expr_NamedFunction): void;
  Use(named: Expr_NamedExpression): void;

  // ExprIntrp_Generator.GetNamed (method)
  GetNamed(): NCollection_Sequence_handle_Expr_NamedExpression;
  GetNamed(name: TCollection_AsciiString): Expr_NamedExpression;

  // ExprIntrp_Generator.GetFunctions (method)
  GetFunctions(): NCollection_Sequence_handle_Expr_NamedFunction;

  // ExprIntrp_Generator.GetFunction (method)
  GetFunction(name: TCollection_AsciiString): Expr_NamedFunction;

  // ExprIntrp_Generator.get_type_name (method)
  static get_type_name(): string;

  // ExprIntrp_Generator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ExprIntrp_Generator.DynamicType (method)
  DynamicType(): Standard_Type;

  // ExprIntrp_Generator.delete (method)
  delete(): void;

  // ExprIntrp_Generator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExprIntrp_SyntaxError: declare class ExprIntrp_SyntaxError extends Standard_Failure

  // ExprIntrp_SyntaxError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // ExprIntrp_SyntaxError.ExceptionType (method)
  ExceptionType(): string;

  // ExprIntrp_SyntaxError.delete (method)
  delete(): void;

  // ExprIntrp_SyntaxError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ExprIntrp_SequenceOfNamedExpression: NCollection_Sequence_handle_Expr_NamedExpression

ExprIntrp_SequenceOfNamedFunction: NCollection_Sequence_handle_Expr_NamedFunction
