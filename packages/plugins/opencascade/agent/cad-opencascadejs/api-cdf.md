# libcascade — CDF

11 top-level symbols. Signatures are verbatim typescript.

CDF_Application: declare class CDF_Application extends CDM_Application

myMetaDataDriver: CDF_MetaDataDriver

myDirectory: CDF_Directory

// plugs an application
static Load(aGUID: Standard_GUID): CDF_Application;

// Constructs an new empty document
NewDocument(theFormat: TCollection_ExtendedString): { theDoc: CDM_Document; [Symbol.dispose](): void };

// Initialize a document for the applicative session
InitDocument(theDoc: CDM_Document): void;

// puts the document in the current session directory and calls the virtual method Activate on it
Open(aDocument: CDM_Document): void;

CanClose(aDocument: CDM_Document): CDM_CanCloseStatus;

// removes the document of the current session directory and closes the document
Close(aDocument: CDM_Document): void;

CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;
CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theVersion: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;
CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;
CanRetrieve(theFolder: TCollection_ExtendedString, theName: TCollection_ExtendedString, theVersion: TCollection_ExtendedString, theAppendMode: boolean): PCDM_ReaderStatus;

// Checks status after Retrieve
GetRetrieveStatus(): PCDM_ReaderStatus;

// Returns instance of read driver for specified format
ReaderFromFormat(aFormat: TCollection_ExtendedString): PCDM_Reader;

// Returns instance of storage driver for specified format
WriterFromFormat(aFormat: TCollection_ExtendedString): PCDM_StorageDriver;

// try to retrieve a Format directly in the file or in application resource by using extension
Format(aFileName: TCollection_ExtendedString, theFormat: TCollection_ExtendedString): boolean;
// theFormat: Mutated in place

DefaultFolder(): string;

SetDefaultFolder(aFolder: string): boolean;

// returns MetaDatdDriver of this application
MetaDataDriver(): CDF_MetaDataDriver;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A directory is a collection of documents
CDF_Directory: declare class CDF_Directory extends Standard_Transient

constructor

// adds a document into the directory
Add(aDocument: CDM_Document): void;

// removes the document
Remove(aDocument: CDM_Document): void;

// Returns true if the document aDocument is in the directory
Contains(aDocument: CDM_Document): boolean;

// returns the last document (if any) which has been added in the directory
Last(): CDM_Document;

// returns the number of documents of the directory
Length(): number;

// returns true if the directory is empty
IsEmpty(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

CDF_FWOSDriver: declare class CDF_FWOSDriver extends CDF_MetaDataDriver

constructor

// indicate whether a file exists corresponding to the folder and the name
Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;
Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

HasReadPermission(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;

FindFolder(aFolder: TCollection_ExtendedString): boolean;

DefaultFolder(): TCollection_ExtendedString;

BuildFileName(aDocument: CDM_Document): TCollection_ExtendedString;

// this method is useful if the name of an object depends on the metadatadriver
SetName(aDocument: CDM_Document, aName: TCollection_ExtendedString): TCollection_ExtendedString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// this class list the method that must be available for a specific DBMS
CDF_MetaDataDriver: declare class CDF_MetaDataDriver extends Standard_Transient

// returns true if the MetaDataDriver can manage different versions of a Data
HasVersionCapability(): boolean;

// Creates a "Depends On" relation between two Datas
CreateDependsOn(aFirstData: CDM_MetaData, aSecondData: CDM_MetaData): void;

CreateReference(aFrom: CDM_MetaData, aTo: CDM_MetaData, aReferenceIdentifier: number, aToDocumentVersion: number): void;

// by default return true
HasVersion(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

BuildFileName(aDocument: CDM_Document): TCollection_ExtendedString;

// this method is useful if the name of an object depends on the metadatadriver
SetName(aDocument: CDM_Document, aName: TCollection_ExtendedString): TCollection_ExtendedString;

// should indicate whether meta-data exist in the DBMS corresponding to the Data
Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;
Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;
Find(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): boolean;

HasReadPermission(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): boolean;

// should return the MetaData stored in the DBMS with the meta-data corresponding to the Data
MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): CDM_MetaData;
MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): CDM_MetaData;
MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString, aVersion: TCollection_ExtendedString): CDM_MetaData;
MetaData(aFolder: TCollection_ExtendedString, aName: TCollection_ExtendedString): CDM_MetaData;

