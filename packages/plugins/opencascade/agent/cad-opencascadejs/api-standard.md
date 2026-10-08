# libcascade — Standard

48 top-level symbols. Signatures are verbatim typescript.

Standard: declare class Standard

  // Standard.constructor (constructor)
  constructor();

  // Standard.GetAllocatorType (method)
  static GetAllocatorType(): Standard_AllocatorType;

  // Standard.Purge (method)
  static Purge(): number;

  // Standard.delete (method)
  delete(): void;

  // Standard.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_AllocatorType: typeof Standard_AllocatorType[keyof typeof Standard_AllocatorType]

  readonly NATIVE: 'NATIVE'

  readonly OPT: 'OPT'

  readonly TBB: 'TBB'

  readonly JEMALLOC: 'JEMALLOC'

Standard_ArrayStreamBuffer: declare class Standard_ArrayStreamBuffer

  // Standard_ArrayStreamBuffer.constructor (constructor)
  constructor(theBegin: string, theSize: number);

  // Standard_ArrayStreamBuffer.Init (method)
  Init(theBegin: string, theSize: number): void;

  // Standard_ArrayStreamBuffer.xsgetn (method)
  xsgetn(thePtr: string, theCount: number): number;

  // Standard_ArrayStreamBuffer.delete (method)
  delete(): void;

  // Standard_ArrayStreamBuffer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_CLocaleSentry: declare class Standard_CLocaleSentry

  // Standard_CLocaleSentry.constructor (constructor)
  constructor();

  // Standard_CLocaleSentry.GetCLocale (method)
  static GetCLocale(): unknown;

  // Standard_CLocaleSentry.delete (method)
  delete(): void;

  // Standard_CLocaleSentry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_CStringHasher: declare class Standard_CStringHasher

  // Standard_CStringHasher.constructor (constructor)
  constructor();

  // Standard_CStringHasher.delete (method)
  delete(): void;

  // Standard_CStringHasher.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Condition: declare class Standard_Condition

  // Standard_Condition.constructor (constructor)
  constructor(theIsSet?: boolean);

  // Standard_Condition.Set (method)
  Set(): void;

  // Standard_Condition.Reset (method)
  Reset(): void;

  // Standard_Condition.Wait (method)
  Wait(): void;
  Wait(theTimeMilliseconds: number): boolean;

  // Standard_Condition.Check (method)
  Check(): boolean;

  // Standard_Condition.CheckReset (method)
  CheckReset(): boolean;

  // Standard_Condition.delete (method)
  delete(): void;

  // Standard_Condition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_ConstructionError: declare class Standard_ConstructionError extends Standard_DomainError

  // Standard_ConstructionError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_ConstructionError.ExceptionType (method)
  ExceptionType(): string;

  // Standard_ConstructionError.delete (method)
  delete(): void;

  // Standard_ConstructionError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_DimensionError: declare class Standard_DimensionError extends Standard_DomainError

  // Standard_DimensionError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_DimensionError.ExceptionType (method)
  ExceptionType(): string;

  // Standard_DimensionError.delete (method)
  delete(): void;

  // Standard_DimensionError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_DimensionMismatch: declare class Standard_DimensionMismatch extends Standard_DimensionError

  // Standard_DimensionMismatch.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_DimensionMismatch.ExceptionType (method)
  ExceptionType(): string;

  // Standard_DimensionMismatch.delete (method)
  delete(): void;

  // Standard_DimensionMismatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_DivideByZero: declare class Standard_DivideByZero extends Standard_NumericError

  // Standard_DivideByZero.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_DivideByZero.ExceptionType (method)
  ExceptionType(): string;

  // Standard_DivideByZero.delete (method)
  delete(): void;

  // Standard_DivideByZero.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_DomainError: declare class Standard_DomainError extends Standard_Failure

  // Standard_DomainError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_DomainError.ExceptionType (method)
  ExceptionType(): string;

  // Standard_DomainError.delete (method)
  delete(): void;

  // Standard_DomainError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_DumpValue: declare class Standard_DumpValue

  // Standard_DumpValue.constructor (constructor)
  constructor();
  constructor(theValue: TCollection_AsciiString, theStartPos: number);

  myValue: TCollection_AsciiString

  myStartPosition: number

  // Standard_DumpValue.delete (method)
  delete(): void;

  // Standard_DumpValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_JsonKey: typeof Standard_JsonKey[keyof typeof Standard_JsonKey]

  readonly Standard_JsonKey_None: 'Standard_JsonKey_None'

  readonly Standard_JsonKey_OpenChild: 'Standard_JsonKey_OpenChild'

  readonly Standard_JsonKey_CloseChild: 'Standard_JsonKey_CloseChild'

  readonly Standard_JsonKey_OpenContainer: 'Standard_JsonKey_OpenContainer'

  readonly Standard_JsonKey_CloseContainer: 'Standard_JsonKey_CloseContainer'

  readonly Standard_JsonKey_Quote: 'Standard_JsonKey_Quote'

  readonly Standard_JsonKey_SeparatorKeyToValue: 'Standard_JsonKey_SeparatorKeyToValue'

  readonly Standard_JsonKey_SeparatorValueToValue: 'Standard_JsonKey_SeparatorValueToValue'

