# build123d — APIHeaderSection

1 top-level symbols. Signatures are verbatim python.

// This class allows to consult and prepare/edit data stored in a Step Model Header
APIHeaderSection_MakeHeader

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, shapetype: int = 0) -> None
  __init__(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, model: OCP.OCP.StepData.StepData_StepModel) -> None

  // Init(self
  Init(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, nameval: str) -> None

  // IsDone(self
  IsDone(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // Apply(self
  Apply(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, model: OCP.OCP.StepData.StepData_StepModel) -> None

  // NewModel(self
  NewModel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, protocol: OCP.OCP.Interface.Interface_Protocol) -> OCP.OCP.StepData.StepData_StepModel

  // HasFn(self
  HasFn(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FnValue(self
  FnValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileName

  // SetName(self
  SetName(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aName: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Name(self
  Name(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetTimeStamp(self
  SetTimeStamp(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aTimeStamp: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // TimeStamp(self
  TimeStamp(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetAuthor(self
  SetAuthor(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aAuthor: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetAuthorValue(self
  SetAuthorValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aAuthor: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Author(self
  Author(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // AuthorValue(self
  AuthorValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbAuthor(self
  NbAuthor(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetOrganization(self
  SetOrganization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aOrganization: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetOrganizationValue(self
  SetOrganizationValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aOrganization: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Organization(self
  Organization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // OrganizationValue(self
  OrganizationValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbOrganization(self
  NbOrganization(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetPreprocessorVersion(self
  SetPreprocessorVersion(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aPreprocessorVersion: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // PreprocessorVersion(self
  PreprocessorVersion(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetOriginatingSystem(self
  SetOriginatingSystem(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aOriginatingSystem: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // OriginatingSystem(self
  OriginatingSystem(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // SetAuthorisation(self
  SetAuthorisation(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aAuthorisation: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Authorisation(self
  Authorisation(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // HasFs(self
  HasFs(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FsValue(self
  FsValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileSchema

  // SetSchemaIdentifiers(self
  SetSchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aSchemaIdentifiers: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetSchemaIdentifiersValue(self
  SetSchemaIdentifiersValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aSchemaIdentifier: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // SchemaIdentifiers(self
  SchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // SchemaIdentifiersValue(self
  SchemaIdentifiersValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbSchemaIdentifiers(self
  NbSchemaIdentifiers(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // AddSchemaIdentifier(self
  AddSchemaIdentifier(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aSchemaIdentifier: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // HasFd(self
  HasFd(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> bool

  // FdValue(self
  FdValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> HeaderSection_FileDescription

  // SetDescription(self
  SetDescription(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aDescription: OCP.OCP.Interface.Interface_HArray1OfHAsciiString) -> None

  // SetDescriptionValue(self
  SetDescriptionValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int, aDescription: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // Description(self
  Description(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.Interface.Interface_HArray1OfHAsciiString

  // DescriptionValue(self
  DescriptionValue(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, num: int) -> OCP.OCP.TCollection.TCollection_HAsciiString

  // NbDescription(self
  NbDescription(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> int

  // SetImplementationLevel(self
  SetImplementationLevel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader, aImplementationLevel: OCP.OCP.TCollection.TCollection_HAsciiString) -> None

  // ImplementationLevel(self
  ImplementationLevel(self: OCP.OCP.APIHeaderSection.APIHeaderSection_MakeHeader) -> OCP.OCP.TCollection.TCollection_HAsciiString
