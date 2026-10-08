# libcascade — CDF

11 top-level symbols. Signatures are verbatim typescript.

CDF_Application: declare class CDF_Application extends CDM_Application

  myMetaDataDriver: CDF_MetaDataDriver

  myDirectory: CDF_Directory

  // CDF_Application.Load (method)
  static Load(aGUID: Standard_GUID): CDF_Application;

  // CDF_Application.NewDocument (method)
  NewDocument(theFormat: TCollection_ExtendedString): { theDoc: CDM_Document; [Symbol.dispose](): void };

  // CDF_Application.InitDocument (method)
  InitDocument(theDoc: CDM_Document): void;

  // CDF_Application.Open (method)
  Open(aDocument: CDM_Document): void;

  // CDF_Application.CanClose (method)
  CanClose(aDocument: CDM_Document): CDM_CanCloseStatus;

  // CDF_Application.Close (method)
  Close(aDocument: CDM_Document): void;

  // CDF_Application.CanRetrieve (method)
  CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;
  CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theVersion: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;

  // CDF_Application.GetRetrieveStatus (method)
  GetRetrieveStatus(): PCDM_ReaderStatus;

  // CDF_Application.ReaderFromFormat (method)
  ReaderFromFormat(aFormat: TCollection_ExtendedString): PCDM_Reader;

  // CDF_Application.WriterFromFormat (method)
  WriterFromFormat(aFormat: TCollection_ExtendedString): PCDM_StorageDriver;

  // CDF_Application.Format (method)
  Format(aFileName: TCollection_ExtendedString, theFormat: TCollection_ExtendedString): boolean;

  // CDF_Application.DefaultFolder (method)
  DefaultFolder(): string;

  // CDF_Application.SetDefaultFolder (method)
  SetDefaultFolder(aFolder: string): boolean;

  // CDF_Application.MetaDataDriver (method)
  MetaDataDriver(): CDF_MetaDataDriver;

  // CDF_Application.get_type_name (method)
  static get_type_name(): string;

  // CDF_Application.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDF_Application.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDF_Application.delete (method)
  delete(): void;

  // CDF_Application.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDF_Directory: declare class CDF_Directory extends Standard_Transient

  // CDF_Directory.constructor (constructor)
  constructor();

  // CDF_Directory.Add (method)
  Add(aDocument: CDM_Document): void;

  // CDF_Directory.Remove (method)
  Remove(aDocument: CDM_Document): void;

  // CDF_Directory.Contains (method)
  Contains(aDocument: CDM_Document): boolean;

  // CDF_Directory.Last (method)
  Last(): CDM_Document;

  // CDF_Directory.Length (method)
  Length(): number;

  // CDF_Directory.IsEmpty (method)
  IsEmpty(): boolean;

  // CDF_Directory.get_type_name (method)
  static get_type_name(): string;

  // CDF_Directory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDF_Directory.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDF_Directory.delete (method)
  delete(): void;

  // CDF_Directory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDF_FWOSDriver: declare class CDF_FWOSDriver extends CDF_MetaDataDriver

  // CDF_FWOSDriver.constructor (constructor)
  constructor(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData);

  // CDF_FWOSDriver.Find (method)
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

  // CDF_FWOSDriver.HasReadPermission (method)
  HasReadPermission(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;

  // CDF_FWOSDriver.FindFolder (method)
  FindFolder(aFolder: TCollection_ExtendedString): boolean;

  // CDF_FWOSDriver.DefaultFolder (method)
  DefaultFolder(): TCollection_ExtendedString;

  // CDF_FWOSDriver.BuildFileName (method)
  BuildFileName(aDocument: CDM_Document): TCollection_ExtendedString;

  // CDF_FWOSDriver.SetName (method)
  SetName(aDocument: CDM_Document, aName: TCollection_ExtendedString): TCollection_ExtendedString;

  // CDF_FWOSDriver.get_type_name (method)
  static get_type_name(): string;

  // CDF_FWOSDriver.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDF_FWOSDriver.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDF_FWOSDriver.delete (method)
  delete(): void;

  // CDF_FWOSDriver.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDF_MetaDataDriver: declare class CDF_MetaDataDriver extends Standard_Transient

  // CDF_MetaDataDriver.HasVersionCapability (method)
  HasVersionCapability(): boolean;

  // CDF_MetaDataDriver.CreateDependsOn (method)
  CreateDependsOn(aFirstData: CDM_MetaData, aSecondData: CDM_MetaData): void;

  // CDF_MetaDataDriver.CreateReference (method)
  CreateReference(aFrom: CDM_MetaData, aTo: CDM_MetaData, aReferenceIdentifier: number, aToDocumentVersion: number): void;

  // CDF_MetaDataDriver.HasVersion (method)
  HasVersion(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

  // CDF_MetaDataDriver.BuildFileName (method)
  BuildFileName(aDocument: CDM_Document): TCollection_ExtendedString;

  // CDF_MetaDataDriver.SetName (method)
  SetName(aDocument: CDM_Document, aName: TCollection_ExtendedString): TCollection_ExtendedString;

  // CDF_MetaDataDriver.Find (method)
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
  Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

  // CDF_MetaDataDriver.HasReadPermission (method)
  HasReadPermission(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;

  // CDF_MetaDataDriver.MetaData (method)
  MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): CDM_MetaData;
  MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): CDM_MetaData;

  // CDF_MetaDataDriver.LastVersion (method)
  LastVersion(aMetaData: CDM_MetaData): CDM_MetaData;

  // CDF_MetaDataDriver.CreateMetaData (method)
  CreateMetaData(aDocument: CDM_Document, aFileName: TCollection_ExtendedString): CDM_MetaData;

  // CDF_MetaDataDriver.FindFolder (method)
  FindFolder(aFolder: TCollection_ExtendedString): boolean;

  // CDF_MetaDataDriver.DefaultFolder (method)
  DefaultFolder(): TCollection_ExtendedString;

  // CDF_MetaDataDriver.get_type_name (method)
  static get_type_name(): string;

  // CDF_MetaDataDriver.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDF_MetaDataDriver.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDF_MetaDataDriver.delete (method)
  delete(): void;

  // CDF_MetaDataDriver.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDF_MetaDataDriverFactory: declare class CDF_MetaDataDriverFactory extends Standard_Transient

  // CDF_MetaDataDriverFactory.Build (method)
  Build(): CDF_MetaDataDriver;

  // CDF_MetaDataDriverFactory.get_type_name (method)
  static get_type_name(): string;

  // CDF_MetaDataDriverFactory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDF_MetaDataDriverFactory.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDF_MetaDataDriverFactory.delete (method)
  delete(): void;

  // CDF_MetaDataDriverFactory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDF_Store: declare class CDF_Store

  // CDF_Store.constructor (constructor)
  constructor(aDocument: CDM_Document);

  // CDF_Store.Folder (method)
  Folder(): TCollection_HExtendedString;

  // CDF_Store.Name (method)
  Name(): TCollection_HExtendedString;

  // CDF_Store.IsStored (method)
  IsStored(): boolean;

  // CDF_Store.IsModified (method)
  IsModified(): boolean;

  // CDF_Store.CurrentIsConsistent (method)
  CurrentIsConsistent(): boolean;

  // CDF_Store.IsConsistent (method)
  IsConsistent(): boolean;

  // CDF_Store.HasAPreviousVersion (method)
  HasAPreviousVersion(): boolean;

  // CDF_Store.PreviousVersion (method)
  PreviousVersion(): TCollection_HExtendedString;

  // CDF_Store.IsMainDocument (method)
  IsMainDocument(): boolean;

  // CDF_Store.SetFolder (method)
  SetFolder(aFolder: TCollection_ExtendedString): boolean;

  // CDF_Store.SetFolder_2 (method)
  SetFolder_2(aFolder: string): boolean;

  // CDF_Store.SetName (method)
  SetName(aName: TCollection_ExtendedString): CDF_StoreSetNameStatus;

  // CDF_Store.SetName_1 (method)
  SetName_1(aName: string): CDF_StoreSetNameStatus;

  // CDF_Store.SetComment (method)
  SetComment(aComment: string): void;

  // CDF_Store.Comment (method)
  Comment(): TCollection_HExtendedString;

  // CDF_Store.RecheckName (method)
  RecheckName(): CDF_StoreSetNameStatus;

  // CDF_Store.SetPreviousVersion (method)
  SetPreviousVersion(aPreviousVersion: string): boolean;

  // CDF_Store.Realize (method)
  Realize(theRange?: Message_ProgressRange): void;

  // CDF_Store.Path (method)
  Path(): string;

  // CDF_Store.MetaDataPath (method)
  MetaDataPath(): TCollection_HExtendedString;

  // CDF_Store.Description (method)
  Description(): TCollection_HExtendedString;

  // CDF_Store.SetCurrent (method)
  SetCurrent(aPresentation: string): void;

  // CDF_Store.SetMain (method)
  SetMain(): void;

  // CDF_Store.StoreStatus (method)
  StoreStatus(): PCDM_StoreStatus;

  // CDF_Store.AssociatedStatusText (method)
  AssociatedStatusText(): string;

  // CDF_Store.delete (method)
  delete(): void;

  // CDF_Store.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDF_StoreList: declare class CDF_StoreList extends Standard_Transient

  // CDF_StoreList.constructor (constructor)
  constructor(aDocument: CDM_Document);

  // CDF_StoreList.IsConsistent (method)
  IsConsistent(): boolean;

  // CDF_StoreList.Store (method)
  Store(aStatusAssociatedText: TCollection_ExtendedString, theRange: Message_ProgressRange): { returnValue: PCDM_StoreStatus; aMetaData: CDM_MetaData; [Symbol.dispose](): void };

  // CDF_StoreList.Init (method)
  Init(): void;

  // CDF_StoreList.More (method)
  More(): boolean;

  // CDF_StoreList.Next (method)
  Next(): void;

  // CDF_StoreList.Value (method)
  Value(): CDM_Document;

  // CDF_StoreList.get_type_name (method)
  static get_type_name(): string;

  // CDF_StoreList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDF_StoreList.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDF_StoreList.delete (method)
  delete(): void;

  // CDF_StoreList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDF_StoreSetNameStatus: typeof CDF_StoreSetNameStatus[keyof typeof CDF_StoreSetNameStatus]

  readonly CDF_SSNS_OK: 'CDF_SSNS_OK'

  readonly CDF_SSNS_ReplacingAnExistentDocument: 'CDF_SSNS_ReplacingAnExistentDocument'

  readonly CDF_SSNS_OpenDocument: 'CDF_SSNS_OpenDocument'

CDF_SubComponentStatus: typeof CDF_SubComponentStatus[keyof typeof CDF_SubComponentStatus]

  readonly CDF_SCS_Consistent: 'CDF_SCS_Consistent'

  readonly CDF_SCS_Unconsistent: 'CDF_SCS_Unconsistent'

  readonly CDF_SCS_Stored: 'CDF_SCS_Stored'

  readonly CDF_SCS_Modified: 'CDF_SCS_Modified'

CDF_TryStoreStatus: typeof CDF_TryStoreStatus[keyof typeof CDF_TryStoreStatus]

  readonly CDF_TS_OK: 'CDF_TS_OK'

  readonly CDF_TS_NoCurrentDocument: 'CDF_TS_NoCurrentDocument'

  readonly CDF_TS_NoDriver: 'CDF_TS_NoDriver'

  readonly CDF_TS_NoSubComponentDriver: 'CDF_TS_NoSubComponentDriver'

CDF_TypeOfActivation: typeof CDF_TypeOfActivation[keyof typeof CDF_TypeOfActivation]

  readonly CDF_TOA_New: 'CDF_TOA_New'

  readonly CDF_TOA_Modified: 'CDF_TOA_Modified'

  readonly CDF_TOA_Unchanged: 'CDF_TOA_Unchanged'
