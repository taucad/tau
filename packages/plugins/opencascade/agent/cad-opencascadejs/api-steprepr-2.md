# libcascade — StepRepr (2)

18 top-level symbols. Signatures are verbatim typescript.

StepRepr_MakeFromUsageOption: declare class StepRepr_MakeFromUsageOption extends StepRepr_ProductDefinitionUsage

  constructor

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

  Ranking(): number;

  SetRanking(Ranking: number): void;

  RankingRationale(): TCollection_HAsciiString;

  SetRankingRationale(RankingRationale: TCollection_HAsciiString): void;

  Quantity(): Standard_Transient;

  SetQuantity(Quantity: Standard_Transient): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_MaterialProperty: declare class StepRepr_MaterialProperty extends StepRepr_PropertyDefinition

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_MaterialPropertyRepresentation: declare class StepRepr_MaterialPropertyRepresentation extends StepRepr_PropertyDefinitionRepresentation

  constructor

  Init(aPropertyDefinitionRepresentation_Definition: StepRepr_RepresentedDefinition, aPropertyDefinitionRepresentation_UsedRepresentation: StepRepr_Representation, aDependentEnvironment: StepRepr_DataEnvironment): void;
  Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;
  Init(aPropertyDefinitionRepresentation_Definition: StepRepr_RepresentedDefinition, aPropertyDefinitionRepresentation_UsedRepresentation: StepRepr_Representation, aDependentEnvironment: StepRepr_DataEnvironment): void;
  Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;

  DependentEnvironment(): StepRepr_DataEnvironment;

  SetDependentEnvironment(DependentEnvironment: StepRepr_DataEnvironment): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_MeasureRepresentationItem: declare class StepRepr_MeasureRepresentationItem extends StepRepr_RepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;
  Init(aName: TCollection_HAsciiString): void;

  SetMeasure(Measure: StepBasic_MeasureWithUnit): void;

  Measure(): StepBasic_MeasureWithUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_MechanicalDesignAndDraughtingRelationship: declare class StepRepr_MechanicalDesignAndDraughtingRelationship extends StepRepr_RepresentationRelationship

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_NextAssemblyUsageOccurrence: declare class StepRepr_NextAssemblyUsageOccurrence extends StepRepr_AssemblyComponentUsage

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ParallelOffset: declare class StepRepr_ParallelOffset extends StepRepr_DerivedShapeAspect

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theOffset: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theOffset: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  Offset(): Standard_Transient;

  SetOffset(theOffset: Standard_Transient): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ParametricRepresentationContext: declare class StepRepr_ParametricRepresentationContext extends StepRepr_RepresentationContext

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_PerpendicularTo: declare class StepRepr_PerpendicularTo extends StepRepr_DerivedShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ProductConcept: declare class StepRepr_ProductConcept extends Standard_Transient

  constructor

  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aMarketContext: StepBasic_ProductConceptContext): void;

  Id(): TCollection_HAsciiString;

  SetId(Id: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  HasDescription(): boolean;

  MarketContext(): StepBasic_ProductConceptContext;

  SetMarketContext(MarketContext: StepBasic_ProductConceptContext): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ProductDefinitionShape: declare class StepRepr_ProductDefinitionShape extends StepRepr_PropertyDefinition

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ProductDefinitionUsage: declare class StepRepr_ProductDefinitionUsage extends StepBasic_ProductDefinitionRelationship

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_PromissoryUsageOccurrence: declare class StepRepr_PromissoryUsageOccurrence extends StepRepr_AssemblyComponentUsage

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_PropertyDefinition: declare class StepRepr_PropertyDefinition extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aDefinition: StepRepr_CharacterizedDefinition): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  HasDescription(): boolean;

  Definition(): StepRepr_CharacterizedDefinition;

  SetDefinition(Definition: StepRepr_CharacterizedDefinition): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_PropertyDefinitionRelationship: declare class StepRepr_PropertyDefinitionRelationship extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelatingPropertyDefinition: StepRepr_PropertyDefinition, aRelatedPropertyDefinition: StepRepr_PropertyDefinition): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  RelatingPropertyDefinition(): StepRepr_PropertyDefinition;

  SetRelatingPropertyDefinition(RelatingPropertyDefinition: StepRepr_PropertyDefinition): void;

  RelatedPropertyDefinition(): StepRepr_PropertyDefinition;

  SetRelatedPropertyDefinition(RelatedPropertyDefinition: StepRepr_PropertyDefinition): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_PropertyDefinitionRepresentation: declare class StepRepr_PropertyDefinitionRepresentation extends Standard_Transient

  constructor

  Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;

  Definition(): StepRepr_RepresentedDefinition;

  SetDefinition(Definition: StepRepr_RepresentedDefinition): void;

  UsedRepresentation(): StepRepr_Representation;

  SetUsedRepresentation(UsedRepresentation: StepRepr_Representation): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
