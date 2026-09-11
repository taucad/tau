# libcascade — StepKinematics (3)

9 top-level symbols. Signatures are verbatim typescript.

StepKinematics_LowOrderKinematicPairValue: declare class StepKinematics_LowOrderKinematicPairValue extends StepKinematics_PairValue

constructor

Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslationX: number, theActualTranslationY: number, theActualTranslationZ: number, theActualRotationX: number, theActualRotationY: number, theActualRotationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslationX: number, theActualTranslationY: number, theActualTranslationZ: number, theActualRotationX: number, theActualRotationY: number, theActualRotationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslationX: number, theActualTranslationY: number, theActualTranslationZ: number, theActualRotationX: number, theActualRotationY: number, theActualRotationZ: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

ActualTranslationX(): number;

SetActualTranslationX(theActualTranslationX: number): void;

ActualTranslationY(): number;

SetActualTranslationY(theActualTranslationY: number): void;

ActualTranslationZ(): number;

SetActualTranslationZ(theActualTranslationZ: number): void;

ActualRotationX(): number;

SetActualRotationX(theActualRotationX: number): void;

ActualRotationY(): number;

SetActualRotationY(theActualRotationY: number): void;

ActualRotationZ(): number;

SetActualRotationZ(theActualRotationZ: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepKinematics_LowOrderKinematicPairWithMotionCoupling: declare class StepKinematics_LowOrderKinematicPairWithMotionCoupling extends StepKinematics_KinematicPair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepKinematics_LowOrderKinematicPairWithRange: declare class StepKinematics_LowOrderKinematicPairWithRange extends StepKinematics_LowOrderKinematicPair

constructor

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

LowerLimitActualRotationX(): number;

SetLowerLimitActualRotationX(theLowerLimitActualRotationX: number): void;

HasLowerLimitActualRotationX(): boolean;

UpperLimitActualRotationX(): number;

SetUpperLimitActualRotationX(theUpperLimitActualRotationX: number): void;

HasUpperLimitActualRotationX(): boolean;

LowerLimitActualRotationY(): number;

SetLowerLimitActualRotationY(theLowerLimitActualRotationY: number): void;

HasLowerLimitActualRotationY(): boolean;

UpperLimitActualRotationY(): number;

SetUpperLimitActualRotationY(theUpperLimitActualRotationY: number): void;

HasUpperLimitActualRotationY(): boolean;

LowerLimitActualRotationZ(): number;

SetLowerLimitActualRotationZ(theLowerLimitActualRotationZ: number): void;

HasLowerLimitActualRotationZ(): boolean;

UpperLimitActualRotationZ(): number;

SetUpperLimitActualRotationZ(theUpperLimitActualRotationZ: number): void;

HasUpperLimitActualRotationZ(): boolean;

LowerLimitActualTranslationX(): number;

SetLowerLimitActualTranslationX(theLowerLimitActualTranslationX: number): void;

HasLowerLimitActualTranslationX(): boolean;

UpperLimitActualTranslationX(): number;

SetUpperLimitActualTranslationX(theUpperLimitActualTranslationX: number): void;

HasUpperLimitActualTranslationX(): boolean;

LowerLimitActualTranslationY(): number;

SetLowerLimitActualTranslationY(theLowerLimitActualTranslationY: number): void;

HasLowerLimitActualTranslationY(): boolean;

UpperLimitActualTranslationY(): number;

SetUpperLimitActualTranslationY(theUpperLimitActualTranslationY: number): void;

HasUpperLimitActualTranslationY(): boolean;

LowerLimitActualTranslationZ(): number;

SetLowerLimitActualTranslationZ(theLowerLimitActualTranslationZ: number): void;

HasLowerLimitActualTranslationZ(): boolean;

UpperLimitActualTranslationZ(): number;

SetUpperLimitActualTranslationZ(theUpperLimitActualTranslationZ: number): void;

HasUpperLimitActualTranslationZ(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepKinematics_MechanismRepresentation: declare class StepKinematics_MechanismRepresentation extends StepRepr_Representation

constructor

Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theRepresentedTopology: StepKinematics_KinematicTopologyRepresentationSelect): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theRepresentedTopology: StepKinematics_KinematicTopologyRepresentationSelect): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

RepresentedTopology(): StepKinematics_KinematicTopologyRepresentationSelect;

SetRepresentedTopology(theRepresentedTopology: StepKinematics_KinematicTopologyRepresentationSelect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

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

delete(): void;

[Symbol.dispose](): void;

StepKinematics_OrientedJoint: declare class StepKinematics_OrientedJoint extends StepShape_OrientedEdge

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepKinematics_PairRepresentationRelationship: declare class StepKinematics_PairRepresentationRelationship extends StepGeom_GeometricRepresentationItem

constructor

Init(theRepresentationItem_Name: TCollection_HAsciiString, theRepresentationRelationship_Name: TCollection_HAsciiString, hasRepresentationRelationship_Description: boolean, theRepresentationRelationship_Description: TCollection_HAsciiString, theRepresentationRelationship_Rep1: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationship_Rep2: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationshipWithTransformation_TransformationOperator: StepRepr_Transformation): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theRepresentationRelationship_Name: TCollection_HAsciiString, hasRepresentationRelationship_Description: boolean, theRepresentationRelationship_Description: TCollection_HAsciiString, theRepresentationRelationship_Rep1: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationship_Rep2: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationshipWithTransformation_TransformationOperator: StepRepr_Transformation): void;
Init(aName: TCollection_HAsciiString): void;

RepresentationRelationshipWithTransformation(): StepRepr_RepresentationRelationshipWithTransformation;

SetRepresentationRelationshipWithTransformation(theRepresentationRelationshipWithTransformation: StepRepr_RepresentationRelationshipWithTransformation): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepKinematics_PairValue: declare class StepKinematics_PairValue extends StepGeom_GeometricRepresentationItem

constructor

Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

AppliesToPair(): StepKinematics_KinematicPair;

SetAppliesToPair(theAppliesToPair: StepKinematics_KinematicPair): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

StepKinematics_PlanarCurvePair: declare class StepKinematics_PlanarCurvePair extends StepKinematics_HighOrderKinematicPair

constructor

Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

Curve1(): StepGeom_Curve;

SetCurve1(theCurve1: StepGeom_Curve): void;

Curve2(): StepGeom_Curve;

SetCurve2(theCurve2: StepGeom_Curve): void;

Orientation(): boolean;

SetOrientation(theOrientation: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
