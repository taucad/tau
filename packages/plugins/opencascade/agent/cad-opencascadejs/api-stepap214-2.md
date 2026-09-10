# libcascade — StepAP214 (2)

18 top-level symbols. Signatures are verbatim typescript.

StepAP214_AutoDesignGroupedItem: declare class StepAP214_AutoDesignGroupedItem extends StepData_SelectType

constructor

// Recognizes a AutoDesignGroupedItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a AdvancedBrepShapeRepresentation (Null if another type)
AdvancedBrepShapeRepresentation(): StepShape_AdvancedBrepShapeRepresentation;

// returns Value as a CsgShapeRepresentation (Null if another type)
CsgShapeRepresentation(): StepShape_CsgShapeRepresentation;

// returns Value as a FacetedBrepShapeRepresentation (Null if another type)
FacetedBrepShapeRepresentation(): StepShape_FacetedBrepShapeRepresentation;

// returns Value as a GeometricallyBoundedSurfaceShapeRepresentation (Null if another type)
GeometricallyBoundedSurfaceShapeRepresentation(): StepShape_GeometricallyBoundedSurfaceShapeRepresentation;

// returns Value as a GeometricallyBoundedWireframeShapeRepresentation (Null if another type)
GeometricallyBoundedWireframeShapeRepresentation(): StepShape_GeometricallyBoundedWireframeShapeRepresentation;

// returns Value as a ManifoldSurfaceShapeRepresentation (Null if another type)
ManifoldSurfaceShapeRepresentation(): StepShape_ManifoldSurfaceShapeRepresentation;

// returns Value as a Representation (Null if another type)
Representation(): StepRepr_Representation;

// returns Value as a RepresentationItem (Null if another type)
RepresentationItem(): StepRepr_RepresentationItem;

// returns Value as a ShapeAspect (Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// returns Value as a ShapeRepresentation (Null if another type)
ShapeRepresentation(): StepShape_ShapeRepresentation;

// returns Value as a TemplateInstance (Null if another type)
TemplateInstance(): StepVisual_TemplateInstance;

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_AutoDesignOrganizationItem: declare class StepAP214_AutoDesignOrganizationItem extends StepAP214_AutoDesignGeneralOrgItem

constructor

// Recognizes a AutoDesignGeneralOrgItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

Document(): StepBasic_Document;

PhysicallyModeledProductDefinition(): StepBasic_PhysicallyModeledProductDefinition;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_AutoDesignPresentedItemSelect: declare class StepAP214_AutoDesignPresentedItemSelect extends StepData_SelectType

constructor

// Recognizes a AutoDesignPresentedItemSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ProductDefinitionRelationship (Null if another type)
ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

// returns Value as a ProductDefinition (Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// returns Value as a ProductDefinitionShape (Null if another type)
ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

// returns Value as a RepresentationRelationship (Null if another type)
RepresentationRelationship(): StepRepr_RepresentationRelationship;

// returns Value as a ShapeAspect (Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// returns Value as a DocumentRelationship (Null if another type)
DocumentRelationship(): StepBasic_DocumentRelationship;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_AutoDesignReferencingItem: declare class StepAP214_AutoDesignReferencingItem extends StepData_SelectType

constructor

// Recognizes a AutoDesignReferencingItem Kind Entity that is
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Class
StepAP214_Class: declare class StepAP214_Class extends StepBasic_Group

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_DateAndTimeItem: declare class StepAP214_DateAndTimeItem extends StepAP214_ApprovalItem

constructor

// Recognizes a DateAndTimeItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ApprovalPersonOrganization (Null if another type)
ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

// returns Value as a AppliedDateAndPersonAssignment (Null if another type)
AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

// returns Value as a AppliedOrganizationAssignment (Null if another type)
AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_DateItem: declare class StepAP214_DateItem extends StepAP214_ApprovalItem

constructor

// Recognizes a DateItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ApprovalPersonOrganization (Null if another type)
ApprovalPersonOrganization(): StepBasic_ApprovalPersonOrganization;

// returns Value as a AppliedDateAndPersonAssignment (Null if another type)
AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

// returns Value as a AppliedOrganizationAssignment (Null if another type)
AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

