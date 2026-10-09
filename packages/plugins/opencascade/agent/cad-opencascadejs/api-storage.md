# libcascade — Storage

28 top-level symbols. Signatures are verbatim typescript.

Storage: declare class Storage

  // Storage.constructor (constructor)
  constructor();

  // Storage.Version (method)
  static Version(): TCollection_AsciiString;

  // Storage.delete (method)
  delete(): void;

  // Storage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_Bucket: declare class Storage_Bucket

  // Storage_Bucket.constructor (constructor)
  constructor();
  constructor(theSpaceSize: number);

  // Storage_Bucket.Clear (method)
  Clear(): void;

  // Storage_Bucket.delete (method)
  delete(): void;

  // Storage_Bucket.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_BucketIterator: declare class Storage_BucketIterator

  // Storage_BucketIterator.constructor (constructor)
  constructor(a0: Storage_BucketOfPersistent);

  // Storage_BucketIterator.Init (method)
  Init(argNo0: Storage_BucketOfPersistent): void;

  // Storage_BucketIterator.Reset (method)
  Reset(): void;

  // Storage_BucketIterator.Value (method)
  Value(): Standard_Persistent;

  // Storage_BucketIterator.More (method)
  More(): boolean;

  // Storage_BucketIterator.Next (method)
  Next(): void;

  // Storage_BucketIterator.delete (method)
  delete(): void;

  // Storage_BucketIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_BucketOfPersistent: declare class Storage_BucketOfPersistent

  // Storage_BucketOfPersistent.constructor (constructor)
  constructor(theBucketSize?: number, theBucketNumber?: number);

  // Storage_BucketOfPersistent.Length (method)
  Length(): number;

  // Storage_BucketOfPersistent.Append (method)
  Append(sp: Standard_Persistent): void;

  // Storage_BucketOfPersistent.Value (method)
  Value(theIndex: number): Standard_Persistent;

  // Storage_BucketOfPersistent.Clear (method)
  Clear(): void;

  // Storage_BucketOfPersistent.delete (method)
  delete(): void;

  // Storage_BucketOfPersistent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_CallBack: declare class Storage_CallBack extends Standard_Transient

  // Storage_CallBack.New (method)
  New(): Standard_Persistent;

  // Storage_CallBack.Add (method)
  Add(aPers: Standard_Persistent, aSchema: Storage_Schema): void;

  // Storage_CallBack.get_type_name (method)
  static get_type_name(): string;

  // Storage_CallBack.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_CallBack.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_CallBack.delete (method)
  delete(): void;

  // Storage_CallBack.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_Data: declare class Storage_Data extends Standard_Transient

  // Storage_Data.constructor (constructor)
  constructor();

  // Storage_Data.ErrorStatus (method)
  ErrorStatus(): Storage_Error;

  // Storage_Data.ClearErrorStatus (method)
  ClearErrorStatus(): void;

  // Storage_Data.ErrorStatusExtension (method)
  ErrorStatusExtension(): TCollection_AsciiString;

  // Storage_Data.CreationDate (method)
  CreationDate(): TCollection_AsciiString;

  // Storage_Data.StorageVersion (method)
  StorageVersion(): TCollection_AsciiString;

  // Storage_Data.SchemaVersion (method)
  SchemaVersion(): TCollection_AsciiString;

  // Storage_Data.SchemaName (method)
  SchemaName(): TCollection_AsciiString;

  // Storage_Data.SetApplicationVersion (method)
  SetApplicationVersion(aVersion: TCollection_AsciiString): void;

  // Storage_Data.ApplicationVersion (method)
  ApplicationVersion(): TCollection_AsciiString;

  // Storage_Data.SetApplicationName (method)
  SetApplicationName(aName: TCollection_ExtendedString): void;

  // Storage_Data.ApplicationName (method)
  ApplicationName(): TCollection_ExtendedString;

  // Storage_Data.SetDataType (method)
  SetDataType(aType: TCollection_ExtendedString): void;

  // Storage_Data.DataType (method)
  DataType(): TCollection_ExtendedString;

  // Storage_Data.AddToUserInfo (method)
  AddToUserInfo(anInfo: TCollection_AsciiString): void;

  // Storage_Data.UserInfo (method)
  UserInfo(): NCollection_Sequence_TCollection_AsciiString;

  // Storage_Data.AddToComments (method)
  AddToComments(aComment: TCollection_ExtendedString): void;

  // Storage_Data.Comments (method)
  Comments(): NCollection_Sequence_TCollection_ExtendedString;

  // Storage_Data.NumberOfObjects (method)
  NumberOfObjects(): number;

  // Storage_Data.NumberOfRoots (method)
  NumberOfRoots(): number;

  // Storage_Data.AddRoot (method)
  AddRoot(anObject: Standard_Persistent): void;
  AddRoot(aName: TCollection_AsciiString, anObject: Standard_Persistent): void;

  // Storage_Data.RemoveRoot (method)
  RemoveRoot(aName: TCollection_AsciiString): void;

  // Storage_Data.Roots (method)
  Roots(): NCollection_HSequence_handle_Storage_Root;

  // Storage_Data.Find (method)
  Find(aName: TCollection_AsciiString): Storage_Root;

  // Storage_Data.IsRoot (method)
  IsRoot(aName: TCollection_AsciiString): boolean;

  // Storage_Data.NumberOfTypes (method)
  NumberOfTypes(): number;

  // Storage_Data.IsType (method)
  IsType(aName: TCollection_AsciiString): boolean;

  // Storage_Data.Types (method)
  Types(): NCollection_HSequence_TCollection_AsciiString;

  // Storage_Data.get_type_name (method)
  static get_type_name(): string;

  // Storage_Data.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_Data.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_Data.HeaderData (method)
  HeaderData(): Storage_HeaderData;

  // Storage_Data.RootData (method)
  RootData(): Storage_RootData;

  // Storage_Data.TypeData (method)
  TypeData(): Storage_TypeData;

  // Storage_Data.InternalData (method)
  InternalData(): Storage_InternalData;

  // Storage_Data.Clear (method)
  Clear(): void;

  // Storage_Data.delete (method)
  delete(): void;

  // Storage_Data.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_DefaultCallBack: declare class Storage_DefaultCallBack extends Storage_CallBack

  // Storage_DefaultCallBack.constructor (constructor)
  constructor();

  // Storage_DefaultCallBack.New (method)
  New(): Standard_Persistent;

  // Storage_DefaultCallBack.Add (method)
  Add(aPers: Standard_Persistent, aSchema: Storage_Schema): void;

  // Storage_DefaultCallBack.get_type_name (method)
  static get_type_name(): string;

  // Storage_DefaultCallBack.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_DefaultCallBack.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_DefaultCallBack.delete (method)
  delete(): void;

  // Storage_DefaultCallBack.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_Error: typeof Storage_Error[keyof typeof Storage_Error]

  readonly Storage_VSOk: 'Storage_VSOk'

  readonly Storage_VSOpenError: 'Storage_VSOpenError'

  readonly Storage_VSModeError: 'Storage_VSModeError'

  readonly Storage_VSCloseError: 'Storage_VSCloseError'

  readonly Storage_VSAlreadyOpen: 'Storage_VSAlreadyOpen'

  readonly Storage_VSNotOpen: 'Storage_VSNotOpen'

  readonly Storage_VSSectionNotFound: 'Storage_VSSectionNotFound'

  readonly Storage_VSWriteError: 'Storage_VSWriteError'

  readonly Storage_VSFormatError: 'Storage_VSFormatError'

  readonly Storage_VSUnknownType: 'Storage_VSUnknownType'

  readonly Storage_VSTypeMismatch: 'Storage_VSTypeMismatch'

  readonly Storage_VSInternalError: 'Storage_VSInternalError'

  readonly Storage_VSExtCharParityError: 'Storage_VSExtCharParityError'

  readonly Storage_VSWrongFileDriver: 'Storage_VSWrongFileDriver'

