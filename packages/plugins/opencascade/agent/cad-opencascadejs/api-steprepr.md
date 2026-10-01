# libcascade — StepRepr

42 top-level symbols. Signatures are verbatim typescript.

StepRepr_AllAroundShapeAspect: declare class StepRepr_AllAroundShapeAspect extends StepRepr_ContinuosShapeAspect

  // StepRepr_AllAroundShapeAspect.constructor (constructor)
  constructor();

  // StepRepr_AllAroundShapeAspect.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_AllAroundShapeAspect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_AllAroundShapeAspect.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_AllAroundShapeAspect.delete (method)
  delete(): void;

  // StepRepr_AllAroundShapeAspect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_Apex: declare class StepRepr_Apex extends StepRepr_DerivedShapeAspect

  // StepRepr_Apex.constructor (constructor)
  constructor();

  // StepRepr_Apex.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_Apex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_Apex.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_Apex.delete (method)
  delete(): void;

  // StepRepr_Apex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_AssemblyComponentUsage: declare class StepRepr_AssemblyComponentUsage extends StepRepr_ProductDefinitionUsage

  // StepRepr_AssemblyComponentUsage.constructor (constructor)
  constructor();

  // StepRepr_AssemblyComponentUsage.Init (method)
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  // StepRepr_AssemblyComponentUsage.ReferenceDesignator (method)
  ReferenceDesignator(): TCollection_HAsciiString;

  // StepRepr_AssemblyComponentUsage.SetReferenceDesignator (method)
  SetReferenceDesignator(ReferenceDesignator: TCollection_HAsciiString): void;

  // StepRepr_AssemblyComponentUsage.HasReferenceDesignator (method)
  HasReferenceDesignator(): boolean;

  // StepRepr_AssemblyComponentUsage.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_AssemblyComponentUsage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_AssemblyComponentUsage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_AssemblyComponentUsage.delete (method)
  delete(): void;

  // StepRepr_AssemblyComponentUsage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_AssemblyComponentUsageSubstitute: declare class StepRepr_AssemblyComponentUsageSubstitute extends Standard_Transient

  // StepRepr_AssemblyComponentUsageSubstitute.constructor (constructor)
  constructor();

  // StepRepr_AssemblyComponentUsageSubstitute.Init (method)
  Init(aName: TCollection_HAsciiString, aDef: TCollection_HAsciiString, aBase: StepRepr_AssemblyComponentUsage, aSubs: StepRepr_AssemblyComponentUsage): void;

  // StepRepr_AssemblyComponentUsageSubstitute.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_AssemblyComponentUsageSubstitute.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepRepr_AssemblyComponentUsageSubstitute.Definition (method)
  Definition(): TCollection_HAsciiString;

  // StepRepr_AssemblyComponentUsageSubstitute.SetDefinition (method)
  SetDefinition(aDef: TCollection_HAsciiString): void;

  // StepRepr_AssemblyComponentUsageSubstitute.Base (method)
  Base(): StepRepr_AssemblyComponentUsage;

  // StepRepr_AssemblyComponentUsageSubstitute.SetBase (method)
  SetBase(aBase: StepRepr_AssemblyComponentUsage): void;

  // StepRepr_AssemblyComponentUsageSubstitute.Substitute (method)
  Substitute(): StepRepr_AssemblyComponentUsage;

  // StepRepr_AssemblyComponentUsageSubstitute.SetSubstitute (method)
  SetSubstitute(aSubstitute: StepRepr_AssemblyComponentUsage): void;

  // StepRepr_AssemblyComponentUsageSubstitute.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_AssemblyComponentUsageSubstitute.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_AssemblyComponentUsageSubstitute.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_AssemblyComponentUsageSubstitute.delete (method)
  delete(): void;

  // StepRepr_AssemblyComponentUsageSubstitute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_BetweenShapeAspect: declare class StepRepr_BetweenShapeAspect extends StepRepr_ContinuosShapeAspect

  // StepRepr_BetweenShapeAspect.constructor (constructor)
  constructor();

  // StepRepr_BetweenShapeAspect.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_BetweenShapeAspect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_BetweenShapeAspect.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_BetweenShapeAspect.delete (method)
  delete(): void;

  // StepRepr_BetweenShapeAspect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_BooleanRepresentationItem: declare class StepRepr_BooleanRepresentationItem extends StepRepr_RepresentationItem

  // StepRepr_BooleanRepresentationItem.constructor (constructor)
  constructor();

  // StepRepr_BooleanRepresentationItem.Init (method)
  Init(theName: TCollection_HAsciiString, theValue: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_BooleanRepresentationItem.SetValue (method)
  SetValue(theValue: boolean): void;

  // StepRepr_BooleanRepresentationItem.Value (method)
  Value(): boolean;

  // StepRepr_BooleanRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_BooleanRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_BooleanRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_BooleanRepresentationItem.delete (method)
  delete(): void;

  // StepRepr_BooleanRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_CentreOfSymmetry: declare class StepRepr_CentreOfSymmetry extends StepRepr_DerivedShapeAspect

  // StepRepr_CentreOfSymmetry.constructor (constructor)
  constructor();

  // StepRepr_CentreOfSymmetry.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_CentreOfSymmetry.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_CentreOfSymmetry.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_CentreOfSymmetry.delete (method)
  delete(): void;

  // StepRepr_CentreOfSymmetry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_CharacterizedDefinition: declare class StepRepr_CharacterizedDefinition extends StepData_SelectType

  // StepRepr_CharacterizedDefinition.constructor (constructor)
  constructor();

  // StepRepr_CharacterizedDefinition.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepRepr_CharacterizedDefinition.CharacterizedObject (method)
  CharacterizedObject(): StepBasic_CharacterizedObject;

  // StepRepr_CharacterizedDefinition.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepRepr_CharacterizedDefinition.ProductDefinitionRelationship (method)
  ProductDefinitionRelationship(): StepBasic_ProductDefinitionRelationship;

  // StepRepr_CharacterizedDefinition.ProductDefinitionShape (method)
  ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

  // StepRepr_CharacterizedDefinition.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepRepr_CharacterizedDefinition.ShapeAspectRelationship (method)
  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  // StepRepr_CharacterizedDefinition.DocumentFile (method)
  DocumentFile(): StepBasic_DocumentFile;

  // StepRepr_CharacterizedDefinition.delete (method)
  delete(): void;

  // StepRepr_CharacterizedDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_CharacterizedRepresentation: declare class StepRepr_CharacterizedRepresentation extends StepRepr_Representation

  // StepRepr_CharacterizedRepresentation.constructor (constructor)
  constructor();

  // StepRepr_CharacterizedRepresentation.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, theContextOfItems: StepRepr_RepresentationContext): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepRepr_CharacterizedRepresentation.SetDescription (method)
  SetDescription(theDescription: TCollection_HAsciiString): void;

  // StepRepr_CharacterizedRepresentation.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_CharacterizedRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_CharacterizedRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_CharacterizedRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_CharacterizedRepresentation.delete (method)
  delete(): void;

  // StepRepr_CharacterizedRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp: declare class StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp extends StepRepr_CompShAspAndDatumFeatAndShAsp

  // StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp.constructor (constructor)
  constructor();

  // StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp.delete (method)
  delete(): void;

  // StepRepr_CompGroupShAspAndCompShAspAndDatumFeatAndShAsp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_CompShAspAndDatumFeatAndShAsp: declare class StepRepr_CompShAspAndDatumFeatAndShAsp extends StepRepr_ShapeAspect

  // StepRepr_CompShAspAndDatumFeatAndShAsp.constructor (constructor)
  constructor();

  // StepRepr_CompShAspAndDatumFeatAndShAsp.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_CompShAspAndDatumFeatAndShAsp.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_CompShAspAndDatumFeatAndShAsp.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_CompShAspAndDatumFeatAndShAsp.delete (method)
  delete(): void;

  // StepRepr_CompShAspAndDatumFeatAndShAsp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_CompositeGroupShapeAspect: declare class StepRepr_CompositeGroupShapeAspect extends StepRepr_CompositeShapeAspect

  // StepRepr_CompositeGroupShapeAspect.constructor (constructor)
  constructor();

  // StepRepr_CompositeGroupShapeAspect.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_CompositeGroupShapeAspect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_CompositeGroupShapeAspect.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_CompositeGroupShapeAspect.delete (method)
  delete(): void;

  // StepRepr_CompositeGroupShapeAspect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_CompositeShapeAspect: declare class StepRepr_CompositeShapeAspect extends StepRepr_ShapeAspect

  // StepRepr_CompositeShapeAspect.constructor (constructor)
  constructor();

  // StepRepr_CompositeShapeAspect.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_CompositeShapeAspect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_CompositeShapeAspect.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_CompositeShapeAspect.delete (method)
  delete(): void;

  // StepRepr_CompositeShapeAspect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_CompoundRepresentationItem: declare class StepRepr_CompoundRepresentationItem extends StepRepr_RepresentationItem

  // StepRepr_CompoundRepresentationItem.constructor (constructor)
  constructor();

  // StepRepr_CompoundRepresentationItem.Init (method)
  Init(aName: TCollection_HAsciiString, item_element: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_CompoundRepresentationItem.ItemElement (method)
  ItemElement(): NCollection_HArray1_handle_StepRepr_RepresentationItem;

  // StepRepr_CompoundRepresentationItem.NbItemElement (method)
  NbItemElement(): number;

  // StepRepr_CompoundRepresentationItem.SetItemElement (method)
  SetItemElement(item_element: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

  // StepRepr_CompoundRepresentationItem.ItemElementValue (method)
  ItemElementValue(num: number): StepRepr_RepresentationItem;

  // StepRepr_CompoundRepresentationItem.SetItemElementValue (method)
  SetItemElementValue(num: number, anelement: StepRepr_RepresentationItem): void;

  // StepRepr_CompoundRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_CompoundRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_CompoundRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_CompoundRepresentationItem.delete (method)
  delete(): void;

  // StepRepr_CompoundRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ConfigurationDesign: declare class StepRepr_ConfigurationDesign extends Standard_Transient

  // StepRepr_ConfigurationDesign.constructor (constructor)
  constructor();

  // StepRepr_ConfigurationDesign.Init (method)
  Init(aConfiguration: StepRepr_ConfigurationItem, aDesign: StepRepr_ConfigurationDesignItem): void;

  // StepRepr_ConfigurationDesign.Configuration (method)
  Configuration(): StepRepr_ConfigurationItem;

  // StepRepr_ConfigurationDesign.SetConfiguration (method)
  SetConfiguration(Configuration: StepRepr_ConfigurationItem): void;

  // StepRepr_ConfigurationDesign.Design (method)
  Design(): StepRepr_ConfigurationDesignItem;

  // StepRepr_ConfigurationDesign.SetDesign (method)
  SetDesign(Design: StepRepr_ConfigurationDesignItem): void;

  // StepRepr_ConfigurationDesign.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ConfigurationDesign.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ConfigurationDesign.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ConfigurationDesign.delete (method)
  delete(): void;

  // StepRepr_ConfigurationDesign.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ConfigurationDesignItem: declare class StepRepr_ConfigurationDesignItem extends StepData_SelectType

  // StepRepr_ConfigurationDesignItem.constructor (constructor)
  constructor();

  // StepRepr_ConfigurationDesignItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepRepr_ConfigurationDesignItem.ProductDefinition (method)
  ProductDefinition(): StepBasic_ProductDefinition;

  // StepRepr_ConfigurationDesignItem.ProductDefinitionFormation (method)
  ProductDefinitionFormation(): StepBasic_ProductDefinitionFormation;

  // StepRepr_ConfigurationDesignItem.delete (method)
  delete(): void;

  // StepRepr_ConfigurationDesignItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ConfigurationEffectivity: declare class StepRepr_ConfigurationEffectivity extends StepBasic_ProductDefinitionEffectivity

  // StepRepr_ConfigurationEffectivity.constructor (constructor)
  constructor();

  // StepRepr_ConfigurationEffectivity.Init (method)
  Init(aEffectivity_Id: TCollection_HAsciiString, aProductDefinitionEffectivity_Usage: StepBasic_ProductDefinitionRelationship, aConfiguration: StepRepr_ConfigurationDesign): void;
  Init(aId: TCollection_HAsciiString, aUsage: StepBasic_ProductDefinitionRelationship): void;
  Init(aid: TCollection_HAsciiString): void;

  // StepRepr_ConfigurationEffectivity.Configuration (method)
  Configuration(): StepRepr_ConfigurationDesign;

  // StepRepr_ConfigurationEffectivity.SetConfiguration (method)
  SetConfiguration(Configuration: StepRepr_ConfigurationDesign): void;

  // StepRepr_ConfigurationEffectivity.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ConfigurationEffectivity.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ConfigurationEffectivity.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ConfigurationEffectivity.delete (method)
  delete(): void;

  // StepRepr_ConfigurationEffectivity.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ConfigurationItem: declare class StepRepr_ConfigurationItem extends Standard_Transient

  // StepRepr_ConfigurationItem.constructor (constructor)
  constructor();

  // StepRepr_ConfigurationItem.Init (method)
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aItemConcept: StepRepr_ProductConcept, hasPurpose: boolean, aPurpose: TCollection_HAsciiString): void;

  // StepRepr_ConfigurationItem.Id (method)
  Id(): TCollection_HAsciiString;

  // StepRepr_ConfigurationItem.SetId (method)
  SetId(Id: TCollection_HAsciiString): void;

  // StepRepr_ConfigurationItem.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_ConfigurationItem.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepRepr_ConfigurationItem.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_ConfigurationItem.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepRepr_ConfigurationItem.HasDescription (method)
  HasDescription(): boolean;

  // StepRepr_ConfigurationItem.ItemConcept (method)
  ItemConcept(): StepRepr_ProductConcept;

  // StepRepr_ConfigurationItem.SetItemConcept (method)
  SetItemConcept(ItemConcept: StepRepr_ProductConcept): void;

  // StepRepr_ConfigurationItem.Purpose (method)
  Purpose(): TCollection_HAsciiString;

  // StepRepr_ConfigurationItem.SetPurpose (method)
  SetPurpose(Purpose: TCollection_HAsciiString): void;

  // StepRepr_ConfigurationItem.HasPurpose (method)
  HasPurpose(): boolean;

  // StepRepr_ConfigurationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ConfigurationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ConfigurationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ConfigurationItem.delete (method)
  delete(): void;

  // StepRepr_ConfigurationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ConstructiveGeometryRepresentation: declare class StepRepr_ConstructiveGeometryRepresentation extends StepRepr_Representation

  // StepRepr_ConstructiveGeometryRepresentation.constructor (constructor)
  constructor();

  // StepRepr_ConstructiveGeometryRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ConstructiveGeometryRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ConstructiveGeometryRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ConstructiveGeometryRepresentation.delete (method)
  delete(): void;

  // StepRepr_ConstructiveGeometryRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ConstructiveGeometryRepresentationRelationship: declare class StepRepr_ConstructiveGeometryRepresentationRelationship extends StepRepr_RepresentationRelationship

  // StepRepr_ConstructiveGeometryRepresentationRelationship.constructor (constructor)
  constructor();

  // StepRepr_ConstructiveGeometryRepresentationRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ConstructiveGeometryRepresentationRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ConstructiveGeometryRepresentationRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ConstructiveGeometryRepresentationRelationship.delete (method)
  delete(): void;

  // StepRepr_ConstructiveGeometryRepresentationRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ContinuosShapeAspect: declare class StepRepr_ContinuosShapeAspect extends StepRepr_CompositeShapeAspect

  // StepRepr_ContinuosShapeAspect.constructor (constructor)
  constructor();

  // StepRepr_ContinuosShapeAspect.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ContinuosShapeAspect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ContinuosShapeAspect.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ContinuosShapeAspect.delete (method)
  delete(): void;

  // StepRepr_ContinuosShapeAspect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_DataEnvironment: declare class StepRepr_DataEnvironment extends Standard_Transient

  // StepRepr_DataEnvironment.constructor (constructor)
  constructor();

  // StepRepr_DataEnvironment.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aElements: NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation): void;

  // StepRepr_DataEnvironment.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_DataEnvironment.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepRepr_DataEnvironment.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_DataEnvironment.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepRepr_DataEnvironment.Elements (method)
  Elements(): NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation;

  // StepRepr_DataEnvironment.SetElements (method)
  SetElements(Elements: NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation): void;

  // StepRepr_DataEnvironment.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_DataEnvironment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_DataEnvironment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_DataEnvironment.delete (method)
  delete(): void;

  // StepRepr_DataEnvironment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_DefinitionalRepresentation: declare class StepRepr_DefinitionalRepresentation extends StepRepr_Representation

  // StepRepr_DefinitionalRepresentation.constructor (constructor)
  constructor();

  // StepRepr_DefinitionalRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_DefinitionalRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_DefinitionalRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_DefinitionalRepresentation.delete (method)
  delete(): void;

  // StepRepr_DefinitionalRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_DerivedShapeAspect: declare class StepRepr_DerivedShapeAspect extends StepRepr_ShapeAspect

  // StepRepr_DerivedShapeAspect.constructor (constructor)
  constructor();

  // StepRepr_DerivedShapeAspect.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_DerivedShapeAspect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_DerivedShapeAspect.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_DerivedShapeAspect.delete (method)
  delete(): void;

  // StepRepr_DerivedShapeAspect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_DescriptiveRepresentationItem: declare class StepRepr_DescriptiveRepresentationItem extends StepRepr_RepresentationItem

  // StepRepr_DescriptiveRepresentationItem.constructor (constructor)
  constructor();

  // StepRepr_DescriptiveRepresentationItem.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_DescriptiveRepresentationItem.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepRepr_DescriptiveRepresentationItem.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_DescriptiveRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_DescriptiveRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_DescriptiveRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_DescriptiveRepresentationItem.delete (method)
  delete(): void;

  // StepRepr_DescriptiveRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_Extension: declare class StepRepr_Extension extends StepRepr_DerivedShapeAspect

  // StepRepr_Extension.constructor (constructor)
  constructor();

  // StepRepr_Extension.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_Extension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_Extension.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_Extension.delete (method)
  delete(): void;

  // StepRepr_Extension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ExternallyDefinedRepresentation: declare class StepRepr_ExternallyDefinedRepresentation extends StepRepr_Representation

  // StepRepr_ExternallyDefinedRepresentation.constructor (constructor)
  constructor();

  // StepRepr_ExternallyDefinedRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ExternallyDefinedRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ExternallyDefinedRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ExternallyDefinedRepresentation.delete (method)
  delete(): void;

  // StepRepr_ExternallyDefinedRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_FeatureForDatumTargetRelationship: declare class StepRepr_FeatureForDatumTargetRelationship extends StepRepr_ShapeAspectRelationship

  // StepRepr_FeatureForDatumTargetRelationship.constructor (constructor)
  constructor();

  // StepRepr_FeatureForDatumTargetRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_FeatureForDatumTargetRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_FeatureForDatumTargetRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_FeatureForDatumTargetRelationship.delete (method)
  delete(): void;

  // StepRepr_FeatureForDatumTargetRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_FunctionallyDefinedTransformation: declare class StepRepr_FunctionallyDefinedTransformation extends Standard_Transient

  // StepRepr_FunctionallyDefinedTransformation.constructor (constructor)
  constructor();

  // StepRepr_FunctionallyDefinedTransformation.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;

  // StepRepr_FunctionallyDefinedTransformation.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepRepr_FunctionallyDefinedTransformation.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_FunctionallyDefinedTransformation.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepRepr_FunctionallyDefinedTransformation.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_FunctionallyDefinedTransformation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_FunctionallyDefinedTransformation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_FunctionallyDefinedTransformation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_FunctionallyDefinedTransformation.delete (method)
  delete(): void;

  // StepRepr_FunctionallyDefinedTransformation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_GeometricAlignment: declare class StepRepr_GeometricAlignment extends StepRepr_DerivedShapeAspect

  // StepRepr_GeometricAlignment.constructor (constructor)
  constructor();

  // StepRepr_GeometricAlignment.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_GeometricAlignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_GeometricAlignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_GeometricAlignment.delete (method)
  delete(): void;

  // StepRepr_GeometricAlignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_GlobalUncertaintyAssignedContext: declare class StepRepr_GlobalUncertaintyAssignedContext extends StepRepr_RepresentationContext

  // StepRepr_GlobalUncertaintyAssignedContext.constructor (constructor)
  constructor();

  // StepRepr_GlobalUncertaintyAssignedContext.Init (method)
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  // StepRepr_GlobalUncertaintyAssignedContext.SetUncertainty (method)
  SetUncertainty(aUncertainty: NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit): void;

  // StepRepr_GlobalUncertaintyAssignedContext.Uncertainty (method)
  Uncertainty(): NCollection_HArray1_handle_StepBasic_UncertaintyMeasureWithUnit;

  // StepRepr_GlobalUncertaintyAssignedContext.UncertaintyValue (method)
  UncertaintyValue(num: number): StepBasic_UncertaintyMeasureWithUnit;

  // StepRepr_GlobalUncertaintyAssignedContext.NbUncertainty (method)
  NbUncertainty(): number;

  // StepRepr_GlobalUncertaintyAssignedContext.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_GlobalUncertaintyAssignedContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_GlobalUncertaintyAssignedContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_GlobalUncertaintyAssignedContext.delete (method)
  delete(): void;

  // StepRepr_GlobalUncertaintyAssignedContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_GlobalUnitAssignedContext: declare class StepRepr_GlobalUnitAssignedContext extends StepRepr_RepresentationContext

  // StepRepr_GlobalUnitAssignedContext.constructor (constructor)
  constructor();

  // StepRepr_GlobalUnitAssignedContext.Init (method)
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString, aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  // StepRepr_GlobalUnitAssignedContext.SetUnits (method)
  SetUnits(aUnits: NCollection_HArray1_handle_StepBasic_NamedUnit): void;

  // StepRepr_GlobalUnitAssignedContext.Units (method)
  Units(): NCollection_HArray1_handle_StepBasic_NamedUnit;

  // StepRepr_GlobalUnitAssignedContext.UnitsValue (method)
  UnitsValue(num: number): StepBasic_NamedUnit;

  // StepRepr_GlobalUnitAssignedContext.NbUnits (method)
  NbUnits(): number;

  // StepRepr_GlobalUnitAssignedContext.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_GlobalUnitAssignedContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_GlobalUnitAssignedContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_GlobalUnitAssignedContext.delete (method)
  delete(): void;

  // StepRepr_GlobalUnitAssignedContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_IntegerRepresentationItem: declare class StepRepr_IntegerRepresentationItem extends StepRepr_RepresentationItem

  // StepRepr_IntegerRepresentationItem.constructor (constructor)
  constructor();

  // StepRepr_IntegerRepresentationItem.Init (method)
  Init(theName: TCollection_HAsciiString, theValue: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_IntegerRepresentationItem.SetValue (method)
  SetValue(theValue: number): void;

  // StepRepr_IntegerRepresentationItem.Value (method)
  Value(): number;

  // StepRepr_IntegerRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_IntegerRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_IntegerRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_IntegerRepresentationItem.delete (method)
  delete(): void;

  // StepRepr_IntegerRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ItemDefinedTransformation: declare class StepRepr_ItemDefinedTransformation extends Standard_Transient

  // StepRepr_ItemDefinedTransformation.constructor (constructor)
  constructor();

  // StepRepr_ItemDefinedTransformation.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aTransformItem1: StepRepr_RepresentationItem, aTransformItem2: StepRepr_RepresentationItem): void;

  // StepRepr_ItemDefinedTransformation.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepRepr_ItemDefinedTransformation.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_ItemDefinedTransformation.HasDescription (method)
  HasDescription(): boolean;

  // StepRepr_ItemDefinedTransformation.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepRepr_ItemDefinedTransformation.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_ItemDefinedTransformation.SetTransformItem1 (method)
  SetTransformItem1(aItem: StepRepr_RepresentationItem): void;

  // StepRepr_ItemDefinedTransformation.TransformItem1 (method)
  TransformItem1(): StepRepr_RepresentationItem;

  // StepRepr_ItemDefinedTransformation.SetTransformItem2 (method)
  SetTransformItem2(aItem: StepRepr_RepresentationItem): void;

  // StepRepr_ItemDefinedTransformation.TransformItem2 (method)
  TransformItem2(): StepRepr_RepresentationItem;

  // StepRepr_ItemDefinedTransformation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ItemDefinedTransformation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ItemDefinedTransformation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ItemDefinedTransformation.delete (method)
  delete(): void;

  // StepRepr_ItemDefinedTransformation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_MakeFromUsageOption: declare class StepRepr_MakeFromUsageOption extends StepRepr_ProductDefinitionUsage

  // StepRepr_MakeFromUsageOption.constructor (constructor)
  constructor();

  // StepRepr_MakeFromUsageOption.Init (method)
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, aRanking: number, aRankingRationale: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  // StepRepr_MakeFromUsageOption.Ranking (method)
  Ranking(): number;

  // StepRepr_MakeFromUsageOption.SetRanking (method)
  SetRanking(Ranking: number): void;

  // StepRepr_MakeFromUsageOption.RankingRationale (method)
  RankingRationale(): TCollection_HAsciiString;

  // StepRepr_MakeFromUsageOption.SetRankingRationale (method)
  SetRankingRationale(RankingRationale: TCollection_HAsciiString): void;

  // StepRepr_MakeFromUsageOption.Quantity (method)
  Quantity(): Standard_Transient;

  // StepRepr_MakeFromUsageOption.SetQuantity (method)
  SetQuantity(Quantity: Standard_Transient): void;

  // StepRepr_MakeFromUsageOption.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_MakeFromUsageOption.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_MakeFromUsageOption.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_MakeFromUsageOption.delete (method)
  delete(): void;

  // StepRepr_MakeFromUsageOption.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_MappedItem: declare class StepRepr_MappedItem extends StepRepr_RepresentationItem

  // StepRepr_MappedItem.constructor (constructor)
  constructor();

  // StepRepr_MappedItem.Init (method)
  Init(aName: TCollection_HAsciiString, aMappingSource: StepRepr_RepresentationMap, aMappingTarget: StepRepr_RepresentationItem): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_MappedItem.SetMappingSource (method)
  SetMappingSource(aMappingSource: StepRepr_RepresentationMap): void;

  // StepRepr_MappedItem.MappingSource (method)
  MappingSource(): StepRepr_RepresentationMap;

  // StepRepr_MappedItem.SetMappingTarget (method)
  SetMappingTarget(aMappingTarget: StepRepr_RepresentationItem): void;

  // StepRepr_MappedItem.MappingTarget (method)
  MappingTarget(): StepRepr_RepresentationItem;

  // StepRepr_MappedItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_MappedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_MappedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_MappedItem.delete (method)
  delete(): void;

  // StepRepr_MappedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_MaterialDesignation: declare class StepRepr_MaterialDesignation extends Standard_Transient

  // StepRepr_MaterialDesignation.constructor (constructor)
  constructor();

  // StepRepr_MaterialDesignation.Init (method)
  Init(aName: TCollection_HAsciiString, aOfDefinition: StepRepr_CharacterizedDefinition): void;

  // StepRepr_MaterialDesignation.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepRepr_MaterialDesignation.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_MaterialDesignation.SetOfDefinition (method)
  SetOfDefinition(aOfDefinition: StepRepr_CharacterizedDefinition): void;

  // StepRepr_MaterialDesignation.OfDefinition (method)
  OfDefinition(): StepRepr_CharacterizedDefinition;

  // StepRepr_MaterialDesignation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_MaterialDesignation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_MaterialDesignation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_MaterialDesignation.delete (method)
  delete(): void;

  // StepRepr_MaterialDesignation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_MaterialProperty: declare class StepRepr_MaterialProperty extends StepRepr_PropertyDefinition

  // StepRepr_MaterialProperty.constructor (constructor)
  constructor();

  // StepRepr_MaterialProperty.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_MaterialProperty.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_MaterialProperty.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_MaterialProperty.delete (method)
  delete(): void;

  // StepRepr_MaterialProperty.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_MaterialPropertyRepresentation: declare class StepRepr_MaterialPropertyRepresentation extends StepRepr_PropertyDefinitionRepresentation

  // StepRepr_MaterialPropertyRepresentation.constructor (constructor)
  constructor();

  // StepRepr_MaterialPropertyRepresentation.Init (method)
  Init(aPropertyDefinitionRepresentation_Definition: StepRepr_RepresentedDefinition, aPropertyDefinitionRepresentation_UsedRepresentation: StepRepr_Representation, aDependentEnvironment: StepRepr_DataEnvironment): void;
  Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;

  // StepRepr_MaterialPropertyRepresentation.DependentEnvironment (method)
  DependentEnvironment(): StepRepr_DataEnvironment;

  // StepRepr_MaterialPropertyRepresentation.SetDependentEnvironment (method)
  SetDependentEnvironment(DependentEnvironment: StepRepr_DataEnvironment): void;

  // StepRepr_MaterialPropertyRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_MaterialPropertyRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_MaterialPropertyRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_MaterialPropertyRepresentation.delete (method)
  delete(): void;

  // StepRepr_MaterialPropertyRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_MeasureRepresentationItem: declare class StepRepr_MeasureRepresentationItem extends StepRepr_RepresentationItem

  // StepRepr_MeasureRepresentationItem.constructor (constructor)
  constructor();

  // StepRepr_MeasureRepresentationItem.Init (method)
  Init(aName: TCollection_HAsciiString, aValueComponent: StepBasic_MeasureValueMember, aUnitComponent: StepBasic_Unit): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_MeasureRepresentationItem.SetMeasure (method)
  SetMeasure(Measure: StepBasic_MeasureWithUnit): void;

  // StepRepr_MeasureRepresentationItem.Measure (method)
  Measure(): StepBasic_MeasureWithUnit;

  // StepRepr_MeasureRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_MeasureRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_MeasureRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_MeasureRepresentationItem.delete (method)
  delete(): void;

  // StepRepr_MeasureRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_MechanicalDesignAndDraughtingRelationship: declare class StepRepr_MechanicalDesignAndDraughtingRelationship extends StepRepr_RepresentationRelationship

  // StepRepr_MechanicalDesignAndDraughtingRelationship.constructor (constructor)
  constructor();

  // StepRepr_MechanicalDesignAndDraughtingRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_MechanicalDesignAndDraughtingRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_MechanicalDesignAndDraughtingRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_MechanicalDesignAndDraughtingRelationship.delete (method)
  delete(): void;

  // StepRepr_MechanicalDesignAndDraughtingRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_NextAssemblyUsageOccurrence: declare class StepRepr_NextAssemblyUsageOccurrence extends StepRepr_AssemblyComponentUsage

  // StepRepr_NextAssemblyUsageOccurrence.constructor (constructor)
  constructor();

  // StepRepr_NextAssemblyUsageOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_NextAssemblyUsageOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_NextAssemblyUsageOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_NextAssemblyUsageOccurrence.delete (method)
  delete(): void;

  // StepRepr_NextAssemblyUsageOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
