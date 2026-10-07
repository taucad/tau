# libcascade — APIHeaderSection

2 top-level symbols. Signatures are verbatim typescript.

APIHeaderSection_EditHeader: declare class APIHeaderSection_EditHeader extends IFSelect_Editor

  // APIHeaderSection_EditHeader.constructor (constructor)
  constructor();

  // APIHeaderSection_EditHeader.Label (method)
  Label(): TCollection_AsciiString;

  // APIHeaderSection_EditHeader.get_type_name (method)
  static get_type_name(): string;

  // APIHeaderSection_EditHeader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // APIHeaderSection_EditHeader.DynamicType (method)
  DynamicType(): Standard_Type;

  // APIHeaderSection_EditHeader.delete (method)
  delete(): void;

  // APIHeaderSection_EditHeader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

APIHeaderSection_MakeHeader: declare class APIHeaderSection_MakeHeader

  // APIHeaderSection_MakeHeader.constructor (constructor)
  constructor(shapetype?: number);
  constructor(model: StepData_StepModel);

  // APIHeaderSection_MakeHeader.Init (method)
  Init(nameval: string): void;

  // APIHeaderSection_MakeHeader.IsDone (method)
  IsDone(): boolean;

  // APIHeaderSection_MakeHeader.Apply (method)
  Apply(model: StepData_StepModel): void;

  // APIHeaderSection_MakeHeader.NewModel (method)
  NewModel(protocol: Interface_Protocol): StepData_StepModel;

  // APIHeaderSection_MakeHeader.HasFn (method)
  HasFn(): boolean;

  // APIHeaderSection_MakeHeader.FnValue (method)
  FnValue(): unknown;

  // APIHeaderSection_MakeHeader.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.Name (method)
  Name(): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.SetTimeStamp (method)
  SetTimeStamp(aTimeStamp: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.TimeStamp (method)
  TimeStamp(): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.SetAuthor (method)
  SetAuthor(aAuthor: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.SetAuthorValue (method)
  SetAuthorValue(num: number, aAuthor: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.Author (method)
  Author(): NCollection_HArray1_handle_TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.AuthorValue (method)
  AuthorValue(num: number): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.NbAuthor (method)
  NbAuthor(): number;

  // APIHeaderSection_MakeHeader.SetOrganization (method)
  SetOrganization(aOrganization: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.SetOrganizationValue (method)
  SetOrganizationValue(num: number, aOrganization: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.Organization (method)
  Organization(): NCollection_HArray1_handle_TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.OrganizationValue (method)
  OrganizationValue(num: number): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.NbOrganization (method)
  NbOrganization(): number;

  // APIHeaderSection_MakeHeader.SetPreprocessorVersion (method)
  SetPreprocessorVersion(aPreprocessorVersion: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.PreprocessorVersion (method)
  PreprocessorVersion(): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.SetOriginatingSystem (method)
  SetOriginatingSystem(aOriginatingSystem: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.OriginatingSystem (method)
  OriginatingSystem(): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.SetAuthorisation (method)
  SetAuthorisation(aAuthorisation: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.Authorisation (method)
  Authorisation(): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.HasFs (method)
  HasFs(): boolean;

  // APIHeaderSection_MakeHeader.FsValue (method)
  FsValue(): unknown;

  // APIHeaderSection_MakeHeader.SetSchemaIdentifiers (method)
  SetSchemaIdentifiers(aSchemaIdentifiers: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.SetSchemaIdentifiersValue (method)
  SetSchemaIdentifiersValue(num: number, aSchemaIdentifier: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.SchemaIdentifiers (method)
  SchemaIdentifiers(): NCollection_HArray1_handle_TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.SchemaIdentifiersValue (method)
  SchemaIdentifiersValue(num: number): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.NbSchemaIdentifiers (method)
  NbSchemaIdentifiers(): number;

  // APIHeaderSection_MakeHeader.AddSchemaIdentifier (method)
  AddSchemaIdentifier(aSchemaIdentifier: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.HasFd (method)
  HasFd(): boolean;

  // APIHeaderSection_MakeHeader.FdValue (method)
  FdValue(): unknown;

  // APIHeaderSection_MakeHeader.SetDescription (method)
  SetDescription(aDescription: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.SetDescriptionValue (method)
  SetDescriptionValue(num: number, aDescription: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.Description (method)
  Description(): NCollection_HArray1_handle_TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.DescriptionValue (method)
  DescriptionValue(num: number): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.NbDescription (method)
  NbDescription(): number;

  // APIHeaderSection_MakeHeader.SetImplementationLevel (method)
  SetImplementationLevel(aImplementationLevel: TCollection_HAsciiString): void;

  // APIHeaderSection_MakeHeader.ImplementationLevel (method)
  ImplementationLevel(): TCollection_HAsciiString;

  // APIHeaderSection_MakeHeader.delete (method)
  delete(): void;

  // APIHeaderSection_MakeHeader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
