# libcascade — StepAP214

33 top-level symbols. Signatures are verbatim typescript.

StepAP214: declare class StepAP214

  // StepAP214.constructor (constructor)
  constructor();

  // StepAP214.Protocol (method)
  static Protocol(): StepAP214_Protocol;

  // StepAP214.delete (method)
  delete(): void;

  // StepAP214.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedApprovalAssignment: declare class StepAP214_AppliedApprovalAssignment extends StepBasic_ApprovalAssignment

  // StepAP214_AppliedApprovalAssignment.constructor (constructor)
  constructor();

  // StepAP214_AppliedApprovalAssignment.Init (method)
  Init(aAssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP214_ApprovalItem): void;
  Init(aAssignedApproval: StepBasic_Approval): void;

  // StepAP214_AppliedApprovalAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_ApprovalItem): void;

  // StepAP214_AppliedApprovalAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_ApprovalItem;

  // StepAP214_AppliedApprovalAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_ApprovalItem;

  // StepAP214_AppliedApprovalAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AppliedApprovalAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedApprovalAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedApprovalAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedApprovalAssignment.delete (method)
  delete(): void;

  // StepAP214_AppliedApprovalAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedDateAndTimeAssignment: declare class StepAP214_AppliedDateAndTimeAssignment extends StepBasic_DateAndTimeAssignment

  // StepAP214_AppliedDateAndTimeAssignment.constructor (constructor)
  constructor();

  // StepAP214_AppliedDateAndTimeAssignment.Init (method)
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_DateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

  // StepAP214_AppliedDateAndTimeAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_DateAndTimeItem): void;

  // StepAP214_AppliedDateAndTimeAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_DateAndTimeItem;

  // StepAP214_AppliedDateAndTimeAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_DateAndTimeItem;

  // StepAP214_AppliedDateAndTimeAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AppliedDateAndTimeAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedDateAndTimeAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedDateAndTimeAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedDateAndTimeAssignment.delete (method)
  delete(): void;

  // StepAP214_AppliedDateAndTimeAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedDateAssignment: declare class StepAP214_AppliedDateAssignment extends StepBasic_DateAssignment

  // StepAP214_AppliedDateAssignment.constructor (constructor)
  constructor();

  // StepAP214_AppliedDateAssignment.Init (method)
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_DateItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;

  // StepAP214_AppliedDateAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_DateItem): void;

  // StepAP214_AppliedDateAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_DateItem;

  // StepAP214_AppliedDateAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_DateItem;

  // StepAP214_AppliedDateAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AppliedDateAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedDateAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedDateAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedDateAssignment.delete (method)
  delete(): void;

  // StepAP214_AppliedDateAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedDocumentReference: declare class StepAP214_AppliedDocumentReference extends StepBasic_DocumentReference

  // StepAP214_AppliedDocumentReference.constructor (constructor)
  constructor();

  // StepAP214_AppliedDocumentReference.Init (method)
  Init(aAssignedDocument: StepBasic_Document, aSource: TCollection_HAsciiString, aItems: NCollection_HArray1_StepAP214_DocumentReferenceItem): void;

  // StepAP214_AppliedDocumentReference.Items (method)
  Items(): NCollection_HArray1_StepAP214_DocumentReferenceItem;

  // StepAP214_AppliedDocumentReference.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_DocumentReferenceItem): void;

  // StepAP214_AppliedDocumentReference.ItemsValue (method)
  ItemsValue(num: number): StepAP214_DocumentReferenceItem;

  // StepAP214_AppliedDocumentReference.NbItems (method)
  NbItems(): number;

  // StepAP214_AppliedDocumentReference.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedDocumentReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedDocumentReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedDocumentReference.delete (method)
  delete(): void;

  // StepAP214_AppliedDocumentReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedExternalIdentificationAssignment: declare class StepAP214_AppliedExternalIdentificationAssignment extends StepBasic_ExternalIdentificationAssignment

  // StepAP214_AppliedExternalIdentificationAssignment.constructor (constructor)
  constructor();

  // StepAP214_AppliedExternalIdentificationAssignment.Init (method)
  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aExternalIdentificationAssignment_Source: StepBasic_ExternalSource, aItems: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;
  Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
  Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

  // StepAP214_AppliedExternalIdentificationAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_ExternalIdentificationItem;

  // StepAP214_AppliedExternalIdentificationAssignment.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;

  // StepAP214_AppliedExternalIdentificationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedExternalIdentificationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedExternalIdentificationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedExternalIdentificationAssignment.delete (method)
  delete(): void;

  // StepAP214_AppliedExternalIdentificationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedGroupAssignment: declare class StepAP214_AppliedGroupAssignment extends StepBasic_GroupAssignment

  // StepAP214_AppliedGroupAssignment.constructor (constructor)
  constructor();

  // StepAP214_AppliedGroupAssignment.Init (method)
  Init(aGroupAssignment_AssignedGroup: StepBasic_Group, aItems: NCollection_HArray1_StepAP214_GroupItem): void;
  Init(aAssignedGroup: StepBasic_Group): void;

  // StepAP214_AppliedGroupAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_GroupItem;

  // StepAP214_AppliedGroupAssignment.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP214_GroupItem): void;

  // StepAP214_AppliedGroupAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedGroupAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedGroupAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedGroupAssignment.delete (method)
  delete(): void;

  // StepAP214_AppliedGroupAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedOrganizationAssignment: declare class StepAP214_AppliedOrganizationAssignment extends StepBasic_OrganizationAssignment

  // StepAP214_AppliedOrganizationAssignment.constructor (constructor)
  constructor();

  // StepAP214_AppliedOrganizationAssignment.Init (method)
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole, aItems: NCollection_HArray1_StepAP214_OrganizationItem): void;
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole): void;

  // StepAP214_AppliedOrganizationAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_OrganizationItem): void;

  // StepAP214_AppliedOrganizationAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_OrganizationItem;

  // StepAP214_AppliedOrganizationAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_OrganizationItem;

  // StepAP214_AppliedOrganizationAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AppliedOrganizationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedOrganizationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedOrganizationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedOrganizationAssignment.delete (method)
  delete(): void;

  // StepAP214_AppliedOrganizationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedPersonAndOrganizationAssignment: declare class StepAP214_AppliedPersonAndOrganizationAssignment extends StepBasic_PersonAndOrganizationAssignment

  // StepAP214_AppliedPersonAndOrganizationAssignment.constructor (constructor)
  constructor();

  // StepAP214_AppliedPersonAndOrganizationAssignment.Init (method)
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_PersonAndOrganizationItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

  // StepAP214_AppliedPersonAndOrganizationAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_PersonAndOrganizationItem): void;

  // StepAP214_AppliedPersonAndOrganizationAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_PersonAndOrganizationItem;

  // StepAP214_AppliedPersonAndOrganizationAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_PersonAndOrganizationItem;

  // StepAP214_AppliedPersonAndOrganizationAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AppliedPersonAndOrganizationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedPersonAndOrganizationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedPersonAndOrganizationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedPersonAndOrganizationAssignment.delete (method)
  delete(): void;

  // StepAP214_AppliedPersonAndOrganizationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedPresentedItem: declare class StepAP214_AppliedPresentedItem extends StepVisual_PresentedItem

  // StepAP214_AppliedPresentedItem.constructor (constructor)
  constructor();

  // StepAP214_AppliedPresentedItem.Init (method)
  Init(aItems: NCollection_HArray1_StepAP214_PresentedItemSelect): void;

  // StepAP214_AppliedPresentedItem.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_PresentedItemSelect): void;

  // StepAP214_AppliedPresentedItem.Items (method)
  Items(): NCollection_HArray1_StepAP214_PresentedItemSelect;

  // StepAP214_AppliedPresentedItem.ItemsValue (method)
  ItemsValue(num: number): StepAP214_PresentedItemSelect;

  // StepAP214_AppliedPresentedItem.NbItems (method)
  NbItems(): number;

  // StepAP214_AppliedPresentedItem.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedPresentedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedPresentedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedPresentedItem.delete (method)
  delete(): void;

  // StepAP214_AppliedPresentedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AppliedSecurityClassificationAssignment: declare class StepAP214_AppliedSecurityClassificationAssignment extends StepBasic_SecurityClassificationAssignment

  // StepAP214_AppliedSecurityClassificationAssignment.constructor (constructor)
  constructor();

  // StepAP214_AppliedSecurityClassificationAssignment.Init (method)
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_StepAP214_SecurityClassificationItem): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

  // StepAP214_AppliedSecurityClassificationAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_SecurityClassificationItem): void;

  // StepAP214_AppliedSecurityClassificationAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_SecurityClassificationItem;

  // StepAP214_AppliedSecurityClassificationAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_SecurityClassificationItem;

  // StepAP214_AppliedSecurityClassificationAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AppliedSecurityClassificationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AppliedSecurityClassificationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AppliedSecurityClassificationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AppliedSecurityClassificationAssignment.delete (method)
  delete(): void;

  // StepAP214_AppliedSecurityClassificationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_ApprovalItem: declare class StepAP214_ApprovalItem extends StepData_SelectType

  // StepAP214_ApprovalItem.constructor (constructor)
  constructor();

  // StepAP214_ApprovalItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_ApprovalItem.AssemblyComponentUsageSubstitute (method)
  AssemblyComponentUsageSubstitute(): StepRepr_AssemblyComponentUsageSubstitute;

  // StepAP214_ApprovalItem.DocumentFile (method)
  DocumentFile(): StepBasic_DocumentFile;

  // StepAP214_ApprovalItem.MaterialDesignation (method)
  MaterialDesignation(): StepRepr_MaterialDesignation;

  // StepAP214_ApprovalItem.MechanicalDesignGeometricPresentationRepresentation (method)
  MechanicalDesignGeometricPresentationRepresentation(): StepVisual_MechanicalDesignGeometricPresentationRepresentation;

  // StepAP214_ApprovalItem.PresentationArea (method)
  PresentationArea(): StepVisual_PresentationArea;

  // StepAP214_ApprovalItem.Product (method)
  Product(): StepBasic_Product;

  // StepAP214_ApprovalItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_ApprovalItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP214_ApprovalItem.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepAP214_ApprovalItem.PropertyDefinition (method)
  PropertyDefinition(): StepRepr_PropertyDefinition;

  // StepAP214_ApprovalItem.ShapeRepresentation (method)
  ShapeRepresentation(): StepShape_ShapeRepresentation;

  // StepAP214_ApprovalItem.SecurityClassification (method)
  SecurityClassification(): StepBasic_SecurityClassification;

  // StepAP214_ApprovalItem.ConfigurationItem (method)
  ConfigurationItem(): StepRepr_ConfigurationItem;

  // StepAP214_ApprovalItem.Date (method)
  Date(): StepBasic_Date;

  // StepAP214_ApprovalItem.Document (method)
  Document(): StepBasic_Document;

  // StepAP214_ApprovalItem.Effectivity (method)
  Effectivity(): StepBasic_Effectivity;

  // StepAP214_ApprovalItem.Group (method)
  Group(): StepBasic_Group;

  // StepAP214_ApprovalItem.GroupRelationship (method)
  GroupRelationship(): StepBasic_GroupRelationship;

  // StepAP214_ApprovalItem.ProductDefinitionFormationRelationship (method)
  ProductDefinitionFormationRelationship(): StepBasic_ProductDefinitionFormationRelationship;

  // StepAP214_ApprovalItem.Representation (method)
  Representation(): StepRepr_Representation;

  // StepAP214_ApprovalItem.ShapeAspectRelationship (method)
  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  // StepAP214_ApprovalItem.delete (method)
  delete(): void;

  // StepAP214_ApprovalItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignActualDateAndTimeAssignment: declare class StepAP214_AutoDesignActualDateAndTimeAssignment extends StepBasic_DateAndTimeAssignment

  // StepAP214_AutoDesignActualDateAndTimeAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignActualDateAndTimeAssignment.Init (method)
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignDateAndTimeItem;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignActualDateAndTimeAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignActualDateAssignment: declare class StepAP214_AutoDesignActualDateAssignment extends StepBasic_DateAssignment

  // StepAP214_AutoDesignActualDateAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignActualDateAssignment.Init (method)
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;

  // StepAP214_AutoDesignActualDateAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;

  // StepAP214_AutoDesignActualDateAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignDatedItem;

  // StepAP214_AutoDesignActualDateAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignDatedItem;

  // StepAP214_AutoDesignActualDateAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignActualDateAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignActualDateAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignActualDateAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignActualDateAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignActualDateAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignApprovalAssignment: declare class StepAP214_AutoDesignApprovalAssignment extends StepBasic_ApprovalAssignment

  // StepAP214_AutoDesignApprovalAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignApprovalAssignment.Init (method)
  Init(aAssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedApproval: StepBasic_Approval): void;

  // StepAP214_AutoDesignApprovalAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;

  // StepAP214_AutoDesignApprovalAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem;

  // StepAP214_AutoDesignApprovalAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignGeneralOrgItem;

  // StepAP214_AutoDesignApprovalAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignApprovalAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignApprovalAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignApprovalAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignApprovalAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignApprovalAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignDateAndPersonAssignment: declare class StepAP214_AutoDesignDateAndPersonAssignment extends StepBasic_PersonAndOrganizationAssignment

  // StepAP214_AutoDesignDateAndPersonAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignDateAndPersonAssignment.Init (method)
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

  // StepAP214_AutoDesignDateAndPersonAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem): void;

  // StepAP214_AutoDesignDateAndPersonAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignDateAndPersonItem;

  // StepAP214_AutoDesignDateAndPersonAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignDateAndPersonItem;

  // StepAP214_AutoDesignDateAndPersonAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignDateAndPersonAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignDateAndPersonAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignDateAndPersonAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignDateAndPersonAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignDateAndPersonAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignDateAndPersonItem: declare class StepAP214_AutoDesignDateAndPersonItem extends StepData_SelectType

  // StepAP214_AutoDesignDateAndPersonItem.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignDateAndPersonItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_AutoDesignDateAndPersonItem.AutoDesignOrganizationAssignment (method)
  AutoDesignOrganizationAssignment(): StepAP214_AutoDesignOrganizationAssignment;

  // StepAP214_AutoDesignDateAndPersonItem.Product (method)
  Product(): StepBasic_Product;

  // StepAP214_AutoDesignDateAndPersonItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_AutoDesignDateAndPersonItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP214_AutoDesignDateAndPersonItem.Representation (method)
  Representation(): StepRepr_Representation;

  // StepAP214_AutoDesignDateAndPersonItem.AutoDesignDocumentReference (method)
  AutoDesignDocumentReference(): StepAP214_AutoDesignDocumentReference;

  // StepAP214_AutoDesignDateAndPersonItem.ExternallyDefinedRepresentation (method)
  ExternallyDefinedRepresentation(): StepRepr_ExternallyDefinedRepresentation;

  // StepAP214_AutoDesignDateAndPersonItem.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepAP214_AutoDesignDateAndPersonItem.ProductDefinitionWithAssociatedDocuments (method)
  ProductDefinitionWithAssociatedDocuments(): StepBasic_ProductDefinitionWithAssociatedDocuments;

  // StepAP214_AutoDesignDateAndPersonItem.delete (method)
  delete(): void;

  // StepAP214_AutoDesignDateAndPersonItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignDateAndTimeItem: declare class StepAP214_AutoDesignDateAndTimeItem extends StepData_SelectType

  // StepAP214_AutoDesignDateAndTimeItem.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignDateAndTimeItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_AutoDesignDateAndTimeItem.ApprovalPersonOrganization (method)
  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  // StepAP214_AutoDesignDateAndTimeItem.AutoDesignDateAndPersonAssignment (method)
  AutoDesignDateAndPersonAssignment(): StepAP214_AutoDesignDateAndPersonAssignment;

  // StepAP214_AutoDesignDateAndTimeItem.ProductDefinitionEffectivity (method)
  ProductDefinitionEffectivity(): StepBasic_ProductDefinitionEffectivity;

  // StepAP214_AutoDesignDateAndTimeItem.delete (method)
  delete(): void;

  // StepAP214_AutoDesignDateAndTimeItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignDatedItem: declare class StepAP214_AutoDesignDatedItem extends StepData_SelectType

  // StepAP214_AutoDesignDatedItem.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignDatedItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_AutoDesignDatedItem.ApprovalPersonOrganization (method)
  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  // StepAP214_AutoDesignDatedItem.AutoDesignDateAndPersonAssignment (method)
  AutoDesignDateAndPersonAssignment(): StepAP214_AutoDesignDateAndPersonAssignment;

  // StepAP214_AutoDesignDatedItem.ProductDefinitionEffectivity (method)
  ProductDefinitionEffectivity(): StepBasic_ProductDefinitionEffectivity;

  // StepAP214_AutoDesignDatedItem.delete (method)
  delete(): void;

  // StepAP214_AutoDesignDatedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignDocumentReference: declare class StepAP214_AutoDesignDocumentReference extends StepBasic_DocumentReference

  // StepAP214_AutoDesignDocumentReference.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignDocumentReference.Init (method)
  Init(aAssignedDocument: StepBasic_Document, aSource: TCollection_HAsciiString, aItems: NCollection_HArray1_StepAP214_AutoDesignReferencingItem): void;

  // StepAP214_AutoDesignDocumentReference.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignReferencingItem;

  // StepAP214_AutoDesignDocumentReference.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignReferencingItem): void;

  // StepAP214_AutoDesignDocumentReference.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignReferencingItem;

  // StepAP214_AutoDesignDocumentReference.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignDocumentReference.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignDocumentReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignDocumentReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignDocumentReference.delete (method)
  delete(): void;

  // StepAP214_AutoDesignDocumentReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignGeneralOrgItem: declare class StepAP214_AutoDesignGeneralOrgItem extends StepData_SelectType

  // StepAP214_AutoDesignGeneralOrgItem.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignGeneralOrgItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_AutoDesignGeneralOrgItem.Product (method)
  Product(): StepBasic_Product;

  // StepAP214_AutoDesignGeneralOrgItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_AutoDesignGeneralOrgItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP214_AutoDesignGeneralOrgItem.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepAP214_AutoDesignGeneralOrgItem.ProductDefinitionWithAssociatedDocuments (method)
  ProductDefinitionWithAssociatedDocuments(): StepBasic_ProductDefinitionWithAssociatedDocuments;

  // StepAP214_AutoDesignGeneralOrgItem.Representation (method)
  Representation(): StepRepr_Representation;

  // StepAP214_AutoDesignGeneralOrgItem.ExternallyDefinedRepresentation (method)
  ExternallyDefinedRepresentation(): StepRepr_ExternallyDefinedRepresentation;

  // StepAP214_AutoDesignGeneralOrgItem.AutoDesignDocumentReference (method)
  AutoDesignDocumentReference(): StepAP214_AutoDesignDocumentReference;

  // StepAP214_AutoDesignGeneralOrgItem.delete (method)
  delete(): void;

  // StepAP214_AutoDesignGeneralOrgItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignGroupAssignment: declare class StepAP214_AutoDesignGroupAssignment extends StepBasic_GroupAssignment

  // StepAP214_AutoDesignGroupAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignGroupAssignment.Init (method)
  Init(aAssignedGroup: StepBasic_Group, aItems: NCollection_HArray1_StepAP214_AutoDesignGroupedItem): void;
  Init(aAssignedGroup: StepBasic_Group): void;

  // StepAP214_AutoDesignGroupAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignGroupedItem): void;

  // StepAP214_AutoDesignGroupAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignGroupedItem;

  // StepAP214_AutoDesignGroupAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignGroupedItem;

  // StepAP214_AutoDesignGroupAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignGroupAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignGroupAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignGroupAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignGroupAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignGroupAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignGroupedItem: declare class StepAP214_AutoDesignGroupedItem extends StepData_SelectType

  // StepAP214_AutoDesignGroupedItem.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignGroupedItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_AutoDesignGroupedItem.AdvancedBrepShapeRepresentation (method)
  AdvancedBrepShapeRepresentation(): StepShape_AdvancedBrepShapeRepresentation;

  // StepAP214_AutoDesignGroupedItem.CsgShapeRepresentation (method)
  CsgShapeRepresentation(): StepShape_CsgShapeRepresentation;

  // StepAP214_AutoDesignGroupedItem.FacetedBrepShapeRepresentation (method)
  FacetedBrepShapeRepresentation(): StepShape_FacetedBrepShapeRepresentation;

  // StepAP214_AutoDesignGroupedItem.GeometricallyBoundedSurfaceShapeRepresentation (method)
  GeometricallyBoundedSurfaceShapeRepresentation(): StepShape_GeometricallyBoundedSurfaceShapeRepresentation;

  // StepAP214_AutoDesignGroupedItem.GeometricallyBoundedWireframeShapeRepresentation (method)
  GeometricallyBoundedWireframeShapeRepresentation(): StepShape_GeometricallyBoundedWireframeShapeRepresentation;

  // StepAP214_AutoDesignGroupedItem.ManifoldSurfaceShapeRepresentation (method)
  ManifoldSurfaceShapeRepresentation(): StepShape_ManifoldSurfaceShapeRepresentation;

  // StepAP214_AutoDesignGroupedItem.Representation (method)
  Representation(): StepRepr_Representation;

  // StepAP214_AutoDesignGroupedItem.RepresentationItem (method)
  RepresentationItem(): StepRepr_RepresentationItem;

  // StepAP214_AutoDesignGroupedItem.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepAP214_AutoDesignGroupedItem.ShapeRepresentation (method)
  ShapeRepresentation(): StepShape_ShapeRepresentation;

  // StepAP214_AutoDesignGroupedItem.TemplateInstance (method)
  TemplateInstance(): StepVisual_TemplateInstance;

  // StepAP214_AutoDesignGroupedItem.delete (method)
  delete(): void;

  // StepAP214_AutoDesignGroupedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignNominalDateAndTimeAssignment: declare class StepAP214_AutoDesignNominalDateAndTimeAssignment extends StepBasic_DateAndTimeAssignment

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.Init (method)
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem): void;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignDateAndTimeItem;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignDateAndTimeItem;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignNominalDateAndTimeAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignNominalDateAssignment: declare class StepAP214_AutoDesignNominalDateAssignment extends StepBasic_DateAssignment

  // StepAP214_AutoDesignNominalDateAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignNominalDateAssignment.Init (method)
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole, aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;
  Init(aAssignedDate: StepBasic_Date, aRole: StepBasic_DateRole): void;

  // StepAP214_AutoDesignNominalDateAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignDatedItem): void;

  // StepAP214_AutoDesignNominalDateAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignDatedItem;

  // StepAP214_AutoDesignNominalDateAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignDatedItem;

  // StepAP214_AutoDesignNominalDateAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignNominalDateAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignNominalDateAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignNominalDateAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignNominalDateAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignNominalDateAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignOrganizationAssignment: declare class StepAP214_AutoDesignOrganizationAssignment extends StepBasic_OrganizationAssignment

  // StepAP214_AutoDesignOrganizationAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignOrganizationAssignment.Init (method)
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedOrganization: StepBasic_Organization, aRole: StepBasic_OrganizationRole): void;

  // StepAP214_AutoDesignOrganizationAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;

  // StepAP214_AutoDesignOrganizationAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem;

  // StepAP214_AutoDesignOrganizationAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignGeneralOrgItem;

  // StepAP214_AutoDesignOrganizationAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignOrganizationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignOrganizationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignOrganizationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignOrganizationAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignOrganizationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignOrganizationItem: declare class StepAP214_AutoDesignOrganizationItem extends StepAP214_AutoDesignGeneralOrgItem

  // StepAP214_AutoDesignOrganizationItem.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignOrganizationItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_AutoDesignOrganizationItem.Document (method)
  Document(): StepBasic_Document;

  // StepAP214_AutoDesignOrganizationItem.PhysicallyModeledProductDefinition (method)
  PhysicallyModeledProductDefinition(): StepBasic_PhysicallyModeledProductDefinition;

  // StepAP214_AutoDesignOrganizationItem.delete (method)
  delete(): void;

  // StepAP214_AutoDesignOrganizationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignPersonAndOrganizationAssignment: declare class StepAP214_AutoDesignPersonAndOrganizationAssignment extends StepBasic_PersonAndOrganizationAssignment

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.Init (method)
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem): void;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignGeneralOrgItem;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignGeneralOrgItem;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignPersonAndOrganizationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignPresentedItem: declare class StepAP214_AutoDesignPresentedItem extends StepVisual_PresentedItem

  // StepAP214_AutoDesignPresentedItem.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignPresentedItem.Init (method)
  Init(aItems: NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect): void;

  // StepAP214_AutoDesignPresentedItem.SetItems (method)
  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect): void;

  // StepAP214_AutoDesignPresentedItem.Items (method)
  Items(): NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect;

  // StepAP214_AutoDesignPresentedItem.ItemsValue (method)
  ItemsValue(num: number): StepAP214_AutoDesignPresentedItemSelect;

  // StepAP214_AutoDesignPresentedItem.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignPresentedItem.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignPresentedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignPresentedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignPresentedItem.delete (method)
  delete(): void;

  // StepAP214_AutoDesignPresentedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignPresentedItemSelect: declare class StepAP214_AutoDesignPresentedItemSelect extends StepData_SelectType

  // StepAP214_AutoDesignPresentedItemSelect.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignPresentedItemSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_AutoDesignPresentedItemSelect.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepAP214_AutoDesignPresentedItemSelect.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_AutoDesignPresentedItemSelect.ProductDefinitionShape (method)
  ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

  // StepAP214_AutoDesignPresentedItemSelect.RepresentationRelationship (method)
  RepresentationRelationship(): StepRepr_RepresentationRelationship;

  // StepAP214_AutoDesignPresentedItemSelect.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepAP214_AutoDesignPresentedItemSelect.DocumentRelationship (method)
  DocumentRelationship(): StepBasic_DocumentRelationship;

  // StepAP214_AutoDesignPresentedItemSelect.delete (method)
  delete(): void;

  // StepAP214_AutoDesignPresentedItemSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignReferencingItem: declare class StepAP214_AutoDesignReferencingItem extends StepData_SelectType

  // StepAP214_AutoDesignReferencingItem.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignReferencingItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP214_AutoDesignReferencingItem.Approval (method)
  Approval(): StepBasic_Approval;

  // StepAP214_AutoDesignReferencingItem.DocumentRelationship (method)
  DocumentRelationship(): StepBasic_DocumentRelationship;

  // StepAP214_AutoDesignReferencingItem.ExternallyDefinedRepresentation (method)
  ExternallyDefinedRepresentation(): StepRepr_ExternallyDefinedRepresentation;

  // StepAP214_AutoDesignReferencingItem.MappedItem (method)
  MappedItem(): StepRepr_MappedItem;

  // StepAP214_AutoDesignReferencingItem.MaterialDesignation (method)
  MaterialDesignation(): StepRepr_MaterialDesignation;

  // StepAP214_AutoDesignReferencingItem.PresentationArea (method)
  PresentationArea(): StepVisual_PresentationArea;

  // StepAP214_AutoDesignReferencingItem.PresentationView (method)
  PresentationView(): StepVisual_PresentationView;

  // StepAP214_AutoDesignReferencingItem.ProductCategory (method)
  ProductCategory(): StepBasic_ProductCategory;

  // StepAP214_AutoDesignReferencingItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP214_AutoDesignReferencingItem.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepAP214_AutoDesignReferencingItem.PropertyDefinition (method)
  PropertyDefinition(): StepRepr_PropertyDefinition;

  // StepAP214_AutoDesignReferencingItem.Representation (method)
  Representation(): StepRepr_Representation;

  // StepAP214_AutoDesignReferencingItem.RepresentationRelationship (method)
  RepresentationRelationship(): StepRepr_RepresentationRelationship;

  // StepAP214_AutoDesignReferencingItem.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepAP214_AutoDesignReferencingItem.delete (method)
  delete(): void;

  // StepAP214_AutoDesignReferencingItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_AutoDesignSecurityClassificationAssignment: declare class StepAP214_AutoDesignSecurityClassificationAssignment extends StepBasic_SecurityClassificationAssignment

  // StepAP214_AutoDesignSecurityClassificationAssignment.constructor (constructor)
  constructor();

  // StepAP214_AutoDesignSecurityClassificationAssignment.Init (method)
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_handle_StepBasic_Approval): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

  // StepAP214_AutoDesignSecurityClassificationAssignment.SetItems (method)
  SetItems(aItems: NCollection_HArray1_handle_StepBasic_Approval): void;

  // StepAP214_AutoDesignSecurityClassificationAssignment.Items (method)
  Items(): NCollection_HArray1_handle_StepBasic_Approval;

  // StepAP214_AutoDesignSecurityClassificationAssignment.ItemsValue (method)
  ItemsValue(num: number): StepBasic_Approval;

  // StepAP214_AutoDesignSecurityClassificationAssignment.NbItems (method)
  NbItems(): number;

  // StepAP214_AutoDesignSecurityClassificationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_AutoDesignSecurityClassificationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_AutoDesignSecurityClassificationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_AutoDesignSecurityClassificationAssignment.delete (method)
  delete(): void;

  // StepAP214_AutoDesignSecurityClassificationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP214_Class: declare class StepAP214_Class extends StepBasic_Group

  // StepAP214_Class.constructor (constructor)
  constructor();

  // StepAP214_Class.get_type_name (method)
  static get_type_name(): string;

  // StepAP214_Class.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP214_Class.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP214_Class.delete (method)
  delete(): void;

  // StepAP214_Class.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
