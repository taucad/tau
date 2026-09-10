# build123d — TDocStd

1 top-level symbols. Signatures are verbatim python.

// The contents of a TDocStd_Application, a document is a container for a data framework composed of labels and attributes
TDocStd_Document

// **init**(self
**init**(self: OCP.OCP.TDocStd.TDocStd_Document, astorageformat: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

// IsSaved(self
IsSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// IsChanged(*args, \*\*kwargs)
IsChanged(*args, \*\*kwargs)
IsChanged(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
IsChanged(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// SetSaved(*args, \*\*kwargs)
SetSaved(*args, \*\*kwargs)
SetSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> None
SetSaved(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// SetSavedTime(*args, \*\*kwargs)
SetSavedTime(*args, \*\*kwargs)
SetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document, theTime: int) -> None
SetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document, theTime: int) -> None

// GetSavedTime(*args, \*\*kwargs)
GetSavedTime(*args, \*\*kwargs)
GetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document) -> int
GetSavedTime(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

// GetName(self
GetName(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

// GetPath(self
GetPath(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

// SetData(self
SetData(self: OCP.OCP.TDocStd.TDocStd_Document, data: OCP.OCP.TDF.TDF_Data) -> None

// GetData(self
GetData(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_Data

// Main(self
Main(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_Label

// IsEmpty(self
IsEmpty(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// IsValid(self
IsValid(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// SetModified(self
SetModified(self: OCP.OCP.TDocStd.TDocStd_Document, L: OCP.OCP.TDF.TDF_Label) -> None

// PurgeModified(self
PurgeModified(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// NewCommand(self
NewCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// HasOpenCommand(self
HasOpenCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// OpenCommand(self
OpenCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// CommitCommand(self
CommitCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// AbortCommand(self
AbortCommand(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// GetUndoLimit(self
GetUndoLimit(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

// SetUndoLimit(self
SetUndoLimit(self: OCP.OCP.TDocStd.TDocStd_Document, L: int) -> None

// ClearUndos(self
ClearUndos(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// ClearRedos(self
ClearRedos(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// GetAvailableUndos(self
GetAvailableUndos(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

// Undo(self
Undo(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// GetAvailableRedos(self
GetAvailableRedos(self: OCP.OCP.TDocStd.TDocStd_Document) -> int

// Redo(self
Redo(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// RemoveFirstUndo(self
RemoveFirstUndo(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// InitDeltaCompaction(self
InitDeltaCompaction(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// PerformDeltaCompaction(self
PerformDeltaCompaction(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// UpdateReferences(self
UpdateReferences(self: OCP.OCP.TDocStd.TDocStd_Document, aDocEntry: OCP.OCP.TCollection.TCollection_AsciiString) -> None

// Recompute(self
Recompute(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// Update(self
Update(self: OCP.OCP.TDocStd.TDocStd_Document, aToDocument: OCP.OCP.CDM.CDM_Document, aReferenceIdentifier: int, aModifContext: capsule) -> None

// StorageFormat(self
StorageFormat(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TCollection.TCollection_ExtendedString

// SetEmptyLabelsSavingMode(*args, \*\*kwargs)
SetEmptyLabelsSavingMode(*args, \*\*kwargs)
SetEmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None
SetEmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None

// EmptyLabelsSavingMode(*args, \*\*kwargs)
EmptyLabelsSavingMode(*args, \*\*kwargs)
EmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
EmptyLabelsSavingMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// ChangeStorageFormat(self
ChangeStorageFormat(self: OCP.OCP.TDocStd.TDocStd_Document, newStorageFormat: OCP.OCP.TCollection.TCollection_ExtendedString) -> None

// SetNestedTransactionMode(*args, \*\*kwargs)
SetNestedTransactionMode(*args, \*\*kwargs)
SetNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool = True) -> None
SetNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document, isAllowed: bool) -> None

// IsNestedTransactionMode(*args, \*\*kwargs)
IsNestedTransactionMode(*args, \*\*kwargs)
IsNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
IsNestedTransactionMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// SetModificationMode(*args, \*\*kwargs)
SetModificationMode(*args, \*\*kwargs)
SetModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document, theTransactionOnly: bool) -> None
SetModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document, theTransactionOnly: bool) -> None

// ModificationMode(*args, \*\*kwargs)
ModificationMode(*args, \*\*kwargs)
ModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool
ModificationMode(self: OCP.OCP.TDocStd.TDocStd_Document) -> bool

// BeforeClose(self
BeforeClose(self: OCP.OCP.TDocStd.TDocStd_Document) -> None

// StorageFormatVersion(self
StorageFormatVersion(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDocStd.TDocStd_FormatVersion

// ChangeStorageFormatVersion(self
ChangeStorageFormatVersion(self: OCP.OCP.TDocStd.TDocStd_Document, theVersion: OCP.OCP.TDocStd.TDocStd_FormatVersion) -> None

// DumpJson(self
DumpJson(self: OCP.OCP.TDocStd.TDocStd_Document, theOStream: io.BytesIO, theDepth: int = -1) -> None

// Get_s(L
Get_s(L: OCP.OCP.TDF.TDF_Label) -> OCP.OCP.TDocStd.TDocStd_Document

// CurrentStorageFormatVersion_s() -> OCP.OCP.TDocStd.TDocStd_FormatVersion
CurrentStorageFormatVersion_s() -> OCP.OCP.TDocStd.TDocStd_FormatVersion

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// GetModified(self
GetModified(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_LabelMap

// GetUndos(self
GetUndos(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_DeltaList

// GetRedos(self
GetRedos(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.TDF.TDF_DeltaList

// DynamicType(self
DynamicType(self: OCP.OCP.TDocStd.TDocStd_Document) -> OCP.OCP.Standard.Standard_Type
