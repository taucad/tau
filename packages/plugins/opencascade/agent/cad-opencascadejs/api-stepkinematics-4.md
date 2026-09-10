# libcascade — StepKinematics (4)

6 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity PlanarCurvePair
StepKinematics_PlanarCurvePair: declare class StepKinematics_PlanarCurvePair extends StepKinematics_HighOrderKinematicPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Curve1
Curve1(): StepGeom_Curve;

// Sets field Curve1
SetCurve1(theCurve1: StepGeom_Curve): void;

// Returns field Curve2
Curve2(): StepGeom_Curve;

// Sets field Curve2
SetCurve2(theCurve2: StepGeom_Curve): void;

// Returns field Orientation
Orientation(): boolean;

// Sets field Orientation
SetOrientation(theOrientation: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PlanarCurvePairRange
StepKinematics_PlanarCurvePairRange: declare class StepKinematics_PlanarCurvePairRange extends StepKinematics_PlanarCurvePair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePlanarCurvePair_Curve1: StepGeom_Curve, thePlanarCurvePair_Curve2: StepGeom_Curve, thePlanarCurvePair_Orientation: boolean, theRangeOnCurve1: StepGeom_TrimmedCurve, theRangeOnCurve2: StepGeom_TrimmedCurve): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePlanarCurvePair_Curve1: StepGeom_Curve, thePlanarCurvePair_Curve2: StepGeom_Curve, thePlanarCurvePair_Orientation: boolean, theRangeOnCurve1: StepGeom_TrimmedCurve, theRangeOnCurve2: StepGeom_TrimmedCurve): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePlanarCurvePair_Curve1: StepGeom_Curve, thePlanarCurvePair_Curve2: StepGeom_Curve, thePlanarCurvePair_Orientation: boolean, theRangeOnCurve1: StepGeom_TrimmedCurve, theRangeOnCurve2: StepGeom_TrimmedCurve): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePlanarCurvePair_Curve1: StepGeom_Curve, thePlanarCurvePair_Curve2: StepGeom_Curve, thePlanarCurvePair_Orientation: boolean, theRangeOnCurve1: StepGeom_TrimmedCurve, theRangeOnCurve2: StepGeom_TrimmedCurve): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field RangeOnCurve1
RangeOnCurve1(): StepGeom_TrimmedCurve;

// Sets field RangeOnCurve1
SetRangeOnCurve1(theRangeOnCurve1: StepGeom_TrimmedCurve): void;

// Returns field RangeOnCurve2
RangeOnCurve2(): StepGeom_TrimmedCurve;

// Sets field RangeOnCurve2
SetRangeOnCurve2(theRangeOnCurve2: StepGeom_TrimmedCurve): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PlanarPair
StepKinematics_PlanarPair: declare class StepKinematics_PlanarPair extends StepKinematics_LowOrderKinematicPair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PlanarPairValue
StepKinematics_PlanarPairValue: declare class StepKinematics_PlanarPairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number, theActualTranslationX: number, theActualTranslationY: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number, theActualTranslationX: number, theActualTranslationY: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number, theActualTranslationX: number, theActualTranslationY: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ActualRotation
ActualRotation(): number;

// Sets field ActualRotation
SetActualRotation(theActualRotation: number): void;

// Returns field ActualTranslationX
ActualTranslationX(): number;

// Sets field ActualTranslationX
SetActualTranslationX(theActualTranslationX: number): void;

// Returns field ActualTranslationY
ActualTranslationY(): number;

// Sets field ActualTranslationY
SetActualTranslationY(theActualTranslationY: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PlanarPairWithRange
StepKinematics_PlanarPairWithRange: declare class StepKinematics_PlanarPairWithRange extends StepKinematics_PlanarPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field LowerLimitActualRotation
LowerLimitActualRotation(): number;

// Sets field LowerLimitActualRotation
SetLowerLimitActualRotation(theLowerLimitActualRotation: number): void;

// Returns True if optional field LowerLimitActualRotation is defined
HasLowerLimitActualRotation(): boolean;

// Returns field UpperLimitActualRotation
UpperLimitActualRotation(): number;

// Sets field UpperLimitActualRotation
SetUpperLimitActualRotation(theUpperLimitActualRotation: number): void;

// Returns True if optional field UpperLimitActualRotation is defined
HasUpperLimitActualRotation(): boolean;

// Returns field LowerLimitActualTranslationX
LowerLimitActualTranslationX(): number;

// Sets field LowerLimitActualTranslationX
SetLowerLimitActualTranslationX(theLowerLimitActualTranslationX: number): void;

// Returns True if optional field LowerLimitActualTranslationX is defined
HasLowerLimitActualTranslationX(): boolean;

// Returns field UpperLimitActualTranslationX
UpperLimitActualTranslationX(): number;

// Sets field UpperLimitActualTranslationX
SetUpperLimitActualTranslationX(theUpperLimitActualTranslationX: number): void;

// Returns True if optional field UpperLimitActualTranslationX is defined
HasUpperLimitActualTranslationX(): boolean;

// Returns field LowerLimitActualTranslationY
LowerLimitActualTranslationY(): number;

// Sets field LowerLimitActualTranslationY
SetLowerLimitActualTranslationY(theLowerLimitActualTranslationY: number): void;

// Returns True if optional field LowerLimitActualTranslationY is defined
HasLowerLimitActualTranslationY(): boolean;

// Returns field UpperLimitActualTranslationY
UpperLimitActualTranslationY(): number;

// Sets field UpperLimitActualTranslationY
SetUpperLimitActualTranslationY(theUpperLimitActualTranslationY: number): void;

// Returns True if optional field UpperLimitActualTranslationY is defined
HasUpperLimitActualTranslationY(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PointOnPlanarCurvePair
StepKinematics_PointOnPlanarCurvePair: declare class StepKinematics_PointOnPlanarCurvePair extends StepKinematics_HighOrderKinematicPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field PairCurve
PairCurve(): StepGeom_Curve;

// Sets field PairCurve
SetPairCurve(thePairCurve: StepGeom_Curve): void;

// Returns field Orientation
Orientation(): boolean;

// Sets field Orientation
SetOrientation(theOrientation: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
