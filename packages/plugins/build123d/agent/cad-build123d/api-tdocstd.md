# build123d — TDocStd

1 top-level symbols. Signatures are verbatim python.

// The contents of a TDocStd_Application, a document is a container for a data framework composed of labels and attributes
TDocStd_Document

  // __init__(self
  // OCP.OCP.TDocStd.TDocStd_Document.__init__ (constructor)
  __init__(self: OCP.OCP.TDocStd.TDocStd_Document, astorageformat: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // IsSaved(self
  // OCP.OCP.TDocStd.TDocStd_Document.IsSaved (method)
  IsSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // IsChanged(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.IsChanged (method)
  IsChanged(*args, **kwargs)
  IsChanged(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
  IsChanged(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // SetSaved(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.SetSaved (method)
  SetSaved(*args, **kwargs)
  SetSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> None
  SetSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // SetSavedTime(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.SetSavedTime (method)
  SetSavedTime(*args, **kwargs)
  SetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document, theTime: int) -> None
  SetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document, theTime: int) -> None

  // GetSavedTime(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.GetSavedTime (method)
  GetSavedTime(*args, **kwargs)
  GetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document) -> int
  GetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

  // GetName(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetName (method)
  GetName(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // GetPath(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetPath (method)
  GetPath(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // SetData(self
  // OCP.OCP.TDocStd.TDocStd_Document.SetData (method)
  SetData(self: OCP.OCP.TDocStd.TDocStd_Document, data: OCP.OCP.TDF.TDF_Data) -> None

  // GetData(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetData (method)
  GetData(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_Data

  // Main(self
  // OCP.OCP.TDocStd.TDocStd_Document.Main (method)
  Main(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_Label

  // IsEmpty(self
  // OCP.OCP.TDocStd.TDocStd_Document.IsEmpty (method)
  IsEmpty(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // IsValid(self
  // OCP.OCP.TDocStd.TDocStd_Document.IsValid (method)
  IsValid(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // SetModified(self
  // OCP.OCP.TDocStd.TDocStd_Document.SetModified (method)
  SetModified(self: OCP.OCP.TDocStd.TDocStd_Document, L: OCP.OCP.TDF.TDF_Label) -> None

  // PurgeModified(self
  // OCP.OCP.TDocStd.TDocStd_Document.PurgeModified (method)
  PurgeModified(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // NewCommand(self
  // OCP.OCP.TDocStd.TDocStd_Document.NewCommand (method)
  NewCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // HasOpenCommand(self
  // OCP.OCP.TDocStd.TDocStd_Document.HasOpenCommand (method)
  HasOpenCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // OpenCommand(self
  // OCP.OCP.TDocStd.TDocStd_Document.OpenCommand (method)
  OpenCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // CommitCommand(self
  // OCP.OCP.TDocStd.TDocStd_Document.CommitCommand (method)
  CommitCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // AbortCommand(self
  // OCP.OCP.TDocStd.TDocStd_Document.AbortCommand (method)
  AbortCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // GetUndoLimit(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetUndoLimit (method)
  GetUndoLimit(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

  // SetUndoLimit(self
  // OCP.OCP.TDocStd.TDocStd_Document.SetUndoLimit (method)
  SetUndoLimit(self: OCP.OCP.TDocStd.TDocStd_Document, L: int) -> None

  // ClearUndos(self
  // OCP.OCP.TDocStd.TDocStd_Document.ClearUndos (method)
  ClearUndos(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // ClearRedos(self
  // OCP.OCP.TDocStd.TDocStd_Document.ClearRedos (method)
  ClearRedos(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // GetAvailableUndos(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetAvailableUndos (method)
  GetAvailableUndos(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

  // Undo(self
  // OCP.OCP.TDocStd.TDocStd_Document.Undo (method)
  Undo(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // GetAvailableRedos(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetAvailableRedos (method)
  GetAvailableRedos(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

  // Redo(self
  // OCP.OCP.TDocStd.TDocStd_Document.Redo (method)
  Redo(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // RemoveFirstUndo(self
  // OCP.OCP.TDocStd.TDocStd_Document.RemoveFirstUndo (method)
  RemoveFirstUndo(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // InitDeltaCompaction(self
  // OCP.OCP.TDocStd.TDocStd_Document.InitDeltaCompaction (method)
  InitDeltaCompaction(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // PerformDeltaCompaction(self
  // OCP.OCP.TDocStd.TDocStd_Document.PerformDeltaCompaction (method)
  PerformDeltaCompaction(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // UpdateReferences(self
  // OCP.OCP.TDocStd.TDocStd_Document.UpdateReferences (method)
  UpdateReferences(self: OCP.OCP.TDocStd.TDocStd_Document, aDocEntry: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Recompute(self
  // OCP.OCP.TDocStd.TDocStd_Document.Recompute (method)
  Recompute(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // Update(self
  // OCP.OCP.TDocStd.TDocStd_Document.Update (method)
  Update(self: OCP.OCP.TDocStd.TDocStd_Document, aToDocument: OCP.OCP.CDM.CDM_Document, aReferenceIdentifier: int, aModifContext: capsule) -> None

  // StorageFormat(self
  // OCP.OCP.TDocStd.TDocStd_Document.StorageFormat (method)
  StorageFormat(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // SetEmptyLabelsSavingMode(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.SetEmptyLabelsSavingMode (method)
  SetEmptyLabelsSavingMode(*args, **kwargs)
  SetEmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None
  SetEmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None

  // EmptyLabelsSavingMode(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.EmptyLabelsSavingMode (method)
  EmptyLabelsSavingMode(*args, **kwargs)
  EmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
  EmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // ChangeStorageFormat(self
  // OCP.OCP.TDocStd.TDocStd_Document.ChangeStorageFormat (method)
  ChangeStorageFormat(self: OCP.OCP.TDocStd.TDocStd_Document, newStorageFormat: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // SetNestedTransactionMode(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.SetNestedTransactionMode (method)
  SetNestedTransactionMode(*args, **kwargs)
  SetNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool = True) -> None
  SetNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None

  // IsNestedTransactionMode(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.IsNestedTransactionMode (method)
  IsNestedTransactionMode(*args, **kwargs)
  IsNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
  IsNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // SetModificationMode(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.SetModificationMode (method)
  SetModificationMode(*args, **kwargs)
  SetModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document, theTransactionOnly: bool) -> None
  SetModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document, theTransactionOnly: bool) -> None

  // ModificationMode(*args, **kwargs)
  // OCP.OCP.TDocStd.TDocStd_Document.ModificationMode (method)
  ModificationMode(*args, **kwargs)
  ModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
  ModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // BeforeClose(self
  // OCP.OCP.TDocStd.TDocStd_Document.BeforeClose (method)
  BeforeClose(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // StorageFormatVersion(self
  // OCP.OCP.TDocStd.TDocStd_Document.StorageFormatVersion (method)
  StorageFormatVersion(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDocStd.TDocStd_FormatVersion

  // ChangeStorageFormatVersion(self
  // OCP.OCP.TDocStd.TDocStd_Document.ChangeStorageFormatVersion (method)
  ChangeStorageFormatVersion(self: OCP.OCP.TDocStd.TDocStd_Document, theVersion: OCP.OCP.TDocStd.TDocStd_FormatVersion) -> None

  // DumpJson(self
  // OCP.OCP.TDocStd.TDocStd_Document.DumpJson (method)
  DumpJson(self: OCP.OCP.TDocStd.TDocStd_Document, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Get_s(L
  // OCP.OCP.TDocStd.TDocStd_Document.Get_s (method)
  Get_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDocStd.TDocStd_Document

  // CurrentStorageFormatVersion_s() -> OCP.OCP.TDocStd.TDocStd_FormatVersion
  // OCP.OCP.TDocStd.TDocStd_Document.CurrentStorageFormatVersion_s (method)
  CurrentStorageFormatVersion_s() -> OCP.OCP.TDocStd.TDocStd_FormatVersion

  // get_type_name_s() -> str
  // OCP.OCP.TDocStd.TDocStd_Document.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.TDocStd.TDocStd_Document.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // GetModified(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetModified (method)
  GetModified(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_LabelMap

  // GetUndos(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetUndos (method)
  GetUndos(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_DeltaList

  // GetRedos(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetRedos (method)
  GetRedos(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_DeltaList

  // DynamicType(self
  // OCP.OCP.TDocStd.TDocStd_Document.DynamicType (method)
  DynamicType(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.Standard.Standard_Type
