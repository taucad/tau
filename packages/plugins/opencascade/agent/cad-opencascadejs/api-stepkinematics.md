# libcascade — StepKinematics

10 top-level symbols. Signatures are verbatim typescript.

StepKinematics_ActuatedDirection: typeof StepKinematics_ActuatedDirection[keyof typeof StepKinematics_ActuatedDirection]

// Representation of STEP entity ActuatedKinPairAndOrderKinPair
StepKinematics_ActuatedKinPairAndOrderKinPair: declare class StepKinematics_ActuatedKinPairAndOrderKinPair extends StepKinematics_KinematicPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint, theActuatedKinematicPair: StepKinematics_ActuatedKinematicPair, theOrderKinematicPair: StepKinematics_KinematicPair): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint, theActuatedKinematicPair: StepKinematics_ActuatedKinematicPair, theOrderKinematicPair: StepKinematics_KinematicPair): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint, theActuatedKinematicPair: StepKinematics_ActuatedKinematicPair, theOrderKinematicPair: StepKinematics_KinematicPair): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

SetActuatedKinematicPair(aKP: StepKinematics_ActuatedKinematicPair): void;

GetActuatedKinematicPair(): StepKinematics_ActuatedKinematicPair;

SetOrderKinematicPair(aKP: StepKinematics_KinematicPair): void;

GetOrderKinematicPair(): StepKinematics_KinematicPair;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ActuatedKinematicPair
StepKinematics_ActuatedKinematicPair: declare class StepKinematics_ActuatedKinematicPair extends StepKinematics_KinematicPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, hasTX: boolean, theTX: StepKinematics_ActuatedDirection, hasTY: boolean, theTY: StepKinematics_ActuatedDirection, hasTZ: boolean, theTZ: StepKinematics_ActuatedDirection, hasRX: boolean, theRX: StepKinematics_ActuatedDirection, hasRY: boolean, theRY: StepKinematics_ActuatedDirection, hasRZ: boolean, theRZ: StepKinematics_ActuatedDirection): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, hasTX: boolean, theTX: StepKinematics_ActuatedDirection, hasTY: boolean, theTY: StepKinematics_ActuatedDirection, hasTZ: boolean, theTZ: StepKinematics_ActuatedDirection, hasRX: boolean, theRX: StepKinematics_ActuatedDirection, hasRY: boolean, theRY: StepKinematics_ActuatedDirection, hasRZ: boolean, theRZ: StepKinematics_ActuatedDirection): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, hasTX: boolean, theTX: StepKinematics_ActuatedDirection, hasTY: boolean, theTY: StepKinematics_ActuatedDirection, hasTZ: boolean, theTZ: StepKinematics_ActuatedDirection, hasRX: boolean, theRX: StepKinematics_ActuatedDirection, hasRY: boolean, theRY: StepKinematics_ActuatedDirection, hasRZ: boolean, theRZ: StepKinematics_ActuatedDirection): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field TX
TX(): StepKinematics_ActuatedDirection;

// Sets field TX
SetTX(theTX: StepKinematics_ActuatedDirection): void;

// Returns True if optional field TX is defined
HasTX(): boolean;

// Returns field TY
TY(): StepKinematics_ActuatedDirection;

// Sets field TY
SetTY(theTY: StepKinematics_ActuatedDirection): void;

// Returns True if optional field TY is defined
HasTY(): boolean;

// Returns field TZ
TZ(): StepKinematics_ActuatedDirection;

// Sets field TZ
SetTZ(theTZ: StepKinematics_ActuatedDirection): void;

// Returns True if optional field TZ is defined
HasTZ(): boolean;

// Returns field RX
RX(): StepKinematics_ActuatedDirection;

// Sets field RX
SetRX(theRX: StepKinematics_ActuatedDirection): void;

// Returns True if optional field RX is defined
HasRX(): boolean;

// Returns field RY
RY(): StepKinematics_ActuatedDirection;

// Sets field RY
SetRY(theRY: StepKinematics_ActuatedDirection): void;

// Returns True if optional field RY is defined
HasRY(): boolean;

// Returns field RZ
RZ(): StepKinematics_ActuatedDirection;

// Sets field RZ
SetRZ(theRZ: StepKinematics_ActuatedDirection): void;

// Returns True if optional field RZ is defined
HasRZ(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ContextDependentKinematicLinkRepresentation
StepKinematics_ContextDependentKinematicLinkRepresentation: declare class StepKinematics_ContextDependentKinematicLinkRepresentation extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationRelation: StepKinematics_KinematicLinkRepresentationAssociation, theRepresentedProductRelation: StepKinematics_ProductDefinitionRelationshipKinematics): void;

