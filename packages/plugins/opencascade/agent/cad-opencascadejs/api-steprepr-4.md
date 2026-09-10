# libcascade — StepRepr (4)

25 top-level symbols. Signatures are verbatim typescript.

StepRepr_RepresentationRelationshipWithTransformation: declare class StepRepr_RepresentationRelationshipWithTransformation extends StepRepr_ShapeRepresentationRelationship

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRep1: StepRepr_Representation, aRep2: StepRepr_Representation, aTransf: StepRepr_Transformation): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRep1: StepRepr_Representation, aRep2: StepRepr_Representation): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRep1: StepRepr_Representation, aRep2: StepRepr_Representation, aTransf: StepRepr_Transformation): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRep1: StepRepr_Representation, aRep2: StepRepr_Representation): void;

TransformationOperator(): StepRepr_Transformation;

SetTransformationOperator(aTrans: StepRepr_Transformation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type RepresentedDefinition
StepRepr_RepresentedDefinition: declare class StepRepr_RepresentedDefinition extends StepData_SelectType

constructor

// Recognizes a kind of RepresentedDefinition select type 1 -> GeneralProperty from StepBasic 2 -> PropertyDefinition from StepRepr 3 -> PropertyDefinitionRelationship from StepRepr 4 -> ShapeAspect from StepRepr 5 -> ShapeAspectRelationship from StepRepr 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as GeneralProperty (or Null if another type)
GeneralProperty(): StepBasic_GeneralProperty;

// Returns Value as PropertyDefinition (or Null if another type)
PropertyDefinition(): StepRepr_PropertyDefinition;

// Returns Value as PropertyDefinitionRelationship (or Null if another type)
PropertyDefinitionRelationship(): StepRepr_PropertyDefinitionRelationship;

// Returns Value as ShapeAspect (or Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// Returns Value as ShapeAspectRelationship (or Null if another type)
ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ShapeAspect: declare class StepRepr_ShapeAspect extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetOfShape(aOfShape: StepRepr_ProductDefinitionShape): void;

OfShape(): StepRepr_ProductDefinitionShape;

SetProductDefinitional(aProductDefinitional: StepData_Logical): void;

ProductDefinitional(): StepData_Logical;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_ShapeAspectDerivingRelationship: declare class StepRepr_ShapeAspectDerivingRelationship extends StepRepr_ShapeAspectRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ShapeAspectRelationship
StepRepr_ShapeAspectRelationship: declare class StepRepr_ShapeAspectRelationship extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns True if optional field Description is defined
HasDescription(): boolean;

// Returns field RelatingShapeAspect
RelatingShapeAspect(): StepRepr_ShapeAspect;

// Set field RelatingShapeAspect
SetRelatingShapeAspect(RelatingShapeAspect: StepRepr_ShapeAspect): void;

// Returns field RelatedShapeAspect
RelatedShapeAspect(): StepRepr_ShapeAspect;

// Set field RelatedShapeAspect
SetRelatedShapeAspect(RelatedShapeAspect: StepRepr_ShapeAspect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ShapeAspectTransition
StepRepr_ShapeAspectTransition: declare class StepRepr_ShapeAspectTransition extends StepRepr_ShapeAspectRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ShapeDefinition: declare class StepRepr_ShapeDefinition extends StepData_SelectType

constructor

// Recognizes a ShapeDefinition Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ProductDefinitionShape (Null if another type)
ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

// returns Value as a ShapeAspect (Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// returns Value as a ShapeAspectRelationship (Null if another type)
ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ShapeRepresentationRelationship: declare class StepRepr_ShapeRepresentationRelationship extends StepRepr_RepresentationRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ShapeRepresentationRelationshipWithTransformation: declare class StepRepr_ShapeRepresentationRelationshipWithTransformation extends StepRepr_RepresentationRelationshipWithTransformation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SpecifiedHigherUsageOccurrence
StepRepr_SpecifiedHigherUsageOccurrence: declare class StepRepr_SpecifiedHigherUsageOccurrence extends StepRepr_AssemblyComponentUsage

constructor

// Initialize all fields (own and inherited)
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

// Returns field UpperUsage
UpperUsage(): StepRepr_AssemblyComponentUsage;

// Set field UpperUsage
SetUpperUsage(UpperUsage: StepRepr_AssemblyComponentUsage): void;

// Returns field NextUsage
NextUsage(): StepRepr_NextAssemblyUsageOccurrence;

// Set field NextUsage
SetNextUsage(NextUsage: StepRepr_NextAssemblyUsageOccurrence): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity StructuralResponseProperty
StepRepr_StructuralResponseProperty: declare class StepRepr_StructuralResponseProperty extends StepRepr_PropertyDefinition

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity StructuralResponsePropertyDefinitionRepresentation
StepRepr_StructuralResponsePropertyDefinitionRepresentation: declare class StepRepr_StructuralResponsePropertyDefinitionRepresentation extends StepRepr_PropertyDefinitionRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_SuppliedPartRelationship: declare class StepRepr_SuppliedPartRelationship extends StepBasic_ProductDefinitionRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_Tangent: declare class StepRepr_Tangent extends StepRepr_DerivedShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_Transformation: declare class StepRepr_Transformation extends StepData_SelectType

constructor

// Recognizes a Transformation Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a ItemDefinedTransformation (Null if another type)
ItemDefinedTransformation(): StepRepr_ItemDefinedTransformation;

// returns Value as a FunctionallyDefinedTransformation (Null if another type)
FunctionallyDefinedTransformation(): StepRepr_FunctionallyDefinedTransformation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_ValueRange: declare class StepRepr_ValueRange extends StepRepr_CompoundRepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ValueRepresentationItem: declare class StepRepr_ValueRepresentationItem extends StepRepr_RepresentationItem

constructor

Init(theName: TCollection_HAsciiString, theValueComponentMember: StepBasic_MeasureValueMember): void;
Init(aName: TCollection_HAsciiString): void;
Init(theName: TCollection_HAsciiString, theValueComponentMember: StepBasic_MeasureValueMember): void;
Init(aName: TCollection_HAsciiString): void;

SetValueComponentMember(theValueComponentMember: StepBasic_MeasureValueMember): void;

ValueComponentMember(): StepBasic_MeasureValueMember;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_Array1OfMaterialPropertyRepresentation: NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation

StepRepr_Array1OfPropertyDefinitionRepresentation: NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation

StepRepr_Array1OfRepresentationItem: NCollection_Array1_handle_StepRepr_RepresentationItem

StepRepr_Array1OfShapeAspect: NCollection_Array1_handle_StepRepr_ShapeAspect

StepRepr_HArray1OfMaterialPropertyRepresentation: NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation

StepRepr_HArray1OfPropertyDefinitionRepresentation: NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation

StepRepr_HArray1OfRepresentationItem: NCollection_HArray1_handle_StepRepr_RepresentationItem

StepRepr_HArray1OfShapeAspect: NCollection_HArray1_handle_StepRepr_ShapeAspect
