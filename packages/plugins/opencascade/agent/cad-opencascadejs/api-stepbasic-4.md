# libcascade — StepBasic (4)

41 top-level symbols. Signatures are verbatim typescript.

StepBasic_ProductDefinitionFormationRelationship: declare class StepBasic_ProductDefinitionFormationRelationship extends Standard_Transient

  // StepBasic_ProductDefinitionFormationRelationship.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionFormationRelationship.Init (method)
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelatingProductDefinitionFormation: StepBasic_ProductDefinitionFormation, aRelatedProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

  // StepBasic_ProductDefinitionFormationRelationship.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionFormationRelationship.SetId (method)
  SetId(Id: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionFormationRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionFormationRelationship.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionFormationRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionFormationRelationship.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionFormationRelationship.RelatingProductDefinitionFormation (method)
  RelatingProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepBasic_ProductDefinitionFormationRelationship.SetRelatingProductDefinitionFormation (method)
  SetRelatingProductDefinitionFormation(RelatingProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

  // StepBasic_ProductDefinitionFormationRelationship.RelatedProductDefinitionFormation (method)
  RelatedProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepBasic_ProductDefinitionFormationRelationship.SetRelatedProductDefinitionFormation (method)
  SetRelatedProductDefinitionFormation(RelatedProductDefinitionFormation: StepBasic_ProductDefinitionFormation): void;

  // StepBasic_ProductDefinitionFormationRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionFormationRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionFormationRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionFormationRelationship.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionFormationRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionFormationWithSpecifiedSource: declare class StepBasic_ProductDefinitionFormationWithSpecifiedSource extends StepBasic_ProductDefinitionFormation

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.Init (method)
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfProduct: StepBasic_Product, aMakeOrBuy: StepBasic_Source): void;
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfProduct: StepBasic_Product): void;

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.SetMakeOrBuy (method)
  SetMakeOrBuy(aMakeOrBuy: StepBasic_Source): void;

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.MakeOrBuy (method)
  MakeOrBuy(): StepBasic_Source;

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionFormationWithSpecifiedSource.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionOrReference: declare class StepBasic_ProductDefinitionOrReference extends StepData_SelectType

  // StepBasic_ProductDefinitionOrReference.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionOrReference.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepBasic_ProductDefinitionOrReference.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepBasic_ProductDefinitionOrReference.ProductDefinitionReference (method)
  ProductDefinitionReference(): StepBasic_ProductDefinitionReference;

  // StepBasic_ProductDefinitionOrReference.ProductDefinitionReferenceWithLocalRepresentation (method)
  ProductDefinitionReferenceWithLocalRepresentation(): StepBasic_ProductDefinitionReferenceWithLocalRepresentation;

  // StepBasic_ProductDefinitionOrReference.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionOrReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionReference: declare class StepBasic_ProductDefinitionReference extends Standard_Transient

  // StepBasic_ProductDefinitionReference.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionReference.Init (method)
  Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString, theIdOwningOrganizationName: TCollection_HAsciiString): void;
  Init(theSource: StepBasic_ExternalSource, theProductId: TCollection_HAsciiString, theProductDefinitionFormationId: TCollection_HAsciiString, theProductDefinitionId: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionReference.Source (method)
  Source(): StepBasic_ExternalSource;

  // StepBasic_ProductDefinitionReference.SetSource (method)
  SetSource(theSource: StepBasic_ExternalSource): void;

  // StepBasic_ProductDefinitionReference.ProductId (method)
  ProductId(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionReference.SetProductId (method)
  SetProductId(theProductId: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionReference.ProductDefinitionFormationId (method)
  ProductDefinitionFormationId(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionReference.SetProductDefinitionFormationId (method)
  SetProductDefinitionFormationId(theProductDefinitionFormationId: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionReference.ProductDefinitionId (method)
  ProductDefinitionId(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionReference.SetProductDefinitionId (method)
  SetProductDefinitionId(theProductDefinitionId: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionReference.IdOwningOrganizationName (method)
  IdOwningOrganizationName(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionReference.SetIdOwningOrganizationName (method)
  SetIdOwningOrganizationName(theIdOwningOrganizationName: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionReference.HasIdOwningOrganizationName (method)
  HasIdOwningOrganizationName(): boolean;

  // StepBasic_ProductDefinitionReference.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionReference.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionReferenceWithLocalRepresentation: declare class StepBasic_ProductDefinitionReferenceWithLocalRepresentation extends StepBasic_ProductDefinition

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.Init (method)
  Init(theSource: StepBasic_ExternalSource, theId: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theFormation: StepBasic_ProductDefinitionFormation, theFrameOfReference: StepBasic_ProductDefinitionContext): void;
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.Source (method)
  Source(): StepBasic_ExternalSource;

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.SetSource (method)
  SetSource(theSource: StepBasic_ExternalSource): void;

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionReferenceWithLocalRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionRelationship: declare class StepBasic_ProductDefinitionRelationship extends Standard_Transient

  // StepBasic_ProductDefinitionRelationship.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionRelationship.Init (method)
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  // StepBasic_ProductDefinitionRelationship.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionRelationship.SetId (method)
  SetId(Id: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionRelationship.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_ProductDefinitionRelationship.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_ProductDefinitionRelationship.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_ProductDefinitionRelationship.RelatingProductDefinition (method)
  RelatingProductDefinition(): StepBasic_ProductDefinition;

  // StepBasic_ProductDefinitionRelationship.RelatingProductDefinitionAP242 (method)
  RelatingProductDefinitionAP242(): StepBasic_ProductDefinitionOrReference;

  // StepBasic_ProductDefinitionRelationship.SetRelatingProductDefinition (method)
  SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinition): void;
  SetRelatingProductDefinition(RelatingProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  // StepBasic_ProductDefinitionRelationship.RelatedProductDefinition (method)
  RelatedProductDefinition(): StepBasic_ProductDefinition;

  // StepBasic_ProductDefinitionRelationship.RelatedProductDefinitionAP242 (method)
  RelatedProductDefinitionAP242(): StepBasic_ProductDefinitionOrReference;

  // StepBasic_ProductDefinitionRelationship.SetRelatedProductDefinition (method)
  SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinition): void;
  SetRelatedProductDefinition(RelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  // StepBasic_ProductDefinitionRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionRelationship.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductDefinitionWithAssociatedDocuments: declare class StepBasic_ProductDefinitionWithAssociatedDocuments extends StepBasic_ProductDefinition

  // StepBasic_ProductDefinitionWithAssociatedDocuments.constructor (constructor)
  constructor();

  // StepBasic_ProductDefinitionWithAssociatedDocuments.Init (method)
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrame: StepBasic_ProductDefinitionContext, aDocIds: NCollection_HArray1_handle_StepBasic_Document): void;
  Init(aId: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aFormation: StepBasic_ProductDefinitionFormation, aFrameOfReference: StepBasic_ProductDefinitionContext): void;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.DocIds (method)
  DocIds(): NCollection_HArray1_handle_StepBasic_Document;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.SetDocIds (method)
  SetDocIds(DocIds: NCollection_HArray1_handle_StepBasic_Document): void;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.NbDocIds (method)
  NbDocIds(): number;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.DocIdsValue (method)
  DocIdsValue(num: number): StepBasic_Document;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.SetDocIdsValue (method)
  SetDocIdsValue(num: number, adoc: StepBasic_Document): void;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.delete (method)
  delete(): void;

  // StepBasic_ProductDefinitionWithAssociatedDocuments.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductOrFormationOrDefinition: declare class StepBasic_ProductOrFormationOrDefinition extends StepData_SelectType

  // StepBasic_ProductOrFormationOrDefinition.constructor (constructor)
  constructor();

  // StepBasic_ProductOrFormationOrDefinition.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepBasic_ProductOrFormationOrDefinition.Product (method)
  Product(): StepBasic_Product;

  // StepBasic_ProductOrFormationOrDefinition.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepBasic_ProductOrFormationOrDefinition.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepBasic_ProductOrFormationOrDefinition.delete (method)
  delete(): void;

  // StepBasic_ProductOrFormationOrDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductRelatedProductCategory: declare class StepBasic_ProductRelatedProductCategory extends StepBasic_ProductCategory

  // StepBasic_ProductRelatedProductCategory.constructor (constructor)
  constructor();

  // StepBasic_ProductRelatedProductCategory.Init (method)
  Init(aName: TCollection_HAsciiString, hasAdescription: boolean, aDescription: TCollection_HAsciiString, aProducts: NCollection_HArray1_handle_StepBasic_Product): void;
  Init(aName: TCollection_HAsciiString, hasAdescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepBasic_ProductRelatedProductCategory.SetProducts (method)
  SetProducts(aProducts: NCollection_HArray1_handle_StepBasic_Product): void;

  // StepBasic_ProductRelatedProductCategory.Products (method)
  Products(): NCollection_HArray1_handle_StepBasic_Product;

  // StepBasic_ProductRelatedProductCategory.ProductsValue (method)
  ProductsValue(num: number): StepBasic_Product;

  // StepBasic_ProductRelatedProductCategory.NbProducts (method)
  NbProducts(): number;

  // StepBasic_ProductRelatedProductCategory.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductRelatedProductCategory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductRelatedProductCategory.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductRelatedProductCategory.delete (method)
  delete(): void;

  // StepBasic_ProductRelatedProductCategory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ProductType: declare class StepBasic_ProductType extends StepBasic_ProductRelatedProductCategory

  // StepBasic_ProductType.constructor (constructor)
  constructor();

  // StepBasic_ProductType.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ProductType.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ProductType.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ProductType.delete (method)
  delete(): void;

  // StepBasic_ProductType.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_RatioMeasureWithUnit: declare class StepBasic_RatioMeasureWithUnit extends StepBasic_MeasureWithUnit

  // StepBasic_RatioMeasureWithUnit.constructor (constructor)
  constructor();

  // StepBasic_RatioMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_RatioMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_RatioMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_RatioMeasureWithUnit.delete (method)
  delete(): void;

  // StepBasic_RatioMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_RatioUnit: declare class StepBasic_RatioUnit extends StepBasic_NamedUnit

  // StepBasic_RatioUnit.constructor (constructor)
  constructor();

  // StepBasic_RatioUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_RatioUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_RatioUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_RatioUnit.delete (method)
  delete(): void;

  // StepBasic_RatioUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_RoleAssociation: declare class StepBasic_RoleAssociation extends Standard_Transient

  // StepBasic_RoleAssociation.constructor (constructor)
  constructor();

  // StepBasic_RoleAssociation.Init (method)
  Init(aRole: StepBasic_ObjectRole, aItemWithRole: StepBasic_RoleSelect): void;

  // StepBasic_RoleAssociation.Role (method)
  Role(): StepBasic_ObjectRole;

  // StepBasic_RoleAssociation.SetRole (method)
  SetRole(Role: StepBasic_ObjectRole): void;

  // StepBasic_RoleAssociation.ItemWithRole (method)
  ItemWithRole(): StepBasic_RoleSelect;

  // StepBasic_RoleAssociation.SetItemWithRole (method)
  SetItemWithRole(ItemWithRole: StepBasic_RoleSelect): void;

  // StepBasic_RoleAssociation.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_RoleAssociation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_RoleAssociation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_RoleAssociation.delete (method)
  delete(): void;

  // StepBasic_RoleAssociation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_RoleSelect: declare class StepBasic_RoleSelect extends StepData_SelectType

  // StepBasic_RoleSelect.constructor (constructor)
  constructor();

  // StepBasic_RoleSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepBasic_RoleSelect.ActionAssignment (method)
  ActionAssignment(): StepBasic_ActionAssignment;

  // StepBasic_RoleSelect.ActionRequestAssignment (method)
  ActionRequestAssignment(): StepBasic_ActionRequestAssignment;

  // StepBasic_RoleSelect.ApprovalAssignment (method)
  ApprovalAssignment(): StepBasic_ApprovalAssignment;

  // StepBasic_RoleSelect.ApprovalDateTime (method)
  ApprovalDateTime(): StepBasic_ApprovalDateTime;

  // StepBasic_RoleSelect.CertificationAssignment (method)
  CertificationAssignment(): StepBasic_CertificationAssignment;

  // StepBasic_RoleSelect.ContractAssignment (method)
  ContractAssignment(): StepBasic_ContractAssignment;

  // StepBasic_RoleSelect.DocumentReference (method)
  DocumentReference(): StepBasic_DocumentReference;

  // StepBasic_RoleSelect.EffectivityAssignment (method)
  EffectivityAssignment(): StepBasic_EffectivityAssignment;

  // StepBasic_RoleSelect.GroupAssignment (method)
  GroupAssignment(): StepBasic_GroupAssignment;

  // StepBasic_RoleSelect.NameAssignment (method)
  NameAssignment(): StepBasic_NameAssignment;

  // StepBasic_RoleSelect.SecurityClassificationAssignment (method)
  SecurityClassificationAssignment(): StepBasic_SecurityClassificationAssignment;

  // StepBasic_RoleSelect.delete (method)
  delete(): void;

  // StepBasic_RoleSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SecurityClassification: declare class StepBasic_SecurityClassification extends Standard_Transient

  // StepBasic_SecurityClassification.constructor (constructor)
  constructor();

  // StepBasic_SecurityClassification.Init (method)
  Init(aName: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, aSecurityLevel: StepBasic_SecurityClassificationLevel): void;

  // StepBasic_SecurityClassification.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_SecurityClassification.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_SecurityClassification.SetPurpose (method)
  SetPurpose(aPurpose: TCollection_HAsciiString): void;

  // StepBasic_SecurityClassification.Purpose (method)
  Purpose(): TCollection_HAsciiString;

  // StepBasic_SecurityClassification.SetSecurityLevel (method)
  SetSecurityLevel(aSecurityLevel: StepBasic_SecurityClassificationLevel): void;

  // StepBasic_SecurityClassification.SecurityLevel (method)
  SecurityLevel(): StepBasic_SecurityClassificationLevel;

  // StepBasic_SecurityClassification.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SecurityClassification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SecurityClassification.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SecurityClassification.delete (method)
  delete(): void;

  // StepBasic_SecurityClassification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SecurityClassificationAssignment: declare class StepBasic_SecurityClassificationAssignment extends Standard_Transient

  // StepBasic_SecurityClassificationAssignment.constructor (constructor)
  constructor();

  // StepBasic_SecurityClassificationAssignment.Init (method)
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

  // StepBasic_SecurityClassificationAssignment.SetAssignedSecurityClassification (method)
  SetAssignedSecurityClassification(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

  // StepBasic_SecurityClassificationAssignment.AssignedSecurityClassification (method)
  AssignedSecurityClassification(): StepBasic_SecurityClassification;

  // StepBasic_SecurityClassificationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SecurityClassificationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SecurityClassificationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SecurityClassificationAssignment.delete (method)
  delete(): void;

  // StepBasic_SecurityClassificationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SecurityClassificationLevel: declare class StepBasic_SecurityClassificationLevel extends Standard_Transient

  // StepBasic_SecurityClassificationLevel.constructor (constructor)
  constructor();

  // StepBasic_SecurityClassificationLevel.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepBasic_SecurityClassificationLevel.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_SecurityClassificationLevel.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_SecurityClassificationLevel.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SecurityClassificationLevel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SecurityClassificationLevel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SecurityClassificationLevel.delete (method)
  delete(): void;

  // StepBasic_SecurityClassificationLevel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiPrefix: typeof StepBasic_SiPrefix[keyof typeof StepBasic_SiPrefix]

  readonly StepBasic_spExa: 'StepBasic_spExa'

  readonly StepBasic_spPeta: 'StepBasic_spPeta'

  readonly StepBasic_spTera: 'StepBasic_spTera'

  readonly StepBasic_spGiga: 'StepBasic_spGiga'

  readonly StepBasic_spMega: 'StepBasic_spMega'

  readonly StepBasic_spKilo: 'StepBasic_spKilo'

  readonly StepBasic_spHecto: 'StepBasic_spHecto'

  readonly StepBasic_spDeca: 'StepBasic_spDeca'

  readonly StepBasic_spDeci: 'StepBasic_spDeci'

  readonly StepBasic_spCenti: 'StepBasic_spCenti'

  readonly StepBasic_spMilli: 'StepBasic_spMilli'

  readonly StepBasic_spMicro: 'StepBasic_spMicro'

  readonly StepBasic_spNano: 'StepBasic_spNano'

  readonly StepBasic_spPico: 'StepBasic_spPico'

  readonly StepBasic_spFemto: 'StepBasic_spFemto'

  readonly StepBasic_spAtto: 'StepBasic_spAtto'

StepBasic_SiUnit: declare class StepBasic_SiUnit extends StepBasic_NamedUnit

  // StepBasic_SiUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnit.Init (method)
  Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnit.SetPrefix (method)
  SetPrefix(aPrefix: StepBasic_SiPrefix): void;

  // StepBasic_SiUnit.UnSetPrefix (method)
  UnSetPrefix(): void;

  // StepBasic_SiUnit.Prefix (method)
  Prefix(): StepBasic_SiPrefix;

  // StepBasic_SiUnit.HasPrefix (method)
  HasPrefix(): boolean;

  // StepBasic_SiUnit.SetName (method)
  SetName(aName: StepBasic_SiUnitName): void;

  // StepBasic_SiUnit.Name (method)
  Name(): StepBasic_SiUnitName;

  // StepBasic_SiUnit.SetDimensions (method)
  SetDimensions(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnit.Dimensions (method)
  Dimensions(): StepBasic_DimensionalExponents;

  // StepBasic_SiUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndAreaUnit: declare class StepBasic_SiUnitAndAreaUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndAreaUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndAreaUnit.SetAreaUnit (method)
  SetAreaUnit(anAreaUnit: StepBasic_AreaUnit): void;

  // StepBasic_SiUnitAndAreaUnit.AreaUnit (method)
  AreaUnit(): StepBasic_AreaUnit;

  // StepBasic_SiUnitAndAreaUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndAreaUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndAreaUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndAreaUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndAreaUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndLengthUnit: declare class StepBasic_SiUnitAndLengthUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndLengthUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndLengthUnit.Init (method)
  Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnitAndLengthUnit.SetLengthUnit (method)
  SetLengthUnit(aLengthUnit: StepBasic_LengthUnit): void;

  // StepBasic_SiUnitAndLengthUnit.LengthUnit (method)
  LengthUnit(): StepBasic_LengthUnit;

  // StepBasic_SiUnitAndLengthUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndLengthUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndLengthUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndLengthUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndLengthUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndMassUnit: declare class StepBasic_SiUnitAndMassUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndMassUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndMassUnit.Init (method)
  Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnitAndMassUnit.SetMassUnit (method)
  SetMassUnit(aMassUnit: StepBasic_MassUnit): void;

  // StepBasic_SiUnitAndMassUnit.MassUnit (method)
  MassUnit(): StepBasic_MassUnit;

  // StepBasic_SiUnitAndMassUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndMassUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndMassUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndMassUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndMassUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndPlaneAngleUnit: declare class StepBasic_SiUnitAndPlaneAngleUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndPlaneAngleUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndPlaneAngleUnit.Init (method)
  Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnitAndPlaneAngleUnit.SetPlaneAngleUnit (method)
  SetPlaneAngleUnit(aPlaneAngleUnit: StepBasic_PlaneAngleUnit): void;

  // StepBasic_SiUnitAndPlaneAngleUnit.PlaneAngleUnit (method)
  PlaneAngleUnit(): StepBasic_PlaneAngleUnit;

  // StepBasic_SiUnitAndPlaneAngleUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndPlaneAngleUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndPlaneAngleUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndPlaneAngleUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndPlaneAngleUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndRatioUnit: declare class StepBasic_SiUnitAndRatioUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndRatioUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndRatioUnit.Init (method)
  Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnitAndRatioUnit.SetRatioUnit (method)
  SetRatioUnit(aRatioUnit: StepBasic_RatioUnit): void;

  // StepBasic_SiUnitAndRatioUnit.RatioUnit (method)
  RatioUnit(): StepBasic_RatioUnit;

  // StepBasic_SiUnitAndRatioUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndRatioUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndRatioUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndRatioUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndRatioUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndSolidAngleUnit: declare class StepBasic_SiUnitAndSolidAngleUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndSolidAngleUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndSolidAngleUnit.Init (method)
  Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnitAndSolidAngleUnit.SetSolidAngleUnit (method)
  SetSolidAngleUnit(aSolidAngleUnit: StepBasic_SolidAngleUnit): void;

  // StepBasic_SiUnitAndSolidAngleUnit.SolidAngleUnit (method)
  SolidAngleUnit(): StepBasic_SolidAngleUnit;

  // StepBasic_SiUnitAndSolidAngleUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndSolidAngleUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndSolidAngleUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndSolidAngleUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndSolidAngleUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndThermodynamicTemperatureUnit: declare class StepBasic_SiUnitAndThermodynamicTemperatureUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.Init (method)
  Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.SetThermodynamicTemperatureUnit (method)
  SetThermodynamicTemperatureUnit(aThermodynamicTemperatureUnit: StepBasic_ThermodynamicTemperatureUnit): void;

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.ThermodynamicTemperatureUnit (method)
  ThermodynamicTemperatureUnit(): StepBasic_ThermodynamicTemperatureUnit;

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndThermodynamicTemperatureUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndTimeUnit: declare class StepBasic_SiUnitAndTimeUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndTimeUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndTimeUnit.Init (method)
  Init(hasAprefix: boolean, aPrefix: StepBasic_SiPrefix, aName: StepBasic_SiUnitName): void;
  Init(aDimensions: StepBasic_DimensionalExponents): void;

  // StepBasic_SiUnitAndTimeUnit.SetTimeUnit (method)
  SetTimeUnit(aTimeUnit: StepBasic_TimeUnit): void;

  // StepBasic_SiUnitAndTimeUnit.TimeUnit (method)
  TimeUnit(): StepBasic_TimeUnit;

  // StepBasic_SiUnitAndTimeUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndTimeUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndTimeUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndTimeUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndTimeUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitAndVolumeUnit: declare class StepBasic_SiUnitAndVolumeUnit extends StepBasic_SiUnit

  // StepBasic_SiUnitAndVolumeUnit.constructor (constructor)
  constructor();

  // StepBasic_SiUnitAndVolumeUnit.SetVolumeUnit (method)
  SetVolumeUnit(aVolumeUnit: StepBasic_VolumeUnit): void;

  // StepBasic_SiUnitAndVolumeUnit.VolumeUnit (method)
  VolumeUnit(): StepBasic_VolumeUnit;

  // StepBasic_SiUnitAndVolumeUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SiUnitAndVolumeUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SiUnitAndVolumeUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SiUnitAndVolumeUnit.delete (method)
  delete(): void;

  // StepBasic_SiUnitAndVolumeUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SiUnitName: typeof StepBasic_SiUnitName[keyof typeof StepBasic_SiUnitName]

  readonly StepBasic_sunMetre: 'StepBasic_sunMetre'

  readonly StepBasic_sunGram: 'StepBasic_sunGram'

  readonly StepBasic_sunSecond: 'StepBasic_sunSecond'

  readonly StepBasic_sunAmpere: 'StepBasic_sunAmpere'

  readonly StepBasic_sunKelvin: 'StepBasic_sunKelvin'

  readonly StepBasic_sunMole: 'StepBasic_sunMole'

  readonly StepBasic_sunCandela: 'StepBasic_sunCandela'

  readonly StepBasic_sunRadian: 'StepBasic_sunRadian'

  readonly StepBasic_sunSteradian: 'StepBasic_sunSteradian'

  readonly StepBasic_sunHertz: 'StepBasic_sunHertz'

  readonly StepBasic_sunNewton: 'StepBasic_sunNewton'

  readonly StepBasic_sunPascal: 'StepBasic_sunPascal'

  readonly StepBasic_sunJoule: 'StepBasic_sunJoule'

  readonly StepBasic_sunWatt: 'StepBasic_sunWatt'

  readonly StepBasic_sunCoulomb: 'StepBasic_sunCoulomb'

  readonly StepBasic_sunVolt: 'StepBasic_sunVolt'

  readonly StepBasic_sunFarad: 'StepBasic_sunFarad'

  readonly StepBasic_sunOhm: 'StepBasic_sunOhm'

  readonly StepBasic_sunSiemens: 'StepBasic_sunSiemens'

  readonly StepBasic_sunWeber: 'StepBasic_sunWeber'

  readonly StepBasic_sunTesla: 'StepBasic_sunTesla'

  readonly StepBasic_sunHenry: 'StepBasic_sunHenry'

  readonly StepBasic_sunDegreeCelsius: 'StepBasic_sunDegreeCelsius'

  readonly StepBasic_sunLumen: 'StepBasic_sunLumen'

  readonly StepBasic_sunLux: 'StepBasic_sunLux'

  readonly StepBasic_sunBecquerel: 'StepBasic_sunBecquerel'

  readonly StepBasic_sunGray: 'StepBasic_sunGray'

  readonly StepBasic_sunSievert: 'StepBasic_sunSievert'

StepBasic_SizeMember: declare class StepBasic_SizeMember extends StepData_SelectReal

  // StepBasic_SizeMember.constructor (constructor)
  constructor();

  // StepBasic_SizeMember.HasName (method)
  HasName(): boolean;

  // StepBasic_SizeMember.Name (method)
  Name(): string;

  // StepBasic_SizeMember.SetName (method)
  SetName(name: string): boolean;

  // StepBasic_SizeMember.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SizeMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SizeMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SizeMember.delete (method)
  delete(): void;

  // StepBasic_SizeMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SizeSelect: declare class StepBasic_SizeSelect extends StepData_SelectType

  // StepBasic_SizeSelect.constructor (constructor)
  constructor();

  // StepBasic_SizeSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepBasic_SizeSelect.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepBasic_SizeSelect.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepBasic_SizeSelect.SetRealValue (method)
  SetRealValue(aReal: number): void;

  // StepBasic_SizeSelect.RealValue (method)
  RealValue(): number;

  // StepBasic_SizeSelect.delete (method)
  delete(): void;

  // StepBasic_SizeSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SolidAngleMeasureWithUnit: declare class StepBasic_SolidAngleMeasureWithUnit extends StepBasic_MeasureWithUnit

  // StepBasic_SolidAngleMeasureWithUnit.constructor (constructor)
  constructor();

  // StepBasic_SolidAngleMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SolidAngleMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SolidAngleMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SolidAngleMeasureWithUnit.delete (method)
  delete(): void;

  // StepBasic_SolidAngleMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_SolidAngleUnit: declare class StepBasic_SolidAngleUnit extends StepBasic_NamedUnit

  // StepBasic_SolidAngleUnit.constructor (constructor)
  constructor();

  // StepBasic_SolidAngleUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_SolidAngleUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_SolidAngleUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_SolidAngleUnit.delete (method)
  delete(): void;

  // StepBasic_SolidAngleUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Source: typeof StepBasic_Source[keyof typeof StepBasic_Source]

  readonly StepBasic_sMade: 'StepBasic_sMade'

  readonly StepBasic_sBought: 'StepBasic_sBought'

  readonly StepBasic_sNotKnown: 'StepBasic_sNotKnown'

StepBasic_SourceItem: declare class StepBasic_SourceItem extends StepData_SelectType

  // StepBasic_SourceItem.constructor (constructor)
  constructor();

  // StepBasic_SourceItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepBasic_SourceItem.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepBasic_SourceItem.Identifier (method)
  Identifier(): TCollection_HAsciiString;

  // StepBasic_SourceItem.delete (method)
  delete(): void;

  // StepBasic_SourceItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_ThermodynamicTemperatureUnit: declare class StepBasic_ThermodynamicTemperatureUnit extends StepBasic_NamedUnit

  // StepBasic_ThermodynamicTemperatureUnit.constructor (constructor)
  constructor();

  // StepBasic_ThermodynamicTemperatureUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_ThermodynamicTemperatureUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_ThermodynamicTemperatureUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_ThermodynamicTemperatureUnit.delete (method)
  delete(): void;

  // StepBasic_ThermodynamicTemperatureUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_TimeMeasureWithUnit: declare class StepBasic_TimeMeasureWithUnit extends StepBasic_MeasureWithUnit

  // StepBasic_TimeMeasureWithUnit.constructor (constructor)
  constructor();

  // StepBasic_TimeMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_TimeMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_TimeMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_TimeMeasureWithUnit.delete (method)
  delete(): void;

  // StepBasic_TimeMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_TimeUnit: declare class StepBasic_TimeUnit extends StepBasic_NamedUnit

  // StepBasic_TimeUnit.constructor (constructor)
  constructor();

  // StepBasic_TimeUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_TimeUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_TimeUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_TimeUnit.delete (method)
  delete(): void;

  // StepBasic_TimeUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_UncertaintyMeasureWithUnit: declare class StepBasic_UncertaintyMeasureWithUnit extends StepBasic_MeasureWithUnit

  // StepBasic_UncertaintyMeasureWithUnit.constructor (constructor)
  constructor();

  // StepBasic_UncertaintyMeasureWithUnit.Init (method)
  Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;
  Init(aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;

  // StepBasic_UncertaintyMeasureWithUnit.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepBasic_UncertaintyMeasureWithUnit.Name (method)
  Name(): TCollection_HAsciiString;

  // StepBasic_UncertaintyMeasureWithUnit.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepBasic_UncertaintyMeasureWithUnit.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_UncertaintyMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_UncertaintyMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_UncertaintyMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_UncertaintyMeasureWithUnit.delete (method)
  delete(): void;

  // StepBasic_UncertaintyMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_Unit: declare class StepBasic_Unit extends StepData_SelectType

  // StepBasic_Unit.constructor (constructor)
  constructor();

  // StepBasic_Unit.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepBasic_Unit.NamedUnit (method)
  NamedUnit(): StepBasic_NamedUnit;

  // StepBasic_Unit.DerivedUnit (method)
  DerivedUnit(): StepBasic_DerivedUnit;

  // StepBasic_Unit.delete (method)
  delete(): void;

  // StepBasic_Unit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepBasic_VersionedActionRequest: declare class StepBasic_VersionedActionRequest extends Standard_Transient

  // StepBasic_VersionedActionRequest.constructor (constructor)
  constructor();

  // StepBasic_VersionedActionRequest.Init (method)
  Init(aId: TCollection_HAsciiString, aVersion: TCollection_HAsciiString, aPurpose: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepBasic_VersionedActionRequest.Id (method)
  Id(): TCollection_HAsciiString;

  // StepBasic_VersionedActionRequest.SetId (method)
  SetId(Id: TCollection_HAsciiString): void;

  // StepBasic_VersionedActionRequest.Version (method)
  Version(): TCollection_HAsciiString;

  // StepBasic_VersionedActionRequest.SetVersion (method)
  SetVersion(Version: TCollection_HAsciiString): void;

  // StepBasic_VersionedActionRequest.Purpose (method)
  Purpose(): TCollection_HAsciiString;

  // StepBasic_VersionedActionRequest.SetPurpose (method)
  SetPurpose(Purpose: TCollection_HAsciiString): void;

  // StepBasic_VersionedActionRequest.Description (method)
  Description(): TCollection_HAsciiString;

  // StepBasic_VersionedActionRequest.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepBasic_VersionedActionRequest.HasDescription (method)
  HasDescription(): boolean;

  // StepBasic_VersionedActionRequest.get_type_name (method)
  static get_type_name(): string;

  // StepBasic_VersionedActionRequest.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepBasic_VersionedActionRequest.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepBasic_VersionedActionRequest.delete (method)
  delete(): void;

  // StepBasic_VersionedActionRequest.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
