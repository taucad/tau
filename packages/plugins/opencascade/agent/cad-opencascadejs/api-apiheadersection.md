# libcascade — APIHeaderSection

2 top-level symbols. Signatures are verbatim typescript.

APIHeaderSection_EditHeader: declare class APIHeaderSection_EditHeader extends IFSelect_Editor

  constructor

  Label(): TCollection_AsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

APIHeaderSection_MakeHeader: declare class APIHeaderSection_MakeHeader

  constructor

  Init(nameval: string): void;

  IsDone(): boolean;

  Apply(model: StepData_StepModel): void;

  NewModel(protocol: Interface_Protocol): StepData_StepModel;

  HasFn(): boolean;

  FnValue(): unknown;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetTimeStamp(aTimeStamp: TCollection_HAsciiString): void;

  TimeStamp(): TCollection_HAsciiString;

  SetAuthor(aAuthor: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  SetAuthorValue(num: number, aAuthor: TCollection_HAsciiString): void;

  Author(): NCollection_HArray1_handle_TCollection_HAsciiString;

  AuthorValue(num: number): TCollection_HAsciiString;

  NbAuthor(): number;

  SetOrganization(aOrganization: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  SetOrganizationValue(num: number, aOrganization: TCollection_HAsciiString): void;

  Organization(): NCollection_HArray1_handle_TCollection_HAsciiString;

  OrganizationValue(num: number): TCollection_HAsciiString;

  NbOrganization(): number;

  SetPreprocessorVersion(aPreprocessorVersion: TCollection_HAsciiString): void;

  PreprocessorVersion(): TCollection_HAsciiString;

  SetOriginatingSystem(aOriginatingSystem: TCollection_HAsciiString): void;

  OriginatingSystem(): TCollection_HAsciiString;

  SetAuthorisation(aAuthorisation: TCollection_HAsciiString): void;

  Authorisation(): TCollection_HAsciiString;

  HasFs(): boolean;

  FsValue(): unknown;

  SetSchemaIdentifiers(aSchemaIdentifiers: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  SetSchemaIdentifiersValue(num: number, aSchemaIdentifier: TCollection_HAsciiString): void;

  SchemaIdentifiers(): NCollection_HArray1_handle_TCollection_HAsciiString;

  SchemaIdentifiersValue(num: number): TCollection_HAsciiString;

  NbSchemaIdentifiers(): number;

  AddSchemaIdentifier(aSchemaIdentifier: TCollection_HAsciiString): void;

  HasFd(): boolean;

  FdValue(): unknown;

  SetDescription(aDescription: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  SetDescriptionValue(num: number, aDescription: TCollection_HAsciiString): void;

  Description(): NCollection_HArray1_handle_TCollection_HAsciiString;

  DescriptionValue(num: number): TCollection_HAsciiString;

  NbDescription(): number;

  SetImplementationLevel(aImplementationLevel: TCollection_HAsciiString): void;

  ImplementationLevel(): TCollection_HAsciiString;

  delete(): void;

  [Symbol.dispose](): void;
