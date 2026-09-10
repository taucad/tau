# libcascade — StepKinematics (8)

10 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity SlidingSurfacePair
StepKinematics_SlidingSurfacePair: declare class StepKinematics_SlidingSurfacePair extends StepKinematics_SurfacePair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SlidingSurfacePairValue
StepKinematics_SlidingSurfacePairValue: declare class StepKinematics_SlidingSurfacePairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface1: StepGeom_PointOnSurface, theActualPointOnSurface2: StepGeom_PointOnSurface, theActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface1: StepGeom_PointOnSurface, theActualPointOnSurface2: StepGeom_PointOnSurface, theActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface1: StepGeom_PointOnSurface, theActualPointOnSurface2: StepGeom_PointOnSurface, theActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ActualPointOnSurface1
ActualPointOnSurface1(): StepGeom_PointOnSurface;

// Sets field ActualPointOnSurface1
SetActualPointOnSurface1(theActualPointOnSurface1: StepGeom_PointOnSurface): void;

// Returns field ActualPointOnSurface2
ActualPointOnSurface2(): StepGeom_PointOnSurface;

// Sets field ActualPointOnSurface2
SetActualPointOnSurface2(theActualPointOnSurface2: StepGeom_PointOnSurface): void;

// Returns field ActualRotation
ActualRotation(): number;

// Sets field ActualRotation
SetActualRotation(theActualRotation: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type SpatialRotation
StepKinematics_SpatialRotation: declare class StepKinematics_SpatialRotation extends StepData_SelectType

constructor

// Recognizes a kind of SpatialRotation select type - 1 -> RotationAboutDirection - 2 -> YprRotation
CaseNum(ent: Standard_Transient): number;

// Returns Value as RotationAboutDirection (or Null if another type)
RotationAboutDirection(): StepKinematics_RotationAboutDirection;

// Returns Value as YprRotation (or Null if another type)
YprRotation(): NCollection_HArray1_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SphericalPair
StepKinematics_SphericalPair: declare class StepKinematics_SphericalPair extends StepKinematics_LowOrderKinematicPair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type SphericalPairSelect
StepKinematics_SphericalPairSelect: declare class StepKinematics_SphericalPairSelect extends StepData_SelectType

constructor

// Recognizes a kind of SphericalPairSelect select type - 1 -> SphericalPair - 2 -> SphericalPairWithPin
CaseNum(ent: Standard_Transient): number;

// Returns Value as SphericalPair (or Null if another type)
SphericalPair(): StepKinematics_SphericalPair;

// Returns Value as SphericalPairWithPin (or Null if another type)
SphericalPairWithPin(): StepKinematics_SphericalPairWithPin;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SphericalPairValue
StepKinematics_SphericalPairValue: declare class StepKinematics_SphericalPairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field InputOrientation
InputOrientation(): StepKinematics_SpatialRotation;

// Sets field InputOrientation
SetInputOrientation(theInputOrientation: StepKinematics_SpatialRotation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SphericalPairWithPin
StepKinematics_SphericalPairWithPin: declare class StepKinematics_SphericalPairWithPin extends StepKinematics_LowOrderKinematicPair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SphericalPairWithPinAndRange
StepKinematics_SphericalPairWithPinAndRange: declare class StepKinematics_SphericalPairWithPinAndRange extends StepKinematics_SphericalPairWithPin

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field LowerLimitYaw
LowerLimitYaw(): number;

// Sets field LowerLimitYaw
SetLowerLimitYaw(theLowerLimitYaw: number): void;

// Returns True if optional field LowerLimitYaw is defined
HasLowerLimitYaw(): boolean;

// Returns field UpperLimitYaw
UpperLimitYaw(): number;

// Sets field UpperLimitYaw
SetUpperLimitYaw(theUpperLimitYaw: number): void;

// Returns True if optional field UpperLimitYaw is defined
HasUpperLimitYaw(): boolean;

// Returns field LowerLimitRoll
LowerLimitRoll(): number;

// Sets field LowerLimitRoll
SetLowerLimitRoll(theLowerLimitRoll: number): void;

// Returns True if optional field LowerLimitRoll is defined
HasLowerLimitRoll(): boolean;

// Returns field UpperLimitRoll
UpperLimitRoll(): number;

// Sets field UpperLimitRoll
SetUpperLimitRoll(theUpperLimitRoll: number): void;

// Returns True if optional field UpperLimitRoll is defined
HasUpperLimitRoll(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SphericalPairWithRange
StepKinematics_SphericalPairWithRange: declare class StepKinematics_SphericalPairWithRange extends StepKinematics_SphericalPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field LowerLimitYaw
LowerLimitYaw(): number;

// Sets field LowerLimitYaw
SetLowerLimitYaw(theLowerLimitYaw: number): void;

// Returns True if optional field LowerLimitYaw is defined
HasLowerLimitYaw(): boolean;

// Returns field UpperLimitYaw
UpperLimitYaw(): number;

// Sets field UpperLimitYaw
SetUpperLimitYaw(theUpperLimitYaw: number): void;

// Returns True if optional field UpperLimitYaw is defined
HasUpperLimitYaw(): boolean;

// Returns field LowerLimitPitch
LowerLimitPitch(): number;

// Sets field LowerLimitPitch
SetLowerLimitPitch(theLowerLimitPitch: number): void;

// Returns True if optional field LowerLimitPitch is defined
HasLowerLimitPitch(): boolean;

// Returns field UpperLimitPitch
UpperLimitPitch(): number;

// Sets field UpperLimitPitch
SetUpperLimitPitch(theUpperLimitPitch: number): void;

// Returns True if optional field UpperLimitPitch is defined
HasUpperLimitPitch(): boolean;

// Returns field LowerLimitRoll
LowerLimitRoll(): number;

// Sets field LowerLimitRoll
SetLowerLimitRoll(theLowerLimitRoll: number): void;

// Returns True if optional field LowerLimitRoll is defined
HasLowerLimitRoll(): boolean;

// Returns field UpperLimitRoll
UpperLimitRoll(): number;

// Sets field UpperLimitRoll
SetUpperLimitRoll(theUpperLimitRoll: number): void;

// Returns True if optional field UpperLimitRoll is defined
HasUpperLimitRoll(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfacePair
StepKinematics_SurfacePair: declare class StepKinematics_SurfacePair extends StepKinematics_HighOrderKinematicPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theSurface1: StepGeom_Surface, theSurface2: StepGeom_Surface, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theSurface1: StepGeom_Surface, theSurface2: StepGeom_Surface, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theSurface1: StepGeom_Surface, theSurface2: StepGeom_Surface, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Surface1
Surface1(): StepGeom_Surface;

// Sets field Surface1
SetSurface1(theSurface1: StepGeom_Surface): void;

// Returns field Surface2
Surface2(): StepGeom_Surface;

// Sets field Surface2
SetSurface2(theSurface2: StepGeom_Surface): void;

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
