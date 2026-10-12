# libcascade — StepKinematics

28 top-level symbols. Signatures are verbatim typescript.

StepKinematics_ActuatedDirection: typeof StepKinematics_ActuatedDirection[keyof typeof StepKinematics_ActuatedDirection]

  readonly StepKinematics_adBidirectional: 'StepKinematics_adBidirectional'

  readonly StepKinematics_adPositiveOnly: 'StepKinematics_adPositiveOnly'

  readonly StepKinematics_adNegativeOnly: 'StepKinematics_adNegativeOnly'

  readonly StepKinematics_adNotActuated: 'StepKinematics_adNotActuated'

StepKinematics_ActuatedKinPairAndOrderKinPair: declare class StepKinematics_ActuatedKinPairAndOrderKinPair extends StepKinematics_KinematicPair

  // StepKinematics_ActuatedKinPairAndOrderKinPair.constructor (constructor)
  constructor();

  // StepKinematics_ActuatedKinPairAndOrderKinPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint, theActuatedKinematicPair: StepKinematics_ActuatedKinematicPair, theOrderKinematicPair: StepKinematics_KinematicPair): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.SetActuatedKinematicPair (method)
  SetActuatedKinematicPair(aKP: StepKinematics_ActuatedKinematicPair): void;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.GetActuatedKinematicPair (method)
  GetActuatedKinematicPair(): StepKinematics_ActuatedKinematicPair;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.SetOrderKinematicPair (method)
  SetOrderKinematicPair(aKP: StepKinematics_KinematicPair): void;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.GetOrderKinematicPair (method)
  GetOrderKinematicPair(): StepKinematics_KinematicPair;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.delete (method)
  delete(): void;

  // StepKinematics_ActuatedKinPairAndOrderKinPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_ActuatedKinematicPair: declare class StepKinematics_ActuatedKinematicPair extends StepKinematics_KinematicPair

  // StepKinematics_ActuatedKinematicPair.constructor (constructor)
  constructor();

  // StepKinematics_ActuatedKinematicPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, hasTX: boolean, theTX: StepKinematics_ActuatedDirection, hasTY: boolean, theTY: StepKinematics_ActuatedDirection, hasTZ: boolean, theTZ: StepKinematics_ActuatedDirection, hasRX: boolean, theRX: StepKinematics_ActuatedDirection, hasRY: boolean, theRY: StepKinematics_ActuatedDirection, hasRZ: boolean, theRZ: StepKinematics_ActuatedDirection): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_ActuatedKinematicPair.TX (method)
  TX(): StepKinematics_ActuatedDirection;

  // StepKinematics_ActuatedKinematicPair.SetTX (method)
  SetTX(theTX: StepKinematics_ActuatedDirection): void;

  // StepKinematics_ActuatedKinematicPair.HasTX (method)
  HasTX(): boolean;

  // StepKinematics_ActuatedKinematicPair.TY (method)
  TY(): StepKinematics_ActuatedDirection;

  // StepKinematics_ActuatedKinematicPair.SetTY (method)
  SetTY(theTY: StepKinematics_ActuatedDirection): void;

  // StepKinematics_ActuatedKinematicPair.HasTY (method)
  HasTY(): boolean;

  // StepKinematics_ActuatedKinematicPair.TZ (method)
  TZ(): StepKinematics_ActuatedDirection;

  // StepKinematics_ActuatedKinematicPair.SetTZ (method)
  SetTZ(theTZ: StepKinematics_ActuatedDirection): void;

  // StepKinematics_ActuatedKinematicPair.HasTZ (method)
  HasTZ(): boolean;

  // StepKinematics_ActuatedKinematicPair.RX (method)
  RX(): StepKinematics_ActuatedDirection;

  // StepKinematics_ActuatedKinematicPair.SetRX (method)
  SetRX(theRX: StepKinematics_ActuatedDirection): void;

  // StepKinematics_ActuatedKinematicPair.HasRX (method)
  HasRX(): boolean;

  // StepKinematics_ActuatedKinematicPair.RY (method)
  RY(): StepKinematics_ActuatedDirection;

  // StepKinematics_ActuatedKinematicPair.SetRY (method)
  SetRY(theRY: StepKinematics_ActuatedDirection): void;

  // StepKinematics_ActuatedKinematicPair.HasRY (method)
  HasRY(): boolean;

  // StepKinematics_ActuatedKinematicPair.RZ (method)
  RZ(): StepKinematics_ActuatedDirection;

  // StepKinematics_ActuatedKinematicPair.SetRZ (method)
  SetRZ(theRZ: StepKinematics_ActuatedDirection): void;

  // StepKinematics_ActuatedKinematicPair.HasRZ (method)
  HasRZ(): boolean;

  // StepKinematics_ActuatedKinematicPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_ActuatedKinematicPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_ActuatedKinematicPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_ActuatedKinematicPair.delete (method)
  delete(): void;

  // StepKinematics_ActuatedKinematicPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_ContextDependentKinematicLinkRepresentation: declare class StepKinematics_ContextDependentKinematicLinkRepresentation extends Standard_Transient

  // StepKinematics_ContextDependentKinematicLinkRepresentation.constructor (constructor)
  constructor();

  // StepKinematics_ContextDependentKinematicLinkRepresentation.Init (method)
  Init(theRepresentationRelation: StepKinematics_KinematicLinkRepresentationAssociation, theRepresentedProductRelation: StepKinematics_ProductDefinitionRelationshipKinematics): void;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.RepresentationRelation (method)
  RepresentationRelation(): StepKinematics_KinematicLinkRepresentationAssociation;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.SetRepresentationRelation (method)
  SetRepresentationRelation(theRepresentationRelation: StepKinematics_KinematicLinkRepresentationAssociation): void;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.RepresentedProductRelation (method)
  RepresentedProductRelation(): StepKinematics_ProductDefinitionRelationshipKinematics;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.SetRepresentedProductRelation (method)
  SetRepresentedProductRelation(theRepresentedProductRelation: StepKinematics_ProductDefinitionRelationshipKinematics): void;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.delete (method)
  delete(): void;

  // StepKinematics_ContextDependentKinematicLinkRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_CylindricalPair: declare class StepKinematics_CylindricalPair extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_CylindricalPair.constructor (constructor)
  constructor();

  // StepKinematics_CylindricalPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_CylindricalPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_CylindricalPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_CylindricalPair.delete (method)
  delete(): void;

  // StepKinematics_CylindricalPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_CylindricalPairValue: declare class StepKinematics_CylindricalPairValue extends StepKinematics_PairValue

  // StepKinematics_CylindricalPairValue.constructor (constructor)
  constructor();

  // StepKinematics_CylindricalPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslation: number, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_CylindricalPairValue.ActualTranslation (method)
  ActualTranslation(): number;

  // StepKinematics_CylindricalPairValue.SetActualTranslation (method)
  SetActualTranslation(theActualTranslation: number): void;

  // StepKinematics_CylindricalPairValue.ActualRotation (method)
  ActualRotation(): number;

  // StepKinematics_CylindricalPairValue.SetActualRotation (method)
  SetActualRotation(theActualRotation: number): void;

  // StepKinematics_CylindricalPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_CylindricalPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_CylindricalPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_CylindricalPairValue.delete (method)
  delete(): void;

  // StepKinematics_CylindricalPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_CylindricalPairWithRange: declare class StepKinematics_CylindricalPairWithRange extends StepKinematics_CylindricalPair

  // StepKinematics_CylindricalPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_CylindricalPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualTranslation: boolean, theLowerLimitActualTranslation: number, hasUpperLimitActualTranslation: boolean, theUpperLimitActualTranslation: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_CylindricalPairWithRange.LowerLimitActualTranslation (method)
  LowerLimitActualTranslation(): number;

  // StepKinematics_CylindricalPairWithRange.SetLowerLimitActualTranslation (method)
  SetLowerLimitActualTranslation(theLowerLimitActualTranslation: number): void;

  // StepKinematics_CylindricalPairWithRange.HasLowerLimitActualTranslation (method)
  HasLowerLimitActualTranslation(): boolean;

  // StepKinematics_CylindricalPairWithRange.UpperLimitActualTranslation (method)
  UpperLimitActualTranslation(): number;

  // StepKinematics_CylindricalPairWithRange.SetUpperLimitActualTranslation (method)
  SetUpperLimitActualTranslation(theUpperLimitActualTranslation: number): void;

  // StepKinematics_CylindricalPairWithRange.HasUpperLimitActualTranslation (method)
  HasUpperLimitActualTranslation(): boolean;

  // StepKinematics_CylindricalPairWithRange.LowerLimitActualRotation (method)
  LowerLimitActualRotation(): number;

  // StepKinematics_CylindricalPairWithRange.SetLowerLimitActualRotation (method)
  SetLowerLimitActualRotation(theLowerLimitActualRotation: number): void;

  // StepKinematics_CylindricalPairWithRange.HasLowerLimitActualRotation (method)
  HasLowerLimitActualRotation(): boolean;

  // StepKinematics_CylindricalPairWithRange.UpperLimitActualRotation (method)
  UpperLimitActualRotation(): number;

  // StepKinematics_CylindricalPairWithRange.SetUpperLimitActualRotation (method)
  SetUpperLimitActualRotation(theUpperLimitActualRotation: number): void;

  // StepKinematics_CylindricalPairWithRange.HasUpperLimitActualRotation (method)
  HasUpperLimitActualRotation(): boolean;

  // StepKinematics_CylindricalPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_CylindricalPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_CylindricalPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_CylindricalPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_CylindricalPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_FullyConstrainedPair: declare class StepKinematics_FullyConstrainedPair extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_FullyConstrainedPair.constructor (constructor)
  constructor();

  // StepKinematics_FullyConstrainedPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_FullyConstrainedPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_FullyConstrainedPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_FullyConstrainedPair.delete (method)
  delete(): void;

  // StepKinematics_FullyConstrainedPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_GearPair: declare class StepKinematics_GearPair extends StepKinematics_LowOrderKinematicPairWithMotionCoupling

  // StepKinematics_GearPair.constructor (constructor)
  constructor();

  // StepKinematics_GearPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theRadiusFirstLink: number, theRadiusSecondLink: number, theBevel: number, theHelicalAngle: number, theGearRatio: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_GearPair.RadiusFirstLink (method)
  RadiusFirstLink(): number;

  // StepKinematics_GearPair.SetRadiusFirstLink (method)
  SetRadiusFirstLink(theRadiusFirstLink: number): void;

  // StepKinematics_GearPair.RadiusSecondLink (method)
  RadiusSecondLink(): number;

  // StepKinematics_GearPair.SetRadiusSecondLink (method)
  SetRadiusSecondLink(theRadiusSecondLink: number): void;

  // StepKinematics_GearPair.Bevel (method)
  Bevel(): number;

  // StepKinematics_GearPair.SetBevel (method)
  SetBevel(theBevel: number): void;

  // StepKinematics_GearPair.HelicalAngle (method)
  HelicalAngle(): number;

  // StepKinematics_GearPair.SetHelicalAngle (method)
  SetHelicalAngle(theHelicalAngle: number): void;

  // StepKinematics_GearPair.GearRatio (method)
  GearRatio(): number;

  // StepKinematics_GearPair.SetGearRatio (method)
  SetGearRatio(theGearRatio: number): void;

  // StepKinematics_GearPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_GearPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_GearPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_GearPair.delete (method)
  delete(): void;

  // StepKinematics_GearPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_GearPairValue: declare class StepKinematics_GearPairValue extends StepKinematics_PairValue

  // StepKinematics_GearPairValue.constructor (constructor)
  constructor();

  // StepKinematics_GearPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation1: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_GearPairValue.ActualRotation1 (method)
  ActualRotation1(): number;

  // StepKinematics_GearPairValue.SetActualRotation1 (method)
  SetActualRotation1(theActualRotation1: number): void;

  // StepKinematics_GearPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_GearPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_GearPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_GearPairValue.delete (method)
  delete(): void;

  // StepKinematics_GearPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_GearPairWithRange: declare class StepKinematics_GearPairWithRange extends StepKinematics_GearPair

  // StepKinematics_GearPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_GearPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theGearPair_RadiusFirstLink: number, theGearPair_RadiusSecondLink: number, theGearPair_Bevel: number, theGearPair_HelicalAngle: number, theGearPair_GearRatio: number, hasLowerLimitActualRotation1: boolean, theLowerLimitActualRotation1: number, hasUpperLimitActualRotation1: boolean, theUpperLimitActualRotation1: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theRadiusFirstLink: number, theRadiusSecondLink: number, theBevel: number, theHelicalAngle: number, theGearRatio: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_GearPairWithRange.LowerLimitActualRotation1 (method)
  LowerLimitActualRotation1(): number;

  // StepKinematics_GearPairWithRange.SetLowerLimitActualRotation1 (method)
  SetLowerLimitActualRotation1(theLowerLimitActualRotation1: number): void;

  // StepKinematics_GearPairWithRange.HasLowerLimitActualRotation1 (method)
  HasLowerLimitActualRotation1(): boolean;

  // StepKinematics_GearPairWithRange.UpperLimitActualRotation1 (method)
  UpperLimitActualRotation1(): number;

  // StepKinematics_GearPairWithRange.SetUpperLimitActualRotation1 (method)
  SetUpperLimitActualRotation1(theUpperLimitActualRotation1: number): void;

  // StepKinematics_GearPairWithRange.HasUpperLimitActualRotation1 (method)
  HasUpperLimitActualRotation1(): boolean;

  // StepKinematics_GearPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_GearPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_GearPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_GearPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_GearPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_HighOrderKinematicPair: declare class StepKinematics_HighOrderKinematicPair extends StepKinematics_KinematicPair

  // StepKinematics_HighOrderKinematicPair.constructor (constructor)
  constructor();

  // StepKinematics_HighOrderKinematicPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_HighOrderKinematicPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_HighOrderKinematicPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_HighOrderKinematicPair.delete (method)
  delete(): void;

  // StepKinematics_HighOrderKinematicPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_HomokineticPair: declare class StepKinematics_HomokineticPair extends StepKinematics_UniversalPair

  // StepKinematics_HomokineticPair.constructor (constructor)
  constructor();

  // StepKinematics_HomokineticPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_HomokineticPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_HomokineticPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_HomokineticPair.delete (method)
  delete(): void;

  // StepKinematics_HomokineticPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicJoint: declare class StepKinematics_KinematicJoint extends StepShape_Edge

  // StepKinematics_KinematicJoint.constructor (constructor)
  constructor();

  // StepKinematics_KinematicJoint.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicJoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicJoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicJoint.delete (method)
  delete(): void;

  // StepKinematics_KinematicJoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicLink: declare class StepKinematics_KinematicLink extends StepShape_Vertex

  // StepKinematics_KinematicLink.constructor (constructor)
  constructor();

  // StepKinematics_KinematicLink.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicLink.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicLink.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicLink.delete (method)
  delete(): void;

  // StepKinematics_KinematicLink.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicLinkRepresentation: declare class StepKinematics_KinematicLinkRepresentation extends StepRepr_Representation

  // StepKinematics_KinematicLinkRepresentation.constructor (constructor)
  constructor();

  // StepKinematics_KinematicLinkRepresentation.Init (method)
  Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theRepresentedLink: StepKinematics_KinematicLink): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepKinematics_KinematicLinkRepresentation.RepresentedLink (method)
  RepresentedLink(): StepKinematics_KinematicLink;

  // StepKinematics_KinematicLinkRepresentation.SetRepresentedLink (method)
  SetRepresentedLink(theRepresentedLink: StepKinematics_KinematicLink): void;

  // StepKinematics_KinematicLinkRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicLinkRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicLinkRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicLinkRepresentation.delete (method)
  delete(): void;

  // StepKinematics_KinematicLinkRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicLinkRepresentationAssociation: declare class StepKinematics_KinematicLinkRepresentationAssociation extends StepRepr_RepresentationRelationship

  // StepKinematics_KinematicLinkRepresentationAssociation.constructor (constructor)
  constructor();

  // StepKinematics_KinematicLinkRepresentationAssociation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicLinkRepresentationAssociation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicLinkRepresentationAssociation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicLinkRepresentationAssociation.delete (method)
  delete(): void;

  // StepKinematics_KinematicLinkRepresentationAssociation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicPair: declare class StepKinematics_KinematicPair extends StepGeom_GeometricRepresentationItem

  // StepKinematics_KinematicPair.constructor (constructor)
  constructor();

  // StepKinematics_KinematicPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_KinematicPair.ItemDefinedTransformation (method)
  ItemDefinedTransformation(): StepRepr_ItemDefinedTransformation;

  // StepKinematics_KinematicPair.SetItemDefinedTransformation (method)
  SetItemDefinedTransformation(theItemDefinedTransformation: StepRepr_ItemDefinedTransformation): void;

  // StepKinematics_KinematicPair.Joint (method)
  Joint(): StepKinematics_KinematicJoint;

  // StepKinematics_KinematicPair.SetJoint (method)
  SetJoint(theJoint: StepKinematics_KinematicJoint): void;

  // StepKinematics_KinematicPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicPair.delete (method)
  delete(): void;

  // StepKinematics_KinematicPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicPropertyDefinitionRepresentation: declare class StepKinematics_KinematicPropertyDefinitionRepresentation extends StepRepr_PropertyDefinitionRepresentation

  // StepKinematics_KinematicPropertyDefinitionRepresentation.constructor (constructor)
  constructor();

  // StepKinematics_KinematicPropertyDefinitionRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicPropertyDefinitionRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicPropertyDefinitionRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicPropertyDefinitionRepresentation.delete (method)
  delete(): void;

  // StepKinematics_KinematicPropertyDefinitionRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicPropertyMechanismRepresentation: declare class StepKinematics_KinematicPropertyMechanismRepresentation extends StepKinematics_KinematicPropertyDefinitionRepresentation

  // StepKinematics_KinematicPropertyMechanismRepresentation.constructor (constructor)
  constructor();

  // StepKinematics_KinematicPropertyMechanismRepresentation.Init (method)
  Init(thePropertyDefinitionRepresentation_Definition: StepRepr_RepresentedDefinition, thePropertyDefinitionRepresentation_UsedRepresentation: StepRepr_Representation, theBase: StepKinematics_KinematicLinkRepresentation): void;
  Init(aDefinition: StepRepr_RepresentedDefinition, aUsedRepresentation: StepRepr_Representation): void;

  // StepKinematics_KinematicPropertyMechanismRepresentation.Base (method)
  Base(): StepKinematics_KinematicLinkRepresentation;

  // StepKinematics_KinematicPropertyMechanismRepresentation.SetBase (method)
  SetBase(theBase: StepKinematics_KinematicLinkRepresentation): void;

  // StepKinematics_KinematicPropertyMechanismRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicPropertyMechanismRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicPropertyMechanismRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicPropertyMechanismRepresentation.delete (method)
  delete(): void;

  // StepKinematics_KinematicPropertyMechanismRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicTopologyDirectedStructure: declare class StepKinematics_KinematicTopologyDirectedStructure extends StepRepr_Representation

  // StepKinematics_KinematicTopologyDirectedStructure.constructor (constructor)
  constructor();

  // StepKinematics_KinematicTopologyDirectedStructure.Init (method)
  Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theParent: StepKinematics_KinematicTopologyStructure): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepKinematics_KinematicTopologyDirectedStructure.Parent (method)
  Parent(): StepKinematics_KinematicTopologyStructure;

  // StepKinematics_KinematicTopologyDirectedStructure.SetParent (method)
  SetParent(theParent: StepKinematics_KinematicTopologyStructure): void;

  // StepKinematics_KinematicTopologyDirectedStructure.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicTopologyDirectedStructure.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicTopologyDirectedStructure.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicTopologyDirectedStructure.delete (method)
  delete(): void;

  // StepKinematics_KinematicTopologyDirectedStructure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicTopologyNetworkStructure: declare class StepKinematics_KinematicTopologyNetworkStructure extends StepRepr_Representation

  // StepKinematics_KinematicTopologyNetworkStructure.constructor (constructor)
  constructor();

  // StepKinematics_KinematicTopologyNetworkStructure.Init (method)
  Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theParent: StepKinematics_KinematicTopologyStructure): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepKinematics_KinematicTopologyNetworkStructure.Parent (method)
  Parent(): StepKinematics_KinematicTopologyStructure;

  // StepKinematics_KinematicTopologyNetworkStructure.SetParent (method)
  SetParent(theParent: StepKinematics_KinematicTopologyStructure): void;

  // StepKinematics_KinematicTopologyNetworkStructure.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicTopologyNetworkStructure.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicTopologyNetworkStructure.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicTopologyNetworkStructure.delete (method)
  delete(): void;

  // StepKinematics_KinematicTopologyNetworkStructure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicTopologyRepresentationSelect: declare class StepKinematics_KinematicTopologyRepresentationSelect extends StepData_SelectType

  // StepKinematics_KinematicTopologyRepresentationSelect.constructor (constructor)
  constructor();

  // StepKinematics_KinematicTopologyRepresentationSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepKinematics_KinematicTopologyRepresentationSelect.KinematicTopologyDirectedStructure (method)
  KinematicTopologyDirectedStructure(): StepKinematics_KinematicTopologyDirectedStructure;

  // StepKinematics_KinematicTopologyRepresentationSelect.KinematicTopologyNetworkStructure (method)
  KinematicTopologyNetworkStructure(): StepKinematics_KinematicTopologyNetworkStructure;

  // StepKinematics_KinematicTopologyRepresentationSelect.KinematicTopologyStructure (method)
  KinematicTopologyStructure(): StepKinematics_KinematicTopologyStructure;

  // StepKinematics_KinematicTopologyRepresentationSelect.delete (method)
  delete(): void;

  // StepKinematics_KinematicTopologyRepresentationSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_KinematicTopologyStructure: declare class StepKinematics_KinematicTopologyStructure extends StepRepr_Representation

  // StepKinematics_KinematicTopologyStructure.constructor (constructor)
  constructor();

  // StepKinematics_KinematicTopologyStructure.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_KinematicTopologyStructure.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_KinematicTopologyStructure.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_KinematicTopologyStructure.delete (method)
  delete(): void;

  // StepKinematics_KinematicTopologyStructure.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_LinearFlexibleAndPinionPair: declare class StepKinematics_LinearFlexibleAndPinionPair extends StepKinematics_LowOrderKinematicPairWithMotionCoupling

  // StepKinematics_LinearFlexibleAndPinionPair.constructor (constructor)
  constructor();

  // StepKinematics_LinearFlexibleAndPinionPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePinionRadius: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_LinearFlexibleAndPinionPair.PinionRadius (method)
  PinionRadius(): number;

  // StepKinematics_LinearFlexibleAndPinionPair.SetPinionRadius (method)
  SetPinionRadius(thePinionRadius: number): void;

  // StepKinematics_LinearFlexibleAndPinionPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_LinearFlexibleAndPinionPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_LinearFlexibleAndPinionPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_LinearFlexibleAndPinionPair.delete (method)
  delete(): void;

  // StepKinematics_LinearFlexibleAndPinionPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_LinearFlexibleAndPlanarCurvePair: declare class StepKinematics_LinearFlexibleAndPlanarCurvePair extends StepKinematics_HighOrderKinematicPair

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.constructor (constructor)
  constructor();

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairCurve: StepGeom_Curve, theOrientation: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.PairCurve (method)
  PairCurve(): StepGeom_Curve;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.SetPairCurve (method)
  SetPairCurve(thePairCurve: StepGeom_Curve): void;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.Orientation (method)
  Orientation(): boolean;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.SetOrientation (method)
  SetOrientation(theOrientation: boolean): void;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.delete (method)
  delete(): void;

  // StepKinematics_LinearFlexibleAndPlanarCurvePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_LinearFlexibleLinkRepresentation: declare class StepKinematics_LinearFlexibleLinkRepresentation extends StepKinematics_KinematicLinkRepresentation

  // StepKinematics_LinearFlexibleLinkRepresentation.constructor (constructor)
  constructor();

  // StepKinematics_LinearFlexibleLinkRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_LinearFlexibleLinkRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_LinearFlexibleLinkRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_LinearFlexibleLinkRepresentation.delete (method)
  delete(): void;

  // StepKinematics_LinearFlexibleLinkRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_LowOrderKinematicPair: declare class StepKinematics_LowOrderKinematicPair extends StepKinematics_KinematicPair

  // StepKinematics_LowOrderKinematicPair.constructor (constructor)
  constructor();

  // StepKinematics_LowOrderKinematicPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_LowOrderKinematicPair.TX (method)
  TX(): boolean;

  // StepKinematics_LowOrderKinematicPair.SetTX (method)
  SetTX(theTX: boolean): void;

  // StepKinematics_LowOrderKinematicPair.TY (method)
  TY(): boolean;

  // StepKinematics_LowOrderKinematicPair.SetTY (method)
  SetTY(theTY: boolean): void;

  // StepKinematics_LowOrderKinematicPair.TZ (method)
  TZ(): boolean;

  // StepKinematics_LowOrderKinematicPair.SetTZ (method)
  SetTZ(theTZ: boolean): void;

  // StepKinematics_LowOrderKinematicPair.RX (method)
  RX(): boolean;

  // StepKinematics_LowOrderKinematicPair.SetRX (method)
  SetRX(theRX: boolean): void;

  // StepKinematics_LowOrderKinematicPair.RY (method)
  RY(): boolean;

  // StepKinematics_LowOrderKinematicPair.SetRY (method)
  SetRY(theRY: boolean): void;

  // StepKinematics_LowOrderKinematicPair.RZ (method)
  RZ(): boolean;

  // StepKinematics_LowOrderKinematicPair.SetRZ (method)
  SetRZ(theRZ: boolean): void;

  // StepKinematics_LowOrderKinematicPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_LowOrderKinematicPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_LowOrderKinematicPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_LowOrderKinematicPair.delete (method)
  delete(): void;

  // StepKinematics_LowOrderKinematicPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
