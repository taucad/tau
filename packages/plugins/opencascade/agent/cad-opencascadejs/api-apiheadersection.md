# libcascade — APIHeaderSection

2 top-level symbols. Signatures are verbatim typescript.

APIHeaderSection_EditHeader: declare class APIHeaderSection_EditHeader extends IFSelect_Editor

constructor

// Returns the specific label
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows to consult and prepare/edit data stored in a Step Model Header
APIHeaderSection_MakeHeader: declare class APIHeaderSection_MakeHeader

constructor

// Cancels the former definition and gives a FileName To be used when a Model has no well defined Header
Init(nameval: string): void;

// Returns True if all data have been defined (see also HasFn, HasFs, HasFd)
IsDone(): boolean;

// Creates an empty header for a new STEP model and allows the header fields to be completed
Apply(model: StepData_StepModel): void;

// Builds a Header, creates a new StepModel, then applies the Header to the StepModel The Schema Name is taken from the Protocol (if it inherits from {@link StepData `StepData`}, else it is left in blanks)
NewModel(protocol: Interface_Protocol): StepData_StepModel;

// Checks whether there is a file_name entity
HasFn(): boolean;

// Returns the file_name entity
FnValue(): unknown;

SetName(aName: TCollection_HAsciiString): void;

// Returns the name attribute for the file_name entity
Name(): TCollection_HAsciiString;

SetTimeStamp(aTimeStamp: TCollection_HAsciiString): void;

// Returns the value of the time_stamp attribute for the file_name entity
TimeStamp(): TCollection_HAsciiString;

SetAuthor(aAuthor: NCollection_HArray1_handle_TCollection_HAsciiString): void;

SetAuthorValue(num: number, aAuthor: TCollection_HAsciiString): void;

Author(): NCollection_HArray1_handle_TCollection_HAsciiString;

// Returns the value of the name attribute for the file_name entity
AuthorValue(num: number): TCollection_HAsciiString;

// Returns the number of values for the author attribute in the file_name entity
NbAuthor(): number;

SetOrganization(aOrganization: NCollection_HArray1_handle_TCollection_HAsciiString): void;

SetOrganizationValue(num: number, aOrganization: TCollection_HAsciiString): void;

Organization(): NCollection_HArray1_handle_TCollection_HAsciiString;

// Returns the value of attribute organization for the file_name entity
OrganizationValue(num: number): TCollection_HAsciiString;

// Returns the number of values for the organization attribute in the file_name entity
NbOrganization(): number;

SetPreprocessorVersion(aPreprocessorVersion: TCollection_HAsciiString): void;

// Returns the name of the preprocessor_version for the file_name entity
PreprocessorVersion(): TCollection_HAsciiString;

SetOriginatingSystem(aOriginatingSystem: TCollection_HAsciiString): void;

OriginatingSystem(): TCollection_HAsciiString;

SetAuthorisation(aAuthorisation: TCollection_HAsciiString): void;

// Returns the value of the authorization attribute for the file_name entity
Authorisation(): TCollection_HAsciiString;

// Checks whether there is a file_schema entity
HasFs(): boolean;

// Returns the file_schema entity
FsValue(): unknown;

SetSchemaIdentifiers(aSchemaIdentifiers: NCollection_HArray1_handle_TCollection_HAsciiString): void;

SetSchemaIdentifiersValue(num: number, aSchemaIdentifier: TCollection_HAsciiString): void;

SchemaIdentifiers(): NCollection_HArray1_handle_TCollection_HAsciiString;

// Returns the value of the schema_identifier attribute for the file_schema entity
SchemaIdentifiersValue(num: number): TCollection_HAsciiString;

// Returns the number of values for the schema_identifier attribute in the file_schema entity
NbSchemaIdentifiers(): number;

// Add a subname of schema (if not yet in the list)
AddSchemaIdentifier(aSchemaIdentifier: TCollection_HAsciiString): void;

// Checks whether there is a file_description entity
HasFd(): boolean;

// Returns the file_description entity
FdValue(): unknown;

SetDescription(aDescription: NCollection_HArray1_handle_TCollection_HAsciiString): void;

SetDescriptionValue(num: number, aDescription: TCollection_HAsciiString): void;

Description(): NCollection_HArray1_handle_TCollection_HAsciiString;

// Returns the value of the description attribute for the file_description entity
DescriptionValue(num: number): TCollection_HAsciiString;

// Returns the number of values for the file_description entity in the STEP file header
NbDescription(): number;

SetImplementationLevel(aImplementationLevel: TCollection_HAsciiString): void;

// Returns the value of the implementation_level attribute for the file_description entity
ImplementationLevel(): TCollection_HAsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
