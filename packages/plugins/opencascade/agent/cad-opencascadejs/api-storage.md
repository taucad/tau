# libcascade — Storage

28 top-level symbols. Signatures are verbatim typescript.

Storage: declare class Storage

constructor

static Version(): TCollection_AsciiString;

delete(): void;

[Symbol.dispose](): void;

Storage_Bucket: declare class Storage_Bucket

constructor

Clear(): void;

delete(): void;

[Symbol.dispose](): void;

Storage_BucketIterator: declare class Storage_BucketIterator

constructor

Init(argNo0: Storage_BucketOfPersistent): void;

Reset(): void;

Value(): Standard_Persistent;

More(): boolean;

Next(): void;

delete(): void;

[Symbol.dispose](): void;

Storage_BucketOfPersistent: declare class Storage_BucketOfPersistent

constructor

Length(): number;

Append(sp: Standard_Persistent): void;

Value(theIndex: number): Standard_Persistent;

Clear(): void;

delete(): void;

[Symbol.dispose](): void;

Storage_CallBack: declare class Storage_CallBack extends Standard_Transient

New(): Standard_Persistent;

Add(aPers: Standard_Persistent, aSchema: Storage_Schema): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Storage_Data: declare class Storage_Data extends Standard_Transient

constructor

ErrorStatus(): Storage_Error;

ClearErrorStatus(): void;

ErrorStatusExtension(): TCollection_AsciiString;

CreationDate(): TCollection_AsciiString;

StorageVersion(): TCollection_AsciiString;

SchemaVersion(): TCollection_AsciiString;

SchemaName(): TCollection_AsciiString;

SetApplicationVersion(aVersion: TCollection_AsciiString): void;

ApplicationVersion(): TCollection_AsciiString;

SetApplicationName(aName: TCollection_ExtendedString): void;

ApplicationName(): TCollection_ExtendedString;

SetDataType(aType: TCollection_ExtendedString): void;

DataType(): TCollection_ExtendedString;

AddToUserInfo(anInfo: TCollection_AsciiString): void;

UserInfo(): NCollection_Sequence_TCollection_AsciiString;

AddToComments(aComment: TCollection_ExtendedString): void;

Comments(): NCollection_Sequence_TCollection_ExtendedString;

NumberOfObjects(): number;

NumberOfRoots(): number;

AddRoot(anObject: Standard_Persistent): void;
AddRoot(aName: TCollection_AsciiString, anObject: Standard_Persistent): void;
AddRoot(anObject: Standard_Persistent): void;
AddRoot(aName: TCollection_AsciiString, anObject: Standard_Persistent): void;

RemoveRoot(aName: TCollection_AsciiString): void;

Roots(): NCollection_HSequence_handle_Storage_Root;

Find(aName: TCollection_AsciiString): Storage_Root;

IsRoot(aName: TCollection_AsciiString): boolean;

NumberOfTypes(): number;

IsType(aName: TCollection_AsciiString): boolean;

Types(): NCollection_HSequence_TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

HeaderData(): Storage_HeaderData;

RootData(): Storage_RootData;

TypeData(): Storage_TypeData;

InternalData(): Storage_InternalData;

Clear(): void;

delete(): void;

[Symbol.dispose](): void;

Storage_DefaultCallBack: declare class Storage_DefaultCallBack extends Storage_CallBack

constructor

New(): Standard_Persistent;

Add(aPers: Standard_Persistent, aSchema: Storage_Schema): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Storage_Error: typeof Storage_Error[keyof typeof Storage_Error]

Storage_HeaderData: declare class Storage_HeaderData extends Standard_Transient

constructor

CreationDate(): TCollection_AsciiString;

StorageVersion(): TCollection_AsciiString;

SchemaVersion(): TCollection_AsciiString;

SchemaName(): TCollection_AsciiString;

SetApplicationVersion(aVersion: TCollection_AsciiString): void;

ApplicationVersion(): TCollection_AsciiString;

SetApplicationName(aName: TCollection_ExtendedString): void;

ApplicationName(): TCollection_ExtendedString;

SetDataType(aType: TCollection_ExtendedString): void;

DataType(): TCollection_ExtendedString;

