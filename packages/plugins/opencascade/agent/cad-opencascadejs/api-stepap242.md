# libcascade — StepAP242

6 top-level symbols. Signatures are verbatim typescript.

StepAP242_DraughtingModelItemAssociation: declare class StepAP242_DraughtingModelItemAssociation extends StepAP242_ItemIdentifiedRepresentationUsage

  // StepAP242_DraughtingModelItemAssociation.constructor (constructor)
  constructor();

  // StepAP242_DraughtingModelItemAssociation.get_type_name (method)
  static get_type_name(): string;

  // StepAP242_DraughtingModelItemAssociation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP242_DraughtingModelItemAssociation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP242_DraughtingModelItemAssociation.delete (method)
  delete(): void;

  // StepAP242_DraughtingModelItemAssociation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP242_GeometricItemSpecificUsage: declare class StepAP242_GeometricItemSpecificUsage extends StepAP242_ItemIdentifiedRepresentationUsage

  // StepAP242_GeometricItemSpecificUsage.constructor (constructor)
  constructor();

  // StepAP242_GeometricItemSpecificUsage.get_type_name (method)
  static get_type_name(): string;

  // StepAP242_GeometricItemSpecificUsage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP242_GeometricItemSpecificUsage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP242_GeometricItemSpecificUsage.delete (method)
  delete(): void;

  // StepAP242_GeometricItemSpecificUsage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP242_IdAttribute: declare class StepAP242_IdAttribute extends Standard_Transient

  // StepAP242_IdAttribute.constructor (constructor)
  constructor();

  // StepAP242_IdAttribute.Init (method)
  Init(theAttributeValue: TCollection_HAsciiString, theIdentifiedItem: StepAP242_IdAttributeSelect): void;

  // StepAP242_IdAttribute.SetAttributeValue (method)
  SetAttributeValue(theAttributeValue: TCollection_HAsciiString): void;

  // StepAP242_IdAttribute.AttributeValue (method)
  AttributeValue(): TCollection_HAsciiString;

  // StepAP242_IdAttribute.SetIdentifiedItem (method)
  SetIdentifiedItem(theIdentifiedItem: StepAP242_IdAttributeSelect): void;

  // StepAP242_IdAttribute.IdentifiedItem (method)
  IdentifiedItem(): StepAP242_IdAttributeSelect;

  // StepAP242_IdAttribute.get_type_name (method)
  static get_type_name(): string;

  // StepAP242_IdAttribute.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP242_IdAttribute.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP242_IdAttribute.delete (method)
  delete(): void;

  // StepAP242_IdAttribute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP242_IdAttributeSelect: declare class StepAP242_IdAttributeSelect extends StepData_SelectType

  // StepAP242_IdAttributeSelect.constructor (constructor)
  constructor();

  // StepAP242_IdAttributeSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP242_IdAttributeSelect.Action (method)
  Action(): StepBasic_Action;

  // StepAP242_IdAttributeSelect.Address (method)
  Address(): StepBasic_Address;

  // StepAP242_IdAttributeSelect.ApplicationContext (method)
  ApplicationContext(): StepBasic_ApplicationContext;

  // StepAP242_IdAttributeSelect.DimensionalSize (method)
  DimensionalSize(): StepShape_DimensionalSize;

  // StepAP242_IdAttributeSelect.GeometricTolerance (method)
  GeometricTolerance(): StepDimTol_GeometricTolerance;

  // StepAP242_IdAttributeSelect.Group (method)
  Group(): StepBasic_Group;

  // StepAP242_IdAttributeSelect.ProductCategory (method)
  ProductCategory(): StepBasic_ProductCategory;

  // StepAP242_IdAttributeSelect.PropertyDefinition (method)
  PropertyDefinition(): StepRepr_PropertyDefinition;

  // StepAP242_IdAttributeSelect.Representation (method)
  Representation(): StepRepr_Representation;

  // StepAP242_IdAttributeSelect.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepAP242_IdAttributeSelect.ShapeAspectRelationship (method)
  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  // StepAP242_IdAttributeSelect.delete (method)
  delete(): void;

  // StepAP242_IdAttributeSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP242_ItemIdentifiedRepresentationUsage: declare class StepAP242_ItemIdentifiedRepresentationUsage extends Standard_Transient

  // StepAP242_ItemIdentifiedRepresentationUsage.constructor (constructor)
  constructor();

  // StepAP242_ItemIdentifiedRepresentationUsage.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theDefinition: StepAP242_ItemIdentifiedRepresentationUsageDefinition, theUsedRepresentation: StepRepr_Representation, theIdentifiedItem: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

  // StepAP242_ItemIdentifiedRepresentationUsage.SetName (method)
  SetName(theName: TCollection_HAsciiString): void;

  // StepAP242_ItemIdentifiedRepresentationUsage.Name (method)
  Name(): TCollection_HAsciiString;

  // StepAP242_ItemIdentifiedRepresentationUsage.SetDescription (method)
  SetDescription(theDescription: TCollection_HAsciiString): void;

  // StepAP242_ItemIdentifiedRepresentationUsage.Description (method)
  Description(): TCollection_HAsciiString;

  // StepAP242_ItemIdentifiedRepresentationUsage.SetDefinition (method)
  SetDefinition(theDefinition: StepAP242_ItemIdentifiedRepresentationUsageDefinition): void;

  // StepAP242_ItemIdentifiedRepresentationUsage.Definition (method)
  Definition(): StepAP242_ItemIdentifiedRepresentationUsageDefinition;

  // StepAP242_ItemIdentifiedRepresentationUsage.SetUsedRepresentation (method)
  SetUsedRepresentation(theUsedRepresentation: StepRepr_Representation): void;

  // StepAP242_ItemIdentifiedRepresentationUsage.UsedRepresentation (method)
  UsedRepresentation(): StepRepr_Representation;

  // StepAP242_ItemIdentifiedRepresentationUsage.IdentifiedItem (method)
  IdentifiedItem(): NCollection_HArray1_handle_StepRepr_RepresentationItem;

  // StepAP242_ItemIdentifiedRepresentationUsage.NbIdentifiedItem (method)
  NbIdentifiedItem(): number;

  // StepAP242_ItemIdentifiedRepresentationUsage.SetIdentifiedItem (method)
  SetIdentifiedItem(theIdentifiedItem: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

  // StepAP242_ItemIdentifiedRepresentationUsage.IdentifiedItemValue (method)
  IdentifiedItemValue(num: number): StepRepr_RepresentationItem;

  // StepAP242_ItemIdentifiedRepresentationUsage.SetIdentifiedItemValue (method)
  SetIdentifiedItemValue(num: number, theItem: StepRepr_RepresentationItem): void;

  // StepAP242_ItemIdentifiedRepresentationUsage.get_type_name (method)
  static get_type_name(): string;

  // StepAP242_ItemIdentifiedRepresentationUsage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP242_ItemIdentifiedRepresentationUsage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP242_ItemIdentifiedRepresentationUsage.delete (method)
  delete(): void;

  // StepAP242_ItemIdentifiedRepresentationUsage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP242_ItemIdentifiedRepresentationUsageDefinition: declare class StepAP242_ItemIdentifiedRepresentationUsageDefinition extends StepData_SelectType

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.constructor (constructor)
  constructor();

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedApprovalAssignment (method)
  AppliedApprovalAssignment(): StepAP214_AppliedApprovalAssignment;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedDateAndTimeAssignment (method)
  AppliedDateAndTimeAssignment(): StepAP214_AppliedDateAndTimeAssignment;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedDateAssignment (method)
  AppliedDateAssignment(): StepAP214_AppliedDateAssignment;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedDocumentReference (method)
  AppliedDocumentReference(): StepAP214_AppliedDocumentReference;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedExternalIdentificationAssignment (method)
  AppliedExternalIdentificationAssignment(): StepAP214_AppliedExternalIdentificationAssignment;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedGroupAssignment (method)
  AppliedGroupAssignment(): StepAP214_AppliedGroupAssignment;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedOrganizationAssignment (method)
  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedPersonAndOrganizationAssignment (method)
  AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.AppliedSecurityClassificationAssignment (method)
  AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.DimensionalSize (method)
  DimensionalSize(): StepShape_DimensionalSize;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.GeneralProperty (method)
  GeneralProperty(): StepBasic_GeneralProperty;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.GeometricTolerance (method)
  GeometricTolerance(): StepDimTol_GeometricTolerance;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.PropertyDefinition (method)
  PropertyDefinition(): StepRepr_PropertyDefinition;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.PropertyDefinitionRelationship (method)
  PropertyDefinitionRelationship(): StepRepr_PropertyDefinitionRelationship;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.ShapeAspectRelationship (method)
  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.delete (method)
  delete(): void;

  // StepAP242_ItemIdentifiedRepresentationUsageDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
