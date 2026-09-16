# libcascade — StepKinematics (7)

18 top-level symbols. Signatures are verbatim typescript.

StepKinematics_RigidPlacement: declare class StepKinematics_RigidPlacement extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Axis2Placement3d(): StepGeom_Axis2Placement3d;

  SuParameters(): StepGeom_SuParameters;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_RollingCurvePair: declare class StepKinematics_RollingCurvePair extends StepKinematics_PlanarCurvePair

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_RollingCurvePairValue: declare class StepKinematics_RollingCurvePairValue extends StepKinematics_PairValue

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve1: StepGeom_PointOnCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve1: StepGeom_PointOnCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve1: StepGeom_PointOnCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  ActualPointOnCurve1(): StepGeom_PointOnCurve;

  SetActualPointOnCurve1(theActualPointOnCurve1: StepGeom_PointOnCurve): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_RollingSurfacePair: declare class StepKinematics_RollingSurfacePair extends StepKinematics_SurfacePair

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_RollingSurfacePairValue: declare class StepKinematics_RollingSurfacePairValue extends StepKinematics_PairValue

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface: StepGeom_PointOnSurface, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface: StepGeom_PointOnSurface, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface: StepGeom_PointOnSurface, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  ActualPointOnSurface(): StepGeom_PointOnSurface;

  SetActualPointOnSurface(theActualPointOnSurface: StepGeom_PointOnSurface): void;

  ActualRotation(): number;

  SetActualRotation(theActualRotation: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_RotationAboutDirection: declare class StepKinematics_RotationAboutDirection extends StepGeom_GeometricRepresentationItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theDirectionOfAxis: StepGeom_Direction, theRotationAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theDirectionOfAxis: StepGeom_Direction, theRotationAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;

  DirectionOfAxis(): StepGeom_Direction;

  SetDirectionOfAxis(theDirectionOfAxis: StepGeom_Direction): void;

  RotationAngle(): number;

  SetRotationAngle(theRotationAngle: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_ScrewPair: declare class StepKinematics_ScrewPair extends StepKinematics_LowOrderKinematicPairWithMotionCoupling

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  Pitch(): number;

  SetPitch(thePitch: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_ScrewPairValue: declare class StepKinematics_ScrewPairValue extends StepKinematics_PairValue

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  ActualRotation(): number;

  SetActualRotation(theActualRotation: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_ScrewPairWithRange: declare class StepKinematics_ScrewPairWithRange extends StepKinematics_ScrewPair

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theScrewPair_Pitch: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theScrewPair_Pitch: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theScrewPair_Pitch: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theScrewPair_Pitch: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  LowerLimitActualRotation(): number;

  SetLowerLimitActualRotation(theLowerLimitActualRotation: number): void;

  HasLowerLimitActualRotation(): boolean;

  UpperLimitActualRotation(): number;

  SetUpperLimitActualRotation(theUpperLimitActualRotation: number): void;

  HasUpperLimitActualRotation(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SlidingCurvePair: declare class StepKinematics_SlidingCurvePair extends StepKinematics_PlanarCurvePair

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SlidingCurvePairValue: declare class StepKinematics_SlidingCurvePairValue extends StepKinematics_PairValue

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve1: StepGeom_PointOnCurve, theActualPointOnCurve2: StepGeom_PointOnCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve1: StepGeom_PointOnCurve, theActualPointOnCurve2: StepGeom_PointOnCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve1: StepGeom_PointOnCurve, theActualPointOnCurve2: StepGeom_PointOnCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  ActualPointOnCurve1(): StepGeom_PointOnCurve;

  SetActualPointOnCurve1(theActualPointOnCurve1: StepGeom_PointOnCurve): void;

  ActualPointOnCurve2(): StepGeom_PointOnCurve;

  SetActualPointOnCurve2(theActualPointOnCurve2: StepGeom_PointOnCurve): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SlidingSurfacePair: declare class StepKinematics_SlidingSurfacePair extends StepKinematics_SurfacePair

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SlidingSurfacePairValue: declare class StepKinematics_SlidingSurfacePairValue extends StepKinematics_PairValue

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface1: StepGeom_PointOnSurface, theActualPointOnSurface2: StepGeom_PointOnSurface, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface1: StepGeom_PointOnSurface, theActualPointOnSurface2: StepGeom_PointOnSurface, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface1: StepGeom_PointOnSurface, theActualPointOnSurface2: StepGeom_PointOnSurface, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  ActualPointOnSurface1(): StepGeom_PointOnSurface;

  SetActualPointOnSurface1(theActualPointOnSurface1: StepGeom_PointOnSurface): void;

  ActualPointOnSurface2(): StepGeom_PointOnSurface;

  SetActualPointOnSurface2(theActualPointOnSurface2: StepGeom_PointOnSurface): void;

  ActualRotation(): number;

  SetActualRotation(theActualRotation: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SpatialRotation: declare class StepKinematics_SpatialRotation extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  RotationAboutDirection(): StepKinematics_RotationAboutDirection;

  YprRotation(): NCollection_HArray1_double;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SphericalPair: declare class StepKinematics_SphericalPair extends StepKinematics_LowOrderKinematicPair

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SphericalPairSelect: declare class StepKinematics_SphericalPairSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  SphericalPair(): StepKinematics_SphericalPair;

  SphericalPairWithPin(): StepKinematics_SphericalPairWithPin;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SphericalPairValue: declare class StepKinematics_SphericalPairValue extends StepKinematics_PairValue

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theInputOrientation: StepKinematics_SpatialRotation): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theInputOrientation: StepKinematics_SpatialRotation): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theInputOrientation: StepKinematics_SpatialRotation): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  InputOrientation(): StepKinematics_SpatialRotation;

  SetInputOrientation(theInputOrientation: StepKinematics_SpatialRotation): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepKinematics_SphericalPairWithPin: declare class StepKinematics_SphericalPairWithPin extends StepKinematics_LowOrderKinematicPair

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