Storage_HeaderData: declare class Storage_HeaderData extends Standard_Transient

  // Storage_HeaderData.constructor (constructor)
  constructor();

  // Storage_HeaderData.CreationDate (method)
  CreationDate(): TCollection_AsciiString;

  // Storage_HeaderData.StorageVersion (method)
  StorageVersion(): TCollection_AsciiString;

  // Storage_HeaderData.SchemaVersion (method)
  SchemaVersion(): TCollection_AsciiString;

  // Storage_HeaderData.SchemaName (method)
  SchemaName(): TCollection_AsciiString;

  // Storage_HeaderData.SetApplicationVersion (method)
  SetApplicationVersion(aVersion: TCollection_AsciiString): void;

  // Storage_HeaderData.ApplicationVersion (method)
  ApplicationVersion(): TCollection_AsciiString;

  // Storage_HeaderData.SetApplicationName (method)
  SetApplicationName(aName: TCollection_ExtendedString): void;

  // Storage_HeaderData.ApplicationName (method)
  ApplicationName(): TCollection_ExtendedString;

  // Storage_HeaderData.SetDataType (method)
  SetDataType(aType: TCollection_ExtendedString): void;

  // Storage_HeaderData.DataType (method)
  DataType(): TCollection_ExtendedString;

  // Storage_HeaderData.AddToUserInfo (method)
  AddToUserInfo(theUserInfo: TCollection_AsciiString): void;

  // Storage_HeaderData.UserInfo (method)
  UserInfo(): NCollection_Sequence_TCollection_AsciiString;

  // Storage_HeaderData.AddToComments (method)
  AddToComments(aComment: TCollection_ExtendedString): void;

  // Storage_HeaderData.Comments (method)
  Comments(): NCollection_Sequence_TCollection_ExtendedString;

  // Storage_HeaderData.NumberOfObjects (method)
  NumberOfObjects(): number;

  // Storage_HeaderData.ErrorStatus (method)
  ErrorStatus(): Storage_Error;

  // Storage_HeaderData.ErrorStatusExtension (method)
  ErrorStatusExtension(): TCollection_AsciiString;

  // Storage_HeaderData.ClearErrorStatus (method)
  ClearErrorStatus(): void;

  // Storage_HeaderData.get_type_name (method)
  static get_type_name(): string;

  // Storage_HeaderData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_HeaderData.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_HeaderData.SetNumberOfObjects (method)
  SetNumberOfObjects(anObjectNumber: number): void;

  // Storage_HeaderData.SetStorageVersion (method)
  SetStorageVersion(aVersion: TCollection_AsciiString): void;
  SetStorageVersion(theVersion: number): void;

  // Storage_HeaderData.SetCreationDate (method)
  SetCreationDate(aDate: TCollection_AsciiString): void;

  // Storage_HeaderData.SetSchemaVersion (method)
  SetSchemaVersion(aVersion: TCollection_AsciiString): void;

  // Storage_HeaderData.SetSchemaName (method)
  SetSchemaName(aName: TCollection_AsciiString): void;

  // Storage_HeaderData.delete (method)
  delete(): void;

  // Storage_HeaderData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_InternalData: declare class Storage_InternalData extends Standard_Transient

  // Storage_InternalData.constructor (constructor)
  constructor();

  // Storage_InternalData.ReadArray (method)
  ReadArray(): NCollection_HArray1_handle_Standard_Persistent;

  // Storage_InternalData.Clear (method)
  Clear(): void;

  // Storage_InternalData.get_type_name (method)
  static get_type_name(): string;

  // Storage_InternalData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_InternalData.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_InternalData.delete (method)
  delete(): void;

  // Storage_InternalData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_OpenMode: typeof Storage_OpenMode[keyof typeof Storage_OpenMode]

  readonly Storage_VSNone: 'Storage_VSNone'

  readonly Storage_VSRead: 'Storage_VSRead'

  readonly Storage_VSWrite: 'Storage_VSWrite'

  readonly Storage_VSReadWrite: 'Storage_VSReadWrite'

