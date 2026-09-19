# libcascade — XCAFDimTolObjects

22 top-level symbols. Signatures are verbatim typescript.

XCAFDimTolObjects_AngularQualifier: typeof XCAFDimTolObjects_AngularQualifier[keyof typeof XCAFDimTolObjects_AngularQualifier]

XCAFDimTolObjects_DatumModifWithValue: typeof XCAFDimTolObjects_DatumModifWithValue[keyof typeof XCAFDimTolObjects_DatumModifWithValue]

XCAFDimTolObjects_DatumObject: declare class XCAFDimTolObjects_DatumObject extends Standard_Transient

  constructor

  GetSemanticName(): TCollection_HAsciiString;

  SetSemanticName(theName: TCollection_HAsciiString): void;

  GetName(): TCollection_HAsciiString;

  SetName(theTag: TCollection_HAsciiString): void;

  GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif;

  SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif): void;

  GetModifierWithValue(theModifier?: XCAFDimTolObjects_DatumModifWithValue, theValue?: number): { theModifier: XCAFDimTolObjects_DatumModifWithValue; theValue: number };

  SetModifierWithValue(theModifier: XCAFDimTolObjects_DatumModifWithValue, theValue: number): void;

  AddModifier(theModifier: XCAFDimTolObjects_DatumSingleModif): void;

  GetDatumTarget(): TopoDS_Shape;

  SetDatumTarget(theShape: TopoDS_Shape): void;

  GetPosition(): number;

  SetPosition(thePosition: number): void;

  IsDatumTarget(): boolean;
  IsDatumTarget(theIsDT: boolean): void;
  IsDatumTarget(): boolean;
  IsDatumTarget(theIsDT: boolean): void;

  GetDatumTargetType(): XCAFDimTolObjects_DatumTargetType;

  SetDatumTargetType(theType: XCAFDimTolObjects_DatumTargetType): void;

  GetDatumTargetAxis(): gp_Ax2;

  SetDatumTargetAxis(theAxis: gp_Ax2): void;

  GetDatumTargetLength(): number;

  SetDatumTargetLength(theLength: number): void;

  GetDatumTargetWidth(): number;

  SetDatumTargetWidth(theWidth: number): void;

  GetDatumTargetNumber(): number;

  SetDatumTargetNumber(theNumber: number): void;

  SetPlane(thePlane: gp_Ax2): void;

  GetPlane(): gp_Ax2;

  SetPoint(thePnt: gp_Pnt): void;

  GetPoint(): gp_Pnt;

  SetPointTextAttach(thePntText: gp_Pnt): void;

  GetPointTextAttach(): gp_Pnt;

  HasPlane(): boolean;

  HasPoint(): boolean;

  HasPointText(): boolean;

  SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

  GetPresentation(): TopoDS_Shape;

  GetPresentationName(): TCollection_HAsciiString;

  HasDatumTargetParams(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDimTolObjects_DatumSingleModif: typeof XCAFDimTolObjects_DatumSingleModif[keyof typeof XCAFDimTolObjects_DatumSingleModif]

XCAFDimTolObjects_DatumTargetType: typeof XCAFDimTolObjects_DatumTargetType[keyof typeof XCAFDimTolObjects_DatumTargetType]

XCAFDimTolObjects_DimensionFormVariance: typeof XCAFDimTolObjects_DimensionFormVariance[keyof typeof XCAFDimTolObjects_DimensionFormVariance]

XCAFDimTolObjects_DimensionGrade: typeof XCAFDimTolObjects_DimensionGrade[keyof typeof XCAFDimTolObjects_DimensionGrade]

XCAFDimTolObjects_DimensionModif: typeof XCAFDimTolObjects_DimensionModif[keyof typeof XCAFDimTolObjects_DimensionModif]

XCAFDimTolObjects_DimensionObject: declare class XCAFDimTolObjects_DimensionObject extends Standard_Transient

  constructor

  GetSemanticName(): TCollection_HAsciiString;

  SetSemanticName(theName: TCollection_HAsciiString): void;

  SetQualifier(theQualifier: XCAFDimTolObjects_DimensionQualifier): void;

  GetQualifier(): XCAFDimTolObjects_DimensionQualifier;

  HasQualifier(): boolean;

  SetAngularQualifier(theAngularQualifier: XCAFDimTolObjects_AngularQualifier): void;

  GetAngularQualifier(): XCAFDimTolObjects_AngularQualifier;

  HasAngularQualifier(): boolean;

  SetType(theTyupe: XCAFDimTolObjects_DimensionType): void;

  GetType(): XCAFDimTolObjects_DimensionType;

  GetValue(): number;

  GetValues(): NCollection_HArray1_double;

  SetValue(theValue: number): void;

  SetValues(theValue: NCollection_HArray1_double): void;

  IsDimWithRange(): boolean;

  SetUpperBound(theUpperBound: number): void;

  SetLowerBound(theLowerBound: number): void;

  GetUpperBound(): number;

  GetLowerBound(): number;

  IsDimWithPlusMinusTolerance(): boolean;

  SetUpperTolValue(theUperTolValue: number): boolean;

  SetLowerTolValue(theLowerTolValue: number): boolean;

  GetUpperTolValue(): number;

  GetLowerTolValue(): number;

  IsDimWithClassOfTolerance(): boolean;

  SetClassOfTolerance(theHole: boolean, theFormVariance: XCAFDimTolObjects_DimensionFormVariance, theGrade: XCAFDimTolObjects_DimensionGrade): void;

  GetClassOfTolerance(theHole?: boolean, theFormVariance?: XCAFDimTolObjects_DimensionFormVariance, theGrade?: XCAFDimTolObjects_DimensionGrade): { returnValue: boolean; theHole: boolean; theFormVariance: XCAFDimTolObjects_DimensionFormVariance; theGrade: XCAFDimTolObjects_DimensionGrade };

  SetNbOfDecimalPlaces(theL: number, theR: number): void;

  GetNbOfDecimalPlaces(theL?: number, theR?: number): { theL: number; theR: number };

  GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_DimensionModif;

  SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_DimensionModif): void;

  AddModifier(theModifier: XCAFDimTolObjects_DimensionModif): void;

  GetPath(): TopoDS_Edge;

  SetPath(thePath: TopoDS_Edge): void;

  GetDirection(theDir: gp_Dir): boolean;

  SetDirection(theDir: gp_Dir): boolean;

  SetPointTextAttach(thePntText: gp_Pnt): void;

  GetPointTextAttach(): gp_Pnt;

  HasTextPoint(): boolean;

  SetPlane(thePlane: gp_Ax2): void;

  GetPlane(): gp_Ax2;

  HasPlane(): boolean;

  HasPoint(): boolean;

  HasPoint2(): boolean;

  IsPointConnection(): boolean;

  IsPointConnection2(): boolean;

  SetPoint(thePnt: gp_Pnt): void;

  SetPoint2(thePnt: gp_Pnt): void;

  SetConnectionAxis(theAxis: gp_Ax2): void;

  SetConnectionAxis2(theAxis: gp_Ax2): void;

  GetPoint(): gp_Pnt;

  GetPoint2(): gp_Pnt;

  GetConnectionAxis(): gp_Ax2;

  GetConnectionAxis2(): gp_Ax2;

  GetConnectionName(): TCollection_HAsciiString;

  GetConnectionName2(): TCollection_HAsciiString;

  SetConnectionName(theName: TCollection_HAsciiString): void;

  SetConnectionName2(theName: TCollection_HAsciiString): void;

  SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

  GetPresentation(): TopoDS_Shape;

  GetPresentationName(): TCollection_HAsciiString;

  HasDescriptions(): boolean;

  NbDescriptions(): number;

  GetDescription(theNumber: number): TCollection_HAsciiString;

  GetDescriptionName(theNumber: number): TCollection_HAsciiString;

  RemoveDescription(theNumber: number): void;

  AddDescription(theDescription: TCollection_HAsciiString, theName: TCollection_HAsciiString): void;

  static IsDimensionalLocation(theType: XCAFDimTolObjects_DimensionType): boolean;

  static IsDimensionalSize(theType: XCAFDimTolObjects_DimensionType): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDimTolObjects_DimensionQualifier: typeof XCAFDimTolObjects_DimensionQualifier[keyof typeof XCAFDimTolObjects_DimensionQualifier]

