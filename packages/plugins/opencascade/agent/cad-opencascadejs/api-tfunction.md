# libcascade — TFunction

11 top-level symbols. Signatures are verbatim typescript.

TFunction_Driver: declare class TFunction_Driver extends Standard_Transient

Init(L: TDF_Label): void;

Label(): TDF_Label;

Validate(log: TFunction_Logbook): void;

MustExecute(log: TFunction_Logbook): boolean;

Execute(): { returnValue: number; log: TFunction_Logbook; [Symbol.dispose](): void };

Arguments(args: NCollection_List_TDF_Label): void;

Results(res: NCollection_List_TDF_Label): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TFunction_DriverTable: declare class TFunction_DriverTable extends Standard_Transient

constructor

static Get(): TFunction_DriverTable;

AddDriver(guid: Standard_GUID, driver: TFunction_Driver, thread?: number): boolean;

HasDriver(guid: Standard_GUID, thread?: number): boolean;

FindDriver(guid: Standard_GUID, thread: number): { returnValue: boolean; driver: TFunction_Driver; [Symbol.dispose](): void };

RemoveDriver(guid: Standard_GUID, thread?: number): boolean;

Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TFunction_ExecutionStatus: typeof TFunction_ExecutionStatus[keyof typeof TFunction_ExecutionStatus]

TFunction_Function: declare class TFunction_Function extends TDF_Attribute

constructor

static Set(L: TDF_Label): TFunction_Function;
static Set(L: TDF_Label, DriverID: Standard_GUID): TFunction_Function;
static Set(L: TDF_Label): TFunction_Function;
static Set(L: TDF_Label, DriverID: Standard_GUID): TFunction_Function;

static GetID(): Standard_GUID;

GetDriverGUID(): Standard_GUID;

SetDriverGUID(guid: Standard_GUID): void;

Failed(): boolean;

SetFailure(mode?: number): void;

GetFailure(): number;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

NewEmpty(): TDF_Attribute;

References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TFunction_GraphNode: declare class TFunction_GraphNode extends TDF_Attribute

constructor

static Set(L: TDF_Label): TFunction_GraphNode;

static GetID(): Standard_GUID;

AddPrevious(funcID: number): boolean;
AddPrevious(func: TDF_Label): boolean;
AddPrevious(funcID: number): boolean;
AddPrevious(func: TDF_Label): boolean;

RemovePrevious(funcID: number): boolean;
RemovePrevious(func: TDF_Label): boolean;
RemovePrevious(funcID: number): boolean;
RemovePrevious(func: TDF_Label): boolean;

GetPrevious(): NCollection_Map_int;

RemoveAllPrevious(): void;

AddNext(funcID: number): boolean;
AddNext(func: TDF_Label): boolean;
AddNext(funcID: number): boolean;
AddNext(func: TDF_Label): boolean;

RemoveNext(funcID: number): boolean;
RemoveNext(func: TDF_Label): boolean;
RemoveNext(funcID: number): boolean;
RemoveNext(func: TDF_Label): boolean;

GetNext(): NCollection_Map_int;

RemoveAllNext(): void;

GetStatus(): TFunction_ExecutionStatus;

SetStatus(status: TFunction_ExecutionStatus): void;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

NewEmpty(): TDF_Attribute;

References(aDataSet: TDF_DataSet): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TFunction_IFunction: declare class TFunction_IFunction

constructor

static NewFunction(L: TDF_Label, ID: Standard_GUID): boolean;

static DeleteFunction(L: TDF_Label): boolean;

static UpdateDependencies(Access: TDF_Label): boolean;
UpdateDependencies(): boolean;

Init(L: TDF_Label): void;

Label(): TDF_Label;

Arguments(args: NCollection_List_TDF_Label): void;

Results(res: NCollection_List_TDF_Label): void;

GetPrevious(prev: NCollection_List_TDF_Label): void;

GetNext(prev: NCollection_List_TDF_Label): void;

GetStatus(): TFunction_ExecutionStatus;

SetStatus(status: TFunction_ExecutionStatus): void;

GetAllFunctions(): NCollection_DoubleMap_int_TDF_Label;

GetLogbook(): TFunction_Logbook;

GetDriver(thread?: number): TFunction_Driver;

GetGraphNode(): TFunction_GraphNode;

delete(): void;

[Symbol.dispose](): void;

TFunction_Iterator: declare class TFunction_Iterator

constructor

Init(Access: TDF_Label): void;

SetUsageOfExecutionStatus(usage: boolean): void;

GetUsageOfExecutionStatus(): boolean;

GetMaxNbThreads(): number;

Current(): NCollection_List_TDF_Label;

More(): boolean;

Next(): void;

GetStatus(func: TDF_Label): TFunction_ExecutionStatus;

SetStatus(func: TDF_Label, status: TFunction_ExecutionStatus): void;

delete(): void;

[Symbol.dispose](): void;

TFunction_Logbook: declare class TFunction_Logbook extends TDF_Attribute

constructor

static Set(Access: TDF_Label): TFunction_Logbook;

static GetID(): Standard_GUID;

Clear(): void;

IsEmpty(): boolean;

SetTouched(L: TDF_Label): void;

SetImpacted(L: TDF_Label, WithChildren?: boolean): void;

SetValid(L: TDF_Label, WithChildren: boolean): void;
SetValid(Ls: NCollection_Map_TDF_Label): void;
SetValid(L: TDF_Label, WithChildren: boolean): void;
SetValid(Ls: NCollection_Map_TDF_Label): void;

IsModified(L: TDF_Label, WithChildren?: boolean): boolean;

GetTouched(): NCollection_Map_TDF_Label;

GetImpacted(): NCollection_Map_TDF_Label;

GetValid(): NCollection_Map_TDF_Label;
GetValid(Ls: NCollection_Map_TDF_Label): void;
GetValid(): NCollection_Map_TDF_Label;
GetValid(Ls: NCollection_Map_TDF_Label): void;

Done(status: boolean): void;

IsDone(): boolean;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

NewEmpty(): TDF_Attribute;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TFunction_Scope: declare class TFunction_Scope extends TDF_Attribute

constructor

static Set(Access: TDF_Label): TFunction_Scope;

static GetID(): Standard_GUID;

AddFunction(L: TDF_Label): boolean;

RemoveFunction(L: TDF_Label): boolean;
RemoveFunction(ID: number): boolean;
RemoveFunction(L: TDF_Label): boolean;
RemoveFunction(ID: number): boolean;

RemoveAllFunctions(): void;

HasFunction(ID: number): boolean;
HasFunction(L: TDF_Label): boolean;
HasFunction(ID: number): boolean;
HasFunction(L: TDF_Label): boolean;

GetFunction(L: TDF_Label): number;
GetFunction(ID: number): TDF_Label;
GetFunction(L: TDF_Label): number;
GetFunction(ID: number): TDF_Label;

GetLogbook(): TFunction_Logbook;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

NewEmpty(): TDF_Attribute;

GetFunctions(): NCollection_DoubleMap_int_TDF_Label;

ChangeFunctions(): NCollection_DoubleMap_int_TDF_Label;

SetFreeID(ID: number): void;

GetFreeID(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

TFunction_Array1OfDataMapOfGUIDDriver: NCollection_Array1_int

TFunction_HArray1OfDataMapOfGUIDDriver: NCollection_HArray1_int
