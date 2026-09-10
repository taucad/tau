# libcascade — StepKinematics (3)

9 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity LowOrderKinematicPair
StepKinematics_LowOrderKinematicPair: declare class StepKinematics_LowOrderKinematicPair extends StepKinematics_KinematicPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field TX
TX(): boolean;

// Sets field TX
SetTX(theTX: boolean): void;

// Returns field TY
TY(): boolean;

// Sets field TY
SetTY(theTY: boolean): void;

// Returns field TZ
TZ(): boolean;

// Sets field TZ
SetTZ(theTZ: boolean): void;

// Returns field RX
RX(): boolean;

// Sets field RX
SetRX(theRX: boolean): void;

// Returns field RY
RY(): boolean;

// Sets field RY
SetRY(theRY: boolean): void;

// Returns field RZ
RZ(): boolean;

// Sets field RZ
SetRZ(theRZ: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity LowOrderKinematicPairValue
StepKinematics_LowOrderKinematicPairValue: declare class StepKinematics_LowOrderKinematicPairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslationX: number, theActualTranslationY: number, theActualTranslationZ: number, theActualRotationX: number, theActualRotationY: number, theActualRotationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslationX: number, theActualTranslationY: number, theActualTranslationZ: number, theActualRotationX: number, theActualRotationY: number, theActualRotationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslationX: number, theActualTranslationY: number, theActualTranslationZ: number, theActualRotationX: number, theActualRotationY: number, theActualRotationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ActualTranslationX
ActualTranslationX(): number;

// Sets field ActualTranslationX
SetActualTranslationX(theActualTranslationX: number): void;

// Returns field ActualTranslationY
ActualTranslationY(): number;

// Sets field ActualTranslationY
SetActualTranslationY(theActualTranslationY: number): void;

// Returns field ActualTranslationZ
ActualTranslationZ(): number;

// Sets field ActualTranslationZ
SetActualTranslationZ(theActualTranslationZ: number): void;

// Returns field ActualRotationX
ActualRotationX(): number;

// Sets field ActualRotationX
SetActualRotationX(theActualRotationX: number): void;

// Returns field ActualRotationY
ActualRotationY(): number;

// Sets field ActualRotationY
SetActualRotationY(theActualRotationY: number): void;

// Returns field ActualRotationZ
ActualRotationZ(): number;

// Sets field ActualRotationZ
SetActualRotationZ(theActualRotationZ: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity LowOrderKinematicPairWithMotionCoupling
StepKinematics_LowOrderKinematicPairWithMotionCoupling: declare class StepKinematics_LowOrderKinematicPairWithMotionCoupling extends StepKinematics_KinematicPair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity LowOrderKinematicPairWithRange
StepKinematics_LowOrderKinematicPairWithRange: declare class StepKinematics_LowOrderKinematicPairWithRange extends StepKinematics_LowOrderKinematicPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotationX: boolean, theLowerLimitActualRotationX: number, hasUpperLimitActualRotationX: boolean, theUpperLimitActualRotationX: number, hasLowerLimitActualRotationY: boolean, theLowerLimitActualRotationY: number, hasUpperLimitActualRotationY: boolean, theUpperLimitActualRotationY: number, hasLowerLimitActualRotationZ: boolean, theLowerLimitActualRotationZ: number, hasUpperLimitActualRotationZ: boolean, theUpperLimitActualRotationZ: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number, hasLowerLimitActualTranslationZ: boolean, theLowerLimitActualTranslationZ: number, hasUpperLimitActualTranslationZ: boolean, theUpperLimitActualTranslationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotationX: boolean, theLowerLimitActualRotationX: number, hasUpperLimitActualRotationX: boolean, theUpperLimitActualRotationX: number, hasLowerLimitActualRotationY: boolean, theLowerLimitActualRotationY: number, hasUpperLimitActualRotationY: boolean, theUpperLimitActualRotationY: number, hasLowerLimitActualRotationZ: boolean, theLowerLimitActualRotationZ: number, hasUpperLimitActualRotationZ: boolean, theUpperLimitActualRotationZ: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number, hasLowerLimitActualTranslationZ: boolean, theLowerLimitActualTranslationZ: number, hasUpperLimitActualTranslationZ: boolean, theUpperLimitActualTranslationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotationX: boolean, theLowerLimitActualRotationX: number, hasUpperLimitActualRotationX: boolean, theUpperLimitActualRotationX: number, hasLowerLimitActualRotationY: boolean, theLowerLimitActualRotationY: number, hasUpperLimitActualRotationY: boolean, theUpperLimitActualRotationY: number, hasLowerLimitActualRotationZ: boolean, theLowerLimitActualRotationZ: number, hasUpperLimitActualRotationZ: boolean, theUpperLimitActualRotationZ: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number, hasLowerLimitActualTranslationZ: boolean, theLowerLimitActualTranslationZ: number, hasUpperLimitActualTranslationZ: boolean, theUpperLimitActualTranslationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotationX: boolean, theLowerLimitActualRotationX: number, hasUpperLimitActualRotationX: boolean, theUpperLimitActualRotationX: number, hasLowerLimitActualRotationY: boolean, theLowerLimitActualRotationY: number, hasUpperLimitActualRotationY: boolean, theUpperLimitActualRotationY: number, hasLowerLimitActualRotationZ: boolean, theLowerLimitActualRotationZ: number, hasUpperLimitActualRotationZ: boolean, theUpperLimitActualRotationZ: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number, hasLowerLimitActualTranslationZ: boolean, theLowerLimitActualTranslationZ: number, hasUpperLimitActualTranslationZ: boolean, theUpperLimitActualTranslationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field LowerLimitActualRotationX
LowerLimitActualRotationX(): number;

// Sets field LowerLimitActualRotationX
SetLowerLimitActualRotationX(theLowerLimitActualRotationX: number): void;

// Returns True if optional field LowerLimitActualRotationX is defined
HasLowerLimitActualRotationX(): boolean;

// Returns field UpperLimitActualRotationX
UpperLimitActualRotationX(): number;

// Sets field UpperLimitActualRotationX
SetUpperLimitActualRotationX(theUpperLimitActualRotationX: number): void;

// Returns True if optional field UpperLimitActualRotationX is defined
HasUpperLimitActualRotationX(): boolean;

// Returns field LowerLimitActualRotationY
LowerLimitActualRotationY(): number;

// Sets field LowerLimitActualRotationY
SetLowerLimitActualRotationY(theLowerLimitActualRotationY: number): void;

// Returns True if optional field LowerLimitActualRotationY is defined
HasLowerLimitActualRotationY(): boolean;

// Returns field UpperLimitActualRotationY
UpperLimitActualRotationY(): number;

// Sets field UpperLimitActualRotationY
SetUpperLimitActualRotationY(theUpperLimitActualRotationY: number): void;

// Returns True if optional field UpperLimitActualRotationY is defined
HasUpperLimitActualRotationY(): boolean;

// Returns field LowerLimitActualRotationZ
LowerLimitActualRotationZ(): number;

// Sets field LowerLimitActualRotationZ
SetLowerLimitActualRotationZ(theLowerLimitActualRotationZ: number): void;

// Returns True if optional field LowerLimitActualRotationZ is defined
HasLowerLimitActualRotationZ(): boolean;

// Returns field UpperLimitActualRotationZ
UpperLimitActualRotationZ(): number;

// Sets field UpperLimitActualRotationZ
SetUpperLimitActualRotationZ(theUpperLimitActualRotationZ: number): void;

// Returns True if optional field UpperLimitActualRotationZ is defined
HasUpperLimitActualRotationZ(): boolean;

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

// Returns field LowerLimitActualTranslationZ
LowerLimitActualTranslationZ(): number;

// Sets field LowerLimitActualTranslationZ
SetLowerLimitActualTranslationZ(theLowerLimitActualTranslationZ: number): void;

// Returns True if optional field LowerLimitActualTranslationZ is defined
HasLowerLimitActualTranslationZ(): boolean;

// Returns field UpperLimitActualTranslationZ
UpperLimitActualTranslationZ(): number;

// Sets field UpperLimitActualTranslationZ
SetUpperLimitActualTranslationZ(theUpperLimitActualTranslationZ: number): void;

// Returns True if optional field UpperLimitActualTranslationZ is defined
HasUpperLimitActualTranslationZ(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity MechanismRepresentation
StepKinematics_MechanismRepresentation: declare class StepKinematics_MechanismRepresentation extends StepRepr_Representation

constructor

// Initialize all fields (own and inherited)
Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theRepresentedTopology: StepKinematics_KinematicTopologyRepresentationSelect): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theRepresentedTopology: StepKinematics_KinematicTopologyRepresentationSelect): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

// Returns field RepresentedTopology
RepresentedTopology(): StepKinematics_KinematicTopologyRepresentationSelect;

// Sets field RepresentedTopology
SetRepresentedTopology(theRepresentedTopology: StepKinematics_KinematicTopologyRepresentationSelect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepKinematics_MechanismStateRepresentation: declare class StepKinematics_MechanismStateRepresentation extends StepRepr_Representation

constructor

Init(theName: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, theContextOfItems: StepRepr_RepresentationContext, theMechanism: StepKinematics_MechanismRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(theName: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, theContextOfItems: StepRepr_RepresentationContext, theMechanism: StepKinematics_MechanismRepresentation): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

SetMechanism(theMechanism: StepKinematics_MechanismRepresentation): void;

Mechanism(): StepKinematics_MechanismRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity OrientedJoint
StepKinematics_OrientedJoint: declare class StepKinematics_OrientedJoint extends StepShape_OrientedEdge

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PairRepresentationRelationship
StepKinematics_PairRepresentationRelationship: declare class StepKinematics_PairRepresentationRelationship extends StepGeom_GeometricRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theRepresentationRelationship_Name: TCollection_HAsciiString, hasRepresentationRelationship_Description: boolean, theRepresentationRelationship_Description: TCollection_HAsciiString, theRepresentationRelationship_Rep1: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationship_Rep2: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationshipWithTransformation_TransformationOperator: StepRepr_Transformation): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theRepresentationRelationship_Name: TCollection_HAsciiString, hasRepresentationRelationship_Description: boolean, theRepresentationRelationship_Description: TCollection_HAsciiString, theRepresentationRelationship_Rep1: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationship_Rep2: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationshipWithTransformation_TransformationOperator: StepRepr_Transformation): void;
Init(aName: TCollection_HAsciiString): void;

// Returns data for supertype RepresentationRelationshipWithTransformation
RepresentationRelationshipWithTransformation(): StepRepr_RepresentationRelationshipWithTransformation;

// Sets data for supertype RepresentationRelationshipWithTransformation
SetRepresentationRelationshipWithTransformation(theRepresentationRelationshipWithTransformation: StepRepr_RepresentationRelationshipWithTransformation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PairValue
StepKinematics_PairValue: declare class StepKinematics_PairValue extends StepGeom_GeometricRepresentationItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field AppliesToPair
AppliesToPair(): StepKinematics_KinematicPair;

// Sets field AppliesToPair
SetAppliesToPair(theAppliesToPair: StepKinematics_KinematicPair): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
