# libcascade — StepBasic (5)

35 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity ProductDefinitionRelationship
StepBasic_ProductDefinitionRelationship: declare class StepBasic_ProductDefinitionRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

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

// Returns field RelatingProductDefinition
RelatingProductDefinition(): StepBasic_ProductDefinition;

// Returns field RelatingProductDefinition in AP242
RelatingProductDefinitionAP242(): StepBasic_ProductDefinitionOrReference;

// Set field RelatingProductDefinition
SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinition): void;
SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinitionOrReference): void;
SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinition): void;
SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinitionOrReference): void;

// Returns field RelatedProductDefinition
RelatedProductDefinition(): StepBasic_ProductDefinition;

// Returns field RelatedProductDefinition in AP242
RelatedProductDefinitionAP242(): StepBasic_ProductDefinitionOrReference;

// Set field RelatedProductDefinition
SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinition): void;
SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinition): void;
SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductDefinitionWithAssociatedDocuments: declare class StepBasic_ProductDefinitionWithAssociatedDocuments extends StepBasic_ProductDefinition

constructor

Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrame: StepBasic_ProductDefinitionContext, aDocIds: NCollection_HArray1_handle_StepBasic_Document): void;
Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;
Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrame: StepBasic_ProductDefinitionContext, aDocIds: NCollection_HArray1_handle_StepBasic_Document): void;
Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;

DocIds(): NCollection_HArray1_handle_StepBasic_Document;

SetDocIds(DocIds: NCollection_HArray1_handle_StepBasic_Document): void;

NbDocIds(): number;

DocIdsValue(num: number): StepBasic_Document;

SetDocIdsValue(num: number, adoc: StepBasic_Document): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type ProductOrFormationOrDefinition
StepBasic_ProductOrFormationOrDefinition: declare class StepBasic_ProductOrFormationOrDefinition extends StepData_SelectType

constructor

// Recognizes a kind of ProductOrFormationOrDefinition select type 1 -> Product from StepBasic 2 -> ProductDefinitionFormation from StepBasic 3 -> ProductDefinition from StepBasic 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as Product (or Null if another type)
Product(): StepBasic_Product;

// Returns Value as ProductDefinitionFormation (or Null if another type)
ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

// Returns Value as ProductDefinition (or Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductRelatedProductCategory: declare class StepBasic_ProductRelatedProductCategory extends StepBasic_ProductCategory

constructor

Init(aName: TCollection_HAsciiString, hasAdescription: boolean, aDescription: TCollection_HAsciiString, aProducts: NCollection_HArray1_handle_StepBasic_Product): void;
Init(aName: TCollection_HAsciiString, hasAdescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, hasAdescription: boolean, aDescription: TCollection_HAsciiString, aProducts: NCollection_HArray1_handle_StepBasic_Product): void;
Init(aName: TCollection_HAsciiString, hasAdescription: boolean, aDescription: TCollection_HAsciiString): void;

SetProducts(aProducts: NCollection_HArray1_handle_StepBasic_Product): void;

Products(): NCollection_HArray1_handle_StepBasic_Product;

ProductsValue(num: number): StepBasic_Product;

NbProducts(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_ProductType: declare class StepBasic_ProductType extends StepBasic_ProductRelatedProductCategory

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_RatioMeasureWithUnit: declare class StepBasic_RatioMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_RatioUnit: declare class StepBasic_RatioUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity RoleAssociation
StepBasic_RoleAssociation: declare class StepBasic_RoleAssociation extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aRole: StepBasic_ObjectRole, aItemWithRole: StepBasic_RoleSelect): void;

// Returns field Role
Role(): StepBasic_ObjectRole;

// Set field Role
SetRole(Role: StepBasic_ObjectRole): void;

// Returns field ItemWithRole
ItemWithRole(): StepBasic_RoleSelect;

