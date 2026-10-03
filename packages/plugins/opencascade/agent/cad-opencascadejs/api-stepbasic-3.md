# libcascade — StepBasic (3)

33 top-level symbols. Signatures are verbatim typescript.

StepBasic_LengthUnit: declare class StepBasic_LengthUnit extends StepBasic_NamedUnit

  // StepBasic_LengthUnit.constructor (constructor)
  constructor();

  // StepBasic_LengthUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_LengthUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_LengthUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_LengthUnit.delete (method)
  delete(): void;

  // StepBasic_LengthUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_LocalTime: declare class StepBasic_LocalTime extends Standard_Transient

  // StepBasic_LocalTime.constructor (constructor)
  constructor();

  // StepBasic_LocalTime.Init (method)
  Init(aHourComponent: number, hasAminuteComponent: boolean, aMinuteComponent: number, hasAsecondComponent: boolean, aSecondComponent: number, aZone: StepBasic_CoordinatedUniversalTimeOffset): void;

  // StepBasic_LocalTime.SetHourComponent (method)
  SetHourComponent(aHourComponent: number): void;

  // StepBasic_LocalTime.HourComponent (method)
  HourComponent(): number;

  // StepBasic_LocalTime.SetMinuteComponent (method)
  SetMinuteComponent(aMinuteComponent: number): void;

  // StepBasic_LocalTime.UnSetMinuteComponent (method)
  UnSetMinuteComponent(): void;

  // StepBasic_LocalTime.MinuteComponent (method)
  MinuteComponent(): number;

  // StepBasic_LocalTime.HasMinuteComponent (method)
  HasMinuteComponent(): boolean;

  // StepBasic_LocalTime.SetSecondComponent (method)
  SetSecondComponent(aSecondComponent: number): void;

  // StepBasic_LocalTime.UnSetSecondComponent (method)
  UnSetSecondComponent(): void;

  // StepBasic_LocalTime.SecondComponent (method)
  SecondComponent(): number;

  // StepBasic_LocalTime.HasSecondComponent (method)
  HasSecondComponent(): boolean;

  // StepBasic_LocalTime.SetZone (method)
  SetZone(aZone: StepBasic_CoordinatedUniversalTimeOffset): void;

  // StepBasic_LocalTime.Zone (method)
  Zone(): StepBasic_CoordinatedUniversalTimeOffset;

  // StepBasic_LocalTime.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_LocalTime.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_LocalTime.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_LocalTime.delete (method)
  delete(): void;

  // StepBasic_LocalTime.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_MassMeasureWithUnit: declare class StepBasic_MassMeasureWithUnit extends StepBasic_MeasureWithUnit

  // StepBasic_MassMeasureWithUnit.constructor (constructor)
  constructor();

  // StepBasic_MassMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_MassMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_MassMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_MassMeasureWithUnit.delete (method)
  delete(): void;

  // StepBasic_MassMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_MassUnit: declare class StepBasic_MassUnit extends StepBasic_NamedUnit

  // StepBasic_MassUnit.constructor (constructor)
  constructor();

  // StepBasic_MassUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_MassUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_MassUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_MassUnit.delete (method)
  delete(): void;

  // StepBasic_MassUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_MeasureValueMember: declare class StepBasic_MeasureValueMember extends StepData_SelectReal

  // StepBasic_MeasureValueMember.constructor (constructor)
  constructor();

  // StepBasic_MeasureValueMember.HasName (method)
  HasName(): boolean;

  // StepBasic_MeasureValueMember.Name (method)
  Name(): string;

  // StepBasic_MeasureValueMember.SetName (method)
  SetName(name: string): boolean;

  // StepBasic_MeasureValueMember.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_MeasureValueMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_MeasureValueMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_MeasureValueMember.delete (method)
  delete(): void;

  // StepBasic_MeasureValueMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_MeasureWithUnit: declare class StepBasic_MeasureWithUnit extends Standard_Transient

  // StepBasic_MeasureWithUnit.constructor (constructor)
  constructor();

  // StepBasic_MeasureWithUnit.Init (method)
  Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;

  // StepBasic_MeasureWithUnit.SetValueComponent (method)
  SetValueComponent(aValueComponent: number): void;

  // StepBasic_MeasureWithUnit.ValueComponent (method)
  ValueComponent(): number;

  // StepBasic_MeasureWithUnit.ValueComponentMember (method)
  ValueComponentMember(): StepBasic_MeasureValueMember;

  // StepBasic_MeasureWithUnit.SetValueComponentMember (method)
  SetValueComponentMember(val: StepBasic_MeasureValueMember): void;

  // StepBasic_MeasureWithUnit.SetUnitComponent (method)
  SetUnitComponent(aUnitComponent: StepBasic_Unit): void;

  // StepBasic_MeasureWithUnit.UnitComponent (method)
  UnitComponent(): StepBasic_Unit;

  // StepBasic_MeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_MeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_MeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_MeasureWithUnit.delete (method)
  delete(): void;

  // StepBasic_MeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_MechanicalContext: declare class StepBasic_MechanicalContext extends StepBasic_ProductContext

  // StepBasic_MechanicalContext.constructor (constructor)
  constructor();

  // StepBasic_MechanicalContext.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_MechanicalContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_MechanicalContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_MechanicalContext.delete (method)
  delete(): void;

  // StepBasic_MechanicalContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_NameAssignment: declare class StepBasic_NameAssignment extends Standard_Transient

  // StepBasic_NameAssignment.constructor (constructor)
  constructor();

  // StepBasic_NameAssignment.Init (method)
  Init(aAssignedName: TCollection_HAsciiString): void;

  // StepBasic_NameAssignment.AssignedName (method)
  AssignedName(): TCollection_HAsciiString;

  // StepBasic_NameAssignment.SetAssignedName (method)
  SetAssignedName(AssignedName: TCollection_HAsciiString): void;

  // StepBasic_NameAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_NameAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_NameAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_NameAssignment.delete (method)
  delete(): void;

  // StepBasic_NameAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_NamedUnit: declare class StepBasic_NamedUnit extends Standard_Transient

  // StepBasic_NamedUnit.constructor (constructor)
  constructor();

  // StepBasic_NamedUnit.Init (method)
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_NamedUnit.SetDimensions (method)
  SetDimensions(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_NamedUnit.Dimensions (method)
  Dimensions(): StepBasic_DimensionalExponents;

  // StepBasic_NamedUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_NamedUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_NamedUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_NamedUnit.delete (method)
  delete(): void;

  // StepBasic_NamedUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ObjectRole: declare class StepBasic_ObjectRole extends Standard_Transient

  // StepBasic_ObjectRole.constructor (constructor)
  constructor();

  // StepBasic_ObjectRole.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepBasic_ObjectRole.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ObjectRole.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_ObjectRole.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ObjectRole.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_ObjectRole.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_ObjectRole.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ObjectRole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ObjectRole.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ObjectRole.delete (method)
  delete(): void;

  // StepBasic_ObjectRole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_OrdinalDate: declare class StepBasic_OrdinalDate extends StepBasic_Date

  // StepBasic_OrdinalDate.constructor (constructor)
  constructor();

  // StepBasic_OrdinalDate.Init (method)
  Init(aYearComponent: number, aDayComponent: number): void;
  Init(aYearComponent: number): void;

  // StepBasic_OrdinalDate.SetDayComponent (method)
  SetDayComponent(aDayComponent: number): void;

  // StepBasic_OrdinalDate.DayComponent (method)
  DayComponent(): number;

  // StepBasic_OrdinalDate.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_OrdinalDate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_OrdinalDate.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_OrdinalDate.delete (method)
  delete(): void;

  // StepBasic_OrdinalDate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Organization: declare class StepBasic_Organization extends Standard_Transient

  // StepBasic_Organization.constructor (constructor)
  constructor();

  // StepBasic_Organization.Init (method)
  Init(hasAid: boolean, aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;

  // StepBasic_Organization.SetId (method)
  SetId(aId: TCollection_HAsciiString): void;

  // StepBasic_Organization.UnSetId (method)
  UnSetId(): void;

  // StepBasic_Organization.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_Organization.HasId (method)
  HasId(): boolean;

  // StepBasic_Organization.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_Organization.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_Organization.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_Organization.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_Organization.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Organization.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Organization.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Organization.delete (method)
  delete(): void;

  // StepBasic_Organization.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_OrganizationAssignment: declare class StepBasic_OrganizationAssignment extends Standard_Transient

  // StepBasic_OrganizationAssignment.constructor (constructor)
  constructor();

  // StepBasic_OrganizationAssignment.Init (method)
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole): void;

  // StepBasic_OrganizationAssignment.SetAssignedOrganization (method)
  SetAssignedOrganization(aAssignedOrganization: StepBasic_Organization): void;

  // StepBasic_OrganizationAssignment.AssignedOrganization (method)
  AssignedOrganization(): StepBasic_Organization;

  // StepBasic_OrganizationAssignment.SetRole (method)
  SetRole(aRole: StepBasic_OrganizationRole): void;

  // StepBasic_OrganizationAssignment.Role (method)
  Role(): StepBasic_OrganizationRole;

  // StepBasic_OrganizationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_OrganizationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_OrganizationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_OrganizationAssignment.delete (method)
  delete(): void;

  // StepBasic_OrganizationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_OrganizationRole: declare class StepBasic_OrganizationRole extends Standard_Transient

  // StepBasic_OrganizationRole.constructor (constructor)
  constructor();

  // StepBasic_OrganizationRole.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepBasic_OrganizationRole.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_OrganizationRole.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_OrganizationRole.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_OrganizationRole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_OrganizationRole.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_OrganizationRole.delete (method)
  delete(): void;

  // StepBasic_OrganizationRole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_OrganizationalAddress: declare class StepBasic_OrganizationalAddress extends StepBasic_Address

  // StepBasic_OrganizationalAddress.constructor (constructor)
  constructor();

  // StepBasic_OrganizationalAddress.Init (method)
  Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString, aOrganizations: NCollection_HArray1_handle_StepBasic_Organization, aDescription: TCollection_HAsciiString): void;
  Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString): void;

  // StepBasic_OrganizationalAddress.SetOrganizations (method)
  SetOrganizations(aOrganizations: NCollection_HArray1_handle_StepBasic_Organization): void;

  // StepBasic_OrganizationalAddress.Organizations (method)
  Organizations(): NCollection_HArray1_handle_StepBasic_Organization;

  // StepBasic_OrganizationalAddress.OrganizationsValue (method)
  OrganizationsValue(num: number): StepBasic_Organization;

  // StepBasic_OrganizationalAddress.NbOrganizations (method)
  NbOrganizations(): number;

  // StepBasic_OrganizationalAddress.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_OrganizationalAddress.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_OrganizationalAddress.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_OrganizationalAddress.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_OrganizationalAddress.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_OrganizationalAddress.delete (method)
  delete(): void;

  // StepBasic_OrganizationalAddress.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Person: declare class StepBasic_Person extends Standard_Transient

  // StepBasic_Person.constructor (constructor)
  constructor();

  // StepBasic_Person.Init (method)
  Init(aId: TCollection_HAsciiString, hasAlastName: boolean, aLastName: TCollection_HAsciiString, hasAfirstName: boolean, aFirstName: TCollection_HAsciiString, hasAmiddleNames: boolean, aMiddleNames: NCollection_HArray1_handle_TCollection_HAsciiString, hasAprefixTitles: boolean, aPrefixTitles: NCollection_HArray1_handle_TCollection_HAsciiString, hasAsuffixTitles: boolean, aSuffixTitles: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // StepBasic_Person.SetId (method)
  SetId(aId: TCollection_HAsciiString): void;

  // StepBasic_Person.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_Person.SetLastName (method)
  SetLastName(aLastName: TCollection_HAsciiString): void;

  // StepBasic_Person.UnSetLastName (method)
  UnSetLastName(): void;

  // StepBasic_Person.LastName (method)
  LastName(): TCollection_HAsciiString;

  // StepBasic_Person.HasLastName (method)
  HasLastName(): boolean;

  // StepBasic_Person.SetFirstName (method)
  SetFirstName(aFirstName: TCollection_HAsciiString): void;

  // StepBasic_Person.UnSetFirstName (method)
  UnSetFirstName(): void;

  // StepBasic_Person.FirstName (method)
  FirstName(): TCollection_HAsciiString;

  // StepBasic_Person.HasFirstName (method)
  HasFirstName(): boolean;

  // StepBasic_Person.SetMiddleNames (method)
  SetMiddleNames(aMiddleNames: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // StepBasic_Person.UnSetMiddleNames (method)
  UnSetMiddleNames(): void;

  // StepBasic_Person.MiddleNames (method)
  MiddleNames(): NCollection_HArray1_handle_TCollection_HAsciiString;

  // StepBasic_Person.HasMiddleNames (method)
  HasMiddleNames(): boolean;

  // StepBasic_Person.MiddleNamesValue (method)
  MiddleNamesValue(num: number): TCollection_HAsciiString;

  // StepBasic_Person.NbMiddleNames (method)
  NbMiddleNames(): number;

  // StepBasic_Person.SetPrefixTitles (method)
  SetPrefixTitles(aPrefixTitles: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // StepBasic_Person.UnSetPrefixTitles (method)
  UnSetPrefixTitles(): void;

  // StepBasic_Person.PrefixTitles (method)
  PrefixTitles(): NCollection_HArray1_handle_TCollection_HAsciiString;

  // StepBasic_Person.HasPrefixTitles (method)
  HasPrefixTitles(): boolean;

  // StepBasic_Person.PrefixTitlesValue (method)
  PrefixTitlesValue(num: number): TCollection_HAsciiString;

  // StepBasic_Person.NbPrefixTitles (method)
  NbPrefixTitles(): number;

  // StepBasic_Person.SetSuffixTitles (method)
  SetSuffixTitles(aSuffixTitles: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // StepBasic_Person.UnSetSuffixTitles (method)
  UnSetSuffixTitles(): void;

  // StepBasic_Person.SuffixTitles (method)
  SuffixTitles(): NCollection_HArray1_handle_TCollection_HAsciiString;

  // StepBasic_Person.HasSuffixTitles (method)
  HasSuffixTitles(): boolean;

  // StepBasic_Person.SuffixTitlesValue (method)
  SuffixTitlesValue(num: number): TCollection_HAsciiString;

  // StepBasic_Person.NbSuffixTitles (method)
  NbSuffixTitles(): number;

  // StepBasic_Person.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Person.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Person.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Person.delete (method)
  delete(): void;

  // StepBasic_Person.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_PersonAndOrganization: declare class StepBasic_PersonAndOrganization extends Standard_Transient

  // StepBasic_PersonAndOrganization.constructor (constructor)
  constructor();

  // StepBasic_PersonAndOrganization.Init (method)
  Init(aThePerson: StepBasic_Person, aTheOrganization: StepBasic_Organization): void;

  // StepBasic_PersonAndOrganization.SetThePerson (method)
  SetThePerson(aThePerson: StepBasic_Person): void;

  // StepBasic_PersonAndOrganization.ThePerson (method)
  ThePerson(): StepBasic_Person;

  // StepBasic_PersonAndOrganization.SetTheOrganization (method)
  SetTheOrganization(aTheOrganization: StepBasic_Organization): void;

  // StepBasic_PersonAndOrganization.TheOrganization (method)
  TheOrganization(): StepBasic_Organization;

  // StepBasic_PersonAndOrganization.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_PersonAndOrganization.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_PersonAndOrganization.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_PersonAndOrganization.delete (method)
  delete(): void;

  // StepBasic_PersonAndOrganization.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_PersonAndOrganizationAssignment: declare class StepBasic_PersonAndOrganizationAssignment extends Standard_Transient

  // StepBasic_PersonAndOrganizationAssignment.constructor (constructor)
  constructor();

  // StepBasic_PersonAndOrganizationAssignment.Init (method)
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

  // StepBasic_PersonAndOrganizationAssignment.SetAssignedPersonAndOrganization (method)
  SetAssignedPersonAndOrganization(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization): void;

  // StepBasic_PersonAndOrganizationAssignment.AssignedPersonAndOrganization (method)
  AssignedPersonAndOrganization(): StepBasic_PersonAndOrganization;

  // StepBasic_PersonAndOrganizationAssignment.SetRole (method)
  SetRole(aRole: StepBasic_PersonAndOrganizationRole): void;

  // StepBasic_PersonAndOrganizationAssignment.Role (method)
  Role(): StepBasic_PersonAndOrganizationRole;

  // StepBasic_PersonAndOrganizationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_PersonAndOrganizationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_PersonAndOrganizationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_PersonAndOrganizationAssignment.delete (method)
  delete(): void;

  // StepBasic_PersonAndOrganizationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_PersonAndOrganizationRole: declare class StepBasic_PersonAndOrganizationRole extends Standard_Transient

  // StepBasic_PersonAndOrganizationRole.constructor (constructor)
  constructor();

  // StepBasic_PersonAndOrganizationRole.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepBasic_PersonAndOrganizationRole.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_PersonAndOrganizationRole.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_PersonAndOrganizationRole.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_PersonAndOrganizationRole.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_PersonAndOrganizationRole.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_PersonAndOrganizationRole.delete (method)
  delete(): void;

  // StepBasic_PersonAndOrganizationRole.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_PersonOrganizationSelect: declare class StepBasic_PersonOrganizationSelect extends StepData_SelectType

  // StepBasic_PersonOrganizationSelect.constructor (constructor)
  constructor();

  // StepBasic_PersonOrganizationSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepBasic_PersonOrganizationSelect.Person (method)
  Person(): StepBasic_Person;

  // StepBasic_PersonOrganizationSelect.Organization (method)
  Organization(): StepBasic_Organization;

  // StepBasic_PersonOrganizationSelect.PersonAndOrganization (method)
  PersonAndOrganization(): StepBasic_PersonAndOrganization;

  // StepBasic_PersonOrganizationSelect.delete (method)
  delete(): void;

  // StepBasic_PersonOrganizationSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_PersonalAddress: declare class StepBasic_PersonalAddress extends StepBasic_Address

  // StepBasic_PersonalAddress.constructor (constructor)
  constructor();

  // StepBasic_PersonalAddress.Init (method)
  Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString, aPeople: NCollection_HArray1_handle_StepBasic_Person, aDescription: TCollection_HAsciiString): void;
  Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString): void;

  // StepBasic_PersonalAddress.SetPeople (method)
  SetPeople(aPeople: NCollection_HArray1_handle_StepBasic_Person): void;

  // StepBasic_PersonalAddress.People (method)
  People(): NCollection_HArray1_handle_StepBasic_Person;

  // StepBasic_PersonalAddress.PeopleValue (method)
  PeopleValue(num: number): StepBasic_Person;

  // StepBasic_PersonalAddress.NbPeople (method)
  NbPeople(): number;

  // StepBasic_PersonalAddress.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_PersonalAddress.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_PersonalAddress.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_PersonalAddress.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_PersonalAddress.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_PersonalAddress.delete (method)
  delete(): void;

  // StepBasic_PersonalAddress.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_PhysicallyModeledProductDefinition: declare class StepBasic_PhysicallyModeledProductDefinition extends StepBasic_ProductDefinition

  // StepBasic_PhysicallyModeledProductDefinition.constructor (constructor)
  constructor();

  // StepBasic_PhysicallyModeledProductDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_PhysicallyModeledProductDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_PhysicallyModeledProductDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_PhysicallyModeledProductDefinition.delete (method)
  delete(): void;

  // StepBasic_PhysicallyModeledProductDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_PlaneAngleMeasureWithUnit: declare class StepBasic_PlaneAngleMeasureWithUnit extends StepBasic_MeasureWithUnit

  // StepBasic_PlaneAngleMeasureWithUnit.constructor (constructor)
  constructor();

  // StepBasic_PlaneAngleMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_PlaneAngleMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_PlaneAngleMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_PlaneAngleMeasureWithUnit.delete (method)
  delete(): void;

  // StepBasic_PlaneAngleMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_PlaneAngleUnit: declare class StepBasic_PlaneAngleUnit extends StepBasic_NamedUnit

  // StepBasic_PlaneAngleUnit.constructor (constructor)
  constructor();

  // StepBasic_PlaneAngleUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_PlaneAngleUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_PlaneAngleUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_PlaneAngleUnit.delete (method)
  delete(): void;

  // StepBasic_PlaneAngleUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Product: declare class StepBasic_Product extends Standard_Transient

  // StepBasic_Product.constructor (constructor)
  constructor();

  // StepBasic_Product.Init (method)
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFrameOfReference: NCollection_HArray1_handle_StepBasic_ProductContext): void;

  // StepBasic_Product.SetId (method)
  SetId(aId: TCollection_HAsciiString): void;

  // StepBasic_Product.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_Product.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_Product.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_Product.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_Product.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_Product.SetFrameOfReference (method)
  SetFrameOfReference(aFrameOfReference: NCollection_HArray1_handle_StepBasic_ProductContext): void;

  // StepBasic_Product.FrameOfReference (method)
  FrameOfReference(): NCollection_HArray1_handle_StepBasic_ProductContext;

  // StepBasic_Product.FrameOfReferenceValue (method)
  FrameOfReferenceValue(num: number): StepBasic_ProductContext;

  // StepBasic_Product.NbFrameOfReference (method)
  NbFrameOfReference(): number;

  // StepBasic_Product.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_Product.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_Product.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_Product.delete (method)
  delete(): void;

  // StepBasic_Product.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductCategory: declare class StepBasic_ProductCategory extends Standard_Transient

  // StepBasic_ProductCategory.constructor (constructor)
  constructor();

  // StepBasic_ProductCategory.Init (method)
  Init(aName: TCollection_HAsciiString, hasAdescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepBasic_ProductCategory.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_ProductCategory.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ProductCategory.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_ProductCategory.UnSetDescription (method)
  UnSetDescription(): void;

  // StepBasic_ProductCategory.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ProductCategory.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_ProductCategory.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductCategory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductCategory.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductCategory.delete (method)
  delete(): void;

  // StepBasic_ProductCategory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductCategoryRelationship: declare class StepBasic_ProductCategoryRelationship extends Standard_Transient

  // StepBasic_ProductCategoryRelationship.constructor (constructor)
  constructor();

  // StepBasic_ProductCategoryRelationship.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aCategory: StepBasic_ProductCategory, aSubCategory: StepBasic_ProductCategory): void;

  // StepBasic_ProductCategoryRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ProductCategoryRelationship.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_ProductCategoryRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ProductCategoryRelationship.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_ProductCategoryRelationship.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_ProductCategoryRelationship.Category (method)
  Category(): StepBasic_ProductCategory;

  // StepBasic_ProductCategoryRelationship.SetCategory (method)
  SetCategory(Category: StepBasic_ProductCategory): void;

  // StepBasic_ProductCategoryRelationship.SubCategory (method)
  SubCategory(): StepBasic_ProductCategory;

  // StepBasic_ProductCategoryRelationship.SetSubCategory (method)
  SetSubCategory(SubCategory: StepBasic_ProductCategory): void;

  // StepBasic_ProductCategoryRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductCategoryRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductCategoryRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductCategoryRelationship.delete (method)
  delete(): void;

  // StepBasic_ProductCategoryRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductConceptContext: declare class StepBasic_ProductConceptContext extends StepBasic_ApplicationContextElement

  // StepBasic_ProductConceptContext.constructor (constructor)
  constructor();

  // StepBasic_ProductConceptContext.Init (method)
  Init(aApplicationContextElement_Name: TCollection_HAsciiString, aApplicationContextElement_FrameOfReference: StepBasic_ApplicationContext, aMarketSegmentType: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

  // StepBasic_ProductConceptContext.MarketSegmentType (method)
  MarketSegmentType(): TCollection_HAsciiString;

  // StepBasic_ProductConceptContext.SetMarketSegmentType (method)
  SetMarketSegmentType(MarketSegmentType: TCollection_HAsciiString): void;

  // StepBasic_ProductConceptContext.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductConceptContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductConceptContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductConceptContext.delete (method)
  delete(): void;

  // StepBasic_ProductConceptContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductContext: declare class StepBasic_ProductContext extends StepBasic_ApplicationContextElement

  // StepBasic_ProductContext.constructor (constructor)
  constructor();

  // StepBasic_ProductContext.Init (method)
  Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext, aDisciplineType: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

  // StepBasic_ProductContext.SetDisciplineType (method)
  SetDisciplineType(aDisciplineType: TCollection_HAsciiString): void;

  // StepBasic_ProductContext.DisciplineType (method)
  DisciplineType(): TCollection_HAsciiString;

  // StepBasic_ProductContext.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductContext.delete (method)
  delete(): void;

  // StepBasic_ProductContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinition: declare class StepBasic_ProductDefinition extends Standard_Transient

  // StepBasic_ProductDefinition.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinition.Init (method)
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;

  // StepBasic_ProductDefinition.SetId (method)
  SetId(aId: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinition.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_ProductDefinition.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinition.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ProductDefinition.SetFormation (method)
  SetFormation(aFormation: StepBasic_ProductDefinitionFormation): void;

  // StepBasic_ProductDefinition.Formation (method)
  Formation(): StepBasic_ProductDefinitionFormation;

  // StepBasic_ProductDefinition.SetFrameOfReference (method)
  SetFrameOfReference(aFrameOfReference: StepBasic_ProductDefinitionContext): void;

  // StepBasic_ProductDefinition.FrameOfReference (method)
  FrameOfReference(): StepBasic_ProductDefinitionContext;

  // StepBasic_ProductDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinition.delete (method)
  delete(): void;

  // StepBasic_ProductDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionContext: declare class StepBasic_ProductDefinitionContext extends StepBasic_ApplicationContextElement

  // StepBasic_ProductDefinitionContext.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionContext.Init (method)
  Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext, aLifeCycleStage: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

  // StepBasic_ProductDefinitionContext.SetLifeCycleStage (method)
  SetLifeCycleStage(aLifeCycleStage: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionContext.LifeCycleStage (method)
  LifeCycleStage(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionContext.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionContext.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionEffectivity: declare class StepBasic_ProductDefinitionEffectivity extends StepBasic_Effectivity

  // StepBasic_ProductDefinitionEffectivity.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionEffectivity.Init (method)
  Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
  Init(aid: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionEffectivity.Usage (method)
  Usage(): StepBasic_ProductDefinitionRelationship;

  // StepBasic_ProductDefinitionEffectivity.SetUsage (method)
  SetUsage(aUsage: StepBasic_ProductDefinitionRelationship): void;

  // StepBasic_ProductDefinitionEffectivity.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionEffectivity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionEffectivity.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionEffectivity.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionEffectivity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionFormation: declare class StepBasic_ProductDefinitionFormation extends Standard_Transient

  // StepBasic_ProductDefinitionFormation.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionFormation.Init (method)
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfProduct: StepBasic_Product): void;

  // StepBasic_ProductDefinitionFormation.SetId (method)
  SetId(aId: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionFormation.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionFormation.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionFormation.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionFormation.SetOfProduct (method)
  SetOfProduct(aOfProduct: StepBasic_Product): void;

  // StepBasic_ProductDefinitionFormation.OfProduct (method)
  OfProduct(): StepBasic_Product;

  // StepBasic_ProductDefinitionFormation.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionFormation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionFormation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionFormation.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionFormation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
