# libcascade — IFSelect (4)

11 top-level symbols. Signatures are verbatim typescript.

// A SessionPilot is intended to make easier the use of a WorkSession
IFSelect_SessionPilot: declare class IFSelect_SessionPilot extends IFSelect_Activator

constructor

// Returns the WorkSession which is worked on
Session(): IFSelect_WorkSession;

// Returns the WorKlibrary (Null if not set)
Library(): IFSelect_WorkLibrary;

// Returns the Record Mode for Commands
RecordMode(): boolean;

// Sets a WorkSession to be worked on
SetSession(WS: IFSelect_WorkSession): void;

// Sets a WorkLibrary
SetLibrary(WL: IFSelect_WorkLibrary): void;

// Changes the RecordMode
SetRecordMode(mode: boolean): void;

// Sets the value of the Command Line to be interpreted Also prepares the interpretation (splitting by blanks)
SetCommandLine(command: TCollection_AsciiString): void;

// Returns the Command Line to be interpreted
CommandLine(): TCollection_AsciiString;

// Returns the part of the command line which begins at argument <numarg> between 0 and NbWords-1 (by default, all the line) Empty string if out of range
CommandPart(numarg: number): string;

// Returns the count of words of the Command Line, separated by blanks
NbWords(): number;

// Returns a word given its rank in the Command Line
Word(num: number): TCollection_AsciiString;

// Returns a word given its rank, as a CString
Arg(num: number): string;

// Removes a word given its rank
RemoveWord(num: number): boolean;

// Returns the count of recorded Commands
NbCommands(): number;

// Returns a recorded Command, given its rank (from 1)
Command(num: number): TCollection_AsciiString;

// Allows to associate a Transient Value with the last execution as a partial result Returns RetDone if item is not Null, RetFail if item is Null Remark
RecordItem(item: Standard_Transient): IFSelect_ReturnStatus;

// Returns the Transient Object which was recorded with the current Line Command
RecordedItem(): Standard_Transient;

// Clears the recorded information (commands, objects)
Clear(): void;

// Reads commands from a Script File, named <file>
ReadScript(file?: string): IFSelect_ReturnStatus;

// Executes the Command, itself (for built-in commands, which have priority) or by using the list of Activators
Perform(): IFSelect_ReturnStatus;

// Executes the Commands, except that the command name (word 0) is aliased
ExecuteAlias(aliasname: TCollection_AsciiString): IFSelect_ReturnStatus;

// Sets the Command then tries to execute it
Execute(command: TCollection_AsciiString): IFSelect_ReturnStatus;

// Executes a Counter in a general way If <numword> is greater than count of command words, it counts all the model
ExecuteCounter(counter: IFSelect_SignCounter, numword: number, mode?: IFSelect_PrintCount): IFSelect_ReturnStatus;

// Interprets a string value as an entity number
Number(val: string): number;

