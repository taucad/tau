# libcascade — StepAP214 (2)

52 top-level symbols. Signatures are verbatim typescript.

StepAP214_AutoDesignPresentedItem: declare class StepAP214_AutoDesignPresentedItem extends StepVisual_PresentedItem

  constructor

  Init(aItems: NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect): void;

  SetItems(aItems: NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect): void;

  Items(): NCollection_HArray1_StepAP214_AutoDesignPresentedItemSelect;

  ItemsValue(num: number): StepAP214_AutoDesignPresentedItemSelect;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignPresentedItemSelect: declare class StepAP214_AutoDesignPresentedItemSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

  RepresentationRelationship(): StepRepr_RepresentationRelationship;

  ShapeAspect(): StepRepr_ShapeAspect;

  DocumentRelationship(): StepBasic_DocumentRelationship;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignReferencingItem: declare class StepAP214_AutoDesignReferencingItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Approval(): StepBasic_Approval;

  DocumentRelationship(): StepBasic_DocumentRelationship;

  ExternallyDefinedRepresentation(): StepRepr_ExternallyDefinedRepresentation;

  MappedItem(): StepRepr_MappedItem;

  MaterialDesignation(): StepRepr_MaterialDesignation;

  PresentationArea(): StepVisual_PresentationArea;

  PresentationView(): StepVisual_PresentationView;

  ProductCategory(): StepBasic_ProductCategory;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  PropertyDefinition(): StepRepr_PropertyDefinition;

  Representation(): StepRepr_Representation;

  RepresentationRelationship(): StepRepr_RepresentationRelationship;

  ShapeAspect(): StepRepr_ShapeAspect;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_AutoDesignSecurityClassificationAssignment: declare class StepAP214_AutoDesignSecurityClassificationAssignment extends StepBasic_SecurityClassificationAssignment

  constructor

  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_handle_StepBasic_Approval): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_handle_StepBasic_Approval): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

  SetItems(aItems: NCollection_HArray1_handle_StepBasic_Approval): void;

  Items(): NCollection_HArray1_handle_StepBasic_Approval;

  ItemsValue(num: number): StepBasic_Approval;

  NbItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_Class: declare class StepAP214_Class extends StepBasic_Group

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_DateAndTimeItem: declare class StepAP214_DateAndTimeItem extends StepAP214_ApprovalItem

  constructor

  CaseNum(ent: Standard_Transient): number;

  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_DateItem: declare class StepAP214_DateItem extends StepAP214_ApprovalItem

  constructor

  CaseNum(ent: Standard_Transient): number;

  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_DocumentReferenceItem: declare class StepAP214_DocumentReferenceItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Approval(): StepBasic_Approval;

  DescriptiveRepresentationItem(): StepRepr_DescriptiveRepresentationItem;

  MaterialDesignation(): StepRepr_MaterialDesignation;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  PropertyDefinition(): StepRepr_PropertyDefinition;

  Representation(): StepRepr_Representation;

  ShapeAspect(): StepRepr_ShapeAspect;

  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  AppliedExternalIdentificationAssignment(): StepAP214_AppliedExternalIdentificationAssignment;

  AssemblyComponentUsage(): StepRepr_AssemblyComponentUsage;

  CharacterizedObject(): StepBasic_CharacterizedObject;

  DimensionalSize(): StepShape_DimensionalSize;

  ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

  Group(): StepBasic_Group;

  GroupRelationship(): StepBasic_GroupRelationship;

  MeasureRepresentationItem(): StepRepr_MeasureRepresentationItem;

  ProductCategory(): StepBasic_ProductCategory;

  ProductDefinitionContext(): StepBasic_ProductDefinitionContext;

  RepresentationItem(): StepRepr_RepresentationItem;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_ExternalIdentificationItem: declare class StepAP214_ExternalIdentificationItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  DocumentFile(): StepBasic_DocumentFile;

  ExternallyDefinedClass(): StepAP214_ExternallyDefinedClass;

  ExternallyDefinedGeneralProperty(): StepAP214_ExternallyDefinedGeneralProperty;

  ProductDefinition(): StepBasic_ProductDefinition;

  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

  Approval(): StepBasic_Approval;

  ApprovalStatus(): StepBasic_ApprovalStatus;

  ExternalSource(): StepBasic_ExternalSource;

  OrganizationalAddress(): StepBasic_OrganizationalAddress;

  SecurityClassification(): StepBasic_SecurityClassification;

  TrimmedCurve(): StepGeom_TrimmedCurve;

  VersionedActionRequest(): StepBasic_VersionedActionRequest;

  DateAndTimeAssignment(): StepBasic_DateAndTimeAssignment;

  DateAssignment(): StepBasic_DateAssignment;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_ExternallyDefinedClass: declare class StepAP214_ExternallyDefinedClass extends StepAP214_Class

  constructor

  Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
  Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

  SetExternallyDefinedItem(ExternallyDefinedItem: StepBasic_ExternallyDefinedItem): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_ExternallyDefinedGeneralProperty: declare class StepAP214_ExternallyDefinedGeneralProperty extends StepBasic_GeneralProperty

  constructor

  Init(aGeneralProperty_Id: TCollection_HAsciiString, aGeneralProperty_Name: TCollection_HAsciiString, hasGeneralProperty_Description: boolean, aGeneralProperty_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
  Init(aGeneralProperty_Id: TCollection_HAsciiString, aGeneralProperty_Name: TCollection_HAsciiString, hasGeneralProperty_Description: boolean, aGeneralProperty_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

  SetExternallyDefinedItem(ExternallyDefinedItem: StepBasic_ExternallyDefinedItem): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_GroupItem: declare class StepAP214_GroupItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  GeometricRepresentationItem(): StepGeom_GeometricRepresentationItem;

  GroupRelationship(): StepBasic_GroupRelationship;

  MappedItem(): StepRepr_MappedItem;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  PropertyDefinitionRepresentation(): StepRepr_PropertyDefinitionRepresentation;

  Representation(): StepRepr_Representation;

  RepresentationItem(): StepRepr_RepresentationItem;

  RepresentationRelationshipWithTransformation(): StepRepr_RepresentationRelationshipWithTransformation;

  ShapeAspect(): StepRepr_ShapeAspect;

  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  ShapeRepresentationRelationship(): StepRepr_ShapeRepresentationRelationship;

  StyledItem(): StepVisual_StyledItem;

  TopologicalRepresentationItem(): StepShape_TopologicalRepresentationItem;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_OrganizationItem: declare class StepAP214_OrganizationItem extends StepAP214_ApprovalItem

  constructor

  CaseNum(ent: Standard_Transient): number;

  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  Approval(): StepBasic_Approval;

  AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_PersonAndOrganizationItem: declare class StepAP214_PersonAndOrganizationItem extends StepAP214_ApprovalItem

  constructor

  CaseNum(ent: Standard_Transient): number;

  AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

  AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

  Approval(): StepBasic_Approval;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_PresentedItemSelect: declare class StepAP214_PresentedItemSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  ProductDefinition(): StepBasic_ProductDefinition;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_Protocol: declare class StepAP214_Protocol extends StepData_Protocol

  constructor

  TypeNumber(atype: Standard_Type): number;

  SchemaName(theModel: Interface_InterfaceModel): string;

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_RepItemGroup: declare class StepAP214_RepItemGroup extends StepBasic_Group

  constructor

  Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aRepresentationItem_Name: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
  Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aRepresentationItem_Name: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

  RepresentationItem(): StepRepr_RepresentationItem;

  SetRepresentationItem(RepresentationItem: StepRepr_RepresentationItem): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepAP214_SecurityClassificationItem: declare class StepAP214_SecurityClassificationItem extends StepAP214_ApprovalItem

  constructor

  CaseNum(ent: Standard_Transient): number;

  Action(): StepBasic_Action;

  AssemblyComponentUsage(): StepRepr_AssemblyComponentUsage;

  ConfigurationDesign(): StepRepr_ConfigurationDesign;

  ConfigurationEffectivity(): StepRepr_ConfigurationEffectivity;

  DraughtingModel(): StepVisual_DraughtingModel;

  GeneralProperty(): StepBasic_GeneralProperty;

  MakeFromUsageOption(): StepRepr_MakeFromUsageOption;

  ProductConcept(): StepRepr_ProductConcept;

  ProductDefinitionUsage(): StepRepr_ProductDefinitionUsage;

  VersionedActionRequest(): StepBasic_VersionedActionRequest;

  delete(): void;

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
