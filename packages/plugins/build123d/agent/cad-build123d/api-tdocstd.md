# build123d — TDocStd

1 top-level symbols. Signatures are verbatim python.

// Category: TDocStd
// The contents of a TDocStd_Application, a document is a container for a data framework composed of labels and attributes
TDocStd_Document

  // __init__(self
  // OCP.OCP.TDocStd.TDocStd_Document.__init__ (constructor)
  __init__(self: OCP.OCP.TDocStd.TDocStd_Document, astorageformat: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // IsSaved(self
  // Remarks: the document is saved in a file.
  // OCP.OCP.TDocStd.TDocStd_Document.IsSaved (method)
  IsSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // IsChanged(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsChanged(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool returns True if document differs from the state of last saving. this method have to be called only working in the transaction mode 2. IsChanged(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool returns True if document differs from the state of last saving. this method have to be called only working in the transaction mode
  // OCP.OCP.TDocStd.TDocStd_Document.IsChanged (method)
  IsChanged(*args, **kwargs)
  IsChanged(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
  IsChanged(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // SetSaved(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> None This method have to be called to show document that it has been saved 2. SetSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> None This method have to be called to show document that it has been saved
  // OCP.OCP.TDocStd.TDocStd_Document.SetSaved (method)
  SetSaved(*args, **kwargs)
  SetSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> None
  SetSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // SetSavedTime(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document, theTime: int) -> None Say to document what it is not saved. Use value, returned earlier by GetSavedTime(). 2. SetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document, theTime: int) -> None Say to document what it is not saved. Use value, returned earlier by GetSavedTime().
  // OCP.OCP.TDocStd.TDocStd_Document.SetSavedTime (method)
  SetSavedTime(*args, **kwargs)
  SetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document, theTime: int) -> None
  SetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document, theTime: int) -> None

  // GetSavedTime(*args, **kwargs)
  // Remarks: Overloaded function. 1. GetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document) -> int Returns value of <mySavedTime> to be used later in SetSavedTime() 2. GetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document) -> int Returns value of <mySavedTime> to be used later in SetSavedTime()
  // OCP.OCP.TDocStd.TDocStd_Document.GetSavedTime (method)
  GetSavedTime(*args, **kwargs)
  GetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document) -> int
  GetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

  // GetName(self
  // Remarks: raise if <me> is not saved.
  // OCP.OCP.TDocStd.TDocStd_Document.GetName (method)
  GetName(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // GetPath(self
  // Remarks: returns the OS path of the file, in which one <me> is saved. Raise an exception if <me> is not saved.
  // OCP.OCP.TDocStd.TDocStd_Document.GetPath (method)
  GetPath(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // SetData(self
  // OCP.OCP.TDocStd.TDocStd_Document.SetData (method)
  SetData(self: OCP.OCP.TDocStd.TDocStd_Document, data: OCP.OCP.TDF.TDF_Data) -> None

  // GetData(self
  // OCP.OCP.TDocStd.TDocStd_Document.GetData (method)
  GetData(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_Data

  // Main(self
  // Remarks: Returns the main label in this data framework. By definition, this is the label with the entry 0:1.
  // OCP.OCP.TDocStd.TDocStd_Document.Main (method)
  Main(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_Label

  // IsEmpty(self
  // Remarks: Returns True if the main label has no attributes
  // OCP.OCP.TDocStd.TDocStd_Document.IsEmpty (method)
  IsEmpty(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // IsValid(self
  // Remarks: Returns False if the document has been modified but not recomputed.
  // OCP.OCP.TDocStd.TDocStd_Document.IsValid (method)
  IsValid(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // SetModified(self
  // Remarks: Notify the label as modified, the Document becomes UnValid. returns True if <L> has been notified as modified.
  // OCP.OCP.TDocStd.TDocStd_Document.SetModified (method)
  SetModified(self: OCP.OCP.TDocStd.TDocStd_Document, L: OCP.OCP.TDF.TDF_Label) -> None

  // PurgeModified(self
  // Remarks: Remove all modifications. After this call The document becomesagain Valid.
  // OCP.OCP.TDocStd.TDocStd_Document.PurgeModified (method)
  PurgeModified(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // NewCommand(self
  // Remarks: Launches a new command. This command may be undone.
  // OCP.OCP.TDocStd.TDocStd_Document.NewCommand (method)
  NewCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // HasOpenCommand(self
  // Remarks: returns True if a Command transaction is open in the current .
  // OCP.OCP.TDocStd.TDocStd_Document.HasOpenCommand (method)
  HasOpenCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // OpenCommand(self
  // Remarks: Opens a new command transaction in this document. You can use HasOpenCommand to see whether a command is already open. Exceptions Standard_DomainError if a command is already open in this document.
  // OCP.OCP.TDocStd.TDocStd_Document.OpenCommand (method)
  OpenCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // CommitCommand(self
  // Remarks: Commits documents transactions and fills the transaction manager with documents that have been changed during the transaction. If no command transaction is open, nothing is done. Returns True if a new delta has been added to myUndos.
  // OCP.OCP.TDocStd.TDocStd_Document.CommitCommand (method)
  CommitCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // AbortCommand(self
  // Remarks: Abort the Command transaction. Does nothing If there is no Command transaction open.
  // OCP.OCP.TDocStd.TDocStd_Document.AbortCommand (method)
  AbortCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // GetUndoLimit(self
  // Remarks: The current limit on the number of undos
  // OCP.OCP.TDocStd.TDocStd_Document.GetUndoLimit (method)
  GetUndoLimit(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

  // SetUndoLimit(self
  // Remarks: Set the limit on the number of Undo Delta stored 0 will disable Undo on the document A negative value means no limit. Note that by default Undo is disabled. Enabling it will take effect with the next call to NewCommand. Of course this limit is the same for Redo
  // OCP.OCP.TDocStd.TDocStd_Document.SetUndoLimit (method)
  SetUndoLimit(self: OCP.OCP.TDocStd.TDocStd_Document, L: int) -> None

  // ClearUndos(self
  // Remarks: Remove all stored Undos and Redos
  // OCP.OCP.TDocStd.TDocStd_Document.ClearUndos (method)
  ClearUndos(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // ClearRedos(self
  // Remarks: Remove all stored Redos
  // OCP.OCP.TDocStd.TDocStd_Document.ClearRedos (method)
  ClearRedos(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // GetAvailableUndos(self
  // Remarks: Returns the number of undos stored in this document. If this figure is greater than 0, the method Undo can be used.
  // OCP.OCP.TDocStd.TDocStd_Document.GetAvailableUndos (method)
  GetAvailableUndos(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

  // Undo(self
  // Remarks: Will UNDO one step, returns False if no undo was done (Undos == 0). Otherwise, true is returned and one step in the list of undoes is undone.
  // OCP.OCP.TDocStd.TDocStd_Document.Undo (method)
  Undo(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // GetAvailableRedos(self
  // Remarks: Returns the number of redos stored in this document. If this figure is greater than 0, the method Redo can be used.
  // OCP.OCP.TDocStd.TDocStd_Document.GetAvailableRedos (method)
  GetAvailableRedos(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

  // Redo(self
  // Remarks: Will REDO one step, returns False if no redo was done (Redos == 0). Otherwise, true is returned, and one step in the list of redoes is done again.
  // OCP.OCP.TDocStd.TDocStd_Document.Redo (method)
  Redo(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // RemoveFirstUndo(self
  // Remarks: Removes the first undo in the list of document undos. It is used in the application when the undo limit is exceed.
  // OCP.OCP.TDocStd.TDocStd_Document.RemoveFirstUndo (method)
  RemoveFirstUndo(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // InitDeltaCompaction(self
  // Remarks: Initializes the procedure of delta compaction Returns false if there is no delta to compact Marks the last delta as a "from" delta
  // OCP.OCP.TDocStd.TDocStd_Document.InitDeltaCompaction (method)
  InitDeltaCompaction(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // PerformDeltaCompaction(self
  // Remarks: Performs the procedure of delta compaction Makes all deltas starting from "from" delta till the last one to be one delta.
  // OCP.OCP.TDocStd.TDocStd_Document.PerformDeltaCompaction (method)
  PerformDeltaCompaction(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // UpdateReferences(self
  // Remarks: Set modifications on labels impacted by external references to the entry. The document becomes invalid and must be recomputed.
  // OCP.OCP.TDocStd.TDocStd_Document.UpdateReferences (method)
  UpdateReferences(self: OCP.OCP.TDocStd.TDocStd_Document, aDocEntry: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // Recompute(self
  // Remarks: Recompute if the document was not valid and propagate the recorded modification.
  // OCP.OCP.TDocStd.TDocStd_Document.Recompute (method)
  Recompute(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // Update(self
  // Remarks: This method Update will be called to signal the end of the modified references list. The document should be recomputed and UpdateFromDocuments should be called. Update should returns True in case of success, false otherwise. In case of Failure, additional information can be given in ErrorString. Update the document by propagation ================================== Update the document from internal stored modifications. If you want to undoing this operation, please call NewCommand before. to change format (advanced programming) ================
  // OCP.OCP.TDocStd.TDocStd_Document.Update (method)
  Update(self: OCP.OCP.TDocStd.TDocStd_Document, aToDocument: OCP.OCP.CDM.CDM_Document, aReferenceIdentifier: int, aModifContext: capsule) -> None

  // StorageFormat(self
  // OCP.OCP.TDocStd.TDocStd_Document.StorageFormat (method)
  StorageFormat(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

  // SetEmptyLabelsSavingMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetEmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None Sets saving mode for empty labels. If Standard_True, empty labels will be saved. 2. SetEmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None Sets saving mode for empty labels. If Standard_True, empty labels will be saved.
  // OCP.OCP.TDocStd.TDocStd_Document.SetEmptyLabelsSavingMode (method)
  SetEmptyLabelsSavingMode(*args, **kwargs)
  SetEmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None
  SetEmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None

  // EmptyLabelsSavingMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. EmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool Returns saving mode for empty labels. 2. EmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool Returns saving mode for empty labels.
  // OCP.OCP.TDocStd.TDocStd_Document.EmptyLabelsSavingMode (method)
  EmptyLabelsSavingMode(*args, **kwargs)
  EmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
  EmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // ChangeStorageFormat(self
  // Remarks: methods for the nested transaction mode
  // OCP.OCP.TDocStd.TDocStd_Document.ChangeStorageFormat (method)
  ChangeStorageFormat(self: OCP.OCP.TDocStd.TDocStd_Document, newStorageFormat: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

  // SetNestedTransactionMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool = True) -> None Sets nested transaction mode if isAllowed == Standard_True 2. SetNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None Sets nested transaction mode if isAllowed == Standard_True
  // OCP.OCP.TDocStd.TDocStd_Document.SetNestedTransactionMode (method)
  SetNestedTransactionMode(*args, **kwargs)
  SetNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool = True) -> None
  SetNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None

  // IsNestedTransactionMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool Returns Standard_True if mode is set 2. IsNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool Returns Standard_True if mode is set
  // OCP.OCP.TDocStd.TDocStd_Document.IsNestedTransactionMode (method)
  IsNestedTransactionMode(*args, **kwargs)
  IsNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
  IsNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // SetModificationMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document, theTransactionOnly: bool) -> None if theTransactionOnly is True changes is denied outside transactions 2. SetModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document, theTransactionOnly: bool) -> None if theTransactionOnly is True changes is denied outside transactions
  // OCP.OCP.TDocStd.TDocStd_Document.SetModificationMode (method)
  SetModificationMode(*args, **kwargs)
  SetModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document, theTransactionOnly: bool) -> None
  SetModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document, theTransactionOnly: bool) -> None

  // ModificationMode(*args, **kwargs)
  // Remarks: Overloaded function. 1. ModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool returns True if changes allowed only inside transactions 2. ModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool returns True if changes allowed only inside transactions
  // OCP.OCP.TDocStd.TDocStd_Document.ModificationMode (method)
  ModificationMode(*args, **kwargs)
  ModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
  ModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

  // BeforeClose(self
  // Remarks: Prepares document for closing
  // OCP.OCP.TDocStd.TDocStd_Document.BeforeClose (method)
  BeforeClose(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

  // StorageFormatVersion(self
  // Remarks: Returns version of the format to be used to store the document
  // OCP.OCP.TDocStd.TDocStd_Document.StorageFormatVersion (method)
  StorageFormatVersion(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDocStd.TDocStd_FormatVersion

  // ChangeStorageFormatVersion(self
  // Remarks: Sets version of the format to be used to store the document
  // OCP.OCP.TDocStd.TDocStd_Document.ChangeStorageFormatVersion (method)
  ChangeStorageFormatVersion(self: OCP.OCP.TDocStd.TDocStd_Document, theVersion: OCP.OCP.TDocStd.TDocStd_FormatVersion) -> None

  // DumpJson(self
  // Remarks: Dumps the content of me into the stream
  // OCP.OCP.TDocStd.TDocStd_Document.DumpJson (method)
  DumpJson(self: OCP.OCP.TDocStd.TDocStd_Document, theOStream: io.BytesIO, theDepth: int = -1) -> None

  // Get_s(L
  // Remarks: Will Abort any execution, clear fields returns the document which contains <L>. raises an exception if the document is not found.
  // OCP.OCP.TDocStd.TDocStd_Document.Get_s (method)
  Get_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDocStd.TDocStd_Document

  // CurrentStorageFormatVersion_s() -> OCP.OCP.TDocStd.TDocStd_FormatVersion
  // Remarks: Returns current storage format version of the document.
  // OCP.OCP.TDocStd.TDocStd_Document.CurrentStorageFormatVersion_s (method)
  CurrentStorageFormatVersion_s() -> OCP.OCP.TDocStd.TDocStd_FormatVersion

  // get_type_name_s() -> str
  // OCP.OCP.TDocStd.TDocStd_Document.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.TDocStd.TDocStd_Document.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // GetModified(self
  // Remarks: Returns the labels which have been modified in this document.
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
