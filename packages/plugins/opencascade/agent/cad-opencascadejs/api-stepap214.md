# libcascade — StepAP214

28 top-level symbols. Signatures are verbatim typescript.

StepAP214: declare class StepAP214

  constructor

  static Protocol(): StepAP214_Protocol;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedApprovalAssignment: declare class StepAP214_AppliedApprovalAssignment extends StepBasic_ApprovalAssignment

  constructor

  Init(aAssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP214_ApprovalItem): void;
  Init(aAssignedApproval: StepBasic_Approval): void;
  Init(aAssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP214_ApprovalItem): void;
  Init(aAssignedApproval: StepBasic_Approval): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_ApprovalItem): void;

  Items(): NCollection_HArray1_StepAP214_ApprovalItem;

  ItemsValue(num: number): StepAP214_ApprovalItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedDateAndTimeAssignment: declare class StepAP214_AppliedDateAndTimeAssignment extends StepBasic_DateAndTimeAssignment

  constructor

  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_DateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_DateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_DateAndTimeItem): void;

  Items(): NCollection_HArray1_StepAP214_DateAndTimeItem;

  ItemsValue(num: number): StepAP214_DateAndTimeItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedDateAssignment: declare class StepAP214_AppliedDateAssignment extends StepBasic_DateAssignment

  constructor

  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_DateItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_DateItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_DateItem): void;

  Items(): NCollection_HArray1_StepAP214_DateItem;

  ItemsValue(num: number): StepAP214_DateItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedDocumentReference: declare class StepAP214_AppliedDocumentReference extends StepBasic_DocumentReference

  constructor

  Init(aAssignedDocument: StepBasic_Document, aSource: TCollection_HAsciiString, aItems: NCollection_HArray1_StepAP214_DocumentReferenceItem): void;

  Items(): NCollection_HArray1_StepAP214_DocumentReferenceItem;

  SetItems(aItems: NCollection_HArray1_StepAP214_DocumentReferenceItem): void;

  ItemsValue(num: number): StepAP214_DocumentReferenceItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedExternalIdentificationAssignment: declare class StepAP214_AppliedExternalIdentificationAssignment extends StepBasic_ExternalIdentificationAssignment

  constructor

  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aExternalIdentificationAssignment_Source: StepBasic_ExternalSource, aItems: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;
  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
  Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;
  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aExternalIdentificationAssignment_Source: StepBasic_ExternalSource, aItems: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;
  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
  Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;
  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aExternalIdentificationAssignment_Source: StepBasic_ExternalSource, aItems: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;
  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
  Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

  Items(): NCollection_HArray1_StepAP214_ExternalIdentificationItem;

  SetItems(Items: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedGroupAssignment: declare class StepAP214_AppliedGroupAssignment extends StepBasic_GroupAssignment

  constructor

  Init(aGroupAssignment_AssignedGroup: StepBasic_Group, aItems: NCollection_HArray1_StepAP214_GroupItem): void;
  Init(aAssignedGroup: StepBasic_Group): void;
  Init(aGroupAssignment_AssignedGroup: StepBasic_Group, aItems: NCollection_HArray1_StepAP214_GroupItem): void;
  Init(aAssignedGroup: StepBasic_Group): void;

  Items(): NCollection_HArray1_StepAP214_GroupItem;

  SetItems(Items: NCollection_HArray1_StepAP214_GroupItem): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedOrganizationAssignment: declare class StepAP214_AppliedOrganizationAssignment extends StepBasic_OrganizationAssignment

  constructor

  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole, aItems: NCollection_HArray1_StepAP214_OrganizationItem): void;
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole): void;
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole, aItems: NCollection_HArray1_StepAP214_OrganizationItem): void;
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_OrganizationItem): void;

  Items(): NCollection_HArray1_StepAP214_OrganizationItem;

  ItemsValue(num: number): StepAP214_OrganizationItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedPersonAndOrganizationAssignment: declare class StepAP214_AppliedPersonAndOrganizationAssignment extends StepBasic_PersonAndOrganizationAssignment

  constructor

  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_PersonAndOrganizationItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_PersonAndOrganizationItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_PersonAndOrganizationItem): void;

  Items(): NCollection_HArray1_StepAP214_PersonAndOrganizationItem;

  ItemsValue(num: number): StepAP214_PersonAndOrganizationItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedPresentedItem: declare class StepAP214_AppliedPresentedItem extends StepVisual_PresentedItem

  constructor

  Init(aItems: NCollection_HArray1_StepAP214_PresentedItemSelect): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_PresentedItemSelect): void;

  Items(): NCollection_HArray1_StepAP214_PresentedItemSelect;

  ItemsValue(num: number): StepAP214_PresentedItemSelect;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AppliedSecurityClassificationAssignment: declare class StepAP214_AppliedSecurityClassificationAssignment extends StepBasic_SecurityClassificationAssignment

  constructor

  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_StepAP214_SecurityClassificationItem): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_StepAP214_SecurityClassificationItem): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_SecurityClassificationItem): void;

  Items(): NCollection_HArray1_StepAP214_SecurityClassificationItem;

  ItemsValue(num: number): StepAP214_SecurityClassificationItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_ApprovalItem: declare class StepAP214_ApprovalItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  AssemblyComponentUsageSubstitute(): StepRepr_AssemblyComponentUsageSubstitute;

  DocumentFile(): StepBasic_DocumentFile;

  MaterialDesignation(): StepRepr_MaterialDesignation;

  MechanicalDesignGeometricPresentationRepresentation(): StepVisual_MechanicalDesignGeometricPresentationRepresentation;

  PresentationArea(): StepVisual_PresentationArea;

  Product(): StepBasic_Product;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  PropertyDefinition(): StepRepr_PropertyDefinition;

  ShapeRepresentation(): StepShape_ShapeRepresentation;

  SecurityClassification(): StepBasic_SecurityClassification;

  ConfigurationItem(): StepRepr_ConfigurationItem;

  Date(): StepBasic_Date;

  Document(): StepBasic_Document;

  Effectivity(): StepBasic_Effectivity;

  Group(): StepBasic_Group;

  GroupRelationship(): StepBasic_GroupRelationship;

  ProductDefinitionFormationRelationship(): StepBasic_ProductDefinitionFormationRelationship;

  Representation(): StepRepr_Representation;

  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignActualDateAndTimeAssignment: declare class StepAP214_AutoDesignActualDateAndTimeAssignment extends StepBasic_DateAndTimeAssignment

  constructor

  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem;

  ItemsValue(num: number): StepAP214_AutoDesignDateAndTimeItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignActualDateAssignment: declare class StepAP214_AutoDesignActualDateAssignment extends StepBasic_DateAssignment

  constructor

  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignDatedItem;

  ItemsValue(num: number): StepAP214_AutoDesignDatedItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignApprovalAssignment: declare class StepAP214_AutoDesignApprovalAssignment extends StepBasic_ApprovalAssignment

  constructor

  Init(aAssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedApproval: StepBasic_Approval): void;
  Init(aAssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedApproval: StepBasic_Approval): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem;

  ItemsValue(num: number): StepAP214_AutoDesignGeneralOrgItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignDateAndPersonAssignment: declare class StepAP214_AutoDesignDateAndPersonAssignment extends StepBasic_PersonAndOrganizationAssignment

  constructor

  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem;

  ItemsValue(num: number): StepAP214_AutoDesignDateAndPersonItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignDateAndPersonItem: declare class StepAP214_AutoDesignDateAndPersonItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  AutoDesignOrganizationAssignment(): StepAP214_AutoDesignOrganizationAssignment;

  Product(): StepBasic_Product;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  Representation(): StepRepr_Representation;

  AutoDesignDocumentReference(): StepAP214_AutoDesignDocumentReference;

  ExternallyDefinedRepresentation(): StepRepr_ExternallyDefinedRepresentation;

  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  ProductDefinitionWithAssociatedDocuments(): StepBasic_ProductDefinitionWithAssociatedDocuments;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignDateAndTimeItem: declare class StepAP214_AutoDesignDateAndTimeItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  AutoDesignDateAndPersonAssignment(): StepAP214_AutoDesignDateAndPersonAssignment;

  ProductDefinitionEffectivity(): StepBasic_ProductDefinitionEffectivity;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignDatedItem: declare class StepAP214_AutoDesignDatedItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  AutoDesignDateAndPersonAssignment(): StepAP214_AutoDesignDateAndPersonAssignment;

  ProductDefinitionEffectivity(): StepBasic_ProductDefinitionEffectivity;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignDocumentReference: declare class StepAP214_AutoDesignDocumentReference extends StepBasic_DocumentReference

  constructor

  Init(aAssignedDocument: StepBasic_Document, aSource: TCollection_HAsciiString, aItems: NCollection_HArray1_StepAP214_AutoDesignReferencingItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignReferencingItem;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignReferencingItem): void;

  ItemsValue(num: number): StepAP214_AutoDesignReferencingItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignGeneralOrgItem: declare class StepAP214_AutoDesignGeneralOrgItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Product(): StepBasic_Product;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  ProductDefinitionWithAssociatedDocuments(): StepBasic_ProductDefinitionWithAssociatedDocuments;

  Representation(): StepRepr_Representation;

  ExternallyDefinedRepresentation(): StepRepr_ExternallyDefinedRepresentation;

  AutoDesignDocumentReference(): StepAP214_AutoDesignDocumentReference;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignGroupAssignment: declare class StepAP214_AutoDesignGroupAssignment extends StepBasic_GroupAssignment

  constructor

  Init(aAssignedGroup: StepBasic_Group, aItems: NCollection_HArray1_StepAP214_AutoDesignGroupedItem): void;
  Init(aAssignedGroup: StepBasic_Group): void;
  Init(aAssignedGroup: StepBasic_Group, aItems: NCollection_HArray1_StepAP214_AutoDesignGroupedItem): void;
  Init(aAssignedGroup: StepBasic_Group): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignGroupedItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignGroupedItem;

  ItemsValue(num: number): StepAP214_AutoDesignGroupedItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignGroupedItem: declare class StepAP214_AutoDesignGroupedItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  AdvancedBrepShapeRepresentation(): StepShape_AdvancedBrepShapeRepresentation;

  CsgShapeRepresentation(): StepShape_CsgShapeRepresentation;

  FacetedBrepShapeRepresentation(): StepShape_FacetedBrepShapeRepresentation;

  GeometricallyBoundedSurfaceShapeRepresentation(): StepShape_GeometricallyBoundedSurfaceShapeRepresentation;

  GeometricallyBoundedWireframeShapeRepresentation(): StepShape_GeometricallyBoundedWireframeShapeRepresentation;

  ManifoldSurfaceShapeRepresentation(): StepShape_ManifoldSurfaceShapeRepresentation;

  Representation(): StepRepr_Representation;

  RepresentationItem(): StepRepr_RepresentationItem;

  ShapeAspect(): StepRepr_ShapeAspect;

  ShapeRepresentation(): StepShape_ShapeRepresentation;

  TemplateInstance(): StepVisual_TemplateInstance;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignNominalDateAndTimeAssignment: declare class StepAP214_AutoDesignNominalDateAndTimeAssignment extends StepBasic_DateAndTimeAssignment

  constructor

  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem;

  ItemsValue(num: number): StepAP214_AutoDesignDateAndTimeItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignNominalDateAssignment: declare class StepAP214_AutoDesignNominalDateAssignment extends StepBasic_DateAssignment

  constructor

  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignDatedItem;

  ItemsValue(num: number): StepAP214_AutoDesignDatedItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignOrganizationAssignment: declare class StepAP214_AutoDesignOrganizationAssignment extends StepBasic_OrganizationAssignment

  constructor

  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole): void;
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem;

  ItemsValue(num: number): StepAP214_AutoDesignGeneralOrgItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignOrganizationItem: declare class StepAP214_AutoDesignOrganizationItem extends StepAP214_AutoDesignGeneralOrgItem

  constructor

  CaseNum(ent: Standard_Transient): number;

  Document(): StepBasic_Document;

  PhysicallyModeledProductDefinition(): StepBasic_PhysicallyModeledProductDefinition;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignPersonAndOrganizationAssignment: declare class StepAP214_AutoDesignPersonAndOrganizationAssignment extends StepBasic_PersonAndOrganizationAssignment

  constructor

  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem;

  ItemsValue(num: number): StepAP214_AutoDesignGeneralOrgItem;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
