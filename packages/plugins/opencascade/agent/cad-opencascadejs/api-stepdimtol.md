# libcascade — StepDimTol

22 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity AngularityTolerance
StepDimTol_AngularityTolerance: declare class StepDimTol_AngularityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepDimTol_AreaUnitType: typeof StepDimTol_AreaUnitType[keyof typeof StepDimTol_AreaUnitType]

// Representation of STEP entity CircularRunoutTolerance
StepDimTol_CircularRunoutTolerance: declare class StepDimTol_CircularRunoutTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CoaxialityTolerance
StepDimTol_CoaxialityTolerance: declare class StepDimTol_CoaxialityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CommonDatum
StepDimTol_CommonDatum: declare class StepDimTol_CommonDatum extends StepRepr_CompositeShapeAspect

constructor

// Initialize all fields (own and inherited)
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theDatum_Name: TCollection_HAsciiString, theDatum_Description: TCollection_HAsciiString, theDatum_OfShape: StepRepr_ProductDefinitionShape, theDatum_ProductDefinitional: StepData_Logical, theDatum_Identification: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theDatum_Name: TCollection_HAsciiString, theDatum_Description: TCollection_HAsciiString, theDatum_OfShape: StepRepr_ProductDefinitionShape, theDatum_ProductDefinitional: StepData_Logical, theDatum_Identification: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

// Returns data for supertype Datum
Datum(): StepDimTol_Datum;

// Set data for supertype Datum
SetDatum(theDatum: StepDimTol_Datum): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ConcentricityTolerance
StepDimTol_ConcentricityTolerance: declare class StepDimTol_ConcentricityTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CylindricityTolerance
StepDimTol_CylindricityTolerance: declare class StepDimTol_CylindricityTolerance extends StepDimTol_GeometricTolerance

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity Datum
StepDimTol_Datum: declare class StepDimTol_Datum extends StepRepr_ShapeAspect

constructor

// Initialize all fields (own and inherited)
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theIdentification: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theIdentification: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

// Returns field Identification
Identification(): TCollection_HAsciiString;

