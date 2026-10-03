# libcascade — StepKinematics (4)

12 top-level symbols. Signatures are verbatim typescript.

StepKinematics_SpatialRotation: declare class StepKinematics_SpatialRotation extends StepData_SelectType

  // StepKinematics_SpatialRotation.constructor (constructor)
  constructor();

  // StepKinematics_SpatialRotation.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepKinematics_SpatialRotation.RotationAboutDirection (method)
  RotationAboutDirection(): StepKinematics_RotationAboutDirection;

  // StepKinematics_SpatialRotation.YprRotation (method)
  YprRotation(): NCollection_HArray1_double;

  // StepKinematics_SpatialRotation.delete (method)
  delete(): void;

  // StepKinematics_SpatialRotation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SphericalPair: declare class StepKinematics_SphericalPair extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_SphericalPair.constructor (constructor)
  constructor();

  // StepKinematics_SphericalPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SphericalPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SphericalPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SphericalPair.delete (method)
  delete(): void;

  // StepKinematics_SphericalPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SphericalPairSelect: declare class StepKinematics_SphericalPairSelect extends StepData_SelectType

  // StepKinematics_SphericalPairSelect.constructor (constructor)
  constructor();

  // StepKinematics_SphericalPairSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepKinematics_SphericalPairSelect.SphericalPair (method)
  SphericalPair(): StepKinematics_SphericalPair;

  // StepKinematics_SphericalPairSelect.SphericalPairWithPin (method)
  SphericalPairWithPin(): StepKinematics_SphericalPairWithPin;

  // StepKinematics_SphericalPairSelect.delete (method)
  delete(): void;

  // StepKinematics_SphericalPairSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SphericalPairValue: declare class StepKinematics_SphericalPairValue extends StepKinematics_PairValue

  // StepKinematics_SphericalPairValue.constructor (constructor)
  constructor();

  // StepKinematics_SphericalPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theInputOrientation: StepKinematics_SpatialRotation): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_SphericalPairValue.InputOrientation (method)
  InputOrientation(): StepKinematics_SpatialRotation;

  // StepKinematics_SphericalPairValue.SetInputOrientation (method)
  SetInputOrientation(theInputOrientation: StepKinematics_SpatialRotation): void;

  // StepKinematics_SphericalPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SphericalPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SphericalPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SphericalPairValue.delete (method)
  delete(): void;

  // StepKinematics_SphericalPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SphericalPairWithPin: declare class StepKinematics_SphericalPairWithPin extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_SphericalPairWithPin.constructor (constructor)
  constructor();

  // StepKinematics_SphericalPairWithPin.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SphericalPairWithPin.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SphericalPairWithPin.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SphericalPairWithPin.delete (method)
  delete(): void;

  // StepKinematics_SphericalPairWithPin.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SphericalPairWithPinAndRange: declare class StepKinematics_SphericalPairWithPinAndRange extends StepKinematics_SphericalPairWithPin

  // StepKinematics_SphericalPairWithPinAndRange.constructor (constructor)
  constructor();

  // StepKinematics_SphericalPairWithPinAndRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_SphericalPairWithPinAndRange.LowerLimitYaw (method)
  LowerLimitYaw(): number;

  // StepKinematics_SphericalPairWithPinAndRange.SetLowerLimitYaw (method)
  SetLowerLimitYaw(theLowerLimitYaw: number): void;

  // StepKinematics_SphericalPairWithPinAndRange.HasLowerLimitYaw (method)
  HasLowerLimitYaw(): boolean;

  // StepKinematics_SphericalPairWithPinAndRange.UpperLimitYaw (method)
  UpperLimitYaw(): number;

  // StepKinematics_SphericalPairWithPinAndRange.SetUpperLimitYaw (method)
  SetUpperLimitYaw(theUpperLimitYaw: number): void;

  // StepKinematics_SphericalPairWithPinAndRange.HasUpperLimitYaw (method)
  HasUpperLimitYaw(): boolean;

  // StepKinematics_SphericalPairWithPinAndRange.LowerLimitRoll (method)
  LowerLimitRoll(): number;

  // StepKinematics_SphericalPairWithPinAndRange.SetLowerLimitRoll (method)
  SetLowerLimitRoll(theLowerLimitRoll: number): void;

  // StepKinematics_SphericalPairWithPinAndRange.HasLowerLimitRoll (method)
  HasLowerLimitRoll(): boolean;

  // StepKinematics_SphericalPairWithPinAndRange.UpperLimitRoll (method)
  UpperLimitRoll(): number;

  // StepKinematics_SphericalPairWithPinAndRange.SetUpperLimitRoll (method)
  SetUpperLimitRoll(theUpperLimitRoll: number): void;

  // StepKinematics_SphericalPairWithPinAndRange.HasUpperLimitRoll (method)
  HasUpperLimitRoll(): boolean;

  // StepKinematics_SphericalPairWithPinAndRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SphericalPairWithPinAndRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SphericalPairWithPinAndRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SphericalPairWithPinAndRange.delete (method)
  delete(): void;

  // StepKinematics_SphericalPairWithPinAndRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SphericalPairWithRange: declare class StepKinematics_SphericalPairWithRange extends StepKinematics_SphericalPair

  // StepKinematics_SphericalPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_SphericalPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasLowerLimitYaw: boolean, theLowerLimitYaw: number, hasUpperLimitYaw: boolean, theUpperLimitYaw: number, hasLowerLimitPitch: boolean, theLowerLimitPitch: number, hasUpperLimitPitch: boolean, theUpperLimitPitch: number, hasLowerLimitRoll: boolean, theLowerLimitRoll: number, hasUpperLimitRoll: boolean, theUpperLimitRoll: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_SphericalPairWithRange.LowerLimitYaw (method)
  LowerLimitYaw(): number;

  // StepKinematics_SphericalPairWithRange.SetLowerLimitYaw (method)
  SetLowerLimitYaw(theLowerLimitYaw: number): void;

  // StepKinematics_SphericalPairWithRange.HasLowerLimitYaw (method)
  HasLowerLimitYaw(): boolean;

  // StepKinematics_SphericalPairWithRange.UpperLimitYaw (method)
  UpperLimitYaw(): number;

  // StepKinematics_SphericalPairWithRange.SetUpperLimitYaw (method)
  SetUpperLimitYaw(theUpperLimitYaw: number): void;

  // StepKinematics_SphericalPairWithRange.HasUpperLimitYaw (method)
  HasUpperLimitYaw(): boolean;

  // StepKinematics_SphericalPairWithRange.LowerLimitPitch (method)
  LowerLimitPitch(): number;

  // StepKinematics_SphericalPairWithRange.SetLowerLimitPitch (method)
  SetLowerLimitPitch(theLowerLimitPitch: number): void;

  // StepKinematics_SphericalPairWithRange.HasLowerLimitPitch (method)
  HasLowerLimitPitch(): boolean;

  // StepKinematics_SphericalPairWithRange.UpperLimitPitch (method)
  UpperLimitPitch(): number;

  // StepKinematics_SphericalPairWithRange.SetUpperLimitPitch (method)
  SetUpperLimitPitch(theUpperLimitPitch: number): void;

  // StepKinematics_SphericalPairWithRange.HasUpperLimitPitch (method)
  HasUpperLimitPitch(): boolean;

  // StepKinematics_SphericalPairWithRange.LowerLimitRoll (method)
  LowerLimitRoll(): number;

  // StepKinematics_SphericalPairWithRange.SetLowerLimitRoll (method)
  SetLowerLimitRoll(theLowerLimitRoll: number): void;

  // StepKinematics_SphericalPairWithRange.HasLowerLimitRoll (method)
  HasLowerLimitRoll(): boolean;

  // StepKinematics_SphericalPairWithRange.UpperLimitRoll (method)
  UpperLimitRoll(): number;

  // StepKinematics_SphericalPairWithRange.SetUpperLimitRoll (method)
  SetUpperLimitRoll(theUpperLimitRoll: number): void;

  // StepKinematics_SphericalPairWithRange.HasUpperLimitRoll (method)
  HasUpperLimitRoll(): boolean;

  // StepKinematics_SphericalPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SphericalPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SphericalPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SphericalPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_SphericalPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SurfacePair: declare class StepKinematics_SurfacePair extends StepKinematics_HighOrderKinematicPair

  // StepKinematics_SurfacePair.constructor (constructor)
  constructor();

  // StepKinematics_SurfacePair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theSurface1: StepGeom_Surface, theSurface2: StepGeom_Surface, theOrientation: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_SurfacePair.Surface1 (method)
  Surface1(): StepGeom_Surface;

  // StepKinematics_SurfacePair.SetSurface1 (method)
  SetSurface1(theSurface1: StepGeom_Surface): void;

  // StepKinematics_SurfacePair.Surface2 (method)
  Surface2(): StepGeom_Surface;

  // StepKinematics_SurfacePair.SetSurface2 (method)
  SetSurface2(theSurface2: StepGeom_Surface): void;

  // StepKinematics_SurfacePair.Orientation (method)
  Orientation(): boolean;

  // StepKinematics_SurfacePair.SetOrientation (method)
  SetOrientation(theOrientation: boolean): void;

  // StepKinematics_SurfacePair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SurfacePair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SurfacePair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SurfacePair.delete (method)
  delete(): void;

  // StepKinematics_SurfacePair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_SurfacePairWithRange: declare class StepKinematics_SurfacePairWithRange extends StepKinematics_SurfacePair

  // StepKinematics_SurfacePairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_SurfacePairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theSurfacePair_Surface1: StepGeom_Surface, theSurfacePair_Surface2: StepGeom_Surface, theSurfacePair_Orientation: boolean, theRangeOnSurface1: StepGeom_RectangularTrimmedSurface, theRangeOnSurface2: StepGeom_RectangularTrimmedSurface, hasLowerLimitActualRotation: boolean, theLowerLimitActualRotation: number, hasUpperLimitActualRotation: boolean, theUpperLimitActualRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theSurface1: StepGeom_Surface, theSurface2: StepGeom_Surface, theOrientation: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_SurfacePairWithRange.RangeOnSurface1 (method)
  RangeOnSurface1(): StepGeom_RectangularTrimmedSurface;

  // StepKinematics_SurfacePairWithRange.SetRangeOnSurface1 (method)
  SetRangeOnSurface1(theRangeOnSurface1: StepGeom_RectangularTrimmedSurface): void;

  // StepKinematics_SurfacePairWithRange.RangeOnSurface2 (method)
  RangeOnSurface2(): StepGeom_RectangularTrimmedSurface;

  // StepKinematics_SurfacePairWithRange.SetRangeOnSurface2 (method)
  SetRangeOnSurface2(theRangeOnSurface2: StepGeom_RectangularTrimmedSurface): void;

  // StepKinematics_SurfacePairWithRange.LowerLimitActualRotation (method)
  LowerLimitActualRotation(): number;

  // StepKinematics_SurfacePairWithRange.SetLowerLimitActualRotation (method)
  SetLowerLimitActualRotation(theLowerLimitActualRotation: number): void;

  // StepKinematics_SurfacePairWithRange.HasLowerLimitActualRotation (method)
  HasLowerLimitActualRotation(): boolean;

  // StepKinematics_SurfacePairWithRange.UpperLimitActualRotation (method)
  UpperLimitActualRotation(): number;

  // StepKinematics_SurfacePairWithRange.SetUpperLimitActualRotation (method)
  SetUpperLimitActualRotation(theUpperLimitActualRotation: number): void;

  // StepKinematics_SurfacePairWithRange.HasUpperLimitActualRotation (method)
  HasUpperLimitActualRotation(): boolean;

  // StepKinematics_SurfacePairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_SurfacePairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_SurfacePairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_SurfacePairWithRange.delete (method)
  delete(): void;

  // StepKinematics_SurfacePairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_UniversalPair: declare class StepKinematics_UniversalPair extends StepKinematics_LowOrderKinematicPair

  // StepKinematics_UniversalPair.constructor (constructor)
  constructor();

  // StepKinematics_UniversalPair.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasInputSkewAngle: boolean, theInputSkewAngle: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_UniversalPair.InputSkewAngle (method)
  InputSkewAngle(): number;

  // StepKinematics_UniversalPair.SetInputSkewAngle (method)
  SetInputSkewAngle(theInputSkewAngle: number): void;

  // StepKinematics_UniversalPair.HasInputSkewAngle (method)
  HasInputSkewAngle(): boolean;

  // StepKinematics_UniversalPair.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_UniversalPair.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_UniversalPair.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_UniversalPair.delete (method)
  delete(): void;

  // StepKinematics_UniversalPair.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_UniversalPairValue: declare class StepKinematics_UniversalPairValue extends StepKinematics_PairValue

  // StepKinematics_UniversalPairValue.constructor (constructor)
  constructor();

  // StepKinematics_UniversalPairValue.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, thePairValue_AppliesToPair: StepKinematics_KinematicPair, theFirstRotationAngle: number, theSecondRotationAngle: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theAppliesToPair: StepKinematics_KinematicPair): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_UniversalPairValue.FirstRotationAngle (method)
  FirstRotationAngle(): number;

  // StepKinematics_UniversalPairValue.SetFirstRotationAngle (method)
  SetFirstRotationAngle(theFirstRotationAngle: number): void;

  // StepKinematics_UniversalPairValue.SecondRotationAngle (method)
  SecondRotationAngle(): number;

  // StepKinematics_UniversalPairValue.SetSecondRotationAngle (method)
  SetSecondRotationAngle(theSecondRotationAngle: number): void;

  // StepKinematics_UniversalPairValue.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_UniversalPairValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_UniversalPairValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_UniversalPairValue.delete (method)
  delete(): void;

  // StepKinematics_UniversalPairValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepKinematics_UniversalPairWithRange: declare class StepKinematics_UniversalPairWithRange extends StepKinematics_UniversalPair

  // StepKinematics_UniversalPairWithRange.constructor (constructor)
  constructor();

  // StepKinematics_UniversalPairWithRange.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasUniversalPair_InputSkewAngle: boolean, theUniversalPair_InputSkewAngle: number, hasLowerLimitFirstRotation: boolean, theLowerLimitFirstRotation: number, hasUpperLimitFirstRotation: boolean, theUpperLimitFirstRotation: number, hasLowerLimitSecondRotation: boolean, theLowerLimitSecondRotation: number, hasUpperLimitSecondRotation: boolean, theUpperLimitSecondRotation: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theLowOrderKinematicPair_TX: boolean, theLowOrderKinematicPair_TY: boolean, theLowOrderKinematicPair_TZ: boolean, theLowOrderKinematicPair_RX: boolean, theLowOrderKinematicPair_RY: boolean, theLowOrderKinematicPair_RZ: boolean, hasInputSkewAngle: boolean, theInputSkewAngle: number): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theKinematicPair_Joint: StepKinematics_KinematicJoint, theTX: boolean, theTY: boolean, theTZ: boolean, theRX: boolean, theRY: boolean, theRZ: boolean): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItemDefinedTransformation_Name: TCollection_HAsciiString, hasItemDefinedTransformation_Description: boolean, theItemDefinedTransformation_Description: TCollection_HAsciiString, theItemDefinedTransformation_TransformItem1: StepRepr_RepresentationItem, theItemDefinedTransformation_TransformItem2: StepRepr_RepresentationItem, theJoint: StepKinematics_KinematicJoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepKinematics_UniversalPairWithRange.LowerLimitFirstRotation (method)
  LowerLimitFirstRotation(): number;

  // StepKinematics_UniversalPairWithRange.SetLowerLimitFirstRotation (method)
  SetLowerLimitFirstRotation(theLowerLimitFirstRotation: number): void;

  // StepKinematics_UniversalPairWithRange.HasLowerLimitFirstRotation (method)
  HasLowerLimitFirstRotation(): boolean;

  // StepKinematics_UniversalPairWithRange.UpperLimitFirstRotation (method)
  UpperLimitFirstRotation(): number;

  // StepKinematics_UniversalPairWithRange.SetUpperLimitFirstRotation (method)
  SetUpperLimitFirstRotation(theUpperLimitFirstRotation: number): void;

  // StepKinematics_UniversalPairWithRange.HasUpperLimitFirstRotation (method)
  HasUpperLimitFirstRotation(): boolean;

  // StepKinematics_UniversalPairWithRange.LowerLimitSecondRotation (method)
  LowerLimitSecondRotation(): number;

  // StepKinematics_UniversalPairWithRange.SetLowerLimitSecondRotation (method)
  SetLowerLimitSecondRotation(theLowerLimitSecondRotation: number): void;

  // StepKinematics_UniversalPairWithRange.HasLowerLimitSecondRotation (method)
  HasLowerLimitSecondRotation(): boolean;

  // StepKinematics_UniversalPairWithRange.UpperLimitSecondRotation (method)
  UpperLimitSecondRotation(): number;

  // StepKinematics_UniversalPairWithRange.SetUpperLimitSecondRotation (method)
  SetUpperLimitSecondRotation(theUpperLimitSecondRotation: number): void;

  // StepKinematics_UniversalPairWithRange.HasUpperLimitSecondRotation (method)
  HasUpperLimitSecondRotation(): boolean;

  // StepKinematics_UniversalPairWithRange.get_type_name (method)
  static get_type_name(): string;

  // StepKinematics_UniversalPairWithRange.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepKinematics_UniversalPairWithRange.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepKinematics_UniversalPairWithRange.delete (method)
  delete(): void;

  // StepKinematics_UniversalPairWithRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
