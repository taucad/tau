# libcascade — TFunction

11 top-level symbols. Signatures are verbatim typescript.

// This driver class provide services around function execution
TFunction_Driver: declare class TFunction_Driver extends Standard_Transient

// Initializes the label L for this function prior to its execution
Init(L: TDF_Label): void;

// Returns the label of the driver for this function
Label(): TDF_Label;

// Validates labels of a function in <log>
Validate(log: TFunction_Logbook): void;

// Analyzes the labels in the logbook log
MustExecute(log: TFunction_Logbook): boolean;

// Executes the function in this function driver and puts the impacted labels in the logbook log
Execute(): { returnValue: number; log: TFunction_Logbook; [Symbol.dispose](): void };

// The method fills-in the list by labels, where the arguments of the function are located
Arguments(args: NCollection_List_TDF_Label): void;
// args: Mutated in place

// The method fills-in the list by labels, where the results of the function are located
Results(res: NCollection_List_TDF_Label): void;
// res: Mutated in place

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A container for instances of drivers
TFunction_DriverTable: declare class TFunction_DriverTable extends Standard_Transient

constructor

// Returns the driver table
static Get(): TFunction_DriverTable;

// Returns true if the driver has been added successfully to the driver table
AddDriver(guid: Standard_GUID, driver: TFunction_Driver, thread?: number): boolean;

// Returns true if the driver exists in the driver table
HasDriver(guid: Standard_GUID, thread?: number): boolean;

// Returns true if the driver was found
FindDriver(guid: Standard_GUID, thread: number): { returnValue: boolean; driver: TFunction_Driver; [Symbol.dispose](): void };

// Removes a driver with the given GUID
RemoveDriver(guid: Standard_GUID, thread?: number): boolean;

// Removes all drivers
Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TFunction_ExecutionStatus: typeof TFunction_ExecutionStatus[keyof typeof TFunction_ExecutionStatus]

// Provides the following two services
TFunction_Function: declare class TFunction_Function extends TDF_Attribute

constructor

// **Static methods:**
static Set(L: TDF_Label): TFunction_Function;
static Set(L: TDF_Label, DriverID: Standard_GUID): TFunction_Function;
static Set(L: TDF_Label): TFunction_Function;
static Set(L: TDF_Label, DriverID: Standard_GUID): TFunction_Function;

// Returns the GUID for functions
static GetID(): Standard_GUID;

// Returns the GUID for this function's driver
GetDriverGUID(): Standard_GUID;

// Sets the driver for this function as that identified by the GUID guid
SetDriverGUID(guid: Standard_GUID): void;

// Returns true if the execution failed
Failed(): boolean;

// Sets the failed index
SetFailure(mode?: number): void;

// Returns an index of failure if the execution of this function failed
GetFailure(): number;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides links between functions
TFunction_GraphNode: declare class TFunction_GraphNode extends TDF_Attribute

constructor

// **Static methods**
static Set(L: TDF_Label): TFunction_GraphNode;

// Returns the GUID for GraphNode attribute
static GetID(): Standard_GUID;

// Defines a reference to the function as a previous one
AddPrevious(funcID: number): boolean;
AddPrevious(func: TDF_Label): boolean;
AddPrevious(funcID: number): boolean;
AddPrevious(func: TDF_Label): boolean;

// Removes a reference to the function as a previous one
RemovePrevious(funcID: number): boolean;
RemovePrevious(func: TDF_Label): boolean;
RemovePrevious(funcID: number): boolean;
RemovePrevious(func: TDF_Label): boolean;

// Returns a map of previous functions
GetPrevious(): NCollection_Map_int;

// Clears a map of previous functions
RemoveAllPrevious(): void;

// Defines a reference to the function as a next one
AddNext(funcID: number): boolean;
AddNext(func: TDF_Label): boolean;
AddNext(funcID: number): boolean;
AddNext(func: TDF_Label): boolean;

// Removes a reference to the function as a next one
RemoveNext(funcID: number): boolean;
RemoveNext(func: TDF_Label): boolean;
RemoveNext(funcID: number): boolean;
RemoveNext(func: TDF_Label): boolean;

// Returns a map of next functions
GetNext(): NCollection_Map_int;

// Clears a map of next functions
RemoveAllNext(): void;

// Returns the execution status of the function
GetStatus(): TFunction_ExecutionStatus;

// Defines an execution status for a function
SetStatus(status: TFunction_ExecutionStatus): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Adds the first level referenced attributes and labels to <aDataSet>
References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface class for usage of Function Mechanism
TFunction_IFunction: declare class TFunction_IFunction

constructor

// Sets a new function attached to a label <L> with <ID>
static NewFunction(L: TDF_Label, ID: Standard_GUID): boolean;

// Deletes a function attached to a label <L>
static DeleteFunction(L: TDF_Label): boolean;

// Updates dependencies for all functions of the scope
static UpdateDependencies(Access: TDF_Label): boolean;
UpdateDependencies(): boolean;

// Initializes the interface by the label of function
Init(L: TDF_Label): void;

// Returns a label of the function
Label(): TDF_Label;

// The method fills-in the list by labels, where the arguments of the function are located
Arguments(args: NCollection_List_TDF_Label): void;
// args: Mutated in place

// The method fills-in the list by labels, where the results of the function are located
Results(res: NCollection_List_TDF_Label): void;
// res: Mutated in place

// Returns a list of previous functions
GetPrevious(prev: NCollection_List_TDF_Label): void;
// prev: Mutated in place

