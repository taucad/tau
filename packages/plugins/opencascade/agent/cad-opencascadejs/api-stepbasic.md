# libcascade — StepBasic

35 top-level symbols. Signatures are verbatim typescript.

StepBasic_Action: declare class StepBasic_Action extends Standard_Transient

  // StepBasic_Action.constructor (constructor)
  constructor();

  // StepBasic_Action.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aChosenMethod: StepBasic_ActionMethod): void;

  // StepBasic_Action.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_Action.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_Action.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_Action.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_Action.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_Action.ChosenMethod (method)
  ChosenMethod(): StepBasic_ActionMethod;

  // StepBasic_Action.SetChosenMethod (method)
  SetChosenMethod(ChosenMethod: StepBasic_ActionMethod): void;

  // StepBasic_Action.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Action.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Action.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Action.delete (method)
  delete(): void;

  // StepBasic_Action.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ActionAssignment: declare class StepBasic_ActionAssignment extends Standard_Transient

  // StepBasic_ActionAssignment.constructor (constructor)
  constructor();

  // StepBasic_ActionAssignment.Init (method)
  Init(aAssignedAction: StepBasic_Action): void;

  // StepBasic_ActionAssignment.AssignedAction (method)
  AssignedAction(): StepBasic_Action;

  // StepBasic_ActionAssignment.SetAssignedAction (method)
  SetAssignedAction(AssignedAction: StepBasic_Action): void;

  // StepBasic_ActionAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ActionAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ActionAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ActionAssignment.delete (method)
  delete(): void;

  // StepBasic_ActionAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ActionMethod: declare class StepBasic_ActionMethod extends Standard_Transient

  // StepBasic_ActionMethod.constructor (constructor)
  constructor();

  // StepBasic_ActionMethod.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aConsequence: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString): void;

  // StepBasic_ActionMethod.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ActionMethod.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_ActionMethod.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ActionMethod.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_ActionMethod.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_ActionMethod.Consequence (method)
  Consequence(): TCollection_HAsciiString;

  // StepBasic_ActionMethod.SetConsequence (method)
  SetConsequence(Consequence: TCollection_HAsciiString): void;

  // StepBasic_ActionMethod.Purpose (method)
  Purpose(): TCollection_HAsciiString;

  // StepBasic_ActionMethod.SetPurpose (method)
  SetPurpose(Purpose: TCollection_HAsciiString): void;

  // StepBasic_ActionMethod.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ActionMethod.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ActionMethod.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ActionMethod.delete (method)
  delete(): void;

  // StepBasic_ActionMethod.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ActionRequestAssignment: declare class StepBasic_ActionRequestAssignment extends Standard_Transient

  // StepBasic_ActionRequestAssignment.constructor (constructor)
  constructor();

  // StepBasic_ActionRequestAssignment.Init (method)
  Init(aAssignedActionRequest: StepBasic_VersionedActionRequest): void;

  // StepBasic_ActionRequestAssignment.AssignedActionRequest (method)
  AssignedActionRequest(): StepBasic_VersionedActionRequest;

  // StepBasic_ActionRequestAssignment.SetAssignedActionRequest (method)
  SetAssignedActionRequest(AssignedActionRequest: StepBasic_VersionedActionRequest): void;

  // StepBasic_ActionRequestAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ActionRequestAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ActionRequestAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ActionRequestAssignment.delete (method)
  delete(): void;

  // StepBasic_ActionRequestAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ActionRequestSolution: declare class StepBasic_ActionRequestSolution extends Standard_Transient

  // StepBasic_ActionRequestSolution.constructor (constructor)
  constructor();

  // StepBasic_ActionRequestSolution.Init (method)
  Init(aMethod: StepBasic_ActionMethod, aRequest: StepBasic_VersionedActionRequest): void;

  // StepBasic_ActionRequestSolution.Method (method)
  Method(): StepBasic_ActionMethod;

  // StepBasic_ActionRequestSolution.SetMethod (method)
  SetMethod(Method: StepBasic_ActionMethod): void;

  // StepBasic_ActionRequestSolution.Request (method)
  Request(): StepBasic_VersionedActionRequest;

  // StepBasic_ActionRequestSolution.SetRequest (method)
  SetRequest(Request: StepBasic_VersionedActionRequest): void;

  // StepBasic_ActionRequestSolution.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ActionRequestSolution.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ActionRequestSolution.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ActionRequestSolution.delete (method)
  delete(): void;

  // StepBasic_ActionRequestSolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Address: declare class StepBasic_Address extends Standard_Transient

  // StepBasic_Address.constructor (constructor)
  constructor();

  // StepBasic_Address.Init (method)
  Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString): void;

  // StepBasic_Address.SetInternalLocation (method)
  SetInternalLocation(aInternalLocation: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetInternalLocation (method)
  UnSetInternalLocation(): void;

  // StepBasic_Address.InternalLocation (method)
  InternalLocation(): TCollection_HAsciiString;

  // StepBasic_Address.HasInternalLocation (method)
  HasInternalLocation(): boolean;

  // StepBasic_Address.SetStreetNumber (method)
  SetStreetNumber(aStreetNumber: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetStreetNumber (method)
  UnSetStreetNumber(): void;

  // StepBasic_Address.StreetNumber (method)
  StreetNumber(): TCollection_HAsciiString;

  // StepBasic_Address.HasStreetNumber (method)
  HasStreetNumber(): boolean;

  // StepBasic_Address.SetStreet (method)
  SetStreet(aStreet: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetStreet (method)
  UnSetStreet(): void;

  // StepBasic_Address.Street (method)
  Street(): TCollection_HAsciiString;

  // StepBasic_Address.HasStreet (method)
  HasStreet(): boolean;

  // StepBasic_Address.SetPostalBox (method)
  SetPostalBox(aPostalBox: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetPostalBox (method)
  UnSetPostalBox(): void;

  // StepBasic_Address.PostalBox (method)
  PostalBox(): TCollection_HAsciiString;

  // StepBasic_Address.HasPostalBox (method)
  HasPostalBox(): boolean;

  // StepBasic_Address.SetTown (method)
  SetTown(aTown: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetTown (method)
  UnSetTown(): void;

  // StepBasic_Address.Town (method)
  Town(): TCollection_HAsciiString;

  // StepBasic_Address.HasTown (method)
  HasTown(): boolean;

  // StepBasic_Address.SetRegion (method)
  SetRegion(aRegion: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetRegion (method)
  UnSetRegion(): void;

  // StepBasic_Address.Region (method)
  Region(): TCollection_HAsciiString;

  // StepBasic_Address.HasRegion (method)
  HasRegion(): boolean;

  // StepBasic_Address.SetPostalCode (method)
  SetPostalCode(aPostalCode: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetPostalCode (method)
  UnSetPostalCode(): void;

  // StepBasic_Address.PostalCode (method)
  PostalCode(): TCollection_HAsciiString;

  // StepBasic_Address.HasPostalCode (method)
  HasPostalCode(): boolean;

  // StepBasic_Address.SetCountry (method)
  SetCountry(aCountry: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetCountry (method)
  UnSetCountry(): void;

  // StepBasic_Address.Country (method)
  Country(): TCollection_HAsciiString;

  // StepBasic_Address.HasCountry (method)
  HasCountry(): boolean;

  // StepBasic_Address.SetFacsimileNumber (method)
  SetFacsimileNumber(aFacsimileNumber: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetFacsimileNumber (method)
  UnSetFacsimileNumber(): void;

  // StepBasic_Address.FacsimileNumber (method)
  FacsimileNumber(): TCollection_HAsciiString;

  // StepBasic_Address.HasFacsimileNumber (method)
  HasFacsimileNumber(): boolean;

  // StepBasic_Address.SetTelephoneNumber (method)
  SetTelephoneNumber(aTelephoneNumber: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetTelephoneNumber (method)
  UnSetTelephoneNumber(): void;

  // StepBasic_Address.TelephoneNumber (method)
  TelephoneNumber(): TCollection_HAsciiString;

  // StepBasic_Address.HasTelephoneNumber (method)
  HasTelephoneNumber(): boolean;

  // StepBasic_Address.SetElectronicMailAddress (method)
  SetElectronicMailAddress(aElectronicMailAddress: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetElectronicMailAddress (method)
  UnSetElectronicMailAddress(): void;

  // StepBasic_Address.ElectronicMailAddress (method)
  ElectronicMailAddress(): TCollection_HAsciiString;

  // StepBasic_Address.HasElectronicMailAddress (method)
  HasElectronicMailAddress(): boolean;

  // StepBasic_Address.SetTelexNumber (method)
  SetTelexNumber(aTelexNumber: TCollection_HAsciiString): void;

  // StepBasic_Address.UnSetTelexNumber (method)
  UnSetTelexNumber(): void;

  // StepBasic_Address.TelexNumber (method)
  TelexNumber(): TCollection_HAsciiString;

  // StepBasic_Address.HasTelexNumber (method)
  HasTelexNumber(): boolean;

  // StepBasic_Address.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Address.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Address.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Address.delete (method)
  delete(): void;

  // StepBasic_Address.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_AheadOrBehind: typeof StepBasic_AheadOrBehind[keyof typeof StepBasic_AheadOrBehind]

  readonly StepBasic_aobAhead: 'StepBasic_aobAhead'

  readonly StepBasic_aobExact: 'StepBasic_aobExact'

  readonly StepBasic_aobBehind: 'StepBasic_aobBehind'

StepBasic_ApplicationContext: declare class StepBasic_ApplicationContext extends Standard_Transient

  // StepBasic_ApplicationContext.constructor (constructor)
  constructor();

  // StepBasic_ApplicationContext.Init (method)
  Init(aApplication: TCollection_HAsciiString): void;

  // StepBasic_ApplicationContext.SetApplication (method)
  SetApplication(aApplication: TCollection_HAsciiString): void;

  // StepBasic_ApplicationContext.Application (method)
  Application(): TCollection_HAsciiString;

  // StepBasic_ApplicationContext.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApplicationContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApplicationContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApplicationContext.delete (method)
  delete(): void;

  // StepBasic_ApplicationContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ApplicationContextElement: declare class StepBasic_ApplicationContextElement extends Standard_Transient

  // StepBasic_ApplicationContextElement.constructor (constructor)
  constructor();

  // StepBasic_ApplicationContextElement.Init (method)
  Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

  // StepBasic_ApplicationContextElement.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_ApplicationContextElement.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ApplicationContextElement.SetFrameOfReference (method)
  SetFrameOfReference(aFrameOfReference: StepBasic_ApplicationContext): void;

  // StepBasic_ApplicationContextElement.FrameOfReference (method)
  FrameOfReference(): StepBasic_ApplicationContext;

  // StepBasic_ApplicationContextElement.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApplicationContextElement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApplicationContextElement.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApplicationContextElement.delete (method)
  delete(): void;

  // StepBasic_ApplicationContextElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ApplicationProtocolDefinition: declare class StepBasic_ApplicationProtocolDefinition extends Standard_Transient

  // StepBasic_ApplicationProtocolDefinition.constructor (constructor)
  constructor();

  // StepBasic_ApplicationProtocolDefinition.Init (method)
  Init(aStatus: TCollection_HAsciiString, aApplicationInterpretedModelSchemaName: TCollection_HAsciiString, aApplicationProtocolYear: number, aApplication: StepBasic_ApplicationContext): void;

  // StepBasic_ApplicationProtocolDefinition.SetStatus (method)
  SetStatus(aStatus: TCollection_HAsciiString): void;

  // StepBasic_ApplicationProtocolDefinition.Status (method)
  Status(): TCollection_HAsciiString;

  // StepBasic_ApplicationProtocolDefinition.SetApplicationInterpretedModelSchemaName (method)
  SetApplicationInterpretedModelSchemaName(aApplicationInterpretedModelSchemaName: TCollection_HAsciiString): void;

  // StepBasic_ApplicationProtocolDefinition.ApplicationInterpretedModelSchemaName (method)
  ApplicationInterpretedModelSchemaName(): TCollection_HAsciiString;

  // StepBasic_ApplicationProtocolDefinition.SetApplicationProtocolYear (method)
  SetApplicationProtocolYear(aApplicationProtocolYear: number): void;

  // StepBasic_ApplicationProtocolDefinition.ApplicationProtocolYear (method)
  ApplicationProtocolYear(): number;

  // StepBasic_ApplicationProtocolDefinition.SetApplication (method)
  SetApplication(aApplication: StepBasic_ApplicationContext): void;

  // StepBasic_ApplicationProtocolDefinition.Application (method)
  Application(): StepBasic_ApplicationContext;

  // StepBasic_ApplicationProtocolDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApplicationProtocolDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApplicationProtocolDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApplicationProtocolDefinition.delete (method)
  delete(): void;

  // StepBasic_ApplicationProtocolDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Approval: declare class StepBasic_Approval extends Standard_Transient

  // StepBasic_Approval.constructor (constructor)
  constructor();

  // StepBasic_Approval.Init (method)
  Init(aStatus: StepBasic_ApprovalStatus, aLevel: TCollection_HAsciiString): void;

  // StepBasic_Approval.SetStatus (method)
  SetStatus(aStatus: StepBasic_ApprovalStatus): void;

  // StepBasic_Approval.Status (method)
  Status(): StepBasic_ApprovalStatus;

  // StepBasic_Approval.SetLevel (method)
  SetLevel(aLevel: TCollection_HAsciiString): void;

  // StepBasic_Approval.Level (method)
  Level(): TCollection_HAsciiString;

  // StepBasic_Approval.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Approval.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Approval.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Approval.delete (method)
  delete(): void;

  // StepBasic_Approval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ApprovalAssignment: declare class StepBasic_ApprovalAssignment extends Standard_Transient

  // StepBasic_ApprovalAssignment.constructor (constructor)
  constructor();

  // StepBasic_ApprovalAssignment.Init (method)
  Init(aAssignedApproval: StepBasic_Approval): void;

  // StepBasic_ApprovalAssignment.SetAssignedApproval (method)
  SetAssignedApproval(aAssignedApproval: StepBasic_Approval): void;

  // StepBasic_ApprovalAssignment.AssignedApproval (method)
  AssignedApproval(): StepBasic_Approval;

  // StepBasic_ApprovalAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApprovalAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApprovalAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApprovalAssignment.delete (method)
  delete(): void;

  // StepBasic_ApprovalAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ApprovalDateTime: declare class StepBasic_ApprovalDateTime extends Standard_Transient

  // StepBasic_ApprovalDateTime.constructor (constructor)
  constructor();

  // StepBasic_ApprovalDateTime.Init (method)
  Init(aDateTime: StepBasic_DateTimeSelect, aDatedApproval: StepBasic_Approval): void;

  // StepBasic_ApprovalDateTime.SetDateTime (method)
  SetDateTime(aDateTime: StepBasic_DateTimeSelect): void;

  // StepBasic_ApprovalDateTime.DateTime (method)
  DateTime(): StepBasic_DateTimeSelect;

  // StepBasic_ApprovalDateTime.SetDatedApproval (method)
  SetDatedApproval(aDatedApproval: StepBasic_Approval): void;

  // StepBasic_ApprovalDateTime.DatedApproval (method)
  DatedApproval(): StepBasic_Approval;

  // StepBasic_ApprovalDateTime.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApprovalDateTime.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApprovalDateTime.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApprovalDateTime.delete (method)
  delete(): void;

  // StepBasic_ApprovalDateTime.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ApprovalPersonOrganization: declare class StepBasic_ApprovalPersonOrganization extends Standard_Transient

  // StepBasic_ApprovalPersonOrganization.constructor (constructor)
  constructor();

  // StepBasic_ApprovalPersonOrganization.Init (method)
  Init(aPersonOrganization: StepBasic_PersonOrganizationSelect, aAuthorizedApproval: StepBasic_Approval, aRole: StepBasic_ApprovalRole): void;

  // StepBasic_ApprovalPersonOrganization.SetPersonOrganization (method)
  SetPersonOrganization(aPersonOrganization: StepBasic_PersonOrganizationSelect): void;

  // StepBasic_ApprovalPersonOrganization.PersonOrganization (method)
  PersonOrganization(): StepBasic_PersonOrganizationSelect;

  // StepBasic_ApprovalPersonOrganization.SetAuthorizedApproval (method)
  SetAuthorizedApproval(aAuthorizedApproval: StepBasic_Approval): void;

  // StepBasic_ApprovalPersonOrganization.AuthorizedApproval (method)
  AuthorizedApproval(): StepBasic_Approval;

  // StepBasic_ApprovalPersonOrganization.SetRole (method)
  SetRole(aRole: StepBasic_ApprovalRole): void;

  // StepBasic_ApprovalPersonOrganization.Role (method)
  Role(): StepBasic_ApprovalRole;

  // StepBasic_ApprovalPersonOrganization.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApprovalPersonOrganization.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApprovalPersonOrganization.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApprovalPersonOrganization.delete (method)
  delete(): void;

  // StepBasic_ApprovalPersonOrganization.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ApprovalRelationship: declare class StepBasic_ApprovalRelationship extends Standard_Transient

  // StepBasic_ApprovalRelationship.constructor (constructor)
  constructor();

  // StepBasic_ApprovalRelationship.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelatingApproval: StepBasic_Approval, aRelatedApproval: StepBasic_Approval): void;

  // StepBasic_ApprovalRelationship.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_ApprovalRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ApprovalRelationship.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_ApprovalRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ApprovalRelationship.SetRelatingApproval (method)
  SetRelatingApproval(aRelatingApproval: StepBasic_Approval): void;

  // StepBasic_ApprovalRelationship.RelatingApproval (method)
  RelatingApproval(): StepBasic_Approval;

  // StepBasic_ApprovalRelationship.SetRelatedApproval (method)
  SetRelatedApproval(aRelatedApproval: StepBasic_Approval): void;

  // StepBasic_ApprovalRelationship.RelatedApproval (method)
  RelatedApproval(): StepBasic_Approval;

  // StepBasic_ApprovalRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApprovalRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApprovalRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApprovalRelationship.delete (method)
  delete(): void;

  // StepBasic_ApprovalRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ApprovalRole: declare class StepBasic_ApprovalRole extends Standard_Transient

  // StepBasic_ApprovalRole.constructor (constructor)
  constructor();

  // StepBasic_ApprovalRole.Init (method)
  Init(aRole: TCollection_HAsciiString): void;

  // StepBasic_ApprovalRole.SetRole (method)
  SetRole(aRole: TCollection_HAsciiString): void;

  // StepBasic_ApprovalRole.Role (method)
  Role(): TCollection_HAsciiString;

  // StepBasic_ApprovalRole.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApprovalRole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApprovalRole.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApprovalRole.delete (method)
  delete(): void;

  // StepBasic_ApprovalRole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ApprovalStatus: declare class StepBasic_ApprovalStatus extends Standard_Transient

  // StepBasic_ApprovalStatus.constructor (constructor)
  constructor();

  // StepBasic_ApprovalStatus.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepBasic_ApprovalStatus.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_ApprovalStatus.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ApprovalStatus.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ApprovalStatus.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ApprovalStatus.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ApprovalStatus.delete (method)
  delete(): void;

  // StepBasic_ApprovalStatus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_AreaUnit: declare class StepBasic_AreaUnit extends StepBasic_NamedUnit

  // StepBasic_AreaUnit.constructor (constructor)
  constructor();

  // StepBasic_AreaUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_AreaUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_AreaUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_AreaUnit.delete (method)
  delete(): void;

  // StepBasic_AreaUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_CalendarDate: declare class StepBasic_CalendarDate extends StepBasic_Date

  // StepBasic_CalendarDate.constructor (constructor)
  constructor();

  // StepBasic_CalendarDate.Init (method)
  Init(aYearComponent: number, aDayComponent: number, aMonthComponent: number): void;
  Init(aYearComponent: number): void;

  // StepBasic_CalendarDate.SetDayComponent (method)
  SetDayComponent(aDayComponent: number): void;

  // StepBasic_CalendarDate.DayComponent (method)
  DayComponent(): number;

  // StepBasic_CalendarDate.SetMonthComponent (method)
  SetMonthComponent(aMonthComponent: number): void;

  // StepBasic_CalendarDate.MonthComponent (method)
  MonthComponent(): number;

  // StepBasic_CalendarDate.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_CalendarDate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_CalendarDate.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_CalendarDate.delete (method)
  delete(): void;

  // StepBasic_CalendarDate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Certification: declare class StepBasic_Certification extends Standard_Transient

  // StepBasic_Certification.constructor (constructor)
  constructor();

  // StepBasic_Certification.Init (method)
  Init(aName: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, aKind: StepBasic_CertificationType): void;

  // StepBasic_Certification.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_Certification.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_Certification.Purpose (method)
  Purpose(): TCollection_HAsciiString;

  // StepBasic_Certification.SetPurpose (method)
  SetPurpose(Purpose: TCollection_HAsciiString): void;

  // StepBasic_Certification.Kind (method)
  Kind(): StepBasic_CertificationType;

  // StepBasic_Certification.SetKind (method)
  SetKind(Kind: StepBasic_CertificationType): void;

  // StepBasic_Certification.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Certification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Certification.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Certification.delete (method)
  delete(): void;

  // StepBasic_Certification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_CertificationAssignment: declare class StepBasic_CertificationAssignment extends Standard_Transient

  // StepBasic_CertificationAssignment.constructor (constructor)
  constructor();

  // StepBasic_CertificationAssignment.Init (method)
  Init(aAssignedCertification: StepBasic_Certification): void;

  // StepBasic_CertificationAssignment.AssignedCertification (method)
  AssignedCertification(): StepBasic_Certification;

  // StepBasic_CertificationAssignment.SetAssignedCertification (method)
  SetAssignedCertification(AssignedCertification: StepBasic_Certification): void;

  // StepBasic_CertificationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_CertificationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_CertificationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_CertificationAssignment.delete (method)
  delete(): void;

  // StepBasic_CertificationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_CertificationType: declare class StepBasic_CertificationType extends Standard_Transient

  // StepBasic_CertificationType.constructor (constructor)
  constructor();

  // StepBasic_CertificationType.Init (method)
  Init(aDescription: TCollection_HAsciiString): void;

  // StepBasic_CertificationType.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_CertificationType.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_CertificationType.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_CertificationType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_CertificationType.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_CertificationType.delete (method)
  delete(): void;

  // StepBasic_CertificationType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_CharacterizedObject: declare class StepBasic_CharacterizedObject extends Standard_Transient

  // StepBasic_CharacterizedObject.constructor (constructor)
  constructor();

  // StepBasic_CharacterizedObject.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepBasic_CharacterizedObject.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_CharacterizedObject.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_CharacterizedObject.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_CharacterizedObject.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_CharacterizedObject.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_CharacterizedObject.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_CharacterizedObject.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_CharacterizedObject.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_CharacterizedObject.delete (method)
  delete(): void;

  // StepBasic_CharacterizedObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Contract: declare class StepBasic_Contract extends Standard_Transient

  // StepBasic_Contract.constructor (constructor)
  constructor();

  // StepBasic_Contract.Init (method)
  Init(aName: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, aKind: StepBasic_ContractType): void;

  // StepBasic_Contract.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_Contract.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_Contract.Purpose (method)
  Purpose(): TCollection_HAsciiString;

  // StepBasic_Contract.SetPurpose (method)
  SetPurpose(Purpose: TCollection_HAsciiString): void;

  // StepBasic_Contract.Kind (method)
  Kind(): StepBasic_ContractType;

  // StepBasic_Contract.SetKind (method)
  SetKind(Kind: StepBasic_ContractType): void;

  // StepBasic_Contract.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Contract.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Contract.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Contract.delete (method)
  delete(): void;

  // StepBasic_Contract.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ContractAssignment: declare class StepBasic_ContractAssignment extends Standard_Transient

  // StepBasic_ContractAssignment.constructor (constructor)
  constructor();

  // StepBasic_ContractAssignment.Init (method)
  Init(aAssignedContract: StepBasic_Contract): void;

  // StepBasic_ContractAssignment.AssignedContract (method)
  AssignedContract(): StepBasic_Contract;

  // StepBasic_ContractAssignment.SetAssignedContract (method)
  SetAssignedContract(AssignedContract: StepBasic_Contract): void;

  // StepBasic_ContractAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ContractAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ContractAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ContractAssignment.delete (method)
  delete(): void;

  // StepBasic_ContractAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ContractType: declare class StepBasic_ContractType extends Standard_Transient

  // StepBasic_ContractType.constructor (constructor)
  constructor();

  // StepBasic_ContractType.Init (method)
  Init(aDescription: TCollection_HAsciiString): void;

  // StepBasic_ContractType.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ContractType.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_ContractType.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ContractType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ContractType.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ContractType.delete (method)
  delete(): void;

  // StepBasic_ContractType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnit: declare class StepBasic_ConversionBasedUnit extends StepBasic_NamedUnit

  // StepBasic_ConversionBasedUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnit.Init (method)
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_ConversionBasedUnit.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_ConversionBasedUnit.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ConversionBasedUnit.SetConversionFactor (method)
  SetConversionFactor(aConversionFactor: Standard_Transient): void;

  // StepBasic_ConversionBasedUnit.ConversionFactor (method)
  ConversionFactor(): Standard_Transient;

  // StepBasic_ConversionBasedUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndAreaUnit: declare class StepBasic_ConversionBasedUnitAndAreaUnit extends StepBasic_ConversionBasedUnit

  // StepBasic_ConversionBasedUnitAndAreaUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnitAndAreaUnit.SetAreaUnit (method)
  SetAreaUnit(anAreaUnit: StepBasic_AreaUnit): void;

  // StepBasic_ConversionBasedUnitAndAreaUnit.AreaUnit (method)
  AreaUnit(): StepBasic_AreaUnit;

  // StepBasic_ConversionBasedUnitAndAreaUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnitAndAreaUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndAreaUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndAreaUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnitAndAreaUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndLengthUnit: declare class StepBasic_ConversionBasedUnitAndLengthUnit extends StepBasic_ConversionBasedUnit

  // StepBasic_ConversionBasedUnitAndLengthUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnitAndLengthUnit.Init (method)
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_ConversionBasedUnitAndLengthUnit.SetLengthUnit (method)
  SetLengthUnit(aLengthUnit: StepBasic_LengthUnit): void;

  // StepBasic_ConversionBasedUnitAndLengthUnit.LengthUnit (method)
  LengthUnit(): StepBasic_LengthUnit;

  // StepBasic_ConversionBasedUnitAndLengthUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnitAndLengthUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndLengthUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndLengthUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnitAndLengthUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndMassUnit: declare class StepBasic_ConversionBasedUnitAndMassUnit extends StepBasic_ConversionBasedUnit

  // StepBasic_ConversionBasedUnitAndMassUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnitAndMassUnit.Init (method)
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_ConversionBasedUnitAndMassUnit.SetMassUnit (method)
  SetMassUnit(aMassUnit: StepBasic_MassUnit): void;

  // StepBasic_ConversionBasedUnitAndMassUnit.MassUnit (method)
  MassUnit(): StepBasic_MassUnit;

  // StepBasic_ConversionBasedUnitAndMassUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnitAndMassUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndMassUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndMassUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnitAndMassUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndPlaneAngleUnit: declare class StepBasic_ConversionBasedUnitAndPlaneAngleUnit extends StepBasic_ConversionBasedUnit

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.Init (method)
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.SetPlaneAngleUnit (method)
  SetPlaneAngleUnit(aPlaneAngleUnit: StepBasic_PlaneAngleUnit): void;

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.PlaneAngleUnit (method)
  PlaneAngleUnit(): StepBasic_PlaneAngleUnit;

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnitAndPlaneAngleUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndRatioUnit: declare class StepBasic_ConversionBasedUnitAndRatioUnit extends StepBasic_ConversionBasedUnit

  // StepBasic_ConversionBasedUnitAndRatioUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnitAndRatioUnit.Init (method)
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_ConversionBasedUnitAndRatioUnit.SetRatioUnit (method)
  SetRatioUnit(aRatioUnit: StepBasic_RatioUnit): void;

  // StepBasic_ConversionBasedUnitAndRatioUnit.RatioUnit (method)
  RatioUnit(): StepBasic_RatioUnit;

  // StepBasic_ConversionBasedUnitAndRatioUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnitAndRatioUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndRatioUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndRatioUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnitAndRatioUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndSolidAngleUnit: declare class StepBasic_ConversionBasedUnitAndSolidAngleUnit extends StepBasic_ConversionBasedUnit

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.Init (method)
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.SetSolidAngleUnit (method)
  SetSolidAngleUnit(aSolidAngleUnit: StepBasic_SolidAngleUnit): void;

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.SolidAngleUnit (method)
  SolidAngleUnit(): StepBasic_SolidAngleUnit;

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnitAndSolidAngleUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndTimeUnit: declare class StepBasic_ConversionBasedUnitAndTimeUnit extends StepBasic_ConversionBasedUnit

  // StepBasic_ConversionBasedUnitAndTimeUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnitAndTimeUnit.Init (method)
  Init(aDimensions: StepBasic_DimensionalExponents, aName: TCollection_HAsciiString, aConversionFactor: Standard_Transient): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_ConversionBasedUnitAndTimeUnit.SetTimeUnit (method)
  SetTimeUnit(aTimeUnit: StepBasic_TimeUnit): void;

  // StepBasic_ConversionBasedUnitAndTimeUnit.TimeUnit (method)
  TimeUnit(): StepBasic_TimeUnit;

  // StepBasic_ConversionBasedUnitAndTimeUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnitAndTimeUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndTimeUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndTimeUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnitAndTimeUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ConversionBasedUnitAndVolumeUnit: declare class StepBasic_ConversionBasedUnitAndVolumeUnit extends StepBasic_ConversionBasedUnit

  // StepBasic_ConversionBasedUnitAndVolumeUnit.constructor (constructor)
  constructor();

  // StepBasic_ConversionBasedUnitAndVolumeUnit.SetVolumeUnit (method)
  SetVolumeUnit(aVolumeUnit: StepBasic_VolumeUnit): void;

  // StepBasic_ConversionBasedUnitAndVolumeUnit.VolumeUnit (method)
  VolumeUnit(): StepBasic_VolumeUnit;

  // StepBasic_ConversionBasedUnitAndVolumeUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ConversionBasedUnitAndVolumeUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndVolumeUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ConversionBasedUnitAndVolumeUnit.delete (method)
  delete(): void;

  // StepBasic_ConversionBasedUnitAndVolumeUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
