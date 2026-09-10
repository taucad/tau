# libcascade — Transfer (2)

3 top-level symbols. Signatures are verbatim typescript.

Transfer_ProcessForFinder: declare class Transfer_ProcessForFinder extends Standard_Transient

constructor

// Resets a TransferProcess as ready for a completely new work
Clear(): void;

// Rebuilds the Map and the roots to really remove Unbound items Because Unbind keeps the entity in place, even if not bound Hence, working by checking new items is meaningless if a formerly unbound item is rebound
Clean(): void;

// Resizes the Map as required (if a new reliable value has been determined)
Resize(nb: number): void;

// Defines an Actor, which is used for automatic Transfer If already defined, the new Actor is cumulated (see SetNext from Actor)
SetActor(actor: Transfer_ActorOfProcessForFinder): void;

// Returns the defined Actor
Actor(): Transfer_ActorOfProcessForFinder;

// Returns the Binder which is linked with a starting Object It can either bring a Result (Transfer done) or none (for a pre-binding)
Find(start: Transfer_Finder): Transfer_Binder;

// Returns True if a Result (whatever its form) is Bound with a starting Object
IsBound(start: Transfer_Finder): boolean;

// Returns True if the result of the transfer of an object is already used in other ones
IsAlreadyUsed(start: Transfer_Finder): boolean;

// Creates a Link a starting Object with a Binder
Bind(start: Transfer_Finder, binder: Transfer_Binder): void;

// Changes the Binder linked with a starting Object for its unitary transfer
Rebind(start: Transfer_Finder, binder: Transfer_Binder): void;

// Removes the Binder linked with a starting object If this Binder brings a non-empty Check, it is replaced by a VoidBinder
Unbind(start: Transfer_Finder): boolean;

// Returns a Binder for a starting entity, as follows
FindElseBind(start: Transfer_Finder): Transfer_Binder;

// Sets trace level used for outputting messages
SetTraceLevel(tracelev: number): void;

// Returns trace level used for outputting messages
TraceLevel(): number;

// New name for AddFail (Msg)
SendFail(start: Transfer_Finder, amsg: Message_Msg): void;

// New name for AddWarning (Msg)
SendWarning(start: Transfer_Finder, amsg: Message_Msg): void;

// Adds an information message Trace is filled if trace level is at least 3
SendMsg(start: Transfer_Finder, amsg: Message_Msg): void;

// Adds an Error message to a starting entity (to the check of its Binder of category 0, as a Fail) Adds an Error `Message` to a starting entity from the definition of a Msg (Original+Value)
AddFail(start: Transfer_Finder, mess: string, orig: string): void;
AddFail(start: Transfer_Finder, amsg: Message_Msg): void;
AddFail(start: Transfer_Finder, mess: string, orig: string): void;
AddFail(start: Transfer_Finder, amsg: Message_Msg): void;

// (other name of AddFail, maintained for compatibility)
AddError(start: Transfer_Finder, mess: string, orig?: string): void;

// Adds a Warning message to a starting entity (to the check of its Binder of category 0) Adds a Warning `Message` to a starting entity from the definition of a Msg (Original+Value)
AddWarning(start: Transfer_Finder, mess: string, orig: string): void;
AddWarning(start: Transfer_Finder, amsg: Message_Msg): void;
AddWarning(start: Transfer_Finder, mess: string, orig: string): void;
AddWarning(start: Transfer_Finder, amsg: Message_Msg): void;

Mend(start: Transfer_Finder, pref?: string): void;

// Returns the Check attached to a starting entity
Check(start: Transfer_Finder): Interface_Check;

// Binds a starting object with a Transient Result
BindTransient(start: Transfer_Finder, res: Standard_Transient): void;

// Returns the Result of the Transfer of an object <start> as a Transient Result
FindTransient(start: Transfer_Finder): Standard_Transient;

// Prepares an object <start> to be bound with several results
BindMultiple(start: Transfer_Finder): void;

// Adds an item to a list of results bound to a starting object
AddMultiple(start: Transfer_Finder, res: Standard_Transient): void;

