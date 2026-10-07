# libcascade — StdFail

5 top-level symbols. Signatures are verbatim typescript.

StdFail_InfiniteSolutions: declare class StdFail_InfiniteSolutions extends Standard_Failure

  // StdFail_InfiniteSolutions.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // StdFail_InfiniteSolutions.ExceptionType (method)
  ExceptionType(): string;

  // StdFail_InfiniteSolutions.delete (method)
  delete(): void;

  // StdFail_InfiniteSolutions.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StdFail_NotDone: declare class StdFail_NotDone extends Standard_Failure

  // StdFail_NotDone.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // StdFail_NotDone.ExceptionType (method)
  ExceptionType(): string;

  // StdFail_NotDone.delete (method)
  delete(): void;

  // StdFail_NotDone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StdFail_Undefined: declare class StdFail_Undefined extends Standard_Failure

  // StdFail_Undefined.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // StdFail_Undefined.ExceptionType (method)
  ExceptionType(): string;

  // StdFail_Undefined.delete (method)
  delete(): void;

  // StdFail_Undefined.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StdFail_UndefinedDerivative: declare class StdFail_UndefinedDerivative extends Standard_DomainError

  // StdFail_UndefinedDerivative.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // StdFail_UndefinedDerivative.ExceptionType (method)
  ExceptionType(): string;

  // StdFail_UndefinedDerivative.delete (method)
  delete(): void;

  // StdFail_UndefinedDerivative.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StdFail_UndefinedValue: declare class StdFail_UndefinedValue extends Standard_DomainError

  // StdFail_UndefinedValue.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // StdFail_UndefinedValue.ExceptionType (method)
  ExceptionType(): string;

  // StdFail_UndefinedValue.delete (method)
  delete(): void;

  // StdFail_UndefinedValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
