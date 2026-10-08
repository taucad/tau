# libcascade — StepDimTol (2)

44 top-level symbols. Signatures are verbatim typescript.

StepDimTol_GeometricToleranceType: typeof StepDimTol_GeometricToleranceType[keyof typeof StepDimTol_GeometricToleranceType]

  readonly StepDimTol_GTTAngularityTolerance: 'StepDimTol_GTTAngularityTolerance'

  readonly StepDimTol_GTTCircularRunoutTolerance: 'StepDimTol_GTTCircularRunoutTolerance'

  readonly StepDimTol_GTTCoaxialityTolerance: 'StepDimTol_GTTCoaxialityTolerance'

  readonly StepDimTol_GTTConcentricityTolerance: 'StepDimTol_GTTConcentricityTolerance'

  readonly StepDimTol_GTTCylindricityTolerance: 'StepDimTol_GTTCylindricityTolerance'

  readonly StepDimTol_GTTFlatnessTolerance: 'StepDimTol_GTTFlatnessTolerance'

  readonly StepDimTol_GTTLineProfileTolerance: 'StepDimTol_GTTLineProfileTolerance'

  readonly StepDimTol_GTTParallelismTolerance: 'StepDimTol_GTTParallelismTolerance'

  readonly StepDimTol_GTTPerpendicularityTolerance: 'StepDimTol_GTTPerpendicularityTolerance'

  readonly StepDimTol_GTTPositionTolerance: 'StepDimTol_GTTPositionTolerance'

  readonly StepDimTol_GTTRoundnessTolerance: 'StepDimTol_GTTRoundnessTolerance'

  readonly StepDimTol_GTTStraightnessTolerance: 'StepDimTol_GTTStraightnessTolerance'

  readonly StepDimTol_GTTSurfaceProfileTolerance: 'StepDimTol_GTTSurfaceProfileTolerance'

  readonly StepDimTol_GTTSymmetryTolerance: 'StepDimTol_GTTSymmetryTolerance'

  readonly StepDimTol_GTTTotalRunoutTolerance: 'StepDimTol_GTTTotalRunoutTolerance'

