# libcascade — IGESGraph

39 top-level symbols. Signatures are verbatim typescript.

IGESGraph: declare class IGESGraph

  constructor

  static Init(): void;

  static Protocol(): IGESGraph_Protocol;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_Color: declare class IGESGraph_Color extends IGESData_ColorEntity

  constructor

  Init(red: number, green: number, blue: number, aColorName: TCollection_HAsciiString): void;

  RGBIntensity(Red?: number, Green?: number, Blue?: number): { Red: number; Green: number; Blue: number };

  CMYIntensity(Cyan?: number, Magenta?: number, Yellow?: number): { Cyan: number; Magenta: number; Yellow: number };

  HLSPercentage(Hue?: number, Lightness?: number, Saturation?: number): { Hue: number; Lightness: number; Saturation: number };

  HasColorName(): boolean;

  ColorName(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_DefinitionLevel: declare class IGESGraph_DefinitionLevel extends IGESData_LevelListEntity

  constructor

  Init(allLevelNumbers: NCollection_HArray1_int): void;

  NbPropertyValues(): number;

  NbLevelNumbers(): number;

  LevelNumber(num: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_DrawingSize: declare class IGESGraph_DrawingSize extends IGESData_IGESEntity

  constructor

  Init(nbProps: number, aXSize: number, aYSize: number): void;

  NbPropertyValues(): number;

  XSize(): number;

  YSize(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_DrawingUnits: declare class IGESGraph_DrawingUnits extends IGESData_IGESEntity

  constructor

  Init(nbProps: number, aFlag: number, aUnit: TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  Flag(): number;

  Unit(): TCollection_HAsciiString;

  UnitValue(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_GeneralModule: declare class IGESGraph_GeneralModule extends IGESData_GeneralModule

  constructor

  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_HighLight: declare class IGESGraph_HighLight extends IGESData_IGESEntity

  constructor

  Init(nbProps: number, aHighLightStatus: number): void;

  NbPropertyValues(): number;

  HighLightStatus(): number;

  IsHighLighted(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_IntercharacterSpacing: declare class IGESGraph_IntercharacterSpacing extends IGESData_IGESEntity

  constructor

  Init(nbProps: number, anISpace: number): void;

  NbPropertyValues(): number;

  ISpace(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_LineFontDefPattern: declare class IGESGraph_LineFontDefPattern extends IGESData_LineFontEntity

  constructor

  Init(allSegLength: NCollection_HArray1_double, aPattern: TCollection_HAsciiString): void;

  NbSegments(): number;

  Length(Index: number): number;

  DisplayPattern(): TCollection_HAsciiString;

  IsVisible(Index: number): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_LineFontDefTemplate: declare class IGESGraph_LineFontDefTemplate extends IGESData_LineFontEntity

  constructor

  Init(anOrientation: number, aTemplate: IGESBasic_SubfigureDef, aDistance: number, aScale: number): void;

  Orientation(): number;

  TemplateEntity(): IGESBasic_SubfigureDef;

  Distance(): number;

  Scale(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_LineFontPredefined: declare class IGESGraph_LineFontPredefined extends IGESData_IGESEntity

  constructor

  Init(nbProps: number, aLineFontPatternCode: number): void;

  NbPropertyValues(): number;

  LineFontPatternCode(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_NominalSize: declare class IGESGraph_NominalSize extends IGESData_IGESEntity

  constructor

  Init(nbProps: number, aNominalSizeValue: number, aNominalSizeName: TCollection_HAsciiString, aStandardName: TCollection_HAsciiString): void;

  NbPropertyValues(): number;

  NominalSizeValue(): number;

  NominalSizeName(): TCollection_HAsciiString;

  HasStandardName(): boolean;

  StandardName(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_Pick: declare class IGESGraph_Pick extends IGESData_IGESEntity

  constructor

  Init(nbProps: number, aPickStatus: number): void;

  NbPropertyValues(): number;

  PickFlag(): number;

  IsPickable(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_Protocol: declare class IGESGraph_Protocol extends IGESData_Protocol

  constructor

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  TypeNumber(atype: Standard_Type): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ReadWriteModule: declare class IGESGraph_ReadWriteModule extends IGESData_ReadWriteModule

  constructor

  CaseIGES(typenum: number, formnum: number): number;

  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_SpecificModule: declare class IGESGraph_SpecificModule extends IGESData_SpecificModule

  constructor

  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_TextDisplayTemplate: declare class IGESGraph_TextDisplayTemplate extends IGESData_IGESEntity

  constructor

  Init(aWidth: number, aHeight: number, aFontCode: number, aFontEntity: IGESGraph_TextFontDef, aSlantAngle: number, aRotationAngle: number, aMirrorFlag: number, aRotationFlag: number, aCorner: gp_XYZ): void;

  SetIncremental(mode: boolean): void;

  IsIncremental(): boolean;

  BoxWidth(): number;

  BoxHeight(): number;

  IsFontEntity(): boolean;

  FontCode(): number;

  FontEntity(): IGESGraph_TextFontDef;

  SlantAngle(): number;

  RotationAngle(): number;

  MirrorFlag(): number;

  RotateFlag(): number;

  StartingCorner(): gp_Pnt;

  TransformedStartingCorner(): gp_Pnt;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_TextFontDef: declare class IGESGraph_TextFontDef extends IGESData_IGESEntity

  constructor

  Init(aFontCode: number, aFontName: TCollection_HAsciiString, aSupersededFont: number, aSupersededEntity: IGESGraph_TextFontDef, aScale: number, allASCIICodes: NCollection_HArray1_int, allNextCharX: NCollection_HArray1_int, allNextCharY: NCollection_HArray1_int, allPenMotions: NCollection_HArray1_int, allPenFlags: IGESBasic_HArray1OfHArray1OfInteger, allMovePenToX: IGESBasic_HArray1OfHArray1OfInteger, allMovePenToY: IGESBasic_HArray1OfHArray1OfInteger): void;

  FontCode(): number;

  FontName(): TCollection_HAsciiString;

  IsSupersededFontEntity(): boolean;

  SupersededFontCode(): number;

  SupersededFontEntity(): IGESGraph_TextFontDef;

  Scale(): number;

  NbCharacters(): number;

  ASCIICode(Chnum: number): number;

  NextCharOrigin(Chnum: number, NX?: number, NY?: number): { NX: number; NY: number };

  NbPenMotions(Chnum: number): number;

  IsPenUp(Chnum: number, Motionnum: number): boolean;

  NextPenPosition(Chnum: number, Motionnum: number, IX?: number, IY?: number): { IX: number; IY: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolColor: declare class IGESGraph_ToolColor

  constructor

  WriteOwnParams(ent: IGESGraph_Color, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGraph_Color): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_Color, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_Color, entto: IGESGraph_Color, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolDefinitionLevel: declare class IGESGraph_ToolDefinitionLevel

  constructor

  WriteOwnParams(ent: IGESGraph_DefinitionLevel, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGraph_DefinitionLevel): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_DefinitionLevel, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_DefinitionLevel, entto: IGESGraph_DefinitionLevel, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolDrawingSize: declare class IGESGraph_ToolDrawingSize

  constructor

  WriteOwnParams(ent: IGESGraph_DrawingSize, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGraph_DrawingSize): boolean;

  DirChecker(ent: IGESGraph_DrawingSize): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_DrawingSize, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_DrawingSize, entto: IGESGraph_DrawingSize, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolDrawingUnits: declare class IGESGraph_ToolDrawingUnits

  constructor

  WriteOwnParams(ent: IGESGraph_DrawingUnits, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGraph_DrawingUnits): boolean;

  DirChecker(ent: IGESGraph_DrawingUnits): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_DrawingUnits, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_DrawingUnits, entto: IGESGraph_DrawingUnits, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolHighLight: declare class IGESGraph_ToolHighLight

  constructor

  WriteOwnParams(ent: IGESGraph_HighLight, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGraph_HighLight): boolean;

  DirChecker(ent: IGESGraph_HighLight): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_HighLight, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_HighLight, entto: IGESGraph_HighLight, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolIntercharacterSpacing: declare class IGESGraph_ToolIntercharacterSpacing

  constructor

  WriteOwnParams(ent: IGESGraph_IntercharacterSpacing, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGraph_IntercharacterSpacing): boolean;

  DirChecker(ent: IGESGraph_IntercharacterSpacing): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_IntercharacterSpacing, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_IntercharacterSpacing, entto: IGESGraph_IntercharacterSpacing, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolLineFontDefPattern: declare class IGESGraph_ToolLineFontDefPattern

  constructor

  WriteOwnParams(ent: IGESGraph_LineFontDefPattern, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGraph_LineFontDefPattern): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_LineFontDefPattern, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_LineFontDefPattern, entto: IGESGraph_LineFontDefPattern, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolLineFontDefTemplate: declare class IGESGraph_ToolLineFontDefTemplate

  constructor

  WriteOwnParams(ent: IGESGraph_LineFontDefTemplate, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGraph_LineFontDefTemplate): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_LineFontDefTemplate, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_LineFontDefTemplate, entto: IGESGraph_LineFontDefTemplate, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolLineFontPredefined: declare class IGESGraph_ToolLineFontPredefined

  constructor

  WriteOwnParams(ent: IGESGraph_LineFontPredefined, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGraph_LineFontPredefined): boolean;

  DirChecker(ent: IGESGraph_LineFontPredefined): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_LineFontPredefined, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_LineFontPredefined, entto: IGESGraph_LineFontPredefined, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolNominalSize: declare class IGESGraph_ToolNominalSize

  constructor

  WriteOwnParams(ent: IGESGraph_NominalSize, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGraph_NominalSize): boolean;

  DirChecker(ent: IGESGraph_NominalSize): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_NominalSize, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_NominalSize, entto: IGESGraph_NominalSize, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolPick: declare class IGESGraph_ToolPick

  constructor

  WriteOwnParams(ent: IGESGraph_Pick, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGraph_Pick): boolean;

  DirChecker(ent: IGESGraph_Pick): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_Pick, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_Pick, entto: IGESGraph_Pick, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolTextDisplayTemplate: declare class IGESGraph_ToolTextDisplayTemplate

  constructor

  WriteOwnParams(ent: IGESGraph_TextDisplayTemplate, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGraph_TextDisplayTemplate): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_TextDisplayTemplate, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_TextDisplayTemplate, entto: IGESGraph_TextDisplayTemplate, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolTextFontDef: declare class IGESGraph_ToolTextFontDef

  constructor

  WriteOwnParams(ent: IGESGraph_TextFontDef, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGraph_TextFontDef): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_TextFontDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_TextFontDef, entto: IGESGraph_TextFontDef, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_ToolUniformRectGrid: declare class IGESGraph_ToolUniformRectGrid

  constructor

  WriteOwnParams(ent: IGESGraph_UniformRectGrid, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGraph_UniformRectGrid): boolean;

  DirChecker(ent: IGESGraph_UniformRectGrid): IGESData_DirChecker;

  OwnCheck(ent: IGESGraph_UniformRectGrid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGraph_UniformRectGrid, entto: IGESGraph_UniformRectGrid, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_UniformRectGrid: declare class IGESGraph_UniformRectGrid extends IGESData_IGESEntity

  constructor

  Init(nbProps: number, finite: number, line: number, weighted: number, aGridPoint: gp_XY, aGridSpacing: gp_XY, pointsX: number, pointsY: number): void;

  NbPropertyValues(): number;

  IsFinite(): boolean;

  IsLine(): boolean;

  IsWeighted(): boolean;

  GridPoint(): gp_Pnt2d;

  GridSpacing(): gp_Vec2d;

  NbPointsX(): number;

  NbPointsY(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGraph_Array1OfColor: NCollection_Array1_handle_IGESGraph_Color

IGESGraph_Array1OfTextDisplayTemplate: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate

IGESGraph_Array1OfTextFontDef: NCollection_Array1_handle_IGESGraph_TextFontDef

IGESGraph_HArray1OfColor: NCollection_HArray1_handle_IGESGraph_Color

IGESGraph_HArray1OfTextDisplayTemplate: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate

IGESGraph_HArray1OfTextFontDef: NCollection_HArray1_handle_IGESGraph_TextFontDef
