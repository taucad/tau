# libcascade — IGESSelect

33 top-level symbols. Signatures are verbatim typescript.

// This package defines the library of the most used tools for IGES Files
IGESSelect: declare class IGESSelect

constructor

// Simply gives a prompt for a conversational action on standard input/output
static Run(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Performs Actions specific to {@link IGESSelect`IGESSelect`}, i.e
IGESSelect_Activator: declare class IGESSelect_Activator extends IFSelect_Activator

constructor

// Executes a Command Line for {@link IGESSelect`IGESSelect`}
Do(number\_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

// Sends a short help message for {@link IGESSelect`IGESSelect`} commands
Help(number\_: number): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows to add comment lines on writing an IGES File These lines are added to Start Section, instead of the only one blank line written by default
IGESSelect_AddFileComment: declare class IGESSelect_AddFileComment extends IGESSelect_FileModifier

constructor

// Clears the list of file comment lines already stored
Clear(): void;

// Adds a line for file comment Remark
AddLine(line: string): void;

// Adds a list of lines for file comment Each of them must comply with demand of AddLine
AddLines(lines: NCollection_HSequence_handle_TCollection_HAsciiString): void;

// Returns the count of stored lines
NbLines(): number;

// Returns a stored line given its rank
Line(num: number): string;

// Returns the complete list of lines in once
Lines(): NCollection_HSequence_handle_TCollection_HAsciiString;

// Sends the comment lines to the file (Start Section)
Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;
// writer: Mutated in place

// Returns specific Label, which is "Add <nn> Comment Lines (Start Section)"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Adds a Group to contain the entities designated by the Selection
IGESSelect_AddGroup: declare class IGESSelect_AddGroup extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Add Group"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Does the absolutely effective corrections on IGES Entity
IGESSelect_AutoCorrect: declare class IGESSelect_AutoCorrect extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Auto-correction of IGES Entities"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Changes Level List (in directory part) to a new single value Only entities attached to a LevelListEntity are considered If OldNumber is defined, only entities whose LevelList contains its Value are processed
IGESSelect_ChangeLevelList: declare class IGESSelect_ChangeLevelList extends IGESSelect_ModelModifier

constructor

// Returns True if OldNumber is defined
HasOldNumber(): boolean;

// Returns True if NewNumber is defined
HasNewNumber(): boolean;

// Returns a text which begins by "Changes Level Lists containing <old>", or "Changes all Level Lists in D.E.", and ends by " to Number <new>" or " to Number = first value in List"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Changes Level Number (as null or single) to a new single value Entities attached to a LevelListEntity are ignored Entities considered can be, either all Entities but those attached to a LevelListEntity, or Entities attached to a specific Level Number (0 for not defined)
IGESSelect_ChangeLevelNumber: declare class IGESSelect_ChangeLevelNumber extends IGESSelect_ModelModifier

constructor

// Returns True if OldNumber is defined
HasOldNumber(): boolean;

// Returns a text which is "Changes Level Number <old> to <new>" , or "Changes all Levels Numbers positive and zero to <new>"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes Status of IGES Entities for a whole IGESModel
IGESSelect_ComputeStatus: declare class IGESSelect_ComputeStatus extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Compute Subordinate Status and Use Flag"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives information about Level Number
IGESSelect_CounterOfLevelNumber: declare class IGESSelect_CounterOfLevelNumber extends IFSelect_SignCounter

constructor

// Resets already memorized information
Clear(): void;

// Adds an entity by considering its lrvrl number(s) A level is added both in numeric and alphanumeric form, i.e
AddSign(ent: Standard_Transient, model: Interface_InterfaceModel): void;

// The internal action to record a new level number, positive, null (no level) or negative (level list)
AddLevel(ent: Standard_Transient, level: number): void;

// Returns the highest value found for a level number
HighestLevel(): number;

// Returns the number of times a level is used, 0 if it has not been recorded at all <level> = 0 counts entities attached to no level <level> < 0 counts entities attached to a LevelList
NbTimesLevel(level: number): number;

// Returns the ordered list of used positive Level numbers
Levels(): NCollection_HSequence_int;

// Determines and returns the value of the signature for an entity as an HAsciiString
Sign(ent: Standard_Transient, model: Interface_InterfaceModel): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This type of dispatch defines sets of entities attached to distinct drawings
IGESSelect_DispPerDrawing: declare class IGESSelect_DispPerDrawing extends IFSelect_Dispatch

constructor

// Returns as Label, "One File per Drawing"
Label(): TCollection_AsciiString;

// Returns True, because of entities attached to no view
CanHaveRemainder(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This type of dispatch defines sets of entities attached to distinct single views
IGESSelect_DispPerSingleView: declare class IGESSelect_DispPerSingleView extends IFSelect_Dispatch

constructor

// Returns as Label, "One File per single View or Drawing Frame"
Label(): TCollection_AsciiString;

// Returns True, because of entities attached to no view
CanHaveRemainder(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Dumper from {@link IGESSelect`IGESSelect`} takes into account, for SessionFile, the classes defined in the package {@link IGESSelect`IGESSelect`}
IGESSelect_Dumper: declare class IGESSelect_Dumper extends IFSelect_SessionDumper

constructor

// Write the Own Parameters of Types defined in package {@link IGESSelect`IGESSelect`} Returns True if has been processed, False else
WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

// Recognizes and Read Own Parameters for Types of package {@link IGESSelect`IGESSelect`}
ReadOwn(file: IFSelect*SessionFile, type*: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is aimed to display and edit the Directory Part of an IGESEntity
IGESSelect_EditDirPart: declare class IGESSelect_EditDirPart extends IFSelect_Editor

constructor

// Returns the specific label
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is aimed to display and edit the Header of an IGES Model
IGESSelect_EditHeader: declare class IGESSelect_EditHeader extends IFSelect_Editor

constructor

// Returns the specific label
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESSelect_FileModifier: declare class IGESSelect_FileModifier extends IFSelect_GeneralModifier

// Perform the action specific to each class of File Modifier <ctx> is the ContextWrite, which brings
Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;
// writer: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives control out format for floatting values
IGESSelect_FloatFormat: declare class IGESSelect_FloatFormat extends IGESSelect_FileModifier

constructor

// Sets FloatFormat to default value (see Create) but if <digits> is given positive, it commands Formats (main and range) to ensure <digits> significant digits to be displayed
SetDefault(digits?: number): void;

// Sets ZeroSuppress mode to a new value
SetZeroSuppress(mode: boolean): void;

// Sets Main Format to a new value Remark
SetFormat(format?: string): void;

// Sets Format for Range to a new value with its range of application
SetFormatForRange(format?: string, Rmin?: number, Rmax?: number): void;

// Returns all recorded parameters
Format(zerosup: boolean, mainform: TCollection_AsciiString, hasrange: boolean, forminrange: TCollection_AsciiString, rangemin?: number, rangemax?: number): { zerosup: boolean; hasrange: boolean; rangemin: number; rangemax: number };
// mainform: Mutated in place
// forminrange: Mutated in place

// Sets the Floatting Formats of IGESWriter to the recorded parameters
Perform(ctx: IFSelect_ContextWrite, writer: IGESData_IGESWriter): void;
// writer: Mutated in place

// Returns specific Label
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// IGESName is a Signature specific to IGESNorm
IGESSelect_IGESName: declare class IGESSelect_IGESName extends IFSelect_Signature

constructor

// Returns the ShortLabel as being the Name of an IGESEntity If <ent> has no name, it returns empty string ""
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// IGESTypeForm is a Signature specific to the IGES Norm
IGESSelect_IGESTypeForm: declare class IGESSelect_IGESTypeForm extends IFSelect_Signature

constructor

// Changes the mode for giving the Form Number
SetForm(withform: boolean): void;

// Returns the signature for IGES, "mmm nnn" or "mmm" according creation choice (Type & Form or Type only)
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IGESSelect_ModelModifier: declare class IGESSelect_ModelModifier extends IFSelect_Modifier

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Rebuilds Drawings which were bypassed to produce new models
IGESSelect_RebuildDrawings: declare class IGESSelect_RebuildDrawings extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Rebuild Drawings"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Rebuilds Groups which were bypassed to produce new models
IGESSelect_RebuildGroups: declare class IGESSelect_RebuildGroups extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Rebuild Groups"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Removes Curves UV or 3D (not both !) from Faces, those designated by the Selection
IGESSelect_RemoveCurves: declare class IGESSelect_RemoveCurves extends IGESSelect_ModelModifier

constructor

// Returns a text which is "Remove Curves UV on Face" or "Remove Curves 3D on Face"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Selects a list built as follows
IGESSelect_SelectBypassGroup: declare class IGESSelect_SelectBypassGroup extends IFSelect_SelectExplore

constructor

// Returns a text defining the criterium
ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Selects a list built as follows
IGESSelect_SelectBypassSubfigure: declare class IGESSelect_SelectBypassSubfigure extends IFSelect_SelectExplore

constructor

// Returns a text defining the criterium
ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This selection gets the Drawings attached to its input IGES entities
IGESSelect_SelectDrawingFrom: declare class IGESSelect_SelectDrawingFrom extends IFSelect_SelectDeduct

constructor

// Returns the label, with its "Drawings attached"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This selection returns the faces contained in an IGES Entity or itself if it is a Face Face means
IGESSelect_SelectFaces: declare class IGESSelect_SelectFaces extends IFSelect_SelectExplore

constructor

// Returns a text defining the criterium
ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This selection gets in all the model, the entities which are attached to the drawing(s) given as input
IGESSelect_SelectFromDrawing: declare class IGESSelect_SelectFromDrawing extends IFSelect_SelectDeduct

constructor

// Returns the label, with is "Entities attached to Drawing"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This selection gets in all the model, the entities which are attached to the views given as input
IGESSelect_SelectFromSingleView: declare class IGESSelect_SelectFromSingleView extends IFSelect_SelectDeduct

constructor

// Returns the label, with is "Entities attached to single View"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This selection looks at Level Number of IGES Entities
IGESSelect_SelectLevelNumber: declare class IGESSelect_SelectLevelNumber extends IFSelect_SelectExtract

constructor

// Returns True if <ent> is an IGES Entity with Level Number admits the criterium (= value if single level, or one of the attached level numbers = value if level list)
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns the Selection criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Selects Entities which have a given name
IGESSelect_SelectName: declare class IGESSelect_SelectName extends IFSelect_SelectExtract

constructor

// Returns True if Name of Entity complies with Name Filter
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Sets a Name as a criterium
SetName(name: TCollection_HAsciiString): void;

// Returns the Name used as Filter
Name(): TCollection_HAsciiString;

// Returns the Selection criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This Selection returns the pcurves which lie on a face In two modes
IGESSelect_SelectPCurves: declare class IGESSelect_SelectPCurves extends IFSelect_SelectExplore

constructor

// Returns a text defining the criterium
ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This selection gets the Single Views attached to its input IGES entities
IGESSelect_SelectSingleViewFrom: declare class IGESSelect_SelectSingleViewFrom extends IFSelect_SelectDeduct

constructor

// Returns the label, with is "Single Views attached"
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This selections uses Subordinate Status as sort criterium It is an integer number which can be
IGESSelect_SelectSubordinate: declare class IGESSelect_SelectSubordinate extends IFSelect_SelectExtract

constructor

// Returns the status used for sorting
Status(): number;

// Returns True if <ent> is an IGES Entity with Subordinate Status matching the criterium
Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Returns the Selection criterium
ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