XCAFDimTolObjects_DimensionType: typeof XCAFDimTolObjects_DimensionType[keyof typeof XCAFDimTolObjects_DimensionType]

XCAFDimTolObjects_GeomToleranceMatReqModif: typeof XCAFDimTolObjects_GeomToleranceMatReqModif[keyof typeof XCAFDimTolObjects_GeomToleranceMatReqModif]

XCAFDimTolObjects_GeomToleranceModif: typeof XCAFDimTolObjects_GeomToleranceModif[keyof typeof XCAFDimTolObjects_GeomToleranceModif]

XCAFDimTolObjects_GeomToleranceObject: declare class XCAFDimTolObjects_GeomToleranceObject extends Standard_Transient

  constructor

  GetSemanticName(): TCollection_HAsciiString;

  SetSemanticName(theName: TCollection_HAsciiString): void;

  SetType(theType: XCAFDimTolObjects_GeomToleranceType): void;

  GetType(): XCAFDimTolObjects_GeomToleranceType;

  SetTypeOfValue(theTypeOfValue: XCAFDimTolObjects_GeomToleranceTypeValue): void;

  GetTypeOfValue(): XCAFDimTolObjects_GeomToleranceTypeValue;

  SetValue(theValue: number): void;

  GetValue(): number;

  SetMaterialRequirementModifier(theMatReqModif: XCAFDimTolObjects_GeomToleranceMatReqModif): void;

  GetMaterialRequirementModifier(): XCAFDimTolObjects_GeomToleranceMatReqModif;

  SetZoneModifier(theZoneModif: XCAFDimTolObjects_GeomToleranceZoneModif): void;

  GetZoneModifier(): XCAFDimTolObjects_GeomToleranceZoneModif;

  SetValueOfZoneModifier(theValue: number): void;

  GetValueOfZoneModifier(): number;

  SetModifiers(theModifiers: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif): void;

  AddModifier(theModifier: XCAFDimTolObjects_GeomToleranceModif): void;

  GetModifiers(): NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif;

  SetMaxValueModifier(theModifier: number): void;

  GetMaxValueModifier(): number;

  SetAxis(theAxis: gp_Ax2): void;

  GetAxis(): gp_Ax2;

  HasAxis(): boolean;

  SetPlane(thePlane: gp_Ax2): void;

  GetPlane(): gp_Ax2;

  SetPoint(thePnt: gp_Pnt): void;

  GetPoint(): gp_Pnt;

  SetPointTextAttach(thePntText: gp_Pnt): void;

  GetPointTextAttach(): gp_Pnt;

  HasPlane(): boolean;

  HasPoint(): boolean;

  HasPointText(): boolean;

  SetPresentation(thePresentation: TopoDS_Shape, thePresentationName: TCollection_HAsciiString): void;

  GetPresentation(): TopoDS_Shape;

  GetPresentationName(): TCollection_HAsciiString;

  HasAffectedPlane(): boolean;

  GetAffectedPlaneType(): XCAFDimTolObjects_ToleranceZoneAffectedPlane;

  SetAffectedPlaneType(theType: XCAFDimTolObjects_ToleranceZoneAffectedPlane): void;

  SetAffectedPlane(thePlane: gp_Pln): void;
  SetAffectedPlane(thePlane: gp_Pln, theType: XCAFDimTolObjects_ToleranceZoneAffectedPlane): void;
  SetAffectedPlane(thePlane: gp_Pln): void;
  SetAffectedPlane(thePlane: gp_Pln, theType: XCAFDimTolObjects_ToleranceZoneAffectedPlane): void;

  GetAffectedPlane(): gp_Pln;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDimTolObjects_GeomToleranceType: typeof XCAFDimTolObjects_GeomToleranceType[keyof typeof XCAFDimTolObjects_GeomToleranceType]

