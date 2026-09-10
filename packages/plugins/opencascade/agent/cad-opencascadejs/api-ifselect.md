# libcascade — IFSelect

18 top-level symbols. Signatures are verbatim typescript.

// Gives tools to manage Selecting a group of Entities processed by an Interface, for instance to divide up an original Model (from a File) to several smaller ones They use description of an Interface Model as a graph
IFSelect: declare class IFSelect

constructor

// Saves the state of a WorkSession from {@link IFSelect`IFSelect`}, by using a SessionFile from {@link IFSelect`IFSelect`}
static SaveSession(WS: IFSelect_WorkSession, file: string): boolean;

// Restore the state of a WorkSession from {@link IFSelect`IFSelect`}, by using a SessionFile from {@link IFSelect`IFSelect`}
static RestoreSession(WS: IFSelect_WorkSession, file: string): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Act gives a simple way to define and add functions to be ran from a SessionPilot, as follows
IFSelect_Act: declare class IFSelect_Act extends IFSelect_Activator

constructor

// Execution of Command Line
Do(number\_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

// Short Help for commands
Help(number\_: number): string;

// Changes the default group name for the following Acts group empty means to come back to default from Activator Also a file name can be precised (to query by getsource)
static SetGroup(group: string, file?: string): void;

// Adds a function with its name and help
static AddFunc(name: string, help: string, func: ((arg0: IFSelect_SessionPilot) => IFSelect_ReturnStatus)): void;

// Adds a function with its name and help
static AddFSet(name: string, help: string, func: ((arg0: IFSelect_SessionPilot) => IFSelect_ReturnStatus)): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the general frame for working with a SessionPilot
IFSelect_Activator: declare class IFSelect_Activator extends Standard_Transient

// Records, in a Dictionary available for all the Activators, the command title an Activator can process, attached with its number, proper for this Activator <mode> allows to distinguish various execution modes 0
static Adding(actor: IFSelect*Activator, number*: number, command: string, mode: number): void;

// Allows a self-definition by an Activator of the Commands it processes, call the class method Adding (mode 0)
Add(number\_: number, command: string): void;

// Same as Add but specifies that this command is candidate for xset (creation of items, xset
AddSet(number\_: number, command: string): void;

// Removes a Command, if it is recorded (else, does nothing)
static Remove(command: string): void;

// Selects, for a Command given by its title, an actor with its command number
static Select(command: string, number*?: number): { returnValue: boolean; number*: number; actor: IFSelect_Activator; [Symbol.dispose](): void };

// Returns mode recorded for a command
static Mode(command: string): number;

// Returns, for a root of command title, the list of possible commands
static Commands(mode?: number, command?: string): NCollection_HSequence_TCollection_AsciiString;

// Tries to execute a Command Line
Do(number\_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

// Sends a short help message for a given command identified by it number for this Activator (must take one line max)
Help(number\_: number): string;

Group(): string;

File(): string;

// Group and SetGroup define a "Group of commands" which correspond to an Activator
SetForGroup(group: string, file?: string): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows to memorize and access to the modifiers which are to be applied to a file
IFSelect_AppliedModifiers: declare class IFSelect_AppliedModifiers extends Standard_Transient

constructor

// Records a modifier
AddModif(modif: IFSelect_GeneralModifier): boolean;

// Adds a number of entity of the output file to be applied on
AddNum(nument: number): boolean;

// Returns the count of recorded modifiers
Count(): number;

// Returns the description for applied modifier n0 <num>
Item(num: number, entcount?: number): { returnValue: boolean; modif: IFSelect_GeneralModifier; entcount: number; [Symbol.dispose](): void };

// Returns a numero of entity to be applied on, given its rank in the list
ItemNum(nument: number): number;

// Returns the list of entities to be applied on (see Item) as a HSequence (IsForAll produces the complete list of all the entity numbers of the file
ItemList(): NCollection_HSequence_int;

// Returns True if the applied modifier queried by last call to Item is to be applied to all the produced file
IsForAll(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// BasicDumper takes into account, for SessionFile, all the classes defined in the package {@link IFSelect`IFSelect`}
IFSelect_BasicDumper: declare class IFSelect_BasicDumper extends IFSelect_SessionDumper

constructor

// Write the Own Parameters of Types defined in package {@link IFSelect`IFSelect`} Returns True if has been processed, False else
WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

// Recognizes and Read Own Parameters for Types of package {@link IFSelect`IFSelect`}
ReadOwn(file: IFSelect*SessionFile, type*: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A CheckCounter allows to see a CheckList (i.e
IFSelect_CheckCounter: declare class IFSelect_CheckCounter extends IFSelect_SignatureList

constructor

// Sets a specific signature Else, the current SignType (in the model) is used
SetSignature(sign: MoniTool_SignText): void;

// Returns the Signature;
Signature(): MoniTool_SignText;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gathers various information used by File Modifiers apart from the writer object, which is specific of the norm and of the physical format
IFSelect_ContextWrite: declare class IFSelect_ContextWrite

constructor

// Returns the Model
Model(): Interface_InterfaceModel;

// Returns the Protocol;
Protocol(): Interface_Protocol;

// Returns the File Name
FileName(): string;

// Returns the object AppliedModifiers
AppliedModifiers(): IFSelect_AppliedModifiers;

// Returns the count of recorded File Modifiers
NbModifiers(): number;

// Sets active the File Modifier n0 <numod> Then, it prepares the list of entities to consider, if any Returns False if <numod> out of range
SetModifier(numod: number): boolean;

// Returns the currently active File Modifier
FileModifier(): IFSelect_GeneralModifier;

// Returns True if no modifier is currently set
IsForNone(): boolean;

// Returns True if the current modifier is to be applied to the whole model
IsForAll(): boolean;

// Returns the total count of selected entities
NbEntities(): number;

// Starts an iteration on selected items
Start(): void;

// Returns True until the iteration has finished
More(): boolean;

// Advances the iteration
Next(): void;

// Returns the current selected entity in the model
Value(): Standard_Transient;

// Adds a Check to the CheckList
AddCheck(check: Interface_Check): void;

// Adds a Warning `Message` for an Entity from the Model If <start> is not an Entity from the model (e.g
AddWarning(start: Standard_Transient, mess: string, orig?: string): void;

// Adds a Fail `Message` for an Entity from the Model If <start> is not an Entity from the model (e.g
AddFail(start: Standard_Transient, mess: string, orig?: string): void;

// Returns a Check given an Entity number (in the Model) by default a Global Check
CCheck(num: number): Interface_Check;
CCheck(start: Standard_Transient): Interface_Check;
CCheck(num: number): Interface_Check;
CCheck(start: Standard_Transient): Interface_Check;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A DispGlobal gathers all the input Entities into only one global Packet
IFSelect_DispGlobal: declare class IFSelect_DispGlobal extends IFSelect_Dispatch

constructor

// Returns as Label, "One File for all Input"
Label(): TCollection_AsciiString;

// Returns True
LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A DispPerCount gathers all the input Entities into one or several Packets, each containing a defined count of Entity This count is a Parameter of the DispPerCount, given as an IntParam, thus allowing external control of its Value
IFSelect_DispPerCount: declare class IFSelect_DispPerCount extends IFSelect_Dispatch

constructor

// Returns the effective value of the count parameter (if Count Parameter not Set or value not positive, returns 1)
CountValue(): number;

// Returns as Label, "One File per <count> Input Entities"
Label(): TCollection_AsciiString;

// Returns True, maximum count is given as <nbent>
LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A DispPerFiles produces a determined count of Packets from the input Entities
IFSelect_DispPerFiles: declare class IFSelect_DispPerFiles extends IFSelect_Dispatch

constructor

// Returns the effective value of the count parameter (if Count Parameter not Set or value not positive, returns 1)
CountValue(): number;

// Returns as Label, "Maximum <count> Files"
Label(): TCollection_AsciiString;

// Returns True, maximum count is given as CountValue
LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A DispPerOne gathers all the input Entities into as many Packets as there Root Entities from the Final Selection, that is, one Packet per Entity
IFSelect_DispPerOne: declare class IFSelect_DispPerOne extends IFSelect_Dispatch

constructor

// Returns as Label, "One File per Input Entity"
Label(): TCollection_AsciiString;

// Returns True, maximum limit is given as <nbent>
LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A DispPerSignature sorts input Entities according to a Signature
IFSelect_DispPerSignature: declare class IFSelect_DispPerSignature extends IFSelect_Dispatch

constructor

// Returns the SignCounter used for splitting
SignCounter(): IFSelect_SignCounter;

// Sets a SignCounter for sort Remark
SetSignCounter(sign: IFSelect_SignCounter): void;

// Returns the name of the SignCounter, which characterises the sorting criterium for this Dispatch
SignName(): string;

// Returns as Label, "One File per Signature <name>"
Label(): TCollection_AsciiString;

// Returns True, maximum count is given as <nbent>
LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class allows to describe how a set of Entities has to be dispatched into resulting Packets
IFSelect_Dispatch: declare class IFSelect_Dispatch extends Standard_Transient

// Sets a Root Name as an HAsciiString To reset it, give a Null Handle (then, a ShareOut will have to define the Default Root Name)
SetRootName(name: TCollection_HAsciiString): void;

// Returns True if a specific Root Name has been set (else, the Default Root Name has to be used)
HasRootName(): boolean;

// Returns the Root Name for files produced by this dispatch It is empty if it has not been set or if it has been reset
RootName(): TCollection_HAsciiString;

// Stores (or Changes) the Final Selection for a Dispatch
SetFinalSelection(sel: IFSelect_Selection): void;

// Returns the Final Selection of a Dispatch we 'd like
FinalSelection(): IFSelect_Selection;

// Returns True if a Dispatch can have a Remainder, i.e
CanHaveRemainder(): boolean;

// Returns True if a Dispatch generates a count of Packets always less than or equal to a maximum value
LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

// Returns a text which defines the way a Dispatch produces packets (which will become files) from its Input
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Controls access on Values by an Editor EditOptional
IFSelect_EditValue: typeof IFSelect_EditValue[keyof typeof IFSelect_EditValue]

// An Editor defines a set of values and a way to edit them, on an entity or on the model (e.g
IFSelect_Editor: declare class IFSelect_Editor extends Standard_Transient

// Sets a Typed Value for a given ident and short name, with an Edit Mode
SetValue(num: number, typval: Interface_TypedValue, shortname?: string, accessmode?: IFSelect_EditValue): void;

// Sets a parameter to be a List max < 0
SetList(num: number, max?: number): void;

// Returns the count of Typed Values
NbValues(): number;

// Returns a Typed Value from its ident
TypedValue(num: number): Interface_TypedValue;

// Tells if a parameter is a list
IsList(num: number): boolean;

// Returns max length allowed for a list = 0 means
MaxList(num: number): number;

// Returns the name of a Value (complete or short) from its ident Short Name can be empty
Name(num: number, isshort: boolean): string;

// Returns the edit mode of a Value
EditMode(num: number): IFSelect_EditValue;

// Returns the number (ident) of a Value, from its name, short or complete
NameNumber(name: string): number;

// Returns the MaxLength of, according to what
MaxNameLength(what: number): number;

// Returns the specific label
Label(): TCollection_AsciiString;

// Returns a ListEditor for a parameter which is a List Default returns a basic ListEditor for a List, a Null Handle if <num> is not for a List
ListEditor(num: number): IFSelect_ListEditor;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Functions gives access to all the actions which can be commanded with the resources provided by {@link IFSelect`IFSelect`}
IFSelect_Functions: declare class IFSelect_Functions

constructor

// Takes the name of an entity, either as argument, or (if <name> is empty) on keyboard, and returns the entity name can be a label or a number (in alphanumeric), it is searched by NumberFromLabel from WorkSession
static GiveEntity(WS: IFSelect_WorkSession, name?: string): Standard_Transient;

// Same as GetEntity, but returns the number in the model of the entity
static GiveEntityNumber(WS: IFSelect_WorkSession, name?: string): number;

// Computes a List of entities from a WorkSession and two idents, first and second, as follows
static GiveList(WS: IFSelect_WorkSession, first?: string, second?: string): NCollection_HSequence_handle_Standard_Transient;

// Evaluates and returns a Dispatch, from data of a WorkSession if <mode> is False, searches for exact name of Dispatch in WS Else (D), allows a parameter between brackets
static GiveDispatch(WS: IFSelect_WorkSession, name: string, mode?: boolean): IFSelect_Dispatch;

// Defines and loads all basic functions (as ActFunc)
static Init(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives a frame for Actions which modify the effect of a Dispatch, i.e
IFSelect_GeneralModifier: declare class IFSelect_GeneralModifier extends Standard_Transient

// Returns True if this modifier may change the graph of dependences (acknowledged at creation time)
MayChangeGraph(): boolean;

// Attaches to a Dispatch
SetDispatch(disp: IFSelect_Dispatch): void;

// Returns the Dispatch to be matched, Null if not set
Dispatch(): IFSelect_Dispatch;

// Returns True if a Model obtained from the Dispatch <disp> is to be treated (apart from the Selection criterium) If Dispatch(me) is Null, returns True
Applies(disp: IFSelect_Dispatch): boolean;

// Sets a Selection
SetSelection(sel: IFSelect_Selection): void;

// Resets the Selection
ResetSelection(): void;

// Returns True if a Selection is set as an additional criterium
HasSelection(): boolean;

// Returns the Selection, or a Null Handle if not set
Selection(): IFSelect_Selection;

// Returns a short text which defines the operation performed
Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A GraphCounter computes values to be sorted with the help of a Graph
IFSelect_GraphCounter: declare class IFSelect_GraphCounter extends IFSelect_SignCounter

constructor

// Returns the applied selection
Applied(): IFSelect_SelectDeduct;

// Sets a new applied selection
SetApplied(sel: IFSelect_SelectDeduct): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