Standard_ErrorHandler_Callback: declare class Standard_ErrorHandler_Callback

  // Standard_ErrorHandler_Callback.RegisterCallback (method)
  RegisterCallback(): void;

  // Standard_ErrorHandler_Callback.UnregisterCallback (method)
  UnregisterCallback(): void;

  // Standard_ErrorHandler_Callback.DestroyCallback (method)
  DestroyCallback(): void;

  // Standard_ErrorHandler_Callback.delete (method)
  delete(): void;

  // Standard_ErrorHandler_Callback.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Failure: declare class Standard_Failure

  // Standard_Failure.constructor (constructor)
  constructor();
  constructor(theOther: Standard_Failure);
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_Failure.what (method)
  what(): string;

  // DEPRECATED
  // Standard_Failure.GetMessageString (method)
  GetMessageString(): string;

  // Standard_Failure.ExceptionType (method)
  ExceptionType(): string;

  // Standard_Failure.GetStackString (method)
  GetStackString(): string;

  // Standard_Failure.DefaultStackTraceLength (method)
  static DefaultStackTraceLength(): number;

  // Standard_Failure.SetDefaultStackTraceLength (method)
  static SetDefaultStackTraceLength(theNbStackTraces: number): void;

  // Standard_Failure.delete (method)
  delete(): void;

  // Standard_Failure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_GUID: declare class Standard_GUID

  // Standard_GUID.constructor (constructor)
  constructor();
  constructor(aGuid: string);
  constructor(theUUID: Standard_UUID);
  constructor(theGuid: Standard_GUID);

  // Standard_GUID.ToCString (method)
  ToCString(aStrGuid: string): void;

  // Standard_GUID.ToExtString (method)
  ToExtString(aStrGuid: string): void;

  // Standard_GUID.ToUUID (method)
  ToUUID(): Standard_UUID;

  // Standard_GUID.IsSame (method)
  IsSame(uid: Standard_GUID): boolean;

  // Standard_GUID.IsNotSame (method)
  IsNotSame(uid: Standard_GUID): boolean;

  // Standard_GUID.Assign (method)
  Assign(uid: Standard_GUID): void;
  Assign(uid: Standard_UUID): void;

  // Standard_GUID.CheckGUIDFormat (method)
  static CheckGUIDFormat(aGuid: string): boolean;

  // Standard_GUID.delete (method)
  delete(): void;

  // Standard_GUID.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_MultiplyDefined: declare class Standard_MultiplyDefined extends Standard_DomainError

  // Standard_MultiplyDefined.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_MultiplyDefined.ExceptionType (method)
  ExceptionType(): string;

  // Standard_MultiplyDefined.delete (method)
  delete(): void;

  // Standard_MultiplyDefined.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Mutex: declare class Standard_Mutex extends Standard_ErrorHandler_Callback

  // Standard_Mutex.constructor (constructor)
  constructor();

  // Standard_Mutex.Lock (method)
  Lock(): void;

  // Standard_Mutex.TryLock (method)
  TryLock(): boolean;

  // Standard_Mutex.Unlock (method)
  Unlock(): void;

  // Standard_Mutex.delete (method)
  delete(): void;

  // Standard_Mutex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Mutex_Sentry: declare class Standard_Mutex_Sentry

  // Standard_Mutex_Sentry.constructor (constructor)
  constructor(theMutex: Standard_Mutex);

  // Standard_Mutex_Sentry.delete (method)
  delete(): void;

  // Standard_Mutex_Sentry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_NegativeValue: declare class Standard_NegativeValue extends Standard_RangeError

  // Standard_NegativeValue.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_NegativeValue.ExceptionType (method)
  ExceptionType(): string;

  // Standard_NegativeValue.delete (method)
  delete(): void;

  // Standard_NegativeValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_NoMoreObject: declare class Standard_NoMoreObject extends Standard_DomainError

  // Standard_NoMoreObject.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_NoMoreObject.ExceptionType (method)
  ExceptionType(): string;

  // Standard_NoMoreObject.delete (method)
  delete(): void;

  // Standard_NoMoreObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_NoSuchObject: declare class Standard_NoSuchObject extends Standard_DomainError

  // Standard_NoSuchObject.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_NoSuchObject.ExceptionType (method)
  ExceptionType(): string;

  // Standard_NoSuchObject.delete (method)
  delete(): void;

  // Standard_NoSuchObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_NotImplemented: declare class Standard_NotImplemented extends Standard_ProgramError

  // Standard_NotImplemented.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_NotImplemented.ExceptionType (method)
  ExceptionType(): string;

  // Standard_NotImplemented.delete (method)
  delete(): void;

  // Standard_NotImplemented.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_NullObject: declare class Standard_NullObject extends Standard_DomainError

  // Standard_NullObject.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_NullObject.ExceptionType (method)
  ExceptionType(): string;

  // Standard_NullObject.delete (method)
  delete(): void;

  // Standard_NullObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_NullValue: declare class Standard_NullValue extends Standard_RangeError

  // Standard_NullValue.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_NullValue.ExceptionType (method)
  ExceptionType(): string;

  // Standard_NullValue.delete (method)
  delete(): void;

  // Standard_NullValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_NumericError: declare class Standard_NumericError extends Standard_Failure

  // Standard_NumericError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_NumericError.ExceptionType (method)
  ExceptionType(): string;

  // Standard_NumericError.delete (method)
  delete(): void;

  // Standard_NumericError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_OutOfMemory: declare class Standard_OutOfMemory extends Standard_ProgramError

  // Standard_OutOfMemory.constructor (constructor)
  constructor(theMessage?: string);

  // Standard_OutOfMemory.what (method)
  what(): string;

  // Standard_OutOfMemory.ExceptionType (method)
  ExceptionType(): string;

  // Standard_OutOfMemory.SetMessageString (method)
  SetMessageString(theMessage: string): void;

  // Standard_OutOfMemory.delete (method)
  delete(): void;

  // Standard_OutOfMemory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_OutOfRange: declare class Standard_OutOfRange extends Standard_RangeError

  // Standard_OutOfRange.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_OutOfRange.ExceptionType (method)
  ExceptionType(): string;

  // Standard_OutOfRange.delete (method)
  delete(): void;

  // Standard_OutOfRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Overflow: declare class Standard_Overflow extends Standard_NumericError

  // Standard_Overflow.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_Overflow.ExceptionType (method)
  ExceptionType(): string;

  // Standard_Overflow.delete (method)
  delete(): void;

  // Standard_Overflow.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Persistent: declare class Standard_Persistent extends Standard_Transient

  // Standard_Persistent.constructor (constructor)
  constructor();

  // Standard_Persistent.get_type_name (method)
  static get_type_name(): string;

  // Standard_Persistent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Standard_Persistent.DynamicType (method)
  DynamicType(): Standard_Type;

  // Standard_Persistent.TypeNum (method)
  TypeNum(): number;

  // Standard_Persistent.delete (method)
  delete(): void;

  // Standard_Persistent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_ProgramError: declare class Standard_ProgramError extends Standard_Failure

  // Standard_ProgramError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_ProgramError.ExceptionType (method)
  ExceptionType(): string;

  // Standard_ProgramError.delete (method)
  delete(): void;

  // Standard_ProgramError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_RangeError: declare class Standard_RangeError extends Standard_DomainError

  // Standard_RangeError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_RangeError.ExceptionType (method)
  ExceptionType(): string;

  // Standard_RangeError.delete (method)
  delete(): void;

  // Standard_RangeError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_ReadBuffer: declare class Standard_ReadBuffer

  // Standard_ReadBuffer.constructor (constructor)
  constructor(theDataLen: number, theChunkLen: number, theIsPartialPayload?: boolean);

  // Standard_ReadBuffer.Init (method)
  Init(theDataLen: number, theChunkLen: number, theIsPartialPayload?: boolean): void;

  // Standard_ReadBuffer.IsDone (method)
  IsDone(): boolean;

  // Standard_ReadBuffer.delete (method)
  delete(): void;

  // Standard_ReadBuffer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_ReadLineBuffer: declare class Standard_ReadLineBuffer

  // Standard_ReadLineBuffer.constructor (constructor)
  constructor(theMaxBufferSizeBytes: number);

  // Standard_ReadLineBuffer.Clear (method)
  Clear(): void;

  // Standard_ReadLineBuffer.IsMultilineMode (method)
  IsMultilineMode(): boolean;

  // Standard_ReadLineBuffer.ToPutGapInMultiline (method)
  ToPutGapInMultiline(): boolean;

  // Standard_ReadLineBuffer.SetMultilineMode (method)
  SetMultilineMode(theMultilineMode: boolean, theToPutGap?: boolean): void;

  // Standard_ReadLineBuffer.delete (method)
  delete(): void;

  // Standard_ReadLineBuffer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Transient: declare class Standard_Transient

  // Standard_Transient.isNull (method)
  isNull(): boolean;

  // Standard_Transient.nullify (method)
  nullify(): void;

  // Standard_Transient.constructor (constructor)
  constructor();
  constructor(a0: Standard_Transient);

  // Standard_Transient.get_type_name (method)
  static get_type_name(): string;

  // Standard_Transient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Standard_Transient.DynamicType (method)
  DynamicType(): Standard_Type;

  // Standard_Transient.IsInstance (method)
  IsInstance(theType: Standard_Type): boolean;
  IsInstance(theTypeName: string): boolean;

  // Standard_Transient.IsKind (method)
  IsKind(theType: Standard_Type): boolean;
  IsKind(theTypeName: string): boolean;

  // Standard_Transient.This (method)
  This(): Standard_Transient;

  // Standard_Transient.GetRefCount (method)
  GetRefCount(): number;

  // Standard_Transient.IncrementRefCounter (method)
  IncrementRefCounter(): void;

  // Standard_Transient.DecrementRefCounter (method)
  DecrementRefCounter(): number;

  // Standard_Transient.Delete (method)
  Delete(): void;

  // Standard_Transient.delete (method)
  delete(): void;

  // Standard_Transient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Type: declare class Standard_Type extends Standard_Transient

  // Standard_Type.SystemName (method)
  SystemName(): string;

  // Standard_Type.Name (method)
  Name(): string;

  // Standard_Type.Size (method)
  Size(): number;

  // Standard_Type.Parent (method)
  Parent(): Standard_Type;

  // Standard_Type.SubType (method)
  SubType(theOther: Standard_Type): boolean;
  SubType(theOther: string): boolean;

  // Standard_Type.Register (method)
  static Register(theInfo: unknown, theName: string, theSize: number, theParent: Standard_Type): Standard_Type;

  // Standard_Type.get_type_name (method)
  static get_type_name(): string;

  // Standard_Type.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Standard_Type.DynamicType (method)
  DynamicType(): Standard_Type;

  // Standard_Type.delete (method)
  delete(): void;

  // Standard_Type.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_TypeMismatch: declare class Standard_TypeMismatch extends Standard_DomainError

  // Standard_TypeMismatch.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_TypeMismatch.ExceptionType (method)
  ExceptionType(): string;

  // Standard_TypeMismatch.delete (method)
  delete(): void;

  // Standard_TypeMismatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_UUID: declare class Standard_UUID

  // Standard_UUID.constructor (constructor)
  constructor();

  Data1: number

  Data2: number

  Data3: number

  // Standard_UUID.delete (method)
  delete(): void;

  // Standard_UUID.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Standard_Underflow: declare class Standard_Underflow extends Standard_NumericError

  // Standard_Underflow.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Standard_Underflow.ExceptionType (method)
  ExceptionType(): string;

  // Standard_Underflow.delete (method)
  delete(): void;

  // Standard_Underflow.[Symbol.dispose] (method)
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
