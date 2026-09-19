# libcascade — CDM

6 top-level symbols. Signatures are verbatim typescript.

CDM_Application: declare class CDM_Application extends Standard_Transient

  Resources(): Resource_Manager;

  BeginOfUpdate(aDocument: CDM_Document): void;

  EndOfUpdate(aDocument: CDM_Document, theStatus: boolean, ErrorString: TCollection_ExtendedString): void;

  Write(aString: string): void;

  Name(): TCollection_ExtendedString;

  Version(): TCollection_AsciiString;

  MetaDataLookUpTable(): NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDM_CanCloseStatus: typeof CDM_CanCloseStatus[keyof typeof CDM_CanCloseStatus]

CDM_Document: declare class CDM_Document extends Standard_Transient

  Update(ErrorString: TCollection_ExtendedString): boolean;
  Update(): void;
  Update(ErrorString: TCollection_ExtendedString): boolean;
  Update(): void;

  StorageFormat(): TCollection_ExtendedString;

  Extensions(Extensions: NCollection_Sequence_TCollection_ExtendedString): void;

  GetAlternativeDocument(aFormat: TCollection_ExtendedString): { returnValue: boolean; anAlternativeDocument: CDM_Document; [Symbol.dispose](): void };

  CreateReference(anOtherDocument: CDM_Document): number;
  CreateReference(aMetaData: CDM_MetaData, aReferenceIdentifier: number, anApplication: CDM_Application, aToDocumentVersion: number, UseStorageConfiguration: boolean): void;
  CreateReference(aMetaData: CDM_MetaData, anApplication: CDM_Application, aDocumentVersion: number, UseStorageConfiguration: boolean): number;
  CreateReference(anOtherDocument: CDM_Document): number;
  CreateReference(aMetaData: CDM_MetaData, aReferenceIdentifier: number, anApplication: CDM_Application, aToDocumentVersion: number, UseStorageConfiguration: boolean): void;
  CreateReference(aMetaData: CDM_MetaData, anApplication: CDM_Application, aDocumentVersion: number, UseStorageConfiguration: boolean): number;
  CreateReference(anOtherDocument: CDM_Document): number;
  CreateReference(aMetaData: CDM_MetaData, aReferenceIdentifier: number, anApplication: CDM_Application, aToDocumentVersion: number, UseStorageConfiguration: boolean): void;
  CreateReference(aMetaData: CDM_MetaData, anApplication: CDM_Application, aDocumentVersion: number, UseStorageConfiguration: boolean): number;

  RemoveReference(aReferenceIdentifier: number): void;

  RemoveAllReferences(): void;

  Document(aReferenceIdentifier: number): CDM_Document;

  IsInSession(aReferenceIdentifier: number): boolean;

  IsStored(aReferenceIdentifier: number): boolean;
  IsStored(): boolean;
  IsStored(aReferenceIdentifier: number): boolean;
  IsStored(): boolean;

  Name(aReferenceIdentifier: number): TCollection_ExtendedString;

  ToReferencesNumber(): number;

  FromReferencesNumber(): number;

  ShallowReferences(aDocument: CDM_Document): boolean;

  DeepReferences(aDocument: CDM_Document): boolean;

  CopyReference(aFromDocument: CDM_Document, aReferenceIdentifier: number): number;

  IsReadOnly(): boolean;
  IsReadOnly(aReferenceIdentifier: number): boolean;
  IsReadOnly(): boolean;
  IsReadOnly(aReferenceIdentifier: number): boolean;

  SetIsReadOnly(): void;

  UnsetIsReadOnly(): void;

  Modify(): void;

  Modifications(): number;

  UnModify(): void;

  IsUpToDate(aReferenceIdentifier: number): boolean;

  SetIsUpToDate(aReferenceIdentifier: number): void;

  SetComment(aComment: TCollection_ExtendedString): void;

  AddComment(aComment: TCollection_ExtendedString): void;

  SetComments(aComments: NCollection_Sequence_TCollection_ExtendedString): void;

  Comments(aComments: NCollection_Sequence_TCollection_ExtendedString): void;

  Comment(): string;

  StorageVersion(): number;

  SetMetaData(aMetaData: CDM_MetaData): void;

  UnsetIsStored(): void;

  MetaData(): CDM_MetaData;

  Folder(): TCollection_ExtendedString;

  SetRequestedFolder(aFolder: TCollection_ExtendedString): void;

  RequestedFolder(): TCollection_ExtendedString;

  HasRequestedFolder(): boolean;

  SetRequestedName(aName: TCollection_ExtendedString): void;

  RequestedName(): TCollection_ExtendedString;

  SetRequestedPreviousVersion(aPreviousVersion: TCollection_ExtendedString): void;

  UnsetRequestedPreviousVersion(): void;

  HasRequestedPreviousVersion(): boolean;

  RequestedPreviousVersion(): TCollection_ExtendedString;

  SetRequestedComment(aComment: TCollection_ExtendedString): void;

  RequestedComment(): TCollection_ExtendedString;

  LoadResources(): void;

  FindFileExtension(): boolean;

  FileExtension(): TCollection_ExtendedString;

  FindDescription(): boolean;

  Description(): TCollection_ExtendedString;

  IsModified(): boolean;

  IsOpened(): boolean;
  IsOpened(aReferenceIdentifier: number): boolean;
  IsOpened(): boolean;
  IsOpened(aReferenceIdentifier: number): boolean;

  Open(anApplication: CDM_Application): void;

  CanClose(): CDM_CanCloseStatus;

  Close(): void;

  Application(): CDM_Application;

  CanCloseReference(aDocument: CDM_Document, aReferenceIdentifier: number): boolean;

  CloseReference(aDocument: CDM_Document, aReferenceIdentifier: number): void;

  ReferenceCounter(): number;

  Reference(aReferenceIdentifier: number): CDM_Reference;

  SetModifications(Modifications: number): void;

  SetReferenceCounter(aReferenceCounter: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDM_MetaData: declare class CDM_MetaData extends Standard_Transient

  static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;
  static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aVersion: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;
  static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;
  static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aVersion: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;

  IsRetrieved(): boolean;

  Document(): CDM_Document;

  Folder(): TCollection_ExtendedString;

  Name(): TCollection_ExtendedString;

  Version(): TCollection_ExtendedString;

  HasVersion(): boolean;

  FileName(): TCollection_ExtendedString;

  Path(): TCollection_ExtendedString;

  UnsetDocument(): void;

  IsReadOnly(): boolean;

  SetIsReadOnly(): void;

  UnsetIsReadOnly(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDM_Reference: declare class CDM_Reference extends Standard_Transient

  FromDocument(): CDM_Document;

  ToDocument(): CDM_Document;

  ReferenceIdentifier(): number;

  DocumentVersion(): number;

  IsReadOnly(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

CDM_ReferenceIterator: declare class CDM_ReferenceIterator

  constructor

  More(): boolean;

  Next(): void;

  Document(): CDM_Document;

  ReferenceIdentifier(): number;

  DocumentVersion(): number;

  delete(): void;

  [Symbol.dispose](): void;
