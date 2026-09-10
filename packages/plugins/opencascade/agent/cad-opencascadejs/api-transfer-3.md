# libcascade — Transfer (3)

17 top-level symbols. Signatures are verbatim typescript.

// This class, in conjunction with ResultFromModel, allows to record the result of a transfer initially stored in a TransientProcess
Transfer_ResultFromTransient: declare class Transfer_ResultFromTransient extends Standard_Transient

constructor

// Sets starting entity
SetStart(start: Standard_Transient): void;

// Sets Binder (for result plus individual check)
SetBinder(binder: Transfer_Binder): void;

// Returns the starting entity
Start(): Standard_Transient;

// Returns the binder
Binder(): Transfer_Binder;

// Returns True if a result is recorded
HasResult(): boolean;

// Returns the check (or an empty one if no binder)
Check(): Interface_Check;

// Returns the check status
CheckStatus(): Interface_CheckStatus;

// Clears the list of (immediate) sub-results
ClearSubs(): void;

// Adds a sub-result
AddSubResult(sub: Transfer_ResultFromTransient): void;

// Returns the count of recorded sub-results
NbSubResults(): number;

// Returns a sub-result, given its rank
SubResult(num: number): Transfer_ResultFromTransient;

// Returns the ResultFromTransient attached to a given starting entity (the key)
ResultFromKey(key: Standard_Transient): Transfer_ResultFromTransient;

// This method is used by ResultFromModel to collate the list of ResultFromTransient, avoiding duplications with a map Remark
FillMap(map: NCollection_IndexedMap_handle_Standard_Transient): void;
// map: Mutated in place

// Fills from a TransientProcess, with the starting entity which must have been set before
Fill(TP: Transfer_TransientProcess): void;

// Clears some data attached to binders used by TransientProcess, which become useless once the transfer has been done
Strip(): void;

// Fills back a TransientProcess with definition of a ResultFromTransient, respectfully to its structuration in scopes
FillBack(TP: Transfer_TransientProcess): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An adapted instantiation of SimpleBinder for Transient Result, i.e
Transfer_SimpleBinderOfTransient: declare class Transfer_SimpleBinderOfTransient extends Transfer_Binder

constructor

// Returns the Effective (Dynamic) Type of the Result ({@link Standard_Transient`Standard_Transient`} if no Result is defined)
ResultType(): Standard_Type;

// Returns the Effective Name of (Dynamic) Type of the Result (void) if no result is defined
ResultTypeName(): string;

// Defines the Result
SetResult(res: Standard_Transient): void;

// Returns the defined Result, if there is one
Result(): Standard_Transient;

