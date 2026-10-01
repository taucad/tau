# libcascade — StepAP214 (2)

47 top-level symbols. Signatures are verbatim typescript.

StepAP214_DateAndTimeItem: declare class StepAP214_DateAndTimeItem extends StepAP214_ApprovalItem

  // StepAP214_DateAndTimeItem.constructor (constructor)
  constructor();

  // StepAP214_DateAndTimeItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_DateAndTimeItem.ApprovalPersonOrganization (method)
  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  // StepAP214_DateAndTimeItem.AppliedPersonAndOrganizationAssignment (method)
  AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

  // StepAP214_DateAndTimeItem.AppliedOrganizationAssignment (method)
  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  // StepAP214_DateAndTimeItem.delete (method)
  delete(): void;

  // StepAP214_DateAndTimeItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_DateItem: declare class StepAP214_DateItem extends StepAP214_ApprovalItem

  // StepAP214_DateItem.constructor (constructor)
  constructor();

  // StepAP214_DateItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_DateItem.ApprovalPersonOrganization (method)
  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  // StepAP214_DateItem.AppliedPersonAndOrganizationAssignment (method)
  AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

  // StepAP214_DateItem.AppliedOrganizationAssignment (method)
  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  // StepAP214_DateItem.AppliedSecurityClassificationAssignment (method)
  AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

  // StepAP214_DateItem.delete (method)
  delete(): void;

  // StepAP214_DateItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_DocumentReferenceItem: declare class StepAP214_DocumentReferenceItem extends StepData_SelectType

  // StepAP214_DocumentReferenceItem.constructor (constructor)
  constructor();

  // StepAP214_DocumentReferenceItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_DocumentReferenceItem.Approval (method)
  Approval(): StepBasic_Approval;

  // StepAP214_DocumentReferenceItem.DescriptiveRepresentationItem (method)
  DescriptiveRepresentationItem(): StepRepr_DescriptiveRepresentationItem;

  // StepAP214_DocumentReferenceItem.MaterialDesignation (method)
  MaterialDesignation(): StepRepr_MaterialDesignation;

  // StepAP214_DocumentReferenceItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_DocumentReferenceItem.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepAP214_DocumentReferenceItem.PropertyDefinition (method)
  PropertyDefinition(): StepRepr_PropertyDefinition;

  // StepAP214_DocumentReferenceItem.Representation (method)
  Representation(): StepRepr_Representation;

  // StepAP214_DocumentReferenceItem.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepAP214_DocumentReferenceItem.ShapeAspectRelationship (method)
  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  // StepAP214_DocumentReferenceItem.AppliedExternalIdentificationAssignment (method)
  AppliedExternalIdentificationAssignment(): StepAP214_AppliedExternalIdentificationAssignment;

  // StepAP214_DocumentReferenceItem.AssemblyComponentUsage (method)
  AssemblyComponentUsage(): StepRepr_AssemblyComponentUsage;

  // StepAP214_DocumentReferenceItem.CharacterizedObject (method)
  CharacterizedObject(): StepBasic_CharacterizedObject;

  // StepAP214_DocumentReferenceItem.DimensionalSize (method)
  DimensionalSize(): StepShape_DimensionalSize;

  // StepAP214_DocumentReferenceItem.ExternallyDefinedItem (method)
  ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

  // StepAP214_DocumentReferenceItem.Group (method)
  Group(): StepBasic_Group;

  // StepAP214_DocumentReferenceItem.GroupRelationship (method)
  GroupRelationship(): StepBasic_GroupRelationship;

  // StepAP214_DocumentReferenceItem.MeasureRepresentationItem (method)
  MeasureRepresentationItem(): StepRepr_MeasureRepresentationItem;

  // StepAP214_DocumentReferenceItem.ProductCategory (method)
  ProductCategory(): StepBasic_ProductCategory;

  // StepAP214_DocumentReferenceItem.ProductDefinitionContext (method)
  ProductDefinitionContext(): StepBasic_ProductDefinitionContext;

  // StepAP214_DocumentReferenceItem.RepresentationItem (method)
  RepresentationItem(): StepRepr_RepresentationItem;

  // StepAP214_DocumentReferenceItem.delete (method)
  delete(): void;

  // StepAP214_DocumentReferenceItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_ExternalIdentificationItem: declare class StepAP214_ExternalIdentificationItem extends StepData_SelectType

  // StepAP214_ExternalIdentificationItem.constructor (constructor)
  constructor();

  // StepAP214_ExternalIdentificationItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_ExternalIdentificationItem.DocumentFile (method)
  DocumentFile(): StepBasic_DocumentFile;

  // StepAP214_ExternalIdentificationItem.ExternallyDefinedClass (method)
  ExternallyDefinedClass(): StepAP214_ExternallyDefinedClass;

  // StepAP214_ExternalIdentificationItem.ExternallyDefinedGeneralProperty (method)
  ExternallyDefinedGeneralProperty(): StepAP214_ExternallyDefinedGeneralProperty;

  // StepAP214_ExternalIdentificationItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_ExternalIdentificationItem.AppliedOrganizationAssignment (method)
  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  // StepAP214_ExternalIdentificationItem.AppliedPersonAndOrganizationAssignment (method)
  AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

  // StepAP214_ExternalIdentificationItem.Approval (method)
  Approval(): StepBasic_Approval;

  // StepAP214_ExternalIdentificationItem.ApprovalStatus (method)
  ApprovalStatus(): StepBasic_ApprovalStatus;

  // StepAP214_ExternalIdentificationItem.ExternalSource (method)
  ExternalSource(): StepBasic_ExternalSource;

  // StepAP214_ExternalIdentificationItem.OrganizationalAddress (method)
  OrganizationalAddress(): StepBasic_OrganizationalAddress;

  // StepAP214_ExternalIdentificationItem.SecurityClassification (method)
  SecurityClassification(): StepBasic_SecurityClassification;

  // StepAP214_ExternalIdentificationItem.TrimmedCurve (method)
  TrimmedCurve(): StepGeom_TrimmedCurve;

  // StepAP214_ExternalIdentificationItem.VersionedActionRequest (method)
  VersionedActionRequest(): StepBasic_VersionedActionRequest;

  // StepAP214_ExternalIdentificationItem.DateAndTimeAssignment (method)
  DateAndTimeAssignment(): StepBasic_DateAndTimeAssignment;

  // StepAP214_ExternalIdentificationItem.DateAssignment (method)
  DateAssignment(): StepBasic_DateAssignment;

  // StepAP214_ExternalIdentificationItem.delete (method)
  delete(): void;

  // StepAP214_ExternalIdentificationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_ExternallyDefinedClass: declare class StepAP214_ExternallyDefinedClass extends StepAP214_Class

  // StepAP214_ExternallyDefinedClass.constructor (constructor)
  constructor();

  // StepAP214_ExternallyDefinedClass.Init (method)
  Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepAP214_ExternallyDefinedClass.ExternallyDefinedItem (method)
  ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

  // StepAP214_ExternallyDefinedClass.SetExternallyDefinedItem (method)
  SetExternallyDefinedItem(ExternallyDefinedItem: StepBasic_ExternallyDefinedItem): void;

  // StepAP214_ExternallyDefinedClass.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_ExternallyDefinedClass.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_ExternallyDefinedClass.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_ExternallyDefinedClass.delete (method)
  delete(): void;

  // StepAP214_ExternallyDefinedClass.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_ExternallyDefinedGeneralProperty: declare class StepAP214_ExternallyDefinedGeneralProperty extends StepBasic_GeneralProperty

  // StepAP214_ExternallyDefinedGeneralProperty.constructor (constructor)
  constructor();

  // StepAP214_ExternallyDefinedGeneralProperty.Init (method)
  Init(aGeneralProperty_Id: TCollection_HAsciiString, aGeneralProperty_Name: TCollection_HAsciiString, hasGeneralProperty_Description: boolean, aGeneralProperty_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepAP214_ExternallyDefinedGeneralProperty.ExternallyDefinedItem (method)
  ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

  // StepAP214_ExternallyDefinedGeneralProperty.SetExternallyDefinedItem (method)
  SetExternallyDefinedItem(ExternallyDefinedItem: StepBasic_ExternallyDefinedItem): void;

  // StepAP214_ExternallyDefinedGeneralProperty.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_ExternallyDefinedGeneralProperty.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_ExternallyDefinedGeneralProperty.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_ExternallyDefinedGeneralProperty.delete (method)
  delete(): void;

  // StepAP214_ExternallyDefinedGeneralProperty.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_GroupItem: declare class StepAP214_GroupItem extends StepData_SelectType

  // StepAP214_GroupItem.constructor (constructor)
  constructor();

  // StepAP214_GroupItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_GroupItem.GeometricRepresentationItem (method)
  GeometricRepresentationItem(): StepGeom_GeometricRepresentationItem;

  // StepAP214_GroupItem.GroupRelationship (method)
  GroupRelationship(): StepBasic_GroupRelationship;

  // StepAP214_GroupItem.MappedItem (method)
  MappedItem(): StepRepr_MappedItem;

  // StepAP214_GroupItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_GroupItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP214_GroupItem.PropertyDefinitionRepresentation (method)
  PropertyDefinitionRepresentation(): StepRepr_PropertyDefinitionRepresentation;

  // StepAP214_GroupItem.Representation (method)
  Representation(): StepRepr_Representation;

  // StepAP214_GroupItem.RepresentationItem (method)
  RepresentationItem(): StepRepr_RepresentationItem;

  // StepAP214_GroupItem.RepresentationRelationshipWithTransformation (method)
  RepresentationRelationshipWithTransformation(): StepRepr_RepresentationRelationshipWithTransformation;

  // StepAP214_GroupItem.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepAP214_GroupItem.ShapeAspectRelationship (method)
  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  // StepAP214_GroupItem.ShapeRepresentationRelationship (method)
  ShapeRepresentationRelationship(): StepRepr_ShapeRepresentationRelationship;

  // StepAP214_GroupItem.StyledItem (method)
  StyledItem(): StepVisual_StyledItem;

  // StepAP214_GroupItem.TopologicalRepresentationItem (method)
  TopologicalRepresentationItem(): StepShape_TopologicalRepresentationItem;

  // StepAP214_GroupItem.delete (method)
  delete(): void;

  // StepAP214_GroupItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_OrganizationItem: declare class StepAP214_OrganizationItem extends StepAP214_ApprovalItem

  // StepAP214_OrganizationItem.constructor (constructor)
  constructor();

  // StepAP214_OrganizationItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_OrganizationItem.AppliedOrganizationAssignment (method)
  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  // StepAP214_OrganizationItem.Approval (method)
  Approval(): StepBasic_Approval;

  // StepAP214_OrganizationItem.AppliedSecurityClassificationAssignment (method)
  AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

  // StepAP214_OrganizationItem.delete (method)
  delete(): void;

  // StepAP214_OrganizationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_PersonAndOrganizationItem: declare class StepAP214_PersonAndOrganizationItem extends StepAP214_ApprovalItem

  // StepAP214_PersonAndOrganizationItem.constructor (constructor)
  constructor();

  // StepAP214_PersonAndOrganizationItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_PersonAndOrganizationItem.AppliedOrganizationAssignment (method)
  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  // StepAP214_PersonAndOrganizationItem.AppliedSecurityClassificationAssignment (method)
  AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

  // StepAP214_PersonAndOrganizationItem.Approval (method)
  Approval(): StepBasic_Approval;

  // StepAP214_PersonAndOrganizationItem.delete (method)
  delete(): void;

  // StepAP214_PersonAndOrganizationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_PresentedItemSelect: declare class StepAP214_PresentedItemSelect extends StepData_SelectType

  // StepAP214_PresentedItemSelect.constructor (constructor)
  constructor();

  // StepAP214_PresentedItemSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_PresentedItemSelect.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepAP214_PresentedItemSelect.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_PresentedItemSelect.delete (method)
  delete(): void;

  // StepAP214_PresentedItemSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_Protocol: declare class StepAP214_Protocol extends StepData_Protocol

  // StepAP214_Protocol.constructor (constructor)
  constructor();

  // StepAP214_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // StepAP214_Protocol.SchemaName (method)
  SchemaName(theModel: Interface_InterfaceModel): string;

  // StepAP214_Protocol.NbResources (method)
  NbResources(): number;

  // StepAP214_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // StepAP214_Protocol.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_Protocol.delete (method)
  delete(): void;

  // StepAP214_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_RepItemGroup: declare class StepAP214_RepItemGroup extends StepBasic_Group

  // StepAP214_RepItemGroup.constructor (constructor)
  constructor();

  // StepAP214_RepItemGroup.Init (method)
  Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aRepresentationItem_Name: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  // StepAP214_RepItemGroup.RepresentationItem (method)
  RepresentationItem(): StepRepr_RepresentationItem;

  // StepAP214_RepItemGroup.SetRepresentationItem (method)
  SetRepresentationItem(RepresentationItem: StepRepr_RepresentationItem): void;

  // StepAP214_RepItemGroup.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_RepItemGroup.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_RepItemGroup.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_RepItemGroup.delete (method)
  delete(): void;

  // StepAP214_RepItemGroup.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_SecurityClassificationItem: declare class StepAP214_SecurityClassificationItem extends StepAP214_ApprovalItem

  // StepAP214_SecurityClassificationItem.constructor (constructor)
  constructor();

  // StepAP214_SecurityClassificationItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_SecurityClassificationItem.Action (method)
  Action(): StepBasic_Action;

  // StepAP214_SecurityClassificationItem.AssemblyComponentUsage (method)
  AssemblyComponentUsage(): StepRepr_AssemblyComponentUsage;

  // StepAP214_SecurityClassificationItem.ConfigurationDesign (method)
  ConfigurationDesign(): StepRepr_ConfigurationDesign;

  // StepAP214_SecurityClassificationItem.ConfigurationEffectivity (method)
  ConfigurationEffectivity(): StepRepr_ConfigurationEffectivity;

  // StepAP214_SecurityClassificationItem.DraughtingModel (method)
  DraughtingModel(): StepVisual_DraughtingModel;

  // StepAP214_SecurityClassificationItem.GeneralProperty (method)
  GeneralProperty(): StepBasic_GeneralProperty;

  // StepAP214_SecurityClassificationItem.MakeFromUsageOption (method)
  MakeFromUsageOption(): StepRepr_MakeFromUsageOption;

  // StepAP214_SecurityClassificationItem.ProductConcept (method)
  ProductConcept(): StepRepr_ProductConcept;

  // StepAP214_SecurityClassificationItem.ProductDefinitionUsage (method)
  ProductDefinitionUsage(): StepRepr_ProductDefinitionUsage;

  // StepAP214_SecurityClassificationItem.VersionedActionRequest (method)
  VersionedActionRequest(): StepBasic_VersionedActionRequest;

  // StepAP214_SecurityClassificationItem.delete (method)
  delete(): void;

  // StepAP214_SecurityClassificationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_Array1OfApprovalItem: NCollection_Array1_StepAP214_ApprovalItem

StepAP214_Array1OfAutoDesignDateAndPersonItem: NCollection_Array1_StepAP214_AutoDesignDateAndPersonItem

StepAP214_Array1OfAutoDesignDateAndTimeItem: NCollection_Array1_StepAP214_AutoDesignDateAndTimeItem

StepAP214_Array1OfAutoDesignDatedItem: NCollection_Array1_StepAP214_AutoDesignDatedItem

StepAP214_Array1OfAutoDesignGeneralOrgItem: NCollection_Array1_StepAP214_AutoDesignGeneralOrgItem

StepAP214_Array1OfAutoDesignGroupedItem: NCollection_Array1_StepAP214_AutoDesignGroupedItem

StepAP214_Array1OfAutoDesignPresentedItemSelect: NCollection_Array1_StepAP214_AutoDesignPresentedItemSelect

StepAP214_Array1OfAutoDesignReferencingItem: NCollection_Array1_StepAP214_AutoDesignReferencingItem

StepAP214_Array1OfDateAndTimeItem: NCollection_Array1_StepAP214_DateAndTimeItem

StepAP214_Array1OfDateItem: NCollection_Array1_StepAP214_DateItem

StepAP214_Array1OfDocumentReferenceItem: NCollection_Array1_StepAP214_DocumentReferenceItem

StepAP214_Array1OfExternalIdentificationItem: NCollection_Array1_StepAP214_ExternalIdentificationItem

StepAP214_Array1OfGroupItem: NCollection_Array1_StepAP214_GroupItem

StepAP214_Array1OfOrganizationItem: NCollection_Array1_StepAP214_OrganizationItem

StepAP214_Array1OfPersonAndOrganizationItem: NCollection_Array1_StepAP214_PersonAndOrganizationItem

StepAP214_Array1OfPresentedItemSelect: NCollection_Array1_StepAP214_PresentedItemSelect

StepAP214_Array1OfSecurityClassificationItem: NCollection_Array1_StepAP214_SecurityClassificationItem

StepAP214_HArray1OfApprovalItem: NCollection_HArray1_StepAP214_ApprovalItem

StepAP214_HArray1OfAutoDesignDateAndPersonItem: NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem

StepAP214_HArray1OfAutoDesignDateAndTimeItem: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem

StepAP214_HArray1OfAutoDesignDatedItem: NCollection_HArray1_StepAP214_AutoDesignDatedItem

StepAP214_HArray1OfAutoDesignGeneralOrgItem: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem

StepAP214_HArray1OfAutoDesignGroupedItem: NCollection_HArray1_StepAP214_AutoDesignGroupedItem

StepAP214_HArray1OfAutoDesignPresentedItemSelect: NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect

StepAP214_HArray1OfAutoDesignReferencingItem: NCollection_HArray1_StepAP214_AutoDesignReferencingItem

StepAP214_HArray1OfDateAndTimeItem: NCollection_HArray1_StepAP214_DateAndTimeItem

StepAP214_HArray1OfDateItem: NCollection_HArray1_StepAP214_DateItem

StepAP214_HArray1OfDocumentReferenceItem: NCollection_HArray1_StepAP214_DocumentReferenceItem

StepAP214_HArray1OfExternalIdentificationItem: NCollection_HArray1_StepAP214_ExternalIdentificationItem

StepAP214_HArray1OfGroupItem: NCollection_HArray1_StepAP214_GroupItem

StepAP214_HArray1OfOrganizationItem: NCollection_HArray1_StepAP214_OrganizationItem

StepAP214_HArray1OfPersonAndOrganizationItem: NCollection_HArray1_StepAP214_PersonAndOrganizationItem

StepAP214_HArray1OfPresentedItemSelect: NCollection_HArray1_StepAP214_PresentedItemSelect

StepAP214_HArray1OfSecurityClassificationItem: NCollection_HArray1_StepAP214_SecurityClassificationItem