// Returns field RepresentationRelation
RepresentationRelation(): StepKinematics_KinematicLinkRepresentationAssociation;

// Sets field RepresentationRelation
SetRepresentationRelation(theRepresentationRelation: StepKinematics_KinematicLinkRepresentationAssociation): void;

// Returns field RepresentedProductRelation
RepresentedProductRelation(): StepKinematics_ProductDefinitionRelationshipKinematics;

// Sets field RepresentedProductRelation
SetRepresentedProductRelation(theRepresentedProductRelation: StepKinematics_ProductDefinitionRelationshipKinematics): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CylindricalPair
StepKinematics_CylindricalPair: declare class StepKinematics_CylindricalPair extends StepKinematics_LowOrderKinematicPair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CylindricalPairValue
StepKinematics_CylindricalPairValue: declare class StepKinematics_CylindricalPairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslation: number, theActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslation: number, theActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslation: number, theActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ActualTranslation
ActualTranslation(): number;

// Sets field ActualTranslation
SetActualTranslation(theActualTranslation: number): void;

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

// Representation of STEP entity CylindricalPairWithRange
StepKinematics_CylindricalPairWithRange: declare class StepKinematics_CylindricalPairWithRange extends StepKinematics_CylindricalPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualTranslation: boolean, theLowerLimitActualTranslation: number, hasUpperLimitActualTranslation: boolean, theUpperLimitActualTranslation: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualTranslation: boolean, theLowerLimitActualTranslation: number, hasUpperLimitActualTranslation: boolean, theUpperLimitActualTranslation: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualTranslation: boolean, theLowerLimitActualTranslation: number, hasUpperLimitActualTranslation: boolean, theUpperLimitActualTranslation: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualTranslation: boolean, theLowerLimitActualTranslation: number, hasUpperLimitActualTranslation: boolean, theUpperLimitActualTranslation: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field LowerLimitActualTranslation
LowerLimitActualTranslation(): number;

// Sets field LowerLimitActualTranslation
SetLowerLimitActualTranslation(theLowerLimitActualTranslation: number): void;

// Returns True if optional field LowerLimitActualTranslation is defined
HasLowerLimitActualTranslation(): boolean;

// Returns field UpperLimitActualTranslation
UpperLimitActualTranslation(): number;

// Sets field UpperLimitActualTranslation
SetUpperLimitActualTranslation(theUpperLimitActualTranslation: number): void;

// Returns True if optional field UpperLimitActualTranslation is defined
HasUpperLimitActualTranslation(): boolean;

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

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity FullyConstrainedPair
StepKinematics_FullyConstrainedPair: declare class StepKinematics_FullyConstrainedPair extends StepKinematics_LowOrderKinematicPair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GearPair
StepKinematics_GearPair: declare class StepKinematics_GearPair extends StepKinematics_LowOrderKinematicPairWithMotionCoupling

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theRadiusFirstLink: number, theRadiusSecondLink: number, theBevel: number, theHelicalAngle: number, theGearRatio: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theRadiusFirstLink: number, theRadiusSecondLink: number, theBevel: number, theHelicalAngle: number, theGearRatio: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theRadiusFirstLink: number, theRadiusSecondLink: number, theBevel: number, theHelicalAngle: number, theGearRatio: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field RadiusFirstLink
RadiusFirstLink(): number;

// Sets field RadiusFirstLink
SetRadiusFirstLink(theRadiusFirstLink: number): void;

// Returns field RadiusSecondLink
RadiusSecondLink(): number;

// Sets field RadiusSecondLink
SetRadiusSecondLink(theRadiusSecondLink: number): void;

// Returns field Bevel
Bevel(): number;

// Sets field Bevel
SetBevel(theBevel: number): void;

// Returns field HelicalAngle
HelicalAngle(): number;

// Sets field HelicalAngle
SetHelicalAngle(theHelicalAngle: number): void;

// Returns field GearRatio
GearRatio(): number;

// Sets field GearRatio
SetGearRatio(theGearRatio: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity GearPairValue
StepKinematics_GearPairValue: declare class StepKinematics_GearPairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation1: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation1: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation1: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ActualRotation1
ActualRotation1(): number;

// Sets field ActualRotation1
SetActualRotation1(theActualRotation1: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