// Returns a transient result according to its type (IsKind) i.e
static GetTypedResult(bnd: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// execution status of an individual transfer (see Transcriptor)
Transfer_StatusExec: typeof Transfer_StatusExec[keyof typeof Transfer_StatusExec]

// result status of transferring an entity (see Transcriptor)
Transfer_StatusResult: typeof Transfer_StatusResult[keyof typeof Transfer_StatusResult]

Transfer_TransferDeadLoop: declare class Transfer_TransferDeadLoop extends Transfer_TransferFailure

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A TransferDispatch is aimed to dispatch Entities between two Interface Models, by default by copying them, as CopyTool, but with more capabilities of adapting
Transfer_TransferDispatch: declare class Transfer_TransferDispatch extends Interface_CopyTool

constructor

// Returns the content of Control Object, as a TransientProcess
TransientProcess(): Transfer_TransientProcess;

// Copies an Entity by calling the method Transferring from the TransferProcess
Copy(entfrom: Standard_Transient, mapped: boolean, errstat: boolean): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Transfer_TransferFailure: declare class Transfer_TransferFailure extends Interface_InterfaceError

constructor

// Returns the exception type name
ExceptionType(): string;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A TransferInput is a Tool which fills an InterfaceModel with the result of the Transfer of CasCade Objects, once determined The Result comes from a TransferProcess, either from Transient (the Complete Result is considered, it must contain only Transient Objects)
Transfer_TransferInput: declare class Transfer_TransferInput

constructor

// Fills an InterfaceModel with the Complete Result of a Transfer stored in a TransientProcess (Starting Objects are Transient) The complete result is exactly added to the model
FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel): void;
FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel): void;
FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;
FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;
FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel): void;
FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel): void;
FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;
FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;
FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel): void;
FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel): void;
FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;
FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;
FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel): void;
FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel): void;
FillModel(proc: Transfer_TransientProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;
FillModel(proc: Transfer_FinderProcess, amodel: Interface_InterfaceModel, proto: Interface_Protocol, roots: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an Iterator on the result of a Transfer Available for Normal Results or not (Erroneous Transfer) It gives several kinds of Information, and allows to consider various criteria (criteria are cumulative)
Transfer_TransferIterator: declare class Transfer_TransferIterator

constructor

// Adds a Binder to the iteration list (construction)
AddItem(atr: Transfer_Binder): void;

// Selects Items on the Type of Binder
SelectBinder(atype: Standard_Type, keep: boolean): void;

// Selects Items on the Type of Result
SelectResult(atype: Standard_Type, keep: boolean): void;

// Select Items according Unicity
SelectUnique(keep: boolean): void;

// Selects/Unselect (according to <keep> an item designated by its rank <num> in the list Used by sub-classes which have specific criteria
SelectItem(num: number, keep: boolean): void;

// Returns count of Binders to be iterated
Number(): number;

// Clears Iteration in progress, to allow it to be restarted
Start(): void;

// Returns True if there are other Items to iterate
More(): boolean;

// Sets Iteration to the next Item
Next(): void;

// Returns the current Binder
Value(): Transfer_Binder;

// Returns True if current Item brings a Result, Transient (Handle) or not or Multiple
HasResult(): boolean;

// Returns True if Current Item has a Unique Result
HasUniqueResult(): boolean;

// Returns the Type of the Result of the current Item, if Unique
ResultType(): Standard_Type;

// Returns True if the current Item has a Transient Unique Result (if yes, use TransientResult to get it)
HasTransientResult(): boolean;

// Returns the Transient Result of the current Item if there is (else, returns a null Handle) Supposes that Binding is done by a SimpleBinderOfTransient
TransientResult(): Standard_Transient;

// Returns Execution Status of current Binder Normal transfer corresponds to StatusDone
Status(): Transfer_StatusExec;

// Returns True if Fail Messages are recorded with the current Binder
HasFails(): boolean;

// Returns True if Warning Messages are recorded with the current Binder
HasWarnings(): boolean;

// Returns Check associated to current Binder (in case of error, it brings Fail messages) (in case of warnings, it brings Warning messages)
Check(): Interface_Check;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A TransferOutput is a Tool which manages the transfer of entities created by an Interface, stored in an InterfaceModel, into a set of Objects suitable for an Application Objects to be transferred are given, by method Transfer (which calls Transfer from TransientProcess) A default action is available to get all roots of the Model Result is given as a TransferIterator (see TransferProcess) Also, it is possible to pilot directly the TransientProcess
Transfer_TransferOutput: declare class Transfer_TransferOutput

constructor

// Returns the Starting Model
Model(): Interface_InterfaceModel;

// Returns the TransientProcess used to work
TransientProcess(): Transfer_TransientProcess;

// Transfer checks that all taken Entities come from the same Model, then calls Transfer from TransientProcess
Transfer(obj: Standard_Transient, theProgress?: Message_ProgressRange): void;

// Runs transfer on the roots of the Interface Model The Roots are computed with a ShareFlags created from a Protocol given as Argument
TransferRoots(protocol: Interface_Protocol, theProgress: Message_ProgressRange): void;
TransferRoots(theProgress: Message_ProgressRange): void;
TransferRoots(protocol: Interface_Protocol, theProgress: Message_ProgressRange): void;
TransferRoots(theProgress: Message_ProgressRange): void;

// Fills a Model with the list determined by ListForStatus This model starts from scratch (made by NewEmptyModel from the current Model), then is filled by AddWithRefs
ModelForStatus(protocol: Interface_Protocol, normal: boolean, roots?: boolean): Interface_InterfaceModel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This binder binds several (a list of) Transients with a starting entity, when this entity itself corresponds to a simple list of Transients
Transfer_TransientListBinder: declare class Transfer_TransientListBinder extends Transfer_Binder

constructor

// Returns True if a Binder has several results, either by itself or because it has next results Can be defined by sub-classes
IsMultiple(): boolean;

// Returns the Type which characterizes the Result (if known)
ResultType(): Standard_Type;

// Returns the Name of the Type which characterizes the Result Can be returned even if ResultType itself is unknown
ResultTypeName(): string;

// Adds an item to the result list
AddResult(res: Standard_Transient): void;
AddResult(next: Transfer_Binder): void;
AddResult(res: Standard_Transient): void;
AddResult(next: Transfer_Binder): void;

Result(): NCollection_HSequence_handle_Standard_Transient;

// Changes an already defined sub-result
SetResult(num: number, res: Standard_Transient): void;

NbTransients(): number;

Transient(num: number): Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Transfer_TransientMapper: declare class Transfer_TransientMapper extends Transfer_Finder

constructor

// Returns the contained value
Value(): Standard_Transient;

// Specific testof equality
Equates(other: Transfer_Finder): boolean;

// Returns the Type of the Value
ValueType(): Standard_Type;

// Returns the name of the Type of the Value
ValueTypeName(): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Adds specific features to the generic definition
Transfer_TransientProcess: declare class Transfer_TransientProcess extends Transfer_ProcessForTransient

constructor

// Sets an InterfaceModel, used by StartTrace, CheckList, queries on Integrity, to give information significant for each norm
SetModel(model: Interface_InterfaceModel): void;

// Returns the Model used for StartTrace
Model(): Interface_InterfaceModel;

HasGraph(): boolean;

// Sets a Context
SetContext(name: string, ctx: Standard_Transient): void;

// Returns the Context attached to a name, if set and if it is Kind of the type, else a Null Handle Returns True if OK, False if no Context
GetContext(name: string, type\_: Standard_Type): { returnValue: boolean; ctx: Standard_Transient; [Symbol.dispose](): void };

// Returns (modifiable) the whole definition of Context Rather for internal use (ex.
Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

// Specific number of a starting object for check-list
CheckNum(start: Standard_Transient): number;

// Tells if an entity is well loaded from file (even if its data fail on checking, they are present)
IsDataLoaded(ent: Standard_Transient): boolean;

// Tells if an entity fails on data checking (load time, syntactic, or semantic check)
IsDataFail(ent: Standard_Transient): boolean;

RootsForTransfer(): NCollection_HSequence_handle_Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// used on processing Undefined Entities (see TransferOutput)
Transfer_UndefMode: typeof Transfer_UndefMode[keyof typeof Transfer_UndefMode]

// a VoidBinder is used to bind a starting item with a status, error or warning messages, but no result It is interpreted by TransferProcess, which admits a VoidBinder to be over-written, and copies its check to the new Binder
Transfer_VoidBinder: declare class Transfer_VoidBinder extends Transfer_Binder

constructor

// while a VoidBinder admits no Result, its ResultType returns the type of <me>
ResultType(): Standard_Type;

// Returns "(void)"
ResultTypeName(): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Transfer_HSequenceOfFinder: NCollection_HSequence_handle_Transfer_Finder

Transfer_SequenceOfFinder: NCollection_Sequence_handle_Transfer_Finder
