# libcascade — XCAFDimTolObjects

22 top-level symbols. Signatures are verbatim typescript.

XCAFDimTolObjects_AngularQualifier: typeof XCAFDimTolObjects_AngularQualifier[keyof typeof XCAFDimTolObjects_AngularQualifier]

  readonly XCAFDimTolObjects_AngularQualifier_None: 'XCAFDimTolObjects_AngularQualifier_None'

  readonly XCAFDimTolObjects_AngularQualifier_Small: 'XCAFDimTolObjects_AngularQualifier_Small'

  readonly XCAFDimTolObjects_AngularQualifier_Large: 'XCAFDimTolObjects_AngularQualifier_Large'

  readonly XCAFDimTolObjects_AngularQualifier_Equal: 'XCAFDimTolObjects_AngularQualifier_Equal'

XCAFDimTolObjects_DatumModifWithValue: typeof XCAFDimTolObjects_DatumModifWithValue[keyof typeof XCAFDimTolObjects_DatumModifWithValue]

  readonly XCAFDimTolObjects_DatumModifWithValue_None: 'XCAFDimTolObjects_DatumModifWithValue_None'

  readonly XCAFDimTolObjects_DatumModifWithValue_CircularOrCylindrical: 'XCAFDimTolObjects_DatumModifWithValue_CircularOrCylindrical'

  readonly XCAFDimTolObjects_DatumModifWithValue_Distance: 'XCAFDimTolObjects_DatumModifWithValue_Distance'

  readonly XCAFDimTolObjects_DatumModifWithValue_Projected: 'XCAFDimTolObjects_DatumModifWithValue_Projected'

  readonly XCAFDimTolObjects_DatumModifWithValue_Spherical: 'XCAFDimTolObjects_DatumModifWithValue_Spherical'

