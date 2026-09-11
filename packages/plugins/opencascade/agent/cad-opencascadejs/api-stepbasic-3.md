# libcascade — StepBasic (3)

30 top-level symbols. Signatures are verbatim typescript.

StepBasic_LengthMeasureWithUnit: declare class StepBasic_LengthMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_LengthUnit: declare class StepBasic_LengthUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_MassMeasureWithUnit: declare class StepBasic_MassMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_MassUnit: declare class StepBasic_MassUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_MeasureValueMember: declare class StepBasic_MeasureValueMember extends StepData_SelectReal

constructor

HasName(): boolean;

Name(): string;

SetName(name: string): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_MechanicalContext: declare class StepBasic_MechanicalContext extends StepBasic_ProductContext

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_NameAssignment: declare class StepBasic_NameAssignment extends Standard_Transient

constructor

Init(aAssignedName: TCollection_HAsciiString): void;

AssignedName(): TCollection_HAsciiString;

SetAssignedName(AssignedName: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_ObjectRole: declare class StepBasic_ObjectRole extends Standard_Transient

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

delete(): void;

[Symbol.dispose](): void;

StepBasic_PersonAndOrganization: declare class StepBasic_PersonAndOrganization extends Standard_Transient

constructor

Init(aThePerson: StepBasic_Person, aTheOrganization: StepBasic_Organization): void;

SetThePerson(aThePerson: StepBasic_Person): void;

ThePerson(): StepBasic_Person;

SetTheOrganization(aTheOrganization: StepBasic_Organization): void;

TheOrganization(): StepBasic_Organization;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_PersonAndOrganizationAssignment: declare class StepBasic_PersonAndOrganizationAssignment extends Standard_Transient

constructor

Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

SetAssignedPersonAndOrganization(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization): void;

AssignedPersonAndOrganization(): StepBasic_PersonAndOrganization;

SetRole(aRole: StepBasic_PersonAndOrganizationRole): void;

Role(): StepBasic_PersonAndOrganizationRole;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_PersonAndOrganizationRole: declare class StepBasic_PersonAndOrganizationRole extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_PersonOrganizationSelect: declare class StepBasic_PersonOrganizationSelect extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

Person(): StepBasic_Person;

Organization(): StepBasic_Organization;

PersonAndOrganization(): StepBasic_PersonAndOrganization;

delete(): void;

[Symbol.dispose](): void;

StepBasic_PersonalAddress: declare class StepBasic_PersonalAddress extends StepBasic_Address

constructor

Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString, aPeople: NCollection_HArray1_handle_StepBasic_Person, aDescription: TCollection_HAsciiString): void;
Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString): void;
Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString, aPeople: NCollection_HArray1_handle_StepBasic_Person, aDescription: TCollection_HAsciiString): void;
Init(hasAinternalLocation: boolean, aInternalLocation: TCollection_HAsciiString, hasAstreetNumber: boolean, aStreetNumber: TCollection_HAsciiString, hasAstreet: boolean, aStreet: TCollection_HAsciiString, hasApostalBox: boolean, aPostalBox: TCollection_HAsciiString, hasAtown: boolean, aTown: TCollection_HAsciiString, hasAregion: boolean, aRegion: TCollection_HAsciiString, hasApostalCode: boolean, aPostalCode: TCollection_HAsciiString, hasAcountry: boolean, aCountry: TCollection_HAsciiString, hasAfacsimileNumber: boolean, aFacsimileNumber: TCollection_HAsciiString, hasAtelephoneNumber: boolean, aTelephoneNumber: TCollection_HAsciiString, hasAelectronicMailAddress: boolean, aElectronicMailAddress: TCollection_HAsciiString, hasAtelexNumber: boolean, aTelexNumber: TCollection_HAsciiString): void;

SetPeople(aPeople: NCollection_HArray1_handle_StepBasic_Person): void;

People(): NCollection_HArray1_handle_StepBasic_Person;

PeopleValue(num: number): StepBasic_Person;

NbPeople(): number;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_PhysicallyModeledProductDefinition: declare class StepBasic_PhysicallyModeledProductDefinition extends StepBasic_ProductDefinition

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_PlaneAngleMeasureWithUnit: declare class StepBasic_PlaneAngleMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_PlaneAngleUnit: declare class StepBasic_PlaneAngleUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_Product: declare class StepBasic_Product extends Standard_Transient

constructor

Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFrameOfReference: NCollection_HArray1_handle_StepBasic_ProductContext): void;

SetId(aId: TCollection_HAsciiString): void;

Id(): TCollection_HAsciiString;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetFrameOfReference(aFrameOfReference: NCollection_HArray1_handle_StepBasic_ProductContext): void;

FrameOfReference(): NCollection_HArray1_handle_StepBasic_ProductContext;

FrameOfReferenceValue(num: number): StepBasic_ProductContext;

NbFrameOfReference(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductCategory: declare class StepBasic_ProductCategory extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, hasAdescription: boolean, aDescription: TCollection_HAsciiString): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

UnSetDescription(): void;

Description(): TCollection_HAsciiString;

HasDescription(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductCategoryRelationship: declare class StepBasic_ProductCategoryRelationship extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aCategory: StepBasic_ProductCategory, aSubCategory: StepBasic_ProductCategory): void;

Name(): TCollection_HAsciiString;

SetName(Name: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDescription(Description: TCollection_HAsciiString): void;

HasDescription(): boolean;

Category(): StepBasic_ProductCategory;

SetCategory(Category: StepBasic_ProductCategory): void;

SubCategory(): StepBasic_ProductCategory;

SetSubCategory(SubCategory: StepBasic_ProductCategory): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductConceptContext: declare class StepBasic_ProductConceptContext extends StepBasic_ApplicationContextElement

constructor

Init(aApplicationContextElement_Name: TCollection_HAsciiString, aApplicationContextElement_FrameOfReference: StepBasic_ApplicationContext, aMarketSegmentType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;
Init(aApplicationContextElement_Name: TCollection_HAsciiString, aApplicationContextElement_FrameOfReference: StepBasic_ApplicationContext, aMarketSegmentType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

MarketSegmentType(): TCollection_HAsciiString;

SetMarketSegmentType(MarketSegmentType: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductContext: declare class StepBasic_ProductContext extends StepBasic_ApplicationContextElement

constructor

Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext, aDisciplineType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext, aDisciplineType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

SetDisciplineType(aDisciplineType: TCollection_HAsciiString): void;

DisciplineType(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
