# libcascade — StepDimTol (5)

24 top-level symbols. Signatures are verbatim typescript.

// Defines SimpleDatumReferenceModifier as unique member of DatumReferenceModifier Works with an EnumTool
StepDimTol_SimpleDatumReferenceModifierMember: declare class StepDimTol_SimpleDatumReferenceModifierMember extends StepData_SelectInt

constructor

// Tells if a SelectMember has a name
HasName(): boolean;

// Returns the name of a SelectMember
Name(): string;

// Sets the name of a SelectMember, returns True if done, False if no name is allowed Default does nothing and returns False
SetName(name: string): boolean;

Kind(): number;

EnumText(): string;

SetEnumText(val: number, text: string): void;

SetValue(theValue: StepDimTol_SimpleDatumReferenceModifier): void;

Value(): StepDimTol_SimpleDatumReferenceModifier;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity StraightnessTolerance
StepDimTol_StraightnessTolerance: declare class StepDimTol_StraightnessTolerance extends StepDimTol_GeometricTolerance

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceProfileTolerance
StepDimTol_SurfaceProfileTolerance: declare class StepDimTol_SurfaceProfileTolerance extends StepDimTol_GeometricTolerance

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SymmetryTolerance
StepDimTol_SymmetryTolerance: declare class StepDimTol_SymmetryTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ToleranceZone
StepDimTol_ToleranceZone: declare class StepDimTol_ToleranceZone extends StepRepr_ShapeAspect

constructor

// Initialize all fields (own and inherited)
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theDefiningTolerance: NCollection_HArray1_StepDimTol_ToleranceZoneTarget, theForm: StepDimTol_ToleranceZoneForm): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theOfShape: StepRepr_ProductDefinitionShape, theProductDefinitional: StepData_Logical, theDefiningTolerance: NCollection_HArray1_StepDimTol_ToleranceZoneTarget, theForm: StepDimTol_ToleranceZoneForm): void;
Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aOfShape: StepRepr_ProductDefinitionShape, aProductDefinitional: StepData_Logical): void;

// Returns field DefiningTolerance
DefiningTolerance(): NCollection_HArray1_StepDimTol_ToleranceZoneTarget;

// Set field DefiningTolerance
SetDefiningTolerance(theDefiningTolerance: NCollection_HArray1_StepDimTol_ToleranceZoneTarget): void;

// Returns number of Defining Tolerances
NbDefiningTolerances(): number;

// Returns Defining Tolerance with the given number
DefiningToleranceValue(theNum: number): StepDimTol_ToleranceZoneTarget;

// Sets Defining Tolerance with given number
SetDefiningToleranceValue(theNum: number, theItem: StepDimTol_ToleranceZoneTarget): void;

// Returns field Form
Form(): StepDimTol_ToleranceZoneForm;

// Set field Form
SetForm(theForm: StepDimTol_ToleranceZoneForm): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ToleranceZoneDefinition
StepDimTol_ToleranceZoneDefinition: declare class StepDimTol_ToleranceZoneDefinition extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(theZone: StepDimTol_ToleranceZone, theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

// Returns field Boundaries
Boundaries(): NCollection_HArray1_handle_StepRepr_ShapeAspect;

// Set field Boundaries
SetBoundaries(theBoundaries: NCollection_HArray1_handle_StepRepr_ShapeAspect): void;

// Returns number of Boundaries
NbBoundaries(): number;

// Returns Boundaries with the given number
BoundariesValue(theNum: number): StepRepr_ShapeAspect;

// Sets Boundaries with given number
SetBoundariesValue(theNum: number, theItem: StepRepr_ShapeAspect): void;

// Returns field Zone
Zone(): StepDimTol_ToleranceZone;

// Set field Zone
SetZone(theZone: StepDimTol_ToleranceZone): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added for Dimensional Tolerances
StepDimTol_ToleranceZoneForm: declare class StepDimTol_ToleranceZoneForm extends Standard_Transient

constructor

// Init all field own and inherited
Init(theName: TCollection_HAsciiString): void;

// Returns field Name
Name(): TCollection_HAsciiString;

// Set field Name
SetName(theName: TCollection_HAsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepDimTol_ToleranceZoneTarget: declare class StepDimTol_ToleranceZoneTarget extends StepData_SelectType

constructor

// Recognizes a ToleranceZoneTarget Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a DimensionalLocation (Null if another type)
DimensionalLocation(): StepShape_DimensionalLocation;

// returns Value as a DimensionalSize (Null if another type)
DimensionalSize(): StepShape_DimensionalSize;

// returns Value as a GeometricTolerance (Null if another type)
GeometricTolerance(): StepDimTol_GeometricTolerance;

// returns Value as a GeneralDatumReference (Null if another type)
GeneralDatumReference(): StepDimTol_GeneralDatumReference;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TotalRunoutTolerance
StepDimTol_TotalRunoutTolerance: declare class StepDimTol_TotalRunoutTolerance extends StepDimTol_GeometricToleranceWithDatumReference

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity UnequallyDisposedGeometricTolerance
StepDimTol_UnequallyDisposedGeometricTolerance: declare class StepDimTol_UnequallyDisposedGeometricTolerance extends StepDimTol_GeometricTolerance

constructor

// Initialize all fields (own and inherited)
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDisplacement: StepBasic_LengthMeasureWithUnit): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDisplacement: StepBasic_LengthMeasureWithUnit): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget, theDisplacement: StepBasic_LengthMeasureWithUnit): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepRepr_ShapeAspect): void;
Init(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theMagnitude: Standard_Transient, theTolerancedShapeAspect: StepDimTol_GeometricToleranceTarget): void;

// Returns field Displacement
Displacement(): StepBasic_LengthMeasureWithUnit;

// Set field Displacement
SetDisplacement(theDisplacement: StepBasic_LengthMeasureWithUnit): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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
