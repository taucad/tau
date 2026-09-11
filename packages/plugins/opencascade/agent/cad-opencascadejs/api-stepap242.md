# libcascade — StepAP242

6 top-level symbols. Signatures are verbatim typescript.

StepAP242_DraughtingModelItemAssociation: declare class StepAP242_DraughtingModelItemAssociation extends StepAP242_ItemIdentifiedRepresentationUsage

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP242_GeometricItemSpecificUsage: declare class StepAP242_GeometricItemSpecificUsage extends StepAP242_ItemIdentifiedRepresentationUsage

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP242_IdAttribute: declare class StepAP242_IdAttribute extends Standard_Transient

constructor

Init(theAttributeValue: TCollection_HAsciiString, theIdentifiedItem: StepAP242_IdAttributeSelect): void;

SetAttributeValue(theAttributeValue: TCollection_HAsciiString): void;

AttributeValue(): TCollection_HAsciiString;

SetIdentifiedItem(theIdentifiedItem: StepAP242_IdAttributeSelect): void;

IdentifiedItem(): StepAP242_IdAttributeSelect;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP242_IdAttributeSelect: declare class StepAP242_IdAttributeSelect extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

Action(): StepBasic_Action;

Address(): StepBasic_Address;

ApplicationContext(): StepBasic_ApplicationContext;

DimensionalSize(): StepShape_DimensionalSize;

GeometricTolerance(): StepDimTol_GeometricTolerance;

Group(): StepBasic_Group;

ProductCategory(): StepBasic_ProductCategory;

PropertyDefinition(): StepRepr_PropertyDefinition;

Representation(): StepRepr_Representation;

ShapeAspect(): StepRepr_ShapeAspect;

ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

delete(): void;

[Symbol.dispose](): void;

StepAP242_ItemIdentifiedRepresentationUsage: declare class StepAP242_ItemIdentifiedRepresentationUsage extends Standard_Transient

constructor

Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theDefinition: StepAP242_ItemIdentifiedRepresentationUsageDefinition, theUsedRepresentation: StepRepr_Representation, theIdentifiedItem: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

SetName(theName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetDescription(theDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetDefinition(theDefinition: StepAP242_ItemIdentifiedRepresentationUsageDefinition): void;

Definition(): StepAP242_ItemIdentifiedRepresentationUsageDefinition;

SetUsedRepresentation(theUsedRepresentation: StepRepr_Representation): void;

UsedRepresentation(): StepRepr_Representation;

IdentifiedItem(): NCollection_HArray1_handle_StepRepr_RepresentationItem;

NbIdentifiedItem(): number;

SetIdentifiedItem(theIdentifiedItem: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

IdentifiedItemValue(num: number): StepRepr_RepresentationItem;

SetIdentifiedItemValue(num: number, theItem: StepRepr_RepresentationItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepAP242_ItemIdentifiedRepresentationUsageDefinition: declare class StepAP242_ItemIdentifiedRepresentationUsageDefinition extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

AppliedApprovalAssignment(): StepAP214_AppliedApprovalAssignment;

AppliedDateAndTimeAssignment(): StepAP214_AppliedDateAndTimeAssignment;

AppliedDateAssignment(): StepAP214_AppliedDateAssignment;

AppliedDocumentReference(): StepAP214_AppliedDocumentReference;

AppliedExternalIdentificationAssignment(): StepAP214_AppliedExternalIdentificationAssignment;

AppliedGroupAssignment(): StepAP214_AppliedGroupAssignment;

AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

DimensionalSize(): StepShape_DimensionalSize;

GeneralProperty(): StepBasic_GeneralProperty;

GeometricTolerance(): StepDimTol_GeometricTolerance;

ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

PropertyDefinition(): StepRepr_PropertyDefinition;

PropertyDefinitionRelationship(): StepRepr_PropertyDefinitionRelationship;

ShapeAspect(): StepRepr_ShapeAspect;

ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

delete(): void;

[Symbol.dispose](): void;