Storage_Root: declare class Storage_Root extends Standard_Transient

  // Storage_Root.constructor (constructor)
  constructor();
  constructor(theName: TCollection_AsciiString, theObject: Standard_Persistent);
  constructor(theName: TCollection_AsciiString, theRef: number, theType: TCollection_AsciiString);

  // Storage_Root.SetName (method)
  SetName(theName: TCollection_AsciiString): void;

  // Storage_Root.Name (method)
  Name(): TCollection_AsciiString;

  // Storage_Root.SetObject (method)
  SetObject(anObject: Standard_Persistent): void;

  // Storage_Root.Object (method)
  Object(): Standard_Persistent;

  // Storage_Root.Type (method)
  Type(): TCollection_AsciiString;

  // Storage_Root.SetReference (method)
  SetReference(aRef: number): void;

  // Storage_Root.Reference (method)
  Reference(): number;

  // Storage_Root.SetType (method)
  SetType(aType: TCollection_AsciiString): void;

  // Storage_Root.get_type_name (method)
  static get_type_name(): string;

  // Storage_Root.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_Root.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_Root.delete (method)
  delete(): void;

  // Storage_Root.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_RootData: declare class Storage_RootData extends Standard_Transient

  // Storage_RootData.constructor (constructor)
  constructor();

  // Storage_RootData.NumberOfRoots (method)
  NumberOfRoots(): number;

  // Storage_RootData.AddRoot (method)
  AddRoot(aRoot: Storage_Root): void;

  // Storage_RootData.Roots (method)
  Roots(): NCollection_HSequence_handle_Storage_Root;

  // Storage_RootData.Find (method)
  Find(aName: TCollection_AsciiString): Storage_Root;

  // Storage_RootData.IsRoot (method)
  IsRoot(aName: TCollection_AsciiString): boolean;

  // Storage_RootData.RemoveRoot (method)
  RemoveRoot(aName: TCollection_AsciiString): void;

  // Storage_RootData.ErrorStatus (method)
  ErrorStatus(): Storage_Error;

  // Storage_RootData.ErrorStatusExtension (method)
  ErrorStatusExtension(): TCollection_AsciiString;

  // Storage_RootData.ClearErrorStatus (method)
  ClearErrorStatus(): void;

  // Storage_RootData.UpdateRoot (method)
  UpdateRoot(aName: TCollection_AsciiString, aPers: Standard_Persistent): void;

  // Storage_RootData.get_type_name (method)
  static get_type_name(): string;

  // Storage_RootData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_RootData.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_RootData.delete (method)
  delete(): void;

  // Storage_RootData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_Schema: declare class Storage_Schema extends Standard_Transient

  // Storage_Schema.constructor (constructor)
  constructor();

  // Storage_Schema.SetVersion (method)
  SetVersion(aVersion: TCollection_AsciiString): void;

  // Storage_Schema.Version (method)
  Version(): TCollection_AsciiString;

  // Storage_Schema.SetName (method)
  SetName(aSchemaName: TCollection_AsciiString): void;

  // Storage_Schema.Name (method)
  Name(): TCollection_AsciiString;

  // Storage_Schema.ICreationDate (method)
  static ICreationDate(): TCollection_AsciiString;

  // Storage_Schema.CheckTypeMigration (method)
  static CheckTypeMigration(theTypeName: TCollection_AsciiString, theNewName: TCollection_AsciiString): boolean;

  // Storage_Schema.AddReadUnknownTypeCallBack (method)
  AddReadUnknownTypeCallBack(aTypeName: TCollection_AsciiString, aCallBack: Storage_CallBack): void;

  // Storage_Schema.RemoveReadUnknownTypeCallBack (method)
  RemoveReadUnknownTypeCallBack(aTypeName: TCollection_AsciiString): void;

  // Storage_Schema.InstalledCallBackList (method)
  InstalledCallBackList(): NCollection_HSequence_TCollection_AsciiString;

  // Storage_Schema.ClearCallBackList (method)
  ClearCallBackList(): void;

  // Storage_Schema.UseDefaultCallBack (method)
  UseDefaultCallBack(): void;

  // Storage_Schema.DontUseDefaultCallBack (method)
  DontUseDefaultCallBack(): void;

  // Storage_Schema.IsUsingDefaultCallBack (method)
  IsUsingDefaultCallBack(): boolean;

  // Storage_Schema.SetDefaultCallBack (method)
  SetDefaultCallBack(f: Storage_CallBack): void;

  // Storage_Schema.ResetDefaultCallBack (method)
  ResetDefaultCallBack(): void;

  // Storage_Schema.DefaultCallBack (method)
  DefaultCallBack(): Storage_CallBack;

  // Storage_Schema.AddPersistent (method)
  AddPersistent(sp: Standard_Persistent, tName: string): boolean;

  // Storage_Schema.PersistentToAdd (method)
  PersistentToAdd(sp: Standard_Persistent): boolean;

  // Storage_Schema.get_type_name (method)
  static get_type_name(): string;

  // Storage_Schema.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_Schema.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_Schema.delete (method)
  delete(): void;

  // Storage_Schema.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_SolveMode: typeof Storage_SolveMode[keyof typeof Storage_SolveMode]

  readonly Storage_AddSolve: 'Storage_AddSolve'

  readonly Storage_WriteSolve: 'Storage_WriteSolve'

  readonly Storage_ReadSolve: 'Storage_ReadSolve'

