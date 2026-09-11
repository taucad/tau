# libcascade — Transfer (2)

9 top-level symbols. Signatures are verbatim typescript.

Transfer_TransferIterator: declare class Transfer_TransferIterator

constructor

AddItem(atr: Transfer_Binder): void;

SelectBinder(atype: Standard_Type, keep: boolean): void;

SelectResult(atype: Standard_Type, keep: boolean): void;

SelectUnique(keep: boolean): void;

SelectItem(num: number, keep: boolean): void;

Number(): number;

Start(): void;

More(): boolean;

Next(): void;

Value(): Transfer_Binder;

HasResult(): boolean;

HasUniqueResult(): boolean;

ResultType(): Standard_Type;

HasTransientResult(): boolean;

TransientResult(): Standard_Transient;

Status(): Transfer_StatusExec;

HasFails(): boolean;

HasWarnings(): boolean;

Check(): Interface_Check;

delete(): void;

[Symbol.dispose](): void;

Transfer_TransferOutput: declare class Transfer_TransferOutput

constructor

Model(): Interface_InterfaceModel;

TransientProcess(): Transfer_TransientProcess;

Transfer(obj: Standard_Transient, theProgress?: Message_ProgressRange): void;

TransferRoots(protocol: Interface_Protocol, theProgress: Message_ProgressRange): void;
TransferRoots(theProgress: Message_ProgressRange): void;
TransferRoots(protocol: Interface_Protocol, theProgress: Message_ProgressRange): void;
TransferRoots(theProgress: Message_ProgressRange): void;

ModelForStatus(protocol: Interface_Protocol, normal: boolean, roots?: boolean): Interface_InterfaceModel;

delete(): void;

[Symbol.dispose](): void;

Transfer_TransientListBinder: declare class Transfer_TransientListBinder extends Transfer_Binder

constructor

IsMultiple(): boolean;

ResultType(): Standard_Type;

ResultTypeName(): string;

AddResult(res: Standard_Transient): void;
AddResult(next: Transfer_Binder): void;
AddResult(res: Standard_Transient): void;
AddResult(next: Transfer_Binder): void;

Result(): NCollection_HSequence_handle_Standard_Transient;

SetResult(num: number, res: Standard_Transient): void;

NbTransients(): number;

Transient(num: number): Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_TransientMapper: declare class Transfer_TransientMapper extends Transfer_Finder

constructor

Value(): Standard_Transient;

Equates(other: Transfer_Finder): boolean;

ValueType(): Standard_Type;

ValueTypeName(): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_TransientProcess: declare class Transfer_TransientProcess extends Transfer_ProcessForTransient

constructor

SetModel(model: Interface_InterfaceModel): void;

Model(): Interface_InterfaceModel;

HasGraph(): boolean;

SetContext(name: string, ctx: Standard_Transient): void;

GetContext(name: string, type\_: Standard_Type): { returnValue: boolean; ctx: Standard_Transient; [Symbol.dispose](): void };

Context(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

CheckNum(start: Standard_Transient): number;

IsDataLoaded(ent: Standard_Transient): boolean;

IsDataFail(ent: Standard_Transient): boolean;

RootsForTransfer(): NCollection_HSequence_handle_Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_UndefMode: typeof Transfer_UndefMode[keyof typeof Transfer_UndefMode]

Transfer_VoidBinder: declare class Transfer_VoidBinder extends Transfer_Binder

constructor

ResultType(): Standard_Type;

ResultTypeName(): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_HSequenceOfFinder: NCollection_HSequence_handle_Transfer_Finder

Transfer_SequenceOfFinder: NCollection_Sequence_handle_Transfer_Finder
