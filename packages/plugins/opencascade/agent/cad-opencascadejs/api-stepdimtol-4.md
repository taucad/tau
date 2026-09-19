# libcascade — StepDimTol (4)

36 top-level symbols. Signatures are verbatim typescript.

StepDimTol_ModifiedGeometricTolerance: declare class StepDimTol_ModifiedGeometricTolerance extends StepDimTol_GeometricTolerance

  constructor

  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theModifier: StepDimTol_LimitCondition): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifier: StepDimTol_LimitCondition): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theModifier: StepDimTol_LimitCondition): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifier: StepDimTol_LimitCondition): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theModifier: StepDimTol_LimitCondition): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifier: StepDimTol_LimitCondition): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theModifier: StepDimTol_LimitCondition): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifier: StepDimTol_LimitCondition): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  Modifier(): StepDimTol_LimitCondition;

  SetModifier(theModifier: StepDimTol_LimitCondition): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_NonUniformZoneDefinition: declare class StepDimTol_NonUniformZoneDefinition extends StepDimTol_ToleranceZoneDefinition

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_ParallelismTolerance: declare class StepDimTol_ParallelismTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_PerpendicularityTolerance: declare class StepDimTol_PerpendicularityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_PlacedDatumTargetFeature: declare class StepDimTol_PlacedDatumTargetFeature extends StepDimTol_DatumTarget

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_PositionTolerance: declare class StepDimTol_PositionTolerance extends StepDimTol_GeometricTolerance

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_ProjectedZoneDefinition: declare class StepDimTol_ProjectedZoneDefinition extends StepDimTol_ToleranceZoneDefinition

  constructor

  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect, theProjectionEnd: StepRepr_ShapeAspect, theProjectionLength: StepBasic_LengthMeasureWithUnit): void;
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect, theProjectionEnd: StepRepr_ShapeAspect, theProjectionLength: StepBasic_LengthMeasureWithUnit): void;
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

  ProjectionEnd(): StepRepr_ShapeAspect;

  SetProjectionEnd(theProjectionEnd: StepRepr_ShapeAspect): void;

  ProjectionLength(): StepBasic_LengthMeasureWithUnit;

  SetProjectionLength(theProjectionLength: StepBasic_LengthMeasureWithUnit): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_RoundnessTolerance: declare class StepDimTol_RoundnessTolerance extends StepDimTol_GeometricTolerance

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_RunoutZoneDefinition: declare class StepDimTol_RunoutZoneDefinition extends StepDimTol_ToleranceZoneDefinition

  constructor

  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect, theOrientation: StepDimTol_RunoutZoneOrientation): void;
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect, theOrientation: StepDimTol_RunoutZoneOrientation): void;
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

  Orientation(): StepDimTol_RunoutZoneOrientation;

  SetOrientation(theOrientation: StepDimTol_RunoutZoneOrientation): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_RunoutZoneOrientation: declare class StepDimTol_RunoutZoneOrientation extends Standard_Transient

  constructor

  Init(theAngle: StepBasic_PlaneAngleMeasureWithUnit): void;

  Angle(): StepBasic_PlaneAngleMeasureWithUnit;

  SetAngle(theAngle: StepBasic_PlaneAngleMeasureWithUnit): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_ShapeToleranceSelect: declare class StepDimTol_ShapeToleranceSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  GeometricTolerance(): StepDimTol_GeometricTolerance;

  PlusMinusTolerance(): StepShape_PlusMinusTolerance;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_SimpleDatumReferenceModifier: typeof StepDimTol_SimpleDatumReferenceModifier[keyof typeof StepDimTol_SimpleDatumReferenceModifier]

