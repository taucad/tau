# libcascade — TDocStd

17 top-level symbols. Signatures are verbatim typescript.

TDocStd: declare class TDocStd

  constructor

  static IDList(anIDList: NCollection_List_Standard_GUID): void;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_Application: declare class TDocStd_Application extends CDF_Application

  constructor

  IsDriverLoaded(): boolean;

  Resources(): Resource_Manager;

  ResourcesName(): string;

  DefineFormat(theFormat: TCollection_AsciiString, theDescription: TCollection_AsciiString, theExtension: TCollection_AsciiString, theReader: PCDM_RetrievalDriver, theWriter: PCDM_StorageDriver): void;

  ReadingFormats(theFormats: NCollection_Sequence_TCollection_AsciiString): void;

  WritingFormats(theFormats: NCollection_Sequence_TCollection_AsciiString): void;

  NbDocuments(): number;

  GetDocument(index: number): TDocStd_Document;

  NewDocument(theFormat: TCollection_ExtendedString): { theDoc: CDM_Document; [Symbol.dispose](): void };

  InitDocument(theDoc: CDM_Document): void;

  Close(aDoc: TDocStd_Document): void;
  Close(aDocument: CDM_Document): void;
  Close(aDoc: TDocStd_Document): void;
  Close(aDocument: CDM_Document): void;

  IsInSession(path: TCollection_ExtendedString): number;

  Open(thePath: TCollection_ExtendedString, theRange: Message_ProgressRange): { returnValue: PCDM_ReaderStatus; theDoc: TDocStd_Document; [Symbol.dispose](): void };
  Open(aDocument: CDM_Document): void;
  Open(thePath: TCollection_ExtendedString, theRange: Message_ProgressRange): { returnValue: PCDM_ReaderStatus; theDoc: TDocStd_Document; [Symbol.dispose](): void };
  Open(aDocument: CDM_Document): void;

  SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
  SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
  SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
  SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;

  Save(theDoc: TDocStd_Document, theRange: Message_ProgressRange): PCDM_StoreStatus;
  Save(theDoc: TDocStd_Document, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
  Save(theDoc: TDocStd_Document, theRange: Message_ProgressRange): PCDM_StoreStatus;
  Save(theDoc: TDocStd_Document, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;

  OnOpenTransaction(theDoc: TDocStd_Document): void;

  OnCommitTransaction(theDoc: TDocStd_Document): void;

  OnAbortTransaction(theDoc: TDocStd_Document): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_ApplicationDelta: declare class TDocStd_ApplicationDelta extends Standard_Transient

  constructor

  GetDocuments(): NCollection_Sequence_handle_TDocStd_Document;

  GetName(): TCollection_ExtendedString;

  SetName(theName: TCollection_ExtendedString): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_CompoundDelta: declare class TDocStd_CompoundDelta extends TDF_Delta

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_Context: declare class TDocStd_Context

  constructor

  SetModifiedReferences(Mod: boolean): void;

  ModifiedReferences(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_Document: declare class TDocStd_Document extends CDM_Document

  constructor

  static Get(L: TDF_Label): TDocStd_Document;

  IsSaved(): boolean;

  IsChanged(): boolean;

  SetSaved(): void;

  SetSavedTime(theTime: number): void;

  GetSavedTime(): number;

  GetName(): TCollection_ExtendedString;

  GetPath(): TCollection_ExtendedString;

  SetData(data: TDF_Data): void;

  GetData(): TDF_Data;

  Main(): TDF_Label;

  IsEmpty(): boolean;

  IsValid(): boolean;

  SetModified(L: TDF_Label): void;

  PurgeModified(): void;

  GetModified(): NCollection_Map_TDF_Label;

  NewCommand(): void;

  HasOpenCommand(): boolean;

  OpenCommand(): void;

  CommitCommand(): boolean;

  AbortCommand(): void;

  GetUndoLimit(): number;

  SetUndoLimit(L: number): void;

  ClearUndos(): void;

  ClearRedos(): void;

  GetAvailableUndos(): number;

  Undo(): boolean;

  GetAvailableRedos(): number;

  Redo(): boolean;

  GetUndos(): NCollection_List_handle_TDF_Delta;

  GetRedos(): NCollection_List_handle_TDF_Delta;

  RemoveFirstUndo(): void;

  InitDeltaCompaction(): boolean;

  PerformDeltaCompaction(): boolean;

  UpdateReferences(aDocEntry: TCollection_AsciiString): void;

  Recompute(): void;

  StorageFormat(): TCollection_ExtendedString;

  SetEmptyLabelsSavingMode(isAllowed: boolean): void;

  EmptyLabelsSavingMode(): boolean;

  ChangeStorageFormat(newStorageFormat: TCollection_ExtendedString): void;

  SetNestedTransactionMode(isAllowed?: boolean): void;

  IsNestedTransactionMode(): boolean;

  SetModificationMode(theTransactionOnly: boolean): void;

  ModificationMode(): boolean;

  BeforeClose(): void;

  StorageFormatVersion(): TDocStd_FormatVersion;

  ChangeStorageFormatVersion(theVersion: TDocStd_FormatVersion): void;

  static CurrentStorageFormatVersion(): TDocStd_FormatVersion;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_FormatVersion: typeof TDocStd_FormatVersion[keyof typeof TDocStd_FormatVersion]

TDocStd_Modified: declare class TDocStd_Modified extends TDF_Attribute

  constructor

  static IsEmpty(access: TDF_Label): boolean;
  IsEmpty(): boolean;

  static Add(alabel: TDF_Label): boolean;

  static Remove(alabel: TDF_Label): boolean;

  static Contains(alabel: TDF_Label): boolean;

  static Get(access: TDF_Label): NCollection_Map_TDF_Label;
  Get(): NCollection_Map_TDF_Label;

  static Clear(access: TDF_Label): void;
  Clear(): void;

  static GetID(): Standard_GUID;

  AddLabel(L: TDF_Label): boolean;

  RemoveLabel(L: TDF_Label): boolean;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_MultiTransactionManager: declare class TDocStd_MultiTransactionManager extends Standard_Transient

  constructor

  SetUndoLimit(theLimit: number): void;

  GetUndoLimit(): number;

  Undo(): void;

  Redo(): void;

  GetAvailableUndos(): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

  GetAvailableRedos(): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

  OpenCommand(): void;

  AbortCommand(): void;

  CommitCommand(): boolean;
  CommitCommand(theName: TCollection_ExtendedString): boolean;
  CommitCommand(): boolean;
  CommitCommand(theName: TCollection_ExtendedString): boolean;

  HasOpenCommand(): boolean;

  RemoveLastUndo(): void;

  AddDocument(theDoc: TDocStd_Document): void;

  RemoveDocument(theDoc: TDocStd_Document): void;

  Documents(): NCollection_Sequence_handle_TDocStd_Document;

  SetNestedTransactionMode(isAllowed?: boolean): void;

  IsNestedTransactionMode(): boolean;

  SetModificationMode(theTransactionOnly: boolean): void;

  ModificationMode(): boolean;

  ClearUndos(): void;

  ClearRedos(): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_Owner: declare class TDocStd_Owner extends TDF_Attribute

  constructor

  static GetID(): Standard_GUID;

  static SetDocument(indata: TDF_Data, doc: TDocStd_Document): void;
  SetDocument(document: TDocStd_Document): void;

  static GetDocument(ofdata: TDF_Data): TDocStd_Document;
  GetDocument(): TDocStd_Document;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_PathParser: declare class TDocStd_PathParser

  constructor

  Parse(): void;

  Trek(): TCollection_ExtendedString;

  Name(): TCollection_ExtendedString;

  Extension(): TCollection_ExtendedString;

  Path(): TCollection_ExtendedString;

  Length(): number;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_XLink: declare class TDocStd_XLink extends TDF_Attribute

  constructor

  static Set(atLabel: TDF_Label): TDocStd_XLink;

  Update(): TDF_Reference;

  ID(): Standard_GUID;

  static GetID(): Standard_GUID;

  DocumentEntry(aDocEntry: TCollection_AsciiString): void;
  DocumentEntry(): TCollection_AsciiString;
  DocumentEntry(aDocEntry: TCollection_AsciiString): void;
  DocumentEntry(): TCollection_AsciiString;

  LabelEntry(): TCollection_AsciiString;
  LabelEntry(aLabel: TDF_Label): void;
  LabelEntry(aLabEntry: TCollection_AsciiString): void;
  LabelEntry(): TCollection_AsciiString;
  LabelEntry(aLabel: TDF_Label): void;
  LabelEntry(aLabEntry: TCollection_AsciiString): void;
  LabelEntry(): TCollection_AsciiString;
  LabelEntry(aLabel: TDF_Label): void;
  LabelEntry(aLabEntry: TCollection_AsciiString): void;

  AfterAddition(): void;

  BeforeRemoval(): void;

  BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  BackupCopy(): TDF_Attribute;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_XLinkIterator: declare class TDocStd_XLinkIterator

  constructor

  Initialize(D: TDocStd_Document): void;

  More(): boolean;

  Next(): void;

  Value(): TDocStd_XLink;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_XLinkRoot: declare class TDocStd_XLinkRoot extends TDF_Attribute

  static GetID(): Standard_GUID;

  static Set(aDF: TDF_Data): TDocStd_XLinkRoot;

  static Insert(anXLinkPtr: TDocStd_XLink): void;

  static Remove(anXLinkPtr: TDocStd_XLink): void;

  ID(): Standard_GUID;

  BackupCopy(): TDF_Attribute;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_XLinkTool: declare class TDocStd_XLinkTool

  constructor

  CopyWithLink(intarget: TDF_Label, fromsource: TDF_Label): void;

  UpdateLink(L: TDF_Label): void;

  Copy(intarget: TDF_Label, fromsource: TDF_Label): void;

  IsDone(): boolean;

  DataSet(): TDF_DataSet;

  RelocationTable(): TDF_RelocationTable;

  delete(): void;

  [Symbol.dispose](): void;

TDocStd_SequenceOfApplicationDelta: NCollection_Sequence_handle_TDocStd_ApplicationDelta

TDocStd_SequenceOfDocument: NCollection_Sequence_handle_TDocStd_Document
