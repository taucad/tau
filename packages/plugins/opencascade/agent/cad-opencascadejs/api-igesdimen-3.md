# libcascade — IGESDimen (3)

19 top-level symbols. Signatures are verbatim typescript.

// Tool to work on a FlagNote
IGESDimen_ToolFlagNote: declare class IGESDimen_ToolFlagNote

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_FlagNote, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_FlagNote): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_FlagNote, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_FlagNote, entto: IGESDimen_FlagNote, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a GeneralLabel
IGESDimen_ToolGeneralLabel: declare class IGESDimen_ToolGeneralLabel

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_GeneralLabel, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_GeneralLabel): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_GeneralLabel, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_GeneralLabel, entto: IGESDimen_GeneralLabel, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a GeneralNote
IGESDimen_ToolGeneralNote: declare class IGESDimen_ToolGeneralNote

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_GeneralNote, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_GeneralNote): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_GeneralNote, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_GeneralNote, entto: IGESDimen_GeneralNote, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a GeneralSymbol
IGESDimen_ToolGeneralSymbol: declare class IGESDimen_ToolGeneralSymbol

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_GeneralSymbol, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_GeneralSymbol): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_GeneralSymbol, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_GeneralSymbol, entto: IGESDimen_GeneralSymbol, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a LeaderArrow
IGESDimen_ToolLeaderArrow: declare class IGESDimen_ToolLeaderArrow

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_LeaderArrow, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_LeaderArrow): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_LeaderArrow, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_LeaderArrow, entto: IGESDimen_LeaderArrow, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a LinearDimension
IGESDimen_ToolLinearDimension: declare class IGESDimen_ToolLinearDimension

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_LinearDimension, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_LinearDimension): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_LinearDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_LinearDimension, entto: IGESDimen_LinearDimension, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a NewDimensionedGeometry
IGESDimen_ToolNewDimensionedGeometry: declare class IGESDimen_ToolNewDimensionedGeometry

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_NewDimensionedGeometry, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a NewDimensionedGeometry (NbDimensions forced to 1, Transf Nullified in D.E.)
OwnCorrect(ent: IGESDimen_NewDimensionedGeometry): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_NewDimensionedGeometry): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_NewDimensionedGeometry, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_NewDimensionedGeometry, entto: IGESDimen_NewDimensionedGeometry, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a NewGeneralNote
IGESDimen_ToolNewGeneralNote: declare class IGESDimen_ToolNewGeneralNote

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_NewGeneralNote, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_NewGeneralNote): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_NewGeneralNote, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_NewGeneralNote, entto: IGESDimen_NewGeneralNote, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a OrdinateDimension
IGESDimen_ToolOrdinateDimension: declare class IGESDimen_ToolOrdinateDimension

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_OrdinateDimension, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_OrdinateDimension): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_OrdinateDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_OrdinateDimension, entto: IGESDimen_OrdinateDimension, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a PointDimension
IGESDimen_ToolPointDimension: declare class IGESDimen_ToolPointDimension

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_PointDimension, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_PointDimension): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_PointDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_PointDimension, entto: IGESDimen_PointDimension, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a RadiusDimension
IGESDimen_ToolRadiusDimension: declare class IGESDimen_ToolRadiusDimension

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_RadiusDimension, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_RadiusDimension): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_RadiusDimension, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_RadiusDimension, entto: IGESDimen_RadiusDimension, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Section
IGESDimen_ToolSection: declare class IGESDimen_ToolSection

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_Section, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Section (LineFont forced to Rank = 1, DataType forced to 1)
OwnCorrect(ent: IGESDimen_Section): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_Section): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_Section, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_Section, entto: IGESDimen_Section, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a SectionedArea
IGESDimen_ToolSectionedArea: declare class IGESDimen_ToolSectionedArea

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_SectionedArea, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESDimen_SectionedArea): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_SectionedArea, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_SectionedArea, entto: IGESDimen_SectionedArea, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a WitnessLine
IGESDimen_ToolWitnessLine: declare class IGESDimen_ToolWitnessLine

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESDimen_WitnessLine, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a WitnessLine (LineFont forced to Rank = 1, DataType forced to 1)
OwnCorrect(ent: IGESDimen_WitnessLine): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESDimen_WitnessLine): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESDimen_WitnessLine, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESDimen_WitnessLine, entto: IGESDimen_WitnessLine, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines WitnessLine, Type <106> Form <40> in package {@link IGESDimen`IGESDimen`} Contains one or more straight line segments associated with drafting entities of various types
IGESDimen_WitnessLine: declare class IGESDimen_WitnessLine extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class WitnessLine
Init(dataType: number, aDisp: number, dataPoints: NCollection_HArray1_gp_XY): void;

// returns Interpretation Flag, always = 1
Datatype(): number;

// returns number of Data Points
NbPoints(): number;

// returns common Z displacement
ZDisplacement(): number;

// returns Index'th
Point(Index: number): gp_Pnt;

// returns data point after Transformation
TransformedPoint(Index: number): gp_Pnt;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESDimen_Array1OfGeneralNote: NCollection_Array1_handle_IGESDimen_GeneralNote

IGESDimen_Array1OfLeaderArrow: NCollection_Array1_handle_IGESDimen_LeaderArrow

IGESDimen_HArray1OfGeneralNote: NCollection_HArray1_handle_IGESDimen_GeneralNote

IGESDimen_HArray1OfLeaderArrow: NCollection_HArray1_handle_IGESDimen_LeaderArrow
