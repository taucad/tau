# build123d — APIHeaderSection

1 top-level symbols. Signatures are verbatim python.

// Category: APIHeaderSection
// This class allows to consult and prepare/edit data stored in a Step Model Header
APIHeaderSection_MakeHeader

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, shapetype: int = 0) -> None 2. __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, model: OCP.OCP.StepData.StepData_StepModel) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, shapetype: int = 0) -> None
  __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, model: OCP.OCP.StepData.StepData_StepModel) -> None

  // Init(self
  // Remarks: Cancels the former definition and gives a FileName To be used when a Model has no well defined Header
  Init(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, nameval: str) -> None

  // IsDone(self
  // Remarks: Returns True if all data have been defined (see also HasFn, HasFs, HasFd)
  IsDone(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // Apply(self
  // Remarks: Creates an empty header for a new STEP model and allows the header fields to be completed.
  Apply(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, model: OCP.OCP.StepData.StepData_StepModel) -> None

  // NewModel(self
  // Remarks: Builds a Header, creates a new StepModel, then applies the Header to the StepModel The Schema Name is taken from the Protocol (if it inherits from StepData, else it is left in blanks)
  NewModel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, protocol: OCP.OCP.Interface.Interface_Protocol) -> OCP.OCP.StepData.StepData_StepModel

  // HasFn(self
  // Remarks: Checks whether there is a file_name entity. Returns True if there is one.
  HasFn(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FnValue(self
  // Remarks: Returns the file_name entity. Returns an empty entity if the file_name entity is not initialized.
  FnValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileName

  // SetName(self
  SetName(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aName: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Name(self
  // Remarks: Returns the name attribute for the file_name entity.
  Name(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetTimeStamp(self
  SetTimeStamp(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aTimeStamp: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // TimeStamp(self
  // Remarks: Returns the value of the time_stamp attribute for the file_name entity.
  TimeStamp(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetAuthor(self
  SetAuthor(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aAuthor: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetAuthorValue(self
  SetAuthorValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aAuthor: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Author(self
  Author(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // AuthorValue(self
  // Remarks: Returns the value of the name attribute for the file_name entity.
  AuthorValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbAuthor(self
  // Remarks: Returns the number of values for the author attribute in the file_name entity.
  NbAuthor(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetOrganization(self
  SetOrganization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aOrganization: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetOrganizationValue(self
  SetOrganizationValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aOrganization: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Organization(self
  Organization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // OrganizationValue(self
  // Remarks: Returns the value of attribute organization for the file_name entity.
  OrganizationValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbOrganization(self
  // Remarks: Returns the number of values for the organization attribute in the file_name entity.
  NbOrganization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetPreprocessorVersion(self
  SetPreprocessorVersion(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aPreprocessorVersion: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // PreprocessorVersion(self
  // Remarks: Returns the name of the preprocessor_version for the file_name entity.
  PreprocessorVersion(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetOriginatingSystem(self
  SetOriginatingSystem(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aOriginatingSystem: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // OriginatingSystem(self
  OriginatingSystem(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetAuthorisation(self
  SetAuthorisation(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aAuthorisation: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Authorisation(self
  // Remarks: Returns the value of the authorization attribute for the file_name entity.
  Authorisation(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // HasFs(self
  // Remarks: Checks whether there is a file_schema entity. Returns True if there is one.
  HasFs(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FsValue(self
  // Remarks: Returns the file_schema entity. Returns an empty entity if the file_schema entity is not initialized.
  FsValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileSchema

  // SetSchemaIdentifiers(self
  SetSchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aSchemaIdentifiers: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetSchemaIdentifiersValue(self
  SetSchemaIdentifiersValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aSchemaIdentifier: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // SchemaIdentifiers(self
  SchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // SchemaIdentifiersValue(self
  // Remarks: Returns the value of the schema_identifier attribute for the file_schema entity.
  SchemaIdentifiersValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbSchemaIdentifiers(self
  // Remarks: Returns the number of values for the schema_identifier attribute in the file_schema entity.
  NbSchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // AddSchemaIdentifier(self
  // Remarks: Add a subname of schema (if not yet in the list)
  AddSchemaIdentifier(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aSchemaIdentifier: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // HasFd(self
  // Remarks: Checks whether there is a file_description entity. Returns True if there is one.
  HasFd(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FdValue(self
  // Remarks: Returns the file_description entity. Returns an empty entity if the file_description entity is not initialized.
  FdValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileDescription

  // SetDescription(self
  SetDescription(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aDescription: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetDescriptionValue(self
  SetDescriptionValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aDescription: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Description(self
  Description(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // DescriptionValue(self
  // Remarks: Returns the value of the description attribute for the file_description entity.
  DescriptionValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbDescription(self
  // Remarks: Returns the number of values for the file_description entity in the STEP file header.
  NbDescription(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetImplementationLevel(self
  SetImplementationLevel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aImplementationLevel: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // ImplementationLevel(self
  // Remarks: Returns the value of the implementation_level attribute for the file_description entity.
  ImplementationLevel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString
