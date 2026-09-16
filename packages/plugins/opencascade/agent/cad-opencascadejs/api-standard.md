# libcascade — Standard

48 top-level symbols. Signatures are verbatim typescript.

Standard: declare class Standard

  constructor

  static GetAllocatorType(): Standard_AllocatorType;

  static Purge(): number;

  delete(): void;

  [Symbol.dispose](): void;

Standard_AllocatorType: typeof Standard_AllocatorType[keyof typeof Standard_AllocatorType]

Standard_ArrayStreamBuffer: declare class Standard_ArrayStreamBuffer

  constructor

  Init(theBegin: string, theSize: number): void;

  xsgetn(thePtr: string, theCount: number): number;

  delete(): void;

  [Symbol.dispose](): void;

Standard_CLocaleSentry: declare class Standard_CLocaleSentry

  constructor

  static GetCLocale(): unknown;

  delete(): void;

  [Symbol.dispose](): void;

Standard_CStringHasher: declare class Standard_CStringHasher

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Standard_Condition: declare class Standard_Condition

  constructor

  Set(): void;

  Reset(): void;

  Wait(): void;
  Wait(theTimeMilliseconds: number): boolean;
  Wait(): void;
  Wait(theTimeMilliseconds: number): boolean;

  Check(): boolean;

  CheckReset(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Standard_ConstructionError: declare class Standard_ConstructionError extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_DimensionError: declare class Standard_DimensionError extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_DimensionMismatch: declare class Standard_DimensionMismatch extends Standard_DimensionError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_DivideByZero: declare class Standard_DivideByZero extends Standard_NumericError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_DomainError: declare class Standard_DomainError extends Standard_Failure

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_DumpValue: declare class Standard_DumpValue

  constructor

  myValue: TCollection_AsciiString

  myStartPosition: number

  delete(): void;

  [Symbol.dispose](): void;

Standard_JsonKey: typeof Standard_JsonKey[keyof typeof Standard_JsonKey]

Standard_ErrorHandler_Callback: declare class Standard_ErrorHandler_Callback

  RegisterCallback(): void;

  UnregisterCallback(): void;

  DestroyCallback(): void;

  delete(): void;

  [Symbol.dispose](): void;

Standard_Failure: declare class Standard_Failure

  constructor

  what(): string;

  // DEPRECATED
  GetMessageString(): string;

  ExceptionType(): string;

  GetStackString(): string;

  static DefaultStackTraceLength(): number;

  static SetDefaultStackTraceLength(theNbStackTraces: number): void;

  delete(): void;

  [Symbol.dispose](): void;

Standard_GUID: declare class Standard_GUID

  constructor

  ToCString(aStrGuid: string): void;

  ToExtString(aStrGuid: string): void;

  ToUUID(): Standard_UUID;

  IsSame(uid: Standard_GUID): boolean;

  IsNotSame(uid: Standard_GUID): boolean;

  Assign(uid: Standard_GUID): void;
  Assign(uid: Standard_UUID): void;
  Assign(uid: Standard_GUID): void;
  Assign(uid: Standard_UUID): void;

  static CheckGUIDFormat(aGuid: string): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Standard_MultiplyDefined: declare class Standard_MultiplyDefined extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_Mutex: declare class Standard_Mutex extends Standard_ErrorHandler_Callback

  constructor

  Lock(): void;

  TryLock(): boolean;

  Unlock(): void;

  delete(): void;

  [Symbol.dispose](): void;

Standard_Mutex_Sentry: declare class Standard_Mutex_Sentry

  constructor

  delete(): void;

  [Symbol.dispose](): void;

Standard_NegativeValue: declare class Standard_NegativeValue extends Standard_RangeError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_NoMoreObject: declare class Standard_NoMoreObject extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_NoSuchObject: declare class Standard_NoSuchObject extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_NotImplemented: declare class Standard_NotImplemented extends Standard_ProgramError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_NullObject: declare class Standard_NullObject extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_NullValue: declare class Standard_NullValue extends Standard_RangeError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_NumericError: declare class Standard_NumericError extends Standard_Failure

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_OutOfMemory: declare class Standard_OutOfMemory extends Standard_ProgramError

  constructor

  what(): string;

  ExceptionType(): string;

  SetMessageString(theMessage: string): void;

  delete(): void;

  [Symbol.dispose](): void;

Standard_OutOfRange: declare class Standard_OutOfRange extends Standard_RangeError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_Overflow: declare class Standard_Overflow extends Standard_NumericError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_Persistent: declare class Standard_Persistent extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  TypeNum(): number;

  delete(): void;

  [Symbol.dispose](): void;

Standard_ProgramError: declare class Standard_ProgramError extends Standard_Failure

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_RangeError: declare class Standard_RangeError extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_ReadBuffer: declare class Standard_ReadBuffer

  constructor

  Init(theDataLen: number, theChunkLen: number, theIsPartialPayload?: boolean): void;

  IsDone(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Standard_ReadLineBuffer: declare class Standard_ReadLineBuffer

  constructor

  Clear(): void;

  IsMultilineMode(): boolean;

  ToPutGapInMultiline(): boolean;

  SetMultilineMode(theMultilineMode: boolean, theToPutGap?: boolean): void;

  delete(): void;

  [Symbol.dispose](): void;

Standard_Transient: declare class Standard_Transient

  isNull(): boolean;

  nullify(): void;

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  IsInstance(theType: Standard_Type): boolean;
  IsInstance(theTypeName: string): boolean;
  IsInstance(theType: Standard_Type): boolean;
  IsInstance(theTypeName: string): boolean;

  IsKind(theType: Standard_Type): boolean;
  IsKind(theTypeName: string): boolean;
  IsKind(theType: Standard_Type): boolean;
  IsKind(theTypeName: string): boolean;

  This(): Standard_Transient;

  GetRefCount(): number;

  IncrementRefCounter(): void;

  DecrementRefCounter(): number;

  Delete(): void;

  delete(): void;

  [Symbol.dispose](): void;

Standard_Type: declare class Standard_Type extends Standard_Transient

  SystemName(): string;

  Name(): string;

  Size(): number;

  Parent(): Standard_Type;

  SubType(theOther: Standard_Type): boolean;
  SubType(theOther: string): boolean;
  SubType(theOther: Standard_Type): boolean;
  SubType(theOther: string): boolean;

  static Register(theInfo: unknown, theName: string, theSize: number, theParent: Standard_Type): Standard_Type;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

Standard_TypeMismatch: declare class Standard_TypeMismatch extends Standard_DomainError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_UUID: declare class Standard_UUID

  constructor

  Data1: number

  Data2: number

  Data3: number

  delete(): void;

  [Symbol.dispose](): void;

Standard_Underflow: declare class Standard_Underflow extends Standard_NumericError

  constructor

  ExceptionType(): string;

  delete(): void;

  [Symbol.dispose](): void;

Standard_Boolean: boolean

Standard_Byte: number

Standard_Character: string

Standard_CString: string

Standard_Integer: number

Standard_Real: number

Standard_ShortReal: number

Standard_Size: number

Standard_HMutex: NCollection_Shared_Standard_Mutex_void