// by default returns aMetaDATA should return the MetaData stored in the DBMS with the meta-data corresponding to the path
LastVersion(aMetaData: CDM_MetaData): CDM_MetaData;

// should create meta-data corresponding to aData and maintaining a meta-link between these meta-data and aFileName CreateMetaData is called by CreateData If the metadata-driver has version capabilities, version must be set in the returned Data
CreateMetaData(aDocument: CDM_Document, aFileName: TCollection_ExtendedString): CDM_MetaData;

FindFolder(aFolder: TCollection_ExtendedString): boolean;

DefaultFolder(): TCollection_ExtendedString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

CDF_MetaDataDriverFactory: declare class CDF_MetaDataDriverFactory extends Standard_Transient

Build(): CDF_MetaDataDriver;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

CDF_Store: declare class CDF_Store

constructor

// returns the folder in which the current document will be stored
Folder(): TCollection_HExtendedString;

// returns the name under which the current document will be stored
Name(): TCollection_HExtendedString;

// returns true if the current document is already stored
IsStored(): boolean;

IsModified(): boolean;

CurrentIsConsistent(): boolean;

IsConsistent(): boolean;

HasAPreviousVersion(): boolean;

PreviousVersion(): TCollection_HExtendedString;

// returns true if the currentdocument is the main one, ie the document of the current selection
IsMainDocument(): boolean;

// defines the folder in which the document should be stored
SetFolder(aFolder: TCollection_ExtendedString): boolean;

// defines the folder in which the document should be stored
SetFolder_2(aFolder: string): boolean;

// defines the name under which the document should be stored
SetName(aName: TCollection_ExtendedString): CDF_StoreSetNameStatus;

// defines the name under which the document should be stored
SetName_1(aName: string): CDF_StoreSetNameStatus;

SetComment(aComment: string): void;

Comment(): TCollection_HExtendedString;

// defines the name under which the document should be stored
RecheckName(): CDF_StoreSetNameStatus;

SetPreviousVersion(aPreviousVersion: string): boolean;

Realize(theRange?: Message_ProgressRange): void;

// returns the complete path of the created meta-data
Path(): string;

// returns the path of the previous store is the object is already stored, otherwise an empty string
MetaDataPath(): TCollection_HExtendedString;

// returns the description of the format of the main object
Description(): TCollection_HExtendedString;

SetCurrent(aPresentation: string): void;

// the two following methods can be used just after Realize or Import - method to know if these methods worked correctly, and if not why
SetMain(): void;

StoreStatus(): PCDM_StoreStatus;

AssociatedStatusText(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

CDF_StoreList: declare class CDF_StoreList extends Standard_Transient

constructor

IsConsistent(): boolean;

// stores each object of the storelist in the reverse order of which they had been added
Store(aStatusAssociatedText: TCollection_ExtendedString, theRange: Message_ProgressRange): { returnValue: PCDM_StoreStatus; aMetaData: CDM_MetaData; [Symbol.dispose](): void };
// aStatusAssociatedText: Mutated in place

Init(): void;

More(): boolean;

Next(): void;

Value(): CDM_Document;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

CDF_StoreSetNameStatus: typeof CDF_StoreSetNameStatus[keyof typeof CDF_StoreSetNameStatus]

CDF_SubComponentStatus: typeof CDF_SubComponentStatus[keyof typeof CDF_SubComponentStatus]

CDF_TryStoreStatus: typeof CDF_TryStoreStatus[keyof typeof CDF_TryStoreStatus]

CDF_TypeOfActivation: typeof CDF_TypeOfActivation[keyof typeof CDF_TypeOfActivation]