XCAFDimTolObjects_GeomToleranceTypeValue: typeof XCAFDimTolObjects_GeomToleranceTypeValue[keyof typeof XCAFDimTolObjects_GeomToleranceTypeValue]

XCAFDimTolObjects_GeomToleranceZoneModif: typeof XCAFDimTolObjects_GeomToleranceZoneModif[keyof typeof XCAFDimTolObjects_GeomToleranceZoneModif]

XCAFDimTolObjects_ToleranceZoneAffectedPlane: typeof XCAFDimTolObjects_ToleranceZoneAffectedPlane[keyof typeof XCAFDimTolObjects_ToleranceZoneAffectedPlane]

XCAFDimTolObjects_Tool: declare class XCAFDimTolObjects_Tool

  constructor

  GetDimensions(theDimensionObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): void;

  GetRefDimensions(theShape: TopoDS_Shape, theDimensions: NCollection_Sequence_handle_XCAFDimTolObjects_DimensionObject): boolean;

  GetGeomTolerances(theGeomToleranceObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject, theDatumObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject, theMap: NCollection_DataMap_handle_XCAFDimTolObjects_GeomToleranceObject_handle_XCAFDimTolObjects_DatumObject): void;

  GetRefGeomTolerances(theShape: TopoDS_Shape, theGeomToleranceObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_GeomToleranceObject, theDatumObjectSequence: NCollection_Sequence_handle_XCAFDimTolObjects_DatumObject, theMap: NCollection_DataMap_handle_XCAFDimTolObjects_GeomToleranceObject_handle_XCAFDimTolObjects_DatumObject): boolean;

  GetRefDatum(theShape: TopoDS_Shape): { returnValue: boolean; theDatum: XCAFDimTolObjects_DatumObject; [Symbol.dispose](): void };

  delete(): void;

  [Symbol.dispose](): void;

XCAFDimTolObjects_DatumModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_DatumSingleModif

XCAFDimTolObjects_DimensionModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_DimensionModif

XCAFDimTolObjects_GeomToleranceModifiersSequence: NCollection_Sequence_XCAFDimTolObjects_GeomToleranceModif
