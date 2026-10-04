# libcascade — IGESDimen

29 top-level symbols. Signatures are verbatim typescript.

IGESDimen: declare class IGESDimen

  // IGESDimen.constructor (constructor)
  constructor();

  // IGESDimen.Init (method)
  static Init(): void;

  // IGESDimen.Protocol (method)
  static Protocol(): IGESDimen_Protocol;

  // IGESDimen.delete (method)
  delete(): void;

  // IGESDimen.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_AngularDimension: declare class IGESDimen_AngularDimension extends IGESData_IGESEntity

  // IGESDimen_AngularDimension.constructor (constructor)
  constructor();

  // IGESDimen_AngularDimension.Init (method)
  Init(aNote: IGESDimen_GeneralNote, aLine: IGESDimen_WitnessLine, anotherLine: IGESDimen_WitnessLine, aVertex: gp_XY, aRadius: number, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow): void;

  // IGESDimen_AngularDimension.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_AngularDimension.HasFirstWitnessLine (method)
  HasFirstWitnessLine(): boolean;

  // IGESDimen_AngularDimension.FirstWitnessLine (method)
  FirstWitnessLine(): IGESDimen_WitnessLine;

  // IGESDimen_AngularDimension.HasSecondWitnessLine (method)
  HasSecondWitnessLine(): boolean;

  // IGESDimen_AngularDimension.SecondWitnessLine (method)
  SecondWitnessLine(): IGESDimen_WitnessLine;

  // IGESDimen_AngularDimension.Vertex (method)
  Vertex(): gp_Pnt2d;

  // IGESDimen_AngularDimension.TransformedVertex (method)
  TransformedVertex(): gp_Pnt2d;

  // IGESDimen_AngularDimension.Radius (method)
  Radius(): number;

  // IGESDimen_AngularDimension.FirstLeader (method)
  FirstLeader(): IGESDimen_LeaderArrow;

  // IGESDimen_AngularDimension.SecondLeader (method)
  SecondLeader(): IGESDimen_LeaderArrow;

  // IGESDimen_AngularDimension.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_AngularDimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_AngularDimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_AngularDimension.delete (method)
  delete(): void;

  // IGESDimen_AngularDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_BasicDimension: declare class IGESDimen_BasicDimension extends IGESData_IGESEntity

  // IGESDimen_BasicDimension.constructor (constructor)
  constructor();

  // IGESDimen_BasicDimension.Init (method)
  Init(nbPropVal: number, lowerLeft: gp_XY, lowerRight: gp_XY, upperRight: gp_XY, upperLeft: gp_XY): void;

  // IGESDimen_BasicDimension.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESDimen_BasicDimension.LowerLeft (method)
  LowerLeft(): gp_Pnt2d;

  // IGESDimen_BasicDimension.LowerRight (method)
  LowerRight(): gp_Pnt2d;

  // IGESDimen_BasicDimension.UpperRight (method)
  UpperRight(): gp_Pnt2d;

  // IGESDimen_BasicDimension.UpperLeft (method)
  UpperLeft(): gp_Pnt2d;

  // IGESDimen_BasicDimension.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_BasicDimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_BasicDimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_BasicDimension.delete (method)
  delete(): void;

  // IGESDimen_BasicDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_CenterLine: declare class IGESDimen_CenterLine extends IGESData_IGESEntity

  // IGESDimen_CenterLine.constructor (constructor)
  constructor();

  // IGESDimen_CenterLine.Init (method)
  Init(aDataType: number, aZdisp: number, dataPnts: NCollection_HArray1_gp_XY): void;

  // IGESDimen_CenterLine.SetCrossHair (method)
  SetCrossHair(mode: boolean): void;

  // IGESDimen_CenterLine.Datatype (method)
  Datatype(): number;

  // IGESDimen_CenterLine.NbPoints (method)
  NbPoints(): number;

  // IGESDimen_CenterLine.ZDisplacement (method)
  ZDisplacement(): number;

  // IGESDimen_CenterLine.Point (method)
  Point(Index: number): gp_Pnt;

  // IGESDimen_CenterLine.TransformedPoint (method)
  TransformedPoint(Index: number): gp_Pnt;

  // IGESDimen_CenterLine.IsCrossHair (method)
  IsCrossHair(): boolean;

  // IGESDimen_CenterLine.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_CenterLine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_CenterLine.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_CenterLine.delete (method)
  delete(): void;

  // IGESDimen_CenterLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_CurveDimension: declare class IGESDimen_CurveDimension extends IGESData_IGESEntity

  // IGESDimen_CurveDimension.constructor (constructor)
  constructor();

  // IGESDimen_CurveDimension.Init (method)
  Init(aNote: IGESDimen_GeneralNote, aCurve: IGESData_IGESEntity, anotherCurve: IGESData_IGESEntity, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aLine: IGESDimen_WitnessLine, anotherLine: IGESDimen_WitnessLine): void;

  // IGESDimen_CurveDimension.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_CurveDimension.FirstCurve (method)
  FirstCurve(): IGESData_IGESEntity;

  // IGESDimen_CurveDimension.HasSecondCurve (method)
  HasSecondCurve(): boolean;

  // IGESDimen_CurveDimension.SecondCurve (method)
  SecondCurve(): IGESData_IGESEntity;

  // IGESDimen_CurveDimension.FirstLeader (method)
  FirstLeader(): IGESDimen_LeaderArrow;

  // IGESDimen_CurveDimension.SecondLeader (method)
  SecondLeader(): IGESDimen_LeaderArrow;

  // IGESDimen_CurveDimension.HasFirstWitnessLine (method)
  HasFirstWitnessLine(): boolean;

  // IGESDimen_CurveDimension.FirstWitnessLine (method)
  FirstWitnessLine(): IGESDimen_WitnessLine;

  // IGESDimen_CurveDimension.HasSecondWitnessLine (method)
  HasSecondWitnessLine(): boolean;

  // IGESDimen_CurveDimension.SecondWitnessLine (method)
  SecondWitnessLine(): IGESDimen_WitnessLine;

  // IGESDimen_CurveDimension.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_CurveDimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_CurveDimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_CurveDimension.delete (method)
  delete(): void;

  // IGESDimen_CurveDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_DiameterDimension: declare class IGESDimen_DiameterDimension extends IGESData_IGESEntity

  // IGESDimen_DiameterDimension.constructor (constructor)
  constructor();

  // IGESDimen_DiameterDimension.Init (method)
  Init(aNote: IGESDimen_GeneralNote, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aCenter: gp_XY): void;

  // IGESDimen_DiameterDimension.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_DiameterDimension.FirstLeader (method)
  FirstLeader(): IGESDimen_LeaderArrow;

  // IGESDimen_DiameterDimension.HasSecondLeader (method)
  HasSecondLeader(): boolean;

  // IGESDimen_DiameterDimension.SecondLeader (method)
  SecondLeader(): IGESDimen_LeaderArrow;

  // IGESDimen_DiameterDimension.Center (method)
  Center(): gp_Pnt2d;

  // IGESDimen_DiameterDimension.TransformedCenter (method)
  TransformedCenter(): gp_Pnt2d;

  // IGESDimen_DiameterDimension.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_DiameterDimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_DiameterDimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_DiameterDimension.delete (method)
  delete(): void;

  // IGESDimen_DiameterDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_DimensionDisplayData: declare class IGESDimen_DimensionDisplayData extends IGESData_IGESEntity

  // IGESDimen_DimensionDisplayData.constructor (constructor)
  constructor();

  // IGESDimen_DimensionDisplayData.Init (method)
  Init(numProps: number, aDimType: number, aLabelPos: number, aCharSet: number, aString: TCollection_HAsciiString, aSymbol: number, anAng: number, anAlign: number, aLevel: number, aPlace: number, anOrient: number, initVal: number, notes: NCollection_HArray1_int, startInd: NCollection_HArray1_int, endInd: NCollection_HArray1_int): void;

  // IGESDimen_DimensionDisplayData.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESDimen_DimensionDisplayData.DimensionType (method)
  DimensionType(): number;

  // IGESDimen_DimensionDisplayData.LabelPosition (method)
  LabelPosition(): number;

  // IGESDimen_DimensionDisplayData.CharacterSet (method)
  CharacterSet(): number;

  // IGESDimen_DimensionDisplayData.LString (method)
  LString(): TCollection_HAsciiString;

  // IGESDimen_DimensionDisplayData.DecimalSymbol (method)
  DecimalSymbol(): number;

  // IGESDimen_DimensionDisplayData.WitnessLineAngle (method)
  WitnessLineAngle(): number;

  // IGESDimen_DimensionDisplayData.TextAlignment (method)
  TextAlignment(): number;

  // IGESDimen_DimensionDisplayData.TextLevel (method)
  TextLevel(): number;

  // IGESDimen_DimensionDisplayData.TextPlacement (method)
  TextPlacement(): number;

  // IGESDimen_DimensionDisplayData.ArrowHeadOrientation (method)
  ArrowHeadOrientation(): number;

  // IGESDimen_DimensionDisplayData.InitialValue (method)
  InitialValue(): number;

  // IGESDimen_DimensionDisplayData.NbSupplementaryNotes (method)
  NbSupplementaryNotes(): number;

  // IGESDimen_DimensionDisplayData.SupplementaryNote (method)
  SupplementaryNote(Index: number): number;

  // IGESDimen_DimensionDisplayData.StartIndex (method)
  StartIndex(Index: number): number;

  // IGESDimen_DimensionDisplayData.EndIndex (method)
  EndIndex(Index: number): number;

  // IGESDimen_DimensionDisplayData.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_DimensionDisplayData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_DimensionDisplayData.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_DimensionDisplayData.delete (method)
  delete(): void;

  // IGESDimen_DimensionDisplayData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_DimensionTolerance: declare class IGESDimen_DimensionTolerance extends IGESData_IGESEntity

  // IGESDimen_DimensionTolerance.constructor (constructor)
  constructor();

  // IGESDimen_DimensionTolerance.Init (method)
  Init(nbPropVal: number, aSecTolFlag: number, aTolType: number, aTolPlaceFlag: number, anUpperTol: number, aLowerTol: number, aSignFlag: boolean, aFracFlag: number, aPrecision: number): void;

  // IGESDimen_DimensionTolerance.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESDimen_DimensionTolerance.SecondaryToleranceFlag (method)
  SecondaryToleranceFlag(): number;

  // IGESDimen_DimensionTolerance.ToleranceType (method)
  ToleranceType(): number;

  // IGESDimen_DimensionTolerance.TolerancePlacementFlag (method)
  TolerancePlacementFlag(): number;

  // IGESDimen_DimensionTolerance.UpperTolerance (method)
  UpperTolerance(): number;

  // IGESDimen_DimensionTolerance.LowerTolerance (method)
  LowerTolerance(): number;

  // IGESDimen_DimensionTolerance.SignSuppressionFlag (method)
  SignSuppressionFlag(): boolean;

  // IGESDimen_DimensionTolerance.FractionFlag (method)
  FractionFlag(): number;

  // IGESDimen_DimensionTolerance.Precision (method)
  Precision(): number;

  // IGESDimen_DimensionTolerance.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_DimensionTolerance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_DimensionTolerance.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_DimensionTolerance.delete (method)
  delete(): void;

  // IGESDimen_DimensionTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_DimensionUnits: declare class IGESDimen_DimensionUnits extends IGESData_IGESEntity

  // IGESDimen_DimensionUnits.constructor (constructor)
  constructor();

  // IGESDimen_DimensionUnits.Init (method)
  Init(nbPropVal: number, aSecondPos: number, aUnitsInd: number, aCharSet: number, aFormat: TCollection_HAsciiString, aFracFlag: number, aPrecision: number): void;

  // IGESDimen_DimensionUnits.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESDimen_DimensionUnits.SecondaryDimenPosition (method)
  SecondaryDimenPosition(): number;

  // IGESDimen_DimensionUnits.UnitsIndicator (method)
  UnitsIndicator(): number;

  // IGESDimen_DimensionUnits.CharacterSet (method)
  CharacterSet(): number;

  // IGESDimen_DimensionUnits.FormatString (method)
  FormatString(): TCollection_HAsciiString;

  // IGESDimen_DimensionUnits.FractionFlag (method)
  FractionFlag(): number;

  // IGESDimen_DimensionUnits.PrecisionOrDenominator (method)
  PrecisionOrDenominator(): number;

  // IGESDimen_DimensionUnits.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_DimensionUnits.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_DimensionUnits.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_DimensionUnits.delete (method)
  delete(): void;

  // IGESDimen_DimensionUnits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_DimensionedGeometry: declare class IGESDimen_DimensionedGeometry extends IGESData_IGESEntity

  // IGESDimen_DimensionedGeometry.constructor (constructor)
  constructor();

  // IGESDimen_DimensionedGeometry.Init (method)
  Init(nbDims: number, aDimension: IGESData_IGESEntity, entities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDimen_DimensionedGeometry.NbDimensions (method)
  NbDimensions(): number;

  // IGESDimen_DimensionedGeometry.NbGeometryEntities (method)
  NbGeometryEntities(): number;

  // IGESDimen_DimensionedGeometry.DimensionEntity (method)
  DimensionEntity(): IGESData_IGESEntity;

  // IGESDimen_DimensionedGeometry.GeometryEntity (method)
  GeometryEntity(Index: number): IGESData_IGESEntity;

  // IGESDimen_DimensionedGeometry.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_DimensionedGeometry.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_DimensionedGeometry.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_DimensionedGeometry.delete (method)
  delete(): void;

  // IGESDimen_DimensionedGeometry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_FlagNote: declare class IGESDimen_FlagNote extends IGESData_IGESEntity

  // IGESDimen_FlagNote.constructor (constructor)
  constructor();

  // IGESDimen_FlagNote.Init (method)
  Init(leftCorner: gp_XYZ, anAngle: number, aNote: IGESDimen_GeneralNote, someLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

  // IGESDimen_FlagNote.LowerLeftCorner (method)
  LowerLeftCorner(): gp_Pnt;

  // IGESDimen_FlagNote.TransformedLowerLeftCorner (method)
  TransformedLowerLeftCorner(): gp_Pnt;

  // IGESDimen_FlagNote.Angle (method)
  Angle(): number;

  // IGESDimen_FlagNote.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_FlagNote.NbLeaders (method)
  NbLeaders(): number;

  // IGESDimen_FlagNote.Leader (method)
  Leader(Index: number): IGESDimen_LeaderArrow;

  // IGESDimen_FlagNote.Height (method)
  Height(): number;

  // IGESDimen_FlagNote.CharacterHeight (method)
  CharacterHeight(): number;

  // IGESDimen_FlagNote.Length (method)
  Length(): number;

  // IGESDimen_FlagNote.TextWidth (method)
  TextWidth(): number;

  // IGESDimen_FlagNote.TipLength (method)
  TipLength(): number;

  // IGESDimen_FlagNote.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_FlagNote.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_FlagNote.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_FlagNote.delete (method)
  delete(): void;

  // IGESDimen_FlagNote.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_GeneralLabel: declare class IGESDimen_GeneralLabel extends IGESData_IGESEntity

  // IGESDimen_GeneralLabel.constructor (constructor)
  constructor();

  // IGESDimen_GeneralLabel.Init (method)
  Init(aNote: IGESDimen_GeneralNote, someLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

  // IGESDimen_GeneralLabel.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_GeneralLabel.NbLeaders (method)
  NbLeaders(): number;

  // IGESDimen_GeneralLabel.Leader (method)
  Leader(Index: number): IGESDimen_LeaderArrow;

  // IGESDimen_GeneralLabel.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_GeneralLabel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_GeneralLabel.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_GeneralLabel.delete (method)
  delete(): void;

  // IGESDimen_GeneralLabel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_GeneralModule: declare class IGESDimen_GeneralModule extends IGESData_GeneralModule

  // IGESDimen_GeneralModule.constructor (constructor)
  constructor();

  // IGESDimen_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESDimen_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDimen_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESDimen_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESDimen_GeneralModule.CategoryNumber (method)
  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  // IGESDimen_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_GeneralModule.delete (method)
  delete(): void;

  // IGESDimen_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_GeneralNote: declare class IGESDimen_GeneralNote extends IGESData_IGESEntity

  // IGESDimen_GeneralNote.constructor (constructor)
  constructor();

  // IGESDimen_GeneralNote.Init (method)
  Init(nbChars: NCollection_HArray1_int, widths: NCollection_HArray1_double, heights: NCollection_HArray1_double, fontCodes: NCollection_HArray1_int, fonts: NCollection_HArray1_handle_IGESGraph_TextFontDef, slants: NCollection_HArray1_double, rotations: NCollection_HArray1_double, mirrorFlags: NCollection_HArray1_int, rotFlags: NCollection_HArray1_int, start: NCollection_HArray1_gp_XYZ, texts: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // IGESDimen_GeneralNote.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESDimen_GeneralNote.NbStrings (method)
  NbStrings(): number;

  // IGESDimen_GeneralNote.NbCharacters (method)
  NbCharacters(Index: number): number;

  // IGESDimen_GeneralNote.BoxWidth (method)
  BoxWidth(Index: number): number;

  // IGESDimen_GeneralNote.BoxHeight (method)
  BoxHeight(Index: number): number;

  // IGESDimen_GeneralNote.IsFontEntity (method)
  IsFontEntity(Index: number): boolean;

  // IGESDimen_GeneralNote.FontCode (method)
  FontCode(Index: number): number;

  // IGESDimen_GeneralNote.FontEntity (method)
  FontEntity(Index: number): IGESGraph_TextFontDef;

  // IGESDimen_GeneralNote.SlantAngle (method)
  SlantAngle(Index: number): number;

  // IGESDimen_GeneralNote.RotationAngle (method)
  RotationAngle(Index: number): number;

  // IGESDimen_GeneralNote.MirrorFlag (method)
  MirrorFlag(Index: number): number;

  // IGESDimen_GeneralNote.RotateFlag (method)
  RotateFlag(Index: number): number;

  // IGESDimen_GeneralNote.StartPoint (method)
  StartPoint(Index: number): gp_Pnt;

  // IGESDimen_GeneralNote.TransformedStartPoint (method)
  TransformedStartPoint(Index: number): gp_Pnt;

  // IGESDimen_GeneralNote.ZDepthStartPoint (method)
  ZDepthStartPoint(Index: number): number;

  // IGESDimen_GeneralNote.Text (method)
  Text(Index: number): TCollection_HAsciiString;

  // IGESDimen_GeneralNote.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_GeneralNote.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_GeneralNote.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_GeneralNote.delete (method)
  delete(): void;

  // IGESDimen_GeneralNote.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_GeneralSymbol: declare class IGESDimen_GeneralSymbol extends IGESData_IGESEntity

  // IGESDimen_GeneralSymbol.constructor (constructor)
  constructor();

  // IGESDimen_GeneralSymbol.Init (method)
  Init(aNote: IGESDimen_GeneralNote, allGeoms: NCollection_HArray1_handle_IGESData_IGESEntity, allLeaders: NCollection_HArray1_handle_IGESDimen_LeaderArrow): void;

  // IGESDimen_GeneralSymbol.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESDimen_GeneralSymbol.HasNote (method)
  HasNote(): boolean;

  // IGESDimen_GeneralSymbol.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_GeneralSymbol.NbGeomEntities (method)
  NbGeomEntities(): number;

  // IGESDimen_GeneralSymbol.GeomEntity (method)
  GeomEntity(Index: number): IGESData_IGESEntity;

  // IGESDimen_GeneralSymbol.NbLeaders (method)
  NbLeaders(): number;

  // IGESDimen_GeneralSymbol.LeaderArrow (method)
  LeaderArrow(Index: number): IGESDimen_LeaderArrow;

  // IGESDimen_GeneralSymbol.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_GeneralSymbol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_GeneralSymbol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_GeneralSymbol.delete (method)
  delete(): void;

  // IGESDimen_GeneralSymbol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_LeaderArrow: declare class IGESDimen_LeaderArrow extends IGESData_IGESEntity

  // IGESDimen_LeaderArrow.constructor (constructor)
  constructor();

  // IGESDimen_LeaderArrow.Init (method)
  Init(height: number, width: number, depth: number, position: gp_XY, segments: NCollection_HArray1_gp_XY): void;

  // IGESDimen_LeaderArrow.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESDimen_LeaderArrow.NbSegments (method)
  NbSegments(): number;

  // IGESDimen_LeaderArrow.ArrowHeadHeight (method)
  ArrowHeadHeight(): number;

  // IGESDimen_LeaderArrow.ArrowHeadWidth (method)
  ArrowHeadWidth(): number;

  // IGESDimen_LeaderArrow.ZDepth (method)
  ZDepth(): number;

  // IGESDimen_LeaderArrow.ArrowHead (method)
  ArrowHead(): gp_Pnt2d;

  // IGESDimen_LeaderArrow.TransformedArrowHead (method)
  TransformedArrowHead(): gp_Pnt;

  // IGESDimen_LeaderArrow.SegmentTail (method)
  SegmentTail(Index: number): gp_Pnt2d;

  // IGESDimen_LeaderArrow.TransformedSegmentTail (method)
  TransformedSegmentTail(Index: number): gp_Pnt;

  // IGESDimen_LeaderArrow.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_LeaderArrow.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_LeaderArrow.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_LeaderArrow.delete (method)
  delete(): void;

  // IGESDimen_LeaderArrow.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_LinearDimension: declare class IGESDimen_LinearDimension extends IGESData_IGESEntity

  // IGESDimen_LinearDimension.constructor (constructor)
  constructor();

  // IGESDimen_LinearDimension.Init (method)
  Init(aNote: IGESDimen_GeneralNote, aLeader: IGESDimen_LeaderArrow, anotherLeader: IGESDimen_LeaderArrow, aWitness: IGESDimen_WitnessLine, anotherWitness: IGESDimen_WitnessLine): void;

  // IGESDimen_LinearDimension.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESDimen_LinearDimension.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_LinearDimension.FirstLeader (method)
  FirstLeader(): IGESDimen_LeaderArrow;

  // IGESDimen_LinearDimension.SecondLeader (method)
  SecondLeader(): IGESDimen_LeaderArrow;

  // IGESDimen_LinearDimension.HasFirstWitness (method)
  HasFirstWitness(): boolean;

  // IGESDimen_LinearDimension.FirstWitness (method)
  FirstWitness(): IGESDimen_WitnessLine;

  // IGESDimen_LinearDimension.HasSecondWitness (method)
  HasSecondWitness(): boolean;

  // IGESDimen_LinearDimension.SecondWitness (method)
  SecondWitness(): IGESDimen_WitnessLine;

  // IGESDimen_LinearDimension.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_LinearDimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_LinearDimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_LinearDimension.delete (method)
  delete(): void;

  // IGESDimen_LinearDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_NewDimensionedGeometry: declare class IGESDimen_NewDimensionedGeometry extends IGESData_IGESEntity

  // IGESDimen_NewDimensionedGeometry.constructor (constructor)
  constructor();

  // IGESDimen_NewDimensionedGeometry.Init (method)
  Init(nbDimens: number, aDimen: IGESData_IGESEntity, anOrientation: number, anAngle: number, allEntities: NCollection_HArray1_handle_IGESData_IGESEntity, allLocations: NCollection_HArray1_int, allPoints: NCollection_HArray1_gp_XYZ): void;

  // IGESDimen_NewDimensionedGeometry.NbDimensions (method)
  NbDimensions(): number;

  // IGESDimen_NewDimensionedGeometry.NbGeometries (method)
  NbGeometries(): number;

  // IGESDimen_NewDimensionedGeometry.DimensionEntity (method)
  DimensionEntity(): IGESData_IGESEntity;

  // IGESDimen_NewDimensionedGeometry.DimensionOrientationFlag (method)
  DimensionOrientationFlag(): number;

  // IGESDimen_NewDimensionedGeometry.AngleValue (method)
  AngleValue(): number;

  // IGESDimen_NewDimensionedGeometry.GeometryEntity (method)
  GeometryEntity(Index: number): IGESData_IGESEntity;

  // IGESDimen_NewDimensionedGeometry.DimensionLocationFlag (method)
  DimensionLocationFlag(Index: number): number;

  // IGESDimen_NewDimensionedGeometry.Point (method)
  Point(Index: number): gp_Pnt;

  // IGESDimen_NewDimensionedGeometry.TransformedPoint (method)
  TransformedPoint(Index: number): gp_Pnt;

  // IGESDimen_NewDimensionedGeometry.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_NewDimensionedGeometry.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_NewDimensionedGeometry.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_NewDimensionedGeometry.delete (method)
  delete(): void;

  // IGESDimen_NewDimensionedGeometry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_NewGeneralNote: declare class IGESDimen_NewGeneralNote extends IGESData_IGESEntity

  // IGESDimen_NewGeneralNote.constructor (constructor)
  constructor();

  // IGESDimen_NewGeneralNote.Init (method)
  Init(width: number, height: number, justifyCode: number, areaLoc: gp_XYZ, areaRotationAngle: number, baseLinePos: gp_XYZ, normalInterlineSpace: number, charDisplays: NCollection_HArray1_int, charWidths: NCollection_HArray1_double, charHeights: NCollection_HArray1_double, interCharSpc: NCollection_HArray1_double, interLineSpc: NCollection_HArray1_double, fontStyles: NCollection_HArray1_int, charAngles: NCollection_HArray1_double, controlCodeStrings: NCollection_HArray1_handle_TCollection_HAsciiString, nbChars: NCollection_HArray1_int, boxWidths: NCollection_HArray1_double, boxHeights: NCollection_HArray1_double, charSetCodes: NCollection_HArray1_int, charSetEntities: NCollection_HArray1_handle_IGESData_IGESEntity, slAngles: NCollection_HArray1_double, rotAngles: NCollection_HArray1_double, mirrorFlags: NCollection_HArray1_int, rotateFlags: NCollection_HArray1_int, startPoints: NCollection_HArray1_gp_XYZ, texts: NCollection_HArray1_handle_TCollection_HAsciiString): void;

  // IGESDimen_NewGeneralNote.TextWidth (method)
  TextWidth(): number;

  // IGESDimen_NewGeneralNote.TextHeight (method)
  TextHeight(): number;

  // IGESDimen_NewGeneralNote.JustifyCode (method)
  JustifyCode(): number;

  // IGESDimen_NewGeneralNote.AreaLocation (method)
  AreaLocation(): gp_Pnt;

  // IGESDimen_NewGeneralNote.TransformedAreaLocation (method)
  TransformedAreaLocation(): gp_Pnt;

  // IGESDimen_NewGeneralNote.ZDepthAreaLocation (method)
  ZDepthAreaLocation(): number;

  // IGESDimen_NewGeneralNote.AreaRotationAngle (method)
  AreaRotationAngle(): number;

  // IGESDimen_NewGeneralNote.BaseLinePosition (method)
  BaseLinePosition(): gp_Pnt;

  // IGESDimen_NewGeneralNote.TransformedBaseLinePosition (method)
  TransformedBaseLinePosition(): gp_Pnt;

  // IGESDimen_NewGeneralNote.ZDepthBaseLinePosition (method)
  ZDepthBaseLinePosition(): number;

  // IGESDimen_NewGeneralNote.NormalInterlineSpace (method)
  NormalInterlineSpace(): number;

  // IGESDimen_NewGeneralNote.NbStrings (method)
  NbStrings(): number;

  // IGESDimen_NewGeneralNote.CharacterDisplay (method)
  CharacterDisplay(Index: number): number;

  // IGESDimen_NewGeneralNote.IsVariable (method)
  IsVariable(Index: number): boolean;

  // IGESDimen_NewGeneralNote.CharacterWidth (method)
  CharacterWidth(Index: number): number;

  // IGESDimen_NewGeneralNote.CharacterHeight (method)
  CharacterHeight(Index: number): number;

  // IGESDimen_NewGeneralNote.InterCharacterSpace (method)
  InterCharacterSpace(Index: number): number;

  // IGESDimen_NewGeneralNote.InterlineSpace (method)
  InterlineSpace(Index: number): number;

  // IGESDimen_NewGeneralNote.FontStyle (method)
  FontStyle(Index: number): number;

  // IGESDimen_NewGeneralNote.CharacterAngle (method)
  CharacterAngle(Index: number): number;

  // IGESDimen_NewGeneralNote.ControlCodeString (method)
  ControlCodeString(Index: number): TCollection_HAsciiString;

  // IGESDimen_NewGeneralNote.NbCharacters (method)
  NbCharacters(Index: number): number;

  // IGESDimen_NewGeneralNote.BoxWidth (method)
  BoxWidth(Index: number): number;

  // IGESDimen_NewGeneralNote.BoxHeight (method)
  BoxHeight(Index: number): number;

  // IGESDimen_NewGeneralNote.IsCharSetEntity (method)
  IsCharSetEntity(Index: number): boolean;

  // IGESDimen_NewGeneralNote.CharSetCode (method)
  CharSetCode(Index: number): number;

  // IGESDimen_NewGeneralNote.CharSetEntity (method)
  CharSetEntity(Index: number): IGESData_IGESEntity;

  // IGESDimen_NewGeneralNote.SlantAngle (method)
  SlantAngle(Index: number): number;

  // IGESDimen_NewGeneralNote.RotationAngle (method)
  RotationAngle(Index: number): number;

  // IGESDimen_NewGeneralNote.MirrorFlag (method)
  MirrorFlag(Index: number): number;

  // IGESDimen_NewGeneralNote.IsMirrored (method)
  IsMirrored(Index: number): boolean;

  // IGESDimen_NewGeneralNote.RotateFlag (method)
  RotateFlag(Index: number): number;

  // IGESDimen_NewGeneralNote.StartPoint (method)
  StartPoint(Index: number): gp_Pnt;

  // IGESDimen_NewGeneralNote.TransformedStartPoint (method)
  TransformedStartPoint(Index: number): gp_Pnt;

  // IGESDimen_NewGeneralNote.ZDepthStartPoint (method)
  ZDepthStartPoint(Index: number): number;

  // IGESDimen_NewGeneralNote.Text (method)
  Text(Index: number): TCollection_HAsciiString;

  // IGESDimen_NewGeneralNote.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_NewGeneralNote.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_NewGeneralNote.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_NewGeneralNote.delete (method)
  delete(): void;

  // IGESDimen_NewGeneralNote.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_OrdinateDimension: declare class IGESDimen_OrdinateDimension extends IGESData_IGESEntity

  // IGESDimen_OrdinateDimension.constructor (constructor)
  constructor();

  // IGESDimen_OrdinateDimension.Init (method)
  Init(aNote: IGESDimen_GeneralNote, aType: boolean, aLine: IGESDimen_WitnessLine, anArrow: IGESDimen_LeaderArrow): void;

  // IGESDimen_OrdinateDimension.IsLine (method)
  IsLine(): boolean;

  // IGESDimen_OrdinateDimension.IsLeader (method)
  IsLeader(): boolean;

  // IGESDimen_OrdinateDimension.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_OrdinateDimension.WitnessLine (method)
  WitnessLine(): IGESDimen_WitnessLine;

  // IGESDimen_OrdinateDimension.Leader (method)
  Leader(): IGESDimen_LeaderArrow;

  // IGESDimen_OrdinateDimension.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_OrdinateDimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_OrdinateDimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_OrdinateDimension.delete (method)
  delete(): void;

  // IGESDimen_OrdinateDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_PointDimension: declare class IGESDimen_PointDimension extends IGESData_IGESEntity

  // IGESDimen_PointDimension.constructor (constructor)
  constructor();

  // IGESDimen_PointDimension.Init (method)
  Init(aNote: IGESDimen_GeneralNote, anArrow: IGESDimen_LeaderArrow, aGeom: IGESData_IGESEntity): void;

  // IGESDimen_PointDimension.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_PointDimension.LeaderArrow (method)
  LeaderArrow(): IGESDimen_LeaderArrow;

  // IGESDimen_PointDimension.GeomCase (method)
  GeomCase(): number;

  // IGESDimen_PointDimension.Geom (method)
  Geom(): IGESData_IGESEntity;

  // IGESDimen_PointDimension.CircularArc (method)
  CircularArc(): IGESGeom_CircularArc;

  // IGESDimen_PointDimension.CompositeCurve (method)
  CompositeCurve(): IGESGeom_CompositeCurve;

  // IGESDimen_PointDimension.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_PointDimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_PointDimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_PointDimension.delete (method)
  delete(): void;

  // IGESDimen_PointDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_Protocol: declare class IGESDimen_Protocol extends IGESData_Protocol

  // IGESDimen_Protocol.constructor (constructor)
  constructor();

  // IGESDimen_Protocol.NbResources (method)
  NbResources(): number;

  // IGESDimen_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESDimen_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESDimen_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_Protocol.delete (method)
  delete(): void;

  // IGESDimen_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_RadiusDimension: declare class IGESDimen_RadiusDimension extends IGESData_IGESEntity

  // IGESDimen_RadiusDimension.constructor (constructor)
  constructor();

  // IGESDimen_RadiusDimension.Init (method)
  Init(aNote: IGESDimen_GeneralNote, anArrow: IGESDimen_LeaderArrow, arcCenter: gp_XY, anotherArrow: IGESDimen_LeaderArrow): void;

  // IGESDimen_RadiusDimension.InitForm (method)
  InitForm(form: number): void;

  // IGESDimen_RadiusDimension.Note (method)
  Note(): IGESDimen_GeneralNote;

  // IGESDimen_RadiusDimension.Leader (method)
  Leader(): IGESDimen_LeaderArrow;

  // IGESDimen_RadiusDimension.Center (method)
  Center(): gp_Pnt2d;

  // IGESDimen_RadiusDimension.TransformedCenter (method)
  TransformedCenter(): gp_Pnt;

  // IGESDimen_RadiusDimension.HasLeader2 (method)
  HasLeader2(): boolean;

  // IGESDimen_RadiusDimension.Leader2 (method)
  Leader2(): IGESDimen_LeaderArrow;

  // IGESDimen_RadiusDimension.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_RadiusDimension.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_RadiusDimension.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_RadiusDimension.delete (method)
  delete(): void;

  // IGESDimen_RadiusDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_ReadWriteModule: declare class IGESDimen_ReadWriteModule extends IGESData_ReadWriteModule

  // IGESDimen_ReadWriteModule.constructor (constructor)
  constructor();

  // IGESDimen_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESDimen_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESDimen_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_ReadWriteModule.delete (method)
  delete(): void;

  // IGESDimen_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_Section: declare class IGESDimen_Section extends IGESData_IGESEntity

  // IGESDimen_Section.constructor (constructor)
  constructor();

  // IGESDimen_Section.Init (method)
  Init(dataType: number, aDisp: number, dataPoints: NCollection_HArray1_gp_XY): void;

  // IGESDimen_Section.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESDimen_Section.Datatype (method)
  Datatype(): number;

  // IGESDimen_Section.NbPoints (method)
  NbPoints(): number;

  // IGESDimen_Section.ZDisplacement (method)
  ZDisplacement(): number;

  // IGESDimen_Section.Point (method)
  Point(Index: number): gp_Pnt;

  // IGESDimen_Section.TransformedPoint (method)
  TransformedPoint(Index: number): gp_Pnt;

  // IGESDimen_Section.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_Section.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_Section.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_Section.delete (method)
  delete(): void;

  // IGESDimen_Section.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_SectionedArea: declare class IGESDimen_SectionedArea extends IGESData_IGESEntity

  // IGESDimen_SectionedArea.constructor (constructor)
  constructor();

  // IGESDimen_SectionedArea.Init (method)
  Init(aCurve: IGESData_IGESEntity, aPattern: number, aPoint: gp_XYZ, aDistance: number, anAngle: number, someIslands: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  // IGESDimen_SectionedArea.SetInverted (method)
  SetInverted(mode: boolean): void;

  // IGESDimen_SectionedArea.IsInverted (method)
  IsInverted(): boolean;

  // IGESDimen_SectionedArea.ExteriorCurve (method)
  ExteriorCurve(): IGESData_IGESEntity;

  // IGESDimen_SectionedArea.Pattern (method)
  Pattern(): number;

  // IGESDimen_SectionedArea.PassingPoint (method)
  PassingPoint(): gp_Pnt;

  // IGESDimen_SectionedArea.TransformedPassingPoint (method)
  TransformedPassingPoint(): gp_Pnt;

  // IGESDimen_SectionedArea.ZDepth (method)
  ZDepth(): number;

  // IGESDimen_SectionedArea.Distance (method)
  Distance(): number;

  // IGESDimen_SectionedArea.Angle (method)
  Angle(): number;

  // IGESDimen_SectionedArea.NbIslands (method)
  NbIslands(): number;

  // IGESDimen_SectionedArea.IslandCurve (method)
  IslandCurve(Index: number): IGESData_IGESEntity;

  // IGESDimen_SectionedArea.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_SectionedArea.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_SectionedArea.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_SectionedArea.delete (method)
  delete(): void;

  // IGESDimen_SectionedArea.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_SpecificModule: declare class IGESDimen_SpecificModule extends IGESData_SpecificModule

  // IGESDimen_SpecificModule.constructor (constructor)
  constructor();

  // IGESDimen_SpecificModule.OwnCorrect (method)
  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  // IGESDimen_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESDimen_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESDimen_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESDimen_SpecificModule.delete (method)
  delete(): void;

  // IGESDimen_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_ToolAngularDimension: declare class IGESDimen_ToolAngularDimension

  // IGESDimen_ToolAngularDimension.constructor (constructor)
  constructor();

  // IGESDimen_ToolAngularDimension.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDimen_AngularDimension, IW: IGESData_IGESWriter): void;

  // IGESDimen_ToolAngularDimension.DirChecker (method)
  DirChecker(ent: IGESDimen_AngularDimension): IGESData_DirChecker;

  // IGESDimen_ToolAngularDimension.OwnCheck (method)
  OwnCheck(ent: IGESDimen_AngularDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDimen_ToolAngularDimension.OwnCopy (method)
  OwnCopy(entfrom: IGESDimen_AngularDimension, entto: IGESDimen_AngularDimension, TC: Interface_CopyTool): void;

  // IGESDimen_ToolAngularDimension.delete (method)
  delete(): void;

  // IGESDimen_ToolAngularDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESDimen_ToolBasicDimension: declare class IGESDimen_ToolBasicDimension

  // IGESDimen_ToolBasicDimension.constructor (constructor)
  constructor();

  // IGESDimen_ToolBasicDimension.WriteOwnParams (method)
  WriteOwnParams(ent: IGESDimen_BasicDimension, IW: IGESData_IGESWriter): void;

  // IGESDimen_ToolBasicDimension.OwnCorrect (method)
  OwnCorrect(ent: IGESDimen_BasicDimension): boolean;

  // IGESDimen_ToolBasicDimension.DirChecker (method)
  DirChecker(ent: IGESDimen_BasicDimension): IGESData_DirChecker;

  // IGESDimen_ToolBasicDimension.OwnCheck (method)
  OwnCheck(ent: IGESDimen_BasicDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESDimen_ToolBasicDimension.OwnCopy (method)
  OwnCopy(entfrom: IGESDimen_BasicDimension, entto: IGESDimen_BasicDimension, TC: Interface_CopyTool): void;

  // IGESDimen_ToolBasicDimension.delete (method)
  delete(): void;

  // IGESDimen_ToolBasicDimension.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
