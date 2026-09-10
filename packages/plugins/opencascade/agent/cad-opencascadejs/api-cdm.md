# libcascade — CDM

6 top-level symbols. Signatures are verbatim typescript.

CDM_Application: declare class CDM_Application extends Standard_Transient

// The manager returned by this virtual method will be used to search for Format.Retrieval resource items
Resources(): Resource_Manager;

// this method is called before the update of a document
BeginOfUpdate(aDocument: CDM_Document): void;

// this method is called after the update of a document
EndOfUpdate(aDocument: CDM_Document, theStatus: boolean, ErrorString: TCollection_ExtendedString): void;

// writes the string in the application MessagerDriver
Write(aString: string): void;

// Returns the application name
Name(): TCollection_ExtendedString;

// Returns the application version
Version(): TCollection_AsciiString;

// Returns MetaData LookUpTable
MetaDataLookUpTable(): NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

CDM_CanCloseStatus: typeof CDM_CanCloseStatus[keyof typeof CDM_CanCloseStatus]

// An applicative document is an instance of a class inheriting {@link CDM_Document`CDM_Document`}
CDM_Document: declare class CDM_Document extends Standard_Transient

// This method Update will be called to signal the end of the modified references list
Update(ErrorString: TCollection_ExtendedString): boolean;
Update(): void;
Update(ErrorString: TCollection_ExtendedString): boolean;
Update(): void;
// ErrorString: Mutated in place

// The {@link Storage`Storage`} Format is the key which is used to determine in the application resources the storage driver plugin, the file extension and other data used to store the document
StorageFormat(): TCollection_ExtendedString;

// by default empties the extensions
Extensions(Extensions: NCollection_Sequence_TCollection_ExtendedString): void;
// Extensions: Mutated in place

// This method can be redefined to extract another document in a different format
GetAlternativeDocument(aFormat: TCollection_ExtendedString): { returnValue: boolean; anAlternativeDocument: CDM_Document; [Symbol.dispose](): void };

// Creates a reference from this document to {anOtherDocument}
CreateReference(anOtherDocument: CDM_Document): number;
CreateReference(aMetaData: CDM_MetaData, aReferenceIdentifier: number, anApplication: CDM_Application, aToDocumentVersion: number, UseStorageConfiguration: boolean): void;
CreateReference(aMetaData: CDM_MetaData, anApplication: CDM_Application, aDocumentVersion: number, UseStorageConfiguration: boolean): number;
CreateReference(anOtherDocument: CDM_Document): number;
CreateReference(aMetaData: CDM_MetaData, aReferenceIdentifier: number, anApplication: CDM_Application, aToDocumentVersion: number, UseStorageConfiguration: boolean): void;
CreateReference(aMetaData: CDM_MetaData, anApplication: CDM_Application, aDocumentVersion: number, UseStorageConfiguration: boolean): number;
CreateReference(anOtherDocument: CDM_Document): number;
CreateReference(aMetaData: CDM_MetaData, aReferenceIdentifier: number, anApplication: CDM_Application, aToDocumentVersion: number, UseStorageConfiguration: boolean): void;
CreateReference(aMetaData: CDM_MetaData, anApplication: CDM_Application, aDocumentVersion: number, UseStorageConfiguration: boolean): number;

// Removes the reference between the From Document and the To Document identified by a reference identifier
RemoveReference(aReferenceIdentifier: number): void;

// Removes all references having this document for From Document
RemoveAllReferences(): void;

// Returns the To Document of the reference identified by aReferenceIdentifier
Document(aReferenceIdentifier: number): CDM_Document;

// returns True if the To Document of the reference identified by aReferenceIdentifier is in session, False if it corresponds to a not yet retrieved document
IsInSession(aReferenceIdentifier: number): boolean;

// returns True if the To Document of the reference identified by aReferenceIdentifier has already been stored, False otherwise
IsStored(aReferenceIdentifier: number): boolean;
IsStored(): boolean;
IsStored(aReferenceIdentifier: number): boolean;
IsStored(): boolean;

// returns the name of the metadata of the To Document of the reference identified by aReferenceIdentifier
Name(aReferenceIdentifier: number): TCollection_ExtendedString;

// returns the number of references having this document as From Document
ToReferencesNumber(): number;

// returns the number of references having this document as To Document
FromReferencesNumber(): number;

// returns True is this document references aDocument
ShallowReferences(aDocument: CDM_Document): boolean;

// returns True is this document references aDocument
DeepReferences(aDocument: CDM_Document): boolean;

// Copies a reference to this document
CopyReference(aFromDocument: CDM_Document, aReferenceIdentifier: number): number;

