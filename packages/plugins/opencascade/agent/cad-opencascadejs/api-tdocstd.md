# libcascade — TDocStd

17 top-level symbols. Signatures are verbatim typescript.

TDocStd: declare class TDocStd

  // TDocStd.constructor (constructor)
  constructor();

  // TDocStd.IDList (method)
  static IDList(anIDList: NCollection_List_Standard_GUID): void;

  // TDocStd.delete (method)
  delete(): void;

  // TDocStd.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_Application: declare class TDocStd_Application extends CDF_Application

  // TDocStd_Application.constructor (constructor)
  constructor();

  // TDocStd_Application.IsDriverLoaded (method)
  IsDriverLoaded(): boolean;

  // TDocStd_Application.Resources (method)
  Resources(): Resource_Manager;

  // TDocStd_Application.ResourcesName (method)
  ResourcesName(): string;

  // TDocStd_Application.DefineFormat (method)
  DefineFormat(theFormat: TCollection_AsciiString, theDescription: TCollection_AsciiString, theExtension: TCollection_AsciiString, theReader: PCDM_RetrievalDriver, theWriter: PCDM_StorageDriver): void;

  // TDocStd_Application.ReadingFormats (method)
  ReadingFormats(theFormats: NCollection_Sequence_TCollection_AsciiString): void;

  // TDocStd_Application.WritingFormats (method)
  WritingFormats(theFormats: NCollection_Sequence_TCollection_AsciiString): void;

  // TDocStd_Application.NbDocuments (method)
  NbDocuments(): number;

  // TDocStd_Application.GetDocument (method)
  GetDocument(index: number): TDocStd_Document;

  // TDocStd_Application.NewDocument (method)
  NewDocument(theFormat: TCollection_ExtendedString): { theDoc: CDM_Document; [Symbol.dispose](): void };

  // TDocStd_Application.InitDocument (method)
  InitDocument(theDoc: CDM_Document): void;

  // TDocStd_Application.Close (method)
  Close(aDoc: TDocStd_Document): void;
  Close(aDocument: CDM_Document): void;

  // TDocStd_Application.IsInSession (method)
  IsInSession(path: TCollection_ExtendedString): number;

  // TDocStd_Application.Open (method)
  Open(thePath: TCollection_ExtendedString, theRange: Message_ProgressRange): { returnValue: PCDM_ReaderStatus; theDoc: TDocStd_Document; [Symbol.dispose](): void };
  Open(aDocument: CDM_Document): void;

  // TDocStd_Application.SaveAs (method)
  SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
  SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;

  // TDocStd_Application.Save (method)
  Save(theDoc: TDocStd_Document, theRange: Message_ProgressRange): PCDM_StoreStatus;
  Save(theDoc: TDocStd_Document, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;

  // TDocStd_Application.OnOpenTransaction (method)
  OnOpenTransaction(theDoc: TDocStd_Document): void;

  // TDocStd_Application.OnCommitTransaction (method)
  OnCommitTransaction(theDoc: TDocStd_Document): void;

  // TDocStd_Application.OnAbortTransaction (method)
  OnAbortTransaction(theDoc: TDocStd_Document): void;

  // TDocStd_Application.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_Application.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_Application.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_Application.delete (method)
  delete(): void;

  // TDocStd_Application.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_ApplicationDelta: declare class TDocStd_ApplicationDelta extends Standard_Transient

  // TDocStd_ApplicationDelta.constructor (constructor)
  constructor();

  // TDocStd_ApplicationDelta.GetDocuments (method)
  GetDocuments(): NCollection_Sequence_handle_TDocStd_Document;

  // TDocStd_ApplicationDelta.GetName (method)
  GetName(): TCollection_ExtendedString;

  // TDocStd_ApplicationDelta.SetName (method)
  SetName(theName: TCollection_ExtendedString): void;

  // TDocStd_ApplicationDelta.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_ApplicationDelta.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_ApplicationDelta.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_ApplicationDelta.delete (method)
  delete(): void;

  // TDocStd_ApplicationDelta.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_CompoundDelta: declare class TDocStd_CompoundDelta extends TDF_Delta

  // TDocStd_CompoundDelta.constructor (constructor)
  constructor();

  // TDocStd_CompoundDelta.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_CompoundDelta.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_CompoundDelta.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_CompoundDelta.delete (method)
  delete(): void;

  // TDocStd_CompoundDelta.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_Context: declare class TDocStd_Context

  // TDocStd_Context.constructor (constructor)
  constructor();

  // TDocStd_Context.SetModifiedReferences (method)
  SetModifiedReferences(Mod: boolean): void;

  // TDocStd_Context.ModifiedReferences (method)
  ModifiedReferences(): boolean;

  // TDocStd_Context.delete (method)
  delete(): void;

  // TDocStd_Context.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_Document: declare class TDocStd_Document extends CDM_Document

  // TDocStd_Document.constructor (constructor)
  constructor(astorageformat: TCollection_ExtendedString);

  // TDocStd_Document.Get (method)
  static Get(L: TDF_Label): TDocStd_Document;

  // TDocStd_Document.IsSaved (method)
  IsSaved(): boolean;

  // TDocStd_Document.IsChanged (method)
  IsChanged(): boolean;

  // TDocStd_Document.SetSaved (method)
  SetSaved(): void;

  // TDocStd_Document.SetSavedTime (method)
  SetSavedTime(theTime: number): void;

  // TDocStd_Document.GetSavedTime (method)
  GetSavedTime(): number;

  // TDocStd_Document.GetName (method)
  GetName(): TCollection_ExtendedString;

  // TDocStd_Document.GetPath (method)
  GetPath(): TCollection_ExtendedString;

  // TDocStd_Document.SetData (method)
  SetData(data: TDF_Data): void;

  // TDocStd_Document.GetData (method)
  GetData(): TDF_Data;

  // TDocStd_Document.Main (method)
  Main(): TDF_Label;

  // TDocStd_Document.IsEmpty (method)
  IsEmpty(): boolean;

  // TDocStd_Document.IsValid (method)
  IsValid(): boolean;

  // TDocStd_Document.SetModified (method)
  SetModified(L: TDF_Label): void;

  // TDocStd_Document.PurgeModified (method)
  PurgeModified(): void;

  // TDocStd_Document.GetModified (method)
  GetModified(): NCollection_Map_TDF_Label;

  // TDocStd_Document.NewCommand (method)
  NewCommand(): void;

  // TDocStd_Document.HasOpenCommand (method)
  HasOpenCommand(): boolean;

  // TDocStd_Document.OpenCommand (method)
  OpenCommand(): void;

  // TDocStd_Document.CommitCommand (method)
  CommitCommand(): boolean;

  // TDocStd_Document.AbortCommand (method)
  AbortCommand(): void;

  // TDocStd_Document.GetUndoLimit (method)
  GetUndoLimit(): number;

  // TDocStd_Document.SetUndoLimit (method)
  SetUndoLimit(L: number): void;

  // TDocStd_Document.ClearUndos (method)
  ClearUndos(): void;

  // TDocStd_Document.ClearRedos (method)
  ClearRedos(): void;

  // TDocStd_Document.GetAvailableUndos (method)
  GetAvailableUndos(): number;

  // TDocStd_Document.Undo (method)
  Undo(): boolean;

  // TDocStd_Document.GetAvailableRedos (method)
  GetAvailableRedos(): number;

  // TDocStd_Document.Redo (method)
  Redo(): boolean;

  // TDocStd_Document.GetUndos (method)
  GetUndos(): NCollection_List_handle_TDF_Delta;

  // TDocStd_Document.GetRedos (method)
  GetRedos(): NCollection_List_handle_TDF_Delta;

  // TDocStd_Document.RemoveFirstUndo (method)
  RemoveFirstUndo(): void;

  // TDocStd_Document.InitDeltaCompaction (method)
  InitDeltaCompaction(): boolean;

  // TDocStd_Document.PerformDeltaCompaction (method)
  PerformDeltaCompaction(): boolean;

  // TDocStd_Document.UpdateReferences (method)
  UpdateReferences(aDocEntry: TCollection_AsciiString): void;

  // TDocStd_Document.Recompute (method)
  Recompute(): void;

  // TDocStd_Document.StorageFormat (method)
  StorageFormat(): TCollection_ExtendedString;

  // TDocStd_Document.SetEmptyLabelsSavingMode (method)
  SetEmptyLabelsSavingMode(isAllowed: boolean): void;

  // TDocStd_Document.EmptyLabelsSavingMode (method)
  EmptyLabelsSavingMode(): boolean;

  // TDocStd_Document.ChangeStorageFormat (method)
  ChangeStorageFormat(newStorageFormat: TCollection_ExtendedString): void;

  // TDocStd_Document.SetNestedTransactionMode (method)
  SetNestedTransactionMode(isAllowed?: boolean): void;

  // TDocStd_Document.IsNestedTransactionMode (method)
  IsNestedTransactionMode(): boolean;

  // TDocStd_Document.SetModificationMode (method)
  SetModificationMode(theTransactionOnly: boolean): void;

  // TDocStd_Document.ModificationMode (method)
  ModificationMode(): boolean;

  // TDocStd_Document.BeforeClose (method)
  BeforeClose(): void;

  // TDocStd_Document.StorageFormatVersion (method)
  StorageFormatVersion(): TDocStd_FormatVersion;

  // TDocStd_Document.ChangeStorageFormatVersion (method)
  ChangeStorageFormatVersion(theVersion: TDocStd_FormatVersion): void;

  // TDocStd_Document.CurrentStorageFormatVersion (method)
  static CurrentStorageFormatVersion(): TDocStd_FormatVersion;

  // TDocStd_Document.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_Document.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_Document.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_Document.delete (method)
  delete(): void;

  // TDocStd_Document.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_FormatVersion: typeof TDocStd_FormatVersion[keyof typeof TDocStd_FormatVersion]

  readonly TDocStd_FormatVersion_VERSION_2: 'TDocStd_FormatVersion_VERSION_2'

  readonly TDocStd_FormatVersion_VERSION_3: 'TDocStd_FormatVersion_VERSION_3'

  readonly TDocStd_FormatVersion_VERSION_4: 'TDocStd_FormatVersion_VERSION_4'

  readonly TDocStd_FormatVersion_VERSION_5: 'TDocStd_FormatVersion_VERSION_5'

  readonly TDocStd_FormatVersion_VERSION_6: 'TDocStd_FormatVersion_VERSION_6'

  readonly TDocStd_FormatVersion_VERSION_7: 'TDocStd_FormatVersion_VERSION_7'

  readonly TDocStd_FormatVersion_VERSION_8: 'TDocStd_FormatVersion_VERSION_8'

  readonly TDocStd_FormatVersion_VERSION_9: 'TDocStd_FormatVersion_VERSION_9'

  readonly TDocStd_FormatVersion_VERSION_10: 'TDocStd_FormatVersion_VERSION_10'

  readonly TDocStd_FormatVersion_VERSION_11: 'TDocStd_FormatVersion_VERSION_11'

  readonly TDocStd_FormatVersion_VERSION_12: 'TDocStd_FormatVersion_VERSION_12'

  readonly TDocStd_FormatVersion_CURRENT: 'TDocStd_FormatVersion_CURRENT'

TDocStd_Modified: declare class TDocStd_Modified extends TDF_Attribute

  // TDocStd_Modified.constructor (constructor)
  constructor();

  // TDocStd_Modified.IsEmpty (method)
  static IsEmpty(access: TDF_Label): boolean;
  IsEmpty(): boolean;

  // TDocStd_Modified.Add (method)
  static Add(alabel: TDF_Label): boolean;

  // TDocStd_Modified.Remove (method)
  static Remove(alabel: TDF_Label): boolean;

  // TDocStd_Modified.Contains (method)
  static Contains(alabel: TDF_Label): boolean;

  // TDocStd_Modified.Get (method)
  static Get(access: TDF_Label): NCollection_Map_TDF_Label;
  Get(): NCollection_Map_TDF_Label;

  // TDocStd_Modified.Clear (method)
  static Clear(access: TDF_Label): void;
  Clear(): void;

  // TDocStd_Modified.GetID (method)
  static GetID(): Standard_GUID;

  // TDocStd_Modified.AddLabel (method)
  AddLabel(L: TDF_Label): boolean;

  // TDocStd_Modified.RemoveLabel (method)
  RemoveLabel(L: TDF_Label): boolean;

  // TDocStd_Modified.ID (method)
  ID(): Standard_GUID;

  // TDocStd_Modified.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDocStd_Modified.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDocStd_Modified.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDocStd_Modified.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_Modified.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_Modified.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_Modified.delete (method)
  delete(): void;

  // TDocStd_Modified.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_MultiTransactionManager: declare class TDocStd_MultiTransactionManager extends Standard_Transient

  // TDocStd_MultiTransactionManager.constructor (constructor)
  constructor();

  // TDocStd_MultiTransactionManager.SetUndoLimit (method)
  SetUndoLimit(theLimit: number): void;

  // TDocStd_MultiTransactionManager.GetUndoLimit (method)
  GetUndoLimit(): number;

  // TDocStd_MultiTransactionManager.Undo (method)
  Undo(): void;

  // TDocStd_MultiTransactionManager.Redo (method)
  Redo(): void;

  // TDocStd_MultiTransactionManager.GetAvailableUndos (method)
  GetAvailableUndos(): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

  // TDocStd_MultiTransactionManager.GetAvailableRedos (method)
  GetAvailableRedos(): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

  // TDocStd_MultiTransactionManager.OpenCommand (method)
  OpenCommand(): void;

  // TDocStd_MultiTransactionManager.AbortCommand (method)
  AbortCommand(): void;

  // TDocStd_MultiTransactionManager.CommitCommand (method)
  CommitCommand(): boolean;
  CommitCommand(theName: TCollection_ExtendedString): boolean;

  // TDocStd_MultiTransactionManager.HasOpenCommand (method)
  HasOpenCommand(): boolean;

  // TDocStd_MultiTransactionManager.RemoveLastUndo (method)
  RemoveLastUndo(): void;

  // TDocStd_MultiTransactionManager.AddDocument (method)
  AddDocument(theDoc: TDocStd_Document): void;

  // TDocStd_MultiTransactionManager.RemoveDocument (method)
  RemoveDocument(theDoc: TDocStd_Document): void;

  // TDocStd_MultiTransactionManager.Documents (method)
  Documents(): NCollection_Sequence_handle_TDocStd_Document;

  // TDocStd_MultiTransactionManager.SetNestedTransactionMode (method)
  SetNestedTransactionMode(isAllowed?: boolean): void;

  // TDocStd_MultiTransactionManager.IsNestedTransactionMode (method)
  IsNestedTransactionMode(): boolean;

  // TDocStd_MultiTransactionManager.SetModificationMode (method)
  SetModificationMode(theTransactionOnly: boolean): void;

  // TDocStd_MultiTransactionManager.ModificationMode (method)
  ModificationMode(): boolean;

  // TDocStd_MultiTransactionManager.ClearUndos (method)
  ClearUndos(): void;

  // TDocStd_MultiTransactionManager.ClearRedos (method)
  ClearRedos(): void;

  // TDocStd_MultiTransactionManager.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_MultiTransactionManager.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_MultiTransactionManager.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_MultiTransactionManager.delete (method)
  delete(): void;

  // TDocStd_MultiTransactionManager.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_Owner: declare class TDocStd_Owner extends TDF_Attribute

  // TDocStd_Owner.constructor (constructor)
  constructor();

  // TDocStd_Owner.GetID (method)
  static GetID(): Standard_GUID;

  // TDocStd_Owner.SetDocument (method)
  static SetDocument(indata: TDF_Data, doc: TDocStd_Document): void;
  SetDocument(document: TDocStd_Document): void;

  // TDocStd_Owner.GetDocument (method)
  static GetDocument(ofdata: TDF_Data): TDocStd_Document;
  GetDocument(): TDocStd_Document;

  // TDocStd_Owner.ID (method)
  ID(): Standard_GUID;

  // TDocStd_Owner.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDocStd_Owner.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDocStd_Owner.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDocStd_Owner.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_Owner.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_Owner.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_Owner.delete (method)
  delete(): void;

  // TDocStd_Owner.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_PathParser: declare class TDocStd_PathParser

  // TDocStd_PathParser.constructor (constructor)
  constructor(path: TCollection_ExtendedString);

  // TDocStd_PathParser.Parse (method)
  Parse(): void;

  // TDocStd_PathParser.Trek (method)
  Trek(): TCollection_ExtendedString;

  // TDocStd_PathParser.Name (method)
  Name(): TCollection_ExtendedString;

  // TDocStd_PathParser.Extension (method)
  Extension(): TCollection_ExtendedString;

  // TDocStd_PathParser.Path (method)
  Path(): TCollection_ExtendedString;

  // TDocStd_PathParser.Length (method)
  Length(): number;

  // TDocStd_PathParser.delete (method)
  delete(): void;

  // TDocStd_PathParser.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_XLink: declare class TDocStd_XLink extends TDF_Attribute

  // TDocStd_XLink.constructor (constructor)
  constructor();

  // TDocStd_XLink.Set (method)
  static Set(atLabel: TDF_Label): TDocStd_XLink;

  // TDocStd_XLink.Update (method)
  Update(): TDF_Reference;

  // TDocStd_XLink.ID (method)
  ID(): Standard_GUID;

  // TDocStd_XLink.GetID (method)
  static GetID(): Standard_GUID;

  // TDocStd_XLink.DocumentEntry (method)
  DocumentEntry(aDocEntry: TCollection_AsciiString): void;
  DocumentEntry(): TCollection_AsciiString;

  // TDocStd_XLink.LabelEntry (method)
  LabelEntry(): TCollection_AsciiString;
  LabelEntry(aLabel: TDF_Label): void;
  LabelEntry(aLabEntry: TCollection_AsciiString): void;

  // TDocStd_XLink.AfterAddition (method)
  AfterAddition(): void;

  // TDocStd_XLink.BeforeRemoval (method)
  BeforeRemoval(): void;

  // TDocStd_XLink.BeforeUndo (method)
  BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TDocStd_XLink.AfterUndo (method)
  AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

  // TDocStd_XLink.BackupCopy (method)
  BackupCopy(): TDF_Attribute;

  // TDocStd_XLink.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDocStd_XLink.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDocStd_XLink.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDocStd_XLink.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_XLink.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_XLink.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_XLink.delete (method)
  delete(): void;

  // TDocStd_XLink.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_XLinkIterator: declare class TDocStd_XLinkIterator

  // TDocStd_XLinkIterator.constructor (constructor)
  constructor();
  constructor(D: TDocStd_Document);

  // TDocStd_XLinkIterator.Initialize (method)
  Initialize(D: TDocStd_Document): void;

  // TDocStd_XLinkIterator.More (method)
  More(): boolean;

  // TDocStd_XLinkIterator.Next (method)
  Next(): void;

  // TDocStd_XLinkIterator.Value (method)
  Value(): TDocStd_XLink;

  // TDocStd_XLinkIterator.delete (method)
  delete(): void;

  // TDocStd_XLinkIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_XLinkRoot: declare class TDocStd_XLinkRoot extends TDF_Attribute

  // TDocStd_XLinkRoot.GetID (method)
  static GetID(): Standard_GUID;

  // TDocStd_XLinkRoot.Set (method)
  static Set(aDF: TDF_Data): TDocStd_XLinkRoot;

  // TDocStd_XLinkRoot.Insert (method)
  static Insert(anXLinkPtr: TDocStd_XLink): void;

  // TDocStd_XLinkRoot.Remove (method)
  static Remove(anXLinkPtr: TDocStd_XLink): void;

  // TDocStd_XLinkRoot.ID (method)
  ID(): Standard_GUID;

  // TDocStd_XLinkRoot.BackupCopy (method)
  BackupCopy(): TDF_Attribute;

  // TDocStd_XLinkRoot.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // TDocStd_XLinkRoot.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // TDocStd_XLinkRoot.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // TDocStd_XLinkRoot.get_type_name (method)
  static get_type_name(): string;

  // TDocStd_XLinkRoot.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // TDocStd_XLinkRoot.DynamicType (method)
  DynamicType(): Standard_Type;

  // TDocStd_XLinkRoot.delete (method)
  delete(): void;

  // TDocStd_XLinkRoot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_XLinkTool: declare class TDocStd_XLinkTool

  // TDocStd_XLinkTool.constructor (constructor)
  constructor();

  // TDocStd_XLinkTool.CopyWithLink (method)
  CopyWithLink(intarget: TDF_Label, fromsource: TDF_Label): void;

  // TDocStd_XLinkTool.UpdateLink (method)
  UpdateLink(L: TDF_Label): void;

  // TDocStd_XLinkTool.Copy (method)
  Copy(intarget: TDF_Label, fromsource: TDF_Label): void;

  // TDocStd_XLinkTool.IsDone (method)
  IsDone(): boolean;

  // TDocStd_XLinkTool.DataSet (method)
  DataSet(): TDF_DataSet;

  // TDocStd_XLinkTool.RelocationTable (method)
  RelocationTable(): TDF_RelocationTable;

  // TDocStd_XLinkTool.delete (method)
  delete(): void;

  // TDocStd_XLinkTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TDocStd_SequenceOfApplicationDelta: NCollection_Sequence_handle_TDocStd_ApplicationDelta

TDocStd_SequenceOfDocument: NCollection_Sequence_handle_TDocStd_Document
