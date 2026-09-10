# libcascade — StdFail

5 top-level symbols. Signatures are verbatim typescript.

StdFail_InfiniteSolutions: declare class StdFail_InfiniteSolutions extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StdFail_NotDone: declare class StdFail_NotDone extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StdFail_Undefined: declare class StdFail_Undefined extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StdFail_UndefinedDerivative: declare class StdFail_UndefinedDerivative extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StdFail_UndefinedValue: declare class StdFail_UndefinedValue extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
