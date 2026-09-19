# libcascade — StepBasic (4)

33 top-level symbols. Signatures are verbatim typescript.

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

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ProductDefinitionFormationRelationship: declare class StepBasic_ProductDefinitionFormationRelationship extends Standard_Transient

  constructor

  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelatingProductDefinitionFormation: StepBasic_ProductDefinitionFormation, aRelatedProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

  Id(): TCollection_HAsciiString;

  SetId(Id: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  RelatingProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  SetRelatingProductDefinitionFormation(RelatingProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

  RelatedProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  SetRelatedProductDefinitionFormation(RelatedProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ProductDefinitionOrReference: declare class StepBasic_ProductDefinitionOrReference extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionReference(): StepBasic_ProductDefinitionReference;

  ProductDefinitionReferenceWithLocalRepresentation(): StepBasic_ProductDefinitionReferenceWithLocalRepresentation;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ProductDefinitionReference: declare class StepBasic_ProductDefinitionReference extends Standard_Transient

  constructor

  Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString, theIdOwningOrganizationName: TCollection_HAsciiString): void;
  Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString): void;
  Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString, theIdOwningOrganizationName: TCollection_HAsciiString): void;
  Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString): void;

  Source(): StepBasic_ExternalSource;

  SetSource(theSource: StepBasic_ExternalSource): void;

  ProductId(): TCollection_HAsciiString;

  SetProductId(theProductId: TCollection_HAsciiString): void;

  ProductDefinitionFormationId(): TCollection_HAsciiString;

  SetProductDefinitionFormationId(theProductDefinitionFormationId: TCollection_HAsciiString): void;

  ProductDefinitionId(): TCollection_HAsciiString;

  SetProductDefinitionId(theProductDefinitionId: TCollection_HAsciiString): void;

  IdOwningOrganizationName(): TCollection_HAsciiString;

  SetIdOwningOrganizationName(theIdOwningOrganizationName: TCollection_HAsciiString): void;

  HasIdOwningOrganizationName(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ProductDefinitionReferenceWithLocalRepresentation: declare class StepBasic_ProductDefinitionReferenceWithLocalRepresentation extends StepBasic_ProductDefinition

  constructor

  Init(theSource: StepBasic_ExternalSource, theId: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theFormation: StepBasic_ProductDefinitionFormation, theFrameOfReference: StepBasic_ProductDefinitionContext): void;
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;
  Init(theSource: StepBasic_ExternalSource, theId: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theFormation: StepBasic_ProductDefinitionFormation, theFrameOfReference: StepBasic_ProductDefinitionContext): void;
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;

  Source(): StepBasic_ExternalSource;

  SetSource(theSource: StepBasic_ExternalSource): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ProductDefinitionRelationship: declare class StepBasic_ProductDefinitionRelationship extends Standard_Transient

  constructor

  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  Id(): TCollection_HAsciiString;

  SetId(Id: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  HasDescription(): boolean;

  RelatingProductDefinition(): StepBasic_ProductDefinition;

  RelatingProductDefinitionAP242(): StepBasic_ProductDefinitionOrReference;

  SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinition): void;
  SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinitionOrReference): void;
  SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinition): void;
  SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  RelatedProductDefinition(): StepBasic_ProductDefinition;

  RelatedProductDefinitionAP242(): StepBasic_ProductDefinitionOrReference;

  SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinition): void;
  SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
  SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinition): void;
  SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ProductOrFormationOrDefinition: declare class StepBasic_ProductOrFormationOrDefinition extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Product(): StepBasic_Product;

  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  ProductDefinition(): StepBasic_ProductDefinition;

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

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_ProductType: declare class StepBasic_ProductType extends StepBasic_ProductRelatedProductCategory

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_RatioMeasureWithUnit: declare class StepBasic_RatioMeasureWithUnit extends StepBasic_MeasureWithUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_RatioUnit: declare class StepBasic_RatioUnit extends StepBasic_NamedUnit

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_RoleAssociation: declare class StepBasic_RoleAssociation extends Standard_Transient

  constructor

  Init(aRole: StepBasic_ObjectRole, aItemWithRole: StepBasic_RoleSelect): void;

  Role(): StepBasic_ObjectRole;

  SetRole(Role: StepBasic_ObjectRole): void;

  ItemWithRole(): StepBasic_RoleSelect;

  SetItemWithRole(ItemWithRole: StepBasic_RoleSelect): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_RoleSelect: declare class StepBasic_RoleSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ActionAssignment(): StepBasic_ActionAssignment;

  ActionRequestAssignment(): StepBasic_ActionRequestAssignment;

  ApprovalAssignment(): StepBasic_ApprovalAssignment;

  ApprovalDateTime(): StepBasic_ApprovalDateTime;

  CertificationAssignment(): StepBasic_CertificationAssignment;

  ContractAssignment(): StepBasic_ContractAssignment;

  DocumentReference(): StepBasic_DocumentReference;

  EffectivityAssignment(): StepBasic_EffectivityAssignment;

  GroupAssignment(): StepBasic_GroupAssignment;

  NameAssignment(): StepBasic_NameAssignment;

  SecurityClassificationAssignment(): StepBasic_SecurityClassificationAssignment;

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

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_SiUnitAndAreaUnit: declare class StepBasic_SiUnitAndAreaUnit extends StepBasic_SiUnit

  constructor

  SetAreaUnit(anAreaUnit: StepBasic_AreaUnit): void;

  AreaUnit(): StepBasic_AreaUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_SiUnitAndVolumeUnit: declare class StepBasic_SiUnitAndVolumeUnit extends StepBasic_SiUnit

  constructor

  SetVolumeUnit(aVolumeUnit: StepBasic_VolumeUnit): void;

  VolumeUnit(): StepBasic_VolumeUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepBasic_SiUnitName: typeof StepBasic_SiUnitName[keyof typeof StepBasic_SiUnitName]