// Set field ItemWithRole
SetItemWithRole(ItemWithRole: StepBasic_RoleSelect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type RoleSelect
StepBasic_RoleSelect: declare class StepBasic_RoleSelect extends StepData_SelectType

constructor

// Recognizes a kind of RoleSelect select type 1 -> ActionAssignment from StepBasic 2 -> ActionRequestAssignment from StepBasic 3 -> ApprovalAssignment from StepBasic 4 -> ApprovalDateTime from StepBasic 5 -> CertificationAssignment from StepBasic 6 -> ContractAssignment from StepBasic 7 -> DocumentReference from StepBasic 8 -> EffectivityAssignment from StepBasic 9 -> GroupAssignment from StepBasic 10 -> NameAssignment from StepBasic 11 -> SecurityClassificationAssignment from StepBasic 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as ActionAssignment (or Null if another type)
ActionAssignment(): StepBasic_ActionAssignment;

// Returns Value as ActionRequestAssignment (or Null if another type)
ActionRequestAssignment(): StepBasic_ActionRequestAssignment;

// Returns Value as ApprovalAssignment (or Null if another type)
ApprovalAssignment(): StepBasic_ApprovalAssignment;

// Returns Value as ApprovalDateTime (or Null if another type)
ApprovalDateTime(): StepBasic_ApprovalDateTime;

// Returns Value as CertificationAssignment (or Null if another type)
CertificationAssignment(): StepBasic_CertificationAssignment;

// Returns Value as ContractAssignment (or Null if another type)
ContractAssignment(): StepBasic_ContractAssignment;

// Returns Value as DocumentReference (or Null if another type)
DocumentReference(): StepBasic_DocumentReference;

// Returns Value as EffectivityAssignment (or Null if another type)
EffectivityAssignment(): StepBasic_EffectivityAssignment;

// Returns Value as GroupAssignment (or Null if another type)
GroupAssignment(): StepBasic_GroupAssignment;

// Returns Value as NameAssignment (or Null if another type)
NameAssignment(): StepBasic_NameAssignment;

// Returns Value as SecurityClassificationAssignment (or Null if another type)
SecurityClassificationAssignment(): StepBasic_SecurityClassificationAssignment;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SecurityClassification: declare class StepBasic_SecurityClassification extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, aSecurityLevel: StepBasic_SecurityClassificationLevel): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetPurpose(aPurpose: TCollection_HAsciiString): void;

Purpose(): TCollection_HAsciiString;

SetSecurityLevel(aSecurityLevel: StepBasic_SecurityClassificationLevel): void;

SecurityLevel(): StepBasic_SecurityClassificationLevel;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SecurityClassificationAssignment: declare class StepBasic_SecurityClassificationAssignment extends Standard_Transient

constructor

Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

