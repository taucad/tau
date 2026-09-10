# libcascade — Interface

12 top-level symbols. Signatures are verbatim typescript.

// A bit map simply allows to associate a boolean flag to each item of a list, such as a list of entities, etc..
Interface_BitMap: declare class Interface_BitMap

constructor

// Initialize empty bit by <nbitems> items One flag is defined, n0 0 <resflags> prepares allocation for <resflags> more flags Flags values start at false
Initialize(nbitems: number, resflags: number): void;
Initialize(other: Interface_BitMap, copied: boolean): void;
Initialize(nbitems: number, resflags: number): void;
Initialize(other: Interface_BitMap, copied: boolean): void;

// Reservates for a count of more flags
Reservate(moreflags: number): void;

// Sets for a new count of items, which can be either less or greater than the former one For new items, their flags start at false
SetLength(nbitems: number): void;

// Adds a flag, a name can be attached to it Returns its flag number Makes required reservation
AddFlag(name?: string): number;

// Adds several flags (<more>) with no name Returns the number of last added flag
AddSomeFlags(more: number): number;

// Removes a flag given its number
RemoveFlag(num: number): boolean;

// Sets a name for a flag, given its number name can be empty (to erase the name of a flag) Returns True if done, false if
SetFlagName(num: number, name: string): boolean;

// Returns the count of flags (flag 0 not included)
NbFlags(): number;

// Returns the count of items (i.e
Length(): number;

// Returns the name recorded for a flag, or an empty string
FlagName(num: number): string;

// Returns the number or a flag given its name, or zero
FlagNumber(name: string): number;

// Returns the value (true/false) of a flag, from
Value(item: number, flag?: number): boolean;

// Sets a new value for a flag
SetValue(item: number, val: boolean, flag?: number): void;

// Sets a flag to True
SetTrue(item: number, flag?: number): void;

// Sets a flag to False
SetFalse(item: number, flag?: number): void;

// Returns the former value for a flag and sets it to True (before
CTrue(item: number, flag?: number): boolean;

// Returns the former value for a flag and sets it to False (before
CFalse(item: number, flag?: number): boolean;

// Initialises all the values of Flag Number <flag> to a given value <val>
Init(val: boolean, flag?: number): void;

// Clear all field of bit map
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class manages categories A category is defined by a name and a number, and can be seen as a way of rough classification, i.e
Interface_Category: declare class Interface_Category

constructor

// Sets/Changes Protocol
SetProtocol(theProtocol: Interface_Protocol): void;

// Determines the Category Number for an entity in its context, by using general service CategoryNumber
CatNum(theEnt: Standard_Transient, theShares: Interface_ShareTool): number;

// Clears the recorded list of category numbers for a Model
ClearNums(): void;

// Computes the Category Number for each entity and records it, in an array (ent.number -> category number) Hence, it can be queried by the method Num
Compute(theModel: Interface_InterfaceModel, theShares: Interface_ShareTool): void;

// Returns the category number recorded for an entity number Returns 0 if out of range
Num(theNumEnt: number): number;

// Records a new Category defined by its names, produces a number New if not yet recorded
static AddCategory(theName: string): number;

// Returns the count of recorded categories
static NbCategories(): number;

// Returns the name of a category, according to its number
static Name(theNum: number): string;

// Returns the number of a category, according to its name
static Number(theName: string): number;