// returns Value as a AppliedSecurityClassificationAssignment (Null if another type)
AppliedSecurityClassificationAssignment(): StepAP214_AppliedSecurityClassificationAssignment;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_DocumentReferenceItem: declare class StepAP214_DocumentReferenceItem extends StepData_SelectType

constructor

// Recognizes a DocumentReferenceItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Approval (Null if another type)
Approval(): StepBasic_Approval;

// returns Value as a (Null if another type)
DescriptiveRepresentationItem(): StepRepr_DescriptiveRepresentationItem;

// returns Value as a MaterialDesignation (Null if another type)
MaterialDesignation(): StepRepr_MaterialDesignation;

// returns Value as a ProductDefinition (Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// returns Value as aProductDefinitionRelationship (Null if another type)
ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

// returns Value as a PropertyDefinition (Null if another type)
PropertyDefinition(): StepRepr_PropertyDefinition;

// returns Value as a Representation (Null if another type)
Representation(): StepRepr_Representation;

// returns Value as a ShapeAspect (Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// returns Value as a ShapeAspectRelationship (Null if another type)
ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

// returns Value as a AppliedExternalIdentificationAssignment (Null if another type)
AppliedExternalIdentificationAssignment(): StepAP214_AppliedExternalIdentificationAssignment;

// returns Value as a AssemblyComponentUsage (Null if another type)
AssemblyComponentUsage(): StepRepr_AssemblyComponentUsage;

// returns Value as a CharacterizedObject (Null if another type)
CharacterizedObject(): StepBasic_CharacterizedObject;

// returns Value as a DimensionalSize (Null if another type)
DimensionalSize(): StepShape_DimensionalSize;

// returns Value as a ExternallyDefinedItem (Null if another type)
ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

// returns Value as a Group (Null if another type)
Group(): StepBasic_Group;

// returns Value as a GroupRelationship (Null if another type)
GroupRelationship(): StepBasic_GroupRelationship;

// returns Value as a MeasureRepresentationItem (Null if another type)
MeasureRepresentationItem(): StepRepr_MeasureRepresentationItem;

// returns Value as a ProductCategory (Null if another type)
ProductCategory(): StepBasic_ProductCategory;

// returns Value as a ProductDefinitionContext (Null if another type)
ProductDefinitionContext(): StepBasic_ProductDefinitionContext;

// returns Value as a RepresentationItem (Null if another type)
RepresentationItem(): StepRepr_RepresentationItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type ExternalIdentificationItem
StepAP214_ExternalIdentificationItem: declare class StepAP214_ExternalIdentificationItem extends StepData_SelectType

constructor

// Recognizes a kind of ExternalIdentificationItem select type 1 -> DocumentFile from StepBasic 2 -> ExternallyDefinedClass from {@link StepAP214`StepAP214`} 3 -> ExternallyDefinedGeneralProperty from {@link StepAP214`StepAP214`} 4 -> ProductDefinition from StepBasic 5 -> AppliedOrganizationAssignment from AP214 6 -> AppliedPersonAndOrganizationAssignment from AP214 7 -> Approval from StepBasic 8 -> ApprovalStatus from StepBasic 9 -> ExternalSource from StepBasic 10 -> OrganizationalAddress from StepBasic 11 -> SecurityClassification from StepBasic 12 -> TrimmedCurve from StepGeom 13 -> VersionedActionRequest from StepBasic 14 -> DateAndTimeAssignment from StepBasic 15 -> DateAssignment from StepBasic 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as DocumentFile (or Null if another type)
DocumentFile(): StepBasic_DocumentFile;

// Returns Value as ExternallyDefinedClass (or Null if another type)
ExternallyDefinedClass(): StepAP214_ExternallyDefinedClass;

// Returns Value as ExternallyDefinedGeneralProperty (or Null if another type)
ExternallyDefinedGeneralProperty(): StepAP214_ExternallyDefinedGeneralProperty;

// Returns Value as ProductDefinition (or Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// Returns Value as AppliedOrganizationAssignment (or Null if another type)
AppliedOrganizationAssignment(): StepAP214_AppliedOrganizationAssignment;

// Returns Value as AppliedPersonAndOrganizationAssignment (or Null if another type)
AppliedPersonAndOrganizationAssignment(): StepAP214_AppliedPersonAndOrganizationAssignment;

// Returns Value as Approval (or Null if another type)
Approval(): StepBasic_Approval;