SetAssignedSecurityClassification(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

AssignedSecurityClassification(): StepBasic_SecurityClassification;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SecurityClassificationLevel: declare class StepBasic_SecurityClassificationLevel extends Standard_Transient

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

StepBasic_SiPrefix: typeof StepBasic_SiPrefix[keyof typeof StepBasic_SiPrefix]

StepBasic_SiUnit: declare class StepBasic_SiUnit extends StepBasic_NamedUnit

constructor

Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetPrefix(aPrefix: StepBasic_SiPrefix): void;

UnSetPrefix(): void;

Prefix(): StepBasic_SiPrefix;

HasPrefix(): boolean;

SetName(aName: StepBasic_SiUnitName): void;

Name(): StepBasic_SiUnitName;

SetDimensions(aDimensions: StepBasic_DimensionalExponents): void;

Dimensions(): StepBasic_DimensionalExponents;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndAreaUnit: declare class StepBasic_SiUnitAndAreaUnit extends StepBasic_SiUnit

constructor

SetAreaUnit(anAreaUnit: StepBasic_AreaUnit): void;

AreaUnit(): StepBasic_AreaUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndLengthUnit: declare class StepBasic_SiUnitAndLengthUnit extends StepBasic_SiUnit

constructor

Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetLengthUnit(aLengthUnit: StepBasic_LengthUnit): void;

LengthUnit(): StepBasic_LengthUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndMassUnit: declare class StepBasic_SiUnitAndMassUnit extends StepBasic_SiUnit

constructor

Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetMassUnit(aMassUnit: StepBasic_MassUnit): void;

MassUnit(): StepBasic_MassUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndPlaneAngleUnit: declare class StepBasic_SiUnitAndPlaneAngleUnit extends StepBasic_SiUnit

constructor

Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetPlaneAngleUnit(aPlaneAngleUnit: StepBasic_PlaneAngleUnit): void;

PlaneAngleUnit(): StepBasic_PlaneAngleUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndRatioUnit: declare class StepBasic_SiUnitAndRatioUnit extends StepBasic_SiUnit

constructor

Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetRatioUnit(aRatioUnit: StepBasic_RatioUnit): void;

RatioUnit(): StepBasic_RatioUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndSolidAngleUnit: declare class StepBasic_SiUnitAndSolidAngleUnit extends StepBasic_SiUnit

constructor

Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetSolidAngleUnit(aSolidAngleUnit: StepBasic_SolidAngleUnit): void;

SolidAngleUnit(): StepBasic_SolidAngleUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndThermodynamicTemperatureUnit: declare class StepBasic_SiUnitAndThermodynamicTemperatureUnit extends StepBasic_SiUnit

constructor

Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetThermodynamicTemperatureUnit(aThermodynamicTemperatureUnit: StepBasic_ThermodynamicTemperatureUnit): void;

ThermodynamicTemperatureUnit(): StepBasic_ThermodynamicTemperatureUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndTimeUnit: declare class StepBasic_SiUnitAndTimeUnit extends StepBasic_SiUnit

constructor

Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;
Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
Init(aDimensions: StepBasic_DimensionalExponents): void;

SetTimeUnit(aTimeUnit: StepBasic_TimeUnit): void;

TimeUnit(): StepBasic_TimeUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitAndVolumeUnit: declare class StepBasic_SiUnitAndVolumeUnit extends StepBasic_SiUnit

constructor

SetVolumeUnit(aVolumeUnit: StepBasic_VolumeUnit): void;

VolumeUnit(): StepBasic_VolumeUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SiUnitName: typeof StepBasic_SiUnitName[keyof typeof StepBasic_SiUnitName]

// For immediate members of SizeSelect, i.e
StepBasic_SizeMember: declare class StepBasic_SizeMember extends StepData_SelectReal

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

StepBasic_SizeSelect: declare class StepBasic_SizeSelect extends StepData_SelectType

constructor

// Recognizes a TrimmingSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// Returns a SizeMember (POSITIVE_LENGTH_MEASURE) as preferred
NewMember(): StepData_SelectMember;

// Recognizes a SelectMember as Real, named as PARAMETER_VALUE 1 -> PositiveLengthMeasure i.e
CaseMem(ent: StepData_SelectMember): number;

SetRealValue(aReal: number): void;

// returns Value as a Real (Null if another type)
RealValue(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SolidAngleMeasureWithUnit: declare class StepBasic_SolidAngleMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_SolidAngleUnit: declare class StepBasic_SolidAngleUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_Source: typeof StepBasic_Source[keyof typeof StepBasic_Source]

// Representation of STEP SELECT type SourceItem
StepBasic_SourceItem: declare class StepBasic_SourceItem extends StepData_SelectType

constructor

// Recognizes a kind of SourceItem select type 1 -> HAsciiString from {@link TCollection `TCollection`} 0 else
CaseNum(ent: Standard_Transient): number;

// Returns a preferred SelectMember
NewMember(): StepData_SelectMember;

// Returns Value as Identifier (or Null if another type)
Identifier(): TCollection_HAsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ThermodynamicTemperatureUnit
StepBasic_ThermodynamicTemperatureUnit: declare class StepBasic_ThermodynamicTemperatureUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_TimeMeasureWithUnit: declare class StepBasic_TimeMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_TimeUnit: declare class StepBasic_TimeUnit extends StepBasic_NamedUnit

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepBasic_UncertaintyMeasureWithUnit: declare class StepBasic_UncertaintyMeasureWithUnit extends StepBasic_MeasureWithUnit

constructor

Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;
Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;
Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;
Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;

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

// Implements a select type unit (NamedUnit or DerivedUnit)
StepBasic_Unit: declare class StepBasic_Unit extends StepData_SelectType

constructor

// Recognizes a type of Unit Entity 1 -> NamedUnit 2 -> DerivedUnit
CaseNum(ent: Standard_Transient): number;

// returns Value as a NamedUnit (Null if another type)
NamedUnit(): StepBasic_NamedUnit;

// returns Value as a DerivedUnit (Null if another type)
DerivedUnit(): StepBasic_DerivedUnit;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
