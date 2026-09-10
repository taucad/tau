# libcascade — StepAP214 (3)

40 top-level symbols. Signatures are verbatim typescript.

StepAP214_OrganizationItem: declare class StepAP214_OrganizationItem extends StepAP214_ApprovalItem

constructor

// Recognizes a OrganizationItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a AppliedOrganizationAssignment (Null if another type)
AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

// returns Value as a Approval (Null if another type)
Approval(): StepBasic_Approval;

// returns Value as a AppliedSecurityClassificationAssignment (Null if another type)
AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_PersonAndOrganizationItem: declare class StepAP214_PersonAndOrganizationItem extends StepAP214_ApprovalItem

constructor

// Recognizes a APersonAndOrganizationItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a AppliedOrganizationAssignment (Null if another type)
AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

// returns Value as a AppliedSecurityClassificationAssignment (Null if another type)
AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

// returns Value as a Approval (Null if another type)
Approval(): StepBasic_Approval;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_PresentedItemSelect: declare class StepAP214_PresentedItemSelect extends StepData_SelectType

constructor

// Recognizes a PresentedItemSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ProductDefinitionRelationship (Null if another type)
ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

// returns Value as a ProductDefinition (Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Protocol for {@link StepAP214`StepAP214`} Entities It requires {@link StepAP214`StepAP214`} as a Resource
StepAP214_Protocol: declare class StepAP214_Protocol extends StepData_Protocol

constructor

// Returns a Case Number for each of the {@link StepAP214`StepAP214`} Entities
TypeNumber(atype: Standard_Type): number;

// Returns the Schema Name attached to each class of Protocol To be redefined by each sub-class Here, SchemaName returns "(DEFAULT)" was C++
SchemaName(theModel: Interface_InterfaceModel): string;

// Returns count of Protocol used as Resources (level one)
NbResources(): number;

// Returns a Resource, given its rank (between 1 and NbResources)
Resource(num: number): Interface_Protocol;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity RepItemGroup
StepAP214_RepItemGroup: declare class StepAP214_RepItemGroup extends StepBasic_Group

constructor

// Initialize all fields (own and inherited)
Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aRepresentationItem_Name: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aRepresentationItem_Name: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns data for supertype RepresentationItem
RepresentationItem(): StepRepr_RepresentationItem;

// Set data for supertype RepresentationItem
SetRepresentationItem(RepresentationItem: StepRepr_RepresentationItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_SecurityClassificationItem: declare class StepAP214_SecurityClassificationItem extends StepAP214_ApprovalItem

constructor

// Recognizes a SecurityClassificationItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Action (Null if another type)
Action(): StepBasic_Action;

// returns Value as a AssemblyComponentUsage (Null if another type)
AssemblyComponentUsage(): StepRepr_AssemblyComponentUsage;

// returns Value as a ConfigurationDesign (Null if another type)
ConfigurationDesign(): StepRepr_ConfigurationDesign;

// returns Value as a ConfigurationEffectivity (Null if another type)
ConfigurationEffectivity(): StepRepr_ConfigurationEffectivity;

// returns Value as a DraughtingModel (Null if another type)
DraughtingModel(): StepVisual_DraughtingModel;

// returns Value as a GeneralProperty (Null if another type)
GeneralProperty(): StepBasic_GeneralProperty;

// returns Value as a MakeFromUsageOption (Null if another type)
MakeFromUsageOption(): StepRepr_MakeFromUsageOption;

// returns Value as a ProductConcept (Null if another type)
ProductConcept(): StepRepr_ProductConcept;

// returns Value as a ProductDefinitionUsage (Null if another type)
ProductDefinitionUsage(): StepRepr_ProductDefinitionUsage;

// returns Value as a VersionedActionRequest (Null if another type)
VersionedActionRequest(): StepBasic_VersionedActionRequest;

// Releases the C++ object
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
