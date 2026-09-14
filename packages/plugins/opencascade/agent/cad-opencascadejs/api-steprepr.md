# libcascade — StepRepr

34 top-level symbols. Signatures are verbatim typescript.

StepRepr_AllAroundShapeAspect: declare class StepRepr_AllAroundShapeAspect extends StepRepr_ContinuosShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_Apex: declare class StepRepr_Apex extends StepRepr_DerivedShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_AssemblyComponentUsage: declare class StepRepr_AssemblyComponentUsage extends StepRepr_ProductDefinitionUsage

  constructor

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

  ReferenceDesignator(): TCollection_HAsciiString;

  SetReferenceDesignator(ReferenceDesignator: TCollection_HAsciiString): void;

  HasReferenceDesignator(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_BetweenShapeAspect: declare class StepRepr_BetweenShapeAspect extends StepRepr_ContinuosShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_CentreOfSymmetry: declare class StepRepr_CentreOfSymmetry extends StepRepr_DerivedShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_CharacterizedDefinition: declare class StepRepr_CharacterizedDefinition extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  CharacterizedObject(): StepBasic_CharacterizedObject;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

  ShapeAspect(): StepRepr_ShapeAspect;

  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  DocumentFile(): StepBasic_DocumentFile;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_CharacterizedRepresentation: declare class StepRepr_CharacterizedRepresentation extends StepRepr_Representation

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, theContextOfItems: StepRepr_RepresentationContext): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, theContextOfItems: StepRepr_RepresentationContext): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  SetDescription(theDescription: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp: declare class StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp extends StepRepr_CompShAspAndDatumFeatAndShAsp

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_CompShAspAndDatumFeatAndShAsp: declare class StepRepr_CompShAspAndDatumFeatAndShAsp extends StepRepr_ShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_CompositeGroupShapeAspect: declare class StepRepr_CompositeGroupShapeAspect extends StepRepr_CompositeShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_CompositeShapeAspect: declare class StepRepr_CompositeShapeAspect extends StepRepr_ShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

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

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ConfigurationDesign: declare class StepRepr_ConfigurationDesign extends Standard_Transient

  constructor

  Init(aConfiguration: StepRepr_ConfigurationItem, aDesign: StepRepr_ConfigurationDesignItem): void;

  Configuration(): StepRepr_ConfigurationItem;

  SetConfiguration(Configuration: StepRepr_ConfigurationItem): void;

  Design(): StepRepr_ConfigurationDesignItem;

  SetDesign(Design: StepRepr_ConfigurationDesignItem): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ConfigurationDesignItem: declare class StepRepr_ConfigurationDesignItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ProductDefinition(): StepBasic_ProductDefinition;

  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ConfigurationEffectivity: declare class StepRepr_ConfigurationEffectivity extends StepBasic_ProductDefinitionEffectivity

  constructor

  Init(aEffectivity_Id: TCollection_HAsciiString, aProductDefinitionEffectivity_Usage: StepBasic_ProductDefinitionRelationship, aConfiguration: StepRepr_ConfigurationDesign): void;
  Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
  Init(aid: TCollection_HAsciiString): void;
  Init(aEffectivity_Id: TCollection_HAsciiString, aProductDefinitionEffectivity_Usage: StepBasic_ProductDefinitionRelationship, aConfiguration: StepRepr_ConfigurationDesign): void;
  Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
  Init(aid: TCollection_HAsciiString): void;
  Init(aEffectivity_Id: TCollection_HAsciiString, aProductDefinitionEffectivity_Usage: StepBasic_ProductDefinitionRelationship, aConfiguration: StepRepr_ConfigurationDesign): void;
  Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
  Init(aid: TCollection_HAsciiString): void;

  Configuration(): StepRepr_ConfigurationDesign;

  SetConfiguration(Configuration: StepRepr_ConfigurationDesign): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ConfigurationItem: declare class StepRepr_ConfigurationItem extends Standard_Transient

  constructor

  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aItemConcept: StepRepr_ProductConcept, hasPurpose: boolean, aPurpose: TCollection_HAsciiString): void;

  Id(): TCollection_HAsciiString;

  SetId(Id: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  HasDescription(): boolean;

  ItemConcept(): StepRepr_ProductConcept;

  SetItemConcept(ItemConcept: StepRepr_ProductConcept): void;

  Purpose(): TCollection_HAsciiString;

  SetPurpose(Purpose: TCollection_HAsciiString): void;

  HasPurpose(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ConstructiveGeometryRepresentation: declare class StepRepr_ConstructiveGeometryRepresentation extends StepRepr_Representation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ConstructiveGeometryRepresentationRelationship: declare class StepRepr_ConstructiveGeometryRepresentationRelationship extends StepRepr_RepresentationRelationship

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ContinuosShapeAspect: declare class StepRepr_ContinuosShapeAspect extends StepRepr_CompositeShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_DataEnvironment: declare class StepRepr_DataEnvironment extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aElements: NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation): void;

  Name(): TCollection_HAsciiString;

  SetName(Name: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(Description: TCollection_HAsciiString): void;

  Elements(): NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation;

  SetElements(Elements: NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_DefinitionalRepresentation: declare class StepRepr_DefinitionalRepresentation extends StepRepr_Representation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_DerivedShapeAspect: declare class StepRepr_DerivedShapeAspect extends StepRepr_ShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_Extension: declare class StepRepr_Extension extends StepRepr_DerivedShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ExternallyDefinedRepresentation: declare class StepRepr_ExternallyDefinedRepresentation extends StepRepr_Representation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_FeatureForDatumTargetRelationship: declare class StepRepr_FeatureForDatumTargetRelationship extends StepRepr_ShapeAspectRelationship

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

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

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_GeometricAlignment: declare class StepRepr_GeometricAlignment extends StepRepr_DerivedShapeAspect

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_GlobalUncertaintyAssignedContext: declare class StepRepr_GlobalUncertaintyAssignedContext extends StepRepr_RepresentationContext

  constructor

  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  SetUncertainty(aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;

  Uncertainty(): NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit;

  UncertaintyValue(num: number): StepBasic_UncertaintyMeasureWithUnit;

  NbUncertainty(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_GlobalUnitAssignedContext: declare class StepRepr_GlobalUnitAssignedContext extends StepRepr_RepresentationContext

  constructor

  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  SetUnits(aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;

  Units(): NCollection_HArray1_handle_StepBasic_NamedUnit;

  UnitsValue(num: number): StepBasic_NamedUnit;

  NbUnits(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_IntegerRepresentationItem: declare class StepRepr_IntegerRepresentationItem extends StepRepr_RepresentationItem

  constructor

  Init(theName: TCollection_HAsciiString, theValue: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theValue: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetValue(theValue: number): void;

  Value(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepRepr_ItemDefinedTransformation: declare class StepRepr_ItemDefinedTransformation extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aTransformItem1: StepRepr_RepresentationItem, aTransformItem2: StepRepr_RepresentationItem): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  HasDescription(): boolean;

  SetDescription(aDescription: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetTransformItem1(aItem: StepRepr_RepresentationItem): void;

  TransformItem1(): StepRepr_RepresentationItem;

  SetTransformItem2(aItem: StepRepr_RepresentationItem): void;

  TransformItem2(): StepRepr_RepresentationItem;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
