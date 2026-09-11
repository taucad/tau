# libcascade — StepAP203

41 top-level symbols. Signatures are verbatim typescript.

StepAP203_ApprovedItem: declare class StepAP203_ApprovedItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

ProductDefinition(): StepBasic_ProductDefinition;

ConfigurationEffectivity(): StepRepr_ConfigurationEffectivity;

ConfigurationItem(): StepRepr_ConfigurationItem;

SecurityClassification(): StepBasic_SecurityClassification;

ChangeRequest(): StepAP203_ChangeRequest;

Change(): StepAP203_Change;

StartRequest(): StepAP203_StartRequest;

StartWork(): StepAP203_StartWork;

Certification(): StepBasic_Certification;

Contract(): StepBasic_Contract;

delete(): void;

[Symbol.dispose](): void;

StepAP203_CcDesignApproval: declare class StepAP203_CcDesignApproval extends StepBasic_ApprovalAssignment

constructor

Init(aApprovalAssignment_AssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP203_ApprovedItem): void;
Init(aAssignedApproval: StepBasic_Approval): void;
Init(aApprovalAssignment_AssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP203_ApprovedItem): void;
Init(aAssignedApproval: StepBasic_Approval): void;

Items(): NCollection_HArray1_StepAP203_ApprovedItem;

