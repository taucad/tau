# libcascade — StepKinematics (5)

7 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity PointOnPlanarCurvePairValue
StepKinematics_PointOnPlanarCurvePairValue: declare class StepKinematics_PointOnPlanarCurvePairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve: StepGeom_PointOnCurve, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve: StepGeom_PointOnCurve, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve: StepGeom_PointOnCurve, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ActualPointOnCurve
ActualPointOnCurve(): StepGeom_PointOnCurve;

// Sets field ActualPointOnCurve
SetActualPointOnCurve(theActualPointOnCurve: StepGeom_PointOnCurve): void;

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

// Representation of STEP entity PointOnPlanarCurvePairWithRange
StepKinematics_PointOnPlanarCurvePairWithRange: declare class StepKinematics_PointOnPlanarCurvePairWithRange extends StepKinematics_PointOnPlanarCurvePair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnPlanarCurvePair_PairCurve: StepGeom_Curve, thePointOnPlanarCurvePair_Orientation: boolean, theRangeOnPairCurve: StepGeom_TrimmedCurve, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnPlanarCurvePair_PairCurve: StepGeom_Curve, thePointOnPlanarCurvePair_Orientation: boolean, theRangeOnPairCurve: StepGeom_TrimmedCurve, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnPlanarCurvePair_PairCurve: StepGeom_Curve, thePointOnPlanarCurvePair_Orientation: boolean, theRangeOnPairCurve: StepGeom_TrimmedCurve, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnPlanarCurvePair_PairCurve: StepGeom_Curve, thePointOnPlanarCurvePair_Orientation: boolean, theRangeOnPairCurve: StepGeom_TrimmedCurve, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field RangeOnPairCurve
RangeOnPairCurve(): StepGeom_TrimmedCurve;

// Sets field RangeOnPairCurve
SetRangeOnPairCurve(theRangeOnPairCurve: StepGeom_TrimmedCurve): void;

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

// Representation of STEP entity PointOnSurfacePair
StepKinematics_PointOnSurfacePair: declare class StepKinematics_PointOnSurfacePair extends StepKinematics_HighOrderKinematicPair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field PairSurface
PairSurface(): StepGeom_Surface;

// Sets field PairSurface
SetPairSurface(thePairSurface: StepGeom_Surface): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PointOnSurfacePairValue
StepKinematics_PointOnSurfacePairValue: declare class StepKinematics_PointOnSurfacePairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface: StepGeom_PointOnSurface, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface: StepGeom_PointOnSurface, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface: StepGeom_PointOnSurface, theInputOrientation: StepKinematics_SpatialRotation): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ActualPointOnSurface
ActualPointOnSurface(): StepGeom_PointOnSurface;

// Sets field ActualPointOnSurface
SetActualPointOnSurface(theActualPointOnSurface: StepGeom_PointOnSurface): void;

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

// Representation of STEP entity PointOnSurfacePairWithRange
StepKinematics_PointOnSurfacePairWithRange: declare class StepKinematics_PointOnSurfacePairWithRange extends StepKinematics_PointOnSurfacePair

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnSurfacePair_PairSurface: StepGeom_Surface, theRangeOnPairSurface: StepGeom_RectangularTrimmedSurface, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnSurfacePair_PairSurface: StepGeom_Surface, theRangeOnPairSurface: StepGeom_RectangularTrimmedSurface, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnSurfacePair_PairSurface: StepGeom_Surface, theRangeOnPairSurface: StepGeom_RectangularTrimmedSurface, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnSurfacePair_PairSurface: StepGeom_Surface, theRangeOnPairSurface: StepGeom_RectangularTrimmedSurface, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field RangeOnPairSurface
RangeOnPairSurface(): StepGeom_RectangularTrimmedSurface;

// Sets field RangeOnPairSurface
SetRangeOnPairSurface(theRangeOnPairSurface: StepGeom_RectangularTrimmedSurface): void;

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

// Representation of STEP entity PrismaticPair
StepKinematics_PrismaticPair: declare class StepKinematics_PrismaticPair extends StepKinematics_LowOrderKinematicPair

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity PrismaticPairValue
StepKinematics_PrismaticPairValue: declare class StepKinematics_PrismaticPairValue extends StepKinematics_PairValue

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslation: number): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field ActualTranslation
ActualTranslation(): number;

// Sets field ActualTranslation
SetActualTranslation(theActualTranslation: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
