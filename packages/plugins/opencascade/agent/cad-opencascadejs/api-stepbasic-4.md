# libcascade — StepBasic (4)

22 top-level symbols. Signatures are verbatim typescript.

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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_PersonOrganizationSelect: declare class StepBasic_PersonOrganizationSelect extends StepData_SelectType

constructor

// Recognizes a PersonOrganizationSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Person (Null if another type)
Person(): StepBasic_Person;

// returns Value as a Organization (Null if another type)
Organization(): StepBasic_Organization;

// returns Value as a PersonAndOrganization (Null if another type)
PersonAndOrganization(): StepBasic_PersonAndOrganization;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_PhysicallyModeledProductDefinition: declare class StepBasic_PhysicallyModeledProductDefinition extends StepBasic_ProductDefinition

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_PlaneAngleMeasureWithUnit: declare class StepBasic_PlaneAngleMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_PlaneAngleUnit: declare class StepBasic_PlaneAngleUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ProductCategoryRelationship
StepBasic_ProductCategoryRelationship: declare class StepBasic_ProductCategoryRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aCategory: StepBasic_ProductCategory, aSubCategory: StepBasic_ProductCategory): void;

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

// Returns field Category
Category(): StepBasic_ProductCategory;

// Set field Category
SetCategory(Category: StepBasic_ProductCategory): void;

// Returns field SubCategory
SubCategory(): StepBasic_ProductCategory;

// Set field SubCategory
SetSubCategory(SubCategory: StepBasic_ProductCategory): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ProductConceptContext
StepBasic_ProductConceptContext: declare class StepBasic_ProductConceptContext extends StepBasic_ApplicationContextElement

constructor

// Initialize all fields (own and inherited)
Init(aApplicationContextElement_Name: TCollection_HAsciiString, aApplicationContextElement_FrameOfReference: StepBasic_ApplicationContext, aMarketSegmentType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;
Init(aApplicationContextElement_Name: TCollection_HAsciiString, aApplicationContextElement_FrameOfReference: StepBasic_ApplicationContext, aMarketSegmentType: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

// Returns field MarketSegmentType
MarketSegmentType(): TCollection_HAsciiString;

// Set field MarketSegmentType
SetMarketSegmentType(MarketSegmentType: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductDefinition: declare class StepBasic_ProductDefinition extends Standard_Transient

constructor

Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;

SetId(aId: TCollection_HAsciiString): void;

Id(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetFormation(aFormation: StepBasic_ProductDefinitionFormation): void;

Formation(): StepBasic_ProductDefinitionFormation;

SetFrameOfReference(aFrameOfReference: StepBasic_ProductDefinitionContext): void;

FrameOfReference(): StepBasic_ProductDefinitionContext;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductDefinitionContext: declare class StepBasic_ProductDefinitionContext extends StepBasic_ApplicationContextElement

constructor

Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext, aLifeCycleStage: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext, aLifeCycleStage: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aFrameOfReference: StepBasic_ApplicationContext): void;

SetLifeCycleStage(aLifeCycleStage: TCollection_HAsciiString): void;

LifeCycleStage(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductDefinitionEffectivity: declare class StepBasic_ProductDefinitionEffectivity extends StepBasic_Effectivity

constructor

Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
Init(aid: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
Init(aid: TCollection_HAsciiString): void;

Usage(): StepBasic_ProductDefinitionRelationship;

SetUsage(aUsage: StepBasic_ProductDefinitionRelationship): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductDefinitionFormation: declare class StepBasic_ProductDefinitionFormation extends Standard_Transient

constructor

Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfProduct: StepBasic_Product): void;

SetId(aId: TCollection_HAsciiString): void;

Id(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetOfProduct(aOfProduct: StepBasic_Product): void;

OfProduct(): StepBasic_Product;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ProductDefinitionFormationRelationship
StepBasic_ProductDefinitionFormationRelationship: declare class StepBasic_ProductDefinitionFormationRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelatingProductDefinitionFormation: StepBasic_ProductDefinitionFormation, aRelatedProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

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

// Returns field RelatingProductDefinitionFormation
RelatingProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

// Set field RelatingProductDefinitionFormation
SetRelatingProductDefinitionFormation(RelatingProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

// Returns field RelatedProductDefinitionFormation
RelatedProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

// Set field RelatedProductDefinitionFormation
SetRelatedProductDefinitionFormation(RelatedProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductDefinitionFormationWithSpecifiedSource: declare class StepBasic_ProductDefinitionFormationWithSpecifiedSource extends StepBasic_ProductDefinitionFormation

constructor

Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfProduct: StepBasic_Product, aMakeOrBuy: StepBasic_Source): void;
Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfProduct: StepBasic_Product): void;
Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfProduct: StepBasic_Product, aMakeOrBuy: StepBasic_Source): void;
Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfProduct: StepBasic_Product): void;

SetMakeOrBuy(aMakeOrBuy: StepBasic_Source): void;

MakeOrBuy(): StepBasic_Source;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductDefinitionOrReference: declare class StepBasic_ProductDefinitionOrReference extends StepData_SelectType

constructor

// Recognizes a ProductDefinitionOrReference Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ProductDefinition (Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// returns Value as a ProductDefinitionReference (Null if another type)
ProductDefinitionReference(): StepBasic_ProductDefinitionReference;

// returns Value as a ProductDefinitionReferenceWithLocalRepresentation (Null if another type)
ProductDefinitionReferenceWithLocalRepresentation(): StepBasic_ProductDefinitionReferenceWithLocalRepresentation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Product_Definition_Reference
StepBasic_ProductDefinitionReference: declare class StepBasic_ProductDefinitionReference extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString, theIdOwningOrganizationName: TCollection_HAsciiString): void;
Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString): void;
Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString, theIdOwningOrganizationName: TCollection_HAsciiString): void;
Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString): void;

// Returns field Source
Source(): StepBasic_ExternalSource;

// Set field Source
SetSource(theSource: StepBasic_ExternalSource): void;

// Returns field ProductId
ProductId(): TCollection_HAsciiString;

// Set field ProductId
SetProductId(theProductId: TCollection_HAsciiString): void;

// Returns field ProductDefinitionFormationId
ProductDefinitionFormationId(): TCollection_HAsciiString;

// Set field ProductDefinitionFormationId
SetProductDefinitionFormationId(theProductDefinitionFormationId: TCollection_HAsciiString): void;

// Returns field ProductDefinitionId
ProductDefinitionId(): TCollection_HAsciiString;

// Set field ProductDefinitionId
SetProductDefinitionId(theProductDefinitionId: TCollection_HAsciiString): void;

// Returns field IdOwningOrganizationName
IdOwningOrganizationName(): TCollection_HAsciiString;

// Set field IdOwningOrganizationName
SetIdOwningOrganizationName(theIdOwningOrganizationName: TCollection_HAsciiString): void;

// Returns true if IdOwningOrganizationName exists
HasIdOwningOrganizationName(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductDefinitionReferenceWithLocalRepresentation: declare class StepBasic_ProductDefinitionReferenceWithLocalRepresentation extends StepBasic_ProductDefinition

constructor

Init(theSource: StepBasic_ExternalSource, theId: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theFormation: StepBasic_ProductDefinitionFormation, theFrameOfReference: StepBasic_ProductDefinitionContext): void;
Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;
Init(theSource: StepBasic_ExternalSource, theId: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theFormation: StepBasic_ProductDefinitionFormation, theFrameOfReference: StepBasic_ProductDefinitionContext): void;
Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;

// Returns field Source
Source(): StepBasic_ExternalSource;

// Set field Source
SetSource(theSource: StepBasic_ExternalSource): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
