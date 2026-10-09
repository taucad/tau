# libcascade — CDM

6 top-level symbols. Signatures are verbatim typescript.

CDM_Application: declare class CDM_Application extends Standard_Transient

  // CDM_Application.Resources (method)
  Resources(): Resource_Manager;

  // CDM_Application.BeginOfUpdate (method)
  BeginOfUpdate(aDocument: CDM_Document): void;

  // CDM_Application.EndOfUpdate (method)
  EndOfUpdate(aDocument: CDM_Document, theStatus: boolean, ErrorString: TCollection_ExtendedString): void;

  // CDM_Application.Write (method)
  Write(aString: string): void;

  // CDM_Application.Name (method)
  Name(): TCollection_ExtendedString;

  // CDM_Application.Version (method)
  Version(): TCollection_AsciiString;

  // CDM_Application.MetaDataLookUpTable (method)
  MetaDataLookUpTable(): NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData;

  // CDM_Application.get_type_name (method)
  static get_type_name(): string;

  // CDM_Application.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDM_Application.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDM_Application.delete (method)
  delete(): void;

  // CDM_Application.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDM_CanCloseStatus: typeof CDM_CanCloseStatus[keyof typeof CDM_CanCloseStatus]

  readonly CDM_CCS_OK: 'CDM_CCS_OK'

  readonly CDM_CCS_NotOpen: 'CDM_CCS_NotOpen'

  readonly CDM_CCS_UnstoredReferenced: 'CDM_CCS_UnstoredReferenced'

  readonly CDM_CCS_ModifiedReferenced: 'CDM_CCS_ModifiedReferenced'

  readonly CDM_CCS_ReferenceRejection: 'CDM_CCS_ReferenceRejection'