SetItems(Items: NCollection_HArray1_StepAP203_ApprovedItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_CcDesignCertification: declare class StepAP203_CcDesignCertification extends StepBasic_CertificationAssignment

constructor

Init(aCertificationAssignment_AssignedCertification: StepBasic_Certification, aItems: NCollection_HArray1_StepAP203_CertifiedItem): void;
Init(aAssignedCertification: StepBasic_Certification): void;
Init(aCertificationAssignment_AssignedCertification: StepBasic_Certification, aItems: NCollection_HArray1_StepAP203_CertifiedItem): void;
Init(aAssignedCertification: StepBasic_Certification): void;

Items(): NCollection_HArray1_StepAP203_CertifiedItem;

SetItems(Items: NCollection_HArray1_StepAP203_CertifiedItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_CcDesignContract: declare class StepAP203_CcDesignContract extends StepBasic_ContractAssignment

constructor

Init(aContractAssignment_AssignedContract: StepBasic_Contract, aItems: NCollection_HArray1_StepAP203_ContractedItem): void;
Init(aAssignedContract: StepBasic_Contract): void;
Init(aContractAssignment_AssignedContract: StepBasic_Contract, aItems: NCollection_HArray1_StepAP203_ContractedItem): void;
Init(aAssignedContract: StepBasic_Contract): void;

Items(): NCollection_HArray1_StepAP203_ContractedItem;

SetItems(Items: NCollection_HArray1_StepAP203_ContractedItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_CcDesignDateAndTimeAssignment: declare class StepAP203_CcDesignDateAndTimeAssignment extends StepBasic_DateAndTimeAssignment

constructor

Init(aDateAndTimeAssignment_AssignedDateAndTime: StepBasic_DateAndTime, aDateAndTimeAssignment_Role: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP203_DateTimeItem): void;
Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;
Init(aDateAndTimeAssignment_AssignedDateAndTime: StepBasic_DateAndTime, aDateAndTimeAssignment_Role: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP203_DateTimeItem): void;
Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

Items(): NCollection_HArray1_StepAP203_DateTimeItem;

SetItems(Items: NCollection_HArray1_StepAP203_DateTimeItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_CcDesignPersonAndOrganizationAssignment: declare class StepAP203_CcDesignPersonAndOrganizationAssignment extends StepBasic_PersonAndOrganizationAssignment

constructor

Init(aPersonAndOrganizationAssignment_AssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aPersonAndOrganizationAssignment_Role: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP203_PersonOrganizationItem): void;
Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;
Init(aPersonAndOrganizationAssignment_AssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aPersonAndOrganizationAssignment_Role: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP203_PersonOrganizationItem): void;
Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

Items(): NCollection_HArray1_StepAP203_PersonOrganizationItem;

SetItems(Items: NCollection_HArray1_StepAP203_PersonOrganizationItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_CcDesignSecurityClassification: declare class StepAP203_CcDesignSecurityClassification extends StepBasic_SecurityClassificationAssignment

constructor

Init(aSecurityClassificationAssignment_AssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_StepAP203_ClassifiedItem): void;
Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;
Init(aSecurityClassificationAssignment_AssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_StepAP203_ClassifiedItem): void;
Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

Items(): NCollection_HArray1_StepAP203_ClassifiedItem;

SetItems(Items: NCollection_HArray1_StepAP203_ClassifiedItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_CcDesignSpecificationReference: declare class StepAP203_CcDesignSpecificationReference extends StepBasic_DocumentReference

constructor

Init(aDocumentReference_AssignedDocument: StepBasic_Document, aDocumentReference_Source: TCollection_HAsciiString, aItems: NCollection_HArray1_StepAP203_SpecifiedItem): void;

Items(): NCollection_HArray1_StepAP203_SpecifiedItem;

SetItems(Items: NCollection_HArray1_StepAP203_SpecifiedItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_CertifiedItem: declare class StepAP203_CertifiedItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

SuppliedPartRelationship(): StepRepr_SuppliedPartRelationship;

delete(): void;

[Symbol.dispose](): void;

StepAP203_Change: declare class StepAP203_Change extends StepBasic_ActionAssignment

constructor

Init(aActionAssignment_AssignedAction: StepBasic_Action, aItems: NCollection_HArray1_StepAP203_WorkItem): void;
Init(aAssignedAction: StepBasic_Action): void;
Init(aActionAssignment_AssignedAction: StepBasic_Action, aItems: NCollection_HArray1_StepAP203_WorkItem): void;
Init(aAssignedAction: StepBasic_Action): void;

Items(): NCollection_HArray1_StepAP203_WorkItem;

SetItems(Items: NCollection_HArray1_StepAP203_WorkItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_ChangeRequest: declare class StepAP203_ChangeRequest extends StepBasic_ActionRequestAssignment

constructor

Init(aActionRequestAssignment_AssignedActionRequest: StepBasic_VersionedActionRequest, aItems: NCollection_HArray1_StepAP203_ChangeRequestItem): void;
Init(aAssignedActionRequest: StepBasic_VersionedActionRequest): void;
Init(aActionRequestAssignment_AssignedActionRequest: StepBasic_VersionedActionRequest, aItems: NCollection_HArray1_StepAP203_ChangeRequestItem): void;
Init(aAssignedActionRequest: StepBasic_VersionedActionRequest): void;

Items(): NCollection_HArray1_StepAP203_ChangeRequestItem;

SetItems(Items: NCollection_HArray1_StepAP203_ChangeRequestItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_ChangeRequestItem: declare class StepAP203_ChangeRequestItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

delete(): void;

[Symbol.dispose](): void;

StepAP203_ClassifiedItem: declare class StepAP203_ClassifiedItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

AssemblyComponentUsage(): StepRepr_AssemblyComponentUsage;

delete(): void;

[Symbol.dispose](): void;

StepAP203_ContractedItem: declare class StepAP203_ContractedItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

delete(): void;

[Symbol.dispose](): void;

StepAP203_DateTimeItem: declare class StepAP203_DateTimeItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ProductDefinition(): StepBasic_ProductDefinition;

ChangeRequest(): StepAP203_ChangeRequest;

StartRequest(): StepAP203_StartRequest;

Change(): StepAP203_Change;

StartWork(): StepAP203_StartWork;

ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

Contract(): StepBasic_Contract;

SecurityClassification(): StepBasic_SecurityClassification;

Certification(): StepBasic_Certification;

delete(): void;

[Symbol.dispose](): void;

StepAP203_PersonOrganizationItem: declare class StepAP203_PersonOrganizationItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

Change(): StepAP203_Change;

StartWork(): StepAP203_StartWork;

ChangeRequest(): StepAP203_ChangeRequest;

StartRequest(): StepAP203_StartRequest;

ConfigurationItem(): StepRepr_ConfigurationItem;

Product(): StepBasic_Product;

ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

ProductDefinition(): StepBasic_ProductDefinition;

Contract(): StepBasic_Contract;

SecurityClassification(): StepBasic_SecurityClassification;

delete(): void;

[Symbol.dispose](): void;

StepAP203_SpecifiedItem: declare class StepAP203_SpecifiedItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ProductDefinition(): StepBasic_ProductDefinition;

ShapeAspect(): StepRepr_ShapeAspect;

delete(): void;

[Symbol.dispose](): void;

StepAP203_StartRequest: declare class StepAP203_StartRequest extends StepBasic_ActionRequestAssignment

constructor

Init(aActionRequestAssignment_AssignedActionRequest: StepBasic_VersionedActionRequest, aItems: NCollection_HArray1_StepAP203_StartRequestItem): void;
Init(aAssignedActionRequest: StepBasic_VersionedActionRequest): void;
Init(aActionRequestAssignment_AssignedActionRequest: StepBasic_VersionedActionRequest, aItems: NCollection_HArray1_StepAP203_StartRequestItem): void;
Init(aAssignedActionRequest: StepBasic_VersionedActionRequest): void;

Items(): NCollection_HArray1_StepAP203_StartRequestItem;

SetItems(Items: NCollection_HArray1_StepAP203_StartRequestItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_StartRequestItem: declare class StepAP203_StartRequestItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

delete(): void;

[Symbol.dispose](): void;

StepAP203_StartWork: declare class StepAP203_StartWork extends StepBasic_ActionAssignment

constructor

Init(aActionAssignment_AssignedAction: StepBasic_Action, aItems: NCollection_HArray1_StepAP203_WorkItem): void;
Init(aAssignedAction: StepBasic_Action): void;
Init(aActionAssignment_AssignedAction: StepBasic_Action, aItems: NCollection_HArray1_StepAP203_WorkItem): void;
Init(aAssignedAction: StepBasic_Action): void;

Items(): NCollection_HArray1_StepAP203_WorkItem;

SetItems(Items: NCollection_HArray1_StepAP203_WorkItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP203_WorkItem: declare class StepAP203_WorkItem extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

delete(): void;

[Symbol.dispose](): void;

StepAP203_Array1OfApprovedItem: NCollection_Array1_StepAP203_ApprovedItem

StepAP203_Array1OfCertifiedItem: NCollection_Array1_StepAP203_CertifiedItem

StepAP203_Array1OfChangeRequestItem: NCollection_Array1_StepAP203_ChangeRequestItem

StepAP203_Array1OfClassifiedItem: NCollection_Array1_StepAP203_ClassifiedItem

StepAP203_Array1OfContractedItem: NCollection_Array1_StepAP203_ContractedItem

StepAP203_Array1OfDateTimeItem: NCollection_Array1_StepAP203_DateTimeItem

StepAP203_Array1OfPersonOrganizationItem: NCollection_Array1_StepAP203_PersonOrganizationItem

StepAP203_Array1OfSpecifiedItem: NCollection_Array1_StepAP203_SpecifiedItem

StepAP203_Array1OfStartRequestItem: NCollection_Array1_StepAP203_StartRequestItem

StepAP203_Array1OfWorkItem: NCollection_Array1_StepAP203_WorkItem

StepAP203_HArray1OfApprovedItem: NCollection_HArray1_StepAP203_ApprovedItem

StepAP203_HArray1OfCertifiedItem: NCollection_HArray1_StepAP203_CertifiedItem

StepAP203_HArray1OfChangeRequestItem: NCollection_HArray1_StepAP203_ChangeRequestItem

StepAP203_HArray1OfClassifiedItem: NCollection_HArray1_StepAP203_ClassifiedItem

StepAP203_HArray1OfContractedItem: NCollection_HArray1_StepAP203_ContractedItem

StepAP203_HArray1OfDateTimeItem: NCollection_HArray1_StepAP203_DateTimeItem

StepAP203_HArray1OfPersonOrganizationItem: NCollection_HArray1_StepAP203_PersonOrganizationItem

StepAP203_HArray1OfSpecifiedItem: NCollection_HArray1_StepAP203_SpecifiedItem

StepAP203_HArray1OfStartRequestItem: NCollection_HArray1_StepAP203_StartRequestItem

StepAP203_HArray1OfWorkItem: NCollection_HArray1_StepAP203_WorkItem
