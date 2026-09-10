# libcascade — StepRepr

30 top-level symbols. Signatures are verbatim typescript.

// Added for Dimensional Tolerances
StepRepr_AllAroundShapeAspect: declare class StepRepr_AllAroundShapeAspect extends StepRepr_ContinuosShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_Apex: declare class StepRepr_Apex extends StepRepr_DerivedShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity AssemblyComponentUsage
StepRepr_AssemblyComponentUsage: declare class StepRepr_AssemblyComponentUsage extends StepRepr_ProductDefinitionUsage

constructor

// Initialize all fields (own and inherited)
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

// Returns field ReferenceDesignator
ReferenceDesignator(): TCollection_HAsciiString;

// Set field ReferenceDesignator
SetReferenceDesignator(ReferenceDesignator: TCollection_HAsciiString): void;

// Returns True if optional field ReferenceDesignator is defined
HasReferenceDesignator(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_AssemblyComponentUsageSubstitute: declare class StepRepr_AssemblyComponentUsageSubstitute extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aDef: TCollection_HAsciiString, aBase: StepRepr_AssemblyComponentUsage, aSubs: StepRepr_AssemblyComponentUsage): void;

Name(): TCollection_HAsciiString;

SetName(aName: TCollection_HAsciiString): void;

Definition(): TCollection_HAsciiString;

SetDefinition(aDef: TCollection_HAsciiString): void;

Base(): StepRepr_AssemblyComponentUsage;

SetBase(aBase: StepRepr_AssemblyComponentUsage): void;

Substitute(): StepRepr_AssemblyComponentUsage;

SetSubstitute(aSubstitute: StepRepr_AssemblyComponentUsage): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_BetweenShapeAspect: declare class StepRepr_BetweenShapeAspect extends StepRepr_ContinuosShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_BooleanRepresentationItem: declare class StepRepr_BooleanRepresentationItem extends StepRepr_RepresentationItem

constructor

Init(theName: TCollection_HAsciiString, theValue: boolean): void;
Init(aName: TCollection_HAsciiString): void;
Init(theName: TCollection_HAsciiString, theValue: boolean): void;
Init(aName: TCollection_HAsciiString): void;

SetValue(theValue: boolean): void;

Value(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_CentreOfSymmetry: declare class StepRepr_CentreOfSymmetry extends StepRepr_DerivedShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type CharacterizedDefinition
StepRepr_CharacterizedDefinition: declare class StepRepr_CharacterizedDefinition extends StepData_SelectType

constructor

// Recognizes a kind of CharacterizedDefinition select type 1 -> CharacterizedObject from StepBasic 2 -> ProductDefinition from StepBasic 3 -> ProductDefinitionRelationship from StepBasic 4 -> ProductDefinitionShape from StepRepr 5 -> ShapeAspect from StepRepr 6 -> ShapeAspectRelationship from StepRepr 7 -> DocumentFile from StepBasic 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as CharacterizedObject (or Null if another type)
CharacterizedObject(): StepBasic_CharacterizedObject;

// Returns Value as ProductDefinition (or Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// Returns Value as ProductDefinitionRelationship (or Null if another type)
ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

// Returns Value as ProductDefinitionShape (or Null if another type)
ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

// Returns Value as ShapeAspect (or Null if another type)
ShapeAspect(): StepRepr_ShapeAspect;

// Returns Value as ShapeAspectRelationship (or Null if another type)
ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

// Returns Value as DocumentFile (or Null if another type)
DocumentFile(): StepBasic_DocumentFile;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_CharacterizedRepresentation: declare class StepRepr_CharacterizedRepresentation extends StepRepr_Representation

constructor

// Returns a CharacterizedRepresentation
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, theContextOfItems: StepRepr_RepresentationContext): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, theContextOfItems: StepRepr_RepresentationContext): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

