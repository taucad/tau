# build123d — APIHeaderSection

1 top-level symbols. Signatures are verbatim python.

// Category: APIHeaderSection
// This class allows to consult and prepare/edit data stored in a Step Model Header
APIHeaderSection_MakeHeader

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, shapetype: int = 0) -> None 2. __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, model: OCP.OCP.StepData.StepData_StepModel) -> None
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, shapetype: int = 0) -> None
  __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, model: OCP.OCP.StepData.StepData_StepModel) -> None

  // Init(self
  // Remarks: Cancels the former definition and gives a FileName To be used when a Model has no well defined Header
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.Init (method)
  Init(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, nameval: str) -> None

  // IsDone(self
  // Remarks: Returns True if all data have been defined (see also HasFn, HasFs, HasFd)
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.IsDone (method)
  IsDone(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // Apply(self
  // Remarks: Creates an empty header for a new STEP model and allows the header fields to be completed.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.Apply (method)
  Apply(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, model: OCP.OCP.StepData.StepData_StepModel) -> None

  // NewModel(self
  // Remarks: Builds a Header, creates a new StepModel, then applies the Header to the StepModel The Schema Name is taken from the Protocol (if it inherits from StepData, else it is left in blanks)
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.NewModel (method)
  NewModel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, protocol: OCP.OCP.Interface.Interface_Protocol) -> OCP.OCP.StepData.StepData_StepModel

  // HasFn(self
  // Remarks: Checks whether there is a file_name entity. Returns True if there is one.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.HasFn (method)
  HasFn(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FnValue(self
  // Remarks: Returns the file_name entity. Returns an empty entity if the file_name entity is not initialized.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.FnValue (method)
  FnValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileName

  // SetName(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetName (method)
  SetName(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aName: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Name(self
  // Remarks: Returns the name attribute for the file_name entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.Name (method)
  Name(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetTimeStamp(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetTimeStamp (method)
  SetTimeStamp(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aTimeStamp: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // TimeStamp(self
  // Remarks: Returns the value of the time_stamp attribute for the file_name entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.TimeStamp (method)
  TimeStamp(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetAuthor(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetAuthor (method)
  SetAuthor(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aAuthor: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetAuthorValue(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetAuthorValue (method)
  SetAuthorValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aAuthor: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Author(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.Author (method)
  Author(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // AuthorValue(self
  // Remarks: Returns the value of the name attribute for the file_name entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.AuthorValue (method)
  AuthorValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbAuthor(self
  // Remarks: Returns the number of values for the author attribute in the file_name entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.NbAuthor (method)
  NbAuthor(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetOrganization(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetOrganization (method)
  SetOrganization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aOrganization: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetOrganizationValue(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetOrganizationValue (method)
  SetOrganizationValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aOrganization: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Organization(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.Organization (method)
  Organization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // OrganizationValue(self
  // Remarks: Returns the value of attribute organization for the file_name entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.OrganizationValue (method)
  OrganizationValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbOrganization(self
  // Remarks: Returns the number of values for the organization attribute in the file_name entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.NbOrganization (method)
  NbOrganization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetPreprocessorVersion(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetPreprocessorVersion (method)
  SetPreprocessorVersion(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aPreprocessorVersion: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // PreprocessorVersion(self
  // Remarks: Returns the name of the preprocessor_version for the file_name entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.PreprocessorVersion (method)
  PreprocessorVersion(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetOriginatingSystem(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetOriginatingSystem (method)
  SetOriginatingSystem(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aOriginatingSystem: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // OriginatingSystem(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.OriginatingSystem (method)
  OriginatingSystem(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetAuthorisation(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetAuthorisation (method)
  SetAuthorisation(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aAuthorisation: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Authorisation(self
  // Remarks: Returns the value of the authorization attribute for the file_name entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.Authorisation (method)
  Authorisation(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // HasFs(self
  // Remarks: Checks whether there is a file_schema entity. Returns True if there is one.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.HasFs (method)
  HasFs(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FsValue(self
  // Remarks: Returns the file_schema entity. Returns an empty entity if the file_schema entity is not initialized.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.FsValue (method)
  FsValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileSchema

  // SetSchemaIdentifiers(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetSchemaIdentifiers (method)
  SetSchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aSchemaIdentifiers: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetSchemaIdentifiersValue(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetSchemaIdentifiersValue (method)
  SetSchemaIdentifiersValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aSchemaIdentifier: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // SchemaIdentifiers(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SchemaIdentifiers (method)
  SchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // SchemaIdentifiersValue(self
  // Remarks: Returns the value of the schema_identifier attribute for the file_schema entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SchemaIdentifiersValue (method)
  SchemaIdentifiersValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbSchemaIdentifiers(self
  // Remarks: Returns the number of values for the schema_identifier attribute in the file_schema entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.NbSchemaIdentifiers (method)
  NbSchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // AddSchemaIdentifier(self
  // Remarks: Add a subname of schema (if not yet in the list)
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.AddSchemaIdentifier (method)
  AddSchemaIdentifier(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aSchemaIdentifier: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // HasFd(self
  // Remarks: Checks whether there is a file_description entity. Returns True if there is one.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.HasFd (method)
  HasFd(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FdValue(self
  // Remarks: Returns the file_description entity. Returns an empty entity if the file_description entity is not initialized.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.FdValue (method)
  FdValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileDescription

  // SetDescription(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetDescription (method)
  SetDescription(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aDescription: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetDescriptionValue(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetDescriptionValue (method)
  SetDescriptionValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aDescription: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Description(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.Description (method)
  Description(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // DescriptionValue(self
  // Remarks: Returns the value of the description attribute for the file_description entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.DescriptionValue (method)
  DescriptionValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbDescription(self
  // Remarks: Returns the number of values for the file_description entity in the STEP file header.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.NbDescription (method)
  NbDescription(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetImplementationLevel(self
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.SetImplementationLevel (method)
  SetImplementationLevel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aImplementationLevel: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // ImplementationLevel(self
  // Remarks: Returns the value of the implementation_level attribute for the file_description entity.
  // OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader.ImplementationLevel (method)
  ImplementationLevel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString
