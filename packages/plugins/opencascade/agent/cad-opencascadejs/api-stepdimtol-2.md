# libcascade — StepDimTol (2)

4 top-level symbols. Signatures are verbatim typescript.

StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod: declare class StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod extends StepDimTol_GeometricTolerance

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  SetGeometricToleranceWithDatumReference(theGTWDR: StepDimTol_GeometricToleranceWithDatumReference): void;

  GetGeometricToleranceWithDatumReference(): StepDimTol_GeometricToleranceWithDatumReference;

  SetGeometricToleranceWithModifiers(theGTWM: StepDimTol_GeometricToleranceWithModifiers): void;

  GetGeometricToleranceWithModifiers(): StepDimTol_GeometricToleranceWithModifiers;

  SetGeometricToleranceType(theType: StepDimTol_GeometricToleranceType): void;

  GetToleranceType(): StepDimTol_GeometricToleranceType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol: declare class StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol extends StepDimTol_GeometricTolerance

  constructor

  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepRepr_ShapeAspect, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepRepr_ShapeAspect, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepRepr_ShapeAspect, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepRepr_ShapeAspect, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  SetGeometricToleranceWithDatumReference(aGTWDR: StepDimTol_GeometricToleranceWithDatumReference): void;

  GetGeometricToleranceWithDatumReference(): StepDimTol_GeometricToleranceWithDatumReference;

  SetModifiedGeometricTolerance(aMGT: StepDimTol_ModifiedGeometricTolerance): void;

  GetModifiedGeometricTolerance(): StepDimTol_ModifiedGeometricTolerance;

  SetPositionTolerance(aPT: StepDimTol_PositionTolerance): void;

  GetPositionTolerance(): StepDimTol_PositionTolerance;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol: declare class StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol extends StepDimTol_GeoTolAndGeoTolWthDatRef

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  SetUnequallyDisposedGeometricTolerance(theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;

  GetUnequallyDisposedGeometricTolerance(): StepDimTol_UnequallyDisposedGeometricTolerance;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthMaxTol: declare class StepDimTol_GeoTolAndGeoTolWthMaxTol extends StepDimTol_GeoTolAndGeoTolWthMod

  constructor

  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  SetMaxTolerance(theMaxTol: StepBasic_LengthMeasureWithUnit): void;

  GetMaxTolerance(): StepBasic_LengthMeasureWithUnit;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