SetDescription(theDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp: declare class StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp extends StepRepr_CompShAspAndDatumFeatAndShAsp

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_CompShAspAndDatumFeatAndShAsp: declare class StepRepr_CompShAspAndDatumFeatAndShAsp extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_CompositeGroupShapeAspect: declare class StepRepr_CompositeGroupShapeAspect extends StepRepr_CompositeShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_CompositeShapeAspect: declare class StepRepr_CompositeShapeAspect extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_CompoundRepresentationItem: declare class StepRepr_CompoundRepresentationItem extends StepRepr_RepresentationItem

constructor

Init(aName: TCollection_HAsciiString, item_element: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, item_element: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;
Init(aName: TCollection_HAsciiString): void;

ItemElement(): NCollection_HArray1_handle_StepRepr_RepresentationItem;

NbItemElement(): number;

SetItemElement(item_element: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

ItemElementValue(num: number): StepRepr_RepresentationItem;

SetItemElementValue(num: number, anelement: StepRepr_RepresentationItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ConfigurationDesign
StepRepr_ConfigurationDesign: declare class StepRepr_ConfigurationDesign extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aConfiguration: StepRepr_ConfigurationItem, aDesign: StepRepr_ConfigurationDesignItem): void;

// Returns field Configuration
Configuration(): StepRepr_ConfigurationItem;

// Set field Configuration
SetConfiguration(Configuration: StepRepr_ConfigurationItem): void;

// Returns field Design
Design(): StepRepr_ConfigurationDesignItem;

// Set field Design
SetDesign(Design: StepRepr_ConfigurationDesignItem): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type ConfigurationDesignItem
StepRepr_ConfigurationDesignItem: declare class StepRepr_ConfigurationDesignItem extends StepData_SelectType

constructor

// Recognizes a kind of ConfigurationDesignItem select type 1 -> ProductDefinition from StepBasic 2 -> ProductDefinitionFormation from StepBasic 0 else
CaseNum(ent: Standard_Transient): number;

// Returns Value as ProductDefinition (or Null if another type)
ProductDefinition(): StepBasic_ProductDefinition;

// Returns Value as ProductDefinitionFormation (or Null if another type)
ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ConfigurationEffectivity
StepRepr_ConfigurationEffectivity: declare class StepRepr_ConfigurationEffectivity extends StepBasic_ProductDefinitionEffectivity

constructor

// Initialize all fields (own and inherited)
Init(aEffectivity_Id: TCollection_HAsciiString, aProductDefinitionEffectivity_Usage: StepBasic_ProductDefinitionRelationship, aConfiguration: StepRepr_ConfigurationDesign): void;
Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
Init(aid: TCollection_HAsciiString): void;
Init(aEffectivity_Id: TCollection_HAsciiString, aProductDefinitionEffectivity_Usage: StepBasic_ProductDefinitionRelationship, aConfiguration: StepRepr_ConfigurationDesign): void;
Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
Init(aid: TCollection_HAsciiString): void;
Init(aEffectivity_Id: TCollection_HAsciiString, aProductDefinitionEffectivity_Usage: StepBasic_ProductDefinitionRelationship, aConfiguration: StepRepr_ConfigurationDesign): void;
Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
Init(aid: TCollection_HAsciiString): void;

// Returns field Configuration
Configuration(): StepRepr_ConfigurationDesign;

// Set field Configuration
SetConfiguration(Configuration: StepRepr_ConfigurationDesign): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ConfigurationItem
StepRepr_ConfigurationItem: declare class StepRepr_ConfigurationItem extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aItemConcept: StepRepr_ProductConcept, hasPurpose: boolean, aPurpose: TCollection_HAsciiString): void;

// Returns field Id
Id(): TCollection_HAsciiString;

// Set field Id
SetId(Id: TCollection_HAsciiString): void;

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

// Returns field ItemConcept
ItemConcept(): StepRepr_ProductConcept;

// Set field ItemConcept
SetItemConcept(ItemConcept: StepRepr_ProductConcept): void;

// Returns field Purpose
Purpose(): TCollection_HAsciiString;

// Set field Purpose
SetPurpose(Purpose: TCollection_HAsciiString): void;

// Returns True if optional field Purpose is defined
HasPurpose(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ConstructiveGeometryRepresentation: declare class StepRepr_ConstructiveGeometryRepresentation extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ConstructiveGeometryRepresentationRelationship: declare class StepRepr_ConstructiveGeometryRepresentationRelationship extends StepRepr_RepresentationRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_ContinuosShapeAspect: declare class StepRepr_ContinuosShapeAspect extends StepRepr_CompositeShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DataEnvironment
StepRepr_DataEnvironment: declare class StepRepr_DataEnvironment extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aElements: NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(Name: TCollection_HAsciiString): void;

// Returns field Description
Description(): TCollection_HAsciiString;

// Set field Description
SetDescription(Description: TCollection_HAsciiString): void;

// Returns field Elements
Elements(): NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation;

// Set field Elements
SetElements(Elements: NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_DefinitionalRepresentation: declare class StepRepr_DefinitionalRepresentation extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_DerivedShapeAspect: declare class StepRepr_DerivedShapeAspect extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_DescriptiveRepresentationItem: declare class StepRepr_DescriptiveRepresentationItem extends StepRepr_RepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString): void;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_Extension: declare class StepRepr_Extension extends StepRepr_DerivedShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_ExternallyDefinedRepresentation: declare class StepRepr_ExternallyDefinedRepresentation extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DimensionalLocation
StepRepr_FeatureForDatumTargetRelationship: declare class StepRepr_FeatureForDatumTargetRelationship extends StepRepr_ShapeAspectRelationship

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepRepr_FunctionallyDefinedTransformation: declare class StepRepr_FunctionallyDefinedTransformation extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepRepr_GeometricAlignment: declare class StepRepr_GeometricAlignment extends StepRepr_DerivedShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
