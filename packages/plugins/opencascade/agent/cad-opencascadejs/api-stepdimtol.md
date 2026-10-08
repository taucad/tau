# libcascade — StepDimTol

32 top-level symbols. Signatures are verbatim typescript.

StepDimTol_AngularityTolerance: declare class StepDimTol_AngularityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  // StepDimTol_AngularityTolerance.constructor (constructor)
  constructor();

  // StepDimTol_AngularityTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_AngularityTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_AngularityTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_AngularityTolerance.delete (method)
  delete(): void;

  // StepDimTol_AngularityTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_AreaUnitType: typeof StepDimTol_AreaUnitType[keyof typeof StepDimTol_AreaUnitType]

  readonly StepDimTol_Circular: 'StepDimTol_Circular'

  readonly StepDimTol_Rectangular: 'StepDimTol_Rectangular'

  readonly StepDimTol_Square: 'StepDimTol_Square'

StepDimTol_CircularRunoutTolerance: declare class StepDimTol_CircularRunoutTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  // StepDimTol_CircularRunoutTolerance.constructor (constructor)
  constructor();

  // StepDimTol_CircularRunoutTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_CircularRunoutTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_CircularRunoutTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_CircularRunoutTolerance.delete (method)
  delete(): void;

  // StepDimTol_CircularRunoutTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_CoaxialityTolerance: declare class StepDimTol_CoaxialityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  // StepDimTol_CoaxialityTolerance.constructor (constructor)
  constructor();

  // StepDimTol_CoaxialityTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_CoaxialityTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_CoaxialityTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_CoaxialityTolerance.delete (method)
  delete(): void;

  // StepDimTol_CoaxialityTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_CommonDatum: declare class StepDimTol_CommonDatum extends StepRepr_CompositeShapeAspect

  // StepDimTol_CommonDatum.constructor (constructor)
  constructor();

  // StepDimTol_CommonDatum.Init (method)
  Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theDatum_Name: TCollection_HAsciiString, theDatum_Description: TCollection_HAsciiString, theDatum_OfShape: StepRepr_ProductDefinitionShape, theDatum_ProductDefinitional: StepData_Logical, theDatum_Identification: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  // StepDimTol_CommonDatum.Datum (method)
  Datum(): StepDimTol_Datum;

  // StepDimTol_CommonDatum.SetDatum (method)
  SetDatum(theDatum: StepDimTol_Datum): void;

  // StepDimTol_CommonDatum.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_CommonDatum.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_CommonDatum.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_CommonDatum.delete (method)
  delete(): void;

  // StepDimTol_CommonDatum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_ConcentricityTolerance: declare class StepDimTol_ConcentricityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

  // StepDimTol_ConcentricityTolerance.constructor (constructor)
  constructor();

  // StepDimTol_ConcentricityTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_ConcentricityTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_ConcentricityTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_ConcentricityTolerance.delete (method)
  delete(): void;

  // StepDimTol_ConcentricityTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_CylindricityTolerance: declare class StepDimTol_CylindricityTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_CylindricityTolerance.constructor (constructor)
  constructor();

  // StepDimTol_CylindricityTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_CylindricityTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_CylindricityTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_CylindricityTolerance.delete (method)
  delete(): void;

  // StepDimTol_CylindricityTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_Datum: declare class StepDimTol_Datum extends StepRepr_ShapeAspect

  // StepDimTol_Datum.constructor (constructor)
  constructor();

  // StepDimTol_Datum.Init (method)
  Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theIdentification: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  // StepDimTol_Datum.Identification (method)
  Identification(): TCollection_HAsciiString;

  // StepDimTol_Datum.SetIdentification (method)
  SetIdentification(theIdentification: TCollection_HAsciiString): void;

  // StepDimTol_Datum.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_Datum.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_Datum.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_Datum.delete (method)
  delete(): void;

  // StepDimTol_Datum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumFeature: declare class StepDimTol_DatumFeature extends StepRepr_ShapeAspect

  // StepDimTol_DatumFeature.constructor (constructor)
  constructor();

  // StepDimTol_DatumFeature.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_DatumFeature.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_DatumFeature.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_DatumFeature.delete (method)
  delete(): void;

  // StepDimTol_DatumFeature.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumOrCommonDatum: declare class StepDimTol_DatumOrCommonDatum extends StepData_SelectType

  // StepDimTol_DatumOrCommonDatum.constructor (constructor)
  constructor();

  // StepDimTol_DatumOrCommonDatum.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepDimTol_DatumOrCommonDatum.Datum (method)
  Datum(): StepDimTol_Datum;

  // StepDimTol_DatumOrCommonDatum.CommonDatumList (method)
  CommonDatumList(): NCollection_HArray1_handle_StepDimTol_DatumReferenceElement;

  // StepDimTol_DatumOrCommonDatum.delete (method)
  delete(): void;

  // StepDimTol_DatumOrCommonDatum.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumReference: declare class StepDimTol_DatumReference extends Standard_Transient

  // StepDimTol_DatumReference.constructor (constructor)
  constructor();

  // StepDimTol_DatumReference.Init (method)
  Init(thePrecedence: number, theReferencedDatum: StepDimTol_Datum): void;

  // StepDimTol_DatumReference.Precedence (method)
  Precedence(): number;

  // StepDimTol_DatumReference.SetPrecedence (method)
  SetPrecedence(thePrecedence: number): void;

  // StepDimTol_DatumReference.ReferencedDatum (method)
  ReferencedDatum(): StepDimTol_Datum;

  // StepDimTol_DatumReference.SetReferencedDatum (method)
  SetReferencedDatum(theReferencedDatum: StepDimTol_Datum): void;

  // StepDimTol_DatumReference.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_DatumReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_DatumReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_DatumReference.delete (method)
  delete(): void;

  // StepDimTol_DatumReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumReferenceCompartment: declare class StepDimTol_DatumReferenceCompartment extends StepDimTol_GeneralDatumReference

  // StepDimTol_DatumReferenceCompartment.constructor (constructor)
  constructor();

  // StepDimTol_DatumReferenceCompartment.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_DatumReferenceCompartment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_DatumReferenceCompartment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_DatumReferenceCompartment.delete (method)
  delete(): void;

  // StepDimTol_DatumReferenceCompartment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumReferenceElement: declare class StepDimTol_DatumReferenceElement extends StepDimTol_GeneralDatumReference

  // StepDimTol_DatumReferenceElement.constructor (constructor)
  constructor();

  // StepDimTol_DatumReferenceElement.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_DatumReferenceElement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_DatumReferenceElement.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_DatumReferenceElement.delete (method)
  delete(): void;

  // StepDimTol_DatumReferenceElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumReferenceModifier: declare class StepDimTol_DatumReferenceModifier extends StepData_SelectType

  // StepDimTol_DatumReferenceModifier.constructor (constructor)
  constructor();

  // StepDimTol_DatumReferenceModifier.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepDimTol_DatumReferenceModifier.DatumReferenceModifierWithValue (method)
  DatumReferenceModifierWithValue(): StepDimTol_DatumReferenceModifierWithValue;

  // StepDimTol_DatumReferenceModifier.SimpleDatumReferenceModifierMember (method)
  SimpleDatumReferenceModifierMember(): StepDimTol_SimpleDatumReferenceModifierMember;

  // StepDimTol_DatumReferenceModifier.delete (method)
  delete(): void;

  // StepDimTol_DatumReferenceModifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumReferenceModifierType: typeof StepDimTol_DatumReferenceModifierType[keyof typeof StepDimTol_DatumReferenceModifierType]

  readonly StepDimTol_CircularOrCylindrical: 'StepDimTol_CircularOrCylindrical'

  readonly StepDimTol_Distance: 'StepDimTol_Distance'

  readonly StepDimTol_Projected: 'StepDimTol_Projected'

  readonly StepDimTol_Spherical: 'StepDimTol_Spherical'