// Set field Identification
SetIdentification(theIdentification: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DatumFeature
StepDimTol_DatumFeature: declare class StepDimTol_DatumFeature extends StepRepr_ShapeAspect

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumOrCommonDatum: declare class StepDimTol_DatumOrCommonDatum extends StepData_SelectType

constructor

// Recognizes a DatumOrCommonDatum Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Datum (Null if another type)
Datum(): StepDimTol_Datum;

// returns Value as a CommonDatumList (Null if another type)
CommonDatumList(): NCollection_HArray1_handle_StepDimTol_DatumReferenceElement;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DatumReference
StepDimTol_DatumReference: declare class StepDimTol_DatumReference extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(thePrecedence: number, theReferencedDatum: StepDimTol_Datum): void;

// Returns field Precedence
Precedence(): number;

// Set field Precedence
SetPrecedence(thePrecedence: number): void;

// Returns field ReferencedDatum
ReferencedDatum(): StepDimTol_Datum;

// Set field ReferencedDatum
SetReferencedDatum(theReferencedDatum: StepDimTol_Datum): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DatumReferenceCompartment
StepDimTol_DatumReferenceCompartment: declare class StepDimTol_DatumReferenceCompartment extends StepDimTol_GeneralDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DatumReferenceElement
StepDimTol_DatumReferenceElement: declare class StepDimTol_DatumReferenceElement extends StepDimTol_GeneralDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumReferenceModifier: declare class StepDimTol_DatumReferenceModifier extends StepData_SelectType

constructor

// Recognizes a DatumReferenceModifier Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a DatumReferenceModifierWithValue (Null if another type)
DatumReferenceModifierWithValue(): StepDimTol_DatumReferenceModifierWithValue;

// returns Value as a SimpleDatumReferenceModifierMember (Null if another type)
SimpleDatumReferenceModifierMember(): StepDimTol_SimpleDatumReferenceModifierMember;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumReferenceModifierType: typeof StepDimTol_DatumReferenceModifierType[keyof typeof StepDimTol_DatumReferenceModifierType]

// Representation of STEP entity DatumReferenceModifierWithValue
StepDimTol_DatumReferenceModifierWithValue: declare class StepDimTol_DatumReferenceModifierWithValue extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(theModifierType: StepDimTol_DatumReferenceModifierType, theModifierValue: StepBasic_LengthMeasureWithUnit): void;

// Returns field ModifierType
ModifierType(): StepDimTol_DatumReferenceModifierType;

// Set field ModifierType
SetModifierType(theModifierType: StepDimTol_DatumReferenceModifierType): void;

// Returns field ModifierValue
ModifierValue(): StepBasic_LengthMeasureWithUnit;

// Set field ModifierValue
SetModifierValue(theModifierValue: StepBasic_LengthMeasureWithUnit): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DatumSystem
StepDimTol_DatumSystem: declare class StepDimTol_DatumSystem extends StepRepr_ShapeAspect

constructor

// Initialize all fields (own and inherited)
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theConstituents: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theConstituents: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

// Returns field Constituents
Constituents(): NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment;

// Set field Constituents
SetConstituents(theConstituents: NCollection_HArray1_handle_StepDimTol_DatumReferenceCompartment): void;

// Returns number of Constituents
NbConstituents(): number;

// Returns Constituents with the given number
ConstituentsValue(num: number): StepDimTol_DatumReferenceCompartment;
ConstituentsValue(num: number, theItem: StepDimTol_DatumReferenceCompartment): void;
ConstituentsValue(num: number): StepDimTol_DatumReferenceCompartment;
ConstituentsValue(num: number, theItem: StepDimTol_DatumReferenceCompartment): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepDimTol_DatumSystemOrReference: declare class StepDimTol_DatumSystemOrReference extends StepData_SelectType

constructor

// Recognizes a DatumSystemOrReference Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a DatumSystem (Null if another type)
DatumSystem(): StepDimTol_DatumSystem;

// returns Value as a DatumReference (Null if another type)
DatumReference(): StepDimTol_DatumReference;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DatumTarget
StepDimTol_DatumTarget: declare class StepDimTol_DatumTarget extends StepRepr_ShapeAspect

constructor

// Initialize all fields (own and inherited)
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theTargetId: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theShapeAspect_Name: TCollection_HAsciiString, theShapeAspect_Description: TCollection_HAsciiString, theShapeAspect_OfShape: StepRepr_ProductDefinitionShape, theShapeAspect_ProductDefinitional: StepData_Logical, theTargetId: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

// Returns field TargetId
TargetId(): TCollection_HAsciiString;

// Set field TargetId
SetTargetId(theTargetId: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FlatnessTolerance
StepDimTol_FlatnessTolerance: declare class StepDimTol_FlatnessTolerance extends StepDimTol_GeometricTolerance

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GeneralDatumReference
StepDimTol_GeneralDatumReference: declare class StepDimTol_GeneralDatumReference extends StepRepr_ShapeAspect

constructor

// Initialize all fields (own and inherited)
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theBase: StepDimTol_DatumOrCommonDatum, theHasModifiers: boolean, theModifiers: NCollection_HArray1_StepDimTol_DatumReferenceModifier): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theBase: StepDimTol_DatumOrCommonDatum, theHasModifiers: boolean, theModifiers: NCollection_HArray1_StepDimTol_DatumReferenceModifier): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

// Returns field Base
Base(): StepDimTol_DatumOrCommonDatum;

// Set field Base
SetBase(theBase: StepDimTol_DatumOrCommonDatum): void;

// Indicates is field Modifiers exist
HasModifiers(): boolean;

// Returns field Modifiers
Modifiers(): NCollection_HArray1_StepDimTol_DatumReferenceModifier;

// Set field Modifiers
SetModifiers(theModifiers: NCollection_HArray1_StepDimTol_DatumReferenceModifier): void;

// Returns number of Modifiers
NbModifiers(): number;

// Returns Modifiers with the given number
ModifiersValue(theNum: number): StepDimTol_DatumReferenceModifier;
ModifiersValue(theNum: number, theItem: StepDimTol_DatumReferenceModifier): void;
ModifiersValue(theNum: number): StepDimTol_DatumReferenceModifier;
ModifiersValue(theNum: number, theItem: StepDimTol_DatumReferenceModifier): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepDimTol_GeoTolAndGeoTolWthDatRef: declare class StepDimTol_GeoTolAndGeoTolWthDatRef extends StepDimTol_GeometricTolerance

constructor

// Initialize all fields (own and inherited) AP214
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