StepDimTol_GeometricToleranceWithDatumReference: declare class StepDimTol_GeometricToleranceWithDatumReference extends StepDimTol_GeometricTolerance

  // StepDimTol_GeometricToleranceWithDatumReference.constructor (constructor)
  constructor();

  // StepDimTol_GeometricToleranceWithDatumReference.Init (method)
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theDatumSystem: NCollection_HArray1_handle_StepDimTol_DatumReference): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDatumSystem: NCollection_HArray1_StepDimTol_DatumSystemOrReference): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeometricToleranceWithDatumReference.DatumSystem (method)
  DatumSystem(): NCollection_HArray1_handle_StepDimTol_DatumReference;

  // StepDimTol_GeometricToleranceWithDatumReference.DatumSystemAP242 (method)
  DatumSystemAP242(): NCollection_HArray1_StepDimTol_DatumSystemOrReference;

  // StepDimTol_GeometricToleranceWithDatumReference.SetDatumSystem (method)
  SetDatumSystem(theDatumSystem: NCollection_HArray1_handle_StepDimTol_DatumReference): void;

  // StepDimTol_GeometricToleranceWithDatumReference.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeometricToleranceWithDatumReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeometricToleranceWithDatumReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeometricToleranceWithDatumReference.delete (method)
  delete(): void;

  // StepDimTol_GeometricToleranceWithDatumReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceWithDefinedAreaUnit: declare class StepDimTol_GeometricToleranceWithDefinedAreaUnit extends StepDimTol_GeometricToleranceWithDefinedUnit

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.constructor (constructor)
  constructor();

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit, theAreaType: StepDimTol_AreaUnitType, theHasSecondUnitSize: boolean, theSecondUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.AreaType (method)
  AreaType(): StepDimTol_AreaUnitType;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.SetAreaType (method)
  SetAreaType(theAreaType: StepDimTol_AreaUnitType): void;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.SecondUnitSize (method)
  SecondUnitSize(): StepBasic_LengthMeasureWithUnit;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.SetSecondUnitSize (method)
  SetSecondUnitSize(theSecondUnitSize: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.HasSecondUnitSize (method)
  HasSecondUnitSize(): boolean;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.delete (method)
  delete(): void;

  // StepDimTol_GeometricToleranceWithDefinedAreaUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceWithDefinedUnit: declare class StepDimTol_GeometricToleranceWithDefinedUnit extends StepDimTol_GeometricTolerance

  // StepDimTol_GeometricToleranceWithDefinedUnit.constructor (constructor)
  constructor();

  // StepDimTol_GeometricToleranceWithDefinedUnit.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeometricToleranceWithDefinedUnit.UnitSize (method)
  UnitSize(): StepBasic_LengthMeasureWithUnit;

  // StepDimTol_GeometricToleranceWithDefinedUnit.SetUnitSize (method)
  SetUnitSize(theUnitSize: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_GeometricToleranceWithDefinedUnit.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeometricToleranceWithDefinedUnit.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeometricToleranceWithDefinedUnit.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeometricToleranceWithDefinedUnit.delete (method)
  delete(): void;

  // StepDimTol_GeometricToleranceWithDefinedUnit.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceWithMaximumTolerance: declare class StepDimTol_GeometricToleranceWithMaximumTolerance extends StepDimTol_GeometricToleranceWithModifiers

  // StepDimTol_GeometricToleranceWithMaximumTolerance.constructor (constructor)
  constructor();

  // StepDimTol_GeometricToleranceWithMaximumTolerance.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeometricToleranceWithMaximumTolerance.MaximumUpperTolerance (method)
  MaximumUpperTolerance(): StepBasic_LengthMeasureWithUnit;

  // StepDimTol_GeometricToleranceWithMaximumTolerance.SetMaximumUpperTolerance (method)
  SetMaximumUpperTolerance(theMaximumUpperTolerance: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_GeometricToleranceWithMaximumTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeometricToleranceWithMaximumTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeometricToleranceWithMaximumTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeometricToleranceWithMaximumTolerance.delete (method)
  delete(): void;

  // StepDimTol_GeometricToleranceWithMaximumTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceWithModifiers: declare class StepDimTol_GeometricToleranceWithModifiers extends StepDimTol_GeometricTolerance

  // StepDimTol_GeometricToleranceWithModifiers.constructor (constructor)
  constructor();

  // StepDimTol_GeometricToleranceWithModifiers.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeometricToleranceWithModifiers.Modifiers (method)
  Modifiers(): NCollection_HArray1_StepDimTol_GeometricToleranceModifier;

  // StepDimTol_GeometricToleranceWithModifiers.SetModifiers (method)
  SetModifiers(theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;

  // StepDimTol_GeometricToleranceWithModifiers.NbModifiers (method)
  NbModifiers(): number;

  // StepDimTol_GeometricToleranceWithModifiers.ModifierValue (method)
  ModifierValue(theNum: number): StepDimTol_GeometricToleranceModifier;

  // StepDimTol_GeometricToleranceWithModifiers.SetModifierValue (method)
  SetModifierValue(theNum: number, theItem: StepDimTol_GeometricToleranceModifier): void;

  // StepDimTol_GeometricToleranceWithModifiers.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeometricToleranceWithModifiers.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeometricToleranceWithModifiers.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeometricToleranceWithModifiers.delete (method)
  delete(): void;

  // StepDimTol_GeometricToleranceWithModifiers.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_LimitCondition: typeof StepDimTol_LimitCondition[keyof typeof StepDimTol_LimitCondition]

  readonly StepDimTol_MaximumMaterialCondition: 'StepDimTol_MaximumMaterialCondition'

  readonly StepDimTol_LeastMaterialCondition: 'StepDimTol_LeastMaterialCondition'

  readonly StepDimTol_RegardlessOfFeatureSize: 'StepDimTol_RegardlessOfFeatureSize'

StepDimTol_LineProfileTolerance: declare class StepDimTol_LineProfileTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_LineProfileTolerance.constructor (constructor)
  constructor();

  // StepDimTol_LineProfileTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_LineProfileTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_LineProfileTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_LineProfileTolerance.delete (method)
  delete(): void;

  // StepDimTol_LineProfileTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ModifiedGeometricTolerance: declare class StepDimTol_ModifiedGeometricTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_ModifiedGeometricTolerance.constructor (constructor)
  constructor();

  // StepDimTol_ModifiedGeometricTolerance.Init (method)
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theModifier: StepDimTol_LimitCondition): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifier: StepDimTol_LimitCondition): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_ModifiedGeometricTolerance.Modifier (method)
  Modifier(): StepDimTol_LimitCondition;

  // StepDimTol_ModifiedGeometricTolerance.SetModifier (method)
  SetModifier(theModifier: StepDimTol_LimitCondition): void;

  // StepDimTol_ModifiedGeometricTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_ModifiedGeometricTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_ModifiedGeometricTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_ModifiedGeometricTolerance.delete (method)
  delete(): void;

  // StepDimTol_ModifiedGeometricTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_NonUniformZoneDefinition: declare class StepDimTol_NonUniformZoneDefinition extends StepDimTol_ToleranceZoneDefinition

  // StepDimTol_NonUniformZoneDefinition.constructor (constructor)
  constructor();

  // StepDimTol_NonUniformZoneDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_NonUniformZoneDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_NonUniformZoneDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_NonUniformZoneDefinition.delete (method)
  delete(): void;

  // StepDimTol_NonUniformZoneDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ParallelismTolerance: declare class StepDimTol_ParallelismTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  // StepDimTol_ParallelismTolerance.constructor (constructor)
  constructor();

  // StepDimTol_ParallelismTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_ParallelismTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_ParallelismTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_ParallelismTolerance.delete (method)
  delete(): void;

  // StepDimTol_ParallelismTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_PerpendicularityTolerance: declare class StepDimTol_PerpendicularityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  // StepDimTol_PerpendicularityTolerance.constructor (constructor)
  constructor();

  // StepDimTol_PerpendicularityTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_PerpendicularityTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_PerpendicularityTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_PerpendicularityTolerance.delete (method)
  delete(): void;

  // StepDimTol_PerpendicularityTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_PlacedDatumTargetFeature: declare class StepDimTol_PlacedDatumTargetFeature extends StepDimTol_DatumTarget

  // StepDimTol_PlacedDatumTargetFeature.constructor (constructor)
  constructor();

  // StepDimTol_PlacedDatumTargetFeature.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_PlacedDatumTargetFeature.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_PlacedDatumTargetFeature.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_PlacedDatumTargetFeature.delete (method)
  delete(): void;

  // StepDimTol_PlacedDatumTargetFeature.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_PositionTolerance: declare class StepDimTol_PositionTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_PositionTolerance.constructor (constructor)
  constructor();

  // StepDimTol_PositionTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_PositionTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_PositionTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_PositionTolerance.delete (method)
  delete(): void;

  // StepDimTol_PositionTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ProjectedZoneDefinition: declare class StepDimTol_ProjectedZoneDefinition extends StepDimTol_ToleranceZoneDefinition

  // StepDimTol_ProjectedZoneDefinition.constructor (constructor)
  constructor();

  // StepDimTol_ProjectedZoneDefinition.Init (method)
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect, theProjectionEnd: StepRepr_ShapeAspect, theProjectionLength: StepBasic_LengthMeasureWithUnit): void;
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

  // StepDimTol_ProjectedZoneDefinition.ProjectionEnd (method)
  ProjectionEnd(): StepRepr_ShapeAspect;

  // StepDimTol_ProjectedZoneDefinition.SetProjectionEnd (method)
  SetProjectionEnd(theProjectionEnd: StepRepr_ShapeAspect): void;

  // StepDimTol_ProjectedZoneDefinition.ProjectionLength (method)
  ProjectionLength(): StepBasic_LengthMeasureWithUnit;

  // StepDimTol_ProjectedZoneDefinition.SetProjectionLength (method)
  SetProjectionLength(theProjectionLength: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_ProjectedZoneDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_ProjectedZoneDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_ProjectedZoneDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_ProjectedZoneDefinition.delete (method)
  delete(): void;

  // StepDimTol_ProjectedZoneDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_RoundnessTolerance: declare class StepDimTol_RoundnessTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_RoundnessTolerance.constructor (constructor)
  constructor();

  // StepDimTol_RoundnessTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_RoundnessTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_RoundnessTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_RoundnessTolerance.delete (method)
  delete(): void;

  // StepDimTol_RoundnessTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_RunoutZoneDefinition: declare class StepDimTol_RunoutZoneDefinition extends StepDimTol_ToleranceZoneDefinition

  // StepDimTol_RunoutZoneDefinition.constructor (constructor)
  constructor();

  // StepDimTol_RunoutZoneDefinition.Init (method)
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect, theOrientation: StepDimTol_RunoutZoneOrientation): void;
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

  // StepDimTol_RunoutZoneDefinition.Orientation (method)
  Orientation(): StepDimTol_RunoutZoneOrientation;

  // StepDimTol_RunoutZoneDefinition.SetOrientation (method)
  SetOrientation(theOrientation: StepDimTol_RunoutZoneOrientation): void;

  // StepDimTol_RunoutZoneDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_RunoutZoneDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_RunoutZoneDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_RunoutZoneDefinition.delete (method)
  delete(): void;

  // StepDimTol_RunoutZoneDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_RunoutZoneOrientation: declare class StepDimTol_RunoutZoneOrientation extends Standard_Transient

  // StepDimTol_RunoutZoneOrientation.constructor (constructor)
  constructor();

  // StepDimTol_RunoutZoneOrientation.Init (method)
  Init(theAngle: StepBasic_PlaneAngleMeasureWithUnit): void;

  // StepDimTol_RunoutZoneOrientation.Angle (method)
  Angle(): StepBasic_PlaneAngleMeasureWithUnit;

  // StepDimTol_RunoutZoneOrientation.SetAngle (method)
  SetAngle(theAngle: StepBasic_PlaneAngleMeasureWithUnit): void;

  // StepDimTol_RunoutZoneOrientation.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_RunoutZoneOrientation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_RunoutZoneOrientation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_RunoutZoneOrientation.delete (method)
  delete(): void;

  // StepDimTol_RunoutZoneOrientation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ShapeToleranceSelect: declare class StepDimTol_ShapeToleranceSelect extends StepData_SelectType

  // StepDimTol_ShapeToleranceSelect.constructor (constructor)
  constructor();

  // StepDimTol_ShapeToleranceSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepDimTol_ShapeToleranceSelect.GeometricTolerance (method)
  GeometricTolerance(): StepDimTol_GeometricTolerance;

  // StepDimTol_ShapeToleranceSelect.PlusMinusTolerance (method)
  PlusMinusTolerance(): StepShape_PlusMinusTolerance;

  // StepDimTol_ShapeToleranceSelect.delete (method)
  delete(): void;

  // StepDimTol_ShapeToleranceSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_SimpleDatumReferenceModifier: typeof StepDimTol_SimpleDatumReferenceModifier[keyof typeof StepDimTol_SimpleDatumReferenceModifier]

  readonly StepDimTol_SDRMAnyCrossSection: 'StepDimTol_SDRMAnyCrossSection'

  readonly StepDimTol_SDRMAnyLongitudinalSection: 'StepDimTol_SDRMAnyLongitudinalSection'

  readonly StepDimTol_SDRMBasic: 'StepDimTol_SDRMBasic'

  readonly StepDimTol_SDRMContactingFeature: 'StepDimTol_SDRMContactingFeature'

  readonly StepDimTol_SDRMDegreeOfFreedomConstraintU: 'StepDimTol_SDRMDegreeOfFreedomConstraintU'

  readonly StepDimTol_SDRMDegreeOfFreedomConstraintV: 'StepDimTol_SDRMDegreeOfFreedomConstraintV'

  readonly StepDimTol_SDRMDegreeOfFreedomConstraintW: 'StepDimTol_SDRMDegreeOfFreedomConstraintW'

  readonly StepDimTol_SDRMDegreeOfFreedomConstraintX: 'StepDimTol_SDRMDegreeOfFreedomConstraintX'

  readonly StepDimTol_SDRMDegreeOfFreedomConstraintY: 'StepDimTol_SDRMDegreeOfFreedomConstraintY'

  readonly StepDimTol_SDRMDegreeOfFreedomConstraintZ: 'StepDimTol_SDRMDegreeOfFreedomConstraintZ'

  readonly StepDimTol_SDRMDistanceVariable: 'StepDimTol_SDRMDistanceVariable'

  readonly StepDimTol_SDRMFreeState: 'StepDimTol_SDRMFreeState'

  readonly StepDimTol_SDRMLeastMaterialRequirement: 'StepDimTol_SDRMLeastMaterialRequirement'

  readonly StepDimTol_SDRMLine: 'StepDimTol_SDRMLine'

  readonly StepDimTol_SDRMMajorDiameter: 'StepDimTol_SDRMMajorDiameter'

  readonly StepDimTol_SDRMMaximumMaterialRequirement: 'StepDimTol_SDRMMaximumMaterialRequirement'

  readonly StepDimTol_SDRMMinorDiameter: 'StepDimTol_SDRMMinorDiameter'

  readonly StepDimTol_SDRMOrientation: 'StepDimTol_SDRMOrientation'

  readonly StepDimTol_SDRMPitchDiameter: 'StepDimTol_SDRMPitchDiameter'

  readonly StepDimTol_SDRMPlane: 'StepDimTol_SDRMPlane'

  readonly StepDimTol_SDRMPoint: 'StepDimTol_SDRMPoint'

  readonly StepDimTol_SDRMTranslation: 'StepDimTol_SDRMTranslation'

StepDimTol_SimpleDatumReferenceModifierMember: declare class StepDimTol_SimpleDatumReferenceModifierMember extends StepData_SelectInt

  // StepDimTol_SimpleDatumReferenceModifierMember.constructor (constructor)
  constructor();

  // StepDimTol_SimpleDatumReferenceModifierMember.HasName (method)
  HasName(): boolean;

  // StepDimTol_SimpleDatumReferenceModifierMember.Name (method)
  Name(): string;

  // StepDimTol_SimpleDatumReferenceModifierMember.SetName (method)
  SetName(name: string): boolean;

  // StepDimTol_SimpleDatumReferenceModifierMember.Kind (method)
  Kind(): number;

  // StepDimTol_SimpleDatumReferenceModifierMember.EnumText (method)
  EnumText(): string;

  // StepDimTol_SimpleDatumReferenceModifierMember.SetEnumText (method)
  SetEnumText(val: number, text: string): void;

  // StepDimTol_SimpleDatumReferenceModifierMember.SetValue (method)
  SetValue(theValue: StepDimTol_SimpleDatumReferenceModifier): void;

  // StepDimTol_SimpleDatumReferenceModifierMember.Value (method)
  Value(): StepDimTol_SimpleDatumReferenceModifier;

  // StepDimTol_SimpleDatumReferenceModifierMember.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_SimpleDatumReferenceModifierMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_SimpleDatumReferenceModifierMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_SimpleDatumReferenceModifierMember.delete (method)
  delete(): void;

  // StepDimTol_SimpleDatumReferenceModifierMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_StraightnessTolerance: declare class StepDimTol_StraightnessTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_StraightnessTolerance.constructor (constructor)
  constructor();

  // StepDimTol_StraightnessTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_StraightnessTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_StraightnessTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_StraightnessTolerance.delete (method)
  delete(): void;

  // StepDimTol_StraightnessTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_SurfaceProfileTolerance: declare class StepDimTol_SurfaceProfileTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_SurfaceProfileTolerance.constructor (constructor)
  constructor();

  // StepDimTol_SurfaceProfileTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_SurfaceProfileTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_SurfaceProfileTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_SurfaceProfileTolerance.delete (method)
  delete(): void;

  // StepDimTol_SurfaceProfileTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_SymmetryTolerance: declare class StepDimTol_SymmetryTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  // StepDimTol_SymmetryTolerance.constructor (constructor)
  constructor();

  // StepDimTol_SymmetryTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_SymmetryTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_SymmetryTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_SymmetryTolerance.delete (method)
  delete(): void;

  // StepDimTol_SymmetryTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ToleranceZone: declare class StepDimTol_ToleranceZone extends StepRepr_ShapeAspect

  // StepDimTol_ToleranceZone.constructor (constructor)
  constructor();

  // StepDimTol_ToleranceZone.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theDefiningTolerance: NCollection_HArray1_StepDimTol_ToleranceZoneTarget, theForm: StepDimTol_ToleranceZoneForm): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  // StepDimTol_ToleranceZone.DefiningTolerance (method)
  DefiningTolerance(): NCollection_HArray1_StepDimTol_ToleranceZoneTarget;

  // StepDimTol_ToleranceZone.SetDefiningTolerance (method)
  SetDefiningTolerance(theDefiningTolerance: NCollection_HArray1_StepDimTol_ToleranceZoneTarget): void;

  // StepDimTol_ToleranceZone.NbDefiningTolerances (method)
  NbDefiningTolerances(): number;

  // StepDimTol_ToleranceZone.DefiningToleranceValue (method)
  DefiningToleranceValue(theNum: number): StepDimTol_ToleranceZoneTarget;

  // StepDimTol_ToleranceZone.SetDefiningToleranceValue (method)
  SetDefiningToleranceValue(theNum: number, theItem: StepDimTol_ToleranceZoneTarget): void;

  // StepDimTol_ToleranceZone.Form (method)
  Form(): StepDimTol_ToleranceZoneForm;

  // StepDimTol_ToleranceZone.SetForm (method)
  SetForm(theForm: StepDimTol_ToleranceZoneForm): void;

  // StepDimTol_ToleranceZone.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_ToleranceZone.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_ToleranceZone.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_ToleranceZone.delete (method)
  delete(): void;

  // StepDimTol_ToleranceZone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ToleranceZoneDefinition: declare class StepDimTol_ToleranceZoneDefinition extends Standard_Transient

  // StepDimTol_ToleranceZoneDefinition.constructor (constructor)
  constructor();

  // StepDimTol_ToleranceZoneDefinition.Init (method)
  Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

  // StepDimTol_ToleranceZoneDefinition.Boundaries (method)
  Boundaries(): NCollection_HArray1_handle_StepRepr_ShapeAspect;

  // StepDimTol_ToleranceZoneDefinition.SetBoundaries (method)
  SetBoundaries(theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

  // StepDimTol_ToleranceZoneDefinition.NbBoundaries (method)
  NbBoundaries(): number;

  // StepDimTol_ToleranceZoneDefinition.BoundariesValue (method)
  BoundariesValue(theNum: number): StepRepr_ShapeAspect;

  // StepDimTol_ToleranceZoneDefinition.SetBoundariesValue (method)
  SetBoundariesValue(theNum: number, theItem: StepRepr_ShapeAspect): void;

  // StepDimTol_ToleranceZoneDefinition.Zone (method)
  Zone(): StepDimTol_ToleranceZone;

  // StepDimTol_ToleranceZoneDefinition.SetZone (method)
  SetZone(theZone: StepDimTol_ToleranceZone): void;

  // StepDimTol_ToleranceZoneDefinition.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_ToleranceZoneDefinition.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_ToleranceZoneDefinition.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_ToleranceZoneDefinition.delete (method)
  delete(): void;

  // StepDimTol_ToleranceZoneDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ToleranceZoneForm: declare class StepDimTol_ToleranceZoneForm extends Standard_Transient

  // StepDimTol_ToleranceZoneForm.constructor (constructor)
  constructor();

  // StepDimTol_ToleranceZoneForm.Init (method)
  Init(theName: TCollection_HAsciiString): void;

  // StepDimTol_ToleranceZoneForm.Name (method)
  Name(): TCollection_HAsciiString;

  // StepDimTol_ToleranceZoneForm.SetName (method)
  SetName(theName: TCollection_HAsciiString): void;

  // StepDimTol_ToleranceZoneForm.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_ToleranceZoneForm.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_ToleranceZoneForm.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_ToleranceZoneForm.delete (method)
  delete(): void;

  // StepDimTol_ToleranceZoneForm.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ToleranceZoneTarget: declare class StepDimTol_ToleranceZoneTarget extends StepData_SelectType

  // StepDimTol_ToleranceZoneTarget.constructor (constructor)
  constructor();

  // StepDimTol_ToleranceZoneTarget.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepDimTol_ToleranceZoneTarget.DimensionalLocation (method)
  DimensionalLocation(): StepShape_DimensionalLocation;

  // StepDimTol_ToleranceZoneTarget.DimensionalSize (method)
  DimensionalSize(): StepShape_DimensionalSize;

  // StepDimTol_ToleranceZoneTarget.GeometricTolerance (method)
  GeometricTolerance(): StepDimTol_GeometricTolerance;

  // StepDimTol_ToleranceZoneTarget.GeneralDatumReference (method)
  GeneralDatumReference(): StepDimTol_GeneralDatumReference;

  // StepDimTol_ToleranceZoneTarget.delete (method)
  delete(): void;

  // StepDimTol_ToleranceZoneTarget.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_TotalRunoutTolerance: declare class StepDimTol_TotalRunoutTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  // StepDimTol_TotalRunoutTolerance.constructor (constructor)
  constructor();

  // StepDimTol_TotalRunoutTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_TotalRunoutTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_TotalRunoutTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_TotalRunoutTolerance.delete (method)
  delete(): void;

  // StepDimTol_TotalRunoutTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_UnequallyDisposedGeometricTolerance: declare class StepDimTol_UnequallyDisposedGeometricTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_UnequallyDisposedGeometricTolerance.constructor (constructor)
  constructor();

  // StepDimTol_UnequallyDisposedGeometricTolerance.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDisplacement: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_UnequallyDisposedGeometricTolerance.Displacement (method)
  Displacement(): StepBasic_LengthMeasureWithUnit;

  // StepDimTol_UnequallyDisposedGeometricTolerance.SetDisplacement (method)
  SetDisplacement(theDisplacement: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_UnequallyDisposedGeometricTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_UnequallyDisposedGeometricTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_UnequallyDisposedGeometricTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_UnequallyDisposedGeometricTolerance.delete (method)
  delete(): void;

  // StepDimTol_UnequallyDisposedGeometricTolerance.[Symbol.dispose] (method)
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