// Default initialisation (protected against several calls
static Init(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a Check, as a list of Fail or Warning Messages under a literal form, which can be empty
Interface_Check: declare class Interface_Check extends Standard_Transient

constructor

// New name for AddFail (Msg)
SendFail(amsg: Message_Msg): void;

// Records a new Fail message
AddFail(amess: TCollection_HAsciiString): void;
AddFail(amsg: Message_Msg): void;
AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
AddFail(amess: string, orig: string): void;
AddFail(amess: TCollection_HAsciiString): void;
AddFail(amsg: Message_Msg): void;
AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
AddFail(amess: string, orig: string): void;
AddFail(amess: TCollection_HAsciiString): void;
AddFail(amsg: Message_Msg): void;
AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
AddFail(amess: string, orig: string): void;
AddFail(amess: TCollection_HAsciiString): void;
AddFail(amsg: Message_Msg): void;
AddFail(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
AddFail(amess: string, orig: string): void;

// Returns True if Check brings at least one Fail `Message`
HasFailed(): boolean;

// Returns count of recorded Fails
NbFails(): number;

// Returns Fail `Message` as a String Final form by default, Original form if <final> is False
Fail(num: number, final?: boolean): TCollection_HAsciiString;

// Same as above, but returns a CString (to be printed ...) Final form by default, Original form if <final> is False
CFail(num: number, final: boolean): string;

// Returns the list of Fails, for a frontal-engine logic Final forms by default, Original forms if <final> is False Can be empty
Fails(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

// New name for AddWarning
SendWarning(amsg: Message_Msg): void;

// Records a new Warning message
AddWarning(amess: TCollection_HAsciiString): void;
AddWarning(amsg: Message_Msg): void;
AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
AddWarning(amess: string, orig: string): void;
AddWarning(amess: TCollection_HAsciiString): void;
AddWarning(amsg: Message_Msg): void;
AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
AddWarning(amess: string, orig: string): void;
AddWarning(amess: TCollection_HAsciiString): void;
AddWarning(amsg: Message_Msg): void;
AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
AddWarning(amess: string, orig: string): void;
AddWarning(amess: TCollection_HAsciiString): void;
AddWarning(amsg: Message_Msg): void;
AddWarning(amess: TCollection_HAsciiString, orig: TCollection_HAsciiString): void;
AddWarning(amess: string, orig: string): void;

// Returns True if Check brings at least one Warning `Message`
HasWarnings(): boolean;

// Returns count of recorded Warning messages
NbWarnings(): number;

// Returns Warning message as a String Final form by default, Original form if <final> is False
Warning(num: number, final?: boolean): TCollection_HAsciiString;

// Same as above, but returns a CString (to be printed ...) Final form by default, Original form if <final> is False
CWarning(num: number, final: boolean): string;

// Returns the list of Warnings, for a frontal-engine logic Final forms by default, Original forms if <final> is False Can be empty
Warnings(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

// Records an information message This does not change the status of the Check
SendMsg(amsg: Message_Msg): void;

// Returns the count of recorded information messages
NbInfoMsgs(): number;

// Returns information message as a String
InfoMsg(num: number, final?: boolean): TCollection_HAsciiString;

// Same as above, but returns a CString (to be printed ...) Final form by default, Original form if <final> is False
CInfoMsg(num: number, final: boolean): string;

// Returns the list of Info Msg, for a frontal-engine logic Final forms by default, Original forms if <final> is False Can be empty
InfoMsgs(final?: boolean): NCollection_HSequence_handle_TCollection_HAsciiString;

// Returns the Check Status
Status(): Interface_CheckStatus;

// Tells if Check Status complies with a given one (i.e
Complies(status: Interface_CheckStatus): boolean;
Complies(mess: TCollection_HAsciiString, incl: number, status: Interface_CheckStatus): boolean;
Complies(status: Interface_CheckStatus): boolean;
Complies(mess: TCollection_HAsciiString, incl: number, status: Interface_CheckStatus): boolean;

// Returns True if a Check is devoted to an entity
HasEntity(): boolean;

// Returns the entity on which the Check has been defined
Entity(): Standard_Transient;

// Clears a check, in order to receive information from transfer (Messages and Entity)
Clear(): void;

// Clears the Fail Messages (for instance to keep only Warnings)
ClearFails(): void;

// Clears the Warning Messages (for instance to keep only Fails)
ClearWarnings(): void;

// Clears the Info Messages
ClearInfoMsgs(): void;

// Removes the messages which comply with <mess>, as follows
Remove(mess: TCollection_HAsciiString, incl: number, status: Interface_CheckStatus): boolean;

// Mends messages, according <pref> and <num> According to <num>, works on the whole list of Fails if = 0(D) or only one Fail message, given its rank If <pref> is empty, converts Fail(s) to Warning(s) Else, does the conversion but prefixes the new Warning(s) but <pref> followed by a semi-column Some reserved values of <pref> are
Mend(pref: string, num?: number): boolean;

// Receives an entity result of a Transfer
SetEntity(anentity: Standard_Transient): void;

// same as SetEntity (old form kept for compatibility) Warning
GetEntity(anentity: Standard_Transient): void;

// Copies messages stored in another Check, cumulating Does not regard other's Entity
GetMessages(other: Interface_Check): void;

// Copies messages converted into Warning messages If failsonly is true, only Fails are taken, and converted else, Warnings are taken too
GetAsWarning(other: Interface_Check, failsonly: boolean): void;

// Prints the messages of the check to the default trace file By default, according to the default standard level Else, according level (see method Print)
Trace(level?: number, final?: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Interface_CheckFailure: declare class Interface_CheckFailure extends Interface_InterfaceError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Result of a Check operation (especially from InterfaceModel)
Interface_CheckIterator: declare class Interface_CheckIterator

constructor

// Sets / Changes the name
SetName(name: string): void;

// Returns the recorded name (can be empty)
Name(): string;

// Defines a Model, used to locate entities (not required, if it is absent, entities are simply less documented)
SetModel(model: Interface_InterfaceModel): void;

// Returns the stored model (can be a null handle)
Model(): Interface_InterfaceModel;

// Clears the list of checks
Clear(): void;

// Adds a Check to the list to be iterated This Check is Accompanied by Entity Number in the Model (0 for Global Check or Entity unknown in the Model), if 0 and Model is recorded in <me>, it is computed
Add(ach: Interface_Check, num?: number): void;

// Returns the Check which was attached to an Entity given its Number in the Model
Check(num: number): Interface_Check;
Check(ent: Standard_Transient): Interface_Check;
Check(num: number): Interface_Check;
Check(ent: Standard_Transient): Interface_Check;

// Returns the Check bound to an Entity Number (0
CCheck(num: number): Interface_Check;
CCheck(ent: Standard_Transient): Interface_Check;
CCheck(num: number): Interface_Check;
CCheck(ent: Standard_Transient): Interface_Check;

// Returns True if
IsEmpty(failsonly: boolean): boolean;

// Returns worst status among
Status(): Interface_CheckStatus;

// Tells if this check list complies with a given status
Complies(status: Interface_CheckStatus): boolean;

// Removes the messages of all Checks, under these conditions
Remove(mess: string, incl: number, status: Interface_CheckStatus): boolean;

// Returns the list of entities concerned by a Check Only fails if <failsonly> is True, else all non-empty checks If <global> is true, adds the model for a global check Else, global check is ignored
Checkeds(failsonly: boolean, global: boolean): NCollection_HSequence_handle_Standard_Transient;

// Starts Iteration
Start(): void;

// Returns True if there are more Checks to get
More(): boolean;

// Sets Iteration to next Item
Next(): void;

// Returns Check currently Iterated It brings all other information (status, messages, ...) The Number of the Entity in the Model is given by Number below
Value(): Interface_Check;

// Returns Number of Entity for the Check currently iterated or 0 for GlobalCheck
Number(): number;

// Clears data of iteration
Destroy(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Classifies checks OK
Interface_CheckStatus: typeof Interface_CheckStatus[keyof typeof Interface_CheckStatus]

// Performs Checks on Entities, using General Service Library and Modules to work
Interface_CheckTool: declare class Interface_CheckTool

constructor

// Fills as required a Check with the Error and Warning messages produced by Checking a given Entity
FillCheck(ent: Standard_Transient, sh: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

// Returns the Check associated to an Entity identified by its Number in a Model
Check(num: number): Interface_Check;

// Checks if any Error has been detected (CheckList not empty) Returns normally if none, raises exception if some exists
CheckSuccess(reset?: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This deferred class describes the services required by CopyTool to work
Interface_CopyControl: declare class Interface_CopyControl extends Standard_Transient

// Clears List of Copy Results
Clear(): void;

// Bind a Result to a Starting Entity identified by its Number
Bind(ent: Standard_Transient, res: Standard_Transient): void;

// Searches for the Result bound to a Startingf Entity identified by its Number
Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Manages a Map for the need of single Transfers, such as Copies In such transfer, Starting Entities are read from a unique Starting Model, and each transferred Entity is bound to one and only one Result, which cannot be changed later
Interface_CopyMap: declare class Interface_CopyMap extends Interface_CopyControl

constructor

// Clears Transfer List
Clear(): void;

// Returns the InterfaceModel used at Creation time
Model(): Interface_InterfaceModel;

// Binds a Starting Entity identified by its Number <num> in the Starting Model, to a Result of Transfer <res>
Bind(ent: Standard_Transient, res: Standard_Transient): void;

// Search for the result of a Starting Object (i.e
Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Performs Deep Copies of sets of Entities Allows to perform Copy of Interface Entities from a Model to another one
Interface_CopyTool: declare class Interface_CopyTool

constructor

// Returns the Model on which the CopyTool works
Model(): Interface_InterfaceModel;

// Changes the Map of Result for another one
SetControl(othermap: Interface_CopyControl): void;

// Returns the object used for Control
Control(): Interface_CopyControl;

// Clears Transfer List
Clear(): void;

// Creates the CounterPart of an Entity (by ShallowCopy), Binds it, then Copies the content of the former Entity to the other one (same Type), by call to the General Service Library It may command the Copy of Referenced Entities Then, its returns True
Copy(entfrom: Standard_Transient, mapped: boolean, errstat: boolean): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Transfers one Entity, if not yet bound to a result Remark
Transferred(ent: Standard_Transient): Standard_Transient;

// Defines a Result for the Transfer of a Starting object
Bind(ent: Standard_Transient, res: Standard_Transient): void;

// Search for the result of a Starting Object (i.e
Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

// Clears LastFlags only
ClearLastFlags(): void;

// Returns an copied Entity and its Result which were operated after last call to ClearLastFlags
LastCopiedAfter(numfrom: number): { returnValue: number; ent: Standard_Transient; res: Standard_Transient; [Symbol.dispose](): void };

// Transfers one Entity and records result into the Transfer List Calls method Transferred
TransferEntity(ent: Standard_Transient): void;

// Renews the Implied References
RenewImpliedRefs(): void;

// Fills a Model with the result of the transfer (TransferList) Commands copy of Header too, and calls RenewImpliedRefs
FillModel(bmodel: Interface_InterfaceModel): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// validity state of anentity's content (see InterfaceModel)
Interface_DataState: typeof Interface_DataState[keyof typeof Interface_DataState]

// Auxiliary class for EntityList
Interface_EntityCluster: declare class Interface_EntityCluster extends Standard_Transient

constructor

// Appends an Entity to the Cluster
Append(ent: Standard_Transient): void;

// Removes an Entity from the Cluster
Remove(ent: Standard_Transient): boolean;
Remove(num: number): boolean;
Remove(ent: Standard_Transient): boolean;
Remove(num: number): boolean;

// Returns total count of Entities (including Next)
NbEntities(): number;

// Returns the Entity identified by its rank in the list (including Next)
Value(num: number): Standard_Transient;

// Changes an Entity given its rank
SetValue(num: number, ent: Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