StepDimTol_DatumReferenceModifierWithValue: declare class StepDimTol_DatumReferenceModifierWithValue extends Standard_Transient

  // StepDimTol_DatumReferenceModifierWithValue.constructor (constructor)
  constructor();

  // StepDimTol_DatumReferenceModifierWithValue.Init (method)
  Init(theModifierType: StepDimTol_DatumReferenceModifierType, theModifierValue: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_DatumReferenceModifierWithValue.ModifierType (method)
  ModifierType(): StepDimTol_DatumReferenceModifierType;

  // StepDimTol_DatumReferenceModifierWithValue.SetModifierType (method)
  SetModifierType(theModifierType: StepDimTol_DatumReferenceModifierType): void;

  // StepDimTol_DatumReferenceModifierWithValue.ModifierValue (method)
  ModifierValue(): StepBasic_LengthMeasureWithUnit;

  // StepDimTol_DatumReferenceModifierWithValue.SetModifierValue (method)
  SetModifierValue(theModifierValue: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_DatumReferenceModifierWithValue.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_DatumReferenceModifierWithValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_DatumReferenceModifierWithValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_DatumReferenceModifierWithValue.delete (method)
  delete(): void;

  // StepDimTol_DatumReferenceModifierWithValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumSystem: declare class StepDimTol_DatumSystem extends StepRepr_ShapeAspect

  // StepDimTol_DatumSystem.constructor (constructor)
  constructor();

  // StepDimTol_DatumSystem.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theConstituents: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  // StepDimTol_DatumSystem.Constituents (method)
  Constituents(): NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment;

  // StepDimTol_DatumSystem.SetConstituents (method)
  SetConstituents(theConstituents: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment): void;

  // StepDimTol_DatumSystem.NbConstituents (method)
  NbConstituents(): number;

  // StepDimTol_DatumSystem.ConstituentsValue (method)
  ConstituentsValue(num: number): StepDimTol_DatumReferenceCompartment;
  ConstituentsValue(num: number, theItem: StepDimTol_DatumReferenceCompartment): void;

  // StepDimTol_DatumSystem.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_DatumSystem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_DatumSystem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_DatumSystem.delete (method)
  delete(): void;

  // StepDimTol_DatumSystem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumSystemOrReference: declare class StepDimTol_DatumSystemOrReference extends StepData_SelectType

  // StepDimTol_DatumSystemOrReference.constructor (constructor)
  constructor();

  // StepDimTol_DatumSystemOrReference.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepDimTol_DatumSystemOrReference.DatumSystem (method)
  DatumSystem(): StepDimTol_DatumSystem;

  // StepDimTol_DatumSystemOrReference.DatumReference (method)
  DatumReference(): StepDimTol_DatumReference;

  // StepDimTol_DatumSystemOrReference.delete (method)
  delete(): void;

  // StepDimTol_DatumSystemOrReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_DatumTarget: declare class StepDimTol_DatumTarget extends StepRepr_ShapeAspect

  // StepDimTol_DatumTarget.constructor (constructor)
  constructor();

  // StepDimTol_DatumTarget.Init (method)
  Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theTargetId: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  // StepDimTol_DatumTarget.TargetId (method)
  TargetId(): TCollection_HAsciiString;

  // StepDimTol_DatumTarget.SetTargetId (method)
  SetTargetId(theTargetId: TCollection_HAsciiString): void;

  // StepDimTol_DatumTarget.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_DatumTarget.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_DatumTarget.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_DatumTarget.delete (method)
  delete(): void;

  // StepDimTol_DatumTarget.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_FlatnessTolerance: declare class StepDimTol_FlatnessTolerance extends StepDimTol_GeometricTolerance

  // StepDimTol_FlatnessTolerance.constructor (constructor)
  constructor();

  // StepDimTol_FlatnessTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_FlatnessTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_FlatnessTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_FlatnessTolerance.delete (method)
  delete(): void;

  // StepDimTol_FlatnessTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeneralDatumReference: declare class StepDimTol_GeneralDatumReference extends StepRepr_ShapeAspect

  // StepDimTol_GeneralDatumReference.constructor (constructor)
  constructor();

  // StepDimTol_GeneralDatumReference.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theBase: StepDimTol_DatumOrCommonDatum, theHasModifiers: boolean, theModifiers: NCollection_HArray1_StepDimTol_DatumReferenceModifier): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

  // StepDimTol_GeneralDatumReference.Base (method)
  Base(): StepDimTol_DatumOrCommonDatum;

  // StepDimTol_GeneralDatumReference.SetBase (method)
  SetBase(theBase: StepDimTol_DatumOrCommonDatum): void;

  // StepDimTol_GeneralDatumReference.HasModifiers (method)
  HasModifiers(): boolean;

  // StepDimTol_GeneralDatumReference.Modifiers (method)
  Modifiers(): NCollection_HArray1_StepDimTol_DatumReferenceModifier;

  // StepDimTol_GeneralDatumReference.SetModifiers (method)
  SetModifiers(theModifiers: NCollection_HArray1_StepDimTol_DatumReferenceModifier): void;

  // StepDimTol_GeneralDatumReference.NbModifiers (method)
  NbModifiers(): number;

  // StepDimTol_GeneralDatumReference.ModifiersValue (method)
  ModifiersValue(theNum: number): StepDimTol_DatumReferenceModifier;
  ModifiersValue(theNum: number, theItem: StepDimTol_DatumReferenceModifier): void;

  // StepDimTol_GeneralDatumReference.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeneralDatumReference.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeneralDatumReference.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeneralDatumReference.delete (method)
  delete(): void;

  // StepDimTol_GeneralDatumReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRef: declare class StepDimTol_GeoTolAndGeoTolWthDatRef extends StepDimTol_GeometricTolerance

  // StepDimTol_GeoTolAndGeoTolWthDatRef.constructor (constructor)
  constructor();

  // StepDimTol_GeoTolAndGeoTolWthDatRef.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.SetGeometricToleranceWithDatumReference (method)
  SetGeometricToleranceWithDatumReference(theGTWDR: StepDimTol_GeometricToleranceWithDatumReference): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.GetGeometricToleranceWithDatumReference (method)
  GetGeometricToleranceWithDatumReference(): StepDimTol_GeometricToleranceWithDatumReference;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.SetGeometricToleranceType (method)
  SetGeometricToleranceType(theType: StepDimTol_GeometricToleranceType): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.GetToleranceType (method)
  GetToleranceType(): StepDimTol_GeometricToleranceType;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.delete (method)
  delete(): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol: declare class StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol extends StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.constructor (constructor)
  constructor();

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.SetMaxTolerance (method)
  SetMaxTolerance(theMaxTol: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.GetMaxTolerance (method)
  GetMaxTolerance(): StepBasic_LengthMeasureWithUnit;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.delete (method)
  delete(): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod: declare class StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod extends StepDimTol_GeometricTolerance

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.constructor (constructor)
  constructor();

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.SetGeometricToleranceWithDatumReference (method)
  SetGeometricToleranceWithDatumReference(theGTWDR: StepDimTol_GeometricToleranceWithDatumReference): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.GetGeometricToleranceWithDatumReference (method)
  GetGeometricToleranceWithDatumReference(): StepDimTol_GeometricToleranceWithDatumReference;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.SetGeometricToleranceWithModifiers (method)
  SetGeometricToleranceWithModifiers(theGTWM: StepDimTol_GeometricToleranceWithModifiers): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.GetGeometricToleranceWithModifiers (method)
  GetGeometricToleranceWithModifiers(): StepDimTol_GeometricToleranceWithModifiers;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.SetGeometricToleranceType (method)
  SetGeometricToleranceType(theType: StepDimTol_GeometricToleranceType): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.GetToleranceType (method)
  GetToleranceType(): StepDimTol_GeometricToleranceType;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.delete (method)
  delete(): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol: declare class StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol extends StepDimTol_GeometricTolerance

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.constructor (constructor)
  constructor();

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepRepr_ShapeAspect, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aMGT: StepDimTol_ModifiedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.SetGeometricToleranceWithDatumReference (method)
  SetGeometricToleranceWithDatumReference(aGTWDR: StepDimTol_GeometricToleranceWithDatumReference): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.GetGeometricToleranceWithDatumReference (method)
  GetGeometricToleranceWithDatumReference(): StepDimTol_GeometricToleranceWithDatumReference;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.SetModifiedGeometricTolerance (method)
  SetModifiedGeometricTolerance(aMGT: StepDimTol_ModifiedGeometricTolerance): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.GetModifiedGeometricTolerance (method)
  GetModifiedGeometricTolerance(): StepDimTol_ModifiedGeometricTolerance;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.SetPositionTolerance (method)
  SetPositionTolerance(aPT: StepDimTol_PositionTolerance): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.GetPositionTolerance (method)
  GetPositionTolerance(): StepDimTol_PositionTolerance;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.delete (method)
  delete(): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndModGeoTolAndPosTol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol: declare class StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol extends StepDimTol_GeoTolAndGeoTolWthDatRef

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.constructor (constructor)
  constructor();

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType, theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.SetUnequallyDisposedGeometricTolerance (method)
  SetUnequallyDisposedGeometricTolerance(theUDGT: StepDimTol_UnequallyDisposedGeometricTolerance): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.GetUnequallyDisposedGeometricTolerance (method)
  GetUnequallyDisposedGeometricTolerance(): StepDimTol_UnequallyDisposedGeometricTolerance;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.delete (method)
  delete(): void;

  // StepDimTol_GeoTolAndGeoTolWthDatRefAndUneqDisGeoTol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthMaxTol: declare class StepDimTol_GeoTolAndGeoTolWthMaxTol extends StepDimTol_GeoTolAndGeoTolWthMod

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.constructor (constructor)
  constructor();

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.SetMaxTolerance (method)
  SetMaxTolerance(theMaxTol: StepBasic_LengthMeasureWithUnit): void;

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.GetMaxTolerance (method)
  GetMaxTolerance(): StepBasic_LengthMeasureWithUnit;

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.delete (method)
  delete(): void;

  // StepDimTol_GeoTolAndGeoTolWthMaxTol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthMod: declare class StepDimTol_GeoTolAndGeoTolWthMod extends StepDimTol_GeometricTolerance

  // StepDimTol_GeoTolAndGeoTolWthMod.constructor (constructor)
  constructor();

  // StepDimTol_GeoTolAndGeoTolWthMod.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeoTolAndGeoTolWthMod.SetGeometricToleranceWithModifiers (method)
  SetGeometricToleranceWithModifiers(theGTWM: StepDimTol_GeometricToleranceWithModifiers): void;

  // StepDimTol_GeoTolAndGeoTolWthMod.GetGeometricToleranceWithModifiers (method)
  GetGeometricToleranceWithModifiers(): StepDimTol_GeometricToleranceWithModifiers;

  // StepDimTol_GeoTolAndGeoTolWthMod.SetGeometricToleranceType (method)
  SetGeometricToleranceType(theType: StepDimTol_GeometricToleranceType): void;

  // StepDimTol_GeoTolAndGeoTolWthMod.GetToleranceType (method)
  GetToleranceType(): StepDimTol_GeometricToleranceType;

  // StepDimTol_GeoTolAndGeoTolWthMod.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeoTolAndGeoTolWthMod.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthMod.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeoTolAndGeoTolWthMod.delete (method)
  delete(): void;

  // StepDimTol_GeoTolAndGeoTolWthMod.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeometricTolerance: declare class StepDimTol_GeometricTolerance extends Standard_Transient

  // StepDimTol_GeometricTolerance.constructor (constructor)
  constructor();

  // StepDimTol_GeometricTolerance.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeometricTolerance.Name (method)
  Name(): TCollection_HAsciiString;

  // StepDimTol_GeometricTolerance.SetName (method)
  SetName(theName: TCollection_HAsciiString): void;

  // StepDimTol_GeometricTolerance.Description (method)
  Description(): TCollection_HAsciiString;

  // StepDimTol_GeometricTolerance.SetDescription (method)
  SetDescription(theDescription: TCollection_HAsciiString): void;

  // StepDimTol_GeometricTolerance.Magnitude (method)
  Magnitude(): Standard_Transient;

  // StepDimTol_GeometricTolerance.SetMagnitude (method)
  SetMagnitude(theMagnitude: Standard_Transient): void;

  // StepDimTol_GeometricTolerance.TolerancedShapeAspect (method)
  TolerancedShapeAspect(): StepDimTol_GeometricToleranceTarget;

  // StepDimTol_GeometricTolerance.SetTolerancedShapeAspect (method)
  SetTolerancedShapeAspect(theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
  SetTolerancedShapeAspect(theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

  // StepDimTol_GeometricTolerance.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeometricTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeometricTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeometricTolerance.delete (method)
  delete(): void;

  // StepDimTol_GeometricTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceModifier: typeof StepDimTol_GeometricToleranceModifier[keyof typeof StepDimTol_GeometricToleranceModifier]

  readonly StepDimTol_GTMAnyCrossSection: 'StepDimTol_GTMAnyCrossSection'

  readonly StepDimTol_GTMCommonZone: 'StepDimTol_GTMCommonZone'

  readonly StepDimTol_GTMEachRadialElement: 'StepDimTol_GTMEachRadialElement'

  readonly StepDimTol_GTMFreeState: 'StepDimTol_GTMFreeState'

  readonly StepDimTol_GTMLeastMaterialRequirement: 'StepDimTol_GTMLeastMaterialRequirement'

  readonly StepDimTol_GTMLineElement: 'StepDimTol_GTMLineElement'

  readonly StepDimTol_GTMMajorDiameter: 'StepDimTol_GTMMajorDiameter'

  readonly StepDimTol_GTMMaximumMaterialRequirement: 'StepDimTol_GTMMaximumMaterialRequirement'

  readonly StepDimTol_GTMMinorDiameter: 'StepDimTol_GTMMinorDiameter'

  readonly StepDimTol_GTMNotConvex: 'StepDimTol_GTMNotConvex'

  readonly StepDimTol_GTMPitchDiameter: 'StepDimTol_GTMPitchDiameter'

  readonly StepDimTol_GTMReciprocityRequirement: 'StepDimTol_GTMReciprocityRequirement'

  readonly StepDimTol_GTMSeparateRequirement: 'StepDimTol_GTMSeparateRequirement'

  readonly StepDimTol_GTMStatisticalTolerance: 'StepDimTol_GTMStatisticalTolerance'

  readonly StepDimTol_GTMTangentPlane: 'StepDimTol_GTMTangentPlane'

StepDimTol_GeometricToleranceRelationship: declare class StepDimTol_GeometricToleranceRelationship extends Standard_Transient

  // StepDimTol_GeometricToleranceRelationship.constructor (constructor)
  constructor();

  // StepDimTol_GeometricToleranceRelationship.Init (method)
  Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theRelatingGeometricTolerance: StepDimTol_GeometricTolerance, theRelatedGeometricTolerance: StepDimTol_GeometricTolerance): void;

  // StepDimTol_GeometricToleranceRelationship.Name (method)
  Name(): TCollection_HAsciiString;

  // StepDimTol_GeometricToleranceRelationship.SetName (method)
  SetName(theName: TCollection_HAsciiString): void;

  // StepDimTol_GeometricToleranceRelationship.Description (method)
  Description(): TCollection_HAsciiString;

  // StepDimTol_GeometricToleranceRelationship.SetDescription (method)
  SetDescription(theDescription: TCollection_HAsciiString): void;

  // StepDimTol_GeometricToleranceRelationship.RelatingGeometricTolerance (method)
  RelatingGeometricTolerance(): StepDimTol_GeometricTolerance;

  // StepDimTol_GeometricToleranceRelationship.SetRelatingGeometricTolerance (method)
  SetRelatingGeometricTolerance(theRelatingGeometricTolerance: StepDimTol_GeometricTolerance): void;

  // StepDimTol_GeometricToleranceRelationship.RelatedGeometricTolerance (method)
  RelatedGeometricTolerance(): StepDimTol_GeometricTolerance;

  // StepDimTol_GeometricToleranceRelationship.SetRelatedGeometricTolerance (method)
  SetRelatedGeometricTolerance(theRelatedGeometricTolerance: StepDimTol_GeometricTolerance): void;

  // StepDimTol_GeometricToleranceRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepDimTol_GeometricToleranceRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepDimTol_GeometricToleranceRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepDimTol_GeometricToleranceRelationship.delete (method)
  delete(): void;

  // StepDimTol_GeometricToleranceRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepDimTol_GeometricToleranceTarget: declare class StepDimTol_GeometricToleranceTarget extends StepData_SelectType

  // StepDimTol_GeometricToleranceTarget.constructor (constructor)
  constructor();

  // StepDimTol_GeometricToleranceTarget.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepDimTol_GeometricToleranceTarget.DimensionalLocation (method)
  DimensionalLocation(): StepShape_DimensionalLocation;

  // StepDimTol_GeometricToleranceTarget.DimensionalSize (method)
  DimensionalSize(): StepShape_DimensionalSize;

  // StepDimTol_GeometricToleranceTarget.ProductDefinitionShape (method)
  ProductDefinitionShape(): StepRepr_ProductDefinitionShape;

  // StepDimTol_GeometricToleranceTarget.ShapeAspect (method)
  ShapeAspect(): StepRepr_ShapeAspect;

  // StepDimTol_GeometricToleranceTarget.delete (method)
  delete(): void;

  // StepDimTol_GeometricToleranceTarget.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