AddToUserInfo(theUserInfo: TCollection_AsciiString): void;

UserInfo(): NCollection_Sequence_TCollection_AsciiString;

AddToComments(aComment: TCollection_ExtendedString): void;

Comments(): NCollection_Sequence_TCollection_ExtendedString;

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

delete(): void;

[Symbol.dispose](): void;

Storage_InternalData: declare class Storage_InternalData extends Standard_Transient

constructor

ReadArray(): NCollection_HArray1_handle_Standard_Persistent;

Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Storage_OpenMode: typeof Storage_OpenMode[keyof typeof Storage_OpenMode]

Storage_Root: declare class Storage_Root extends Standard_Transient

constructor

SetName(theName: TCollection_AsciiString): void;

Name(): TCollection_AsciiString;

SetObject(anObject: Standard_Persistent): void;

Object(): Standard_Persistent;

Type(): TCollection_AsciiString;

SetReference(aRef: number): void;

Reference(): number;

SetType(aType: TCollection_AsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Storage_RootData: declare class Storage_RootData extends Standard_Transient

constructor

NumberOfRoots(): number;

AddRoot(aRoot: Storage_Root): void;

Roots(): NCollection_HSequence_handle_Storage_Root;

Find(aName: TCollection_AsciiString): Storage_Root;

IsRoot(aName: TCollection_AsciiString): boolean;

RemoveRoot(aName: TCollection_AsciiString): void;

ErrorStatus(): Storage_Error;

ErrorStatusExtension(): TCollection_AsciiString;

ClearErrorStatus(): void;

UpdateRoot(aName: TCollection_AsciiString, aPers: Standard_Persistent): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Storage_Schema: declare class Storage_Schema extends Standard_Transient

constructor

SetVersion(aVersion: TCollection_AsciiString): void;

Version(): TCollection_AsciiString;

SetName(aSchemaName: TCollection_AsciiString): void;

Name(): TCollection_AsciiString;

static ICreationDate(): TCollection_AsciiString;

static CheckTypeMigration(theTypeName: TCollection_AsciiString, theNewName: TCollection_AsciiString): boolean;

AddReadUnknownTypeCallBack(aTypeName: TCollection_AsciiString, aCallBack: Storage_CallBack): void;

RemoveReadUnknownTypeCallBack(aTypeName: TCollection_AsciiString): void;

InstalledCallBackList(): NCollection_HSequence_TCollection_AsciiString;

ClearCallBackList(): void;

UseDefaultCallBack(): void;

DontUseDefaultCallBack(): void;

IsUsingDefaultCallBack(): boolean;

SetDefaultCallBack(f: Storage_CallBack): void;

ResetDefaultCallBack(): void;

DefaultCallBack(): Storage_CallBack;

AddPersistent(sp: Standard_Persistent, tName: string): boolean;

PersistentToAdd(sp: Standard_Persistent): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Storage_SolveMode: typeof Storage_SolveMode[keyof typeof Storage_SolveMode]

Storage_StreamExtCharParityError: declare class Storage_StreamExtCharParityError extends Storage_StreamReadError

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Storage_StreamFormatError: declare class Storage_StreamFormatError extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Storage_StreamModeError: declare class Storage_StreamModeError extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Storage_StreamReadError: declare class Storage_StreamReadError extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Storage_StreamTypeMismatchError: declare class Storage_StreamTypeMismatchError extends Storage_StreamReadError

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Storage_StreamUnknownTypeError: declare class Storage_StreamUnknownTypeError extends Storage_StreamReadError

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Storage_StreamWriteError: declare class Storage_StreamWriteError extends Standard_Failure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Storage_TypeData: declare class Storage_TypeData extends Standard_Transient

constructor

NumberOfTypes(): number;

AddType(aName: TCollection_AsciiString, aTypeNum: number): void;

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

delete(): void;

[Symbol.dispose](): void;

Storage_HPArray: NCollection_HArray1_handle_Standard_Persistent

Storage_HSeqOfRoot: NCollection_HSequence_handle_Storage_Root

Storage_PArray: NCollection_Array1_handle_Standard_Persistent

Storage_SeqOfRoot: NCollection_Sequence_handle_Storage_Root