CDM_Document: declare class CDM_Document extends Standard_Transient

  // CDM_Document.Update (method)
  Update(ErrorString: TCollection_ExtendedString): boolean;
  Update(): void;

  // CDM_Document.StorageFormat (method)
  StorageFormat(): TCollection_ExtendedString;

  // CDM_Document.Extensions (method)
  Extensions(Extensions: NCollection_Sequence_TCollection_ExtendedString): void;

  // CDM_Document.GetAlternativeDocument (method)
  GetAlternativeDocument(aFormat: TCollection_ExtendedString): { returnValue: boolean; anAlternativeDocument: CDM_Document; [Symbol.dispose](): void };

  // CDM_Document.CreateReference (method)
  CreateReference(anOtherDocument: CDM_Document): number;
  CreateReference(aMetaData: CDM_MetaData, aReferenceIdentifier: number, anApplication: CDM_Application, aToDocumentVersion: number, UseStorageConfiguration: boolean): void;
  CreateReference(aMetaData: CDM_MetaData, anApplication: CDM_Application, aDocumentVersion: number, UseStorageConfiguration: boolean): number;

  // CDM_Document.RemoveReference (method)
  RemoveReference(aReferenceIdentifier: number): void;

  // CDM_Document.RemoveAllReferences (method)
  RemoveAllReferences(): void;

  // CDM_Document.Document (method)
  Document(aReferenceIdentifier: number): CDM_Document;

  // CDM_Document.IsInSession (method)
  IsInSession(aReferenceIdentifier: number): boolean;

  // CDM_Document.IsStored (method)
  IsStored(aReferenceIdentifier: number): boolean;
  IsStored(): boolean;

  // CDM_Document.Name (method)
  Name(aReferenceIdentifier: number): TCollection_ExtendedString;

  // CDM_Document.ToReferencesNumber (method)
  ToReferencesNumber(): number;

  // CDM_Document.FromReferencesNumber (method)
  FromReferencesNumber(): number;

  // CDM_Document.ShallowReferences (method)
  ShallowReferences(aDocument: CDM_Document): boolean;

  // CDM_Document.DeepReferences (method)
  DeepReferences(aDocument: CDM_Document): boolean;

  // CDM_Document.CopyReference (method)
  CopyReference(aFromDocument: CDM_Document, aReferenceIdentifier: number): number;

  // CDM_Document.IsReadOnly (method)
  IsReadOnly(): boolean;
  IsReadOnly(aReferenceIdentifier: number): boolean;

  // CDM_Document.SetIsReadOnly (method)
  SetIsReadOnly(): void;

  // CDM_Document.UnsetIsReadOnly (method)
  UnsetIsReadOnly(): void;

  // CDM_Document.Modify (method)
  Modify(): void;

  // CDM_Document.Modifications (method)
  Modifications(): number;

  // CDM_Document.UnModify (method)
  UnModify(): void;

  // CDM_Document.IsUpToDate (method)
  IsUpToDate(aReferenceIdentifier: number): boolean;

  // CDM_Document.SetIsUpToDate (method)
  SetIsUpToDate(aReferenceIdentifier: number): void;

  // CDM_Document.SetComment (method)
  SetComment(aComment: TCollection_ExtendedString): void;

  // CDM_Document.AddComment (method)
  AddComment(aComment: TCollection_ExtendedString): void;

  // CDM_Document.SetComments (method)
  SetComments(aComments: NCollection_Sequence_TCollection_ExtendedString): void;

  // CDM_Document.Comments (method)
  Comments(aComments: NCollection_Sequence_TCollection_ExtendedString): void;

  // CDM_Document.Comment (method)
  Comment(): string;

  // CDM_Document.StorageVersion (method)
  StorageVersion(): number;

  // CDM_Document.SetMetaData (method)
  SetMetaData(aMetaData: CDM_MetaData): void;

  // CDM_Document.UnsetIsStored (method)
  UnsetIsStored(): void;

  // CDM_Document.MetaData (method)
  MetaData(): CDM_MetaData;

  // CDM_Document.Folder (method)
  Folder(): TCollection_ExtendedString;

  // CDM_Document.SetRequestedFolder (method)
  SetRequestedFolder(aFolder: TCollection_ExtendedString): void;

  // CDM_Document.RequestedFolder (method)
  RequestedFolder(): TCollection_ExtendedString;

  // CDM_Document.HasRequestedFolder (method)
  HasRequestedFolder(): boolean;

  // CDM_Document.SetRequestedName (method)
  SetRequestedName(aName: TCollection_ExtendedString): void;

  // CDM_Document.RequestedName (method)
  RequestedName(): TCollection_ExtendedString;

  // CDM_Document.SetRequestedPreviousVersion (method)
  SetRequestedPreviousVersion(aPreviousVersion: TCollection_ExtendedString): void;

  // CDM_Document.UnsetRequestedPreviousVersion (method)
  UnsetRequestedPreviousVersion(): void;

  // CDM_Document.HasRequestedPreviousVersion (method)
  HasRequestedPreviousVersion(): boolean;

  // CDM_Document.RequestedPreviousVersion (method)
  RequestedPreviousVersion(): TCollection_ExtendedString;

  // CDM_Document.SetRequestedComment (method)
  SetRequestedComment(aComment: TCollection_ExtendedString): void;

  // CDM_Document.RequestedComment (method)
  RequestedComment(): TCollection_ExtendedString;

  // CDM_Document.LoadResources (method)
  LoadResources(): void;

  // CDM_Document.FindFileExtension (method)
  FindFileExtension(): boolean;

  // CDM_Document.FileExtension (method)
  FileExtension(): TCollection_ExtendedString;

  // CDM_Document.FindDescription (method)
  FindDescription(): boolean;

  // CDM_Document.Description (method)
  Description(): TCollection_ExtendedString;

  // CDM_Document.IsModified (method)
  IsModified(): boolean;

  // CDM_Document.IsOpened (method)
  IsOpened(): boolean;
  IsOpened(aReferenceIdentifier: number): boolean;

  // CDM_Document.Open (method)
  Open(anApplication: CDM_Application): void;

  // CDM_Document.CanClose (method)
  CanClose(): CDM_CanCloseStatus;

  // CDM_Document.Close (method)
  Close(): void;

  // CDM_Document.Application (method)
  Application(): CDM_Application;

  // CDM_Document.CanCloseReference (method)
  CanCloseReference(aDocument: CDM_Document, aReferenceIdentifier: number): boolean;

  // CDM_Document.CloseReference (method)
  CloseReference(aDocument: CDM_Document, aReferenceIdentifier: number): void;

  // CDM_Document.ReferenceCounter (method)
  ReferenceCounter(): number;

  // CDM_Document.Reference (method)
  Reference(aReferenceIdentifier: number): CDM_Reference;

  // CDM_Document.SetModifications (method)
  SetModifications(Modifications: number): void;

  // CDM_Document.SetReferenceCounter (method)
  SetReferenceCounter(aReferenceCounter: number): void;

  // CDM_Document.get_type_name (method)
  static get_type_name(): string;

  // CDM_Document.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDM_Document.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDM_Document.delete (method)
  delete(): void;

  // CDM_Document.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDM_MetaData: declare class CDM_MetaData extends Standard_Transient

  // CDM_MetaData.LookUp (method)
  static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;
  static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aVersion: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;

  // CDM_MetaData.IsRetrieved (method)
  IsRetrieved(): boolean;

  // CDM_MetaData.Document (method)
  Document(): CDM_Document;

  // CDM_MetaData.Folder (method)
  Folder(): TCollection_ExtendedString;

  // CDM_MetaData.Name (method)
  Name(): TCollection_ExtendedString;

  // CDM_MetaData.Version (method)
  Version(): TCollection_ExtendedString;

  // CDM_MetaData.HasVersion (method)
  HasVersion(): boolean;

  // CDM_MetaData.FileName (method)
  FileName(): TCollection_ExtendedString;

  // CDM_MetaData.Path (method)
  Path(): TCollection_ExtendedString;

  // CDM_MetaData.UnsetDocument (method)
  UnsetDocument(): void;

  // CDM_MetaData.IsReadOnly (method)
  IsReadOnly(): boolean;

  // CDM_MetaData.SetIsReadOnly (method)
  SetIsReadOnly(): void;

  // CDM_MetaData.UnsetIsReadOnly (method)
  UnsetIsReadOnly(): void;

  // CDM_MetaData.get_type_name (method)
  static get_type_name(): string;

  // CDM_MetaData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDM_MetaData.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDM_MetaData.delete (method)
  delete(): void;

  // CDM_MetaData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDM_Reference: declare class CDM_Reference extends Standard_Transient

  // CDM_Reference.FromDocument (method)
  FromDocument(): CDM_Document;

  // CDM_Reference.ToDocument (method)
  ToDocument(): CDM_Document;

  // CDM_Reference.ReferenceIdentifier (method)
  ReferenceIdentifier(): number;

  // CDM_Reference.DocumentVersion (method)
  DocumentVersion(): number;

  // CDM_Reference.IsReadOnly (method)
  IsReadOnly(): boolean;

  // CDM_Reference.get_type_name (method)
  static get_type_name(): string;

  // CDM_Reference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // CDM_Reference.DynamicType (method)
  DynamicType(): Standard_Type;

  // CDM_Reference.delete (method)
  delete(): void;

  // CDM_Reference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

CDM_ReferenceIterator: declare class CDM_ReferenceIterator

  // CDM_ReferenceIterator.constructor (constructor)
  constructor(aDocument: CDM_Document);

  // CDM_ReferenceIterator.More (method)
  More(): boolean;

  // CDM_ReferenceIterator.Next (method)
  Next(): void;

  // CDM_ReferenceIterator.Document (method)
  Document(): CDM_Document;

  // CDM_ReferenceIterator.ReferenceIdentifier (method)
  ReferenceIdentifier(): number;

  // CDM_ReferenceIterator.DocumentVersion (method)
  DocumentVersion(): number;

  // CDM_ReferenceIterator.delete (method)
  delete(): void;

  // CDM_ReferenceIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
