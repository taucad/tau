# libcascade — StepKinematics (3)

27 top-level symbols. Signatures are verbatim typescript.

StepKinematics_PointOnSurfacePairValue: declare class StepKinematics_PointOnSurfacePairValue extends StepKinematics_PairValue

  // StepKinematics_PointOnSurfacePairValue.constructor (constructor)
  constructor();

  // StepKinematics_PointOnSurfacePairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface: StepGeom_PointOnSurface, theInputOrientation: StepKinematics_SpatialRotation): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PointOnSurfacePairValue.ActualPointOnSurface (method)
  ActualPointOnSurface(): StepGeom_PointOnSurface;

  // StepKinematics_PointOnSurfacePairValue.SetActualPointOnSurface (method)
  SetActualPointOnSurface(theActualPointOnSurface: StepGeom_PointOnSurface): void;

  // StepKinematics_PointOnSurfacePairValue.InputOrientation (method)
  InputOrientation(): StepKinematics_SpatialRotation;

  // StepKinematics_PointOnSurfacePairValue.SetInputOrientation (method)
  SetInputOrientation(theInputOrientation: StepKinematics_SpatialRotation): void;

  // StepKinematics_PointOnSurfacePairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PointOnSurfacePairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PointOnSurfacePairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PointOnSurfacePairValue.delete (method)
  delete(): void;

  // StepKinematics_PointOnSurfacePairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PointOnSurfacePairWithRange: declare class StepKinematics_PointOnSurfacePairWithRange extends StepKinematics_PointOnSurfacePair

  // StepKinematics_PointOnSurfacePairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_PointOnSurfacePairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePointOnSurfacePair_PairSurface: StepGeom_Surface, theRangeOnPairSurface: StepGeom_RectangularTrimmedSurface, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePairSurface: StepGeom_Surface): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PointOnSurfacePairWithRange.RangeOnPairSurface (method)
  RangeOnPairSurface(): StepGeom_RectangularTrimmedSurface;

  // StepKinematics_PointOnSurfacePairWithRange.SetRangeOnPairSurface (method)
  SetRangeOnPairSurface(theRangeOnPairSurface: StepGeom_RectangularTrimmedSurface): void;

  // StepKinematics_PointOnSurfacePairWithRange.LowerLimitYaw (method)
  LowerLimitYaw(): number;

  // StepKinematics_PointOnSurfacePairWithRange.SetLowerLimitYaw (method)
  SetLowerLimitYaw(theLowerLimitYaw: number): void;

  // StepKinematics_PointOnSurfacePairWithRange.HasLowerLimitYaw (method)
  HasLowerLimitYaw(): boolean;

  // StepKinematics_PointOnSurfacePairWithRange.UpperLimitYaw (method)
  UpperLimitYaw(): number;

  // StepKinematics_PointOnSurfacePairWithRange.SetUpperLimitYaw (method)
  SetUpperLimitYaw(theUpperLimitYaw: number): void;

  // StepKinematics_PointOnSurfacePairWithRange.HasUpperLimitYaw (method)
  HasUpperLimitYaw(): boolean;

  // StepKinematics_PointOnSurfacePairWithRange.LowerLimitPitch (method)
  LowerLimitPitch(): number;

  // StepKinematics_PointOnSurfacePairWithRange.SetLowerLimitPitch (method)
  SetLowerLimitPitch(theLowerLimitPitch: number): void;

  // StepKinematics_PointOnSurfacePairWithRange.HasLowerLimitPitch (method)
  HasLowerLimitPitch(): boolean;

  // StepKinematics_PointOnSurfacePairWithRange.UpperLimitPitch (method)
  UpperLimitPitch(): number;

  // StepKinematics_PointOnSurfacePairWithRange.SetUpperLimitPitch (method)
  SetUpperLimitPitch(theUpperLimitPitch: number): void;

  // StepKinematics_PointOnSurfacePairWithRange.HasUpperLimitPitch (method)
  HasUpperLimitPitch(): boolean;

  // StepKinematics_PointOnSurfacePairWithRange.LowerLimitRoll (method)
  LowerLimitRoll(): number;

  // StepKinematics_PointOnSurfacePairWithRange.SetLowerLimitRoll (method)
  SetLowerLimitRoll(theLowerLimitRoll: number): void;

  // StepKinematics_PointOnSurfacePairWithRange.HasLowerLimitRoll (method)
  HasLowerLimitRoll(): boolean;

  // StepKinematics_PointOnSurfacePairWithRange.UpperLimitRoll (method)
  UpperLimitRoll(): number;

  // StepKinematics_PointOnSurfacePairWithRange.SetUpperLimitRoll (method)
  SetUpperLimitRoll(theUpperLimitRoll: number): void;

  // StepKinematics_PointOnSurfacePairWithRange.HasUpperLimitRoll (method)
  HasUpperLimitRoll(): boolean;

  // StepKinematics_PointOnSurfacePairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PointOnSurfacePairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PointOnSurfacePairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PointOnSurfacePairWithRange.delete (method)
  delete(): void;

  // StepKinematics_PointOnSurfacePairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PrismaticPair: declare class StepKinematics_PrismaticPair extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_PrismaticPair.constructor (constructor)
  constructor();

  // StepKinematics_PrismaticPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PrismaticPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PrismaticPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PrismaticPair.delete (method)
  delete(): void;

  // StepKinematics_PrismaticPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PrismaticPairValue: declare class StepKinematics_PrismaticPairValue extends StepKinematics_PairValue

  // StepKinematics_PrismaticPairValue.constructor (constructor)
  constructor();

  // StepKinematics_PrismaticPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualTranslation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PrismaticPairValue.ActualTranslation (method)
  ActualTranslation(): number;

  // StepKinematics_PrismaticPairValue.SetActualTranslation (method)
  SetActualTranslation(theActualTranslation: number): void;

  // StepKinematics_PrismaticPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PrismaticPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PrismaticPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PrismaticPairValue.delete (method)
  delete(): void;

  // StepKinematics_PrismaticPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_PrismaticPairWithRange: declare class StepKinematics_PrismaticPairWithRange extends StepKinematics_PrismaticPair

  // StepKinematics_PrismaticPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_PrismaticPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualTranslation: boolean, theLowerLimitActualTranslation: number, hasUpperLimitActualTranslation: boolean, theUpperLimitActualTranslation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_PrismaticPairWithRange.LowerLimitActualTranslation (method)
  LowerLimitActualTranslation(): number;

  // StepKinematics_PrismaticPairWithRange.SetLowerLimitActualTranslation (method)
  SetLowerLimitActualTranslation(theLowerLimitActualTranslation: number): void;

  // StepKinematics_PrismaticPairWithRange.HasLowerLimitActualTranslation (method)
  HasLowerLimitActualTranslation(): boolean;

  // StepKinematics_PrismaticPairWithRange.UpperLimitActualTranslation (method)
  UpperLimitActualTranslation(): number;

  // StepKinematics_PrismaticPairWithRange.SetUpperLimitActualTranslation (method)
  SetUpperLimitActualTranslation(theUpperLimitActualTranslation: number): void;

  // StepKinematics_PrismaticPairWithRange.HasUpperLimitActualTranslation (method)
  HasUpperLimitActualTranslation(): boolean;

  // StepKinematics_PrismaticPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_PrismaticPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_PrismaticPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_PrismaticPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_PrismaticPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_ProductDefinitionKinematics: declare class StepKinematics_ProductDefinitionKinematics extends StepRepr_PropertyDefinition

  // StepKinematics_ProductDefinitionKinematics.constructor (constructor)
  constructor();

  // StepKinematics_ProductDefinitionKinematics.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_ProductDefinitionKinematics.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_ProductDefinitionKinematics.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_ProductDefinitionKinematics.delete (method)
  delete(): void;

  // StepKinematics_ProductDefinitionKinematics.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_ProductDefinitionRelationshipKinematics: declare class StepKinematics_ProductDefinitionRelationshipKinematics extends StepRepr_PropertyDefinition

  // StepKinematics_ProductDefinitionRelationshipKinematics.constructor (constructor)
  constructor();

  // StepKinematics_ProductDefinitionRelationshipKinematics.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_ProductDefinitionRelationshipKinematics.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_ProductDefinitionRelationshipKinematics.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_ProductDefinitionRelationshipKinematics.delete (method)
  delete(): void;

  // StepKinematics_ProductDefinitionRelationshipKinematics.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RackAndPinionPair: declare class StepKinematics_RackAndPinionPair extends StepKinematics_LowOrderKinematicPairWithMotionCoupling

  // StepKinematics_RackAndPinionPair.constructor (constructor)
  constructor();

  // StepKinematics_RackAndPinionPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePinionRadius: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_RackAndPinionPair.PinionRadius (method)
  PinionRadius(): number;

  // StepKinematics_RackAndPinionPair.SetPinionRadius (method)
  SetPinionRadius(thePinionRadius: number): void;

  // StepKinematics_RackAndPinionPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RackAndPinionPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RackAndPinionPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RackAndPinionPair.delete (method)
  delete(): void;

  // StepKinematics_RackAndPinionPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RackAndPinionPairValue: declare class StepKinematics_RackAndPinionPairValue extends StepKinematics_PairValue

  // StepKinematics_RackAndPinionPairValue.constructor (constructor)
  constructor();

  // StepKinematics_RackAndPinionPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualDisplacement: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_RackAndPinionPairValue.ActualDisplacement (method)
  ActualDisplacement(): number;

  // StepKinematics_RackAndPinionPairValue.SetActualDisplacement (method)
  SetActualDisplacement(theActualDisplacement: number): void;

  // StepKinematics_RackAndPinionPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RackAndPinionPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RackAndPinionPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RackAndPinionPairValue.delete (method)
  delete(): void;

  // StepKinematics_RackAndPinionPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RackAndPinionPairWithRange: declare class StepKinematics_RackAndPinionPairWithRange extends StepKinematics_RackAndPinionPair

  // StepKinematics_RackAndPinionPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_RackAndPinionPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theRackAndPinionPair_PinionRadius: number, hasLowerLimitRackDisplacement: boolean, theLowerLimitRackDisplacement: number, hasUpperLimitRackDisplacement: boolean, theUpperLimitRackDisplacement: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePinionRadius: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_RackAndPinionPairWithRange.LowerLimitRackDisplacement (method)
  LowerLimitRackDisplacement(): number;

  // StepKinematics_RackAndPinionPairWithRange.SetLowerLimitRackDisplacement (method)
  SetLowerLimitRackDisplacement(theLowerLimitRackDisplacement: number): void;

  // StepKinematics_RackAndPinionPairWithRange.HasLowerLimitRackDisplacement (method)
  HasLowerLimitRackDisplacement(): boolean;

  // StepKinematics_RackAndPinionPairWithRange.UpperLimitRackDisplacement (method)
  UpperLimitRackDisplacement(): number;

  // StepKinematics_RackAndPinionPairWithRange.SetUpperLimitRackDisplacement (method)
  SetUpperLimitRackDisplacement(theUpperLimitRackDisplacement: number): void;

  // StepKinematics_RackAndPinionPairWithRange.HasUpperLimitRackDisplacement (method)
  HasUpperLimitRackDisplacement(): boolean;

  // StepKinematics_RackAndPinionPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RackAndPinionPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RackAndPinionPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RackAndPinionPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_RackAndPinionPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RevolutePair: declare class StepKinematics_RevolutePair extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_RevolutePair.constructor (constructor)
  constructor();

  // StepKinematics_RevolutePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RevolutePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RevolutePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RevolutePair.delete (method)
  delete(): void;

  // StepKinematics_RevolutePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RevolutePairValue: declare class StepKinematics_RevolutePairValue extends StepKinematics_PairValue

  // StepKinematics_RevolutePairValue.constructor (constructor)
  constructor();

  // StepKinematics_RevolutePairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_RevolutePairValue.ActualRotation (method)
  ActualRotation(): number;

  // StepKinematics_RevolutePairValue.SetActualRotation (method)
  SetActualRotation(theActualRotation: number): void;

  // StepKinematics_RevolutePairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RevolutePairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RevolutePairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RevolutePairValue.delete (method)
  delete(): void;

  // StepKinematics_RevolutePairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RevolutePairWithRange: declare class StepKinematics_RevolutePairWithRange extends StepKinematics_RevolutePair

  // StepKinematics_RevolutePairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_RevolutePairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_RevolutePairWithRange.LowerLimitActualRotation (method)
  LowerLimitActualRotation(): number;

  // StepKinematics_RevolutePairWithRange.SetLowerLimitActualRotation (method)
  SetLowerLimitActualRotation(theLowerLimitActualRotation: number): void;

  // StepKinematics_RevolutePairWithRange.HasLowerLimitActualRotation (method)
  HasLowerLimitActualRotation(): boolean;

  // StepKinematics_RevolutePairWithRange.UpperLimitActualRotation (method)
  UpperLimitActualRotation(): number;

  // StepKinematics_RevolutePairWithRange.SetUpperLimitActualRotation (method)
  SetUpperLimitActualRotation(theUpperLimitActualRotation: number): void;

  // StepKinematics_RevolutePairWithRange.HasUpperLimitActualRotation (method)
  HasUpperLimitActualRotation(): boolean;

  // StepKinematics_RevolutePairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RevolutePairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RevolutePairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RevolutePairWithRange.delete (method)
  delete(): void;

  // StepKinematics_RevolutePairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RigidLinkRepresentation: declare class StepKinematics_RigidLinkRepresentation extends StepKinematics_KinematicLinkRepresentation

  // StepKinematics_RigidLinkRepresentation.constructor (constructor)
  constructor();

  // StepKinematics_RigidLinkRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RigidLinkRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RigidLinkRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RigidLinkRepresentation.delete (method)
  delete(): void;

  // StepKinematics_RigidLinkRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RigidPlacement: declare class StepKinematics_RigidPlacement extends StepData_SelectType

  // StepKinematics_RigidPlacement.constructor (constructor)
  constructor();

  // StepKinematics_RigidPlacement.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepKinematics_RigidPlacement.Axis2Placement3d (method)
  Axis2Placement3d(): StepGeom_Axis2Placement3d;

  // StepKinematics_RigidPlacement.SuParameters (method)
  SuParameters(): StepGeom_SuParameters;

  // StepKinematics_RigidPlacement.delete (method)
  delete(): void;

  // StepKinematics_RigidPlacement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RollingCurvePair: declare class StepKinematics_RollingCurvePair extends StepKinematics_PlanarCurvePair

  // StepKinematics_RollingCurvePair.constructor (constructor)
  constructor();

  // StepKinematics_RollingCurvePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RollingCurvePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RollingCurvePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RollingCurvePair.delete (method)
  delete(): void;

  // StepKinematics_RollingCurvePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RollingCurvePairValue: declare class StepKinematics_RollingCurvePairValue extends StepKinematics_PairValue

  // StepKinematics_RollingCurvePairValue.constructor (constructor)
  constructor();

  // StepKinematics_RollingCurvePairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve1: StepGeom_PointOnCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_RollingCurvePairValue.ActualPointOnCurve1 (method)
  ActualPointOnCurve1(): StepGeom_PointOnCurve;

  // StepKinematics_RollingCurvePairValue.SetActualPointOnCurve1 (method)
  SetActualPointOnCurve1(theActualPointOnCurve1: StepGeom_PointOnCurve): void;

  // StepKinematics_RollingCurvePairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RollingCurvePairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RollingCurvePairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RollingCurvePairValue.delete (method)
  delete(): void;

  // StepKinematics_RollingCurvePairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RollingSurfacePair: declare class StepKinematics_RollingSurfacePair extends StepKinematics_SurfacePair

  // StepKinematics_RollingSurfacePair.constructor (constructor)
  constructor();

  // StepKinematics_RollingSurfacePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RollingSurfacePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RollingSurfacePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RollingSurfacePair.delete (method)
  delete(): void;

  // StepKinematics_RollingSurfacePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RollingSurfacePairValue: declare class StepKinematics_RollingSurfacePairValue extends StepKinematics_PairValue

  // StepKinematics_RollingSurfacePairValue.constructor (constructor)
  constructor();

  // StepKinematics_RollingSurfacePairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface: StepGeom_PointOnSurface, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_RollingSurfacePairValue.ActualPointOnSurface (method)
  ActualPointOnSurface(): StepGeom_PointOnSurface;

  // StepKinematics_RollingSurfacePairValue.SetActualPointOnSurface (method)
  SetActualPointOnSurface(theActualPointOnSurface: StepGeom_PointOnSurface): void;

  // StepKinematics_RollingSurfacePairValue.ActualRotation (method)
  ActualRotation(): number;

  // StepKinematics_RollingSurfacePairValue.SetActualRotation (method)
  SetActualRotation(theActualRotation: number): void;

  // StepKinematics_RollingSurfacePairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RollingSurfacePairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RollingSurfacePairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RollingSurfacePairValue.delete (method)
  delete(): void;

  // StepKinematics_RollingSurfacePairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_RotationAboutDirection: declare class StepKinematics_RotationAboutDirection extends StepGeom_GeometricRepresentationItem

  // StepKinematics_RotationAboutDirection.constructor (constructor)
  constructor();

  // StepKinematics_RotationAboutDirection.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theDirectionOfAxis: StepGeom_Direction, theRotationAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_RotationAboutDirection.DirectionOfAxis (method)
  DirectionOfAxis(): StepGeom_Direction;

  // StepKinematics_RotationAboutDirection.SetDirectionOfAxis (method)
  SetDirectionOfAxis(theDirectionOfAxis: StepGeom_Direction): void;

  // StepKinematics_RotationAboutDirection.RotationAngle (method)
  RotationAngle(): number;

  // StepKinematics_RotationAboutDirection.SetRotationAngle (method)
  SetRotationAngle(theRotationAngle: number): void;

  // StepKinematics_RotationAboutDirection.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_RotationAboutDirection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_RotationAboutDirection.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_RotationAboutDirection.delete (method)
  delete(): void;

  // StepKinematics_RotationAboutDirection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_ScrewPair: declare class StepKinematics_ScrewPair extends StepKinematics_LowOrderKinematicPairWithMotionCoupling

  // StepKinematics_ScrewPair.constructor (constructor)
  constructor();

  // StepKinematics_ScrewPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_ScrewPair.Pitch (method)
  Pitch(): number;

  // StepKinematics_ScrewPair.SetPitch (method)
  SetPitch(thePitch: number): void;

  // StepKinematics_ScrewPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_ScrewPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_ScrewPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_ScrewPair.delete (method)
  delete(): void;

  // StepKinematics_ScrewPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_ScrewPairValue: declare class StepKinematics_ScrewPairValue extends StepKinematics_PairValue

  // StepKinematics_ScrewPairValue.constructor (constructor)
  constructor();

  // StepKinematics_ScrewPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_ScrewPairValue.ActualRotation (method)
  ActualRotation(): number;

  // StepKinematics_ScrewPairValue.SetActualRotation (method)
  SetActualRotation(theActualRotation: number): void;

  // StepKinematics_ScrewPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_ScrewPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_ScrewPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_ScrewPairValue.delete (method)
  delete(): void;

  // StepKinematics_ScrewPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_ScrewPairWithRange: declare class StepKinematics_ScrewPairWithRange extends StepKinematics_ScrewPair

  // StepKinematics_ScrewPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_ScrewPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theScrewPair_Pitch: number, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, thePitch: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_ScrewPairWithRange.LowerLimitActualRotation (method)
  LowerLimitActualRotation(): number;

  // StepKinematics_ScrewPairWithRange.SetLowerLimitActualRotation (method)
  SetLowerLimitActualRotation(theLowerLimitActualRotation: number): void;

  // StepKinematics_ScrewPairWithRange.HasLowerLimitActualRotation (method)
  HasLowerLimitActualRotation(): boolean;

  // StepKinematics_ScrewPairWithRange.UpperLimitActualRotation (method)
  UpperLimitActualRotation(): number;

  // StepKinematics_ScrewPairWithRange.SetUpperLimitActualRotation (method)
  SetUpperLimitActualRotation(theUpperLimitActualRotation: number): void;

  // StepKinematics_ScrewPairWithRange.HasUpperLimitActualRotation (method)
  HasUpperLimitActualRotation(): boolean;

  // StepKinematics_ScrewPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_ScrewPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_ScrewPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_ScrewPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_ScrewPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SlidingCurvePair: declare class StepKinematics_SlidingCurvePair extends StepKinematics_PlanarCurvePair

  // StepKinematics_SlidingCurvePair.constructor (constructor)
  constructor();

  // StepKinematics_SlidingCurvePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SlidingCurvePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SlidingCurvePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SlidingCurvePair.delete (method)
  delete(): void;

  // StepKinematics_SlidingCurvePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SlidingCurvePairValue: declare class StepKinematics_SlidingCurvePairValue extends StepKinematics_PairValue

  // StepKinematics_SlidingCurvePairValue.constructor (constructor)
  constructor();

  // StepKinematics_SlidingCurvePairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnCurve1: StepGeom_PointOnCurve, theActualPointOnCurve2: StepGeom_PointOnCurve): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_SlidingCurvePairValue.ActualPointOnCurve1 (method)
  ActualPointOnCurve1(): StepGeom_PointOnCurve;

  // StepKinematics_SlidingCurvePairValue.SetActualPointOnCurve1 (method)
  SetActualPointOnCurve1(theActualPointOnCurve1: StepGeom_PointOnCurve): void;

  // StepKinematics_SlidingCurvePairValue.ActualPointOnCurve2 (method)
  ActualPointOnCurve2(): StepGeom_PointOnCurve;

  // StepKinematics_SlidingCurvePairValue.SetActualPointOnCurve2 (method)
  SetActualPointOnCurve2(theActualPointOnCurve2: StepGeom_PointOnCurve): void;

  // StepKinematics_SlidingCurvePairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SlidingCurvePairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SlidingCurvePairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SlidingCurvePairValue.delete (method)
  delete(): void;

  // StepKinematics_SlidingCurvePairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SlidingSurfacePair: declare class StepKinematics_SlidingSurfacePair extends StepKinematics_SurfacePair

  // StepKinematics_SlidingSurfacePair.constructor (constructor)
  constructor();

  // StepKinematics_SlidingSurfacePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SlidingSurfacePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SlidingSurfacePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SlidingSurfacePair.delete (method)
  delete(): void;

  // StepKinematics_SlidingSurfacePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SlidingSurfacePairValue: declare class StepKinematics_SlidingSurfacePairValue extends StepKinematics_PairValue

  // StepKinematics_SlidingSurfacePairValue.constructor (constructor)
  constructor();

  // StepKinematics_SlidingSurfacePairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theActualPointOnSurface1: StepGeom_PointOnSurface, theActualPointOnSurface2: StepGeom_PointOnSurface, theActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_SlidingSurfacePairValue.ActualPointOnSurface1 (method)
  ActualPointOnSurface1(): StepGeom_PointOnSurface;

  // StepKinematics_SlidingSurfacePairValue.SetActualPointOnSurface1 (method)
  SetActualPointOnSurface1(theActualPointOnSurface1: StepGeom_PointOnSurface): void;

  // StepKinematics_SlidingSurfacePairValue.ActualPointOnSurface2 (method)
  ActualPointOnSurface2(): StepGeom_PointOnSurface;

  // StepKinematics_SlidingSurfacePairValue.SetActualPointOnSurface2 (method)
  SetActualPointOnSurface2(theActualPointOnSurface2: StepGeom_PointOnSurface): void;

  // StepKinematics_SlidingSurfacePairValue.ActualRotation (method)
  ActualRotation(): number;

  // StepKinematics_SlidingSurfacePairValue.SetActualRotation (method)
  SetActualRotation(theActualRotation: number): void;

  // StepKinematics_SlidingSurfacePairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SlidingSurfacePairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SlidingSurfacePairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SlidingSurfacePairValue.delete (method)
  delete(): void;

  // StepKinematics_SlidingSurfacePairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