StepDimTol_SimpleDatumReferenceModifierMember: declare class StepDimTol_SimpleDatumReferenceModifierMember extends StepData_SelectInt

  constructor

  HasName(): boolean;

  Name(): string;

  SetName(name: string): boolean;

  Kind(): number;

  EnumText(): string;

  SetEnumText(val: number, text: string): void;

  SetValue(theValue: StepDimTol_SimpleDatumReferenceModifier): void;

  Value(): StepDimTol_SimpleDatumReferenceModifier;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_StraightnessTolerance: declare class StepDimTol_StraightnessTolerance extends StepDimTol_GeometricTolerance

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_SurfaceProfileTolerance: declare class StepDimTol_SurfaceProfileTolerance extends StepDimTol_GeometricTolerance

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_SymmetryTolerance: declare class StepDimTol_SymmetryTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_ToleranceZone: declare class StepDimTol_ToleranceZone extends StepRepr_ShapeAspect

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theDefiningTolerance: NCollection_HArray1_StepDimTol_ToleranceZoneTarget, theForm: StepDimTol_ToleranceZoneForm): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theDefiningTolerance: NCollection_HArray1_StepDimTol_ToleranceZoneTarget, theForm: StepDimTol_ToleranceZoneForm): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  DefiningTolerance(): NCollection_HArray1_StepDimTol_ToleranceZoneTarget;

  SetDefiningTolerance(theDefiningTolerance: NCollection_HArray1_StepDimTol_ToleranceZoneTarget): void;

  NbDefiningTolerances(): number;

  DefiningToleranceValue(theNum: number): StepDimTol_ToleranceZoneTarget;

  SetDefiningToleranceValue(theNum: number, theItem: StepDimTol_ToleranceZoneTarget): void;

  Form(): StepDimTol_ToleranceZoneForm;

  SetForm(theForm: StepDimTol_ToleranceZoneForm): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_ToleranceZoneDefinition: declare class StepDimTol_ToleranceZoneDefinition extends Standard_Transient

  constructor

  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

  Boundaries(): NCollection_HArray1_handle_StepRepr_ShapeAspect;

  SetBoundaries(theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

  NbBoundaries(): number;

  BoundariesValue(theNum: number): StepRepr_ShapeAspect;

  SetBoundariesValue(theNum: number, theItem: StepRepr_ShapeAspect): void;

  Zone(): StepDimTol_ToleranceZone;

  SetZone(theZone: StepDimTol_ToleranceZone): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_ToleranceZoneForm: declare class StepDimTol_ToleranceZoneForm extends Standard_Transient

  constructor

  Init(theName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetName(theName: TCollection_HAsciiString): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_ToleranceZoneTarget: declare class StepDimTol_ToleranceZoneTarget extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  DimensionalLocation(): StepShape_DimensionalLocation;

  DimensionalSize(): StepShape_DimensionalSize;

  GeometricTolerance(): StepDimTol_GeometricTolerance;

  GeneralDatumReference(): StepDimTol_GeneralDatumReference;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_TotalRunoutTolerance: declare class StepDimTol_TotalRunoutTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_UnequallyDisposedGeometricTolerance: declare class StepDimTol_UnequallyDisposedGeometricTolerance extends StepDimTol_GeometricTolerance

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDisplacement: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDisplacement: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDisplacement: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  Displacement(): StepBasic_LengthMeasureWithUnit;

  SetDisplacement(theDisplacement: StepBasic_LengthMeasureWithUnit): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_Array1OfDatumReference: NCollection_Array1_handle_StepDimTol_DatumReference

StepDimTol_Array1OfDatumReferenceCompartment: NCollection_Array1_handle_StepDimTol_DatumReferenceCompartment

StepDimTol_Array1OfDatumReferenceElement: NCollection_Array1_handle_StepDimTol_DatumReferenceElement

StepDimTol_Array1OfDatumReferenceModifier: NCollection_Array1_StepDimTol_DatumReferenceModifier

StepDimTol_Array1OfDatumSystemOrReference: NCollection_Array1_StepDimTol_DatumSystemOrReference

StepDimTol_Array1OfGeometricToleranceModifier: NCollection_Array1_StepDimTol_GeometricToleranceModifier

StepDimTol_Array1OfToleranceZoneTarget: NCollection_Array1_StepDimTol_ToleranceZoneTarget

StepDimTol_HArray1OfDatumReference: NCollection_HArray1_handle_StepDimTol_DatumReference

StepDimTol_HArray1OfDatumReferenceCompartment: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment

StepDimTol_HArray1OfDatumReferenceElement: NCollection_HArray1_handle_StepDimTol_DatumReferenceElement

StepDimTol_HArray1OfDatumReferenceModifier: NCollection_HArray1_StepDimTol_DatumReferenceModifier

StepDimTol_HArray1OfDatumSystemOrReference: NCollection_HArray1_StepDimTol_DatumSystemOrReference

StepDimTol_HArray1OfGeometricToleranceModifier: NCollection_HArray1_StepDimTol_GeometricToleranceModifier

StepDimTol_HArray1OfToleranceZoneTarget: NCollection_HArray1_StepDimTol_ToleranceZoneTarget
