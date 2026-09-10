# libcascade — StepRepr (2)

22 top-level symbols. Signatures are verbatim typescript.

StepRepr_GlobalUncertaintyAssignedContext: declare class StepRepr_GlobalUncertaintyAssignedContext extends StepRepr_RepresentationContext

constructor

Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

SetUncertainty(aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;

Uncertainty(): NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit;

UncertaintyValue(num: number): StepBasic_UncertaintyMeasureWithUnit;

NbUncertainty(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_GlobalUnitAssignedContext: declare class StepRepr_GlobalUnitAssignedContext extends StepRepr_RepresentationContext

constructor

Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

SetUnits(aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;

Units(): NCollection_HArray1_handle_StepBasic_NamedUnit;

UnitsValue(num: number): StepBasic_NamedUnit;

NbUnits(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_IntegerRepresentationItem: declare class StepRepr_IntegerRepresentationItem extends StepRepr_RepresentationItem

constructor

Init(theName: TCollection_HAsciiString, theValue: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(theName: TCollection_HAsciiString, theValue: number): void;
Init(aName: TCollection_HAsciiString): void;

SetValue(theValue: number): void;

Value(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added from StepRepr Rev2 to Rev4
StepRepr_ItemDefinedTransformation: declare class StepRepr_ItemDefinedTransformation extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aTransformItem1: StepRepr_RepresentationItem, aTransformItem2: StepRepr_RepresentationItem): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

HasDescription(): boolean;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetTransformItem1(aItem: StepRepr_RepresentationItem): void;

TransformItem1(): StepRepr_RepresentationItem;

SetTransformItem2(aItem: StepRepr_RepresentationItem): void;

TransformItem2(): StepRepr_RepresentationItem;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity MakeFromUsageOption
StepRepr_MakeFromUsageOption: declare class StepRepr_MakeFromUsageOption extends StepRepr_ProductDefinitionUsage

constructor

// Initialize all fields (own and inherited)
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

// Returns field Ranking
Ranking(): number;

// Set field Ranking
SetRanking(Ranking: number): void;

// Returns field RankingRationale
RankingRationale(): TCollection_HAsciiString;

// Set field RankingRationale
SetRankingRationale(RankingRationale: TCollection_HAsciiString): void;

// Returns field Quantity
Quantity(): Standard_Transient;

// Set field Quantity
SetQuantity(Quantity: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_MappedItem: declare class StepRepr_MappedItem extends StepRepr_RepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aMappingSource: StepRepr_RepresentationMap, aMappingTarget: StepRepr_RepresentationItem): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aMappingSource: StepRepr_RepresentationMap, aMappingTarget: StepRepr_RepresentationItem): void;
Init(aName: TCollection_HAsciiString): void;

SetMappingSource(aMappingSource: StepRepr_RepresentationMap): void;

MappingSource(): StepRepr_RepresentationMap;

SetMappingTarget(aMappingTarget: StepRepr_RepresentationItem): void;

MappingTarget(): StepRepr_RepresentationItem;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_MaterialDesignation: declare class StepRepr_MaterialDesignation extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aOfDefinition: StepRepr_CharacterizedDefinition): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetOfDefinition(aOfDefinition: StepRepr_CharacterizedDefinition): void;

OfDefinition(): StepRepr_CharacterizedDefinition;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity MaterialProperty
StepRepr_MaterialProperty: declare class StepRepr_MaterialProperty extends StepRepr_PropertyDefinition

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity MaterialPropertyRepresentation
StepRepr_MaterialPropertyRepresentation: declare class StepRepr_MaterialPropertyRepresentation extends StepRepr_PropertyDefinitionRepresentation

constructor

// Initialize all fields (own and inherited)
Init(aPropertyDefinitionRepresentation_Definition: StepRepr_RepresentedDefinition, aPropertyDefinitionRepresentation_UsedRepresentation: StepRepr_Representation, aDependentEnvironment: StepRepr_DataEnvironment): void;
Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;
Init(aPropertyDefinitionRepresentation_Definition: StepRepr_RepresentedDefinition, aPropertyDefinitionRepresentation_UsedRepresentation: StepRepr_Representation, aDependentEnvironment: StepRepr_DataEnvironment): void;
Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;

// Returns field DependentEnvironment
DependentEnvironment(): StepRepr_DataEnvironment;

// Set field DependentEnvironment
SetDependentEnvironment(DependentEnvironment: StepRepr_DataEnvironment): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implements a measure_representation_item entity which is used for storing validation properties (e.g
StepRepr_MeasureRepresentationItem: declare class StepRepr_MeasureRepresentationItem extends StepRepr_RepresentationItem

constructor

// Init all fields
Init(aName: TCollection_HAsciiString, aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;
Init(aName: TCollection_HAsciiString): void;

SetMeasure(Measure: StepBasic_MeasureWithUnit): void;

Measure(): StepBasic_MeasureWithUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_MechanicalDesignAndDraughtingRelationship: declare class StepRepr_MechanicalDesignAndDraughtingRelationship extends StepRepr_RepresentationRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity NextAssemblyUsageOccurrence
StepRepr_NextAssemblyUsageOccurrence: declare class StepRepr_NextAssemblyUsageOccurrence extends StepRepr_AssemblyComponentUsage

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_ParallelOffset: declare class StepRepr_ParallelOffset extends StepRepr_DerivedShapeAspect

constructor

// Initialize all fields (own and inherited)
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theOffset: Standard_Transient): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theOffset: Standard_Transient): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

// Returns field Offset
Offset(): Standard_Transient;

// Set field Offset
SetOffset(theOffset: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ParametricRepresentationContext: declare class StepRepr_ParametricRepresentationContext extends StepRepr_RepresentationContext

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_PerpendicularTo: declare class StepRepr_PerpendicularTo extends StepRepr_DerivedShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ProductConcept
StepRepr_ProductConcept: declare class StepRepr_ProductConcept extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aMarketContext: StepBasic_ProductConceptContext): void;

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

// Returns field MarketContext
MarketContext(): StepBasic_ProductConceptContext;

// Set field MarketContext
SetMarketContext(MarketContext: StepBasic_ProductConceptContext): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ProductDefinitionShape
StepRepr_ProductDefinitionShape: declare class StepRepr_ProductDefinitionShape extends StepRepr_PropertyDefinition

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ProductDefinitionUsage
StepRepr_ProductDefinitionUsage: declare class StepRepr_ProductDefinitionUsage extends StepBasic_ProductDefinitionRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_PromissoryUsageOccurrence: declare class StepRepr_PromissoryUsageOccurrence extends StepRepr_AssemblyComponentUsage

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PropertyDefinition
StepRepr_PropertyDefinition: declare class StepRepr_PropertyDefinition extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aDefinition: StepRepr_CharacterizedDefinition): void;

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

// Returns field Definition
Definition(): StepRepr_CharacterizedDefinition;

// Set field Definition
SetDefinition(Definition: StepRepr_CharacterizedDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PropertyDefinitionRelationship
StepRepr_PropertyDefinitionRelationship: declare class StepRepr_PropertyDefinitionRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelatingPropertyDefinition: StepRepr_PropertyDefinition, aRelatedPropertyDefinition: StepRepr_PropertyDefinition): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field RelatingPropertyDefinition
RelatingPropertyDefinition(): StepRepr_PropertyDefinition;

// Set field RelatingPropertyDefinition
SetRelatingPropertyDefinition(RelatingPropertyDefinition: StepRepr_PropertyDefinition): void;

// Returns field RelatedPropertyDefinition
RelatedPropertyDefinition(): StepRepr_PropertyDefinition;

// Set field RelatedPropertyDefinition
SetRelatedPropertyDefinition(RelatedPropertyDefinition: StepRepr_PropertyDefinition): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PropertyDefinitionRepresentation
StepRepr_PropertyDefinitionRepresentation: declare class StepRepr_PropertyDefinitionRepresentation extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;

// Returns field Definition
Definition(): StepRepr_RepresentedDefinition;

// Set field Definition
SetDefinition(Definition: StepRepr_RepresentedDefinition): void;

// Returns field UsedRepresentation
UsedRepresentation(): StepRepr_Representation;

// Set field UsedRepresentation
SetUsedRepresentation(UsedRepresentation: StepRepr_Representation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
