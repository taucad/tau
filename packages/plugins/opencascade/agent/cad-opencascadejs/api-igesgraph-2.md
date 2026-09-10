# libcascade — IGESGraph (2)

14 top-level symbols. Signatures are verbatim typescript.

// Tool to work on a LineFontDefTemplate
IGESGraph_ToolLineFontDefTemplate: declare class IGESGraph_ToolLineFontDefTemplate

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_LineFontDefTemplate, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGraph_LineFontDefTemplate): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_LineFontDefTemplate, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_LineFontDefTemplate, entto: IGESGraph_LineFontDefTemplate, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a LineFontPredefined
IGESGraph_ToolLineFontPredefined: declare class IGESGraph_ToolLineFontPredefined

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_LineFontPredefined, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a LineFontPredefined (NbPropertyValues forced to 1)
OwnCorrect(ent: IGESGraph_LineFontPredefined): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGraph_LineFontPredefined): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_LineFontPredefined, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_LineFontPredefined, entto: IGESGraph_LineFontPredefined, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a NominalSize
IGESGraph_ToolNominalSize: declare class IGESGraph_ToolNominalSize

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_NominalSize, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a NominalSize (NbPropertyValues forced to 2 or 3 according HasStandardName)
OwnCorrect(ent: IGESGraph_NominalSize): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGraph_NominalSize): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_NominalSize, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_NominalSize, entto: IGESGraph_NominalSize, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a Pick
IGESGraph_ToolPick: declare class IGESGraph_ToolPick

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_Pick, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a Pick (NbPropertyValues forced to 1)
OwnCorrect(ent: IGESGraph_Pick): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGraph_Pick): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_Pick, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_Pick, entto: IGESGraph_Pick, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a TextDisplayTemplate
IGESGraph_ToolTextDisplayTemplate: declare class IGESGraph_ToolTextDisplayTemplate

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_TextDisplayTemplate, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGraph_TextDisplayTemplate): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_TextDisplayTemplate, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_TextDisplayTemplate, entto: IGESGraph_TextDisplayTemplate, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a TextFontDef
IGESGraph_ToolTextFontDef: declare class IGESGraph_ToolTextFontDef

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_TextFontDef, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Returns specific DirChecker
DirChecker(ent: IGESGraph_TextFontDef): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_TextFontDef, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_TextFontDef, entto: IGESGraph_TextFontDef, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool to work on a UniformRectGrid
IGESGraph_ToolUniformRectGrid: declare class IGESGraph_ToolUniformRectGrid

constructor

// Writes own parameters to IGESWriter
WriteOwnParams(ent: IGESGraph_UniformRectGrid, IW: IGESData_IGESWriter): void;
// IW: Mutated in place

// Sets automatic unambiguous Correction on a UniformRectGrid (NbPropertyValues forced to 9)
OwnCorrect(ent: IGESGraph_UniformRectGrid): boolean;

// Returns specific DirChecker
DirChecker(ent: IGESGraph_UniformRectGrid): IGESData_DirChecker;

// Performs Specific Semantic Check
OwnCheck(ent: IGESGraph_UniformRectGrid, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Copies Specific Parameters
OwnCopy(entfrom: IGESGraph_UniformRectGrid, entto: IGESGraph_UniformRectGrid, TC: Interface_CopyTool): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// defines IGESUniformRectGrid, Type <406> Form <22> in package {@link IGESGraph`IGESGraph`}
IGESGraph_UniformRectGrid: declare class IGESGraph_UniformRectGrid extends IGESData_IGESEntity

constructor

// This method is used to set the fields of the class UniformRectGrid
Init(nbProps: number, finite: number, line: number, weighted: number, aGridPoint: gp_XY, aGridSpacing: gp_XY, pointsX: number, pointsY: number): void;

// returns the number of property values in <me>
NbPropertyValues(): number;

// returns False if <me> is an infinite grid, True if <me> is a finite grid
IsFinite(): boolean;

// returns False if <me> is a Point grid, True if <me> is a Line grid
IsLine(): boolean;

// returns False if <me> is a Weighted grid, True if <me> is not a Weighted grid
IsWeighted(): boolean;

// returns coordinates of lower left corner, if <me> is a finite grid, coordinates of an arbitrary point, if <me> is an infinite grid
GridPoint(): gp_Pnt2d;

// returns the grid-spacing in drawing coordinates
GridSpacing(): gp_Vec2d;

// returns the no
NbPointsX(): number;

// returns the no
NbPointsY(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESGraph_Array1OfColor: NCollection_Array1_handle_IGESGraph_Color

IGESGraph_Array1OfTextDisplayTemplate: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate

IGESGraph_Array1OfTextFontDef: NCollection_Array1_handle_IGESGraph_TextFontDef

IGESGraph_HArray1OfColor: NCollection_HArray1_handle_IGESGraph_Color

IGESGraph_HArray1OfTextDisplayTemplate: NCollection_HArray1_handle_IGESGraph_TextDisplayTemplate

IGESGraph_HArray1OfTextFontDef: NCollection_HArray1_handle_IGESGraph_TextFontDef
