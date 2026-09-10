# libcascade — TDocStd

14 top-level symbols. Signatures are verbatim typescript.

// This package define CAF main classes
TDocStd: declare class TDocStd

constructor

// **specific GUID of this package**
static IDList(anIDList: NCollection_List_Standard_GUID): void;
// anIDList: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The abstract root class for all application classes
TDocStd_Application: declare class TDocStd_Application extends CDF_Application

constructor

// Check if meta data driver was successfully loaded by the application constructor
IsDriverLoaded(): boolean;

// Returns resource manager defining supported persistent formats
Resources(): Resource_Manager;

// Returns the name of the file containing the resources of this application, for support of legacy method of loading formats data from resource files
ResourcesName(): string;

// Sets up resources and registers read and storage drivers for the specified format
DefineFormat(theFormat: TCollection_AsciiString, theDescription: TCollection_AsciiString, theExtension: TCollection_AsciiString, theReader: PCDM_RetrievalDriver, theWriter: PCDM_StorageDriver): void;
// theFormat: unique name for the format, used to identify it
// theDescription: textual description of the format
// theExtension: extension of the files in that format
// theReader: instance of the read driver for the format
// theWriter: instance of the write driver for the format

// Returns the sequence of reading formats supported by the application
ReadingFormats(theFormats: NCollection_Sequence_TCollection_AsciiString): void;
// theFormats: sequence of reading formats

// Returns the sequence of writing formats supported by the application
WritingFormats(theFormats: NCollection_Sequence_TCollection_AsciiString): void;
// theFormats: sequence of writing formats

// returns the number of documents handled by the current applicative session
NbDocuments(): number;

// Returns the document at the given 1-based index
GetDocument(index: number): TDocStd_Document;
// index: 1-based document index

// Constructs the empty new document aDoc
NewDocument(theFormat: TCollection_ExtendedString): { theDoc: CDM_Document; [Symbol.dispose](): void };

// Initialize the document aDoc for the applicative session
InitDocument(theDoc: CDM_Document): void;

// Close the given document
Close(aDoc: TDocStd_Document): void;
Close(aDocument: CDM_Document): void;
Close(aDoc: TDocStd_Document): void;
Close(aDocument: CDM_Document): void;

// Returns an index for the document found in the path path in this applicative session
IsInSession(path: TCollection_ExtendedString): number;

// Retrieves the document from specified file
Open(thePath: TCollection_ExtendedString, theRange: Message_ProgressRange): { returnValue: PCDM_ReaderStatus; theDoc: TDocStd_Document; [Symbol.dispose](): void };
Open(aDocument: CDM_Document): void;
Open(thePath: TCollection_ExtendedString, theRange: Message_ProgressRange): { returnValue: PCDM_ReaderStatus; theDoc: TDocStd_Document; [Symbol.dispose](): void };
Open(aDocument: CDM_Document): void;
// thePath: file path to open
// theRange: optional progress indicator