// Searches for a transient result attached to a starting object, according to its type, by criterium IsKind(atype)
FindTypedTransient(start: Transfer_Finder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

// Searches for a transient result recorded in a Binder, whatever this Binder is recorded or not in <me>
GetTypedTransient(binder: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

// Returns the maximum possible value for Map Index (no result can be bound with a value greater than it)
NbMapped(): number;

// Returns the Starting Object bound to an Index,
Mapped(num: number): Transfer_Finder;

// Returns the Index value bound to a Starting Object, 0 if none
MapIndex(start: Transfer_Finder): number;

// Returns the Binder bound to an Index Considers a category number, by default 0
MapItem(num: number): Transfer_Binder;

// Declares <obj> (and its Result) as Root
SetRoot(start: Transfer_Finder): void;

// Enable (if <stat> True) or Disables (if <stat> False) Root Management
SetRootManagement(stat: boolean): void;

// Returns the count of recorded Roots
NbRoots(): number;

// Returns a Root Entity given its number in the list (1-NbRoots)
Root(num: number): Transfer_Finder;

// Returns the Binder bound with a Root Entity given its number Considers a category number, by default 0
RootItem(num: number): Transfer_Binder;

// Returns the index in the list of roots for a starting item, or 0 if it is not recorded as a root
RootIndex(start: Transfer_Finder): number;

// Returns Nesting Level of Transfers (managed by methods TranscriptWith & Co)
NestingLevel(): number;

// Resets Nesting Level of Transfers to Zero (Root Level), whatever its current value
ResetNestingLevel(): void;

// Tells if <start> has been recognized as good candidate for Transfer
Recognize(start: Transfer_Finder): boolean;

// Performs the Transfer of a Starting Object, by calling the method TransferProduct (see below)
Transferring(start: Transfer_Finder, theProgress?: Message_ProgressRange): Transfer_Binder;

// Same as Transferring but does not return the Binder
Transfer(start: Transfer_Finder, theProgress?: Message_ProgressRange): boolean;

// Allows controls if exceptions will be handled Transfer Operations <err> False
SetErrorHandle(err: boolean): void;

// Returns error handling flag
ErrorHandle(): boolean;

// Method called when trace is asked Calls PrintTrace to display information relevant for starting objects (which can be redefined) <level> is Nesting Level of Transfer (0 = root) <mode> controls the way the trace is done
StartTrace(binder: Transfer_Binder, start: Transfer_Finder, level: number, mode: number): void;

// Returns True if we are surely in a DeadLoop
IsLooping(alevel: number): boolean;

// Returns True if no check message is attached to a starting object
IsCheckListEmpty(start: Transfer_Finder, level: number, erronly: boolean): boolean;

// Removes Results attached to (== Unbinds) a given object and, according <level>
RemoveResult(start: Transfer_Finder, level: number, compute?: boolean): void;

// Computes a number to be associated to a starting object in a check or a check-list By default, returns 0
CheckNum(start: Transfer_Finder): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Manages Transfer of Transient Objects
Transfer_ProcessForTransient: declare class Transfer_ProcessForTransient extends Standard_Transient

constructor

// Resets a TransferProcess as ready for a completely new work
Clear(): void;

// Rebuilds the Map and the roots to really remove Unbound items Because Unbind keeps the entity in place, even if not bound Hence, working by checking new items is meaningless if a formerly unbound item is rebound
Clean(): void;

// Resizes the Map as required (if a new reliable value has been determined)
Resize(nb: number): void;

// Defines an Actor, which is used for automatic Transfer If already defined, the new Actor is cumulated (see SetNext from Actor)
SetActor(actor: Transfer_ActorOfProcessForTransient): void;

// Returns the defined Actor
Actor(): Transfer_ActorOfProcessForTransient;

// Returns the Binder which is linked with a starting Object It can either bring a Result (Transfer done) or none (for a pre-binding)
Find(start: Standard_Transient): Transfer_Binder;

// Returns True if a Result (whatever its form) is Bound with a starting Object
IsBound(start: Standard_Transient): boolean;

// Returns True if the result of the transfer of an object is already used in other ones
IsAlreadyUsed(start: Standard_Transient): boolean;

// Creates a Link a starting Object with a Binder
Bind(start: Standard_Transient, binder: Transfer_Binder): void;

// Changes the Binder linked with a starting Object for its unitary transfer
Rebind(start: Standard_Transient, binder: Transfer_Binder): void;

// Removes the Binder linked with a starting object If this Binder brings a non-empty Check, it is replaced by a VoidBinder
Unbind(start: Standard_Transient): boolean;

// Returns a Binder for a starting entity, as follows
FindElseBind(start: Standard_Transient): Transfer_Binder;

// Sets trace level used for outputting messages
SetTraceLevel(tracelev: number): void;

// Returns trace level used for outputting messages
TraceLevel(): number;

// New name for AddFail (Msg)
SendFail(start: Standard_Transient, amsg: Message_Msg): void;

// New name for AddWarning (Msg)
SendWarning(start: Standard_Transient, amsg: Message_Msg): void;

// Adds an information message Trace is filled if trace level is at least 3
SendMsg(start: Standard_Transient, amsg: Message_Msg): void;

// Adds an Error message to a starting entity (to the check of its Binder of category 0, as a Fail) Adds an Error `Message` to a starting entity from the definition of a Msg (Original+Value)
AddFail(start: Standard_Transient, mess: string, orig: string): void;
AddFail(start: Standard_Transient, amsg: Message_Msg): void;
AddFail(start: Standard_Transient, mess: string, orig: string): void;
AddFail(start: Standard_Transient, amsg: Message_Msg): void;

// (other name of AddFail, maintained for compatibility)
AddError(start: Standard_Transient, mess: string, orig?: string): void;

// Adds a Warning message to a starting entity (to the check of its Binder of category 0) Adds a Warning `Message` to a starting entity from the definition of a Msg (Original+Value)
AddWarning(start: Standard_Transient, mess: string, orig: string): void;
AddWarning(start: Standard_Transient, amsg: Message_Msg): void;
AddWarning(start: Standard_Transient, mess: string, orig: string): void;
AddWarning(start: Standard_Transient, amsg: Message_Msg): void;

Mend(start: Standard_Transient, pref?: string): void;

// Returns the Check attached to a starting entity
Check(start: Standard_Transient): Interface_Check;

// Binds a starting object with a Transient Result
BindTransient(start: Standard_Transient, res: Standard_Transient): void;

// Returns the Result of the Transfer of an object <start> as a Transient Result
FindTransient(start: Standard_Transient): Standard_Transient;

// Prepares an object <start> to be bound with several results
BindMultiple(start: Standard_Transient): void;

// Adds an item to a list of results bound to a starting object
AddMultiple(start: Standard_Transient, res: Standard_Transient): void;

// Searches for a transient result attached to a starting object, according to its type, by criterium IsKind(atype)
FindTypedTransient(start: Standard_Transient, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

// Searches for a transient result recorded in a Binder, whatever this Binder is recorded or not in <me>
GetTypedTransient(binder: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

// Returns the maximum possible value for Map Index (no result can be bound with a value greater than it)
NbMapped(): number;

// Returns the Starting Object bound to an Index,
Mapped(num: number): Standard_Transient;

// Returns the Index value bound to a Starting Object, 0 if none
MapIndex(start: Standard_Transient): number;

// Returns the Binder bound to an Index Considers a category number, by default 0
MapItem(num: number): Transfer_Binder;

// Declares <obj> (and its Result) as Root
SetRoot(start: Standard_Transient): void;

// Enable (if <stat> True) or Disables (if <stat> False) Root Management
SetRootManagement(stat: boolean): void;

// Returns the count of recorded Roots
NbRoots(): number;

// Returns a Root Entity given its number in the list (1-NbRoots)
Root(num: number): Standard_Transient;

// Returns the Binder bound with a Root Entity given its number Considers a category number, by default 0
RootItem(num: number): Transfer_Binder;

// Returns the index in the list of roots for a starting item, or 0 if it is not recorded as a root
RootIndex(start: Standard_Transient): number;

// Returns Nesting Level of Transfers (managed by methods TranscriptWith & Co)
NestingLevel(): number;

// Resets Nesting Level of Transfers to Zero (Root Level), whatever its current value
ResetNestingLevel(): void;

// Tells if <start> has been recognized as good candidate for Transfer
Recognize(start: Standard_Transient): boolean;

// Performs the Transfer of a Starting Object, by calling the method TransferProduct (see below)
Transferring(start: Standard_Transient, theProgress?: Message_ProgressRange): Transfer_Binder;

// Same as Transferring but does not return the Binder
Transfer(start: Standard_Transient, theProgress?: Message_ProgressRange): boolean;

// Allows controls if exceptions will be handled Transfer Operations <err> False
SetErrorHandle(err: boolean): void;

// Returns error handling flag
ErrorHandle(): boolean;

// Method called when trace is asked Calls PrintTrace to display information relevant for starting objects (which can be redefined) <level> is Nesting Level of Transfer (0 = root) <mode> controls the way the trace is done
StartTrace(binder: Transfer_Binder, start: Standard_Transient, level: number, mode: number): void;

// Returns True if we are surely in a DeadLoop
IsLooping(alevel: number): boolean;

// Returns True if no check message is attached to a starting object
IsCheckListEmpty(start: Standard_Transient, level: number, erronly: boolean): boolean;

// Removes Results attached to (== Unbinds) a given object and, according <level>
RemoveResult(start: Standard_Transient, level: number, compute?: boolean): void;

// Computes a number to be associated to a starting object in a check or a check-list By default, returns 0
CheckNum(start: Standard_Transient): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// ResultFromModel is used to store a final result stored in a TransientProcess, respectfully to its structuration in scopes by using a set of ResultFromTransient Hence, it can be regarded as a passive equivalent of the stored data in the TransientProcess, while an Iterator gives a flat view of it
Transfer_ResultFromModel: declare class Transfer_ResultFromModel extends Standard_Transient

constructor

// Sets starting Model
SetModel(model: Interface_InterfaceModel): void;

// Sets starting File Name
SetFileName(filename: string): void;

// Returns starting Model (null if not set)
Model(): Interface_InterfaceModel;

// Returns starting File Name (empty if not set)
FileName(): string;

// Fills from a TransientProcess, with the result attached to a starting entity
Fill(TP: Transfer_TransientProcess, ent: Standard_Transient): boolean;

// Clears some data attached to binders used by TransientProcess, which become useless once the transfer has been done, by calling Strip on its ResultFromTransient
Strip(mode: number): void;

// Fills back a TransientProcess from the structured set of binders
FillBack(TP: Transfer_TransientProcess): void;

// Returns True if a Result is recorded
HasResult(): boolean;

// Returns the main recorded ResultFromTransient, or a null
MainResult(): Transfer_ResultFromTransient;

// Sets a new value for the main recorded ResultFromTransient
SetMainResult(amain: Transfer_ResultFromTransient): void;

// Returns the label in starting model attached to main entity (updated by Fill or SetMainResult, if Model is known)
MainLabel(): string;

// Returns the label in starting model attached to main entity
MainNumber(): number;

// Searches for a key (starting entity) and returns its result Returns a null handle if not found
ResultFromKey(start: Standard_Transient): Transfer_ResultFromTransient;

// Internal method which returns the list of ResultFromTransient, according level (2:complete
Results(level: number): NCollection_HSequence_handle_Standard_Transient;

// Returns the list of recorded starting entities, ending by the root
TransferredList(level?: number): NCollection_HSequence_handle_Standard_Transient;

// Returns the list of starting entities to which a check status is attached
CheckedList(check: Interface_CheckStatus, result: boolean): NCollection_HSequence_handle_Standard_Transient;

// Returns the check status with corresponds to the content of this ResultFromModel
CheckStatus(): Interface_CheckStatus;

// Computes and records check status (see CheckStatus) Does not computes it if already done and <enforce> False
ComputeCheckStatus(enforce: boolean): Interface_CheckStatus;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
