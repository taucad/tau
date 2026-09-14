# libcascade — CDF

11 top-level symbols. Signatures are verbatim typescript.

CDF_Application: declare class CDF_Application extends CDM_Application

  myMetaDataDriver: CDF_MetaDataDriver

  myDirectory: CDF_Directory

  static Load(aGUID: Standard_GUID): CDF_Application;

  NewDocument(theFormat: TCollection_ExtendedString): { theDoc: CDM_Document; [Symbol.dispose](): void };

  InitDocument(theDoc: CDM_Document): void;

  Open(aDocument: CDM_Document): void;

  CanClose(aDocument: CDM_Document): CDM_CanCloseStatus;

  Close(aDocument: CDM_Document): void;

  CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;
  CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theVersion: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;
  CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;
  CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theVersion: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;

  GetRetrieveStatus(): PCDM_ReaderStatus;

  ReaderFromFormat(aFormat: TCollection_ExtendedString): PCDM_Reader;

  WriterFromFormat(aFormat: TCollection_ExtendedString): PCDM_StorageDriver;

  Format(aFileName: TCollection_ExtendedString, theFormat: TCollection_ExtendedString): boolean;

  DefaultFolder(): string;

  SetDefaultFolder(aFolder: string): boolean;

  MetaDataDriver(): CDF_MetaDataDriver;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDF_Directory: declare class CDF_Directory extends Standard_Transient

  constructor

  Add(aDocument: CDM_Document): void;

  Remove(aDocument: CDM_Document): void;

  Contains(aDocument: CDM_Document): boolean;

  Last(): CDM_Document;

  Length(): number;

  IsEmpty(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDF_FWOSDriver: declare class CDF_FWOSDriver extends CDF_MetaDataDriver

  constructor

  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

  HasReadPermission(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;

  FindFolder(aFolder: TCollection_ExtendedString): boolean;

  DefaultFolder(): TCollection_ExtendedString;

  BuildFileName(aDocument: CDM_Document): TCollection_ExtendedString;

  SetName(aDocument: CDM_Document, aName: TCollection_ExtendedString): TCollection_ExtendedString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDF_MetaDataDriver: declare class CDF_MetaDataDriver extends Standard_Transient

  HasVersionCapability(): boolean;

  CreateDependsOn(aFirstData: CDM_MetaData, aSecondData: CDM_MetaData): void;

  CreateReference(aFrom: CDM_MetaData, aTo: CDM_MetaData, aReferenceIdentifier: number, aToDocumentVersion: number): void;

  HasVersion(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

  BuildFileName(aDocument: CDM_Document): TCollection_ExtendedString;

  SetName(aDocument: CDM_Document, aName: TCollection_ExtendedString): TCollection_ExtendedString;

  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

  HasReadPermission(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;

  MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): CDM_MetaData;
  MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): CDM_MetaData;
  MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): CDM_MetaData;
  MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): CDM_MetaData;

  LastVersion(aMetaData: CDM_MetaData): CDM_MetaData;

  CreateMetaData(aDocument: CDM_Document, aFileName: TCollection_ExtendedString): CDM_MetaData;

  FindFolder(aFolder: TCollection_ExtendedString): boolean;

  DefaultFolder(): TCollection_ExtendedString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDF_MetaDataDriverFactory: declare class CDF_MetaDataDriverFactory extends Standard_Transient

  Build(): CDF_MetaDataDriver;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDF_Store: declare class CDF_Store

  constructor

  Folder(): TCollection_HExtendedString;

  Name(): TCollection_HExtendedString;

  IsStored(): boolean;

  IsModified(): boolean;

  CurrentIsConsistent(): boolean;

  IsConsistent(): boolean;

  HasAPreviousVersion(): boolean;

  PreviousVersion(): TCollection_HExtendedString;

  IsMainDocument(): boolean;

  SetFolder(aFolder: TCollection_ExtendedString): boolean;

  SetFolder_2(aFolder: string): boolean;

  SetName(aName: TCollection_ExtendedString): CDF_StoreSetNameStatus;

  SetName_1(aName: string): CDF_StoreSetNameStatus;

  SetComment(aComment: string): void;

  Comment(): TCollection_HExtendedString;

  RecheckName(): CDF_StoreSetNameStatus;

  SetPreviousVersion(aPreviousVersion: string): boolean;

  Realize(theRange?: Message_ProgressRange): void;

  Path(): string;

  MetaDataPath(): TCollection_HExtendedString;

  Description(): TCollection_HExtendedString;

  SetCurrent(aPresentation: string): void;

  SetMain(): void;

  StoreStatus(): PCDM_StoreStatus;

  AssociatedStatusText(): string;

  delete(): void;

  [Symbol.dispose](): void;

CDF_StoreList: declare class CDF_StoreList extends Standard_Transient

  constructor

  IsConsistent(): boolean;

  Store(aStatusAssociatedText: TCollection_ExtendedString, theRange: Message_ProgressRange): { returnValue: PCDM_StoreStatus; aMetaData: CDM_MetaData; [Symbol.dispose](): void };

  Init(): void;

  More(): boolean;

  Next(): void;

  Value(): CDM_Document;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDF_StoreSetNameStatus: typeof CDF_StoreSetNameStatus[keyof typeof CDF_StoreSetNameStatus]

CDF_SubComponentStatus: typeof CDF_SubComponentStatus[keyof typeof CDF_SubComponentStatus]

CDF_TryStoreStatus: typeof CDF_TryStoreStatus[keyof typeof CDF_TryStoreStatus]

CDF_TypeOfActivation: typeof CDF_TypeOfActivation[keyof typeof CDF_TypeOfActivation]
