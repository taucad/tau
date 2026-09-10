# libcascade — Storage

28 top-level symbols. Signatures are verbatim typescript.

// {@link Storage`Storage`} package is used to write and read persistent objects
Storage: declare class Storage

constructor

// returns the version of {@link Storage`Storage`}'s read/write routines
static Version(): TCollection_AsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_Bucket: declare class Storage_Bucket

constructor

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_BucketIterator: declare class Storage_BucketIterator

constructor

Init(argNo0: Storage_BucketOfPersistent): void;

Reset(): void;

Value(): Standard_Persistent;

More(): boolean;

Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_BucketOfPersistent: declare class Storage_BucketOfPersistent

constructor

Length(): number;

Append(sp: Standard_Persistent): void;

Value(theIndex: number): Standard_Persistent;

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_CallBack: declare class Storage_CallBack extends Standard_Transient

New(): Standard_Persistent;

Add(aPers: Standard_Persistent, aSchema: Storage_Schema): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A picture memorizing the data stored in a container (for example, in a file)
Storage_Data: declare class Storage_Data extends Standard_Transient

constructor

// Returns Storage_VSOk if
ErrorStatus(): Storage_Error;

// Clears the error status positioned either by
ClearErrorStatus(): void;

ErrorStatusExtension(): TCollection_AsciiString;

// return the creation date
CreationDate(): TCollection_AsciiString;

// return the {@link Storage`Storage`} package version
StorageVersion(): TCollection_AsciiString;

// get the version of the schema
SchemaVersion(): TCollection_AsciiString;

// get the schema's name
SchemaName(): TCollection_AsciiString;

// set the version of the application
SetApplicationVersion(aVersion: TCollection_AsciiString): void;

// get the version of the application
ApplicationVersion(): TCollection_AsciiString;

// set the name of the application
SetApplicationName(aName: TCollection_ExtendedString): void;

// get the name of the application
ApplicationName(): TCollection_ExtendedString;

// set the data type
SetDataType(aType: TCollection_ExtendedString): void;

// returns data type
DataType(): TCollection_ExtendedString;

// add <theUserInfo> to the user information
AddToUserInfo(anInfo: TCollection_AsciiString): void;

// return the user information
UserInfo(): NCollection_Sequence_TCollection_AsciiString;

// add <theUserInfo> to the user information
AddToComments(aComment: TCollection_ExtendedString): void;

// return the user information
Comments(): NCollection_Sequence_TCollection_ExtendedString;

// the number of persistent objects Return
NumberOfObjects(): number;

// Returns the number of root objects in this set of data
NumberOfRoots(): number;

// add a persistent root to write
AddRoot(anObject: Standard_Persistent): void;
AddRoot(aName: TCollection_AsciiString, anObject: Standard_Persistent): void;
AddRoot(anObject: Standard_Persistent): void;
AddRoot(aName: TCollection_AsciiString, anObject: Standard_Persistent): void;

// Removes from this set of data the root object named aName
RemoveRoot(aName: TCollection_AsciiString): void;

// Returns the roots of this set of data in a sequence
Roots(): NCollection_HSequence_handle_Storage_Root;

// Gives the root object whose name is aName in this set of data
Find(aName: TCollection_AsciiString): Storage_Root;

// returns true if <me> contains a root named <aName>
IsRoot(aName: TCollection_AsciiString): boolean;

// Returns the number of types of objects used in this set of data
NumberOfTypes(): number;

// Returns true if this set of data contains an object of type aName
IsType(aName: TCollection_AsciiString): boolean;

// Gives the list of types of objects used in this set of data in a sequence
Types(): NCollection_HSequence_TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

HeaderData(): Storage_HeaderData;

RootData(): Storage_RootData;

TypeData(): Storage_TypeData;

InternalData(): Storage_InternalData;

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_DefaultCallBack: declare class Storage_DefaultCallBack extends Storage_CallBack

constructor

