# libcascade — Standard

48 top-level symbols. Signatures are verbatim typescript.

// The package {@link Standard`Standard`} provides global memory allocator and other basic services used by other OCCT components
Standard: declare class Standard

constructor

// Returns default allocator type
static GetAllocatorType(): Standard_AllocatorType;

// Deallocates the storage retained on the free list and clears the list
static Purge(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumiration of possible allocator types
Standard_AllocatorType: typeof Standard_AllocatorType[keyof typeof Standard_AllocatorType]

// Custom buffer object implementing STL interface std::streambuf for streamed reading from allocated memory block
Standard_ArrayStreamBuffer: declare class Standard_ArrayStreamBuffer

constructor

// (Re)-initialize the stream
Init(theBegin: string, theSize: number): void;
// theBegin: pointer to the beginning of pre-allocated buffer
// theSize: length of pre-allocated buffer

// Read a bunch of bytes at once
xsgetn(thePtr: string, theCount: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// We check \_GNU_SOURCE for glibc extensions here and it is always defined by g++ compiler
Standard_CLocaleSentry: declare class Standard_CLocaleSentry

constructor

static GetCLocale(): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_CStringHasher: declare class Standard_CStringHasher

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This is boolean flag intended for communication between threads
Standard_Condition: declare class Standard_Condition

constructor

// Set event into signaling state
Set(): void;

// Reset event (unset signaling state)
Reset(): void;

// Wait for Event (infinity)
Wait(): void;
Wait(theTimeMilliseconds: number): boolean;
Wait(): void;
Wait(theTimeMilliseconds: number): boolean;

// Do not wait for signal - just test it state
Check(): boolean;

// Method perform two steps at-once - reset the event object and returns true if it was in signaling state
CheckReset(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_ConstructionError: declare class Standard_ConstructionError extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_DimensionError: declare class Standard_DimensionError extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_DimensionMismatch: declare class Standard_DimensionMismatch extends Standard_DimensionError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_DivideByZero: declare class Standard_DivideByZero extends Standard_NumericError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_DomainError: declare class Standard_DomainError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Type for storing a dump value with the stream position
Standard_DumpValue: declare class Standard_DumpValue

constructor

myValue: TCollection_AsciiString

myStartPosition: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Kind of key in Json string
Standard_JsonKey: typeof Standard_JsonKey[keyof typeof Standard_JsonKey]

Standard_ErrorHandler_Callback: declare class Standard_ErrorHandler_Callback

RegisterCallback(): void;

UnregisterCallback(): void;

DestroyCallback(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Forms the root of the entire exception hierarchy
Standard_Failure: declare class Standard_Failure

constructor

// Returns error message (implements std::exception interface)
what(): string;

// Returns error message
// DEPRECATED
GetMessageString(): string;

// Returns the exception type name
ExceptionType(): string;

// Returns the stack trace string (empty string if not available)
GetStackString(): string;

// Returns the default length of stack trace to be captured by {@link Standard_Failure`Standard_Failure`} constructor
static DefaultStackTraceLength(): number;

// Sets default length of stack trace to be captured by {@link Standard_Failure`Standard_Failure`} constructor
static SetDefaultStackTraceLength(theNbStackTraces: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_GUID: declare class Standard_GUID

constructor

// translate the GUID into ascii string the aStrGuid is allocated by user
ToCString(aStrGuid: string): void;

// translate the GUID into unicode string the aStrGuid is allocated by user
ToExtString(aStrGuid: string): void;

// Converts to {@link Standard_UUID`Standard_UUID`}
ToUUID(): Standard_UUID;

// Returns true if this GUID is equal to uid
IsSame(uid: Standard_GUID): boolean;

// Returns true if this GUID is not equal to uid
IsNotSame(uid: Standard_GUID): boolean;

// Assigns uid to this GUID
Assign(uid: Standard_GUID): void;
Assign(uid: Standard_UUID): void;
Assign(uid: Standard_GUID): void;
Assign(uid: Standard_UUID): void;

// Check the format of a GUID string
static CheckGUIDFormat(aGuid: string): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_MultiplyDefined: declare class Standard_MultiplyDefined extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_Mutex: declare class Standard_Mutex extends Standard_ErrorHandler_Callback

constructor

Lock(): void;

TryLock(): boolean;

Unlock(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_Mutex_Sentry: declare class Standard_Mutex_Sentry

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_NegativeValue: declare class Standard_NegativeValue extends Standard_RangeError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_NoMoreObject: declare class Standard_NoMoreObject extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_NoSuchObject: declare class Standard_NoSuchObject extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_NotImplemented: declare class Standard_NotImplemented extends Standard_ProgramError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_NullObject: declare class Standard_NullObject extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_NullValue: declare class Standard_NullValue extends Standard_RangeError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_NumericError: declare class Standard_NumericError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link Standard_OutOfMemory`Standard_OutOfMemory`} exception is defined explicitly and not by macro DEFINE_STANDARD_EXCEPTION, to avoid necessity of dynamic memory allocations during throwing and stack unwinding
Standard_OutOfMemory: declare class Standard_OutOfMemory extends Standard_ProgramError

constructor

// Returns error message (implements std::exception interface)
what(): string;

// Returns the exception type name
ExceptionType(): string;

// Sets error message
SetMessageString(theMessage: string): void;
// theMessage: error message (can be nullptr)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_OutOfRange: declare class Standard_OutOfRange extends Standard_RangeError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_Overflow: declare class Standard_Overflow extends Standard_NumericError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root of "persistent" classes, a legacy support of object oriented databases, now outdated
Standard_Persistent: declare class Standard_Persistent extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

TypeNum(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_ProgramError: declare class Standard_ProgramError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_RangeError: declare class Standard_RangeError extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary tool for buffered reading from input stream within chunks of constant size
Standard_ReadBuffer: declare class Standard_ReadBuffer

constructor

// Initialize the buffer
Init(theDataLen: number, theChunkLen: number, theIsPartialPayload?: boolean): void;
// theDataLen: the full length of input data to read from stream
// theChunkLen: the length of single chunk to read
// theIsPartialPayload: when FALSE, theDataLen will be automatically aligned to the multiple of theChunkLen

// Return TRUE if amount of read bytes is equal to requested length of entire data
IsDone(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary tool for buffered reading of lines from input stream
Standard_ReadLineBuffer: declare class Standard_ReadLineBuffer

constructor

// Clear buffer and cached values
Clear(): void;

// Returns TRUE when the Multiline Mode is on
IsMultilineMode(): boolean;

// Put gap space while merging lines within multiline syntax, so that the following sample
ToPutGapInMultiline(): boolean;

// Sets or unsets the multi-line mode
SetMultilineMode(theMultilineMode: boolean, theToPutGap?: boolean): void;
// theMultilineMode: multiline mode flag
// theToPutGap: put gap space while connecting lines (no gap otherwise)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Abstract class which forms the root of the entire Transient class hierarchy
Standard_Transient: declare class Standard_Transient

// Returns true if the underlying handle is null
isNull(): boolean;

// Releases the handle, setting it to null
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class provides legacy interface (type descriptor) to run-time type information (RTTI) for OCCT classes inheriting from {@link Standard_Transient`Standard_Transient`}
Standard_Type: declare class Standard_Type extends Standard_Transient

// Returns the system type name of the class (typeinfo.name)
SystemName(): string;

// Returns the given name of the class type (get_type_name)
Name(): string;

// Returns the size of the class instance in bytes
Size(): number;

// Returns descriptor of the base class in the hierarchy
Parent(): Standard_Type;

// Returns True if this type is the same as theOther, or inherits from theOther
SubType(theOther: Standard_Type): boolean;
SubType(theOther: string): boolean;
SubType(theOther: Standard_Type): boolean;
SubType(theOther: string): boolean;

// Register a type
static Register(theInfo: unknown, theName: string, theSize: number, theParent: Standard_Type): Standard_Type;
// theInfo: object stores system name of the class
// theName: name of the class to be stored in Name field
// theSize: size of the class instance
// theParent: base class in the Transient hierarchy

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_TypeMismatch: declare class Standard_TypeMismatch extends Standard_DomainError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_UUID: declare class Standard_UUID

constructor

Data1: number

Data2: number

Data3: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Standard_Underflow: declare class Standard_Underflow extends Standard_NumericError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// OCCT boolean primitive, mapped to JS `boolean`
Standard_Boolean: boolean

// OCCT unsigned byte primitive (0–255), mapped to JS `number`
Standard_Byte: number

// OCCT single character, mapped to JS `string`
Standard_Character: string

// OCCT null-terminated C string, mapped to JS `string`
Standard_CString: string

// OCCT signed integer primitive, mapped to JS `number`
Standard_Integer: number

// OCCT double-precision floating-point primitive, mapped to JS `number`
Standard_Real: number

// OCCT single-precision floating-point primitive, mapped to JS `number`
Standard_ShortReal: number

// OCCT unsigned size/count primitive, mapped to JS `number`
Standard_Size: number

Standard_HMutex: NCollection_Shared_Standard_Mutex_void