// Returns a list of next functions
GetNext(prev: NCollection_List_TDF_Label): void;
// prev: Mutated in place

// Returns the execution status of the function
GetStatus(): TFunction_ExecutionStatus;

// Defines an execution status for a function
SetStatus(status: TFunction_ExecutionStatus): void;

// Returns the scope of all functions
GetAllFunctions(): NCollection_DoubleMap_int_TDF_Label;

// Returns the Logbook - keeper of modifications
GetLogbook(): TFunction_Logbook;

// Returns a driver of the function
GetDriver(thread?: number): TFunction_Driver;

// Returns a graph node of the function
GetGraphNode(): TFunction_GraphNode;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterator of the graph of functions
TFunction_Iterator: declare class TFunction_Iterator

constructor

// Initializes the Iterator
Init(Access: TDF_Label): void;

// Defines the mode of iteration - usage or not of the execution status
SetUsageOfExecutionStatus(usage: boolean): void;

// Returns usage of execution status by the iterator
GetUsageOfExecutionStatus(): boolean;

// Analyses the graph of dependencies and returns maximum number of threads may be used to calculate the model
GetMaxNbThreads(): number;

// Returns the current list of functions
Current(): NCollection_List_TDF_Label;

// Returns false if the graph of functions is fully iterated
More(): boolean;

// Switches the iterator to the next list of current functions
Next(): void;

// A help-function aimed to help the user to check the status of retrurned function
GetStatus(func: TDF_Label): TFunction_ExecutionStatus;

// A help-function aimed to help the user to change the execution status of a function
SetStatus(func: TDF_Label, status: TFunction_ExecutionStatus): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class contains information which is written and read during the solving process
TFunction_Logbook: declare class TFunction_Logbook extends TDF_Attribute

constructor

// Finds or Creates a {@link TFunction_Logbook`TFunction_Logbook`} attribute at the root label accessed by <Access>
static Set(Access: TDF_Label): TFunction_Logbook;

// Returns the GUID for logbook attribute
static GetID(): Standard_GUID;

// Clears this logbook to its default, empty state
Clear(): void;

IsEmpty(): boolean;

// Sets the label L as a touched label in this logbook
SetTouched(L: TDF_Label): void;

// Sets the label L as an impacted label in this logbook
SetImpacted(L: TDF_Label, WithChildren?: boolean): void;

// Sets the label L as a valid label in this logbook
SetValid(L: TDF_Label, WithChildren: boolean): void;
SetValid(Ls: NCollection_Map_TDF_Label): void;
SetValid(L: TDF_Label, WithChildren: boolean): void;
SetValid(Ls: NCollection_Map_TDF_Label): void;

// Returns True if the label L is touched or impacted
IsModified(L: TDF_Label, WithChildren?: boolean): boolean;

// Returns the map of touched labels in this logbook
GetTouched(): NCollection_Map_TDF_Label;

// Returns the map of impacted labels contained in this logbook
GetImpacted(): NCollection_Map_TDF_Label;

// Returns the map of valid labels in this logbook
GetValid(): NCollection_Map_TDF_Label;
GetValid(Ls: NCollection_Map_TDF_Label): void;
GetValid(): NCollection_Map_TDF_Label;
GetValid(Ls: NCollection_Map_TDF_Label): void;

// Sets status of execution
Done(status: boolean): void;

// Returns status of execution
IsDone(): boolean;

// The methods inherited from {@link TDF_Attribute`TDF_Attribute`}
ID(): Standard_GUID;

// Undos (and redos) the attribute
Restore(anAttribute: TDF_Attribute): void;

// Pastes the attribute to another label
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Returns a new empty instance of the attribute
NewEmpty(): TDF_Attribute;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Keeps a scope of functions
TFunction_Scope: declare class TFunction_Scope extends TDF_Attribute

constructor

// **Static methods**
static Set(Access: TDF_Label): TFunction_Scope;

// Returns the GUID for Scope attribute
static GetID(): Standard_GUID;

// Adds a function to the scope of functions
AddFunction(L: TDF_Label): boolean;

// Removes a function from the scope of functions
RemoveFunction(L: TDF_Label): boolean;
RemoveFunction(ID: number): boolean;
RemoveFunction(L: TDF_Label): boolean;
RemoveFunction(ID: number): boolean;

// Removes all functions from the scope of functions
RemoveAllFunctions(): void;

// Returns true if the function exists with such an ID
HasFunction(ID: number): boolean;
HasFunction(L: TDF_Label): boolean;
HasFunction(ID: number): boolean;
HasFunction(L: TDF_Label): boolean;

// Returns an ID of the function
GetFunction(L: TDF_Label): number;
GetFunction(ID: number): TDF_Label;
GetFunction(L: TDF_Label): number;
GetFunction(ID: number): TDF_Label;

// Returns the Logbook used in {@link TFunction_Driver`TFunction_Driver`} methods
GetLogbook(): TFunction_Logbook;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Returns the scope of functions
GetFunctions(): NCollection_DoubleMap_int_TDF_Label;

// Returns the scope of functions for modification
ChangeFunctions(): NCollection_DoubleMap_int_TDF_Label;

SetFreeID(ID: number): void;

GetFreeID(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

TFunction_Array1OfDataMapOfGUIDDriver: NCollection_Array1_int

TFunction_HArray1OfDataMapOfGUIDDriver: NCollection_HArray1_int
