# libcascade — StepDimTol (3)

13 top-level symbols. Signatures are verbatim typescript.

StepDimTol_GeoTolAndGeoTolWthMod: declare class StepDimTol_GeoTolAndGeoTolWthMod extends StepDimTol_GeometricTolerance

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  SetGeometricToleranceWithModifiers(theGTWM: StepDimTol_GeometricToleranceWithModifiers): void;

  GetGeometricToleranceWithModifiers(): StepDimTol_GeometricToleranceWithModifiers;

  SetGeometricToleranceType(theType: StepDimTol_GeometricToleranceType): void;

  GetToleranceType(): StepDimTol_GeometricToleranceType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeometricTolerance: declare class StepDimTol_GeometricTolerance extends Standard_Transient

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  Name(): TCollection_HAsciiString;

  SetName(theName: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(theDescription: TCollection_HAsciiString): void;

  Magnitude(): Standard_Transient;

  SetMagnitude(theMagnitude: Standard_Transient): void;

  TolerancedShapeAspect(): StepDimTol_GeometricToleranceTarget;

  SetTolerancedShapeAspect(theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  SetTolerancedShapeAspect(theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  SetTolerancedShapeAspect(theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  SetTolerancedShapeAspect(theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceModifier: typeof StepDimTol_GeometricToleranceModifier[keyof typeof StepDimTol_GeometricToleranceModifier]

StepDimTol_GeometricToleranceRelationship: declare class StepDimTol_GeometricToleranceRelationship extends Standard_Transient

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theRelatingGeometricTolerance: StepDimTol_GeometricTolerance, theRelatedGeometricTolerance: StepDimTol_GeometricTolerance): void;

  Name(): TCollection_HAsciiString;

  SetName(theName: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetDescription(theDescription: TCollection_HAsciiString): void;

  RelatingGeometricTolerance(): StepDimTol_GeometricTolerance;

  SetRelatingGeometricTolerance(theRelatingGeometricTolerance: StepDimTol_GeometricTolerance): void;

  RelatedGeometricTolerance(): StepDimTol_GeometricTolerance;

  SetRelatedGeometricTolerance(theRelatedGeometricTolerance: StepDimTol_GeometricTolerance): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceTarget: declare class StepDimTol_GeometricToleranceTarget extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  DimensionalLocation(): StepShape_DimensionalLocation;

  DimensionalSize(): StepShape_DimensionalSize;

  ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

  ShapeAspect(): StepRepr_ShapeAspect;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceType: typeof StepDimTol_GeometricToleranceType[keyof typeof StepDimTol_GeometricToleranceType]

StepDimTol_GeometricToleranceWithDatumReference: declare class StepDimTol_GeometricToleranceWithDatumReference extends StepDimTol_GeometricTolerance

  constructor

  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theDatumSystem: NCollection_HArray1_handle_StepDimTol_DatumReference): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDatumSystem: NCollection_HArray1_StepDimTol_DatumSystemOrReference): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theDatumSystem: NCollection_HArray1_handle_StepDimTol_DatumReference): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDatumSystem: NCollection_HArray1_StepDimTol_DatumSystemOrReference): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theDatumSystem: NCollection_HArray1_handle_StepDimTol_DatumReference): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDatumSystem: NCollection_HArray1_StepDimTol_DatumSystemOrReference): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepRepr_ShapeAspect, theDatumSystem: NCollection_HArray1_handle_StepDimTol_DatumReference): void;
  Init(theGeometricTolerance_Name: TCollection_HAsciiString, theGeometricTolerance_Description: TCollection_HAsciiString, theGeometricTolerance_Magnitude: Standard_Transient, theGeometricTolerance_TolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDatumSystem: NCollection_HArray1_StepDimTol_DatumSystemOrReference): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  DatumSystem(): NCollection_HArray1_handle_StepDimTol_DatumReference;

  DatumSystemAP242(): NCollection_HArray1_StepDimTol_DatumSystemOrReference;

  SetDatumSystem(theDatumSystem: NCollection_HArray1_handle_StepDimTol_DatumReference): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceWithDefinedAreaUnit: declare class StepDimTol_GeometricToleranceWithDefinedAreaUnit extends StepDimTol_GeometricToleranceWithDefinedUnit

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit, theAreaType: StepDimTol_AreaUnitType, theHasSecondUnitSize: boolean, theSecondUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit, theAreaType: StepDimTol_AreaUnitType, theHasSecondUnitSize: boolean, theSecondUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit, theAreaType: StepDimTol_AreaUnitType, theHasSecondUnitSize: boolean, theSecondUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit, theAreaType: StepDimTol_AreaUnitType, theHasSecondUnitSize: boolean, theSecondUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit, theAreaType: StepDimTol_AreaUnitType, theHasSecondUnitSize: boolean, theSecondUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  AreaType(): StepDimTol_AreaUnitType;

  SetAreaType(theAreaType: StepDimTol_AreaUnitType): void;

  SecondUnitSize(): StepBasic_LengthMeasureWithUnit;

  SetSecondUnitSize(theSecondUnitSize: StepBasic_LengthMeasureWithUnit): void;

  HasSecondUnitSize(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceWithDefinedUnit: declare class StepDimTol_GeometricToleranceWithDefinedUnit extends StepDimTol_GeometricTolerance

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  UnitSize(): StepBasic_LengthMeasureWithUnit;

  SetUnitSize(theUnitSize: StepBasic_LengthMeasureWithUnit): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceWithMaximumTolerance: declare class StepDimTol_GeometricToleranceWithMaximumTolerance extends StepDimTol_GeometricToleranceWithModifiers

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier, theUnitSize: StepBasic_LengthMeasureWithUnit): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  MaximumUpperTolerance(): StepBasic_LengthMeasureWithUnit;

  SetMaximumUpperTolerance(theMaximumUpperTolerance: StepBasic_LengthMeasureWithUnit): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceWithModifiers: declare class StepDimTol_GeometricToleranceWithModifiers extends StepDimTol_GeometricTolerance

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  Modifiers(): NCollection_HArray1_StepDimTol_GeometricToleranceModifier;

  SetModifiers(theModifiers: NCollection_HArray1_StepDimTol_GeometricToleranceModifier): void;

  NbModifiers(): number;

  ModifierValue(theNum: number): StepDimTol_GeometricToleranceModifier;

  SetModifierValue(theNum: number, theItem: StepDimTol_GeometricToleranceModifier): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_LimitCondition: typeof StepDimTol_LimitCondition[keyof typeof StepDimTol_LimitCondition]

StepDimTol_LineProfileTolerance: declare class StepDimTol_LineProfileTolerance extends StepDimTol_GeometricTolerance

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
