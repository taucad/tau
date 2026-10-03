# libcascade — StepRepr (3)

16 top-level symbols. Signatures are verbatim typescript.

StepRepr_SpecifiedHigherUsageOccurrence: declare class StepRepr_SpecifiedHigherUsageOccurrence extends StepRepr_AssemblyComponentUsage

  // StepRepr_SpecifiedHigherUsageOccurrence.constructor (constructor)
  constructor();

  // StepRepr_SpecifiedHigherUsageOccurrence.Init (method)
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasAssemblyComponentUsage_ReferenceDesignator: boolean, aAssemblyComponentUsage_ReferenceDesignator: TCollection_HAsciiString, aUpperUsage: StepRepr_AssemblyComponentUsage, aNextUsage: StepRepr_NextAssemblyUsageOccurrence): void;
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinition, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinition, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
  Init(aProductDefinitionRelationship_Id: TCollection_HAsciiString, aProductDefinitionRelationship_Name: TCollection_HAsciiString, hasProductDefinitionRelationship_Description: boolean, aProductDefinitionRelationship_Description: TCollection_HAsciiString, aProductDefinitionRelationship_RelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aProductDefinitionRelationship_RelatedProductDefinition: StepBasic_ProductDefinitionOrReference, hasReferenceDesignator: boolean, aReferenceDesignator: TCollection_HAsciiString): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinition, aRelatedProductDefinition: StepBasic_ProductDefinition): void;
  Init(aId: TCollection_HAsciiString, aName: TCollection_HAsciiString, hasDescription: boolean, aDescription: TCollection_HAsciiString, aRelatingProductDefinition: StepBasic_ProductDefinitionOrReference, aRelatedProductDefinition: StepBasic_ProductDefinitionOrReference): void;

  // StepRepr_SpecifiedHigherUsageOccurrence.UpperUsage (method)
  UpperUsage(): StepRepr_AssemblyComponentUsage;

  // StepRepr_SpecifiedHigherUsageOccurrence.SetUpperUsage (method)
  SetUpperUsage(UpperUsage: StepRepr_AssemblyComponentUsage): void;

  // StepRepr_SpecifiedHigherUsageOccurrence.NextUsage (method)
  NextUsage(): StepRepr_NextAssemblyUsageOccurrence;

  // StepRepr_SpecifiedHigherUsageOccurrence.SetNextUsage (method)
  SetNextUsage(NextUsage: StepRepr_NextAssemblyUsageOccurrence): void;

  // StepRepr_SpecifiedHigherUsageOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_SpecifiedHigherUsageOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_SpecifiedHigherUsageOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_SpecifiedHigherUsageOccurrence.delete (method)
  delete(): void;

  // StepRepr_SpecifiedHigherUsageOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_StructuralResponseProperty: declare class StepRepr_StructuralResponseProperty extends StepRepr_PropertyDefinition

  // StepRepr_StructuralResponseProperty.constructor (constructor)
  constructor();

  // StepRepr_StructuralResponseProperty.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_StructuralResponseProperty.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_StructuralResponseProperty.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_StructuralResponseProperty.delete (method)
  delete(): void;

  // StepRepr_StructuralResponseProperty.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_StructuralResponsePropertyDefinitionRepresentation: declare class StepRepr_StructuralResponsePropertyDefinitionRepresentation extends StepRepr_PropertyDefinitionRepresentation

  // StepRepr_StructuralResponsePropertyDefinitionRepresentation.constructor (constructor)
  constructor();

  // StepRepr_StructuralResponsePropertyDefinitionRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_StructuralResponsePropertyDefinitionRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_StructuralResponsePropertyDefinitionRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_StructuralResponsePropertyDefinitionRepresentation.delete (method)
  delete(): void;

  // StepRepr_StructuralResponsePropertyDefinitionRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_SuppliedPartRelationship: declare class StepRepr_SuppliedPartRelationship extends StepBasic_ProductDefinitionRelationship

  // StepRepr_SuppliedPartRelationship.constructor (constructor)
  constructor();

  // StepRepr_SuppliedPartRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_SuppliedPartRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_SuppliedPartRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_SuppliedPartRelationship.delete (method)
  delete(): void;

  // StepRepr_SuppliedPartRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_Tangent: declare class StepRepr_Tangent extends StepRepr_DerivedShapeAspect

  // StepRepr_Tangent.constructor (constructor)
  constructor();

  // StepRepr_Tangent.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_Tangent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_Tangent.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_Tangent.delete (method)
  delete(): void;

  // StepRepr_Tangent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_Transformation: declare class StepRepr_Transformation extends StepData_SelectType

  // StepRepr_Transformation.constructor (constructor)
  constructor();

  // StepRepr_Transformation.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepRepr_Transformation.ItemDefinedTransformation (method)
  ItemDefinedTransformation(): StepRepr_ItemDefinedTransformation;

  // StepRepr_Transformation.FunctionallyDefinedTransformation (method)
  FunctionallyDefinedTransformation(): StepRepr_FunctionallyDefinedTransformation;

  // StepRepr_Transformation.delete (method)
  delete(): void;

  // StepRepr_Transformation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ValueRange: declare class StepRepr_ValueRange extends StepRepr_CompoundRepresentationItem

  // StepRepr_ValueRange.constructor (constructor)
  constructor();

  // StepRepr_ValueRange.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ValueRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ValueRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ValueRange.delete (method)
  delete(): void;

  // StepRepr_ValueRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_ValueRepresentationItem: declare class StepRepr_ValueRepresentationItem extends StepRepr_RepresentationItem

  // StepRepr_ValueRepresentationItem.constructor (constructor)
  constructor();

  // StepRepr_ValueRepresentationItem.Init (method)
  Init(theName: TCollection_HAsciiString, theValueComponentMember: StepBasic_MeasureValueMember): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepRepr_ValueRepresentationItem.SetValueComponentMember (method)
  SetValueComponentMember(theValueComponentMember: StepBasic_MeasureValueMember): void;

  // StepRepr_ValueRepresentationItem.ValueComponentMember (method)
  ValueComponentMember(): StepBasic_MeasureValueMember;

  // StepRepr_ValueRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepRepr_ValueRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepRepr_ValueRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepRepr_ValueRepresentationItem.delete (method)
  delete(): void;

  // StepRepr_ValueRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepRepr_Array1OfMaterialPropertyRepresentation: NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation

StepRepr_Array1OfPropertyDefinitionRepresentation: NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation

StepRepr_Array1OfRepresentationItem: NCollection_Array1_handle_StepRepr_RepresentationItem

StepRepr_Array1OfShapeAspect: NCollection_Array1_handle_StepRepr_ShapeAspect

StepRepr_HArray1OfMaterialPropertyRepresentation: NCollection_HArray1_handle_StepRepr_MaterialPropertyRepresentation

StepRepr_HArray1OfPropertyDefinitionRepresentation: NCollection_HArray1_handle_StepRepr_PropertyDefinitionRepresentation

StepRepr_HArray1OfRepresentationItem: NCollection_HArray1_handle_StepRepr_RepresentationItem

StepRepr_HArray1OfShapeAspect: NCollection_HArray1_handle_StepRepr_ShapeAspect
