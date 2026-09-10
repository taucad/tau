# libcascade — IGESGraph

25 top-level symbols. Signatures are verbatim typescript.

// This package contains the group of classes necessary to define Graphic data among Structure Entities
IGESGraph: declare class IGESGraph

constructor

// Prepares dynamic data (Protocol, Modules) for this package
static Init(): void;

// Returns the Protocol for this Package
static Protocol(): IGESGraph_Protocol;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESColor, Type <314> Form <0> in package {@link IGESGraph`IGESGraph`}
IGESGraph_Color: declare class IGESGraph_Color extends IGESData_ColorEntity

constructor

// This method is used to set the fields of the class Color
Init(red: number, green: number, blue: number, aColorName: TCollection_HAsciiString): void;

RGBIntensity(Red?: number, Green?: number, Blue?: number): { Red: number; Green: number; Blue: number };

CMYIntensity(Cyan?: number, Magenta?: number, Yellow?: number): { Cyan: number; Magenta: number; Yellow: number };

HLSPercentage(Hue?: number, Lightness?: number, Saturation?: number): { Hue: number; Lightness: number; Saturation: number };

// returns True if optional character string is assigned, False otherwise
HasColorName(): boolean;

// if `HasColorName()` is True returns the Verbal description of the Color
ColorName(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESDefinitionLevel, Type <406> Form <1> in package {@link IGESGraph`IGESGraph`}
IGESGraph_DefinitionLevel: declare class IGESGraph_DefinitionLevel extends IGESData_LevelListEntity

constructor

// This method is used to set the fields of the class DefinitionLevel
Init(allLevelNumbers: NCollection_HArray1_int): void;

// returns the number of property values in <me>
NbPropertyValues(): number;

// Must return the count of levels (== NbPropertyValues)
NbLevelNumbers(): number;

// returns the Level Number of <me> indicated by <LevelIndex> raises an exception if LevelIndex is <= 0 or LevelIndex > NbPropertyValues
LevelNumber(num: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESDrawingSize, Type <406> Form <16> in package {@link IGESGraph`IGESGraph`}
IGESGraph_DrawingSize: declare class IGESGraph_DrawingSize extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class DrawingSize
Init(nbProps: number, aXSize: number, aYSize: number): void;

// returns the number of property values in <me> (NP = 2)
NbPropertyValues(): number;

// returns the extent of Drawing along positive XD axis
XSize(): number;

// returns the extent of Drawing along positive YD axis
YSize(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESDrawingUnits, Type <406> Form <17> in package {@link IGESGraph`IGESGraph`}
IGESGraph_DrawingUnits: declare class IGESGraph_DrawingUnits extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class DrawingUnits
Init(nbProps: number, aFlag: number, aUnit: TCollection_HAsciiString): void;

// returns the number of property values in <me>
NbPropertyValues(): number;

// returns the drawing space units of <me>
Flag(): number;

// returns the name of the drawing space units of <me>
Unit(): TCollection_HAsciiString;

// Computes the value of the unit, in meters, according Flag (same values as for GlobalSection from {@link IGESData `IGESData`})
UnitValue(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of General Services for {@link IGESGraph`IGESGraph`} (specific part) This Services comprise
IGESGraph_GeneralModule: declare class IGESGraph_GeneralModule extends IGESData_GeneralModule

constructor

// Returns a DirChecker, specific for each type of Entity (identified by its Case Number)
DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

// Performs Specific Semantic Check for each type of Entity
OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Specific creation of a new void entity
NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Copies parameters which are specific of each Type of Entity
OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

// Returns a category number which characterizes an entity Drawing for all
CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESHighLight, Type <406> Form <20> in package {@link IGESGraph`IGESGraph`}
IGESGraph_HighLight: declare class IGESGraph_HighLight extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class HighLight
Init(nbProps: number, aHighLightStatus: number): void;

// returns the number of property values in <me>
NbPropertyValues(): number;

// returns 0 if <me> is not highlighted(default), 1 if <me> is highlighted
HighLightStatus(): number;

// returns True if entity is highlighted
IsHighLighted(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESIntercharacterSpacing, Type <406> Form <18> in package {@link IGESGraph`IGESGraph`}
IGESGraph_IntercharacterSpacing: declare class IGESGraph_IntercharacterSpacing extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class IntercharacterSpacing
Init(nbProps: number, anISpace: number): void;

// returns the number of property values in <me>
NbPropertyValues(): number;

// returns the Intercharacter Space of <me> in percentage of the text height (Range = 0..100)
ISpace(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESLineFontDefPattern, Type <304> Form <2> in package {@link IGESGraph`IGESGraph`}
IGESGraph_LineFontDefPattern: declare class IGESGraph_LineFontDefPattern extends IGESData_LineFontEntity

constructor

// This method is used to set the fields of the class LineFontDefPattern
Init(allSegLength: NCollection_HArray1_double, aPattern: TCollection_HAsciiString): void;

// returns the number of segments in the visible-blank pattern
NbSegments(): number;

// returns the Length of Index'th segment of the basic pattern raises exception if Index <= 0 or Index > NbSegments
Length(Index: number): number;

// returns the string indicating which segments of the basic pattern are visible and which are blanked
DisplayPattern(): TCollection_HAsciiString;

// The Display Pattern is decrypted to return True if the Index'th basic pattern is Visible, False otherwise
IsVisible(Index: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESLineFontDefTemplate, Type <304> Form <1> in package {@link IGESGraph`IGESGraph`}
IGESGraph_LineFontDefTemplate: declare class IGESGraph_LineFontDefTemplate extends IGESData_LineFontEntity

constructor

// This method is used to set the fields of the class LineFontDefTemplate
Init(anOrientation: number, aTemplate: IGESBasic_SubfigureDef, aDistance: number, aScale: number): void;

// if return value = 0, Each Template display is oriented by aligning the axis of the SubfigureDef with the axis of the definition space of the anchoring curve
Orientation(): number;

// returns SubfigureDef as the Entity used as Template figure
TemplateEntity(): IGESBasic_SubfigureDef;

// returns the Distance between any two Template figures on the anchoring curve
Distance(): number;

// returns the Scaling factor applied to SubfigureDef to form Template figure
Scale(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESLineFontPredefined, Type <406> Form <19> in package {@link IGESGraph`IGESGraph`}
IGESGraph_LineFontPredefined: declare class IGESGraph_LineFontPredefined extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class LineFontPredefined
Init(nbProps: number, aLineFontPatternCode: number): void;

// returns the number of property values in <me>
NbPropertyValues(): number;

// returns the Line Font Pattern Code of <me>
LineFontPatternCode(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESNominalSize, Type <406> Form <13> in package {@link IGESGraph`IGESGraph`}
IGESGraph_NominalSize: declare class IGESGraph_NominalSize extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class NominalSize
Init(nbProps: number, aNominalSizeValue: number, aNominalSizeName: TCollection_HAsciiString, aStandardName: TCollection_HAsciiString): void;

// returns the number of property values in <me>
NbPropertyValues(): number;

// returns the value of <me>
NominalSizeValue(): number;

// returns the name of <me>
NominalSizeName(): TCollection_HAsciiString;

// returns True if an engineering {@link Standard `Standard`} is defined for <me> else, returns False
HasStandardName(): boolean;

// returns the name of the relevant engineering standard of <me>
StandardName(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESPick, Type <406> Form <21> in package {@link IGESGraph`IGESGraph`}
IGESGraph_Pick: declare class IGESGraph_Pick extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class Pick
Init(nbProps: number, aPickStatus: number): void;

// returns the number of property values in <me>
NbPropertyValues(): number;

// returns 0 if <me> is pickable(default), 1 if <me> is not pickable
PickFlag(): number;

// returns True if thePick is 0
IsPickable(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Description of Protocol for {@link IGESGraph`IGESGraph`}
IGESGraph_Protocol: declare class IGESGraph_Protocol extends IGESData_Protocol

constructor

// Gives the count of Resource Protocol
NbResources(): number;

// Returns a Resource, given a rank
Resource(num: number): Interface_Protocol;

// Returns a Case Number, specific of each recognized Type This Case Number is then used in Libraries
TypeNumber(atype: Standard_Type): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Graph File Access Module for {@link IGESGraph`IGESGraph`} (specific parts) Specific actions concern
IGESGraph_ReadWriteModule: declare class IGESGraph_ReadWriteModule extends IGESData_ReadWriteModule

constructor

// Defines Case Numbers for Entities of {@link IGESGraph`IGESGraph`}
CaseIGES(typenum: number, formnum: number): number;

// Writes own parameters to IGESWriter
WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines Services attached to IGES Entities
IGESGraph_SpecificModule: declare class IGESGraph_SpecificModule extends IGESData_SpecificModule

constructor

// Performs non-ambiguous Corrections on Entities which support them (DrawingSize,DrawingUnits,HighLight,IntercharacterSpacing, LineFontPredefined,NominalSize,Pick,UniformRectGrid)
OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES TextDisplayTemplate Entity, Type <312>, form <0, 1> in package {@link IGESGraph`IGESGraph`}
IGESGraph_TextDisplayTemplate: declare class IGESGraph_TextDisplayTemplate extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class TextDisplayTemplate
Init(aWidth: number, aHeight: number, aFontCode: number, aFontEntity: IGESGraph_TextFontDef, aSlantAngle: number, aRotationAngle: number, aMirrorFlag: number, aRotationFlag: number, aCorner: gp_XYZ): void;

// Sets <me> to be Incremental (Form 1) if <mode> is True, or Basolute (Form 0) else
SetIncremental(mode: boolean): void;

// returns True if entity is Incremental (Form 1)
IsIncremental(): boolean;

// returns Character Box Width
BoxWidth(): number;

// returns Character Box Height
BoxHeight(): number;

// returns False if theFontEntity is Null, True otherwise
IsFontEntity(): boolean;

// returns the font code
FontCode(): number;

// returns Text Font Definition Entity used to define the font
FontEntity(): IGESGraph_TextFontDef;

// returns slant angle of character in radians
SlantAngle(): number;

// returns Rotation angle of text block in radians
RotationAngle(): number;

// returns Mirror flag Mirror flag
MirrorFlag(): number;

// returns Rotate internal text flag
RotateFlag(): number;

// If `IsIncremental()` returns False, gets coordinates of lower left corner of first character box
StartingCorner(): gp_Pnt;

// If `IsIncremental()` returns False, gets coordinates of lower left corner of first character box
TransformedStartingCorner(): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGES Text Font Definition Entity, Type <310> in package {@link IGESGraph`IGESGraph`}
IGESGraph_TextFontDef: declare class IGESGraph_TextFontDef extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class TextFontDef
Init(aFontCode: number, aFontName: TCollection_HAsciiString, aSupersededFont: number, aSupersededEntity: IGESGraph_TextFontDef, aScale: number, allASCIICodes: NCollection_HArray1_int, allNextCharX: NCollection_HArray1_int, allNextCharY: NCollection_HArray1_int, allPenMotions: NCollection_HArray1_int, allPenFlags: IGESBasic_HArray1OfHArray1OfInteger, allMovePenToX: IGESBasic_HArray1OfHArray1OfInteger, allMovePenToY: IGESBasic_HArray1OfHArray1OfInteger): void;

// returns the font code
FontCode(): number;

// returns the font name
FontName(): TCollection_HAsciiString;

// True if this definition supersedes another TextFontDefinition Entity, False if it supersedes value
IsSupersededFontEntity(): boolean;

// returns the font number which this entity modifies
SupersededFontCode(): number;

// returns the font entity which this entity modifies
SupersededFontEntity(): IGESGraph_TextFontDef;

// returns the number of grid units which equal one text height unit
Scale(): number;

// returns the number of characters in this definition
NbCharacters(): number;

// returns the ASCII code of Chnum'th character
ASCIICode(Chnum: number): number;

// returns grid location of origin of character next to Chnum'th char
NextCharOrigin(Chnum: number, NX?: number, NY?: number): { NX: number; NY: number };

// returns number of pen motions for Chnum'th character
NbPenMotions(Chnum: number): number;

// returns pen status(True if 1, False if 0) of Motionnum'th motion of Chnum'th character
IsPenUp(Chnum: number, Motionnum: number): boolean;

NextPenPosition(Chnum: number, Motionnum: number, IX?: number, IY?: number): { IX: number; IY: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Color
IGESGraph_ToolColor: declare class IGESGraph_ToolColor

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_Color, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGraph_Color): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_Color, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_Color, entto: IGESGraph_Color, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DefinitionLevel
IGESGraph_ToolDefinitionLevel: declare class IGESGraph_ToolDefinitionLevel

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_DefinitionLevel, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGraph_DefinitionLevel): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_DefinitionLevel, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_DefinitionLevel, entto: IGESGraph_DefinitionLevel, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DrawingSize
IGESGraph_ToolDrawingSize: declare class IGESGraph_ToolDrawingSize

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_DrawingSize, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a DrawingSize (NbPropertyValues forced to 2)
OwnCorrect(ent: IGESGraph_DrawingSize): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGraph_DrawingSize): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_DrawingSize, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_DrawingSize, entto: IGESGraph_DrawingSize, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a DrawingUnits
IGESGraph_ToolDrawingUnits: declare class IGESGraph_ToolDrawingUnits

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_DrawingUnits, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a DrawingUnits (NbPropertyValues forced to 2)
OwnCorrect(ent: IGESGraph_DrawingUnits): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGraph_DrawingUnits): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_DrawingUnits, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_DrawingUnits, entto: IGESGraph_DrawingUnits, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a HighLight
IGESGraph_ToolHighLight: declare class IGESGraph_ToolHighLight

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_HighLight, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a HighLight (NbPropertyValues forced to 1)
OwnCorrect(ent: IGESGraph_HighLight): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGraph_HighLight): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_HighLight, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_HighLight, entto: IGESGraph_HighLight, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a IntercharacterSpacing
IGESGraph_ToolIntercharacterSpacing: declare class IGESGraph_ToolIntercharacterSpacing

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_IntercharacterSpacing, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a IntercharacterSpacing (NbPropertyValues forced to 1)
OwnCorrect(ent: IGESGraph_IntercharacterSpacing): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGraph_IntercharacterSpacing): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_IntercharacterSpacing, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_IntercharacterSpacing, entto: IGESGraph_IntercharacterSpacing, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a LineFontDefPattern
IGESGraph_ToolLineFontDefPattern: declare class IGESGraph_ToolLineFontDefPattern

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_LineFontDefPattern, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGraph_LineFontDefPattern): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_LineFontDefPattern, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_LineFontDefPattern, entto: IGESGraph_LineFontDefPattern, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
