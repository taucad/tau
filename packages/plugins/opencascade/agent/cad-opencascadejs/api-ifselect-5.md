# libcascade — IFSelect (5)

3 top-level symbols. Signatures are verbatim typescript.

// This class runs transformations made by Modifiers, as the ModelCopier does when it produces files (the same set of Modifiers can then be used, as to transform the starting Model, as at file sending time)
IFSelect_TransformStandard: declare class IFSelect_TransformStandard extends IFSelect_Transformer

constructor

// Sets the Copy option to a new value
SetCopyOption(option: boolean): void;

// Returns the Copy option
CopyOption(): boolean;

// Sets a Selection (or unsets if Null) This Selection then defines the list of entities on which the Modifiers will be applied If it is set, it has priority on Selections of Modifiers Else, for each Modifier its Selection is evaluated By default, all the Model is taken
SetSelection(sel: IFSelect_Selection): void;

// Returns the Selection, Null by default
Selection(): IFSelect_Selection;

// Returns the count of recorded Modifiers
NbModifiers(): number;

// Returns a Modifier given its rank in the list
Modifier(num: number): IFSelect_Modifier;

// Returns the rank of a Modifier in the list, 0 if unknown
ModifierRank(modif: IFSelect_Modifier): number;

// Adds a Modifier to the list
AddModifier(modif: IFSelect_Modifier, atnum?: number): boolean;

// Removes a Modifier from the list Returns True if done, False if <modif> not in the list
RemoveModifier(modif: IFSelect_Modifier): boolean;
RemoveModifier(num: number): boolean;
RemoveModifier(modif: IFSelect_Modifier): boolean;
RemoveModifier(num: number): boolean;

// This methods allows to know what happened to a starting entity after the last Perform
Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Returns a text which defines the way a Transformer works
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A Transformer defines the way an InterfaceModel is transformed (without sending it to a file)
IFSelect_Transformer: declare class IFSelect_Transformer extends Standard_Transient

// This methods allows to declare that the Protocol applied to the new Model has changed
ChangeProtocol(): { returnValue: boolean; newproto: Interface_Protocol; [Symbol.dispose](): void };

// This method allows to know what happened to a starting entity after the last Perform
Updated(entfrom: Standard_Transient): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Returns a text which defines the way a Transformer works (to identify the transformation it performs)
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class defines the (empty) frame which can be used to enrich a XSTEP set with new capabilities In particular, a specific WorkLibrary must give the way for Reading a File into a Model, and Writing a Model to a File Thus, it is possible to define several Work Libraries for each norm, but recommended to define one general class for each one
IFSelect_WorkLibrary: declare class IFSelect_WorkLibrary extends Standard_Transient

// Gives the way to Read a File and transfer it to a Model <mod> is the resulting Model, which has to be created by this method
ReadFile(name: string, protocol: Interface_Protocol): { returnValue: number; model: Interface_InterfaceModel; [Symbol.dispose](): void };

// Gives the way to Write a File from a Model
WriteFile(ctx: IFSelect_ContextWrite): boolean;

// Records a default level and a maximum value for level level for DumpEntity can go between 0 and <max> default value will be <def>
SetDumpLevels(def: number, max: number): void;

// Returns the recorded default and maximum dump levels If none was recorded, max is returned negative, def as zero
DumpLevels(def?: number, max?: number): { def: number; max: number };

// Records a short line of help for a level (0 - max)
SetDumpHelp(level: number, help: string): void;

// Returns the help line recorded for <level>, or an empty string
DumpHelp(level: number): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