Storage_StreamExtCharParityError: declare class Storage_StreamExtCharParityError extends Storage_StreamReadError

  // Storage_StreamExtCharParityError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Storage_StreamExtCharParityError.ExceptionType (method)
  ExceptionType(): string;

  // Storage_StreamExtCharParityError.delete (method)
  delete(): void;

  // Storage_StreamExtCharParityError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_StreamFormatError: declare class Storage_StreamFormatError extends Standard_Failure

  // Storage_StreamFormatError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Storage_StreamFormatError.ExceptionType (method)
  ExceptionType(): string;

  // Storage_StreamFormatError.delete (method)
  delete(): void;

  // Storage_StreamFormatError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_StreamModeError: declare class Storage_StreamModeError extends Standard_Failure

  // Storage_StreamModeError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Storage_StreamModeError.ExceptionType (method)
  ExceptionType(): string;

  // Storage_StreamModeError.delete (method)
  delete(): void;

  // Storage_StreamModeError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_StreamReadError: declare class Storage_StreamReadError extends Standard_Failure

  // Storage_StreamReadError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Storage_StreamReadError.ExceptionType (method)
  ExceptionType(): string;

  // Storage_StreamReadError.delete (method)
  delete(): void;

  // Storage_StreamReadError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_StreamTypeMismatchError: declare class Storage_StreamTypeMismatchError extends Storage_StreamReadError

  // Storage_StreamTypeMismatchError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Storage_StreamTypeMismatchError.ExceptionType (method)
  ExceptionType(): string;

  // Storage_StreamTypeMismatchError.delete (method)
  delete(): void;

  // Storage_StreamTypeMismatchError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_StreamUnknownTypeError: declare class Storage_StreamUnknownTypeError extends Storage_StreamReadError

  // Storage_StreamUnknownTypeError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Storage_StreamUnknownTypeError.ExceptionType (method)
  ExceptionType(): string;

  // Storage_StreamUnknownTypeError.delete (method)
  delete(): void;

  // Storage_StreamUnknownTypeError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_StreamWriteError: declare class Storage_StreamWriteError extends Standard_Failure

  // Storage_StreamWriteError.constructor (constructor)
  constructor(theMessage: string);
  constructor(theMessage: string, theStackTrace: string);

  // Storage_StreamWriteError.ExceptionType (method)
  ExceptionType(): string;

  // Storage_StreamWriteError.delete (method)
  delete(): void;

  // Storage_StreamWriteError.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_TypeData: declare class Storage_TypeData extends Standard_Transient

  // Storage_TypeData.constructor (constructor)
  constructor();

  // Storage_TypeData.NumberOfTypes (method)
  NumberOfTypes(): number;

  // Storage_TypeData.AddType (method)
  AddType(aName: TCollection_AsciiString, aTypeNum: number): void;

  // Storage_TypeData.Type (method)
  Type(aTypeNum: number): TCollection_AsciiString;
  Type(aTypeName: TCollection_AsciiString): number;

  // Storage_TypeData.IsType (method)
  IsType(aName: TCollection_AsciiString): boolean;

  // Storage_TypeData.Types (method)
  Types(): NCollection_HSequence_TCollection_AsciiString;

  // Storage_TypeData.ErrorStatus (method)
  ErrorStatus(): Storage_Error;

  // Storage_TypeData.ErrorStatusExtension (method)
  ErrorStatusExtension(): TCollection_AsciiString;

  // Storage_TypeData.ClearErrorStatus (method)
  ClearErrorStatus(): void;

  // Storage_TypeData.Clear (method)
  Clear(): void;

  // Storage_TypeData.get_type_name (method)
  static get_type_name(): string;

  // Storage_TypeData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_TypeData.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_TypeData.delete (method)
  delete(): void;

  // Storage_TypeData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_TypedCallBack: declare class Storage_TypedCallBack extends Standard_Transient

  // Storage_TypedCallBack.constructor (constructor)
  constructor();
  constructor(aTypeName: TCollection_AsciiString, aCallBack: Storage_CallBack);

  // Storage_TypedCallBack.SetType (method)
  SetType(aType: TCollection_AsciiString): void;

  // Storage_TypedCallBack.Type (method)
  Type(): TCollection_AsciiString;

  // Storage_TypedCallBack.SetCallBack (method)
  SetCallBack(aCallBack: Storage_CallBack): void;

  // Storage_TypedCallBack.CallBack (method)
  CallBack(): Storage_CallBack;

  // Storage_TypedCallBack.SetIndex (method)
  SetIndex(anIndex: number): void;

  // Storage_TypedCallBack.Index (method)
  Index(): number;

  // Storage_TypedCallBack.get_type_name (method)
  static get_type_name(): string;

  // Storage_TypedCallBack.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Storage_TypedCallBack.DynamicType (method)
  DynamicType(): Standard_Type;

  // Storage_TypedCallBack.delete (method)
  delete(): void;

  // Storage_TypedCallBack.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Storage_HPArray: NCollection_HArray1_handle_Standard_Persistent

Storage_HSeqOfRoot: NCollection_HSequence_handle_Storage_Root

Storage_PArray: NCollection_Array1_handle_Standard_Persistent

Storage_SeqOfRoot: NCollection_Sequence_handle_Storage_Root