// indicates that this document cannot be modified
IsReadOnly(): boolean;
IsReadOnly(aReferenceIdentifier: number): boolean;
IsReadOnly(): boolean;
IsReadOnly(aReferenceIdentifier: number): boolean;

SetIsReadOnly(): void;

UnsetIsReadOnly(): void;

// Indicates that this document has been modified
Modify(): void;

// returns the current modification counter
Modifications(): number;

UnModify(): void;

// returns true if the modification counter found in the given reference is equal to the actual modification counter of the To Document
IsUpToDate(aReferenceIdentifier: number): boolean;

// Resets the modification counter in the given reference to the actual modification counter of its To Document
SetIsUpToDate(aReferenceIdentifier: number): void;

// associates a comment with this document
SetComment(aComment: TCollection_ExtendedString): void;

// appends a comment into comments of this document
AddComment(aComment: TCollection_ExtendedString): void;

// associates a comments with this document
SetComments(aComments: NCollection_Sequence_TCollection_ExtendedString): void;

// returns the associated comments through <aComments>
Comments(aComments: NCollection_Sequence_TCollection_ExtendedString): void;
// aComments: Mutated in place

// Returns the first of associated comments
Comment(): string;

// returns the value of the modification counter at the time of storage
StorageVersion(): number;

// associates database information to a document which has been stored
SetMetaData(aMetaData: CDM_MetaData): void;

UnsetIsStored(): void;

MetaData(): CDM_MetaData;

Folder(): TCollection_ExtendedString;

// defines the folder in which the object should be stored
SetRequestedFolder(aFolder: TCollection_ExtendedString): void;

RequestedFolder(): TCollection_ExtendedString;

HasRequestedFolder(): boolean;

// defines the name under which the object should be stored
SetRequestedName(aName: TCollection_ExtendedString): void;

// Determines under which the document is going to be store
RequestedName(): TCollection_ExtendedString;

SetRequestedPreviousVersion(aPreviousVersion: TCollection_ExtendedString): void;

UnsetRequestedPreviousVersion(): void;

HasRequestedPreviousVersion(): boolean;

RequestedPreviousVersion(): TCollection_ExtendedString;

// defines the Comment with which the object should be stored
SetRequestedComment(aComment: TCollection_ExtendedString): void;

RequestedComment(): TCollection_ExtendedString;

// read (or rereads) the following resource
LoadResources(): void;

FindFileExtension(): boolean;

// gets the Desktop.Domain.Application.`FileFormat`.FileExtension resource
FileExtension(): TCollection_ExtendedString;

FindDescription(): boolean;

// gets the `FileFormat`.Description resource
Description(): TCollection_ExtendedString;

// returns true if the version is greater than the storage version
IsModified(): boolean;

// returns true if the document corresponding to the given reference has been retrieved and opened
IsOpened(): boolean;
IsOpened(aReferenceIdentifier: number): boolean;
IsOpened(): boolean;
IsOpened(aReferenceIdentifier: number): boolean;

Open(anApplication: CDM_Application): void;

CanClose(): CDM_CanCloseStatus;

Close(): void;

Application(): CDM_Application;

// A referenced document may indicate through this virtual method that it does not allow the closing of aDocument which it references through the reference aReferenceIdentifier
CanCloseReference(aDocument: CDM_Document, aReferenceIdentifier: number): boolean;

// A referenced document may update its internal data structure when {aDocument} which it references through the reference {aReferenceIdentifier} is being closed
CloseReference(aDocument: CDM_Document, aReferenceIdentifier: number): void;

ReferenceCounter(): number;

Reference(aReferenceIdentifier: number): CDM_Reference;

SetModifications(Modifications: number): void;

SetReferenceCounter(aReferenceCounter: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

CDM_MetaData: declare class CDM_MetaData extends Standard_Transient

static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;
static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aVersion: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;
static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;
static LookUp(theLookUpTable: NCollection_DataMap_TCollection_ExtendedString_handle_CDM_MetaData, aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aPath: TCollection_ExtendedString, aVersion: TCollection_ExtendedString, aFileName: TCollection_ExtendedString, ReadOnly: boolean): CDM_MetaData;

IsRetrieved(): boolean;

Document(): CDM_Document;

// returns the folder in which the meta-data has to be created or has to be found
Folder(): TCollection_ExtendedString;

// returns the name under which the meta-data has to be created or has to be found
Name(): TCollection_ExtendedString;

// returns the version under which the meta-data has to be found
Version(): TCollection_ExtendedString;

// indicates that the version has to be taken into account when searching the corresponding meta-data
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

CDM_ReferenceIterator: declare class CDM_ReferenceIterator

constructor

More(): boolean;

Next(): void;

Document(): CDM_Document;

ReferenceIdentifier(): number;

// returns the Document Version in the reference
DocumentVersion(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
