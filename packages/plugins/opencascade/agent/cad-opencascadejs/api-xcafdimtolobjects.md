# libcascade — XCAFDimTolObjects

22 top-level symbols. Signatures are verbatim typescript.

XCAFDimTolObjects_AngularQualifier: typeof XCAFDimTolObjects_AngularQualifier[keyof typeof XCAFDimTolObjects_AngularQualifier]

XCAFDimTolObjects_DatumModifWithValue: typeof XCAFDimTolObjects_DatumModifWithValue[keyof typeof XCAFDimTolObjects_DatumModifWithValue]

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

XCAFDimTolObjects_DatumTargetType: typeof XCAFDimTolObjects_DatumTargetType[keyof typeof XCAFDimTolObjects_DatumTargetType]

XCAFDimTolObjects_DimensionFormVariance: typeof XCAFDimTolObjects_DimensionFormVariance[keyof typeof XCAFDimTolObjects_DimensionFormVariance]

XCAFDimTolObjects_DimensionGrade: typeof XCAFDimTolObjects_DimensionGrade[keyof typeof XCAFDimTolObjects_DimensionGrade]

XCAFDimTolObjects_DimensionModif: typeof XCAFDimTolObjects_DimensionModif[keyof typeof XCAFDimTolObjects_DimensionModif]

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

XCAFDimTolObjects_DimensionType: typeof XCAFDimTolObjects_DimensionType[keyof typeof XCAFDimTolObjects_DimensionType]

XCAFDimTolObjects_GeomToleranceMatReqModif: typeof XCAFDimTolObjects_GeomToleranceMatReqModif[keyof typeof XCAFDimTolObjects_GeomToleranceMatReqModif]

XCAFDimTolObjects_GeomToleranceModif: typeof XCAFDimTolObjects_GeomToleranceModif[keyof typeof XCAFDimTolObjects_GeomToleranceModif]

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

XCAFDimTolObjects_GeomToleranceTypeValue: typeof XCAFDimTolObjects_GeomToleranceTypeValue[keyof typeof XCAFDimTolObjects_GeomToleranceTypeValue]

XCAFDimTolObjects_GeomToleranceZoneModif: typeof XCAFDimTolObjects_GeomToleranceZoneModif[keyof typeof XCAFDimTolObjects_GeomToleranceZoneModif]

XCAFDimTolObjects_ToleranceZoneAffectedPlane: typeof XCAFDimTolObjects_ToleranceZoneAffectedPlane[keyof typeof XCAFDimTolObjects_ToleranceZoneAffectedPlane]

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
