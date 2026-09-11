# libcascade — StepDimTol

23 top-level symbols. Signatures are verbatim typescript.

StepDimTol_AngularityTolerance: declare class StepDimTol_AngularityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_AreaUnitType: typeof StepDimTol_AreaUnitType[keyof typeof StepDimTol_AreaUnitType]

StepDimTol_CircularRunoutTolerance: declare class StepDimTol_CircularRunoutTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_CoaxialityTolerance: declare class StepDimTol_CoaxialityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_CommonDatum: declare class StepDimTol_CommonDatum extends StepRepr_CompositeShapeAspect

constructor

Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theDatum_Name: TCollection_HAsciiString, theDatum_Description: TCollection_HAsciiString, theDatum_OfShape: StepRepr_ProductDefinitionShape, theDatum_ProductDefinitional: StepData_Logical, theDatum_Identification: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theDatum_Name: TCollection_HAsciiString, theDatum_Description: TCollection_HAsciiString, theDatum_OfShape: StepRepr_ProductDefinitionShape, theDatum_ProductDefinitional: StepData_Logical, theDatum_Identification: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

Datum(): StepDimTol_Datum;

SetDatum(theDatum: StepDimTol_Datum): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_ConcentricityTolerance: declare class StepDimTol_ConcentricityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_CylindricityTolerance: declare class StepDimTol_CylindricityTolerance extends StepDimTol_GeometricTolerance

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_Datum: declare class StepDimTol_Datum extends StepRepr_ShapeAspect

constructor

Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theIdentification: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theIdentification: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

Identification(): TCollection_HAsciiString;

SetIdentification(theIdentification: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumFeature: declare class StepDimTol_DatumFeature extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumOrCommonDatum: declare class StepDimTol_DatumOrCommonDatum extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

Datum(): StepDimTol_Datum;

CommonDatumList(): NCollection_HArray1_handle_StepDimTol_DatumReferenceElement;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumReference: declare class StepDimTol_DatumReference extends Standard_Transient

constructor

Init(thePrecedence: number, theReferencedDatum: StepDimTol_Datum): void;

Precedence(): number;

SetPrecedence(thePrecedence: number): void;

ReferencedDatum(): StepDimTol_Datum;

SetReferencedDatum(theReferencedDatum: StepDimTol_Datum): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumReferenceCompartment: declare class StepDimTol_DatumReferenceCompartment extends StepDimTol_GeneralDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumReferenceElement: declare class StepDimTol_DatumReferenceElement extends StepDimTol_GeneralDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumReferenceModifier: declare class StepDimTol_DatumReferenceModifier extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

DatumReferenceModifierWithValue(): StepDimTol_DatumReferenceModifierWithValue;

SimpleDatumReferenceModifierMember(): StepDimTol_SimpleDatumReferenceModifierMember;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumReferenceModifierType: typeof StepDimTol_DatumReferenceModifierType[keyof typeof StepDimTol_DatumReferenceModifierType]

StepDimTol_DatumReferenceModifierWithValue: declare class StepDimTol_DatumReferenceModifierWithValue extends Standard_Transient

constructor

Init(theModifierType: StepDimTol_DatumReferenceModifierType, theModifierValue: StepBasic_LengthMeasureWithUnit): void;

ModifierType(): StepDimTol_DatumReferenceModifierType;

SetModifierType(theModifierType: StepDimTol_DatumReferenceModifierType): void;

ModifierValue(): StepBasic_LengthMeasureWithUnit;

SetModifierValue(theModifierValue: StepBasic_LengthMeasureWithUnit): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumSystem: declare class StepDimTol_DatumSystem extends StepRepr_ShapeAspect

constructor

Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theConstituents: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theConstituents: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

Constituents(): NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment;

SetConstituents(theConstituents: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment): void;

NbConstituents(): number;

ConstituentsValue(num: number): StepDimTol_DatumReferenceCompartment;
ConstituentsValue(num: number, theItem: StepDimTol_DatumReferenceCompartment): void;
ConstituentsValue(num: number): StepDimTol_DatumReferenceCompartment;
ConstituentsValue(num: number, theItem: StepDimTol_DatumReferenceCompartment): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumSystemOrReference: declare class StepDimTol_DatumSystemOrReference extends StepData_SelectType

constructor

CaseNum(ent: Standard_Transient): number;

DatumSystem(): StepDimTol_DatumSystem;

DatumReference(): StepDimTol_DatumReference;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumTarget: declare class StepDimTol_DatumTarget extends StepRepr_ShapeAspect

constructor

Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theTargetId: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theTargetId: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

TargetId(): TCollection_HAsciiString;

SetTargetId(theTargetId: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_FlatnessTolerance: declare class StepDimTol_FlatnessTolerance extends StepDimTol_GeometricTolerance

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_GeneralDatumReference: declare class StepDimTol_GeneralDatumReference extends StepRepr_ShapeAspect

constructor

Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theBase: StepDimTol_DatumOrCommonDatum, theHasModifiers: boolean, theModifiers: NCollection_HArray1_StepDimTol_DatumReferenceModifier): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theBase: StepDimTol_DatumOrCommonDatum, theHasModifiers: boolean, theModifiers: NCollection_HArray1_StepDimTol_DatumReferenceModifier): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

Base(): StepDimTol_DatumOrCommonDatum;

SetBase(theBase: StepDimTol_DatumOrCommonDatum): void;

HasModifiers(): boolean;

Modifiers(): NCollection_HArray1_StepDimTol_DatumReferenceModifier;

SetModifiers(theModifiers: NCollection_HArray1_StepDimTol_DatumReferenceModifier): void;

NbModifiers(): number;

ModifiersValue(theNum: number): StepDimTol_DatumReferenceModifier;
ModifiersValue(theNum: number, theItem: StepDimTol_DatumReferenceModifier): void;
ModifiersValue(theNum: number): StepDimTol_DatumReferenceModifier;
ModifiersValue(theNum: number, theItem: StepDimTol_DatumReferenceModifier): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRef: declare class StepDimTol_GeoTolAndGeoTolWthDatRef extends StepDimTol_GeometricTolerance

constructor

Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

SetGeometricToleranceWithDatumReference(theGTWDR: StepDimTol_GeometricToleranceWithDatumReference): void;

GetGeometricToleranceWithDatumReference(): StepDimTol_GeometricToleranceWithDatumReference;

SetGeometricToleranceType(theType: StepDimTol_GeometricToleranceType): void;

GetToleranceType(): StepDimTol_GeometricToleranceType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol: declare class StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMaxTol extends StepDimTol_GeoTolAndGeoTolWthDatRefAndGeoTolWthMod

constructor

Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theMaxTol: StepBasic_LengthMeasureWithUnit, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect, theGTWDR: StepDimTol_GeometricToleranceWithDatumReference, theGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aMagnitude: Standard_Transient, aTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, aGTWDR: StepDimTol_GeometricToleranceWithDatumReference, aGTWM: StepDimTol_GeometricToleranceWithModifiers, theType: StepDimTol_GeometricToleranceType): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

SetMaxTolerance(theMaxTol: StepBasic_LengthMeasureWithUnit): void;

GetMaxTolerance(): StepBasic_LengthMeasureWithUnit;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