// Processes specific commands, which are
Do(number\_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

// Help for specific commands (apart from general command help)
Help(number\_: number): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gathers the information required to produce one or several file(s) from the content of an InterfaceModel (passing through the creation of intermediate Models)
IFSelect_ShareOut: declare class IFSelect_ShareOut extends Standard_Transient

constructor

// Removes in one operation all the Dispatches with their Idents Also clears all information about Names, and all Results but naming information which are
Clear(onlydisp: boolean): void;

// Clears all data produced (apart from Dispatches, etc...) if <alsoname> is True, all is cleared
ClearResult(alsoname: boolean): void;

// Removes an item, which can be, either a Dispatch (removed from the list of Dispatches), or a GeneralModifier (removed from the list of Model Modifiers or from the list of File Modifiers according to its type)
RemoveItem(item: Standard_Transient): boolean;

// Returns the rank of last run item (ClearResult resets it to 0)
LastRun(): number;

// Records a new value for the rank of last run item
SetLastRun(last: number): void;

// Returns the count of Dispatches
NbDispatches(): number;

// Returns the Rank of a Dispatch, given its Value (Handle)
DispatchRank(disp: IFSelect_Dispatch): number;

// Returns a Dispatch, given its rank in the list
Dispatch(num: number): IFSelect_Dispatch;

// Adds a Dispatch to the list
AddDispatch(disp: IFSelect_Dispatch): void;

// Removes a Dispatch, given its rank in the list Returns True if done, False if rank is not between (LastRun + 1) and (NbDispatches)
RemoveDispatch(rank: number): boolean;

// Sets a Modifier to be applied on all Dispatches to be run If <modifier> is a ModelModifier, adds it to the list of Model Modifiers
AddModifier(modifier: IFSelect_GeneralModifier, atnum: number): void;
AddModifier(modifier: IFSelect_GeneralModifier, dispnum: number, atnum: number): void;
AddModifier(modifier: IFSelect_GeneralModifier, atnum: number): void;
AddModifier(modifier: IFSelect_GeneralModifier, dispnum: number, atnum: number): void;

// Adds a Modifier to the list of Modifiers
AddModif(modifier: IFSelect_GeneralModifier, formodel: boolean, atnum?: number): void;

// Returns count of Modifiers (which apply to complete Models)
NbModifiers(formodel: boolean): number;

// Returns a Modifier of the list, given its rank
GeneralModifier(formodel: boolean, num: number): IFSelect_GeneralModifier;

// Returns a Modifier of the list of Model Modifiers, duely casted
ModelModifier(num: number): IFSelect_Modifier;

// Gives the rank of a Modifier in the list, 0 if not in the list Model Modifiers if <modifier> is kind of ModelModifer, File Modifiers else
ModifierRank(modifier: IFSelect_GeneralModifier): number;

// Removes a Modifier, given it rank in the list
RemoveModifier(formodel: boolean, num: number): boolean;

// Changes the rank of a modifier in the list
ChangeModifierRank(formodel: boolean, befor: number, after: number): boolean;

// Attaches a Root Name to a Dispatch given its rank, as an HAsciiString (standard form)
SetRootName(num: number, name: TCollection_HAsciiString): boolean;

// Returns True if the Dispatch of rank <num> has an attached Root Name
HasRootName(num: number): boolean;

// Returns the Root bound to a Dispatch, given its rank Returns a Null Handle if not defined
RootName(num: number): TCollection_HAsciiString;

// Returns an integer value about a given root name
RootNumber(name: TCollection_HAsciiString): number;

// Defines or Changes the general Prefix (which is prepended to complete file name generated)
SetPrefix(pref: TCollection_HAsciiString): void;

// Defines or Changes the Default Root Name to a new value (which is used for dispatches which have no attached root name)
SetDefaultRootName(defrt: TCollection_HAsciiString): boolean;

// Defines or Changes the general Extension (which is appended to complete file name generated)
SetExtension(ext: TCollection_HAsciiString): void;

// Returns the general Prefix
Prefix(): TCollection_HAsciiString;

// Returns the Default Root Name
DefaultRootName(): TCollection_HAsciiString;

// Returns the general Extension
Extension(): TCollection_HAsciiString;

// Computes the complete file name for a Packet of a Dispatch, given Dispatch Number (Rank), Packet Number, and Count of Packets generated by this Dispatch (0 if unknown)
FileName(dnum: number, pnum: number, nbpack?: number): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class gives results computed from a ShareOut
IFSelect_ShareOutResult: declare class IFSelect_ShareOutResult

constructor

// Returns the ShareOut used to create the ShareOutResult if creation from a Dispatch, returns a Null Handle
ShareOut(): IFSelect_ShareOut;

// Erases computed data, in order to command a new Evaluation
Reset(): void;

// Evaluates the result of a ShareOut
Evaluate(): void;

// Returns the list of recorded Packets, under two modes
Packets(complete?: boolean): IFSelect_PacketList;

// Returns the total count of produced non empty packets (in out
NbPackets(): number;

// Prepares the iteration on the packets This method is called by Evaluate, but can be called anytime The iteration consists in taking each Dispatch of the ShareOut beginning by the first one, compute its packets, then iterate on these packets
Prepare(): void;

// Returns True if there is more packets in the current Dispatch, else if there is more Dispatch in the ShareOut
More(): boolean;

// Passes to the next Packet in the current Dispatch, or if there is none, to the next Dispatch in the ShareOut
Next(): void;

// Passes to the next Dispatch, regardless about remaining packets
NextDispatch(): void;

// Returns the current Dispatch
Dispatch(): IFSelect_Dispatch;

// Returns the Rank of the current Dispatch in the ShareOut Returns Zero if there is none (iteration finished)
DispatchRank(): number;

// Returns Number (rank) of current Packet in current Dispatch, and total count of Packets in current Dispatch, as arguments
PacketsInDispatch(numpack?: number, nbpacks?: number): { numpack: number; nbpacks: number };

// Returns the File Name which corresponds to current Packet (computed by ShareOut) If current Packet has no associated name (see ShareOut), the returned value is Null
FileName(): TCollection_AsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IFSelect_SignAncestor: declare class IFSelect_SignAncestor extends IFSelect_SignType

constructor

// Tells if the value for <ent> in <model> matches a text, with a criterium <exact>
Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This Signature returns the Category of an entity, as recorded in the model
IFSelect_SignCategory: declare class IFSelect_SignCategory extends IFSelect_Signature

constructor

// Returns the Signature for a Transient object, as its Category recorded in the model
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// SignCounter gives the frame to count signatures associated with entities, deducted from them
IFSelect_SignCounter: declare class IFSelect_SignCounter extends IFSelect_SignatureList

constructor

// Returns the Signature used to count entities
Signature(): IFSelect_Signature;

// Changes the control status
SetMap(withmap: boolean): void;

// Adds an entity by considering its signature, which is given by call to method AddSign Returns True if added, False if already in the map (and map control status set)
AddEntity(ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

// Adds an entity (already filtered by Map) with its signature
AddSign(ent: Standard_Transient, model: Interface_InterfaceModel): void;

// Adds a list of entities by adding each of the items
AddList(list: NCollection_HSequence_handle_Standard_Transient, model: Interface_InterfaceModel): void;

// Adds all the entities contained in a Model
AddModel(model: Interface_InterfaceModel): void;

// Sets a Selection as input
SetSelection(sel: IFSelect_Selection): void;

// Returns the selection, or a null Handle
Selection(): IFSelect_Selection;

// Changes the mode of working with the selection
SetSelMode(selmode: number): void;

// Returns the mode of working with the selection
SelMode(): number;

// Determines and returns the value of the signature for an entity as an HAsciiString
Sign(ent: Standard_Transient, model: Interface_InterfaceModel): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Multiple Signature
IFSelect_SignMultiple: declare class IFSelect_SignMultiple extends IFSelect_Signature

constructor

// Adds a Signature
Add(subsign: IFSelect_Signature, width?: number, maxi?: boolean): void;

// Concatenates the values of sub-signatures, with their tabulations
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

// Specialized Match Rule If <exact> is False, simply checks if at least one sub-item matches If <exact> is True, standard match with Value (i.e
Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This Signature returns the cdl Type of an entity, under two forms
IFSelect_SignType: declare class IFSelect_SignType extends IFSelect_Signature

constructor

// Returns the Signature for a Transient object, as its Dynamic Type, with or without package name, according starting option
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This Signature returns the Validity Status of an entity, as deducted from data in the model
IFSelect_SignValidity: declare class IFSelect_SignValidity extends IFSelect_Signature

constructor

// Returns the Signature for a Transient object, as a validity deducted from data (reports) stored in the model
static CVal(ent: Standard_Transient, model: Interface_InterfaceModel): string;

// Returns the Signature for a Transient object, as a validity deducted from data (reports) stored in the model Calls the class method CVal
Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Signature provides the basic service used by the classes SelectSignature and Counter (i.e
IFSelect_Signature: declare class IFSelect_Signature extends Interface_SignType

// Sets the information data to tell "integer cases" with possible min and max values To be called when creating
SetIntCase(hasmin: boolean, valmin: number, hasmax: boolean, valmax: number): void;

// Tells if this Signature gives integer values and returns values from SetIntCase if True
IsIntCase(hasmin?: boolean, valmin?: number, hasmax?: boolean, valmax?: number): { returnValue: boolean; hasmin: boolean; valmin: number; hasmax: boolean; valmax: number };

// Adds a possible case To be called when creating, IF the list of possible cases for Value is known when starting For instance, for CDL types, rather do not fill this, but for a specific enumeration (such as a status), can be used
AddCase(acase: string): void;

// Returns the predefined list of possible cases, filled by AddCase Null Handle if no predefined list (hence, to be counted) Useful to filter on really possible vase, for instance, or for a help
CaseList(): NCollection_HSequence_TCollection_AsciiString;

// Returns an identification of the Signature (a word), given at initialization time Returns the Signature for a Transient object
Name(): string;

// The label of a Signature uses its name as follow
Label(): TCollection_AsciiString;

// Tells if the value for <ent> in <model> matches a text, with a criterium <exact>
Matches(ent: Standard_Transient, model: Interface_InterfaceModel, text: TCollection_AsciiString, exact: boolean): boolean;

// Default procedure to tell if a value <val> matches a text with a criterium <exact>
static MatchValue(val: string, text: TCollection_AsciiString, exact: boolean): boolean;

// This procedure converts an Integer to a CString It is a convenient way when the value of a signature has the form of a simple integer value The value is to be used immediately (one buffer only, no copy)
static IntValue(val: number): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A SignatureList is given as result from a Counter (any kind) It gives access to a list of signatures, with counts, and optionally with list of corresponding entities
IFSelect_SignatureList: declare class IFSelect_SignatureList extends Standard_Transient

constructor

// Changes the record-list status
SetList(withlist: boolean): void;

// Returns modifiable the SignOnly Mode If False (D), the counter normally counts If True, the counting work is turned off, Add only fills the LastValue, which can be used as signature, when a counter works from data which are not available from a Signature
ModeSignOnly(): boolean;

Clear(): void;

// Adds an entity with its signature, i.e
Add(ent: Standard_Transient, sign: string): void;

// Returns the last value recorded by Add (only if SignMode set) Cleared by Clear or Init
LastValue(): string;

// Acknowledges the list in once
Init(name: string, count: NCollection_IndexedDataMap_TCollection_AsciiString_int, list: NCollection_IndexedDataMap_TCollection_AsciiString_handle_Standard_Transient, nbnuls: number): void;

// Returns the list of signatures, as a sequence of strings (but without their respective counts)
List(root?: string): NCollection_HSequence_handle_TCollection_HAsciiString;

// Returns True if the list of Entities is acknowledged, else the method Entities will always return a Null Handle
HasEntities(): boolean;

// Returns the count of null entities
NbNulls(): number;

// Returns the number of times a signature was counted, 0 if it has not been recorded at all
NbTimes(sign: string): number;

// Returns the list of entities attached to a signature It is empty if <sign> has not been recorded It is a Null Handle if the list of entities is not known
Entities(sign: string): NCollection_HSequence_handle_Standard_Transient;

// Defines a name for a SignatureList (used to print it)
SetName(name: string): void;

// Returns the recorded Name
Name(): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