// Save the active document in the file <name> in the path <path>
SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
SaveAs(theDoc: TDocStd_Document, path: TCollection_ExtendedString, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;

// Save aDoc active document
Save(theDoc: TDocStd_Document, theRange: Message_ProgressRange): PCDM_StoreStatus;
Save(theDoc: TDocStd_Document, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;
Save(theDoc: TDocStd_Document, theRange: Message_ProgressRange): PCDM_StoreStatus;
Save(theDoc: TDocStd_Document, theStatusMessage: TCollection_ExtendedString, theRange: Message_ProgressRange): PCDM_StoreStatus;

// Notification that is fired at each OpenTransaction event
OnOpenTransaction(theDoc: TDocStd_Document): void;

// Notification that is fired at each CommitTransaction event
OnCommitTransaction(theDoc: TDocStd_Document): void;

// Notification that is fired at each AbortTransaction event
OnAbortTransaction(theDoc: TDocStd_Document): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A delta set is available at <aSourceTime>
TDocStd_CompoundDelta: declare class TDocStd_CompoundDelta extends TDF_Delta

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TDocStd_Context: declare class TDocStd_Context

constructor

SetModifiedReferences(Mod: boolean): void;

ModifiedReferences(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The contents of a {@link TDocStd_Application`TDocStd_Application`}, a document is a container for a data framework composed of labels and attributes
TDocStd_Document: declare class TDocStd_Document extends CDM_Document

constructor

// Will Abort any execution, clear fields returns the document which contains <L>
static Get(L: TDF_Label): TDocStd_Document;

// the document is saved in a file
IsSaved(): boolean;

// returns True if document differs from the state of last saving
IsChanged(): boolean;

// This method have to be called to show document that it has been saved
SetSaved(): void;

// Say to document what it is not saved
SetSavedTime(theTime: number): void;

// Returns value of <mySavedTime> to be used later in `SetSavedTime()`
GetSavedTime(): number;

// raise if <me> is not saved
GetName(): TCollection_ExtendedString;

// returns the OS path of the file, in which one <me> is saved
GetPath(): TCollection_ExtendedString;

SetData(data: TDF_Data): void;

GetData(): TDF_Data;

// Returns the main label in this data framework
Main(): TDF_Label;

// Returns True if the main label has no attributes
IsEmpty(): boolean;

// Returns False if the document has been modified but not recomputed
IsValid(): boolean;

// Notify the label as modified, the Document becomes UnValid
SetModified(L: TDF_Label): void;

// Remove all modifications
PurgeModified(): void;

// Returns the labels which have been modified in this document
GetModified(): NCollection_Map_TDF_Label;

// Launches a new command
NewCommand(): void;

// returns True if a Command transaction is open in the current
HasOpenCommand(): boolean;

// Opens a new command transaction in this document
OpenCommand(): void;

// Commits documents transactions and fills the transaction manager with documents that have been changed during the transaction
CommitCommand(): boolean;

// Abort the Command transaction
AbortCommand(): void;

// The current limit on the number of undos
GetUndoLimit(): number;

// Set the limit on the number of Undo Delta stored 0 will disable Undo on the document A negative value means no limit
SetUndoLimit(L: number): void;

// Remove all stored Undos and Redos
ClearUndos(): void;

// Remove all stored Redos
ClearRedos(): void;

// Returns the number of undos stored in this document
GetAvailableUndos(): number;

// Will UNDO one step, returns False if no undo was done (Undos == 0)
Undo(): boolean;

// Returns the number of redos stored in this document
GetAvailableRedos(): number;

// Will REDO one step, returns False if no redo was done (Redos == 0)
Redo(): boolean;

GetUndos(): NCollection_List_handle_TDF_Delta;

GetRedos(): NCollection_List_handle_TDF_Delta;

// Removes the first undo in the list of document undos
RemoveFirstUndo(): void;

// Initializes the procedure of delta compaction Returns false if there is no delta to compact Marks the last delta as a "from" delta
InitDeltaCompaction(): boolean;

// Performs the procedure of delta compaction Makes all deltas starting from "from" delta till the last one to be one delta
PerformDeltaCompaction(): boolean;

// Set modifications on labels impacted by external references to the entry
UpdateReferences(aDocEntry: TCollection_AsciiString): void;

// Recompute if the document was not valid and propagate the recorded modification
Recompute(): void;

// The {@link Storage`Storage`} Format is the key which is used to determine in the application resources the storage driver plugin, the file extension and other data used to store the document
StorageFormat(): TCollection_ExtendedString;

// Sets saving mode for empty labels
SetEmptyLabelsSavingMode(isAllowed: boolean): void;

// Returns saving mode for empty labels
EmptyLabelsSavingMode(): boolean;

// methods for the nested transaction mode
ChangeStorageFormat(newStorageFormat: TCollection_ExtendedString): void;

// Sets nested transaction mode if isAllowed == true
SetNestedTransactionMode(isAllowed?: boolean): void;

// Returns true if mode is set
IsNestedTransactionMode(): boolean;

// if theTransactionOnly is True changes is denied outside transactions
SetModificationMode(theTransactionOnly: boolean): void;

// returns True if changes allowed only inside transactions
ModificationMode(): boolean;

// Prepares document for closing
BeforeClose(): void;

// Returns version of the format to be used to store the document
StorageFormatVersion(): TDocStd_FormatVersion;

// Sets version of the format to be used to store the document
ChangeStorageFormatVersion(theVersion: TDocStd_FormatVersion): void;

// Returns current storage format version of the document
static CurrentStorageFormatVersion(): TDocStd_FormatVersion;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link Storage`Storage`} format versions of OCAF documents in XML and binary file formats
TDocStd_FormatVersion: typeof TDocStd_FormatVersion[keyof typeof TDocStd_FormatVersion]

// Transient attribute which register modified labels
TDocStd_Modified: declare class TDocStd_Modified extends TDF_Attribute

constructor

// **API class methods**
static IsEmpty(access: TDF_Label): boolean;
IsEmpty(): boolean;

static Add(alabel: TDF_Label): boolean;

static Remove(alabel: TDF_Label): boolean;

static Contains(alabel: TDF_Label): boolean;

// if <IsEmpty> raise an exception
static Get(access: TDF_Label): NCollection_Map_TDF_Label;
Get(): NCollection_Map_TDF_Label;

// remove all modified labels
static Clear(access: TDF_Label): void;
Clear(): void;

// **Modified methods**
static GetID(): Standard_GUID;

// add <L> as modified
AddLabel(L: TDF_Label): boolean;

// remove <L> as modified
RemoveLabel(L: TDF_Label): boolean;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class for synchronization of transactions within multiple documents
TDocStd_MultiTransactionManager: declare class TDocStd_MultiTransactionManager extends Standard_Transient

constructor

// Sets undo limit for the manager and all documents
SetUndoLimit(theLimit: number): void;

// Returns undo limit for the manager
GetUndoLimit(): number;

// Undoes the current transaction of the manager
Undo(): void;

// Redoes the current transaction of the application
Redo(): void;

// Returns available manager undos
GetAvailableUndos(): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

// Returns available manager redos
GetAvailableRedos(): NCollection_Sequence_handle_TDocStd_ApplicationDelta;

// Opens transaction in each document and sets the flag that transaction is opened
OpenCommand(): void;

// Unsets the flag of started manager transaction and aborts transaction in each document
AbortCommand(): void;

// Commits transaction in all documents and fills the transaction manager with the documents that have been changed during the transaction
CommitCommand(): boolean;
CommitCommand(theName: TCollection_ExtendedString): boolean;
CommitCommand(): boolean;
CommitCommand(theName: TCollection_ExtendedString): boolean;

// Returns true if a transaction is opened
HasOpenCommand(): boolean;

// Removes undo information from the list of undos of the manager and all documents which have been modified during the transaction
RemoveLastUndo(): void;

// Adds the document to the transaction manager and checks if it has been already added
AddDocument(theDoc: TDocStd_Document): void;

// Removes the document from the transaction manager
RemoveDocument(theDoc: TDocStd_Document): void;

// Returns the added documents to the transaction manager
Documents(): NCollection_Sequence_handle_TDocStd_Document;

// Sets nested transaction mode if isAllowed == true NOTE
SetNestedTransactionMode(isAllowed?: boolean): void;

// Returns true if NestedTransaction mode is set
IsNestedTransactionMode(): boolean;

// If theTransactionOnly is True, denies all changes outside transactions
SetModificationMode(theTransactionOnly: boolean): void;

// Returns True if changes are allowed only inside transactions
ModificationMode(): boolean;

// Clears undos in the manager and in documents
ClearUndos(): void;

// Clears redos in the manager and in documents
ClearRedos(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This attribute located at the root label of the framework contains a back reference to the owner {@link TDocStd_Document`TDocStd_Document`}, providing access to the document from any label
TDocStd_Owner: declare class TDocStd_Owner extends TDF_Attribute

constructor

// **class methods**
static GetID(): Standard_GUID;

static SetDocument(indata: TDF_Data, doc: TDocStd_Document): void;
SetDocument(document: TDocStd_Document): void;

// **Owner methods**
static GetDocument(ofdata: TDF_Data): TDocStd_Document;
GetDocument(): TDocStd_Document;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// parse an OS path
TDocStd_PathParser: declare class TDocStd_PathParser

constructor

Parse(): void;

Trek(): TCollection_ExtendedString;

Name(): TCollection_ExtendedString;

Extension(): TCollection_ExtendedString;

Path(): TCollection_ExtendedString;

Length(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An attribute to store the path and the entry of external links
TDocStd_XLink: declare class TDocStd_XLink extends TDF_Attribute

constructor

// Sets an empty external reference, at the label aLabel
static Set(atLabel: TDF_Label): TDocStd_XLink;

// Updates the data referenced in this external link attribute
Update(): TDF_Reference;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Returns the GUID for external links
static GetID(): Standard_GUID;

// Sets the name aDocEntry for the external document in this external link attribute
DocumentEntry(aDocEntry: TCollection_AsciiString): void;
DocumentEntry(): TCollection_AsciiString;
DocumentEntry(aDocEntry: TCollection_AsciiString): void;
DocumentEntry(): TCollection_AsciiString;

// Returns the contents of the field <myLabelEntry>
LabelEntry(): TCollection_AsciiString;
LabelEntry(aLabel: TDF_Label): void;
LabelEntry(aLabEntry: TCollection_AsciiString): void;
LabelEntry(): TCollection_AsciiString;
LabelEntry(aLabel: TDF_Label): void;
LabelEntry(aLabEntry: TCollection_AsciiString): void;
LabelEntry(): TCollection_AsciiString;
LabelEntry(aLabel: TDF_Label): void;
LabelEntry(aLabEntry: TCollection_AsciiString): void;

// Updates the XLinkRoot attribute by adding <me> to its list
AfterAddition(): void;

// Updates the XLinkRoot attribute by removing <me> from its list
BeforeRemoval(): void;

// Something to do before applying <anAttDelta>
BeforeUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

// Something to do after applying <anAttDelta>
AfterUndo(anAttDelta: TDF_AttributeDelta, forceIt?: boolean): boolean;

// Returns a null handle
BackupCopy(): TDF_Attribute;

// Does nothing
Restore(anAttribute: TDF_Attribute): void;

// Returns a null handle
NewEmpty(): TDF_Attribute;

// Does nothing
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterates on Reference attributes
TDocStd_XLinkIterator: declare class TDocStd_XLinkIterator

constructor

// Restarts an iteration with <D>
Initialize(D: TDocStd_Document): void;

// Returns True if there is a current Item in the iteration
More(): boolean;

// Move to the next item
Next(): void;

// Returns the current item
Value(): TDocStd_XLink;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This attribute is the root of all external references contained in a Data from {@link TDF `TDF`}
TDocStd_XLinkRoot: declare class TDocStd_XLinkRoot extends TDF_Attribute

// Returns the ID
static GetID(): Standard_GUID;

// Sets an empty XLinkRoot to Root or gets the existing one
static Set(aDF: TDF_Data): TDocStd_XLinkRoot;

// Inserts <anXLinkPtr> at the beginning of the XLink chain
static Insert(anXLinkPtr: TDocStd_XLink): void;

// Removes <anXLinkPtr> from the XLink chain, if it exists
static Remove(anXLinkPtr: TDocStd_XLink): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Returns a null handle
BackupCopy(): TDF_Attribute;

// Does nothing
Restore(anAttribute: TDF_Attribute): void;

// Returns a null handle
NewEmpty(): TDF_Attribute;

// Does nothing
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
