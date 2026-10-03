# libcascade — IGESGraph

39 top-level symbols. Signatures are verbatim typescript.

IGESGraph: declare class IGESGraph

  // IGESGraph.constructor (constructor)
  constructor();

  // IGESGraph.Init (method)
  static Init(): void;

  // IGESGraph.Protocol (method)
  static Protocol(): IGESGraph_Protocol;

  // IGESGraph.delete (method)
  delete(): void;

  // IGESGraph.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_Color: declare class IGESGraph_Color extends IGESData_ColorEntity

  // IGESGraph_Color.constructor (constructor)
  constructor();

  // IGESGraph_Color.Init (method)
  Init(red: number, green: number, blue: number, aColorName: TCollection_HAsciiString): void;

  // IGESGraph_Color.RGBIntensity (method)
  RGBIntensity(Red?: number, Green?: number, Blue?: number): { Red: number; Green: number; Blue: number };

  // IGESGraph_Color.CMYIntensity (method)
  CMYIntensity(Cyan?: number, Magenta?: number, Yellow?: number): { Cyan: number; Magenta: number; Yellow: number };

  // IGESGraph_Color.HLSPercentage (method)
  HLSPercentage(Hue?: number, Lightness?: number, Saturation?: number): { Hue: number; Lightness: number; Saturation: number };

  // IGESGraph_Color.HasColorName (method)
  HasColorName(): boolean;

  // IGESGraph_Color.ColorName (method)
  ColorName(): TCollection_HAsciiString;

  // IGESGraph_Color.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_Color.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_Color.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_Color.delete (method)
  delete(): void;

  // IGESGraph_Color.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_DefinitionLevel: declare class IGESGraph_DefinitionLevel extends IGESData_LevelListEntity

  // IGESGraph_DefinitionLevel.constructor (constructor)
  constructor();

  // IGESGraph_DefinitionLevel.Init (method)
  Init(allLevelNumbers: NCollection_HArray1_int): void;

  // IGESGraph_DefinitionLevel.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_DefinitionLevel.NbLevelNumbers (method)
  NbLevelNumbers(): number;

  // IGESGraph_DefinitionLevel.LevelNumber (method)
  LevelNumber(num: number): number;

  // IGESGraph_DefinitionLevel.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_DefinitionLevel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_DefinitionLevel.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_DefinitionLevel.delete (method)
  delete(): void;

  // IGESGraph_DefinitionLevel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_DrawingSize: declare class IGESGraph_DrawingSize extends IGESData_IGESEntity

  // IGESGraph_DrawingSize.constructor (constructor)
  constructor();

  // IGESGraph_DrawingSize.Init (method)
  Init(nbProps: number, aXSize: number, aYSize: number): void;

  // IGESGraph_DrawingSize.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_DrawingSize.XSize (method)
  XSize(): number;

  // IGESGraph_DrawingSize.YSize (method)
  YSize(): number;

  // IGESGraph_DrawingSize.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_DrawingSize.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_DrawingSize.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_DrawingSize.delete (method)
  delete(): void;

  // IGESGraph_DrawingSize.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_DrawingUnits: declare class IGESGraph_DrawingUnits extends IGESData_IGESEntity

  // IGESGraph_DrawingUnits.constructor (constructor)
  constructor();

  // IGESGraph_DrawingUnits.Init (method)
  Init(nbProps: number, aFlag: number, aUnit: TCollection_HAsciiString): void;

  // IGESGraph_DrawingUnits.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_DrawingUnits.Flag (method)
  Flag(): number;

  // IGESGraph_DrawingUnits.Unit (method)
  Unit(): TCollection_HAsciiString;

  // IGESGraph_DrawingUnits.UnitValue (method)
  UnitValue(): number;

  // IGESGraph_DrawingUnits.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_DrawingUnits.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_DrawingUnits.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_DrawingUnits.delete (method)
  delete(): void;

  // IGESGraph_DrawingUnits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_GeneralModule: declare class IGESGraph_GeneralModule extends IGESData_GeneralModule

  // IGESGraph_GeneralModule.constructor (constructor)
  constructor();

  // IGESGraph_GeneralModule.DirChecker (method)
  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  // IGESGraph_GeneralModule.OwnCheckCase (method)
  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_GeneralModule.NewVoid (method)
  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  // IGESGraph_GeneralModule.OwnCopyCase (method)
  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  // IGESGraph_GeneralModule.CategoryNumber (method)
  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  // IGESGraph_GeneralModule.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_GeneralModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_GeneralModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_GeneralModule.delete (method)
  delete(): void;

  // IGESGraph_GeneralModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_HighLight: declare class IGESGraph_HighLight extends IGESData_IGESEntity

  // IGESGraph_HighLight.constructor (constructor)
  constructor();

  // IGESGraph_HighLight.Init (method)
  Init(nbProps: number, aHighLightStatus: number): void;

  // IGESGraph_HighLight.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_HighLight.HighLightStatus (method)
  HighLightStatus(): number;

  // IGESGraph_HighLight.IsHighLighted (method)
  IsHighLighted(): boolean;

  // IGESGraph_HighLight.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_HighLight.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_HighLight.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_HighLight.delete (method)
  delete(): void;

  // IGESGraph_HighLight.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_IntercharacterSpacing: declare class IGESGraph_IntercharacterSpacing extends IGESData_IGESEntity

  // IGESGraph_IntercharacterSpacing.constructor (constructor)
  constructor();

  // IGESGraph_IntercharacterSpacing.Init (method)
  Init(nbProps: number, anISpace: number): void;

  // IGESGraph_IntercharacterSpacing.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_IntercharacterSpacing.ISpace (method)
  ISpace(): number;

  // IGESGraph_IntercharacterSpacing.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_IntercharacterSpacing.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_IntercharacterSpacing.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_IntercharacterSpacing.delete (method)
  delete(): void;

  // IGESGraph_IntercharacterSpacing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_LineFontDefPattern: declare class IGESGraph_LineFontDefPattern extends IGESData_LineFontEntity

  // IGESGraph_LineFontDefPattern.constructor (constructor)
  constructor();

  // IGESGraph_LineFontDefPattern.Init (method)
  Init(allSegLength: NCollection_HArray1_double, aPattern: TCollection_HAsciiString): void;

  // IGESGraph_LineFontDefPattern.NbSegments (method)
  NbSegments(): number;

  // IGESGraph_LineFontDefPattern.Length (method)
  Length(Index: number): number;

  // IGESGraph_LineFontDefPattern.DisplayPattern (method)
  DisplayPattern(): TCollection_HAsciiString;

  // IGESGraph_LineFontDefPattern.IsVisible (method)
  IsVisible(Index: number): boolean;

  // IGESGraph_LineFontDefPattern.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_LineFontDefPattern.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_LineFontDefPattern.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_LineFontDefPattern.delete (method)
  delete(): void;

  // IGESGraph_LineFontDefPattern.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_LineFontDefTemplate: declare class IGESGraph_LineFontDefTemplate extends IGESData_LineFontEntity

  // IGESGraph_LineFontDefTemplate.constructor (constructor)
  constructor();

  // IGESGraph_LineFontDefTemplate.Init (method)
  Init(anOrientation: number, aTemplate: IGESBasic_SubfigureDef, aDistance: number, aScale: number): void;

  // IGESGraph_LineFontDefTemplate.Orientation (method)
  Orientation(): number;

  // IGESGraph_LineFontDefTemplate.TemplateEntity (method)
  TemplateEntity(): IGESBasic_SubfigureDef;

  // IGESGraph_LineFontDefTemplate.Distance (method)
  Distance(): number;

  // IGESGraph_LineFontDefTemplate.Scale (method)
  Scale(): number;

  // IGESGraph_LineFontDefTemplate.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_LineFontDefTemplate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_LineFontDefTemplate.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_LineFontDefTemplate.delete (method)
  delete(): void;

  // IGESGraph_LineFontDefTemplate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_LineFontPredefined: declare class IGESGraph_LineFontPredefined extends IGESData_IGESEntity

  // IGESGraph_LineFontPredefined.constructor (constructor)
  constructor();

  // IGESGraph_LineFontPredefined.Init (method)
  Init(nbProps: number, aLineFontPatternCode: number): void;

  // IGESGraph_LineFontPredefined.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_LineFontPredefined.LineFontPatternCode (method)
  LineFontPatternCode(): number;

  // IGESGraph_LineFontPredefined.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_LineFontPredefined.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_LineFontPredefined.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_LineFontPredefined.delete (method)
  delete(): void;

  // IGESGraph_LineFontPredefined.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_NominalSize: declare class IGESGraph_NominalSize extends IGESData_IGESEntity

  // IGESGraph_NominalSize.constructor (constructor)
  constructor();

  // IGESGraph_NominalSize.Init (method)
  Init(nbProps: number, aNominalSizeValue: number, aNominalSizeName: TCollection_HAsciiString, aStandardName: TCollection_HAsciiString): void;

  // IGESGraph_NominalSize.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_NominalSize.NominalSizeValue (method)
  NominalSizeValue(): number;

  // IGESGraph_NominalSize.NominalSizeName (method)
  NominalSizeName(): TCollection_HAsciiString;

  // IGESGraph_NominalSize.HasStandardName (method)
  HasStandardName(): boolean;

  // IGESGraph_NominalSize.StandardName (method)
  StandardName(): TCollection_HAsciiString;

  // IGESGraph_NominalSize.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_NominalSize.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_NominalSize.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_NominalSize.delete (method)
  delete(): void;

  // IGESGraph_NominalSize.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_Pick: declare class IGESGraph_Pick extends IGESData_IGESEntity

  // IGESGraph_Pick.constructor (constructor)
  constructor();

  // IGESGraph_Pick.Init (method)
  Init(nbProps: number, aPickStatus: number): void;

  // IGESGraph_Pick.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_Pick.PickFlag (method)
  PickFlag(): number;

  // IGESGraph_Pick.IsPickable (method)
  IsPickable(): boolean;

  // IGESGraph_Pick.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_Pick.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_Pick.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_Pick.delete (method)
  delete(): void;

  // IGESGraph_Pick.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_Protocol: declare class IGESGraph_Protocol extends IGESData_Protocol

  // IGESGraph_Protocol.constructor (constructor)
  constructor();

  // IGESGraph_Protocol.NbResources (method)
  NbResources(): number;

  // IGESGraph_Protocol.Resource (method)
  Resource(num: number): Interface_Protocol;

  // IGESGraph_Protocol.TypeNumber (method)
  TypeNumber(atype: Standard_Type): number;

  // IGESGraph_Protocol.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_Protocol.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_Protocol.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_Protocol.delete (method)
  delete(): void;

  // IGESGraph_Protocol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ReadWriteModule: declare class IGESGraph_ReadWriteModule extends IGESData_ReadWriteModule

  // IGESGraph_ReadWriteModule.constructor (constructor)
  constructor();

  // IGESGraph_ReadWriteModule.CaseIGES (method)
  CaseIGES(typenum: number, formnum: number): number;

  // IGESGraph_ReadWriteModule.WriteOwnParams (method)
  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  // IGESGraph_ReadWriteModule.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_ReadWriteModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_ReadWriteModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_ReadWriteModule.delete (method)
  delete(): void;

  // IGESGraph_ReadWriteModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_SpecificModule: declare class IGESGraph_SpecificModule extends IGESData_SpecificModule

  // IGESGraph_SpecificModule.constructor (constructor)
  constructor();

  // IGESGraph_SpecificModule.OwnCorrect (method)
  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  // IGESGraph_SpecificModule.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_SpecificModule.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_SpecificModule.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_SpecificModule.delete (method)
  delete(): void;

  // IGESGraph_SpecificModule.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_TextDisplayTemplate: declare class IGESGraph_TextDisplayTemplate extends IGESData_IGESEntity

  // IGESGraph_TextDisplayTemplate.constructor (constructor)
  constructor();

  // IGESGraph_TextDisplayTemplate.Init (method)
  Init(aWidth: number, aHeight: number, aFontCode: number, aFontEntity: IGESGraph_TextFontDef, aSlantAngle: number, aRotationAngle: number, aMirrorFlag: number, aRotationFlag: number, aCorner: gp_XYZ): void;

  // IGESGraph_TextDisplayTemplate.SetIncremental (method)
  SetIncremental(mode: boolean): void;

  // IGESGraph_TextDisplayTemplate.IsIncremental (method)
  IsIncremental(): boolean;

  // IGESGraph_TextDisplayTemplate.BoxWidth (method)
  BoxWidth(): number;

  // IGESGraph_TextDisplayTemplate.BoxHeight (method)
  BoxHeight(): number;

  // IGESGraph_TextDisplayTemplate.IsFontEntity (method)
  IsFontEntity(): boolean;

  // IGESGraph_TextDisplayTemplate.FontCode (method)
  FontCode(): number;

  // IGESGraph_TextDisplayTemplate.FontEntity (method)
  FontEntity(): IGESGraph_TextFontDef;

  // IGESGraph_TextDisplayTemplate.SlantAngle (method)
  SlantAngle(): number;

  // IGESGraph_TextDisplayTemplate.RotationAngle (method)
  RotationAngle(): number;

  // IGESGraph_TextDisplayTemplate.MirrorFlag (method)
  MirrorFlag(): number;

  // IGESGraph_TextDisplayTemplate.RotateFlag (method)
  RotateFlag(): number;

  // IGESGraph_TextDisplayTemplate.StartingCorner (method)
  StartingCorner(): gp_Pnt;

  // IGESGraph_TextDisplayTemplate.TransformedStartingCorner (method)
  TransformedStartingCorner(): gp_Pnt;

  // IGESGraph_TextDisplayTemplate.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_TextDisplayTemplate.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_TextDisplayTemplate.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_TextDisplayTemplate.delete (method)
  delete(): void;

  // IGESGraph_TextDisplayTemplate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_TextFontDef: declare class IGESGraph_TextFontDef extends IGESData_IGESEntity

  // IGESGraph_TextFontDef.constructor (constructor)
  constructor();

  // IGESGraph_TextFontDef.Init (method)
  Init(aFontCode: number, aFontName: TCollection_HAsciiString, aSupersededFont: number, aSupersededEntity: IGESGraph_TextFontDef, aScale: number, allASCIICodes: NCollection_HArray1_int, allNextCharX: NCollection_HArray1_int, allNextCharY: NCollection_HArray1_int, allPenMotions: NCollection_HArray1_int, allPenFlags: IGESBasic_HArray1OfHArray1OfInteger, allMovePenToX: IGESBasic_HArray1OfHArray1OfInteger, allMovePenToY: IGESBasic_HArray1OfHArray1OfInteger): void;

  // IGESGraph_TextFontDef.FontCode (method)
  FontCode(): number;

  // IGESGraph_TextFontDef.FontName (method)
  FontName(): TCollection_HAsciiString;

  // IGESGraph_TextFontDef.IsSupersededFontEntity (method)
  IsSupersededFontEntity(): boolean;

  // IGESGraph_TextFontDef.SupersededFontCode (method)
  SupersededFontCode(): number;

  // IGESGraph_TextFontDef.SupersededFontEntity (method)
  SupersededFontEntity(): IGESGraph_TextFontDef;

  // IGESGraph_TextFontDef.Scale (method)
  Scale(): number;

  // IGESGraph_TextFontDef.NbCharacters (method)
  NbCharacters(): number;

  // IGESGraph_TextFontDef.ASCIICode (method)
  ASCIICode(Chnum: number): number;

  // IGESGraph_TextFontDef.NextCharOrigin (method)
  NextCharOrigin(Chnum: number, NX?: number, NY?: number): { NX: number; NY: number };

  // IGESGraph_TextFontDef.NbPenMotions (method)
  NbPenMotions(Chnum: number): number;

  // IGESGraph_TextFontDef.IsPenUp (method)
  IsPenUp(Chnum: number, Motionnum: number): boolean;

  // IGESGraph_TextFontDef.NextPenPosition (method)
  NextPenPosition(Chnum: number, Motionnum: number, IX?: number, IY?: number): { IX: number; IY: number };

  // IGESGraph_TextFontDef.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_TextFontDef.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_TextFontDef.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_TextFontDef.delete (method)
  delete(): void;

  // IGESGraph_TextFontDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolColor: declare class IGESGraph_ToolColor

  // IGESGraph_ToolColor.constructor (constructor)
  constructor();

  // IGESGraph_ToolColor.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_Color, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolColor.DirChecker (method)
  DirChecker(ent: IGESGraph_Color): IGESData_DirChecker;

  // IGESGraph_ToolColor.OwnCheck (method)
  OwnCheck(ent: IGESGraph_Color, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolColor.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_Color, entto: IGESGraph_Color, TC: Interface_CopyTool): void;

  // IGESGraph_ToolColor.delete (method)
  delete(): void;

  // IGESGraph_ToolColor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolDefinitionLevel: declare class IGESGraph_ToolDefinitionLevel

  // IGESGraph_ToolDefinitionLevel.constructor (constructor)
  constructor();

  // IGESGraph_ToolDefinitionLevel.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_DefinitionLevel, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolDefinitionLevel.DirChecker (method)
  DirChecker(ent: IGESGraph_DefinitionLevel): IGESData_DirChecker;

  // IGESGraph_ToolDefinitionLevel.OwnCheck (method)
  OwnCheck(ent: IGESGraph_DefinitionLevel, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolDefinitionLevel.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_DefinitionLevel, entto: IGESGraph_DefinitionLevel, TC: Interface_CopyTool): void;

  // IGESGraph_ToolDefinitionLevel.delete (method)
  delete(): void;

  // IGESGraph_ToolDefinitionLevel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolDrawingSize: declare class IGESGraph_ToolDrawingSize

  // IGESGraph_ToolDrawingSize.constructor (constructor)
  constructor();

  // IGESGraph_ToolDrawingSize.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_DrawingSize, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolDrawingSize.OwnCorrect (method)
  OwnCorrect(ent: IGESGraph_DrawingSize): boolean;

  // IGESGraph_ToolDrawingSize.DirChecker (method)
  DirChecker(ent: IGESGraph_DrawingSize): IGESData_DirChecker;

  // IGESGraph_ToolDrawingSize.OwnCheck (method)
  OwnCheck(ent: IGESGraph_DrawingSize, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolDrawingSize.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_DrawingSize, entto: IGESGraph_DrawingSize, TC: Interface_CopyTool): void;

  // IGESGraph_ToolDrawingSize.delete (method)
  delete(): void;

  // IGESGraph_ToolDrawingSize.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolDrawingUnits: declare class IGESGraph_ToolDrawingUnits

  // IGESGraph_ToolDrawingUnits.constructor (constructor)
  constructor();

  // IGESGraph_ToolDrawingUnits.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_DrawingUnits, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolDrawingUnits.OwnCorrect (method)
  OwnCorrect(ent: IGESGraph_DrawingUnits): boolean;

  // IGESGraph_ToolDrawingUnits.DirChecker (method)
  DirChecker(ent: IGESGraph_DrawingUnits): IGESData_DirChecker;

  // IGESGraph_ToolDrawingUnits.OwnCheck (method)
  OwnCheck(ent: IGESGraph_DrawingUnits, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolDrawingUnits.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_DrawingUnits, entto: IGESGraph_DrawingUnits, TC: Interface_CopyTool): void;

  // IGESGraph_ToolDrawingUnits.delete (method)
  delete(): void;

  // IGESGraph_ToolDrawingUnits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolHighLight: declare class IGESGraph_ToolHighLight

  // IGESGraph_ToolHighLight.constructor (constructor)
  constructor();

  // IGESGraph_ToolHighLight.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_HighLight, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolHighLight.OwnCorrect (method)
  OwnCorrect(ent: IGESGraph_HighLight): boolean;

  // IGESGraph_ToolHighLight.DirChecker (method)
  DirChecker(ent: IGESGraph_HighLight): IGESData_DirChecker;

  // IGESGraph_ToolHighLight.OwnCheck (method)
  OwnCheck(ent: IGESGraph_HighLight, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolHighLight.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_HighLight, entto: IGESGraph_HighLight, TC: Interface_CopyTool): void;

  // IGESGraph_ToolHighLight.delete (method)
  delete(): void;

  // IGESGraph_ToolHighLight.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolIntercharacterSpacing: declare class IGESGraph_ToolIntercharacterSpacing

  // IGESGraph_ToolIntercharacterSpacing.constructor (constructor)
  constructor();

  // IGESGraph_ToolIntercharacterSpacing.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_IntercharacterSpacing, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolIntercharacterSpacing.OwnCorrect (method)
  OwnCorrect(ent: IGESGraph_IntercharacterSpacing): boolean;

  // IGESGraph_ToolIntercharacterSpacing.DirChecker (method)
  DirChecker(ent: IGESGraph_IntercharacterSpacing): IGESData_DirChecker;

  // IGESGraph_ToolIntercharacterSpacing.OwnCheck (method)
  OwnCheck(ent: IGESGraph_IntercharacterSpacing, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolIntercharacterSpacing.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_IntercharacterSpacing, entto: IGESGraph_IntercharacterSpacing, TC: Interface_CopyTool): void;

  // IGESGraph_ToolIntercharacterSpacing.delete (method)
  delete(): void;

  // IGESGraph_ToolIntercharacterSpacing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolLineFontDefPattern: declare class IGESGraph_ToolLineFontDefPattern

  // IGESGraph_ToolLineFontDefPattern.constructor (constructor)
  constructor();

  // IGESGraph_ToolLineFontDefPattern.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_LineFontDefPattern, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolLineFontDefPattern.DirChecker (method)
  DirChecker(ent: IGESGraph_LineFontDefPattern): IGESData_DirChecker;

  // IGESGraph_ToolLineFontDefPattern.OwnCheck (method)
  OwnCheck(ent: IGESGraph_LineFontDefPattern, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolLineFontDefPattern.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_LineFontDefPattern, entto: IGESGraph_LineFontDefPattern, TC: Interface_CopyTool): void;

  // IGESGraph_ToolLineFontDefPattern.delete (method)
  delete(): void;

  // IGESGraph_ToolLineFontDefPattern.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolLineFontDefTemplate: declare class IGESGraph_ToolLineFontDefTemplate

  // IGESGraph_ToolLineFontDefTemplate.constructor (constructor)
  constructor();

  // IGESGraph_ToolLineFontDefTemplate.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_LineFontDefTemplate, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolLineFontDefTemplate.DirChecker (method)
  DirChecker(ent: IGESGraph_LineFontDefTemplate): IGESData_DirChecker;

  // IGESGraph_ToolLineFontDefTemplate.OwnCheck (method)
  OwnCheck(ent: IGESGraph_LineFontDefTemplate, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolLineFontDefTemplate.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_LineFontDefTemplate, entto: IGESGraph_LineFontDefTemplate, TC: Interface_CopyTool): void;

  // IGESGraph_ToolLineFontDefTemplate.delete (method)
  delete(): void;

  // IGESGraph_ToolLineFontDefTemplate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolLineFontPredefined: declare class IGESGraph_ToolLineFontPredefined

  // IGESGraph_ToolLineFontPredefined.constructor (constructor)
  constructor();

  // IGESGraph_ToolLineFontPredefined.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_LineFontPredefined, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolLineFontPredefined.OwnCorrect (method)
  OwnCorrect(ent: IGESGraph_LineFontPredefined): boolean;

  // IGESGraph_ToolLineFontPredefined.DirChecker (method)
  DirChecker(ent: IGESGraph_LineFontPredefined): IGESData_DirChecker;

  // IGESGraph_ToolLineFontPredefined.OwnCheck (method)
  OwnCheck(ent: IGESGraph_LineFontPredefined, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolLineFontPredefined.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_LineFontPredefined, entto: IGESGraph_LineFontPredefined, TC: Interface_CopyTool): void;

  // IGESGraph_ToolLineFontPredefined.delete (method)
  delete(): void;

  // IGESGraph_ToolLineFontPredefined.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolNominalSize: declare class IGESGraph_ToolNominalSize

  // IGESGraph_ToolNominalSize.constructor (constructor)
  constructor();

  // IGESGraph_ToolNominalSize.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_NominalSize, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolNominalSize.OwnCorrect (method)
  OwnCorrect(ent: IGESGraph_NominalSize): boolean;

  // IGESGraph_ToolNominalSize.DirChecker (method)
  DirChecker(ent: IGESGraph_NominalSize): IGESData_DirChecker;

  // IGESGraph_ToolNominalSize.OwnCheck (method)
  OwnCheck(ent: IGESGraph_NominalSize, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolNominalSize.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_NominalSize, entto: IGESGraph_NominalSize, TC: Interface_CopyTool): void;

  // IGESGraph_ToolNominalSize.delete (method)
  delete(): void;

  // IGESGraph_ToolNominalSize.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolPick: declare class IGESGraph_ToolPick

  // IGESGraph_ToolPick.constructor (constructor)
  constructor();

  // IGESGraph_ToolPick.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_Pick, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolPick.OwnCorrect (method)
  OwnCorrect(ent: IGESGraph_Pick): boolean;

  // IGESGraph_ToolPick.DirChecker (method)
  DirChecker(ent: IGESGraph_Pick): IGESData_DirChecker;

  // IGESGraph_ToolPick.OwnCheck (method)
  OwnCheck(ent: IGESGraph_Pick, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolPick.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_Pick, entto: IGESGraph_Pick, TC: Interface_CopyTool): void;

  // IGESGraph_ToolPick.delete (method)
  delete(): void;

  // IGESGraph_ToolPick.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolTextDisplayTemplate: declare class IGESGraph_ToolTextDisplayTemplate

  // IGESGraph_ToolTextDisplayTemplate.constructor (constructor)
  constructor();

  // IGESGraph_ToolTextDisplayTemplate.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_TextDisplayTemplate, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolTextDisplayTemplate.DirChecker (method)
  DirChecker(ent: IGESGraph_TextDisplayTemplate): IGESData_DirChecker;

  // IGESGraph_ToolTextDisplayTemplate.OwnCheck (method)
  OwnCheck(ent: IGESGraph_TextDisplayTemplate, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolTextDisplayTemplate.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_TextDisplayTemplate, entto: IGESGraph_TextDisplayTemplate, TC: Interface_CopyTool): void;

  // IGESGraph_ToolTextDisplayTemplate.delete (method)
  delete(): void;

  // IGESGraph_ToolTextDisplayTemplate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolTextFontDef: declare class IGESGraph_ToolTextFontDef

  // IGESGraph_ToolTextFontDef.constructor (constructor)
  constructor();

  // IGESGraph_ToolTextFontDef.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_TextFontDef, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolTextFontDef.DirChecker (method)
  DirChecker(ent: IGESGraph_TextFontDef): IGESData_DirChecker;

  // IGESGraph_ToolTextFontDef.OwnCheck (method)
  OwnCheck(ent: IGESGraph_TextFontDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolTextFontDef.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_TextFontDef, entto: IGESGraph_TextFontDef, TC: Interface_CopyTool): void;

  // IGESGraph_ToolTextFontDef.delete (method)
  delete(): void;

  // IGESGraph_ToolTextFontDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_ToolUniformRectGrid: declare class IGESGraph_ToolUniformRectGrid

  // IGESGraph_ToolUniformRectGrid.constructor (constructor)
  constructor();

  // IGESGraph_ToolUniformRectGrid.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGraph_UniformRectGrid, IW: IGESData_IGESWriter): void;

  // IGESGraph_ToolUniformRectGrid.OwnCorrect (method)
  OwnCorrect(ent: IGESGraph_UniformRectGrid): boolean;

  // IGESGraph_ToolUniformRectGrid.DirChecker (method)
  DirChecker(ent: IGESGraph_UniformRectGrid): IGESData_DirChecker;

  // IGESGraph_ToolUniformRectGrid.OwnCheck (method)
  OwnCheck(ent: IGESGraph_UniformRectGrid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGraph_ToolUniformRectGrid.OwnCopy (method)
  OwnCopy(entfrom: IGESGraph_UniformRectGrid, entto: IGESGraph_UniformRectGrid, TC: Interface_CopyTool): void;

  // IGESGraph_ToolUniformRectGrid.delete (method)
  delete(): void;

  // IGESGraph_ToolUniformRectGrid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_UniformRectGrid: declare class IGESGraph_UniformRectGrid extends IGESData_IGESEntity

  // IGESGraph_UniformRectGrid.constructor (constructor)
  constructor();

  // IGESGraph_UniformRectGrid.Init (method)
  Init(nbProps: number, finite: number, line: number, weighted: number, aGridPoint: gp_XY, aGridSpacing: gp_XY, pointsX: number, pointsY: number): void;

  // IGESGraph_UniformRectGrid.NbPropertyValues (method)
  NbPropertyValues(): number;

  // IGESGraph_UniformRectGrid.IsFinite (method)
  IsFinite(): boolean;

  // IGESGraph_UniformRectGrid.IsLine (method)
  IsLine(): boolean;

  // IGESGraph_UniformRectGrid.IsWeighted (method)
  IsWeighted(): boolean;

  // IGESGraph_UniformRectGrid.GridPoint (method)
  GridPoint(): gp_Pnt2d;

  // IGESGraph_UniformRectGrid.GridSpacing (method)
  GridSpacing(): gp_Vec2d;

  // IGESGraph_UniformRectGrid.NbPointsX (method)
  NbPointsX(): number;

  // IGESGraph_UniformRectGrid.NbPointsY (method)
  NbPointsY(): number;

  // IGESGraph_UniformRectGrid.get_type_name (method)
  static get_type_name(): string;

  // IGESGraph_UniformRectGrid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGraph_UniformRectGrid.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGraph_UniformRectGrid.delete (method)
  delete(): void;

  // IGESGraph_UniformRectGrid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGraph_Array1OfColor: NCollection_Array1_handle_IGESGraph_Color

IGESGraph_Array1OfTextDisplayTemplate: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate

IGESGraph_Array1OfTextFontDef: NCollection_Array1_handle_IGESGraph_TextFontDef

IGESGraph_HArray1OfColor: NCollection_HArray1_handle_IGESGraph_Color

IGESGraph_HArray1OfTextDisplayTemplate: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate

IGESGraph_HArray1OfTextFontDef: NCollection_HArray1_handle_IGESGraph_TextFontDef
