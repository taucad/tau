# libcascade — StepAP214

22 top-level symbols. Signatures are verbatim typescript.

// Complete AP214 CC1 , Revision 4 Upgrading from Revision 2 to Revision 4
StepAP214: declare class StepAP214

constructor

// creates a Protocol
static Protocol(): StepAP214_Protocol;

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity AppliedExternalIdentificationAssignment
StepAP214_AppliedExternalIdentificationAssignment: declare class StepAP214_AppliedExternalIdentificationAssignment extends StepBasic_ExternalIdentificationAssignment

constructor

// Initialize all fields (own and inherited)
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aExternalIdentificationAssignment_Source: StepBasic_ExternalSource, aItems: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aExternalIdentificationAssignment_Source: StepBasic_ExternalSource, aItems: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aExternalIdentificationAssignment_Source: StepBasic_ExternalSource, aItems: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;
Init(aIdentificationAssignment_AssignedId: TCollection_HAsciiString, aIdentificationAssignment_Role: StepBasic_IdentificationRole, aSource: StepBasic_ExternalSource): void;
Init(aAssignedId: TCollection_HAsciiString, aRole: StepBasic_IdentificationRole): void;

// Returns field Items
Items(): NCollection_HArray1_StepAP214_ExternalIdentificationItem;

// Set field Items
SetItems(Items: NCollection_HArray1_StepAP214_ExternalIdentificationItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity AppliedGroupAssignment
StepAP214_AppliedGroupAssignment: declare class StepAP214_AppliedGroupAssignment extends StepBasic_GroupAssignment

constructor

// Initialize all fields (own and inherited)
Init(aGroupAssignment_AssignedGroup: StepBasic_Group, aItems: NCollection_HArray1_StepAP214_GroupItem): void;
Init(aAssignedGroup: StepBasic_Group): void;
Init(aGroupAssignment_AssignedGroup: StepBasic_Group, aItems: NCollection_HArray1_StepAP214_GroupItem): void;
Init(aAssignedGroup: StepBasic_Group): void;

// Returns field Items
Items(): NCollection_HArray1_StepAP214_GroupItem;

// Set field Items
SetItems(Items: NCollection_HArray1_StepAP214_GroupItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_ApprovalItem: declare class StepAP214_ApprovalItem extends StepData_SelectType

constructor

// Recognizes a ApprovalItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a AssemblyComponentUsageSubstitute (Null if another type)
AssemblyComponentUsageSubstitute(): StepRepr_AssemblyComponentUsageSubstitute;

// returns Value as a DocumentFile (Null if another type)
DocumentFile(): StepBasic_DocumentFile;

// returns Value as a MaterialDesignation (Null if another type)
MaterialDesignation(): StepRepr_MaterialDesignation;

// returns Value as a MechanicalDesignGeometricPresentationRepresentation (Null if another type)
MechanicalDesignGeometricPresentationRepresentation(): StepVisual_MechanicalDesignGeometricPresentationRepresentation;

// returns Value as a PresentationArea (Null if another type)
PresentationArea(): StepVisual_PresentationArea;

// returns Value as a Product (Null if another type)
Product(): StepBasic_Product;

// returns Value as a ProductDefinition (Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// returns Value as a ProductDefinitionFormation (Null if another type)
ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

// returns Value as aProductDefinitionRelationship (Null if another type)
ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

// returns Value as a PropertyDefinition (Null if another type)
PropertyDefinition(): StepRepr_PropertyDefinition;

// returns Value as a ShapeRepresentation (Null if another type)
ShapeRepresentation(): StepShape_ShapeRepresentation;

// returns Value as a SecurityClassification (Null if another type)
SecurityClassification(): StepBasic_SecurityClassification;

// returns Value as a ConfigurationItem (Null if another type)
ConfigurationItem(): StepRepr_ConfigurationItem;

// returns Value as a Date (Null if another type)
Date(): StepBasic_Date;

// returns Value as a Document (Null if another type)
Document(): StepBasic_Document;

// returns Value as a Effectivity (Null if another type)
Effectivity(): StepBasic_Effectivity;

// returns Value as a Group (Null if another type)
Group(): StepBasic_Group;

// returns Value as a GroupRelationship (Null if another type)
GroupRelationship(): StepBasic_GroupRelationship;

// returns Value as a ProductDefinitionFormationRelationship (Null if another type)
ProductDefinitionFormationRelationship(): StepBasic_ProductDefinitionFormationRelationship;

// returns Value as a Representation (Null if another type)
Representation(): StepRepr_Representation;

// returns Value as a ShapeAspectRelationship (Null if another type)
ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_AutoDesignDateAndPersonItem: declare class StepAP214_AutoDesignDateAndPersonItem extends StepData_SelectType

constructor

// Recognizes a AutoDesignDateAndPersonItem Kind Entity that is
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_AutoDesignDateAndTimeItem: declare class StepAP214_AutoDesignDateAndTimeItem extends StepData_SelectType

constructor

// Recognizes a AutoDesignDateAndTimeItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ApprovalPersonOrganization (Null if another type)
ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

// returns Value as a AutoDesignDateAndPersonAssignment (Null if another type)
AutoDesignDateAndPersonAssignment(): StepAP214_AutoDesignDateAndPersonAssignment;

ProductDefinitionEffectivity(): StepBasic_ProductDefinitionEffectivity;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_AutoDesignDatedItem: declare class StepAP214_AutoDesignDatedItem extends StepData_SelectType

constructor

// Recognizes a AutoDesignDatedItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ApprovalPersonOrganization (Null if another type)
ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

// returns Value as a AutoDesignDateAndPersonAssignment (Null if another type)
AutoDesignDateAndPersonAssignment(): StepAP214_AutoDesignDateAndPersonAssignment;

// returns Value as a ProductDefinitionEffectivity
ProductDefinitionEffectivity(): StepBasic_ProductDefinitionEffectivity;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_AutoDesignGeneralOrgItem: declare class StepAP214_AutoDesignGeneralOrgItem extends StepData_SelectType

constructor

// Recognizes a AutoDesignGeneralOrgItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Product (Null if another type)
Product(): StepBasic_Product;

// returns Value as a ProductDefinition (Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// returns Value as a ProductDefinitionFormation (Null if another type)
ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

// returns Value as a ProductDefinitionRelationship (Null if another type)
ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

// returns Value as a ProductDefinitionWithAssociatedDocuments (Null if another type)
ProductDefinitionWithAssociatedDocuments(): StepBasic_ProductDefinitionWithAssociatedDocuments;

// returns Value as a Representation (Null if another type)
Representation(): StepRepr_Representation;

// returns Value as a Representation (Null if another type)
ExternallyDefinedRepresentation(): StepRepr_ExternallyDefinedRepresentation;

AutoDesignDocumentReference(): StepAP214_AutoDesignDocumentReference;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_AutoDesignGroupAssignment: declare class StepAP214_AutoDesignGroupAssignment extends StepBasic_GroupAssignment

constructor

// Initialize all fields (own and inherited)
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
