# libcascade — StepAP242

6 top-level symbols. Signatures are verbatim typescript.

// Added for Dimensional Tolerances
StepAP242_DraughtingModelItemAssociation: declare class StepAP242_DraughtingModelItemAssociation extends StepAP242_ItemIdentifiedRepresentationUsage

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepAP242_GeometricItemSpecificUsage: declare class StepAP242_GeometricItemSpecificUsage extends StepAP242_ItemIdentifiedRepresentationUsage

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP242_IdAttribute: declare class StepAP242_IdAttribute extends Standard_Transient

constructor

// Init all field own and inherited
Init(theAttributeValue: TCollection_HAsciiString, theIdentifiedItem: StepAP242_IdAttributeSelect): void;

SetAttributeValue(theAttributeValue: TCollection_HAsciiString): void;

// Returns field AttributeValue
AttributeValue(): TCollection_HAsciiString;

// Set field IdentifiedItem
SetIdentifiedItem(theIdentifiedItem: StepAP242_IdAttributeSelect): void;

// Returns IdentifiedItem
IdentifiedItem(): StepAP242_IdAttributeSelect;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP242_IdAttributeSelect: declare class StepAP242_IdAttributeSelect extends StepData_SelectType

constructor

// Recognizes a IdAttributeSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Action (Null if another type)
Action(): StepBasic_Action;

// returns Value as a Address (Null if another type)
Address(): StepBasic_Address;

// returns Value as a ApplicationContext (Null if another type)
ApplicationContext(): StepBasic_ApplicationContext;

// returns Value as a DimensionalSize (Null if another type)
DimensionalSize(): StepShape_DimensionalSize;

// returns Value as a GeometricTolerance (Null if another type)
GeometricTolerance(): StepDimTol_GeometricTolerance;

// returns Value as a Group (Null if another type)
Group(): StepBasic_Group;

// returns Value as a ProductCategory (Null if another type)
ProductCategory(): StepBasic_ProductCategory;

// returns Value as a PropertyDefinition (Null if another type)
PropertyDefinition(): StepRepr_PropertyDefinition;

// returns Value as a Representation (Null if another type)
Representation(): StepRepr_Representation;

// returns Value as a ShapeAspect (Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// returns Value as a ShapeAspectRelationship (Null if another type)
ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP242_ItemIdentifiedRepresentationUsage: declare class StepAP242_ItemIdentifiedRepresentationUsage extends Standard_Transient

constructor

// Init all fields own and inherited
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theDefinition: StepAP242_ItemIdentifiedRepresentationUsageDefinition, theUsedRepresentation: StepRepr_Representation, theIdentifiedItem: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

// Set field Name
SetName(theName: TCollection_HAsciiString): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Description
SetDescription(theDescription: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Definition
SetDefinition(theDefinition: StepAP242_ItemIdentifiedRepresentationUsageDefinition): void;

// Returns field Definition
Definition(): StepAP242_ItemIdentifiedRepresentationUsageDefinition;

// Set field UsedRepresentation
SetUsedRepresentation(theUsedRepresentation: StepRepr_Representation): void;

// Returns field UsedRepresentation
UsedRepresentation(): StepRepr_Representation;

// Returns field IdentifiedItem
IdentifiedItem(): NCollection_HArray1_handle_StepRepr_RepresentationItem;

// Returns number of identified items
NbIdentifiedItem(): number;

// Set field IdentifiedItem
SetIdentifiedItem(theIdentifiedItem: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

// Returns identified item with given number
IdentifiedItemValue(num: number): StepRepr_RepresentationItem;

// Set identified item with given number
SetIdentifiedItemValue(num: number, theItem: StepRepr_RepresentationItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP242_ItemIdentifiedRepresentationUsageDefinition: declare class StepAP242_ItemIdentifiedRepresentationUsageDefinition extends StepData_SelectType

constructor

// Recognizes a ItemIdentifiedRepresentationUsageDefinition Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a AppliedApprovalAssignment (Null if another type)
AppliedApprovalAssignment(): StepAP214_AppliedApprovalAssignment;

// returns Value as a AppliedDateAndTimeAssignment (Null if another type)
AppliedDateAndTimeAssignment(): StepAP214_AppliedDateAndTimeAssignment;

// returns Value as a AppliedDateAssignment (Null if another type)
AppliedDateAssignment(): StepAP214_AppliedDateAssignment;

// returns Value as a AppliedDocumentReference (Null if another type)
AppliedDocumentReference(): StepAP214_AppliedDocumentReference;

// returns Value as a AppliedExternalIdentificationAssignment (Null if another type)
AppliedExternalIdentificationAssignment(): StepAP214_AppliedExternalIdentificationAssignment;

// returns Value as a AppliedGroupAssignment (Null if another type)
AppliedGroupAssignment(): StepAP214_AppliedGroupAssignment;

// returns Value as a AppliedOrganizationAssignment (Null if another type)
AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

// returns Value as a AppliedPersonAndOrganizationAssignment (Null if another type)
AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

// returns Value as a AppliedSecurityClassificationAssignment (Null if another type)
AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

// returns Value as a DimensionalSize (Null if another type)
DimensionalSize(): StepShape_DimensionalSize;

// returns Value as a GeneralProperty (Null if another type)
GeneralProperty(): StepBasic_GeneralProperty;

// returns Value as a GeometricTolerance (Null if another type)
GeometricTolerance(): StepDimTol_GeometricTolerance;

// returns Value as a ProductDefinitionRelationship (Null if another type)
ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

// returns Value as a PropertyDefinition (Null if another type)
PropertyDefinition(): StepRepr_PropertyDefinition;

// returns Value as a PropertyDefinitionRelationship (Null if another type)
PropertyDefinitionRelationship(): StepRepr_PropertyDefinitionRelationship;

// returns Value as a ShapeAspect (Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// returns Value as a ShapeAspectRelationship (Null if another type)
ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