New(): Standard_Persistent;

Add(aPers: Standard_Persistent, aSchema: Storage_Schema): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Error codes returned by the ErrorStatus function on a {@link Storage_Data`Storage_Data`} set of data during a storage or retrieval operation
Storage_Error: typeof Storage_Error[keyof typeof Storage_Error]

Storage_HeaderData: declare class Storage_HeaderData extends Standard_Transient

constructor

// return the creation date
CreationDate(): TCollection_AsciiString;

// return the {@link Storage`Storage`} package version
StorageVersion(): TCollection_AsciiString;

// get the version of the schema
SchemaVersion(): TCollection_AsciiString;

// get the schema's name
SchemaName(): TCollection_AsciiString;

// set the version of the application
SetApplicationVersion(aVersion: TCollection_AsciiString): void;

// get the version of the application
ApplicationVersion(): TCollection_AsciiString;

// set the name of the application
SetApplicationName(aName: TCollection_ExtendedString): void;

// get the name of the application
ApplicationName(): TCollection_ExtendedString;

// set the data type
SetDataType(aType: TCollection_ExtendedString): void;

// returns data type
DataType(): TCollection_ExtendedString;

// add <theUserInfo> to the user information
AddToUserInfo(theUserInfo: TCollection_AsciiString): void;

// return the user information
UserInfo(): NCollection_Sequence_TCollection_AsciiString;

// add <theUserInfo> to the user information
AddToComments(aComment: TCollection_ExtendedString): void;

// return the user information
Comments(): NCollection_Sequence_TCollection_ExtendedString;

// the number of persistent objects Return
NumberOfObjects(): number;

ErrorStatus(): Storage_Error;

ErrorStatusExtension(): TCollection_AsciiString;

