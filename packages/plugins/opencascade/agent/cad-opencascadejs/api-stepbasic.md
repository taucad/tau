# libcascade — StepBasic

34 top-level symbols. Signatures are verbatim typescript.

StepBasic_Action: declare class StepBasic_Action extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aChosenMethod: StepBasic_ActionMethod): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  HasDescription(): boolean;

  ChosenMethod(): StepBasic_ActionMethod;

  SetChosenMethod(ChosenMethod: StepBasic_ActionMethod): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ActionAssignment: declare class StepBasic_ActionAssignment extends Standard_Transient

  constructor

  Init(aAssignedAction: StepBasic_Action): void;

  AssignedAction(): StepBasic_Action;

  SetAssignedAction(AssignedAction: StepBasic_Action): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ActionMethod: declare class StepBasic_ActionMethod extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aConsequence: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  HasDescription(): boolean;

  Consequence(): TCollection_HAsciiString;

  SetConsequence(Consequence: TCollection_HAsciiString): void;

  Purpose(): TCollection_HAsciiString;

  SetPurpose(Purpose: TCollection_HAsciiString): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ActionRequestAssignment: declare class StepBasic_ActionRequestAssignment extends Standard_Transient

  constructor

  Init(aAssignedActionRequest: StepBasic_VersionedActionRequest): void;

  AssignedActionRequest(): StepBasic_VersionedActionRequest;

  SetAssignedActionRequest(AssignedActionRequest: StepBasic_VersionedActionRequest): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ActionRequestSolution: declare class StepBasic_ActionRequestSolution extends Standard_Transient

  constructor

  Init(aMethod: StepBasic_ActionMethod, aRequest: StepBasic_VersionedActionRequest): void;

  Method(): StepBasic_ActionMethod;

  SetMethod(Method: StepBasic_ActionMethod): void;

  Request(): StepBasic_VersionedActionRequest;

  SetRequest(Request: StepBasic_VersionedActionRequest): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_Address: declare class StepBasic_Address extends Standard_Transient

  constructor

  Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString): void;

  SetInternalLocation(aInternalLocation: TCollection_HAsciiString): void;

  UnSetInternalLocation(): void;

  InternalLocation(): TCollection_HAsciiString;

  HasInternalLocation(): boolean;

  SetStreetNumber(aStreetNumber: TCollection_HAsciiString): void;

  UnSetStreetNumber(): void;

  StreetNumber(): TCollection_HAsciiString;

  HasStreetNumber(): boolean;

  SetStreet(aStreet: TCollection_HAsciiString): void;

  UnSetStreet(): void;

  Street(): TCollection_HAsciiString;

  HasStreet(): boolean;

  SetPostalBox(aPostalBox: TCollection_HAsciiString): void;

  UnSetPostalBox(): void;

  PostalBox(): TCollection_HAsciiString;

  HasPostalBox(): boolean;

  SetTown(aTown: TCollection_HAsciiString): void;

  UnSetTown(): void;

  Town(): TCollection_HAsciiString;

  HasTown(): boolean;

  SetRegion(aRegion: TCollection_HAsciiString): void;

  UnSetRegion(): void;

  Region(): TCollection_HAsciiString;

  HasRegion(): boolean;

  SetPostalCode(aPostalCode: TCollection_HAsciiString): void;

  UnSetPostalCode(): void;

  PostalCode(): TCollection_HAsciiString;

  HasPostalCode(): boolean;

  SetCountry(aCountry: TCollection_HAsciiString): void;

  UnSetCountry(): void;

  Country(): TCollection_HAsciiString;

  HasCountry(): boolean;

  SetFacsimileNumber(aFacsimileNumber: TCollection_HAsciiString): void;

  UnSetFacsimileNumber(): void;

  FacsimileNumber(): TCollection_HAsciiString;

  HasFacsimileNumber(): boolean;

  SetTelephoneNumber(aTelephoneNumber: TCollection_HAsciiString): void;

  UnSetTelephoneNumber(): void;

  TelephoneNumber(): TCollection_HAsciiString;

  HasTelephoneNumber(): boolean;

  SetElectronicMailAddress(aElectronicMailAddress: TCollection_HAsciiString): void;

  UnSetElectronicMailAddress(): void;

  ElectronicMailAddress(): TCollection_HAsciiString;

  HasElectronicMailAddress(): boolean;

  SetTelexNumber(aTelexNumber: TCollection_HAsciiString): void;

  UnSetTelexNumber(): void;

  TelexNumber(): TCollection_HAsciiString;

  HasTelexNumber(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_AheadOrBehind: typeof StepBasic_AheadOrBehind[keyof typeof StepBasic_AheadOrBehind]

StepBasic_ApplicationContext: declare class StepBasic_ApplicationContext extends Standard_Transient

  constructor

  Init(aApplication: TCollection_HAsciiString): void;

  SetApplication(aApplication: TCollection_HAsciiString): void;

  Application(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ApplicationContextElement: declare class StepBasic_ApplicationContextElement extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetFrameOfReference(aFrameOfReference: StepBasic_ApplicationContext): void;

  FrameOfReference(): StepBasic_ApplicationContext;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ApplicationProtocolDefinition: declare class StepBasic_ApplicationProtocolDefinition extends Standard_Transient

  constructor

  Init(aStatus: TCollection_HAsciiString, aApplicationInterpretedModelSchemaName: TCollection_HAsciiString, aApplicationProtocolYear: number, aApplication: StepBasic_ApplicationContext): void;

  SetStatus(aStatus: TCollection_HAsciiString): void;

  Status(): TCollection_HAsciiString;

  SetApplicationInterpretedModelSchemaName(aApplicationInterpretedModelSchemaName: TCollection_HAsciiString): void;

  ApplicationInterpretedModelSchemaName(): TCollection_HAsciiString;

  SetApplicationProtocolYear(aApplicationProtocolYear: number): void;

  ApplicationProtocolYear(): number;

  SetApplication(aApplication: StepBasic_ApplicationContext): void;

  Application(): StepBasic_ApplicationContext;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_Approval: declare class StepBasic_Approval extends Standard_Transient

  constructor

  Init(aStatus: StepBasic_ApprovalStatus, aLevel: TCollection_HAsciiString): void;

  SetStatus(aStatus: StepBasic_ApprovalStatus): void;

  Status(): StepBasic_ApprovalStatus;

  SetLevel(aLevel: TCollection_HAsciiString): void;

  Level(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ApprovalAssignment: declare class StepBasic_ApprovalAssignment extends Standard_Transient

  constructor

  Init(aAssignedApproval: StepBasic_Approval): void;

  SetAssignedApproval(aAssignedApproval: StepBasic_Approval): void;

  AssignedApproval(): StepBasic_Approval;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ApprovalDateTime: declare class StepBasic_ApprovalDateTime extends Standard_Transient

  constructor

  Init(aDateTime: StepBasic_DateTimeSelect, aDatedApproval: StepBasic_Approval): void;

  SetDateTime(aDateTime: StepBasic_DateTimeSelect): void;

  DateTime(): StepBasic_DateTimeSelect;

  SetDatedApproval(aDatedApproval: StepBasic_Approval): void;

  DatedApproval(): StepBasic_Approval;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ApprovalPersonOrganization: declare class StepBasic_ApprovalPersonOrganization extends Standard_Transient

  constructor

  Init(aPersonOrganization: StepBasic_PersonOrganizationSelect, aAuthorizedApproval: StepBasic_Approval, aRole: StepBasic_ApprovalRole): void;

  SetPersonOrganization(aPersonOrganization: StepBasic_PersonOrganizationSelect): void;

  PersonOrganization(): StepBasic_PersonOrganizationSelect;

  SetAuthorizedApproval(aAuthorizedApproval: StepBasic_Approval): void;

  AuthorizedApproval(): StepBasic_Approval;

  SetRole(aRole: StepBasic_ApprovalRole): void;

  Role(): StepBasic_ApprovalRole;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ApprovalRelationship: declare class StepBasic_ApprovalRelationship extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelatingApproval: StepBasic_Approval, aRelatedApproval: StepBasic_Approval): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetDescription(aDescription: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetRelatingApproval(aRelatingApproval: StepBasic_Approval): void;

  RelatingApproval(): StepBasic_Approval;

  SetRelatedApproval(aRelatedApproval: StepBasic_Approval): void;

  RelatedApproval(): StepBasic_Approval;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ApprovalRole: declare class StepBasic_ApprovalRole extends Standard_Transient

  constructor

  Init(aRole: TCollection_HAsciiString): void;

  SetRole(aRole: TCollection_HAsciiString): void;

  Role(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ApprovalStatus: declare class StepBasic_ApprovalStatus extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_AreaUnit: declare class StepBasic_AreaUnit extends StepBasic_NamedUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_CalendarDate: declare class StepBasic_CalendarDate extends StepBasic_Date

  constructor

  Init(aYearComponent: number, aDayComponent: number, aMonthComponent: number): void;
  Init(aYearComponent: number): void;
  Init(aYearComponent: number, aDayComponent: number, aMonthComponent: number): void;
  Init(aYearComponent: number): void;

  SetDayComponent(aDayComponent: number): void;

  DayComponent(): number;

  SetMonthComponent(aMonthComponent: number): void;

  MonthComponent(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_Certification: declare class StepBasic_Certification extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, aKind: StepBasic_CertificationType): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Purpose(): TCollection_HAsciiString;

  SetPurpose(Purpose: TCollection_HAsciiString): void;

  Kind(): StepBasic_CertificationType;

  SetKind(Kind: StepBasic_CertificationType): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_CertificationAssignment: declare class StepBasic_CertificationAssignment extends Standard_Transient

  constructor

  Init(aAssignedCertification: StepBasic_Certification): void;

  AssignedCertification(): StepBasic_Certification;

  SetAssignedCertification(AssignedCertification: StepBasic_Certification): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_CertificationType: declare class StepBasic_CertificationType extends Standard_Transient

  constructor

  Init(aDescription: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_CharacterizedObject: declare class StepBasic_CharacterizedObject extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  HasDescription(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_Contract: declare class StepBasic_Contract extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, aKind: StepBasic_ContractType): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Purpose(): TCollection_HAsciiString;

  SetPurpose(Purpose: TCollection_HAsciiString): void;

  Kind(): StepBasic_ContractType;

  SetKind(Kind: StepBasic_ContractType): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ContractAssignment: declare class StepBasic_ContractAssignment extends Standard_Transient

  constructor

  Init(aAssignedContract: StepBasic_Contract): void;

  AssignedContract(): StepBasic_Contract;

  SetAssignedContract(AssignedContract: StepBasic_Contract): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ContractType: declare class StepBasic_ContractType extends Standard_Transient

  constructor

  Init(aDescription: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnit: declare class StepBasic_ConversionBasedUnit extends StepBasic_NamedUnit

  constructor

  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetConversionFactor(aConversionFactor: Standard_Transient): void;

  ConversionFactor(): Standard_Transient;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndAreaUnit: declare class StepBasic_ConversionBasedUnitAndAreaUnit extends StepBasic_ConversionBasedUnit

  constructor

  SetAreaUnit(anAreaUnit: StepBasic_AreaUnit): void;

  AreaUnit(): StepBasic_AreaUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndLengthUnit: declare class StepBasic_ConversionBasedUnitAndLengthUnit extends StepBasic_ConversionBasedUnit

  constructor

  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  SetLengthUnit(aLengthUnit: StepBasic_LengthUnit): void;

  LengthUnit(): StepBasic_LengthUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndMassUnit: declare class StepBasic_ConversionBasedUnitAndMassUnit extends StepBasic_ConversionBasedUnit

  constructor

  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  SetMassUnit(aMassUnit: StepBasic_MassUnit): void;

  MassUnit(): StepBasic_MassUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndPlaneAngleUnit: declare class StepBasic_ConversionBasedUnitAndPlaneAngleUnit extends StepBasic_ConversionBasedUnit

  constructor

  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  SetPlaneAngleUnit(aPlaneAngleUnit: StepBasic_PlaneAngleUnit): void;

  PlaneAngleUnit(): StepBasic_PlaneAngleUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndRatioUnit: declare class StepBasic_ConversionBasedUnitAndRatioUnit extends StepBasic_ConversionBasedUnit

  constructor

  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  SetRatioUnit(aRatioUnit: StepBasic_RatioUnit): void;

  RatioUnit(): StepBasic_RatioUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndSolidAngleUnit: declare class StepBasic_ConversionBasedUnitAndSolidAngleUnit extends StepBasic_ConversionBasedUnit

  constructor

  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  SetSolidAngleUnit(aSolidAngleUnit: StepBasic_SolidAngleUnit): void;

  SolidAngleUnit(): StepBasic_SolidAngleUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndTimeUnit: declare class StepBasic_ConversionBasedUnitAndTimeUnit extends StepBasic_ConversionBasedUnit

  constructor

  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  SetTimeUnit(aTimeUnit: StepBasic_TimeUnit): void;

  TimeUnit(): StepBasic_TimeUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