// Returns Value as ApprovalStatus (or Null if another type)
ApprovalStatus(): StepBasic_ApprovalStatus;

// Returns Value as ExternalSource (or Null if another type)
ExternalSource(): StepBasic_ExternalSource;

// Returns Value as OrganizationalAddress (or Null if another type)
OrganizationalAddress(): StepBasic_OrganizationalAddress;

// Returns Value as SecurityClassification (or Null if another type)
SecurityClassification(): StepBasic_SecurityClassification;

// Returns Value as TrimmedCurve (or Null if another type)
TrimmedCurve(): StepGeom_TrimmedCurve;

// Returns Value as VersionedActionRequest (or Null if another type)
VersionedActionRequest(): StepBasic_VersionedActionRequest;

// Returns Value as DateAndTimeAssignment (or Null if another type)
DateAndTimeAssignment(): StepBasic_DateAndTimeAssignment;

// Returns Value as DateAssignment (or Null if another type)
DateAssignment(): StepBasic_DateAssignment;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ExternallyDefinedClass
StepAP214_ExternallyDefinedClass: declare class StepAP214_ExternallyDefinedClass extends StepAP214_Class

constructor

// Initialize all fields (own and inherited)
Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGroup_Name: TCollection_HAsciiString, hasGroup_Description: boolean, aGroup_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns data for supertype ExternallyDefinedItem
ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

// Set data for supertype ExternallyDefinedItem
SetExternallyDefinedItem(ExternallyDefinedItem: StepBasic_ExternallyDefinedItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ExternallyDefinedGeneralProperty
StepAP214_ExternallyDefinedGeneralProperty: declare class StepAP214_ExternallyDefinedGeneralProperty extends StepBasic_GeneralProperty

constructor

// Initialize all fields (own and inherited)
Init(aGeneralProperty_Id: TCollection_HAsciiString, aGeneralProperty_Name: TCollection_HAsciiString, hasGeneralProperty_Description: boolean, aGeneralProperty_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;
Init(aGeneralProperty_Id: TCollection_HAsciiString, aGeneralProperty_Name: TCollection_HAsciiString, hasGeneralProperty_Description: boolean, aGeneralProperty_Description: TCollection_HAsciiString, aExternallyDefinedItem_ItemId: StepBasic_SourceItem, aExternallyDefinedItem_Source: StepBasic_ExternalSource): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString): void;

// Returns data for supertype ExternallyDefinedItem
ExternallyDefinedItem(): StepBasic_ExternallyDefinedItem;

// Set data for supertype ExternallyDefinedItem
SetExternallyDefinedItem(ExternallyDefinedItem: StepBasic_ExternallyDefinedItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepAP214_GroupItem: declare class StepAP214_GroupItem extends StepData_SelectType

constructor

// Recognizes a GroupItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a GeometricRepresentationItem (Null if another type)
GeometricRepresentationItem(): StepGeom_GeometricRepresentationItem;

// returns Value as a GroupRelationship (Null if another type)
GroupRelationship(): StepBasic_GroupRelationship;

// returns Value as a MappedItem (Null if another type)
MappedItem(): StepRepr_MappedItem;

// returns Value as a ProductDefinition (Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// returns Value as a ProductDefinitionFormation (Null if another type)
ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

// returns Value as a PropertyDefinitionRepresentation (Null if another type)
PropertyDefinitionRepresentation(): StepRepr_PropertyDefinitionRepresentation;

// returns Value as a Representation (Null if another type)
Representation(): StepRepr_Representation;

// returns Value as a RepresentationItem (Null if another type)
RepresentationItem(): StepRepr_RepresentationItem;

// returns Value as a RepresentationRelationshipWithTransformation (Null if another type)
RepresentationRelationshipWithTransformation(): StepRepr_RepresentationRelationshipWithTransformation;

// returns Value as a ShapeAspect (Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// returns Value as a ShapeAspectRelationship (Null if another type)
ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

// returns Value as a ShapeRepresentationRelationship (Null if another type)
ShapeRepresentationRelationship(): StepRepr_ShapeRepresentationRelationship;

// returns Value as a StyledItem (Null if another type)
StyledItem(): StepVisual_StyledItem;

// returns Value as a TopologicalRepresentationItem (Null if another type)
TopologicalRepresentationItem(): StepShape_TopologicalRepresentationItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