ClearErrorStatus(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

SetNumberOfObjects(anObjectNumber: number): void;

SetStorageVersion(aVersion: TCollection_AsciiString): void;
SetStorageVersion(theVersion: number): void;
SetStorageVersion(aVersion: TCollection_AsciiString): void;
SetStorageVersion(theVersion: number): void;

SetCreationDate(aDate: TCollection_AsciiString): void;

SetSchemaVersion(aVersion: TCollection_AsciiString): void;

SetSchemaName(aName: TCollection_AsciiString): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_InternalData: declare class Storage_InternalData extends Standard_Transient

constructor

ReadArray(): NCollection_HArray1_handle_Standard_Persistent;

Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Specifies opening modes for a file
Storage_OpenMode: typeof Storage_OpenMode[keyof typeof Storage_OpenMode]

// A root object extracted from a {@link Storage_Data`Storage_Data`} object
Storage_Root: declare class Storage_Root extends Standard_Transient

constructor

SetName(theName: TCollection_AsciiString): void;

// Returns the name of this root object
Name(): TCollection_AsciiString;

SetObject(anObject: Standard_Persistent): void;

// Returns the persistent object encapsulated by this root
Object(): Standard_Persistent;

// Returns the name of this root type
Type(): TCollection_AsciiString;

SetReference(aRef: number): void;

Reference(): number;

SetType(aType: TCollection_AsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_RootData: declare class Storage_RootData extends Standard_Transient

constructor

// returns the number of roots
NumberOfRoots(): number;

// add a root to <me>
AddRoot(aRoot: Storage_Root): void;

Roots(): NCollection_HSequence_handle_Storage_Root;

// find a root with name <aName>
Find(aName: TCollection_AsciiString): Storage_Root;

// returns true if <me> contains a root named <aName>
IsRoot(aName: TCollection_AsciiString): boolean;

// remove the root named <aName>
RemoveRoot(aName: TCollection_AsciiString): void;

ErrorStatus(): Storage_Error;

ErrorStatusExtension(): TCollection_AsciiString;

ClearErrorStatus(): void;

UpdateRoot(aName: TCollection_AsciiString, aPers: Standard_Persistent): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for basic storage/retrieval algorithms
Storage_Schema: declare class Storage_Schema extends Standard_Transient

constructor

// returns version of the schema
SetVersion(aVersion: TCollection_AsciiString): void;

// returns the version of the schema
Version(): TCollection_AsciiString;

// set the schema's name
SetName(aSchemaName: TCollection_AsciiString): void;

// returns the schema's name
Name(): TCollection_AsciiString;

// return a current date string
static ICreationDate(): TCollection_AsciiString;

// returns True if theType migration is identified the callback support provides a way to read a file with a incomplete schema
static CheckTypeMigration(theTypeName: TCollection_AsciiString, theNewName: TCollection_AsciiString): boolean;
// theNewName: Mutated in place

// add two functions to the callback list
AddReadUnknownTypeCallBack(aTypeName: TCollection_AsciiString, aCallBack: Storage_CallBack): void;

// remove a callback for a type
RemoveReadUnknownTypeCallBack(aTypeName: TCollection_AsciiString): void;

// returns a list of type name with installed callback
InstalledCallBackList(): NCollection_HSequence_TCollection_AsciiString;

// clear all callback from schema instance
ClearCallBackList(): void;

// install a callback for all unknown type
UseDefaultCallBack(): void;

// tells schema to uninstall the default callback
DontUseDefaultCallBack(): void;

// ask if the schema is using the default callback
IsUsingDefaultCallBack(): boolean;

// overload the default function for build
SetDefaultCallBack(f: Storage_CallBack): void;

// reset the default function defined by {@link Storage`Storage`} package
ResetDefaultCallBack(): void;

// returns the read function used when the `UseDefaultCallBack()` is set
DefaultCallBack(): Storage_CallBack;

AddPersistent(sp: Standard_Persistent, tName: string): boolean;

PersistentToAdd(sp: Standard_Persistent): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_SolveMode: typeof Storage_SolveMode[keyof typeof Storage_SolveMode]

Storage_StreamExtCharParityError: declare class Storage_StreamExtCharParityError extends Storage_StreamReadError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_StreamFormatError: declare class Storage_StreamFormatError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_StreamModeError: declare class Storage_StreamModeError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_StreamReadError: declare class Storage_StreamReadError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_StreamTypeMismatchError: declare class Storage_StreamTypeMismatchError extends Storage_StreamReadError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_StreamUnknownTypeError: declare class Storage_StreamUnknownTypeError extends Storage_StreamReadError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_StreamWriteError: declare class Storage_StreamWriteError extends Standard_Failure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_TypeData: declare class Storage_TypeData extends Standard_Transient

constructor

NumberOfTypes(): number;

// add a type to the list
AddType(aName: TCollection_AsciiString, aTypeNum: number): void;

// returns the name of the type with number <aTypeNum>
Type(aTypeNum: number): TCollection_AsciiString;
Type(aTypeName: TCollection_AsciiString): number;
Type(aTypeNum: number): TCollection_AsciiString;
Type(aTypeName: TCollection_AsciiString): number;

IsType(aName: TCollection_AsciiString): boolean;

Types(): NCollection_HSequence_TCollection_AsciiString;

ErrorStatus(): Storage_Error;

ErrorStatusExtension(): TCollection_AsciiString;

ClearErrorStatus(): void;

Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_TypedCallBack: declare class Storage_TypedCallBack extends Standard_Transient

constructor

SetType(aType: TCollection_AsciiString): void;

Type(): TCollection_AsciiString;

SetCallBack(aCallBack: Storage_CallBack): void;

CallBack(): Storage_CallBack;

SetIndex(anIndex: number): void;

Index(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Storage_HPArray: NCollection_HArray1_handle_Standard_Persistent

Storage_HSeqOfRoot: NCollection_HSequence_handle_Storage_Root

Storage_PArray: NCollection_Array1_handle_Standard_Persistent

Storage_SeqOfRoot: NCollection_Sequence_handle_Storage_Root
