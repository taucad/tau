# libcascade — StepAP203

41 top-level symbols. Signatures are verbatim typescript.

StepAP203_ApprovedItem: declare class StepAP203_ApprovedItem extends StepData_SelectType

  // StepAP203_ApprovedItem.constructor (constructor)
  constructor();

  // StepAP203_ApprovedItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_ApprovedItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP203_ApprovedItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP203_ApprovedItem.ConfigurationEffectivity (method)
  ConfigurationEffectivity(): StepRepr_ConfigurationEffectivity;

  // StepAP203_ApprovedItem.ConfigurationItem (method)
  ConfigurationItem(): StepRepr_ConfigurationItem;

  // StepAP203_ApprovedItem.SecurityClassification (method)
  SecurityClassification(): StepBasic_SecurityClassification;

  // StepAP203_ApprovedItem.ChangeRequest (method)
  ChangeRequest(): StepAP203_ChangeRequest;

  // StepAP203_ApprovedItem.Change (method)
  Change(): StepAP203_Change;

  // StepAP203_ApprovedItem.StartRequest (method)
  StartRequest(): StepAP203_StartRequest;

  // StepAP203_ApprovedItem.StartWork (method)
  StartWork(): StepAP203_StartWork;

  // StepAP203_ApprovedItem.Certification (method)
  Certification(): StepBasic_Certification;

  // StepAP203_ApprovedItem.Contract (method)
  Contract(): StepBasic_Contract;

  // StepAP203_ApprovedItem.delete (method)
  delete(): void;

  // StepAP203_ApprovedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_CcDesignApproval: declare class StepAP203_CcDesignApproval extends StepBasic_ApprovalAssignment

  // StepAP203_CcDesignApproval.constructor (constructor)
  constructor();

  // StepAP203_CcDesignApproval.Init (method)
  Init(aApprovalAssignment_AssignedApproval: StepBasic_Approval, aItems: NCollection_HArray1_StepAP203_ApprovedItem): void;
  Init(aAssignedApproval: StepBasic_Approval): void;

  // StepAP203_CcDesignApproval.Items (method)
  Items(): NCollection_HArray1_StepAP203_ApprovedItem;

  // StepAP203_CcDesignApproval.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_ApprovedItem): void;

  // StepAP203_CcDesignApproval.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_CcDesignApproval.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_CcDesignApproval.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_CcDesignApproval.delete (method)
  delete(): void;

  // StepAP203_CcDesignApproval.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_CcDesignCertification: declare class StepAP203_CcDesignCertification extends StepBasic_CertificationAssignment

  // StepAP203_CcDesignCertification.constructor (constructor)
  constructor();

  // StepAP203_CcDesignCertification.Init (method)
  Init(aCertificationAssignment_AssignedCertification: StepBasic_Certification, aItems: NCollection_HArray1_StepAP203_CertifiedItem): void;
  Init(aAssignedCertification: StepBasic_Certification): void;

  // StepAP203_CcDesignCertification.Items (method)
  Items(): NCollection_HArray1_StepAP203_CertifiedItem;

  // StepAP203_CcDesignCertification.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_CertifiedItem): void;

  // StepAP203_CcDesignCertification.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_CcDesignCertification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_CcDesignCertification.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_CcDesignCertification.delete (method)
  delete(): void;

  // StepAP203_CcDesignCertification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_CcDesignContract: declare class StepAP203_CcDesignContract extends StepBasic_ContractAssignment

  // StepAP203_CcDesignContract.constructor (constructor)
  constructor();

  // StepAP203_CcDesignContract.Init (method)
  Init(aContractAssignment_AssignedContract: StepBasic_Contract, aItems: NCollection_HArray1_StepAP203_ContractedItem): void;
  Init(aAssignedContract: StepBasic_Contract): void;

  // StepAP203_CcDesignContract.Items (method)
  Items(): NCollection_HArray1_StepAP203_ContractedItem;

  // StepAP203_CcDesignContract.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_ContractedItem): void;

  // StepAP203_CcDesignContract.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_CcDesignContract.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_CcDesignContract.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_CcDesignContract.delete (method)
  delete(): void;

  // StepAP203_CcDesignContract.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_CcDesignDateAndTimeAssignment: declare class StepAP203_CcDesignDateAndTimeAssignment extends StepBasic_DateAndTimeAssignment

  // StepAP203_CcDesignDateAndTimeAssignment.constructor (constructor)
  constructor();

  // StepAP203_CcDesignDateAndTimeAssignment.Init (method)
  Init(aDateAndTimeAssignment_AssignedDateAndTime: StepBasic_DateAndTime, aDateAndTimeAssignment_Role: StepBasic_DateTimeRole, aItems: NCollection_HArray1_StepAP203_DateTimeItem): void;
  Init(aAssignedDateAndTime: StepBasic_DateAndTime, aRole: StepBasic_DateTimeRole): void;

  // StepAP203_CcDesignDateAndTimeAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP203_DateTimeItem;

  // StepAP203_CcDesignDateAndTimeAssignment.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_DateTimeItem): void;

  // StepAP203_CcDesignDateAndTimeAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_CcDesignDateAndTimeAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_CcDesignDateAndTimeAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_CcDesignDateAndTimeAssignment.delete (method)
  delete(): void;

  // StepAP203_CcDesignDateAndTimeAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_CcDesignPersonAndOrganizationAssignment: declare class StepAP203_CcDesignPersonAndOrganizationAssignment extends StepBasic_PersonAndOrganizationAssignment

  // StepAP203_CcDesignPersonAndOrganizationAssignment.constructor (constructor)
  constructor();

  // StepAP203_CcDesignPersonAndOrganizationAssignment.Init (method)
  Init(aPersonAndOrganizationAssignment_AssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aPersonAndOrganizationAssignment_Role: StepBasic_PersonAndOrganizationRole, aItems: NCollection_HArray1_StepAP203_PersonOrganizationItem): void;
  Init(aAssignedPersonAndOrganization: StepBasic_PersonAndOrganization, aRole: StepBasic_PersonAndOrganizationRole): void;

  // StepAP203_CcDesignPersonAndOrganizationAssignment.Items (method)
  Items(): NCollection_HArray1_StepAP203_PersonOrganizationItem;

  // StepAP203_CcDesignPersonAndOrganizationAssignment.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_PersonOrganizationItem): void;

  // StepAP203_CcDesignPersonAndOrganizationAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_CcDesignPersonAndOrganizationAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_CcDesignPersonAndOrganizationAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_CcDesignPersonAndOrganizationAssignment.delete (method)
  delete(): void;

  // StepAP203_CcDesignPersonAndOrganizationAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_CcDesignSecurityClassification: declare class StepAP203_CcDesignSecurityClassification extends StepBasic_SecurityClassificationAssignment

  // StepAP203_CcDesignSecurityClassification.constructor (constructor)
  constructor();

  // StepAP203_CcDesignSecurityClassification.Init (method)
  Init(aSecurityClassificationAssignment_AssignedSecurityClassification: StepBasic_SecurityClassification, aItems: NCollection_HArray1_StepAP203_ClassifiedItem): void;
  Init(aAssignedSecurityClassification: StepBasic_SecurityClassification): void;

  // StepAP203_CcDesignSecurityClassification.Items (method)
  Items(): NCollection_HArray1_StepAP203_ClassifiedItem;

  // StepAP203_CcDesignSecurityClassification.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_ClassifiedItem): void;

  // StepAP203_CcDesignSecurityClassification.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_CcDesignSecurityClassification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_CcDesignSecurityClassification.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_CcDesignSecurityClassification.delete (method)
  delete(): void;

  // StepAP203_CcDesignSecurityClassification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_CcDesignSpecificationReference: declare class StepAP203_CcDesignSpecificationReference extends StepBasic_DocumentReference

  // StepAP203_CcDesignSpecificationReference.constructor (constructor)
  constructor();

  // StepAP203_CcDesignSpecificationReference.Init (method)
  Init(aDocumentReference_AssignedDocument: StepBasic_Document, aDocumentReference_Source: TCollection_HAsciiString, aItems: NCollection_HArray1_StepAP203_SpecifiedItem): void;

  // StepAP203_CcDesignSpecificationReference.Items (method)
  Items(): NCollection_HArray1_StepAP203_SpecifiedItem;

  // StepAP203_CcDesignSpecificationReference.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_SpecifiedItem): void;

  // StepAP203_CcDesignSpecificationReference.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_CcDesignSpecificationReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_CcDesignSpecificationReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_CcDesignSpecificationReference.delete (method)
  delete(): void;

  // StepAP203_CcDesignSpecificationReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_CertifiedItem: declare class StepAP203_CertifiedItem extends StepData_SelectType

  // StepAP203_CertifiedItem.constructor (constructor)
  constructor();

  // StepAP203_CertifiedItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_CertifiedItem.SuppliedPartRelationship (method)
  SuppliedPartRelationship(): StepRepr_SuppliedPartRelationship;

  // StepAP203_CertifiedItem.delete (method)
  delete(): void;

  // StepAP203_CertifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_Change: declare class StepAP203_Change extends StepBasic_ActionAssignment

  // StepAP203_Change.constructor (constructor)
  constructor();

  // StepAP203_Change.Init (method)
  Init(aActionAssignment_AssignedAction: StepBasic_Action, aItems: NCollection_HArray1_StepAP203_WorkItem): void;
  Init(aAssignedAction: StepBasic_Action): void;

  // StepAP203_Change.Items (method)
  Items(): NCollection_HArray1_StepAP203_WorkItem;

  // StepAP203_Change.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_WorkItem): void;

  // StepAP203_Change.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_Change.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_Change.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_Change.delete (method)
  delete(): void;

  // StepAP203_Change.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_ChangeRequest: declare class StepAP203_ChangeRequest extends StepBasic_ActionRequestAssignment

  // StepAP203_ChangeRequest.constructor (constructor)
  constructor();

  // StepAP203_ChangeRequest.Init (method)
  Init(aActionRequestAssignment_AssignedActionRequest: StepBasic_VersionedActionRequest, aItems: NCollection_HArray1_StepAP203_ChangeRequestItem): void;
  Init(aAssignedActionRequest: StepBasic_VersionedActionRequest): void;

  // StepAP203_ChangeRequest.Items (method)
  Items(): NCollection_HArray1_StepAP203_ChangeRequestItem;

  // StepAP203_ChangeRequest.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_ChangeRequestItem): void;

  // StepAP203_ChangeRequest.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_ChangeRequest.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_ChangeRequest.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_ChangeRequest.delete (method)
  delete(): void;

  // StepAP203_ChangeRequest.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_ChangeRequestItem: declare class StepAP203_ChangeRequestItem extends StepData_SelectType

  // StepAP203_ChangeRequestItem.constructor (constructor)
  constructor();

  // StepAP203_ChangeRequestItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_ChangeRequestItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP203_ChangeRequestItem.delete (method)
  delete(): void;

  // StepAP203_ChangeRequestItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_ClassifiedItem: declare class StepAP203_ClassifiedItem extends StepData_SelectType

  // StepAP203_ClassifiedItem.constructor (constructor)
  constructor();

  // StepAP203_ClassifiedItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_ClassifiedItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP203_ClassifiedItem.AssemblyComponentUsage (method)
  AssemblyComponentUsage(): StepRepr_AssemblyComponentUsage;

  // StepAP203_ClassifiedItem.delete (method)
  delete(): void;

  // StepAP203_ClassifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_ContractedItem: declare class StepAP203_ContractedItem extends StepData_SelectType

  // StepAP203_ContractedItem.constructor (constructor)
  constructor();

  // StepAP203_ContractedItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_ContractedItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP203_ContractedItem.delete (method)
  delete(): void;

  // StepAP203_ContractedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_DateTimeItem: declare class StepAP203_DateTimeItem extends StepData_SelectType

  // StepAP203_DateTimeItem.constructor (constructor)
  constructor();

  // StepAP203_DateTimeItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_DateTimeItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP203_DateTimeItem.ChangeRequest (method)
  ChangeRequest(): StepAP203_ChangeRequest;

  // StepAP203_DateTimeItem.StartRequest (method)
  StartRequest(): StepAP203_StartRequest;

  // StepAP203_DateTimeItem.Change (method)
  Change(): StepAP203_Change;

  // StepAP203_DateTimeItem.StartWork (method)
  StartWork(): StepAP203_StartWork;

  // StepAP203_DateTimeItem.ApprovalPersonOrganization (method)
  ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

  // StepAP203_DateTimeItem.Contract (method)
  Contract(): StepBasic_Contract;

  // StepAP203_DateTimeItem.SecurityClassification (method)
  SecurityClassification(): StepBasic_SecurityClassification;

  // StepAP203_DateTimeItem.Certification (method)
  Certification(): StepBasic_Certification;

  // StepAP203_DateTimeItem.delete (method)
  delete(): void;

  // StepAP203_DateTimeItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_PersonOrganizationItem: declare class StepAP203_PersonOrganizationItem extends StepData_SelectType

  // StepAP203_PersonOrganizationItem.constructor (constructor)
  constructor();

  // StepAP203_PersonOrganizationItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_PersonOrganizationItem.Change (method)
  Change(): StepAP203_Change;

  // StepAP203_PersonOrganizationItem.StartWork (method)
  StartWork(): StepAP203_StartWork;

  // StepAP203_PersonOrganizationItem.ChangeRequest (method)
  ChangeRequest(): StepAP203_ChangeRequest;

  // StepAP203_PersonOrganizationItem.StartRequest (method)
  StartRequest(): StepAP203_StartRequest;

  // StepAP203_PersonOrganizationItem.ConfigurationItem (method)
  ConfigurationItem(): StepRepr_ConfigurationItem;

  // StepAP203_PersonOrganizationItem.Product (method)
  Product(): StepBasic_Product;

  // StepAP203_PersonOrganizationItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP203_PersonOrganizationItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP203_PersonOrganizationItem.Contract (method)
  Contract(): StepBasic_Contract;

  // StepAP203_PersonOrganizationItem.SecurityClassification (method)
  SecurityClassification(): StepBasic_SecurityClassification;

  // StepAP203_PersonOrganizationItem.delete (method)
  delete(): void;

  // StepAP203_PersonOrganizationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_SpecifiedItem: declare class StepAP203_SpecifiedItem extends StepData_SelectType

  // StepAP203_SpecifiedItem.constructor (constructor)
  constructor();

  // StepAP203_SpecifiedItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_SpecifiedItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepAP203_SpecifiedItem.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepAP203_SpecifiedItem.delete (method)
  delete(): void;

  // StepAP203_SpecifiedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_StartRequest: declare class StepAP203_StartRequest extends StepBasic_ActionRequestAssignment

  // StepAP203_StartRequest.constructor (constructor)
  constructor();

  // StepAP203_StartRequest.Init (method)
  Init(aActionRequestAssignment_AssignedActionRequest: StepBasic_VersionedActionRequest, aItems: NCollection_HArray1_StepAP203_StartRequestItem): void;
  Init(aAssignedActionRequest: StepBasic_VersionedActionRequest): void;

  // StepAP203_StartRequest.Items (method)
  Items(): NCollection_HArray1_StepAP203_StartRequestItem;

  // StepAP203_StartRequest.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_StartRequestItem): void;

  // StepAP203_StartRequest.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_StartRequest.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_StartRequest.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_StartRequest.delete (method)
  delete(): void;

  // StepAP203_StartRequest.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_StartRequestItem: declare class StepAP203_StartRequestItem extends StepData_SelectType

  // StepAP203_StartRequestItem.constructor (constructor)
  constructor();

  // StepAP203_StartRequestItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_StartRequestItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP203_StartRequestItem.delete (method)
  delete(): void;

  // StepAP203_StartRequestItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_StartWork: declare class StepAP203_StartWork extends StepBasic_ActionAssignment

  // StepAP203_StartWork.constructor (constructor)
  constructor();

  // StepAP203_StartWork.Init (method)
  Init(aActionAssignment_AssignedAction: StepBasic_Action, aItems: NCollection_HArray1_StepAP203_WorkItem): void;
  Init(aAssignedAction: StepBasic_Action): void;

  // StepAP203_StartWork.Items (method)
  Items(): NCollection_HArray1_StepAP203_WorkItem;

  // StepAP203_StartWork.SetItems (method)
  SetItems(Items: NCollection_HArray1_StepAP203_WorkItem): void;

  // StepAP203_StartWork.get_type_name (method)
  static get_type_name(): string;

  // StepAP203_StartWork.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepAP203_StartWork.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepAP203_StartWork.delete (method)
  delete(): void;

  // StepAP203_StartWork.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepAP203_WorkItem: declare class StepAP203_WorkItem extends StepData_SelectType

  // StepAP203_WorkItem.constructor (constructor)
  constructor();

  // StepAP203_WorkItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepAP203_WorkItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepAP203_WorkItem.delete (method)
  delete(): void;

  // StepAP203_WorkItem.[Symbol.dispose] (method)
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