XCAFDimTolObjects_DatumObject: declare class XCAFDimTolObjects_DatumObject extends Standard_Transient

  // XCAFDimTolObjects_DatumObject.constructor (constructor)
  constructor();
  constructor(theObj: XCAFDimTolObjects_DatumObject);

  // XCAFDimTolObjects_DatumObject.GetSemanticName (method)
  GetSemanticName(): TCollection_HAsciiString;

  // XCAFDimTolObjects_DatumObject.SetSemanticName (method)
  SetSemanticName(theName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_DatumObject.GetName (method)
  GetName(): TCollection_HAsciiString;

  // XCAFDimTolObjects_DatumObject.SetName (method)
  SetName(theTag: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_DatumObject.GetModifiers (method)
  GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif;

  // XCAFDimTolObjects_DatumObject.SetModifiers (method)
  SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  // XCAFDimTolObjects_DatumObject.GetModifierWithValue (method)
  GetModifierWithValue(theModifier?: XCAFDimTolObjects_DatumModifWithValue, theValue?: number): { theModifier: XCAFDimTolObjects_DatumModifWithValue; theValue: number };

  // XCAFDimTolObjects_DatumObject.SetModifierWithValue (method)
  SetModifierWithValue(theModifier: XCAFDimTolObjects_DatumModifWithValue, theValue: number): void;

  // XCAFDimTolObjects_DatumObject.AddModifier (method)
  AddModifier(theModifier: XCAFDimTolObjects_DatumSingleModif): void;

  // XCAFDimTolObjects_DatumObject.GetDatumTarget (method)
  GetDatumTarget(): TopoDS_Shape;

  // XCAFDimTolObjects_DatumObject.SetDatumTarget (method)
  SetDatumTarget(theShape: TopoDS_Shape): void;

  // XCAFDimTolObjects_DatumObject.GetPosition (method)
  GetPosition(): number;

  // XCAFDimTolObjects_DatumObject.SetPosition (method)
  SetPosition(thePosition: number): void;

  // XCAFDimTolObjects_DatumObject.IsDatumTarget (method)
  IsDatumTarget(): boolean;
  IsDatumTarget(theIsDT: boolean): void;

  // XCAFDimTolObjects_DatumObject.GetDatumTargetType (method)
  GetDatumTargetType(): XCAFDimTolObjects_DatumTargetType;

  // XCAFDimTolObjects_DatumObject.SetDatumTargetType (method)
  SetDatumTargetType(theType: XCAFDimTolObjects_DatumTargetType): void;

  // XCAFDimTolObjects_DatumObject.GetDatumTargetAxis (method)
  GetDatumTargetAxis(): gp_Ax2;

  // XCAFDimTolObjects_DatumObject.SetDatumTargetAxis (method)
  SetDatumTargetAxis(theAxis: gp_Ax2): void;

  // XCAFDimTolObjects_DatumObject.GetDatumTargetLength (method)
  GetDatumTargetLength(): number;

  // XCAFDimTolObjects_DatumObject.SetDatumTargetLength (method)
  SetDatumTargetLength(theLength: number): void;

  // XCAFDimTolObjects_DatumObject.GetDatumTargetWidth (method)
  GetDatumTargetWidth(): number;

  // XCAFDimTolObjects_DatumObject.SetDatumTargetWidth (method)
  SetDatumTargetWidth(theWidth: number): void;

  // XCAFDimTolObjects_DatumObject.GetDatumTargetNumber (method)
  GetDatumTargetNumber(): number;

  // XCAFDimTolObjects_DatumObject.SetDatumTargetNumber (method)
  SetDatumTargetNumber(theNumber: number): void;

  // XCAFDimTolObjects_DatumObject.SetPlane (method)
  SetPlane(thePlane: gp_Ax2): void;

  // XCAFDimTolObjects_DatumObject.GetPlane (method)
  GetPlane(): gp_Ax2;

  // XCAFDimTolObjects_DatumObject.SetPoint (method)
  SetPoint(thePnt: gp_Pnt): void;

  // XCAFDimTolObjects_DatumObject.GetPoint (method)
  GetPoint(): gp_Pnt;

  // XCAFDimTolObjects_DatumObject.SetPointTextAttach (method)
  SetPointTextAttach(thePntText: gp_Pnt): void;

  // XCAFDimTolObjects_DatumObject.GetPointTextAttach (method)
  GetPointTextAttach(): gp_Pnt;

  // XCAFDimTolObjects_DatumObject.HasPlane (method)
  HasPlane(): boolean;

  // XCAFDimTolObjects_DatumObject.HasPoint (method)
  HasPoint(): boolean;

  // XCAFDimTolObjects_DatumObject.HasPointText (method)
  HasPointText(): boolean;

  // XCAFDimTolObjects_DatumObject.SetPresentation (method)
  SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_DatumObject.GetPresentation (method)
  GetPresentation(): TopoDS_Shape;

  // XCAFDimTolObjects_DatumObject.GetPresentationName (method)
  GetPresentationName(): TCollection_HAsciiString;

  // XCAFDimTolObjects_DatumObject.HasDatumTargetParams (method)
  HasDatumTargetParams(): boolean;

  // XCAFDimTolObjects_DatumObject.get_type_name (method)
  static get_type_name(): string;

  // XCAFDimTolObjects_DatumObject.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDimTolObjects_DatumObject.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDimTolObjects_DatumObject.delete (method)
  delete(): void;

  // XCAFDimTolObjects_DatumObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDimTolObjects_DatumSingleModif: typeof XCAFDimTolObjects_DatumSingleModif[keyof typeof XCAFDimTolObjects_DatumSingleModif]

  readonly XCAFDimTolObjects_DatumSingleModif_AnyCrossSection: 'XCAFDimTolObjects_DatumSingleModif_AnyCrossSection'

  readonly XCAFDimTolObjects_DatumSingleModif_Any_LongitudinalSection: 'XCAFDimTolObjects_DatumSingleModif_Any_LongitudinalSection'

  readonly XCAFDimTolObjects_DatumSingleModif_Basic: 'XCAFDimTolObjects_DatumSingleModif_Basic'

  readonly XCAFDimTolObjects_DatumSingleModif_ContactingFeature: 'XCAFDimTolObjects_DatumSingleModif_ContactingFeature'

  readonly XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintU: 'XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintU'

  readonly XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintV: 'XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintV'

  readonly XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintW: 'XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintW'

  readonly XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintX: 'XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintX'

  readonly XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintY: 'XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintY'

  readonly XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintZ: 'XCAFDimTolObjects_DatumSingleModif_DegreeOfFreedomConstraintZ'

  readonly XCAFDimTolObjects_DatumSingleModif_DistanceVariable: 'XCAFDimTolObjects_DatumSingleModif_DistanceVariable'

  readonly XCAFDimTolObjects_DatumSingleModif_FreeState: 'XCAFDimTolObjects_DatumSingleModif_FreeState'

  readonly XCAFDimTolObjects_DatumSingleModif_LeastMaterialRequirement: 'XCAFDimTolObjects_DatumSingleModif_LeastMaterialRequirement'

  readonly XCAFDimTolObjects_DatumSingleModif_Line: 'XCAFDimTolObjects_DatumSingleModif_Line'

  readonly XCAFDimTolObjects_DatumSingleModif_MajorDiameter: 'XCAFDimTolObjects_DatumSingleModif_MajorDiameter'

  readonly XCAFDimTolObjects_DatumSingleModif_MaximumMaterialRequirement: 'XCAFDimTolObjects_DatumSingleModif_MaximumMaterialRequirement'

  readonly XCAFDimTolObjects_DatumSingleModif_MinorDiameter: 'XCAFDimTolObjects_DatumSingleModif_MinorDiameter'

  readonly XCAFDimTolObjects_DatumSingleModif_Orientation: 'XCAFDimTolObjects_DatumSingleModif_Orientation'

  readonly XCAFDimTolObjects_DatumSingleModif_PitchDiameter: 'XCAFDimTolObjects_DatumSingleModif_PitchDiameter'

  readonly XCAFDimTolObjects_DatumSingleModif_Plane: 'XCAFDimTolObjects_DatumSingleModif_Plane'

  readonly XCAFDimTolObjects_DatumSingleModif_Point: 'XCAFDimTolObjects_DatumSingleModif_Point'

  readonly XCAFDimTolObjects_DatumSingleModif_Translation: 'XCAFDimTolObjects_DatumSingleModif_Translation'

XCAFDimTolObjects_DatumTargetType: typeof XCAFDimTolObjects_DatumTargetType[keyof typeof XCAFDimTolObjects_DatumTargetType]

  readonly XCAFDimTolObjects_DatumTargetType_Point: 'XCAFDimTolObjects_DatumTargetType_Point'

  readonly XCAFDimTolObjects_DatumTargetType_Line: 'XCAFDimTolObjects_DatumTargetType_Line'

  readonly XCAFDimTolObjects_DatumTargetType_Rectangle: 'XCAFDimTolObjects_DatumTargetType_Rectangle'

  readonly XCAFDimTolObjects_DatumTargetType_Circle: 'XCAFDimTolObjects_DatumTargetType_Circle'

  readonly XCAFDimTolObjects_DatumTargetType_Area: 'XCAFDimTolObjects_DatumTargetType_Area'

XCAFDimTolObjects_DimensionFormVariance: typeof XCAFDimTolObjects_DimensionFormVariance[keyof typeof XCAFDimTolObjects_DimensionFormVariance]

  readonly XCAFDimTolObjects_DimensionFormVariance_None: 'XCAFDimTolObjects_DimensionFormVariance_None'

  readonly XCAFDimTolObjects_DimensionFormVariance_A: 'XCAFDimTolObjects_DimensionFormVariance_A'

  readonly XCAFDimTolObjects_DimensionFormVariance_B: 'XCAFDimTolObjects_DimensionFormVariance_B'

  readonly XCAFDimTolObjects_DimensionFormVariance_C: 'XCAFDimTolObjects_DimensionFormVariance_C'

  readonly XCAFDimTolObjects_DimensionFormVariance_CD: 'XCAFDimTolObjects_DimensionFormVariance_CD'

  readonly XCAFDimTolObjects_DimensionFormVariance_D: 'XCAFDimTolObjects_DimensionFormVariance_D'

  readonly XCAFDimTolObjects_DimensionFormVariance_E: 'XCAFDimTolObjects_DimensionFormVariance_E'

  readonly XCAFDimTolObjects_DimensionFormVariance_EF: 'XCAFDimTolObjects_DimensionFormVariance_EF'

  readonly XCAFDimTolObjects_DimensionFormVariance_F: 'XCAFDimTolObjects_DimensionFormVariance_F'

  readonly XCAFDimTolObjects_DimensionFormVariance_FG: 'XCAFDimTolObjects_DimensionFormVariance_FG'

  readonly XCAFDimTolObjects_DimensionFormVariance_G: 'XCAFDimTolObjects_DimensionFormVariance_G'

  readonly XCAFDimTolObjects_DimensionFormVariance_H: 'XCAFDimTolObjects_DimensionFormVariance_H'

  readonly XCAFDimTolObjects_DimensionFormVariance_JS: 'XCAFDimTolObjects_DimensionFormVariance_JS'

  readonly XCAFDimTolObjects_DimensionFormVariance_J: 'XCAFDimTolObjects_DimensionFormVariance_J'

  readonly XCAFDimTolObjects_DimensionFormVariance_K: 'XCAFDimTolObjects_DimensionFormVariance_K'

  readonly XCAFDimTolObjects_DimensionFormVariance_M: 'XCAFDimTolObjects_DimensionFormVariance_M'

  readonly XCAFDimTolObjects_DimensionFormVariance_N: 'XCAFDimTolObjects_DimensionFormVariance_N'

  readonly XCAFDimTolObjects_DimensionFormVariance_P: 'XCAFDimTolObjects_DimensionFormVariance_P'

  readonly XCAFDimTolObjects_DimensionFormVariance_R: 'XCAFDimTolObjects_DimensionFormVariance_R'

  readonly XCAFDimTolObjects_DimensionFormVariance_S: 'XCAFDimTolObjects_DimensionFormVariance_S'

  readonly XCAFDimTolObjects_DimensionFormVariance_T: 'XCAFDimTolObjects_DimensionFormVariance_T'

  readonly XCAFDimTolObjects_DimensionFormVariance_U: 'XCAFDimTolObjects_DimensionFormVariance_U'

  readonly XCAFDimTolObjects_DimensionFormVariance_V: 'XCAFDimTolObjects_DimensionFormVariance_V'

  readonly XCAFDimTolObjects_DimensionFormVariance_X: 'XCAFDimTolObjects_DimensionFormVariance_X'

  readonly XCAFDimTolObjects_DimensionFormVariance_Y: 'XCAFDimTolObjects_DimensionFormVariance_Y'

  readonly XCAFDimTolObjects_DimensionFormVariance_Z: 'XCAFDimTolObjects_DimensionFormVariance_Z'

  readonly XCAFDimTolObjects_DimensionFormVariance_ZA: 'XCAFDimTolObjects_DimensionFormVariance_ZA'

  readonly XCAFDimTolObjects_DimensionFormVariance_ZB: 'XCAFDimTolObjects_DimensionFormVariance_ZB'

  readonly XCAFDimTolObjects_DimensionFormVariance_ZC: 'XCAFDimTolObjects_DimensionFormVariance_ZC'

XCAFDimTolObjects_DimensionGrade: typeof XCAFDimTolObjects_DimensionGrade[keyof typeof XCAFDimTolObjects_DimensionGrade]

  readonly XCAFDimTolObjects_DimensionGrade_IT01: 'XCAFDimTolObjects_DimensionGrade_IT01'

  readonly XCAFDimTolObjects_DimensionGrade_IT0: 'XCAFDimTolObjects_DimensionGrade_IT0'

  readonly XCAFDimTolObjects_DimensionGrade_IT1: 'XCAFDimTolObjects_DimensionGrade_IT1'

  readonly XCAFDimTolObjects_DimensionGrade_IT2: 'XCAFDimTolObjects_DimensionGrade_IT2'

  readonly XCAFDimTolObjects_DimensionGrade_IT3: 'XCAFDimTolObjects_DimensionGrade_IT3'

  readonly XCAFDimTolObjects_DimensionGrade_IT4: 'XCAFDimTolObjects_DimensionGrade_IT4'

  readonly XCAFDimTolObjects_DimensionGrade_IT5: 'XCAFDimTolObjects_DimensionGrade_IT5'

  readonly XCAFDimTolObjects_DimensionGrade_IT6: 'XCAFDimTolObjects_DimensionGrade_IT6'

  readonly XCAFDimTolObjects_DimensionGrade_IT7: 'XCAFDimTolObjects_DimensionGrade_IT7'

  readonly XCAFDimTolObjects_DimensionGrade_IT8: 'XCAFDimTolObjects_DimensionGrade_IT8'

  readonly XCAFDimTolObjects_DimensionGrade_IT9: 'XCAFDimTolObjects_DimensionGrade_IT9'

  readonly XCAFDimTolObjects_DimensionGrade_IT10: 'XCAFDimTolObjects_DimensionGrade_IT10'

  readonly XCAFDimTolObjects_DimensionGrade_IT11: 'XCAFDimTolObjects_DimensionGrade_IT11'

  readonly XCAFDimTolObjects_DimensionGrade_IT12: 'XCAFDimTolObjects_DimensionGrade_IT12'

  readonly XCAFDimTolObjects_DimensionGrade_IT13: 'XCAFDimTolObjects_DimensionGrade_IT13'

  readonly XCAFDimTolObjects_DimensionGrade_IT14: 'XCAFDimTolObjects_DimensionGrade_IT14'

  readonly XCAFDimTolObjects_DimensionGrade_IT15: 'XCAFDimTolObjects_DimensionGrade_IT15'

  readonly XCAFDimTolObjects_DimensionGrade_IT16: 'XCAFDimTolObjects_DimensionGrade_IT16'

  readonly XCAFDimTolObjects_DimensionGrade_IT17: 'XCAFDimTolObjects_DimensionGrade_IT17'

  readonly XCAFDimTolObjects_DimensionGrade_IT18: 'XCAFDimTolObjects_DimensionGrade_IT18'

XCAFDimTolObjects_DimensionModif: typeof XCAFDimTolObjects_DimensionModif[keyof typeof XCAFDimTolObjects_DimensionModif]

  readonly XCAFDimTolObjects_DimensionModif_ControlledRadius: 'XCAFDimTolObjects_DimensionModif_ControlledRadius'

  readonly XCAFDimTolObjects_DimensionModif_Square: 'XCAFDimTolObjects_DimensionModif_Square'

  readonly XCAFDimTolObjects_DimensionModif_StatisticalTolerance: 'XCAFDimTolObjects_DimensionModif_StatisticalTolerance'

  readonly XCAFDimTolObjects_DimensionModif_ContinuousFeature: 'XCAFDimTolObjects_DimensionModif_ContinuousFeature'

  readonly XCAFDimTolObjects_DimensionModif_TwoPointSize: 'XCAFDimTolObjects_DimensionModif_TwoPointSize'

  readonly XCAFDimTolObjects_DimensionModif_LocalSizeDefinedBySphere: 'XCAFDimTolObjects_DimensionModif_LocalSizeDefinedBySphere'

  readonly XCAFDimTolObjects_DimensionModif_LeastSquaresAssociationCriterion: 'XCAFDimTolObjects_DimensionModif_LeastSquaresAssociationCriterion'

  readonly XCAFDimTolObjects_DimensionModif_MaximumInscribedAssociation: 'XCAFDimTolObjects_DimensionModif_MaximumInscribedAssociation'

  readonly XCAFDimTolObjects_DimensionModif_MinimumCircumscribedAssociation: 'XCAFDimTolObjects_DimensionModif_MinimumCircumscribedAssociation'

  readonly XCAFDimTolObjects_DimensionModif_CircumferenceDiameter: 'XCAFDimTolObjects_DimensionModif_CircumferenceDiameter'

  readonly XCAFDimTolObjects_DimensionModif_AreaDiameter: 'XCAFDimTolObjects_DimensionModif_AreaDiameter'

  readonly XCAFDimTolObjects_DimensionModif_VolumeDiameter: 'XCAFDimTolObjects_DimensionModif_VolumeDiameter'

  readonly XCAFDimTolObjects_DimensionModif_MaximumSize: 'XCAFDimTolObjects_DimensionModif_MaximumSize'

  readonly XCAFDimTolObjects_DimensionModif_MinimumSize: 'XCAFDimTolObjects_DimensionModif_MinimumSize'

  readonly XCAFDimTolObjects_DimensionModif_AverageSize: 'XCAFDimTolObjects_DimensionModif_AverageSize'

  readonly XCAFDimTolObjects_DimensionModif_MedianSize: 'XCAFDimTolObjects_DimensionModif_MedianSize'

  readonly XCAFDimTolObjects_DimensionModif_MidRangeSize: 'XCAFDimTolObjects_DimensionModif_MidRangeSize'

  readonly XCAFDimTolObjects_DimensionModif_RangeOfSizes: 'XCAFDimTolObjects_DimensionModif_RangeOfSizes'

  readonly XCAFDimTolObjects_DimensionModif_AnyRestrictedPortionOfFeature: 'XCAFDimTolObjects_DimensionModif_AnyRestrictedPortionOfFeature'

  readonly XCAFDimTolObjects_DimensionModif_AnyCrossSection: 'XCAFDimTolObjects_DimensionModif_AnyCrossSection'

  readonly XCAFDimTolObjects_DimensionModif_SpecificFixedCrossSection: 'XCAFDimTolObjects_DimensionModif_SpecificFixedCrossSection'

  readonly XCAFDimTolObjects_DimensionModif_CommonTolerance: 'XCAFDimTolObjects_DimensionModif_CommonTolerance'

  readonly XCAFDimTolObjects_DimensionModif_FreeStateCondition: 'XCAFDimTolObjects_DimensionModif_FreeStateCondition'

  readonly XCAFDimTolObjects_DimensionModif_Between: 'XCAFDimTolObjects_DimensionModif_Between'

XCAFDimTolObjects_DimensionObject: declare class XCAFDimTolObjects_DimensionObject extends Standard_Transient

  // XCAFDimTolObjects_DimensionObject.constructor (constructor)
  constructor();
  constructor(theObj: XCAFDimTolObjects_DimensionObject);

  // XCAFDimTolObjects_DimensionObject.GetSemanticName (method)
  GetSemanticName(): TCollection_HAsciiString;

  // XCAFDimTolObjects_DimensionObject.SetSemanticName (method)
  SetSemanticName(theName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_DimensionObject.SetQualifier (method)
  SetQualifier(theQualifier: XCAFDimTolObjects_DimensionQualifier): void;

  // XCAFDimTolObjects_DimensionObject.GetQualifier (method)
  GetQualifier(): XCAFDimTolObjects_DimensionQualifier;

  // XCAFDimTolObjects_DimensionObject.HasQualifier (method)
  HasQualifier(): boolean;

  // XCAFDimTolObjects_DimensionObject.SetAngularQualifier (method)
  SetAngularQualifier(theAngularQualifier: XCAFDimTolObjects_AngularQualifier): void;

  // XCAFDimTolObjects_DimensionObject.GetAngularQualifier (method)
  GetAngularQualifier(): XCAFDimTolObjects_AngularQualifier;

  // XCAFDimTolObjects_DimensionObject.HasAngularQualifier (method)
  HasAngularQualifier(): boolean;

  // XCAFDimTolObjects_DimensionObject.SetType (method)
  SetType(theTyupe: XCAFDimTolObjects_DimensionType): void;

  // XCAFDimTolObjects_DimensionObject.GetType (method)
  GetType(): XCAFDimTolObjects_DimensionType;

  // XCAFDimTolObjects_DimensionObject.GetValue (method)
  GetValue(): number;

  // XCAFDimTolObjects_DimensionObject.GetValues (method)
  GetValues(): NCollection_HArray1_double;

  // XCAFDimTolObjects_DimensionObject.SetValue (method)
  SetValue(theValue: number): void;

  // XCAFDimTolObjects_DimensionObject.SetValues (method)
  SetValues(theValue: NCollection_HArray1_double): void;

  // XCAFDimTolObjects_DimensionObject.IsDimWithRange (method)
  IsDimWithRange(): boolean;

  // XCAFDimTolObjects_DimensionObject.SetUpperBound (method)
  SetUpperBound(theUpperBound: number): void;

  // XCAFDimTolObjects_DimensionObject.SetLowerBound (method)
  SetLowerBound(theLowerBound: number): void;

  // XCAFDimTolObjects_DimensionObject.GetUpperBound (method)
  GetUpperBound(): number;

  // XCAFDimTolObjects_DimensionObject.GetLowerBound (method)
  GetLowerBound(): number;

  // XCAFDimTolObjects_DimensionObject.IsDimWithPlusMinusTolerance (method)
  IsDimWithPlusMinusTolerance(): boolean;

  // XCAFDimTolObjects_DimensionObject.SetUpperTolValue (method)
  SetUpperTolValue(theUperTolValue: number): boolean;

  // XCAFDimTolObjects_DimensionObject.SetLowerTolValue (method)
  SetLowerTolValue(theLowerTolValue: number): boolean;

  // XCAFDimTolObjects_DimensionObject.GetUpperTolValue (method)
  GetUpperTolValue(): number;

  // XCAFDimTolObjects_DimensionObject.GetLowerTolValue (method)
  GetLowerTolValue(): number;

  // XCAFDimTolObjects_DimensionObject.IsDimWithClassOfTolerance (method)
  IsDimWithClassOfTolerance(): boolean;

  // XCAFDimTolObjects_DimensionObject.SetClassOfTolerance (method)
  SetClassOfTolerance(theHole: boolean, theFormVariance: XCAFDimTolObjects_DimensionFormVariance, theGrade: XCAFDimTolObjects_DimensionGrade): void;

  // XCAFDimTolObjects_DimensionObject.GetClassOfTolerance (method)
  GetClassOfTolerance(theHole?: boolean, theFormVariance?: XCAFDimTolObjects_DimensionFormVariance, theGrade?: XCAFDimTolObjects_DimensionGrade): { returnValue: boolean; theHole: boolean; theFormVariance: XCAFDimTolObjects_DimensionFormVariance; theGrade: XCAFDimTolObjects_DimensionGrade };

  // XCAFDimTolObjects_DimensionObject.SetNbOfDecimalPlaces (method)
  SetNbOfDecimalPlaces(theL: number, theR: number): void;

  // XCAFDimTolObjects_DimensionObject.GetNbOfDecimalPlaces (method)
  GetNbOfDecimalPlaces(theL?: number, theR?: number): { theL: number; theR: number };

  // XCAFDimTolObjects_DimensionObject.GetModifiers (method)
  GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_DimensionModif;

  // XCAFDimTolObjects_DimensionObject.SetModifiers (method)
  SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  // XCAFDimTolObjects_DimensionObject.AddModifier (method)
  AddModifier(theModifier: XCAFDimTolObjects_DimensionModif): void;

  // XCAFDimTolObjects_DimensionObject.GetPath (method)
  GetPath(): TopoDS_Edge;

  // XCAFDimTolObjects_DimensionObject.SetPath (method)
  SetPath(thePath: TopoDS_Edge): void;

  // XCAFDimTolObjects_DimensionObject.GetDirection (method)
  GetDirection(theDir: gp_Dir): boolean;

  // XCAFDimTolObjects_DimensionObject.SetDirection (method)
  SetDirection(theDir: gp_Dir): boolean;

  // XCAFDimTolObjects_DimensionObject.SetPointTextAttach (method)
  SetPointTextAttach(thePntText: gp_Pnt): void;

  // XCAFDimTolObjects_DimensionObject.GetPointTextAttach (method)
  GetPointTextAttach(): gp_Pnt;

  // XCAFDimTolObjects_DimensionObject.HasTextPoint (method)
  HasTextPoint(): boolean;

  // XCAFDimTolObjects_DimensionObject.SetPlane (method)
  SetPlane(thePlane: gp_Ax2): void;

  // XCAFDimTolObjects_DimensionObject.GetPlane (method)
  GetPlane(): gp_Ax2;

  // XCAFDimTolObjects_DimensionObject.HasPlane (method)
  HasPlane(): boolean;

  // XCAFDimTolObjects_DimensionObject.HasPoint (method)
  HasPoint(): boolean;

  // XCAFDimTolObjects_DimensionObject.HasPoint2 (method)
  HasPoint2(): boolean;

  // XCAFDimTolObjects_DimensionObject.IsPointConnection (method)
  IsPointConnection(): boolean;

  // XCAFDimTolObjects_DimensionObject.IsPointConnection2 (method)
  IsPointConnection2(): boolean;

  // XCAFDimTolObjects_DimensionObject.SetPoint (method)
  SetPoint(thePnt: gp_Pnt): void;

  // XCAFDimTolObjects_DimensionObject.SetPoint2 (method)
  SetPoint2(thePnt: gp_Pnt): void;

  // XCAFDimTolObjects_DimensionObject.SetConnectionAxis (method)
  SetConnectionAxis(theAxis: gp_Ax2): void;

  // XCAFDimTolObjects_DimensionObject.SetConnectionAxis2 (method)
  SetConnectionAxis2(theAxis: gp_Ax2): void;

  // XCAFDimTolObjects_DimensionObject.GetPoint (method)
  GetPoint(): gp_Pnt;

  // XCAFDimTolObjects_DimensionObject.GetPoint2 (method)
  GetPoint2(): gp_Pnt;

  // XCAFDimTolObjects_DimensionObject.GetConnectionAxis (method)
  GetConnectionAxis(): gp_Ax2;

  // XCAFDimTolObjects_DimensionObject.GetConnectionAxis2 (method)
  GetConnectionAxis2(): gp_Ax2;

  // XCAFDimTolObjects_DimensionObject.GetConnectionName (method)
  GetConnectionName(): TCollection_HAsciiString;

  // XCAFDimTolObjects_DimensionObject.GetConnectionName2 (method)
  GetConnectionName2(): TCollection_HAsciiString;

  // XCAFDimTolObjects_DimensionObject.SetConnectionName (method)
  SetConnectionName(theName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_DimensionObject.SetConnectionName2 (method)
  SetConnectionName2(theName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_DimensionObject.SetPresentation (method)
  SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_DimensionObject.GetPresentation (method)
  GetPresentation(): TopoDS_Shape;

  // XCAFDimTolObjects_DimensionObject.GetPresentationName (method)
  GetPresentationName(): TCollection_HAsciiString;

  // XCAFDimTolObjects_DimensionObject.HasDescriptions (method)
  HasDescriptions(): boolean;

  // XCAFDimTolObjects_DimensionObject.NbDescriptions (method)
  NbDescriptions(): number;

  // XCAFDimTolObjects_DimensionObject.GetDescription (method)
  GetDescription(theNumber: number): TCollection_HAsciiString;

  // XCAFDimTolObjects_DimensionObject.GetDescriptionName (method)
  GetDescriptionName(theNumber: number): TCollection_HAsciiString;

  // XCAFDimTolObjects_DimensionObject.RemoveDescription (method)
  RemoveDescription(theNumber: number): void;

  // XCAFDimTolObjects_DimensionObject.AddDescription (method)
  AddDescription(theDescription: TCollection_HAsciiString, theName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_DimensionObject.IsDimensionalLocation (method)
  static IsDimensionalLocation(theType: XCAFDimTolObjects_DimensionType): boolean;

  // XCAFDimTolObjects_DimensionObject.IsDimensionalSize (method)
  static IsDimensionalSize(theType: XCAFDimTolObjects_DimensionType): boolean;

  // XCAFDimTolObjects_DimensionObject.get_type_name (method)
  static get_type_name(): string;

  // XCAFDimTolObjects_DimensionObject.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDimTolObjects_DimensionObject.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDimTolObjects_DimensionObject.delete (method)
  delete(): void;

  // XCAFDimTolObjects_DimensionObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDimTolObjects_DimensionQualifier: typeof XCAFDimTolObjects_DimensionQualifier[keyof typeof XCAFDimTolObjects_DimensionQualifier]

  readonly XCAFDimTolObjects_DimensionQualifier_None: 'XCAFDimTolObjects_DimensionQualifier_None'

  readonly XCAFDimTolObjects_DimensionQualifier_Min: 'XCAFDimTolObjects_DimensionQualifier_Min'

  readonly XCAFDimTolObjects_DimensionQualifier_Max: 'XCAFDimTolObjects_DimensionQualifier_Max'

  readonly XCAFDimTolObjects_DimensionQualifier_Avg: 'XCAFDimTolObjects_DimensionQualifier_Avg'

XCAFDimTolObjects_DimensionType: typeof XCAFDimTolObjects_DimensionType[keyof typeof XCAFDimTolObjects_DimensionType]

  readonly XCAFDimTolObjects_DimensionType_Location_None: 'XCAFDimTolObjects_DimensionType_Location_None'

  readonly XCAFDimTolObjects_DimensionType_Location_CurvedDistance: 'XCAFDimTolObjects_DimensionType_Location_CurvedDistance'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromCenterToOuter: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromCenterToOuter'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromCenterToInner: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromCenterToInner'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromOuterToCenter: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromOuterToCenter'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromOuterToOuter: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromOuterToOuter'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromOuterToInner: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromOuterToInner'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromInnerToCenter: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromInnerToCenter'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromInnerToOuter: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromInnerToOuter'

  readonly XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromInnerToInner: 'XCAFDimTolObjects_DimensionType_Location_LinearDistance_FromInnerToInner'

  readonly XCAFDimTolObjects_DimensionType_Location_Angular: 'XCAFDimTolObjects_DimensionType_Location_Angular'

  readonly XCAFDimTolObjects_DimensionType_Location_Oriented: 'XCAFDimTolObjects_DimensionType_Location_Oriented'

  readonly XCAFDimTolObjects_DimensionType_Location_WithPath: 'XCAFDimTolObjects_DimensionType_Location_WithPath'

  readonly XCAFDimTolObjects_DimensionType_Size_CurveLength: 'XCAFDimTolObjects_DimensionType_Size_CurveLength'

  readonly XCAFDimTolObjects_DimensionType_Size_Diameter: 'XCAFDimTolObjects_DimensionType_Size_Diameter'

  readonly XCAFDimTolObjects_DimensionType_Size_SphericalDiameter: 'XCAFDimTolObjects_DimensionType_Size_SphericalDiameter'

  readonly XCAFDimTolObjects_DimensionType_Size_Radius: 'XCAFDimTolObjects_DimensionType_Size_Radius'

  readonly XCAFDimTolObjects_DimensionType_Size_SphericalRadius: 'XCAFDimTolObjects_DimensionType_Size_SphericalRadius'

  readonly XCAFDimTolObjects_DimensionType_Size_ToroidalMinorDiameter: 'XCAFDimTolObjects_DimensionType_Size_ToroidalMinorDiameter'

  readonly XCAFDimTolObjects_DimensionType_Size_ToroidalMajorDiameter: 'XCAFDimTolObjects_DimensionType_Size_ToroidalMajorDiameter'

  readonly XCAFDimTolObjects_DimensionType_Size_ToroidalMinorRadius: 'XCAFDimTolObjects_DimensionType_Size_ToroidalMinorRadius'

  readonly XCAFDimTolObjects_DimensionType_Size_ToroidalMajorRadius: 'XCAFDimTolObjects_DimensionType_Size_ToroidalMajorRadius'

  readonly XCAFDimTolObjects_DimensionType_Size_ToroidalHighMajorDiameter: 'XCAFDimTolObjects_DimensionType_Size_ToroidalHighMajorDiameter'

  readonly XCAFDimTolObjects_DimensionType_Size_ToroidalLowMajorDiameter: 'XCAFDimTolObjects_DimensionType_Size_ToroidalLowMajorDiameter'

  readonly XCAFDimTolObjects_DimensionType_Size_ToroidalHighMajorRadius: 'XCAFDimTolObjects_DimensionType_Size_ToroidalHighMajorRadius'

  readonly XCAFDimTolObjects_DimensionType_Size_ToroidalLowMajorRadius: 'XCAFDimTolObjects_DimensionType_Size_ToroidalLowMajorRadius'

  readonly XCAFDimTolObjects_DimensionType_Size_Thickness: 'XCAFDimTolObjects_DimensionType_Size_Thickness'

  readonly XCAFDimTolObjects_DimensionType_Size_Angular: 'XCAFDimTolObjects_DimensionType_Size_Angular'

  readonly XCAFDimTolObjects_DimensionType_Size_WithPath: 'XCAFDimTolObjects_DimensionType_Size_WithPath'

  readonly XCAFDimTolObjects_DimensionType_CommonLabel: 'XCAFDimTolObjects_DimensionType_CommonLabel'

  readonly XCAFDimTolObjects_DimensionType_DimensionPresentation: 'XCAFDimTolObjects_DimensionType_DimensionPresentation'

XCAFDimTolObjects_GeomToleranceMatReqModif: typeof XCAFDimTolObjects_GeomToleranceMatReqModif[keyof typeof XCAFDimTolObjects_GeomToleranceMatReqModif]

  readonly XCAFDimTolObjects_GeomToleranceMatReqModif_None: 'XCAFDimTolObjects_GeomToleranceMatReqModif_None'

  readonly XCAFDimTolObjects_GeomToleranceMatReqModif_M: 'XCAFDimTolObjects_GeomToleranceMatReqModif_M'

  readonly XCAFDimTolObjects_GeomToleranceMatReqModif_L: 'XCAFDimTolObjects_GeomToleranceMatReqModif_L'

XCAFDimTolObjects_GeomToleranceModif: typeof XCAFDimTolObjects_GeomToleranceModif[keyof typeof XCAFDimTolObjects_GeomToleranceModif]

  readonly XCAFDimTolObjects_GeomToleranceModif_Any_Cross_Section: 'XCAFDimTolObjects_GeomToleranceModif_Any_Cross_Section'

  readonly XCAFDimTolObjects_GeomToleranceModif_Common_Zone: 'XCAFDimTolObjects_GeomToleranceModif_Common_Zone'

  readonly XCAFDimTolObjects_GeomToleranceModif_Each_Radial_Element: 'XCAFDimTolObjects_GeomToleranceModif_Each_Radial_Element'

  readonly XCAFDimTolObjects_GeomToleranceModif_Free_State: 'XCAFDimTolObjects_GeomToleranceModif_Free_State'

  readonly XCAFDimTolObjects_GeomToleranceModif_Least_Material_Requirement: 'XCAFDimTolObjects_GeomToleranceModif_Least_Material_Requirement'

  readonly XCAFDimTolObjects_GeomToleranceModif_Line_Element: 'XCAFDimTolObjects_GeomToleranceModif_Line_Element'

  readonly XCAFDimTolObjects_GeomToleranceModif_Major_Diameter: 'XCAFDimTolObjects_GeomToleranceModif_Major_Diameter'

  readonly XCAFDimTolObjects_GeomToleranceModif_Maximum_Material_Requirement: 'XCAFDimTolObjects_GeomToleranceModif_Maximum_Material_Requirement'

  readonly XCAFDimTolObjects_GeomToleranceModif_Minor_Diameter: 'XCAFDimTolObjects_GeomToleranceModif_Minor_Diameter'

  readonly XCAFDimTolObjects_GeomToleranceModif_Not_Convex: 'XCAFDimTolObjects_GeomToleranceModif_Not_Convex'

  readonly XCAFDimTolObjects_GeomToleranceModif_Pitch_Diameter: 'XCAFDimTolObjects_GeomToleranceModif_Pitch_Diameter'

  readonly XCAFDimTolObjects_GeomToleranceModif_Reciprocity_Requirement: 'XCAFDimTolObjects_GeomToleranceModif_Reciprocity_Requirement'

  readonly XCAFDimTolObjects_GeomToleranceModif_Separate_Requirement: 'XCAFDimTolObjects_GeomToleranceModif_Separate_Requirement'

  readonly XCAFDimTolObjects_GeomToleranceModif_Statistical_Tolerance: 'XCAFDimTolObjects_GeomToleranceModif_Statistical_Tolerance'

  readonly XCAFDimTolObjects_GeomToleranceModif_Tangent_Plane: 'XCAFDimTolObjects_GeomToleranceModif_Tangent_Plane'

  readonly XCAFDimTolObjects_GeomToleranceModif_All_Around: 'XCAFDimTolObjects_GeomToleranceModif_All_Around'

  readonly XCAFDimTolObjects_GeomToleranceModif_All_Over: 'XCAFDimTolObjects_GeomToleranceModif_All_Over'

XCAFDimTolObjects_GeomToleranceObject: declare class XCAFDimTolObjects_GeomToleranceObject extends Standard_Transient

  // XCAFDimTolObjects_GeomToleranceObject.constructor (constructor)
  constructor();
  constructor(theObj: XCAFDimTolObjects_GeomToleranceObject);

  // XCAFDimTolObjects_GeomToleranceObject.GetSemanticName (method)
  GetSemanticName(): TCollection_HAsciiString;

  // XCAFDimTolObjects_GeomToleranceObject.SetSemanticName (method)
  SetSemanticName(theName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_GeomToleranceObject.SetType (method)
  SetType(theType: XCAFDimTolObjects_GeomToleranceType): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetType (method)
  GetType(): XCAFDimTolObjects_GeomToleranceType;

  // XCAFDimTolObjects_GeomToleranceObject.SetTypeOfValue (method)
  SetTypeOfValue(theTypeOfValue: XCAFDimTolObjects_GeomToleranceTypeValue): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetTypeOfValue (method)
  GetTypeOfValue(): XCAFDimTolObjects_GeomToleranceTypeValue;

  // XCAFDimTolObjects_GeomToleranceObject.SetValue (method)
  SetValue(theValue: number): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetValue (method)
  GetValue(): number;

  // XCAFDimTolObjects_GeomToleranceObject.SetMaterialRequirementModifier (method)
  SetMaterialRequirementModifier(theMatReqModif: XCAFDimTolObjects_GeomToleranceMatReqModif): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetMaterialRequirementModifier (method)
  GetMaterialRequirementModifier(): XCAFDimTolObjects_GeomToleranceMatReqModif;

  // XCAFDimTolObjects_GeomToleranceObject.SetZoneModifier (method)
  SetZoneModifier(theZoneModif: XCAFDimTolObjects_GeomToleranceZoneModif): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetZoneModifier (method)
  GetZoneModifier(): XCAFDimTolObjects_GeomToleranceZoneModif;

  // XCAFDimTolObjects_GeomToleranceObject.SetValueOfZoneModifier (method)
  SetValueOfZoneModifier(theValue: number): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetValueOfZoneModifier (method)
  GetValueOfZoneModifier(): number;

  // XCAFDimTolObjects_GeomToleranceObject.SetModifiers (method)
  SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  // XCAFDimTolObjects_GeomToleranceObject.AddModifier (method)
  AddModifier(theModifier: XCAFDimTolObjects_GeomToleranceModif): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetModifiers (method)
  GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif;

  // XCAFDimTolObjects_GeomToleranceObject.SetMaxValueModifier (method)
  SetMaxValueModifier(theModifier: number): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetMaxValueModifier (method)
  GetMaxValueModifier(): number;

  // XCAFDimTolObjects_GeomToleranceObject.SetAxis (method)
  SetAxis(theAxis: gp_Ax2): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetAxis (method)
  GetAxis(): gp_Ax2;

  // XCAFDimTolObjects_GeomToleranceObject.HasAxis (method)
  HasAxis(): boolean;

  // XCAFDimTolObjects_GeomToleranceObject.SetPlane (method)
  SetPlane(thePlane: gp_Ax2): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetPlane (method)
  GetPlane(): gp_Ax2;

  // XCAFDimTolObjects_GeomToleranceObject.SetPoint (method)
  SetPoint(thePnt: gp_Pnt): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetPoint (method)
  GetPoint(): gp_Pnt;

  // XCAFDimTolObjects_GeomToleranceObject.SetPointTextAttach (method)
  SetPointTextAttach(thePntText: gp_Pnt): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetPointTextAttach (method)
  GetPointTextAttach(): gp_Pnt;

  // XCAFDimTolObjects_GeomToleranceObject.HasPlane (method)
  HasPlane(): boolean;

  // XCAFDimTolObjects_GeomToleranceObject.HasPoint (method)
  HasPoint(): boolean;

  // XCAFDimTolObjects_GeomToleranceObject.HasPointText (method)
  HasPointText(): boolean;

  // XCAFDimTolObjects_GeomToleranceObject.SetPresentation (method)
  SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetPresentation (method)
  GetPresentation(): TopoDS_Shape;

  // XCAFDimTolObjects_GeomToleranceObject.GetPresentationName (method)
  GetPresentationName(): TCollection_HAsciiString;

  // XCAFDimTolObjects_GeomToleranceObject.HasAffectedPlane (method)
  HasAffectedPlane(): boolean;

  // XCAFDimTolObjects_GeomToleranceObject.GetAffectedPlaneType (method)
  GetAffectedPlaneType(): XCAFDimTolObjects_ToleranceZoneAffectedPlane;

  // XCAFDimTolObjects_GeomToleranceObject.SetAffectedPlaneType (method)
  SetAffectedPlaneType(theType: XCAFDimTolObjects_ToleranceZoneAffectedPlane): void;

  // XCAFDimTolObjects_GeomToleranceObject.SetAffectedPlane (method)
  SetAffectedPlane(thePlane: gp_Pln): void;
  SetAffectedPlane(thePlane: gp_Pln, theType: XCAFDimTolObjects_ToleranceZoneAffectedPlane): void;

  // XCAFDimTolObjects_GeomToleranceObject.GetAffectedPlane (method)
  GetAffectedPlane(): gp_Pln;

  // XCAFDimTolObjects_GeomToleranceObject.get_type_name (method)
  static get_type_name(): string;

  // XCAFDimTolObjects_GeomToleranceObject.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDimTolObjects_GeomToleranceObject.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDimTolObjects_GeomToleranceObject.delete (method)
  delete(): void;

  // XCAFDimTolObjects_GeomToleranceObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDimTolObjects_GeomToleranceType: typeof XCAFDimTolObjects_GeomToleranceType[keyof typeof XCAFDimTolObjects_GeomToleranceType]

  readonly XCAFDimTolObjects_GeomToleranceType_None: 'XCAFDimTolObjects_GeomToleranceType_None'

  readonly XCAFDimTolObjects_GeomToleranceType_Angularity: 'XCAFDimTolObjects_GeomToleranceType_Angularity'

  readonly XCAFDimTolObjects_GeomToleranceType_CircularRunout: 'XCAFDimTolObjects_GeomToleranceType_CircularRunout'

  readonly XCAFDimTolObjects_GeomToleranceType_CircularityOrRoundness: 'XCAFDimTolObjects_GeomToleranceType_CircularityOrRoundness'

  readonly XCAFDimTolObjects_GeomToleranceType_Coaxiality: 'XCAFDimTolObjects_GeomToleranceType_Coaxiality'

  readonly XCAFDimTolObjects_GeomToleranceType_Concentricity: 'XCAFDimTolObjects_GeomToleranceType_Concentricity'

  readonly XCAFDimTolObjects_GeomToleranceType_Cylindricity: 'XCAFDimTolObjects_GeomToleranceType_Cylindricity'

  readonly XCAFDimTolObjects_GeomToleranceType_Flatness: 'XCAFDimTolObjects_GeomToleranceType_Flatness'

  readonly XCAFDimTolObjects_GeomToleranceType_Parallelism: 'XCAFDimTolObjects_GeomToleranceType_Parallelism'

  readonly XCAFDimTolObjects_GeomToleranceType_Perpendicularity: 'XCAFDimTolObjects_GeomToleranceType_Perpendicularity'

  readonly XCAFDimTolObjects_GeomToleranceType_Position: 'XCAFDimTolObjects_GeomToleranceType_Position'

  readonly XCAFDimTolObjects_GeomToleranceType_ProfileOfLine: 'XCAFDimTolObjects_GeomToleranceType_ProfileOfLine'

  readonly XCAFDimTolObjects_GeomToleranceType_ProfileOfSurface: 'XCAFDimTolObjects_GeomToleranceType_ProfileOfSurface'

  readonly XCAFDimTolObjects_GeomToleranceType_Straightness: 'XCAFDimTolObjects_GeomToleranceType_Straightness'

  readonly XCAFDimTolObjects_GeomToleranceType_Symmetry: 'XCAFDimTolObjects_GeomToleranceType_Symmetry'

  readonly XCAFDimTolObjects_GeomToleranceType_TotalRunout: 'XCAFDimTolObjects_GeomToleranceType_TotalRunout'

XCAFDimTolObjects_GeomToleranceTypeValue: typeof XCAFDimTolObjects_GeomToleranceTypeValue[keyof typeof XCAFDimTolObjects_GeomToleranceTypeValue]

  readonly XCAFDimTolObjects_GeomToleranceTypeValue_None: 'XCAFDimTolObjects_GeomToleranceTypeValue_None'

  readonly XCAFDimTolObjects_GeomToleranceTypeValue_Diameter: 'XCAFDimTolObjects_GeomToleranceTypeValue_Diameter'

  readonly XCAFDimTolObjects_GeomToleranceTypeValue_SphericalDiameter: 'XCAFDimTolObjects_GeomToleranceTypeValue_SphericalDiameter'

XCAFDimTolObjects_GeomToleranceZoneModif: typeof XCAFDimTolObjects_GeomToleranceZoneModif[keyof typeof XCAFDimTolObjects_GeomToleranceZoneModif]

  readonly XCAFDimTolObjects_GeomToleranceZoneModif_None: 'XCAFDimTolObjects_GeomToleranceZoneModif_None'

  readonly XCAFDimTolObjects_GeomToleranceZoneModif_Projected: 'XCAFDimTolObjects_GeomToleranceZoneModif_Projected'

  readonly XCAFDimTolObjects_GeomToleranceZoneModif_Runout: 'XCAFDimTolObjects_GeomToleranceZoneModif_Runout'

  readonly XCAFDimTolObjects_GeomToleranceZoneModif_NonUniform: 'XCAFDimTolObjects_GeomToleranceZoneModif_NonUniform'

XCAFDimTolObjects_ToleranceZoneAffectedPlane: typeof XCAFDimTolObjects_ToleranceZoneAffectedPlane[keyof typeof XCAFDimTolObjects_ToleranceZoneAffectedPlane]

  readonly XCAFDimTolObjects_ToleranceZoneAffectedPlane_None: 'XCAFDimTolObjects_ToleranceZoneAffectedPlane_None'

  readonly XCAFDimTolObjects_ToleranceZoneAffectedPlane_Intersection: 'XCAFDimTolObjects_ToleranceZoneAffectedPlane_Intersection'

  readonly XCAFDimTolObjects_ToleranceZoneAffectedPlane_Orientation: 'XCAFDimTolObjects_ToleranceZoneAffectedPlane_Orientation'

XCAFDimTolObjects_Tool: declare class XCAFDimTolObjects_Tool

  // XCAFDimTolObjects_Tool.constructor (constructor)
  constructor(theDoc: TDocStd_Document);

  // XCAFDimTolObjects_Tool.GetDimensions (method)
  GetDimensions(theDimensionObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

  // XCAFDimTolObjects_Tool.GetRefDimensions (method)
  GetRefDimensions(theShape: TopoDS_Shape, theDimensions: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): boolean;

  // XCAFDimTolObjects_Tool.GetGeomTolerances (method)
  GetGeomTolerances(theGeomToleranceObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject, theDatumObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject, theMap: NCollection_DataMap_handle_XCAFDimTolObjects_GeomToleranceObject_handle_XCAFDimTolObjects_DatumObject): void;

  // XCAFDimTolObjects_Tool.GetRefGeomTolerances (method)
  GetRefGeomTolerances(theShape: TopoDS_Shape, theGeomToleranceObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject, theDatumObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject, theMap: NCollection_DataMap_handle_XCAFDimTolObjects_GeomToleranceObject_handle_XCAFDimTolObjects_DatumObject): boolean;

  // XCAFDimTolObjects_Tool.GetRefDatum (method)
  GetRefDatum(theShape: TopoDS_Shape): { returnValue: boolean; theDatum: XCAFDimTolObjects_DatumObject; [Symbol.dispose](): void };

  // XCAFDimTolObjects_Tool.delete (method)
  delete(): void;

  // XCAFDimTolObjects_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDimTolObjects_DatumModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif

XCAFDimTolObjects_DimensionModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_DimensionModif

XCAFDimTolObjects_GeomToleranceModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif
