# libcascade — StepBasic (3)

26 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity ExternallyDefinedItem
StepBasic_ExternallyDefinedItem: declare class StepBasic_ExternallyDefinedItem extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aItemId: StepBasic_SourceItem, aSource: StepBasic_ExternalSource): void;

// Returns field ItemId
ItemId(): StepBasic_SourceItem;

// Set field ItemId
SetItemId(ItemId: StepBasic_SourceItem): void;

// Returns field Source
Source(): StepBasic_ExternalSource;

// Set field Source
SetSource(Source: StepBasic_ExternalSource): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GeneralProperty
StepBasic_GeneralProperty: declare class StepBasic_GeneralProperty extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns field Id
Id(): TCollection_HAsciiString;

// Set field Id
SetId(Id: TCollection_HAsciiString): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GeneralPropertyAssociation
StepBasic_GeneralPropertyAssociation: declare class StepBasic_GeneralPropertyAssociation extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aGeneralProperty: StepBasic_GeneralProperty, aPropertyDefinition: StepRepr_PropertyDefinition): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field GeneralProperty
GeneralProperty(): StepBasic_GeneralProperty;

// Set field GeneralProperty
SetGeneralProperty(GeneralProperty: StepBasic_GeneralProperty): void;

// Returns field PropertyDefinition
PropertyDefinition(): StepRepr_PropertyDefinition;

// Set field PropertyDefinition
SetPropertyDefinition(PropertyDefinition: StepRepr_PropertyDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GeneralPropertyRelationship
StepBasic_GeneralPropertyRelationship: declare class StepBasic_GeneralPropertyRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingGeneralProperty: StepBasic_GeneralProperty, aRelatedGeneralProperty: StepBasic_GeneralProperty): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field RelatingGeneralProperty
RelatingGeneralProperty(): StepBasic_GeneralProperty;

// Set field RelatingGeneralProperty
SetRelatingGeneralProperty(RelatingGeneralProperty: StepBasic_GeneralProperty): void;

// Returns field RelatedGeneralProperty
RelatedGeneralProperty(): StepBasic_GeneralProperty;

// Set field RelatedGeneralProperty
SetRelatedGeneralProperty(RelatedGeneralProperty: StepBasic_GeneralProperty): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Group
StepBasic_Group: declare class StepBasic_Group extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GroupAssignment
StepBasic_GroupAssignment: declare class StepBasic_GroupAssignment extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aAssignedGroup: StepBasic_Group): void;

// Returns field AssignedGroup
AssignedGroup(): StepBasic_Group;

// Set field AssignedGroup
SetAssignedGroup(AssignedGroup: StepBasic_Group): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GroupRelationship
StepBasic_GroupRelationship: declare class StepBasic_GroupRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingGroup: StepBasic_Group, aRelatedGroup: StepBasic_Group): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

// Returns field RelatingGroup
RelatingGroup(): StepBasic_Group;

// Set field RelatingGroup
SetRelatingGroup(RelatingGroup: StepBasic_Group): void;

// Returns field RelatedGroup
RelatedGroup(): StepBasic_Group;

// Set field RelatedGroup
SetRelatedGroup(RelatedGroup: StepBasic_Group): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity IdentificationAssignment
StepBasic_IdentificationAssignment: declare class StepBasic_IdentificationAssignment extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

// Returns field AssignedId
AssignedId(): TCollection_HAsciiString;

// Set field AssignedId
SetAssignedId(AssignedId: TCollection_HAsciiString): void;

// Returns field Role
Role(): StepBasic_IdentificationRole;

// Set field Role
SetRole(Role: StepBasic_IdentificationRole): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity IdentificationRole
StepBasic_IdentificationRole: declare class StepBasic_IdentificationRole extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_LengthMeasureWithUnit: declare class StepBasic_LengthMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_LengthUnit: declare class StepBasic_LengthUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_LocalTime: declare class StepBasic_LocalTime extends Standard_Transient

constructor

Init(aHourComponent: number, hasAminuteComponent: boolean, aMinuteComponent: number, hasAsecondComponent: boolean, aSecondComponent: number, aZone: StepBasic_CoordinatedUniversalTimeOffset): void;

SetHourComponent(aHourComponent: number): void;

HourComponent(): number;

SetMinuteComponent(aMinuteComponent: number): void;

UnSetMinuteComponent(): void;

MinuteComponent(): number;

HasMinuteComponent(): boolean;

SetSecondComponent(aSecondComponent: number): void;

UnSetSecondComponent(): void;

SecondComponent(): number;

HasSecondComponent(): boolean;

SetZone(aZone: StepBasic_CoordinatedUniversalTimeOffset): void;

Zone(): StepBasic_CoordinatedUniversalTimeOffset;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_MassMeasureWithUnit: declare class StepBasic_MassMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity MassUnit
StepBasic_MassUnit: declare class StepBasic_MassUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// for Select MeasureValue, i.e
StepBasic_MeasureValueMember: declare class StepBasic_MeasureValueMember extends StepData_SelectReal

constructor

// Tells if a SelectMember has a name
HasName(): boolean;

// Returns the name of a SelectMember
Name(): string;

// Sets the name of a SelectMember, returns True if done, False if no name is allowed Default does nothing and returns False
SetName(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_MeasureWithUnit: declare class StepBasic_MeasureWithUnit extends Standard_Transient

constructor

Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;

SetValueComponent(aValueComponent: number): void;

ValueComponent(): number;

ValueComponentMember(): StepBasic_MeasureValueMember;

SetValueComponentMember(val: StepBasic_MeasureValueMember): void;

SetUnitComponent(aUnitComponent: StepBasic_Unit): void;

UnitComponent(): StepBasic_Unit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_MechanicalContext: declare class StepBasic_MechanicalContext extends StepBasic_ProductContext

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity NameAssignment
StepBasic_NameAssignment: declare class StepBasic_NameAssignment extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aAssignedName: TCollection_HAsciiString): void;

// Returns field AssignedName
AssignedName(): TCollection_HAsciiString;

// Set field AssignedName
SetAssignedName(AssignedName: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_NamedUnit: declare class StepBasic_NamedUnit extends Standard_Transient

constructor

Init(aDimensions: StepBasic_DimensionalExponents): void;

SetDimensions(aDimensions: StepBasic_DimensionalExponents): void;

Dimensions(): StepBasic_DimensionalExponents;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ObjectRole
StepBasic_ObjectRole: declare class StepBasic_ObjectRole extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_OrdinalDate: declare class StepBasic_OrdinalDate extends StepBasic_Date

constructor

Init(aYearComponent: number, aDayComponent: number): void;
Init(aYearComponent: number): void;
Init(aYearComponent: number, aDayComponent: number): void;
Init(aYearComponent: number): void;

SetDayComponent(aDayComponent: number): void;

DayComponent(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_Organization: declare class StepBasic_Organization extends Standard_Transient

constructor

Init(hasAid: boolean, aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;

SetId(aId: TCollection_HAsciiString): void;

UnSetId(): void;

Id(): TCollection_HAsciiString;

HasId(): boolean;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_OrganizationAssignment: declare class StepBasic_OrganizationAssignment extends Standard_Transient

constructor

Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole): void;

SetAssignedOrganization(aAssignedOrganization: StepBasic_Organization): void;

AssignedOrganization(): StepBasic_Organization;

SetRole(aRole: StepBasic_OrganizationRole): void;

Role(): StepBasic_OrganizationRole;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_OrganizationRole: declare class StepBasic_OrganizationRole extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_OrganizationalAddress: declare class StepBasic_OrganizationalAddress extends StepBasic_Address

constructor

Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString, aOrganizations: NCollection_HArray1_handle_StepBasic_Organization, aDescription: TCollection_HAsciiString): void;
Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString): void;
Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString, aOrganizations: NCollection_HArray1_handle_StepBasic_Organization, aDescription: TCollection_HAsciiString): void;
Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString): void;

SetOrganizations(aOrganizations: NCollection_HArray1_handle_StepBasic_Organization): void;

Organizations(): NCollection_HArray1_handle_StepBasic_Organization;

OrganizationsValue(num: number): StepBasic_Organization;

NbOrganizations(): number;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_Person: declare class StepBasic_Person extends Standard_Transient

constructor

Init(aId: TCollection_HAsciiString, hasAlastName: boolean, aLastName: TCollection_HAsciiString, hasAfirstName: boolean, aFirstName: TCollection_HAsciiString, hasAmiddleNames: boolean, aMiddleNames: NCollection_HArray1_handle_TCollection_HAsciiString, hasAprefixTitles: boolean, aPrefixTitles: NCollection_HArray1_handle_TCollection_HAsciiString, hasAsuffixTitles: boolean, aSuffixTitles: NCollection_HArray1_handle_TCollection_HAsciiString): void;

SetId(aId: TCollection_HAsciiString): void;

Id(): TCollection_HAsciiString;

SetLastName(aLastName: TCollection_HAsciiString): void;

UnSetLastName(): void;

LastName(): TCollection_HAsciiString;

HasLastName(): boolean;

SetFirstName(aFirstName: TCollection_HAsciiString): void;

UnSetFirstName(): void;

FirstName(): TCollection_HAsciiString;

HasFirstName(): boolean;

SetMiddleNames(aMiddleNames: NCollection_HArray1_handle_TCollection_HAsciiString): void;

UnSetMiddleNames(): void;

MiddleNames(): NCollection_HArray1_handle_TCollection_HAsciiString;

HasMiddleNames(): boolean;

MiddleNamesValue(num: number): TCollection_HAsciiString;

NbMiddleNames(): number;

SetPrefixTitles(aPrefixTitles: NCollection_HArray1_handle_TCollection_HAsciiString): void;

UnSetPrefixTitles(): void;

PrefixTitles(): NCollection_HArray1_handle_TCollection_HAsciiString;

HasPrefixTitles(): boolean;

PrefixTitlesValue(num: number): TCollection_HAsciiString;

NbPrefixTitles(): number;

SetSuffixTitles(aSuffixTitles: NCollection_HArray1_handle_TCollection_HAsciiString): void;

UnSetSuffixTitles(): void;

SuffixTitles(): NCollection_HArray1_handle_TCollection_HAsciiString;

HasSuffixTitles(): boolean;

SuffixTitlesValue(num: number): TCollection_HAsciiString;

NbSuffixTitles(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
