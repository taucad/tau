# libcascade — StepRepr (2)

35 top-level symbols. Signatures are verbatim typescript.

StepRepr_ParallelOffset: declare class StepRepr_ParallelOffset extends StepRepr_DerivedShapeAspect

  // StepRepr_ParallelOffset.constructor (constructor)
  constructor();

  // StepRepr_ParallelOffset.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theOffset: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  // StepRepr_ParallelOffset.Offset (method)
  Offset(): Standard_Transient;

  // StepRepr_ParallelOffset.SetOffset (method)
  SetOffset(theOffset: Standard_Transient): void;

  // StepRepr_ParallelOffset.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ParallelOffset.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ParallelOffset.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ParallelOffset.delete (method)
  delete(): void;

  // StepRepr_ParallelOffset.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ParametricRepresentationContext: declare class StepRepr_ParametricRepresentationContext extends StepRepr_RepresentationContext

  // StepRepr_ParametricRepresentationContext.constructor (constructor)
  constructor();

  // StepRepr_ParametricRepresentationContext.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ParametricRepresentationContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ParametricRepresentationContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ParametricRepresentationContext.delete (method)
  delete(): void;

  // StepRepr_ParametricRepresentationContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_PerpendicularTo: declare class StepRepr_PerpendicularTo extends StepRepr_DerivedShapeAspect

  // StepRepr_PerpendicularTo.constructor (constructor)
  constructor();

  // StepRepr_PerpendicularTo.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_PerpendicularTo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_PerpendicularTo.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_PerpendicularTo.delete (method)
  delete(): void;

  // StepRepr_PerpendicularTo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ProductConcept: declare class StepRepr_ProductConcept extends Standard_Transient

  // StepRepr_ProductConcept.constructor (constructor)
  constructor();

  // StepRepr_ProductConcept.Init (method)
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aMarketContext: StepBasic_ProductConceptContext): void;

  // StepRepr_ProductConcept.Id (method)
  Id(): TCollection_HAsciiString;

  // StepRepr_ProductConcept.SetId (method)
  SetId(Id: TCollection_HAsciiString): void;

  // StepRepr_ProductConcept.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_ProductConcept.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepRepr_ProductConcept.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_ProductConcept.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepRepr_ProductConcept.HasDescription (method)
  HasDescription(): boolean;

  // StepRepr_ProductConcept.MarketContext (method)
  MarketContext(): StepBasic_ProductConceptContext;

  // StepRepr_ProductConcept.SetMarketContext (method)
  SetMarketContext(MarketContext: StepBasic_ProductConceptContext): void;

  // StepRepr_ProductConcept.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ProductConcept.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ProductConcept.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ProductConcept.delete (method)
  delete(): void;

  // StepRepr_ProductConcept.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ProductDefinitionShape: declare class StepRepr_ProductDefinitionShape extends StepRepr_PropertyDefinition

  // StepRepr_ProductDefinitionShape.constructor (constructor)
  constructor();

  // StepRepr_ProductDefinitionShape.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ProductDefinitionShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ProductDefinitionShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ProductDefinitionShape.delete (method)
  delete(): void;

  // StepRepr_ProductDefinitionShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ProductDefinitionUsage: declare class StepRepr_ProductDefinitionUsage extends StepBasic_ProductDefinitionRelationship

  // StepRepr_ProductDefinitionUsage.constructor (constructor)
  constructor();

  // StepRepr_ProductDefinitionUsage.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ProductDefinitionUsage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ProductDefinitionUsage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ProductDefinitionUsage.delete (method)
  delete(): void;

  // StepRepr_ProductDefinitionUsage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_PromissoryUsageOccurrence: declare class StepRepr_PromissoryUsageOccurrence extends StepRepr_AssemblyComponentUsage

  // StepRepr_PromissoryUsageOccurrence.constructor (constructor)
  constructor();

  // StepRepr_PromissoryUsageOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_PromissoryUsageOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_PromissoryUsageOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_PromissoryUsageOccurrence.delete (method)
  delete(): void;

  // StepRepr_PromissoryUsageOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_PropertyDefinition: declare class StepRepr_PropertyDefinition extends Standard_Transient

  // StepRepr_PropertyDefinition.constructor (constructor)
  constructor();

  // StepRepr_PropertyDefinition.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aDefinition: StepRepr_CharacterizedDefinition): void;

  // StepRepr_PropertyDefinition.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_PropertyDefinition.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepRepr_PropertyDefinition.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_PropertyDefinition.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepRepr_PropertyDefinition.HasDescription (method)
  HasDescription(): boolean;

  // StepRepr_PropertyDefinition.Definition (method)
  Definition(): StepRepr_CharacterizedDefinition;

  // StepRepr_PropertyDefinition.SetDefinition (method)
  SetDefinition(Definition: StepRepr_CharacterizedDefinition): void;

  // StepRepr_PropertyDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_PropertyDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_PropertyDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_PropertyDefinition.delete (method)
  delete(): void;

  // StepRepr_PropertyDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_PropertyDefinitionRelationship: declare class StepRepr_PropertyDefinitionRelationship extends Standard_Transient

  // StepRepr_PropertyDefinitionRelationship.constructor (constructor)
  constructor();

  // StepRepr_PropertyDefinitionRelationship.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRelatingPropertyDefinition: StepRepr_PropertyDefinition, aRelatedPropertyDefinition: StepRepr_PropertyDefinition): void;

  // StepRepr_PropertyDefinitionRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_PropertyDefinitionRelationship.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepRepr_PropertyDefinitionRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_PropertyDefinitionRelationship.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepRepr_PropertyDefinitionRelationship.RelatingPropertyDefinition (method)
  RelatingPropertyDefinition(): StepRepr_PropertyDefinition;

  // StepRepr_PropertyDefinitionRelationship.SetRelatingPropertyDefinition (method)
  SetRelatingPropertyDefinition(RelatingPropertyDefinition: StepRepr_PropertyDefinition): void;

  // StepRepr_PropertyDefinitionRelationship.RelatedPropertyDefinition (method)
  RelatedPropertyDefinition(): StepRepr_PropertyDefinition;

  // StepRepr_PropertyDefinitionRelationship.SetRelatedPropertyDefinition (method)
  SetRelatedPropertyDefinition(RelatedPropertyDefinition: StepRepr_PropertyDefinition): void;

  // StepRepr_PropertyDefinitionRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_PropertyDefinitionRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_PropertyDefinitionRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_PropertyDefinitionRelationship.delete (method)
  delete(): void;

  // StepRepr_PropertyDefinitionRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_PropertyDefinitionRepresentation: declare class StepRepr_PropertyDefinitionRepresentation extends Standard_Transient

  // StepRepr_PropertyDefinitionRepresentation.constructor (constructor)
  constructor();

  // StepRepr_PropertyDefinitionRepresentation.Init (method)
  Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;

  // StepRepr_PropertyDefinitionRepresentation.Definition (method)
  Definition(): StepRepr_RepresentedDefinition;

  // StepRepr_PropertyDefinitionRepresentation.SetDefinition (method)
  SetDefinition(Definition: StepRepr_RepresentedDefinition): void;

  // StepRepr_PropertyDefinitionRepresentation.UsedRepresentation (method)
  UsedRepresentation(): StepRepr_Representation;

  // StepRepr_PropertyDefinitionRepresentation.SetUsedRepresentation (method)
  SetUsedRepresentation(UsedRepresentation: StepRepr_Representation): void;

  // StepRepr_PropertyDefinitionRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_PropertyDefinitionRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_PropertyDefinitionRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_PropertyDefinitionRepresentation.delete (method)
  delete(): void;

  // StepRepr_PropertyDefinitionRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_QuantifiedAssemblyComponentUsage: declare class StepRepr_QuantifiedAssemblyComponentUsage extends StepRepr_AssemblyComponentUsage

  // StepRepr_QuantifiedAssemblyComponentUsage.constructor (constructor)
  constructor();

  // StepRepr_QuantifiedAssemblyComponentUsage.Init (method)
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aQuantity: Standard_Transient): void;
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  // StepRepr_QuantifiedAssemblyComponentUsage.Quantity (method)
  Quantity(): Standard_Transient;

  // StepRepr_QuantifiedAssemblyComponentUsage.SetQuantity (method)
  SetQuantity(Quantity: Standard_Transient): void;

  // StepRepr_QuantifiedAssemblyComponentUsage.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_QuantifiedAssemblyComponentUsage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_QuantifiedAssemblyComponentUsage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_QuantifiedAssemblyComponentUsage.delete (method)
  delete(): void;

  // StepRepr_QuantifiedAssemblyComponentUsage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RealRepresentationItem: declare class StepRepr_RealRepresentationItem extends StepRepr_RepresentationItem

  // StepRepr_RealRepresentationItem.constructor (constructor)
  constructor();

  // StepRepr_RealRepresentationItem.Init (method)
  Init(theName: TCollection_HAsciiString, theValue: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_RealRepresentationItem.SetValue (method)
  SetValue(theValue: number): void;

  // StepRepr_RealRepresentationItem.Value (method)
  Value(): number;

  // StepRepr_RealRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_RealRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_RealRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_RealRepresentationItem.delete (method)
  delete(): void;

  // StepRepr_RealRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ReprItemAndLengthMeasureWithUnit: declare class StepRepr_ReprItemAndLengthMeasureWithUnit extends StepRepr_ReprItemAndMeasureWithUnit

  // StepRepr_ReprItemAndLengthMeasureWithUnit.constructor (constructor)
  constructor();

  // StepRepr_ReprItemAndLengthMeasureWithUnit.SetLengthMeasureWithUnit (method)
  SetLengthMeasureWithUnit(aLMWU: StepBasic_LengthMeasureWithUnit): void;

  // StepRepr_ReprItemAndLengthMeasureWithUnit.GetLengthMeasureWithUnit (method)
  GetLengthMeasureWithUnit(): StepBasic_LengthMeasureWithUnit;

  // StepRepr_ReprItemAndLengthMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ReprItemAndLengthMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ReprItemAndLengthMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ReprItemAndLengthMeasureWithUnit.delete (method)
  delete(): void;

  // StepRepr_ReprItemAndLengthMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI: declare class StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI extends StepRepr_ReprItemAndMeasureWithUnitAndQRI

  // StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI.constructor (constructor)
  constructor();

  // StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI.SetLengthMeasureWithUnit (method)
  SetLengthMeasureWithUnit(aLMWU: StepBasic_LengthMeasureWithUnit): void;

  // StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI.GetLengthMeasureWithUnit (method)
  GetLengthMeasureWithUnit(): StepBasic_LengthMeasureWithUnit;

  // StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI.delete (method)
  delete(): void;

  // StepRepr_ReprItemAndLengthMeasureWithUnitAndQRI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ReprItemAndMeasureWithUnit: declare class StepRepr_ReprItemAndMeasureWithUnit extends StepRepr_RepresentationItem

  // StepRepr_ReprItemAndMeasureWithUnit.constructor (constructor)
  constructor();

  // StepRepr_ReprItemAndMeasureWithUnit.Init (method)
  Init(aMWU: StepBasic_MeasureWithUnit, aRI: StepRepr_RepresentationItem): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_ReprItemAndMeasureWithUnit.GetMeasureRepresentationItem (method)
  GetMeasureRepresentationItem(): StepRepr_MeasureRepresentationItem;

  // StepRepr_ReprItemAndMeasureWithUnit.SetMeasureWithUnit (method)
  SetMeasureWithUnit(aMWU: StepBasic_MeasureWithUnit): void;

  // StepRepr_ReprItemAndMeasureWithUnit.GetMeasureWithUnit (method)
  GetMeasureWithUnit(): StepBasic_MeasureWithUnit;

  // StepRepr_ReprItemAndMeasureWithUnit.GetRepresentationItem (method)
  GetRepresentationItem(): StepRepr_RepresentationItem;

  // StepRepr_ReprItemAndMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ReprItemAndMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ReprItemAndMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ReprItemAndMeasureWithUnit.delete (method)
  delete(): void;

  // StepRepr_ReprItemAndMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ReprItemAndMeasureWithUnitAndQRI: declare class StepRepr_ReprItemAndMeasureWithUnitAndQRI extends StepRepr_ReprItemAndMeasureWithUnit

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.constructor (constructor)
  constructor();

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.Init (method)
  Init(aMWU: StepBasic_MeasureWithUnit, aRI: StepRepr_RepresentationItem, aQRI: StepShape_QualifiedRepresentationItem): void;
  Init(aMWU: StepBasic_MeasureWithUnit, aRI: StepRepr_RepresentationItem): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.SetQualifiedRepresentationItem (method)
  SetQualifiedRepresentationItem(aQRI: StepShape_QualifiedRepresentationItem): void;

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.GetQualifiedRepresentationItem (method)
  GetQualifiedRepresentationItem(): StepShape_QualifiedRepresentationItem;

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.delete (method)
  delete(): void;

  // StepRepr_ReprItemAndMeasureWithUnitAndQRI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ReprItemAndPlaneAngleMeasureWithUnit: declare class StepRepr_ReprItemAndPlaneAngleMeasureWithUnit extends StepRepr_ReprItemAndMeasureWithUnit

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnit.constructor (constructor)
  constructor();

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnit.SetPlaneAngleMeasureWithUnit (method)
  SetPlaneAngleMeasureWithUnit(aLMWU: StepBasic_PlaneAngleMeasureWithUnit): void;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnit.GetPlaneAngleMeasureWithUnit (method)
  GetPlaneAngleMeasureWithUnit(): StepBasic_PlaneAngleMeasureWithUnit;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnit.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnit.delete (method)
  delete(): void;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI: declare class StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI extends StepRepr_ReprItemAndMeasureWithUnitAndQRI

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI.constructor (constructor)
  constructor();

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI.SetPlaneAngleMeasureWithUnit (method)
  SetPlaneAngleMeasureWithUnit(aLMWU: StepBasic_PlaneAngleMeasureWithUnit): void;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI.GetPlaneAngleMeasureWithUnit (method)
  GetPlaneAngleMeasureWithUnit(): StepBasic_PlaneAngleMeasureWithUnit;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI.delete (method)
  delete(): void;

  // StepRepr_ReprItemAndPlaneAngleMeasureWithUnitAndQRI.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_Representation: declare class StepRepr_Representation extends Standard_Transient

  // StepRepr_Representation.constructor (constructor)
  constructor();

  // StepRepr_Representation.Init (method)
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepRepr_Representation.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepRepr_Representation.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_Representation.SetItems (method)
  SetItems(aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem): void;

  // StepRepr_Representation.Items (method)
  Items(): NCollection_HArray1_handle_StepRepr_RepresentationItem;

  // StepRepr_Representation.ItemsValue (method)
  ItemsValue(num: number): StepRepr_RepresentationItem;

  // StepRepr_Representation.NbItems (method)
  NbItems(): number;

  // StepRepr_Representation.SetContextOfItems (method)
  SetContextOfItems(aContextOfItems: StepRepr_RepresentationContext): void;

  // StepRepr_Representation.ContextOfItems (method)
  ContextOfItems(): StepRepr_RepresentationContext;

  // StepRepr_Representation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_Representation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_Representation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_Representation.delete (method)
  delete(): void;

  // StepRepr_Representation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentationContext: declare class StepRepr_RepresentationContext extends Standard_Transient

  // StepRepr_RepresentationContext.constructor (constructor)
  constructor();

  // StepRepr_RepresentationContext.Init (method)
  Init(aContextIdentifier: TCollection_HAsciiString, aContextType: TCollection_HAsciiString): void;

  // StepRepr_RepresentationContext.SetContextIdentifier (method)
  SetContextIdentifier(aContextIdentifier: TCollection_HAsciiString): void;

  // StepRepr_RepresentationContext.ContextIdentifier (method)
  ContextIdentifier(): TCollection_HAsciiString;

  // StepRepr_RepresentationContext.SetContextType (method)
  SetContextType(aContextType: TCollection_HAsciiString): void;

  // StepRepr_RepresentationContext.ContextType (method)
  ContextType(): TCollection_HAsciiString;

  // StepRepr_RepresentationContext.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_RepresentationContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_RepresentationContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_RepresentationContext.delete (method)
  delete(): void;

  // StepRepr_RepresentationContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentationContextReference: declare class StepRepr_RepresentationContextReference extends Standard_Transient

  // StepRepr_RepresentationContextReference.constructor (constructor)
  constructor();

  // StepRepr_RepresentationContextReference.Init (method)
  Init(theContextIdentifier: TCollection_HAsciiString): void;

  // StepRepr_RepresentationContextReference.ContextIdentifier (method)
  ContextIdentifier(): TCollection_HAsciiString;

  // StepRepr_RepresentationContextReference.SetContextIdentifier (method)
  SetContextIdentifier(theContextIdentifier: TCollection_HAsciiString): void;

  // StepRepr_RepresentationContextReference.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_RepresentationContextReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_RepresentationContextReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_RepresentationContextReference.delete (method)
  delete(): void;

  // StepRepr_RepresentationContextReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentationItem: declare class StepRepr_RepresentationItem extends Standard_Transient

  // StepRepr_RepresentationItem.constructor (constructor)
  constructor();

  // StepRepr_RepresentationItem.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_RepresentationItem.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepRepr_RepresentationItem.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_RepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_RepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_RepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_RepresentationItem.delete (method)
  delete(): void;

  // StepRepr_RepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentationMap: declare class StepRepr_RepresentationMap extends Standard_Transient

  // StepRepr_RepresentationMap.constructor (constructor)
  constructor();

  // StepRepr_RepresentationMap.Init (method)
  Init(aMappingOrigin: StepRepr_RepresentationItem, aMappedRepresentation: StepRepr_Representation): void;

  // StepRepr_RepresentationMap.SetMappingOrigin (method)
  SetMappingOrigin(aMappingOrigin: StepRepr_RepresentationItem): void;

  // StepRepr_RepresentationMap.MappingOrigin (method)
  MappingOrigin(): StepRepr_RepresentationItem;

  // StepRepr_RepresentationMap.SetMappedRepresentation (method)
  SetMappedRepresentation(aMappedRepresentation: StepRepr_Representation): void;

  // StepRepr_RepresentationMap.MappedRepresentation (method)
  MappedRepresentation(): StepRepr_Representation;

  // StepRepr_RepresentationMap.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_RepresentationMap.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_RepresentationMap.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_RepresentationMap.delete (method)
  delete(): void;

  // StepRepr_RepresentationMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentationOrRepresentationReference: declare class StepRepr_RepresentationOrRepresentationReference extends StepData_SelectType

  // StepRepr_RepresentationOrRepresentationReference.constructor (constructor)
  constructor();

  // StepRepr_RepresentationOrRepresentationReference.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepRepr_RepresentationOrRepresentationReference.Representation (method)
  Representation(): StepRepr_Representation;

  // StepRepr_RepresentationOrRepresentationReference.RepresentationReference (method)
  RepresentationReference(): StepRepr_RepresentationReference;

  // StepRepr_RepresentationOrRepresentationReference.delete (method)
  delete(): void;

  // StepRepr_RepresentationOrRepresentationReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentationReference: declare class StepRepr_RepresentationReference extends Standard_Transient

  // StepRepr_RepresentationReference.constructor (constructor)
  constructor();

  // StepRepr_RepresentationReference.Init (method)
  Init(theId: TCollection_HAsciiString, theContextOfItems: StepRepr_RepresentationContextReference): void;

  // StepRepr_RepresentationReference.Id (method)
  Id(): TCollection_HAsciiString;

  // StepRepr_RepresentationReference.SetId (method)
  SetId(theId: TCollection_HAsciiString): void;

  // StepRepr_RepresentationReference.ContextOfItems (method)
  ContextOfItems(): StepRepr_RepresentationContextReference;

  // StepRepr_RepresentationReference.SetContextOfItems (method)
  SetContextOfItems(theContextOfItems: StepRepr_RepresentationContextReference): void;

  // StepRepr_RepresentationReference.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_RepresentationReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_RepresentationReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_RepresentationReference.delete (method)
  delete(): void;

  // StepRepr_RepresentationReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentationRelationship: declare class StepRepr_RepresentationRelationship extends Standard_Transient

  // StepRepr_RepresentationRelationship.constructor (constructor)
  constructor();

  // StepRepr_RepresentationRelationship.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRep1: StepRepr_Representation, aRep2: StepRepr_Representation): void;

  // StepRepr_RepresentationRelationship.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepRepr_RepresentationRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_RepresentationRelationship.HasDescription (method)
  HasDescription(): boolean;

  // StepRepr_RepresentationRelationship.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepRepr_RepresentationRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_RepresentationRelationship.SetRep1 (method)
  SetRep1(aRep1: StepRepr_Representation): void;

  // StepRepr_RepresentationRelationship.Rep1 (method)
  Rep1(): StepRepr_Representation;

  // StepRepr_RepresentationRelationship.SetRep2 (method)
  SetRep2(aRep2: StepRepr_Representation): void;

  // StepRepr_RepresentationRelationship.Rep2 (method)
  Rep2(): StepRepr_Representation;

  // StepRepr_RepresentationRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_RepresentationRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_RepresentationRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_RepresentationRelationship.delete (method)
  delete(): void;

  // StepRepr_RepresentationRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentationRelationshipWithTransformation: declare class StepRepr_RepresentationRelationshipWithTransformation extends StepRepr_ShapeRepresentationRelationship

  // StepRepr_RepresentationRelationshipWithTransformation.constructor (constructor)
  constructor();

  // StepRepr_RepresentationRelationshipWithTransformation.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRep1: StepRepr_Representation, aRep2: StepRepr_Representation, aTransf: StepRepr_Transformation): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aRep1: StepRepr_Representation, aRep2: StepRepr_Representation): void;

  // StepRepr_RepresentationRelationshipWithTransformation.TransformationOperator (method)
  TransformationOperator(): StepRepr_Transformation;

  // StepRepr_RepresentationRelationshipWithTransformation.SetTransformationOperator (method)
  SetTransformationOperator(aTrans: StepRepr_Transformation): void;

  // StepRepr_RepresentationRelationshipWithTransformation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_RepresentationRelationshipWithTransformation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_RepresentationRelationshipWithTransformation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_RepresentationRelationshipWithTransformation.delete (method)
  delete(): void;

  // StepRepr_RepresentationRelationshipWithTransformation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_RepresentedDefinition: declare class StepRepr_RepresentedDefinition extends StepData_SelectType

  // StepRepr_RepresentedDefinition.constructor (constructor)
  constructor();

  // StepRepr_RepresentedDefinition.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepRepr_RepresentedDefinition.GeneralProperty (method)
  GeneralProperty(): StepBasic_GeneralProperty;

  // StepRepr_RepresentedDefinition.PropertyDefinition (method)
  PropertyDefinition(): StepRepr_PropertyDefinition;

  // StepRepr_RepresentedDefinition.PropertyDefinitionRelationship (method)
  PropertyDefinitionRelationship(): StepRepr_PropertyDefinitionRelationship;

  // StepRepr_RepresentedDefinition.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepRepr_RepresentedDefinition.ShapeAspectRelationship (method)
  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  // StepRepr_RepresentedDefinition.delete (method)
  delete(): void;

  // StepRepr_RepresentedDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ShapeAspect: declare class StepRepr_ShapeAspect extends Standard_Transient

  // StepRepr_ShapeAspect.constructor (constructor)
  constructor();

  // StepRepr_ShapeAspect.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  // StepRepr_ShapeAspect.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepRepr_ShapeAspect.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_ShapeAspect.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepRepr_ShapeAspect.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_ShapeAspect.SetOfShape (method)
  SetOfShape(aOfShape: StepRepr_ProductDefinitionShape): void;

  // StepRepr_ShapeAspect.OfShape (method)
  OfShape(): StepRepr_ProductDefinitionShape;

  // StepRepr_ShapeAspect.SetProductDefinitional (method)
  SetProductDefinitional(aProductDefinitional: StepData_Logical): void;

  // StepRepr_ShapeAspect.ProductDefinitional (method)
  ProductDefinitional(): StepData_Logical;

  // StepRepr_ShapeAspect.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ShapeAspect.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ShapeAspect.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ShapeAspect.delete (method)
  delete(): void;

  // StepRepr_ShapeAspect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ShapeAspectDerivingRelationship: declare class StepRepr_ShapeAspectDerivingRelationship extends StepRepr_ShapeAspectRelationship

  // StepRepr_ShapeAspectDerivingRelationship.constructor (constructor)
  constructor();

  // StepRepr_ShapeAspectDerivingRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ShapeAspectDerivingRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ShapeAspectDerivingRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ShapeAspectDerivingRelationship.delete (method)
  delete(): void;

  // StepRepr_ShapeAspectDerivingRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ShapeAspectRelationship: declare class StepRepr_ShapeAspectRelationship extends Standard_Transient

  // StepRepr_ShapeAspectRelationship.constructor (constructor)
  constructor();

  // StepRepr_ShapeAspectRelationship.Init (method)
  Init(aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingShapeAspect: StepRepr_ShapeAspect, aRelatedShapeAspect: StepRepr_ShapeAspect): void;

  // StepRepr_ShapeAspectRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepRepr_ShapeAspectRelationship.SetName (method)
  SetName(Name: TCollection_HAsciiString): void;

  // StepRepr_ShapeAspectRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepRepr_ShapeAspectRelationship.SetDescription (method)
  SetDescription(Description: TCollection_HAsciiString): void;

  // StepRepr_ShapeAspectRelationship.HasDescription (method)
  HasDescription(): boolean;

  // StepRepr_ShapeAspectRelationship.RelatingShapeAspect (method)
  RelatingShapeAspect(): StepRepr_ShapeAspect;

  // StepRepr_ShapeAspectRelationship.SetRelatingShapeAspect (method)
  SetRelatingShapeAspect(RelatingShapeAspect: StepRepr_ShapeAspect): void;

  // StepRepr_ShapeAspectRelationship.RelatedShapeAspect (method)
  RelatedShapeAspect(): StepRepr_ShapeAspect;

  // StepRepr_ShapeAspectRelationship.SetRelatedShapeAspect (method)
  SetRelatedShapeAspect(RelatedShapeAspect: StepRepr_ShapeAspect): void;

  // StepRepr_ShapeAspectRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ShapeAspectRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ShapeAspectRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ShapeAspectRelationship.delete (method)
  delete(): void;

  // StepRepr_ShapeAspectRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ShapeAspectTransition: declare class StepRepr_ShapeAspectTransition extends StepRepr_ShapeAspectRelationship

  // StepRepr_ShapeAspectTransition.constructor (constructor)
  constructor();

  // StepRepr_ShapeAspectTransition.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ShapeAspectTransition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ShapeAspectTransition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ShapeAspectTransition.delete (method)
  delete(): void;

  // StepRepr_ShapeAspectTransition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ShapeDefinition: declare class StepRepr_ShapeDefinition extends StepData_SelectType

  // StepRepr_ShapeDefinition.constructor (constructor)
  constructor();

  // StepRepr_ShapeDefinition.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepRepr_ShapeDefinition.ProductDefinitionShape (method)
  ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

  // StepRepr_ShapeDefinition.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepRepr_ShapeDefinition.ShapeAspectRelationship (method)
  ShapeAspectRelationship(): StepRepr_ShapeAspectRelationship;

  // StepRepr_ShapeDefinition.delete (method)
  delete(): void;

  // StepRepr_ShapeDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ShapeRepresentationRelationship: declare class StepRepr_ShapeRepresentationRelationship extends StepRepr_RepresentationRelationship

  // StepRepr_ShapeRepresentationRelationship.constructor (constructor)
  constructor();

  // StepRepr_ShapeRepresentationRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ShapeRepresentationRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ShapeRepresentationRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ShapeRepresentationRelationship.delete (method)
  delete(): void;

  // StepRepr_ShapeRepresentationRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ShapeRepresentationRelationshipWithTransformation: declare class StepRepr_ShapeRepresentationRelationshipWithTransformation extends StepRepr_RepresentationRelationshipWithTransformation

  // StepRepr_ShapeRepresentationRelationshipWithTransformation.constructor (constructor)
  constructor();

  // StepRepr_ShapeRepresentationRelationshipWithTransformation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ShapeRepresentationRelationshipWithTransformation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ShapeRepresentationRelationshipWithTransformation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ShapeRepresentationRelationshipWithTransformation.delete (method)
  delete(): void;

  // StepRepr_ShapeRepresentationRelationshipWithTransformation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
