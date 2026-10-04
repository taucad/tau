# libcascade — StepKinematics (2)

17 top-level symbols. Signatures are verbatim typescript.

StepKinematics_LowOrderKinematicPairValue: declare class StepKinematics_LowOrderKinematicPairValue extends StepKinematics_PairValue

  // StepKinematics_LowOrderKinematicPairValue.constructor (constructor)
  constructor();

  // StepKinematics_LowOrderKinematicPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslationX: number, theActualTranslationY: number, theActualTranslationZ: number, theActualRotationX: number, theActualRotationY: number, theActualRotationZ: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_LowOrderKinematicPairValue.ActualTranslationX (method)
  ActualTranslationX(): number;

  // StepKinematics_LowOrderKinematicPairValue.SetActualTranslationX (method)
  SetActualTranslationX(theActualTranslationX: number): void;

  // StepKinematics_LowOrderKinematicPairValue.ActualTranslationY (method)
  ActualTranslationY(): number;

  // StepKinematics_LowOrderKinematicPairValue.SetActualTranslationY (method)
  SetActualTranslationY(theActualTranslationY: number): void;

  // StepKinematics_LowOrderKinematicPairValue.ActualTranslationZ (method)
  ActualTranslationZ(): number;

  // StepKinematics_LowOrderKinematicPairValue.SetActualTranslationZ (method)
  SetActualTranslationZ(theActualTranslationZ: number): void;

  // StepKinematics_LowOrderKinematicPairValue.ActualRotationX (method)
  ActualRotationX(): number;

  // StepKinematics_LowOrderKinematicPairValue.SetActualRotationX (method)
  SetActualRotationX(theActualRotationX: number): void;

  // StepKinematics_LowOrderKinematicPairValue.ActualRotationY (method)
  ActualRotationY(): number;

  // StepKinematics_LowOrderKinematicPairValue.SetActualRotationY (method)
  SetActualRotationY(theActualRotationY: number): void;

  // StepKinematics_LowOrderKinematicPairValue.ActualRotationZ (method)
  ActualRotationZ(): number;

  // StepKinematics_LowOrderKinematicPairValue.SetActualRotationZ (method)
  SetActualRotationZ(theActualRotationZ: number): void;

  // StepKinematics_LowOrderKinematicPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_LowOrderKinematicPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_LowOrderKinematicPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_LowOrderKinematicPairValue.delete (method)
  delete(): void;

  // StepKinematics_LowOrderKinematicPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_LowOrderKinematicPairWithMotionCoupling: declare class StepKinematics_LowOrderKinematicPairWithMotionCoupling extends StepKinematics_KinematicPair

  // StepKinematics_LowOrderKinematicPairWithMotionCoupling.constructor (constructor)
  constructor();

  // StepKinematics_LowOrderKinematicPairWithMotionCoupling.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_LowOrderKinematicPairWithMotionCoupling.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_LowOrderKinematicPairWithMotionCoupling.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_LowOrderKinematicPairWithMotionCoupling.delete (method)
  delete(): void;

  // StepKinematics_LowOrderKinematicPairWithMotionCoupling.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_LowOrderKinematicPairWithRange: declare class StepKinematics_LowOrderKinematicPairWithRange extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_LowOrderKinematicPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_LowOrderKinematicPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotationX: boolean, theLowerLimitActualRotationX: number, hasUpperLimitActualRotationX: boolean, theUpperLimitActualRotationX: number, hasLowerLimitActualRotationY: boolean, theLowerLimitActualRotationY: number, hasUpperLimitActualRotationY: boolean, theUpperLimitActualRotationY: number, hasLowerLimitActualRotationZ: boolean, theLowerLimitActualRotationZ: number, hasUpperLimitActualRotationZ: boolean, theUpperLimitActualRotationZ: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number, hasLowerLimitActualTranslationZ: boolean, theLowerLimitActualTranslationZ: number, hasUpperLimitActualTranslationZ: boolean, theUpperLimitActualTranslationZ: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_LowOrderKinematicPairWithRange.LowerLimitActualRotationX (method)
  LowerLimitActualRotationX(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetLowerLimitActualRotationX (method)
  SetLowerLimitActualRotationX(theLowerLimitActualRotationX: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasLowerLimitActualRotationX (method)
  HasLowerLimitActualRotationX(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.UpperLimitActualRotationX (method)
  UpperLimitActualRotationX(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetUpperLimitActualRotationX (method)
  SetUpperLimitActualRotationX(theUpperLimitActualRotationX: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasUpperLimitActualRotationX (method)
  HasUpperLimitActualRotationX(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.LowerLimitActualRotationY (method)
  LowerLimitActualRotationY(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetLowerLimitActualRotationY (method)
  SetLowerLimitActualRotationY(theLowerLimitActualRotationY: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasLowerLimitActualRotationY (method)
  HasLowerLimitActualRotationY(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.UpperLimitActualRotationY (method)
  UpperLimitActualRotationY(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetUpperLimitActualRotationY (method)
  SetUpperLimitActualRotationY(theUpperLimitActualRotationY: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasUpperLimitActualRotationY (method)
  HasUpperLimitActualRotationY(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.LowerLimitActualRotationZ (method)
  LowerLimitActualRotationZ(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetLowerLimitActualRotationZ (method)
  SetLowerLimitActualRotationZ(theLowerLimitActualRotationZ: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasLowerLimitActualRotationZ (method)
  HasLowerLimitActualRotationZ(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.UpperLimitActualRotationZ (method)
  UpperLimitActualRotationZ(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetUpperLimitActualRotationZ (method)
  SetUpperLimitActualRotationZ(theUpperLimitActualRotationZ: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasUpperLimitActualRotationZ (method)
  HasUpperLimitActualRotationZ(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.LowerLimitActualTranslationX (method)
  LowerLimitActualTranslationX(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetLowerLimitActualTranslationX (method)
  SetLowerLimitActualTranslationX(theLowerLimitActualTranslationX: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasLowerLimitActualTranslationX (method)
  HasLowerLimitActualTranslationX(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.UpperLimitActualTranslationX (method)
  UpperLimitActualTranslationX(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetUpperLimitActualTranslationX (method)
  SetUpperLimitActualTranslationX(theUpperLimitActualTranslationX: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasUpperLimitActualTranslationX (method)
  HasUpperLimitActualTranslationX(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.LowerLimitActualTranslationY (method)
  LowerLimitActualTranslationY(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetLowerLimitActualTranslationY (method)
  SetLowerLimitActualTranslationY(theLowerLimitActualTranslationY: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasLowerLimitActualTranslationY (method)
  HasLowerLimitActualTranslationY(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.UpperLimitActualTranslationY (method)
  UpperLimitActualTranslationY(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetUpperLimitActualTranslationY (method)
  SetUpperLimitActualTranslationY(theUpperLimitActualTranslationY: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasUpperLimitActualTranslationY (method)
  HasUpperLimitActualTranslationY(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.LowerLimitActualTranslationZ (method)
  LowerLimitActualTranslationZ(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetLowerLimitActualTranslationZ (method)
  SetLowerLimitActualTranslationZ(theLowerLimitActualTranslationZ: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasLowerLimitActualTranslationZ (method)
  HasLowerLimitActualTranslationZ(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.UpperLimitActualTranslationZ (method)
  UpperLimitActualTranslationZ(): number;

  // StepKinematics_LowOrderKinematicPairWithRange.SetUpperLimitActualTranslationZ (method)
  SetUpperLimitActualTranslationZ(theUpperLimitActualTranslationZ: number): void;

  // StepKinematics_LowOrderKinematicPairWithRange.HasUpperLimitActualTranslationZ (method)
  HasUpperLimitActualTranslationZ(): boolean;

  // StepKinematics_LowOrderKinematicPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_LowOrderKinematicPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_LowOrderKinematicPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_LowOrderKinematicPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_LowOrderKinematicPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_MechanismRepresentation: declare class StepKinematics_MechanismRepresentation extends StepRepr_Representation

  // StepKinematics_MechanismRepresentation.constructor (constructor)
  constructor();

  // StepKinematics_MechanismRepresentation.Init (method)
  Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theRepresentedTopology: StepKinematics_KinematicTopologyRepresentationSelect): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepKinematics_MechanismRepresentation.RepresentedTopology (method)
  RepresentedTopology(): StepKinematics_KinematicTopologyRepresentationSelect;

  // StepKinematics_MechanismRepresentation.SetRepresentedTopology (method)
  SetRepresentedTopology(theRepresentedTopology: StepKinematics_KinematicTopologyRepresentationSelect): void;

  // StepKinematics_MechanismRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_MechanismRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_MechanismRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_MechanismRepresentation.delete (method)
  delete(): void;

  // StepKinematics_MechanismRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_MechanismStateRepresentation: declare class StepKinematics_MechanismStateRepresentation extends StepRepr_Representation

  // StepKinematics_MechanismStateRepresentation.constructor (constructor)
  constructor();

  // StepKinematics_MechanismStateRepresentation.Init (method)
  Init(theName: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, theContextOfItems: StepRepr_RepresentationContext, theMechanism: StepKinematics_MechanismRepresentation): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepKinematics_MechanismStateRepresentation.SetMechanism (method)
  SetMechanism(theMechanism: StepKinematics_MechanismRepresentation): void;

  // StepKinematics_MechanismStateRepresentation.Mechanism (method)
  Mechanism(): StepKinematics_MechanismRepresentation;

  // StepKinematics_MechanismStateRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_MechanismStateRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_MechanismStateRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_MechanismStateRepresentation.delete (method)
  delete(): void;

  // StepKinematics_MechanismStateRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_OrientedJoint: declare class StepKinematics_OrientedJoint extends StepShape_OrientedEdge

  // StepKinematics_OrientedJoint.constructor (constructor)
  constructor();

  // StepKinematics_OrientedJoint.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_OrientedJoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_OrientedJoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_OrientedJoint.delete (method)
  delete(): void;

  // StepKinematics_OrientedJoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PairRepresentationRelationship: declare class StepKinematics_PairRepresentationRelationship extends StepGeom_GeometricRepresentationItem

  // StepKinematics_PairRepresentationRelationship.constructor (constructor)
  constructor();

  // StepKinematics_PairRepresentationRelationship.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theRepresentationRelationship_Name: TCollection_HAsciiString, hasRepresentationRelationship_Description: boolean, theRepresentationRelationship_Description: TCollection_HAsciiString, theRepresentationRelationship_Rep1: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationship_Rep2: StepRepr_RepresentationOrRepresentationReference, theRepresentationRelationshipWithTransformation_TransformationOperator: StepRepr_Transformation): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PairRepresentationRelationship.RepresentationRelationshipWithTransformation (method)
  RepresentationRelationshipWithTransformation(): StepRepr_RepresentationRelationshipWithTransformation;

  // StepKinematics_PairRepresentationRelationship.SetRepresentationRelationshipWithTransformation (method)
  SetRepresentationRelationshipWithTransformation(theRepresentationRelationshipWithTransformation: StepRepr_RepresentationRelationshipWithTransformation): void;

  // StepKinematics_PairRepresentationRelationship.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PairRepresentationRelationship.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PairRepresentationRelationship.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PairRepresentationRelationship.delete (method)
  delete(): void;

  // StepKinematics_PairRepresentationRelationship.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PairValue: declare class StepKinematics_PairValue extends StepGeom_GeometricRepresentationItem

  // StepKinematics_PairValue.constructor (constructor)
  constructor();

  // StepKinematics_PairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PairValue.AppliesToPair (method)
  AppliesToPair(): StepKinematics_KinematicPair;

  // StepKinematics_PairValue.SetAppliesToPair (method)
  SetAppliesToPair(theAppliesToPair: StepKinematics_KinematicPair): void;

  // StepKinematics_PairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PairValue.delete (method)
  delete(): void;

  // StepKinematics_PairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PlanarCurvePair: declare class StepKinematics_PlanarCurvePair extends StepKinematics_HighOrderKinematicPair

  // StepKinematics_PlanarCurvePair.constructor (constructor)
  constructor();

  // StepKinematics_PlanarCurvePair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PlanarCurvePair.Curve1 (method)
  Curve1(): StepGeom_Curve;

  // StepKinematics_PlanarCurvePair.SetCurve1 (method)
  SetCurve1(theCurve1: StepGeom_Curve): void;

  // StepKinematics_PlanarCurvePair.Curve2 (method)
  Curve2(): StepGeom_Curve;

  // StepKinematics_PlanarCurvePair.SetCurve2 (method)
  SetCurve2(theCurve2: StepGeom_Curve): void;

  // StepKinematics_PlanarCurvePair.Orientation (method)
  Orientation(): boolean;

  // StepKinematics_PlanarCurvePair.SetOrientation (method)
  SetOrientation(theOrientation: boolean): void;

  // StepKinematics_PlanarCurvePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PlanarCurvePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PlanarCurvePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PlanarCurvePair.delete (method)
  delete(): void;

  // StepKinematics_PlanarCurvePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PlanarCurvePairRange: declare class StepKinematics_PlanarCurvePairRange extends StepKinematics_PlanarCurvePair

  // StepKinematics_PlanarCurvePairRange.constructor (constructor)
  constructor();

  // StepKinematics_PlanarCurvePairRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePlanarCurvePair_Curve1: StepGeom_Curve, thePlanarCurvePair_Curve2: StepGeom_Curve, thePlanarCurvePair_Orientation: boolean, theRangeOnCurve1: StepGeom_TrimmedCurve, theRangeOnCurve2: StepGeom_TrimmedCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theCurve1: StepGeom_Curve, theCurve2: StepGeom_Curve, theOrientation: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PlanarCurvePairRange.RangeOnCurve1 (method)
  RangeOnCurve1(): StepGeom_TrimmedCurve;

  // StepKinematics_PlanarCurvePairRange.SetRangeOnCurve1 (method)
  SetRangeOnCurve1(theRangeOnCurve1: StepGeom_TrimmedCurve): void;

  // StepKinematics_PlanarCurvePairRange.RangeOnCurve2 (method)
  RangeOnCurve2(): StepGeom_TrimmedCurve;

  // StepKinematics_PlanarCurvePairRange.SetRangeOnCurve2 (method)
  SetRangeOnCurve2(theRangeOnCurve2: StepGeom_TrimmedCurve): void;

  // StepKinematics_PlanarCurvePairRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PlanarCurvePairRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PlanarCurvePairRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PlanarCurvePairRange.delete (method)
  delete(): void;

  // StepKinematics_PlanarCurvePairRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PlanarPair: declare class StepKinematics_PlanarPair extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_PlanarPair.constructor (constructor)
  constructor();

  // StepKinematics_PlanarPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PlanarPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PlanarPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PlanarPair.delete (method)
  delete(): void;

  // StepKinematics_PlanarPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PlanarPairValue: declare class StepKinematics_PlanarPairValue extends StepKinematics_PairValue

  // StepKinematics_PlanarPairValue.constructor (constructor)
  constructor();

  // StepKinematics_PlanarPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number, theActualTranslationX: number, theActualTranslationY: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PlanarPairValue.ActualRotation (method)
  ActualRotation(): number;

  // StepKinematics_PlanarPairValue.SetActualRotation (method)
  SetActualRotation(theActualRotation: number): void;

  // StepKinematics_PlanarPairValue.ActualTranslationX (method)
  ActualTranslationX(): number;

  // StepKinematics_PlanarPairValue.SetActualTranslationX (method)
  SetActualTranslationX(theActualTranslationX: number): void;

  // StepKinematics_PlanarPairValue.ActualTranslationY (method)
  ActualTranslationY(): number;

  // StepKinematics_PlanarPairValue.SetActualTranslationY (method)
  SetActualTranslationY(theActualTranslationY: number): void;

  // StepKinematics_PlanarPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PlanarPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PlanarPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PlanarPairValue.delete (method)
  delete(): void;

  // StepKinematics_PlanarPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PlanarPairWithRange: declare class StepKinematics_PlanarPairWithRange extends StepKinematics_PlanarPair

  // StepKinematics_PlanarPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_PlanarPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number, hasLowerLimitActualTranslationX: boolean, theLowerLimitActualTranslationX: number, hasUpperLimitActualTranslationX: boolean, theUpperLimitActualTranslationX: number, hasLowerLimitActualTranslationY: boolean, theLowerLimitActualTranslationY: number, hasUpperLimitActualTranslationY: boolean, theUpperLimitActualTranslationY: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PlanarPairWithRange.LowerLimitActualRotation (method)
  LowerLimitActualRotation(): number;

  // StepKinematics_PlanarPairWithRange.SetLowerLimitActualRotation (method)
  SetLowerLimitActualRotation(theLowerLimitActualRotation: number): void;

  // StepKinematics_PlanarPairWithRange.HasLowerLimitActualRotation (method)
  HasLowerLimitActualRotation(): boolean;

  // StepKinematics_PlanarPairWithRange.UpperLimitActualRotation (method)
  UpperLimitActualRotation(): number;

  // StepKinematics_PlanarPairWithRange.SetUpperLimitActualRotation (method)
  SetUpperLimitActualRotation(theUpperLimitActualRotation: number): void;

  // StepKinematics_PlanarPairWithRange.HasUpperLimitActualRotation (method)
  HasUpperLimitActualRotation(): boolean;

  // StepKinematics_PlanarPairWithRange.LowerLimitActualTranslationX (method)
  LowerLimitActualTranslationX(): number;

  // StepKinematics_PlanarPairWithRange.SetLowerLimitActualTranslationX (method)
  SetLowerLimitActualTranslationX(theLowerLimitActualTranslationX: number): void;

  // StepKinematics_PlanarPairWithRange.HasLowerLimitActualTranslationX (method)
  HasLowerLimitActualTranslationX(): boolean;

  // StepKinematics_PlanarPairWithRange.UpperLimitActualTranslationX (method)
  UpperLimitActualTranslationX(): number;

  // StepKinematics_PlanarPairWithRange.SetUpperLimitActualTranslationX (method)
  SetUpperLimitActualTranslationX(theUpperLimitActualTranslationX: number): void;

  // StepKinematics_PlanarPairWithRange.HasUpperLimitActualTranslationX (method)
  HasUpperLimitActualTranslationX(): boolean;

  // StepKinematics_PlanarPairWithRange.LowerLimitActualTranslationY (method)
  LowerLimitActualTranslationY(): number;

  // StepKinematics_PlanarPairWithRange.SetLowerLimitActualTranslationY (method)
  SetLowerLimitActualTranslationY(theLowerLimitActualTranslationY: number): void;

  // StepKinematics_PlanarPairWithRange.HasLowerLimitActualTranslationY (method)
  HasLowerLimitActualTranslationY(): boolean;

  // StepKinematics_PlanarPairWithRange.UpperLimitActualTranslationY (method)
  UpperLimitActualTranslationY(): number;

  // StepKinematics_PlanarPairWithRange.SetUpperLimitActualTranslationY (method)
  SetUpperLimitActualTranslationY(theUpperLimitActualTranslationY: number): void;

  // StepKinematics_PlanarPairWithRange.HasUpperLimitActualTranslationY (method)
  HasUpperLimitActualTranslationY(): boolean;

  // StepKinematics_PlanarPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PlanarPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PlanarPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PlanarPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_PlanarPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PointOnPlanarCurvePair: declare class StepKinematics_PointOnPlanarCurvePair extends StepKinematics_HighOrderKinematicPair

  // StepKinematics_PointOnPlanarCurvePair.constructor (constructor)
  constructor();

  // StepKinematics_PointOnPlanarCurvePair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PointOnPlanarCurvePair.PairCurve (method)
  PairCurve(): StepGeom_Curve;

  // StepKinematics_PointOnPlanarCurvePair.SetPairCurve (method)
  SetPairCurve(thePairCurve: StepGeom_Curve): void;

  // StepKinematics_PointOnPlanarCurvePair.Orientation (method)
  Orientation(): boolean;

  // StepKinematics_PointOnPlanarCurvePair.SetOrientation (method)
  SetOrientation(theOrientation: boolean): void;

  // StepKinematics_PointOnPlanarCurvePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PointOnPlanarCurvePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PointOnPlanarCurvePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PointOnPlanarCurvePair.delete (method)
  delete(): void;

  // StepKinematics_PointOnPlanarCurvePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PointOnPlanarCurvePairValue: declare class StepKinematics_PointOnPlanarCurvePairValue extends StepKinematics_PairValue

  // StepKinematics_PointOnPlanarCurvePairValue.constructor (constructor)
  constructor();

  // StepKinematics_PointOnPlanarCurvePairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve: StepGeom_PointOnCurve, theInputOrientation: StepKinematics_SpatialRotation): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PointOnPlanarCurvePairValue.ActualPointOnCurve (method)
  ActualPointOnCurve(): StepGeom_PointOnCurve;

  // StepKinematics_PointOnPlanarCurvePairValue.SetActualPointOnCurve (method)
  SetActualPointOnCurve(theActualPointOnCurve: StepGeom_PointOnCurve): void;

  // StepKinematics_PointOnPlanarCurvePairValue.InputOrientation (method)
  InputOrientation(): StepKinematics_SpatialRotation;

  // StepKinematics_PointOnPlanarCurvePairValue.SetInputOrientation (method)
  SetInputOrientation(theInputOrientation: StepKinematics_SpatialRotation): void;

  // StepKinematics_PointOnPlanarCurvePairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PointOnPlanarCurvePairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PointOnPlanarCurvePairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PointOnPlanarCurvePairValue.delete (method)
  delete(): void;

  // StepKinematics_PointOnPlanarCurvePairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PointOnPlanarCurvePairWithRange: declare class StepKinematics_PointOnPlanarCurvePairWithRange extends StepKinematics_PointOnPlanarCurvePair

  // StepKinematics_PointOnPlanarCurvePairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_PointOnPlanarCurvePairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnPlanarCurvePair_PairCurve: StepGeom_Curve, thePointOnPlanarCurvePair_Orientation: boolean, theRangeOnPairCurve: StepGeom_TrimmedCurve, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.RangeOnPairCurve (method)
  RangeOnPairCurve(): StepGeom_TrimmedCurve;

  // StepKinematics_PointOnPlanarCurvePairWithRange.SetRangeOnPairCurve (method)
  SetRangeOnPairCurve(theRangeOnPairCurve: StepGeom_TrimmedCurve): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.LowerLimitYaw (method)
  LowerLimitYaw(): number;

  // StepKinematics_PointOnPlanarCurvePairWithRange.SetLowerLimitYaw (method)
  SetLowerLimitYaw(theLowerLimitYaw: number): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.HasLowerLimitYaw (method)
  HasLowerLimitYaw(): boolean;

  // StepKinematics_PointOnPlanarCurvePairWithRange.UpperLimitYaw (method)
  UpperLimitYaw(): number;

  // StepKinematics_PointOnPlanarCurvePairWithRange.SetUpperLimitYaw (method)
  SetUpperLimitYaw(theUpperLimitYaw: number): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.HasUpperLimitYaw (method)
  HasUpperLimitYaw(): boolean;

  // StepKinematics_PointOnPlanarCurvePairWithRange.LowerLimitPitch (method)
  LowerLimitPitch(): number;

  // StepKinematics_PointOnPlanarCurvePairWithRange.SetLowerLimitPitch (method)
  SetLowerLimitPitch(theLowerLimitPitch: number): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.HasLowerLimitPitch (method)
  HasLowerLimitPitch(): boolean;

  // StepKinematics_PointOnPlanarCurvePairWithRange.UpperLimitPitch (method)
  UpperLimitPitch(): number;

  // StepKinematics_PointOnPlanarCurvePairWithRange.SetUpperLimitPitch (method)
  SetUpperLimitPitch(theUpperLimitPitch: number): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.HasUpperLimitPitch (method)
  HasUpperLimitPitch(): boolean;

  // StepKinematics_PointOnPlanarCurvePairWithRange.LowerLimitRoll (method)
  LowerLimitRoll(): number;

  // StepKinematics_PointOnPlanarCurvePairWithRange.SetLowerLimitRoll (method)
  SetLowerLimitRoll(theLowerLimitRoll: number): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.HasLowerLimitRoll (method)
  HasLowerLimitRoll(): boolean;

  // StepKinematics_PointOnPlanarCurvePairWithRange.UpperLimitRoll (method)
  UpperLimitRoll(): number;

  // StepKinematics_PointOnPlanarCurvePairWithRange.SetUpperLimitRoll (method)
  SetUpperLimitRoll(theUpperLimitRoll: number): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.HasUpperLimitRoll (method)
  HasUpperLimitRoll(): boolean;

  // StepKinematics_PointOnPlanarCurvePairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PointOnPlanarCurvePairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PointOnPlanarCurvePairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PointOnPlanarCurvePairWithRange.delete (method)
  delete(): void;

  // StepKinematics_PointOnPlanarCurvePairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PointOnSurfacePair: declare class StepKinematics_PointOnSurfacePair extends StepKinematics_HighOrderKinematicPair

  // StepKinematics_PointOnSurfacePair.constructor (constructor)
  constructor();

  // StepKinematics_PointOnSurfacePair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PointOnSurfacePair.PairSurface (method)
  PairSurface(): StepGeom_Surface;

  // StepKinematics_PointOnSurfacePair.SetPairSurface (method)
  SetPairSurface(thePairSurface: StepGeom_Surface): void;

  // StepKinematics_PointOnSurfacePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PointOnSurfacePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PointOnSurfacePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PointOnSurfacePair.delete (method)
  delete(): void;

  // StepKinematics_PointOnSurfacePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
