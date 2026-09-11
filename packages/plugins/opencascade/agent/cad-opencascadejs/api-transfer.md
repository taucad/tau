# libcascade — Transfer

27 top-level symbols. Signatures are verbatim typescript.

Transfer_ActorDispatch: declare class Transfer_ActorDispatch extends Transfer_ActorOfTransientProcess

constructor

AddActor(actor: Transfer_ActorOfTransientProcess): void;

TransferDispatch(): Transfer_TransferDispatch;

Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_ActorOfFinderProcess: declare class Transfer_ActorOfFinderProcess extends Transfer_ActorOfProcessForFinder

constructor

ModeTrans(): number;

Transferring(start: Transfer_Finder, TP: Transfer_ProcessForFinder, theProgress?: Message_ProgressRange): Transfer_Binder;

Transfer(start: Transfer_Finder, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

TransferTransient(start: Standard_Transient, TP: Transfer_FinderProcess, theProgress?: Message_ProgressRange): Standard_Transient;

SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

SetShapeProcessFlags(theFlags: any): void;

GetShapeProcessFlags(): [any, boolean];

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_ActorOfProcessForFinder: declare class Transfer_ActorOfProcessForFinder extends Standard_Transient

constructor

Recognize(start: Transfer_Finder): boolean;

Transferring(start: Transfer_Finder, TP: Transfer_ProcessForFinder, theProgress?: Message_ProgressRange): Transfer_Binder;

TransientResult(res: Standard_Transient): Transfer_SimpleBinderOfTransient;

NullResult(): Transfer_Binder;

SetLast(mode?: boolean): void;

IsLast(): boolean;

SetNext(next: Transfer_ActorOfProcessForFinder): void;

Next(): Transfer_ActorOfProcessForFinder;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_ActorOfProcessForTransient: declare class Transfer_ActorOfProcessForTransient extends Standard_Transient

constructor

Recognize(start: Standard_Transient): boolean;

Transferring(start: Standard_Transient, TP: Transfer_ProcessForTransient, theProgress?: Message_ProgressRange): Transfer_Binder;

TransientResult(res: Standard_Transient): Transfer_SimpleBinderOfTransient;

NullResult(): Transfer_Binder;

SetLast(mode?: boolean): void;

IsLast(): boolean;

SetNext(next: Transfer_ActorOfProcessForTransient): void;

Next(): Transfer_ActorOfProcessForTransient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_ActorOfTransientProcess: declare class Transfer_ActorOfTransientProcess extends Transfer_ActorOfProcessForTransient

constructor

Transferring(start: Standard_Transient, TP: Transfer_ProcessForTransient, theProgress?: Message_ProgressRange): Transfer_Binder;

Transfer(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Transfer_Binder;

TransferTransient(start: Standard_Transient, TP: Transfer_TransientProcess, theProgress?: Message_ProgressRange): Standard_Transient;

SetShapeFixParameters(theParameters: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

GetShapeFixParameters(): NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString;

SetProcessingFlags(theFlags: any): void;

GetProcessingFlags(): [any, boolean];

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_Binder: declare class Transfer_Binder extends Standard_Transient

Merge(other: Transfer_Binder): void;

IsMultiple(): boolean;

ResultType(): Standard_Type;

ResultTypeName(): string;

AddResult(next: Transfer_Binder): void;

NextResult(): Transfer_Binder;

HasResult(): boolean;

SetAlreadyUsed(): void;

Status(): Transfer_StatusResult;

StatusExec(): Transfer_StatusExec;

SetStatusExec(stat: Transfer_StatusExec): void;

AddFail(mess: string, orig?: string): void;

AddWarning(mess: string, orig?: string): void;

Check(): Interface_Check;

CCheck(): Interface_Check;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_BinderOfTransientInteger: declare class Transfer_BinderOfTransientInteger extends Transfer_SimpleBinderOfTransient

constructor

SetInteger(value: number): void;

Integer(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_DataInfo: declare class Transfer_DataInfo

constructor

static Type(ent: Standard_Transient): Standard_Type;

static TypeName(ent: Standard_Transient): string;

delete(): void;

[Symbol.dispose](): void;

Transfer_DispatchControl: declare class Transfer_DispatchControl extends Interface_CopyControl

constructor

TransientProcess(): Transfer_TransientProcess;

StartingModel(): Interface_InterfaceModel;

Clear(): void;

Bind(ent: Standard_Transient, res: Standard_Transient): void;

Search(ent: Standard_Transient): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_FindHasher: declare class Transfer_FindHasher

constructor

delete(): void;

[Symbol.dispose](): void;

Transfer_Finder: declare class Transfer_Finder extends Standard_Transient

GetHashCode(): number;

Equates(other: Transfer_Finder): boolean;

ValueType(): Standard_Type;

ValueTypeName(): string;

SetAttribute(name: string, val: Standard_Transient): void;

RemoveAttribute(name: string): boolean;

GetAttribute(name: string, type\_: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

Attribute(name: string): Standard_Transient;

AttributeType(name: string): Interface_ParamType;

SetIntegerAttribute(name: string, val: number): void;

GetIntegerAttribute(name: string, val?: number): { returnValue: boolean; val: number };

IntegerAttribute(name: string): number;

SetRealAttribute(name: string, val: number): void;

GetRealAttribute(name: string, val?: number): { returnValue: boolean; val: number };

RealAttribute(name: string): number;

SetStringAttribute(name: string, val: string): void;

StringAttribute(name: string): string;

AttrList(): NCollection_DataMap_TCollection_AsciiString_handle_Standard_Transient;

SameAttributes(other: Transfer_Finder): void;

GetAttributes(other: Transfer_Finder, fromname?: string, copied?: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_FinderProcess: declare class Transfer_FinderProcess extends Transfer_ProcessForFinder

constructor

SetModel(model: Interface_InterfaceModel): void;

Model(): Interface_InterfaceModel;

NextMappedWithAttribute(name: string, num0: number): number;

TransientMapper(obj: Standard_Transient): Transfer_TransientMapper;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_IteratorOfProcessForFinder: declare class Transfer_IteratorOfProcessForFinder extends Transfer_TransferIterator

constructor

Add(binder: Transfer_Binder): void;
Add(binder: Transfer_Binder, start: Transfer_Finder): void;
Add(binder: Transfer_Binder): void;
Add(binder: Transfer_Binder, start: Transfer_Finder): void;

Filter(list: NCollection_HSequence_handle_Transfer_Finder, keep?: boolean): void;

HasStarting(): boolean;

Starting(): Transfer_Finder;

delete(): void;

[Symbol.dispose](): void;

Transfer_IteratorOfProcessForTransient: declare class Transfer_IteratorOfProcessForTransient extends Transfer_TransferIterator

constructor

Add(binder: Transfer_Binder): void;
Add(binder: Transfer_Binder, start: Standard_Transient): void;
Add(binder: Transfer_Binder): void;
Add(binder: Transfer_Binder, start: Standard_Transient): void;

Filter(list: NCollection_HSequence_handle_Standard_Transient, keep?: boolean): void;

HasStarting(): boolean;

Starting(): Standard_Transient;

delete(): void;

[Symbol.dispose](): void;

Transfer_MapContainer: declare class Transfer_MapContainer extends Standard_Transient

constructor

SetMapObjects(theMapObjects: NCollection_DataMap_handle_Standard_Transient_handle_Standard_Transient): void;

GetMapObjects(): NCollection_DataMap_handle_Standard_Transient_handle_Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_MultipleBinder: declare class Transfer_MultipleBinder extends Transfer_Binder

constructor

IsMultiple(): boolean;

ResultType(): Standard_Type;

ResultTypeName(): string;

AddResult(res: Standard_Transient): void;
AddResult(next: Transfer_Binder): void;
AddResult(res: Standard_Transient): void;
AddResult(next: Transfer_Binder): void;

NbResults(): number;

ResultValue(num: number): Standard_Transient;

MultipleResult(): NCollection_HSequence_handle_Standard_Transient;

SetMultipleResult(mulres: NCollection_HSequence_handle_Standard_Transient): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_ProcessForFinder: declare class Transfer_ProcessForFinder extends Standard_Transient

constructor

Clear(): void;

Clean(): void;

Resize(nb: number): void;

SetActor(actor: Transfer_ActorOfProcessForFinder): void;

Actor(): Transfer_ActorOfProcessForFinder;

Find(start: Transfer_Finder): Transfer_Binder;

IsBound(start: Transfer_Finder): boolean;

IsAlreadyUsed(start: Transfer_Finder): boolean;

Bind(start: Transfer_Finder, binder: Transfer_Binder): void;

Rebind(start: Transfer_Finder, binder: Transfer_Binder): void;

Unbind(start: Transfer_Finder): boolean;

FindElseBind(start: Transfer_Finder): Transfer_Binder;

SetTraceLevel(tracelev: number): void;

TraceLevel(): number;

SendFail(start: Transfer_Finder, amsg: Message_Msg): void;

SendWarning(start: Transfer_Finder, amsg: Message_Msg): void;

SendMsg(start: Transfer_Finder, amsg: Message_Msg): void;

AddFail(start: Transfer_Finder, mess: string, orig: string): void;
AddFail(start: Transfer_Finder, amsg: Message_Msg): void;
AddFail(start: Transfer_Finder, mess: string, orig: string): void;
AddFail(start: Transfer_Finder, amsg: Message_Msg): void;

AddError(start: Transfer_Finder, mess: string, orig?: string): void;

AddWarning(start: Transfer_Finder, mess: string, orig: string): void;
AddWarning(start: Transfer_Finder, amsg: Message_Msg): void;
AddWarning(start: Transfer_Finder, mess: string, orig: string): void;
AddWarning(start: Transfer_Finder, amsg: Message_Msg): void;

Mend(start: Transfer_Finder, pref?: string): void;

Check(start: Transfer_Finder): Interface_Check;

BindTransient(start: Transfer_Finder, res: Standard_Transient): void;

FindTransient(start: Transfer_Finder): Standard_Transient;

BindMultiple(start: Transfer_Finder): void;

AddMultiple(start: Transfer_Finder, res: Standard_Transient): void;

FindTypedTransient(start: Transfer_Finder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

GetTypedTransient(binder: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

NbMapped(): number;

Mapped(num: number): Transfer_Finder;

MapIndex(start: Transfer_Finder): number;

MapItem(num: number): Transfer_Binder;

SetRoot(start: Transfer_Finder): void;

SetRootManagement(stat: boolean): void;

NbRoots(): number;

Root(num: number): Transfer_Finder;

RootItem(num: number): Transfer_Binder;

RootIndex(start: Transfer_Finder): number;

NestingLevel(): number;

ResetNestingLevel(): void;

Recognize(start: Transfer_Finder): boolean;

Transferring(start: Transfer_Finder, theProgress?: Message_ProgressRange): Transfer_Binder;

Transfer(start: Transfer_Finder, theProgress?: Message_ProgressRange): boolean;

SetErrorHandle(err: boolean): void;

ErrorHandle(): boolean;

StartTrace(binder: Transfer_Binder, start: Transfer_Finder, level: number, mode: number): void;

IsLooping(alevel: number): boolean;

IsCheckListEmpty(start: Transfer_Finder, level: number, erronly: boolean): boolean;

RemoveResult(start: Transfer_Finder, level: number, compute?: boolean): void;

CheckNum(start: Transfer_Finder): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_ProcessForTransient: declare class Transfer_ProcessForTransient extends Standard_Transient

constructor

Clear(): void;

Clean(): void;

Resize(nb: number): void;

SetActor(actor: Transfer_ActorOfProcessForTransient): void;

Actor(): Transfer_ActorOfProcessForTransient;

Find(start: Standard_Transient): Transfer_Binder;

IsBound(start: Standard_Transient): boolean;

IsAlreadyUsed(start: Standard_Transient): boolean;

Bind(start: Standard_Transient, binder: Transfer_Binder): void;

Rebind(start: Standard_Transient, binder: Transfer_Binder): void;

Unbind(start: Standard_Transient): boolean;

FindElseBind(start: Standard_Transient): Transfer_Binder;

SetTraceLevel(tracelev: number): void;

TraceLevel(): number;

SendFail(start: Standard_Transient, amsg: Message_Msg): void;

SendWarning(start: Standard_Transient, amsg: Message_Msg): void;

SendMsg(start: Standard_Transient, amsg: Message_Msg): void;

AddFail(start: Standard_Transient, mess: string, orig: string): void;
AddFail(start: Standard_Transient, amsg: Message_Msg): void;
AddFail(start: Standard_Transient, mess: string, orig: string): void;
AddFail(start: Standard_Transient, amsg: Message_Msg): void;

AddError(start: Standard_Transient, mess: string, orig?: string): void;

AddWarning(start: Standard_Transient, mess: string, orig: string): void;
AddWarning(start: Standard_Transient, amsg: Message_Msg): void;
AddWarning(start: Standard_Transient, mess: string, orig: string): void;
AddWarning(start: Standard_Transient, amsg: Message_Msg): void;

Mend(start: Standard_Transient, pref?: string): void;

Check(start: Standard_Transient): Interface_Check;

BindTransient(start: Standard_Transient, res: Standard_Transient): void;

FindTransient(start: Standard_Transient): Standard_Transient;

BindMultiple(start: Standard_Transient): void;

AddMultiple(start: Standard_Transient, res: Standard_Transient): void;

FindTypedTransient(start: Standard_Transient, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

GetTypedTransient(binder: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; val: Standard_Transient; [Symbol.dispose](): void };

NbMapped(): number;

Mapped(num: number): Standard_Transient;

MapIndex(start: Standard_Transient): number;

MapItem(num: number): Transfer_Binder;

SetRoot(start: Standard_Transient): void;

SetRootManagement(stat: boolean): void;

NbRoots(): number;

Root(num: number): Standard_Transient;

RootItem(num: number): Transfer_Binder;

RootIndex(start: Standard_Transient): number;

NestingLevel(): number;

ResetNestingLevel(): void;

Recognize(start: Standard_Transient): boolean;

Transferring(start: Standard_Transient, theProgress?: Message_ProgressRange): Transfer_Binder;

Transfer(start: Standard_Transient, theProgress?: Message_ProgressRange): boolean;

SetErrorHandle(err: boolean): void;

ErrorHandle(): boolean;

StartTrace(binder: Transfer_Binder, start: Standard_Transient, level: number, mode: number): void;

IsLooping(alevel: number): boolean;

IsCheckListEmpty(start: Standard_Transient, level: number, erronly: boolean): boolean;

RemoveResult(start: Standard_Transient, level: number, compute?: boolean): void;

CheckNum(start: Standard_Transient): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_ResultFromModel: declare class Transfer_ResultFromModel extends Standard_Transient

constructor

SetModel(model: Interface_InterfaceModel): void;

SetFileName(filename: string): void;

Model(): Interface_InterfaceModel;

FileName(): string;

Fill(TP: Transfer_TransientProcess, ent: Standard_Transient): boolean;

Strip(mode: number): void;

FillBack(TP: Transfer_TransientProcess): void;

HasResult(): boolean;

MainResult(): Transfer_ResultFromTransient;

SetMainResult(amain: Transfer_ResultFromTransient): void;

MainLabel(): string;

MainNumber(): number;

ResultFromKey(start: Standard_Transient): Transfer_ResultFromTransient;

Results(level: number): NCollection_HSequence_handle_Standard_Transient;

TransferredList(level?: number): NCollection_HSequence_handle_Standard_Transient;

CheckedList(check: Interface_CheckStatus, result: boolean): NCollection_HSequence_handle_Standard_Transient;

CheckStatus(): Interface_CheckStatus;

ComputeCheckStatus(enforce: boolean): Interface_CheckStatus;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_ResultFromTransient: declare class Transfer_ResultFromTransient extends Standard_Transient

constructor

SetStart(start: Standard_Transient): void;

SetBinder(binder: Transfer_Binder): void;

Start(): Standard_Transient;

Binder(): Transfer_Binder;

HasResult(): boolean;

Check(): Interface_Check;

CheckStatus(): Interface_CheckStatus;

ClearSubs(): void;

AddSubResult(sub: Transfer_ResultFromTransient): void;

NbSubResults(): number;

SubResult(num: number): Transfer_ResultFromTransient;

ResultFromKey(key: Standard_Transient): Transfer_ResultFromTransient;

FillMap(map: NCollection_IndexedMap_handle_Standard_Transient): void;

Fill(TP: Transfer_TransientProcess): void;

Strip(): void;

FillBack(TP: Transfer_TransientProcess): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_SimpleBinderOfTransient: declare class Transfer_SimpleBinderOfTransient extends Transfer_Binder

constructor

ResultType(): Standard_Type;

ResultTypeName(): string;

SetResult(res: Standard_Transient): void;

Result(): Standard_Transient;

static GetTypedResult(bnd: Transfer_Binder, atype: Standard_Type): { returnValue: boolean; res: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Transfer_StatusExec: typeof Transfer_StatusExec[keyof typeof Transfer_StatusExec]

Transfer_StatusResult: typeof Transfer_StatusResult[keyof typeof Transfer_StatusResult]

Transfer_TransferDeadLoop: declare class Transfer_TransferDeadLoop extends Transfer_TransferFailure

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Transfer_TransferDispatch: declare class Transfer_TransferDispatch extends Interface_CopyTool

constructor

TransientProcess(): Transfer_TransientProcess;

Copy(entfrom: Standard_Transient, mapped: boolean, errstat: boolean): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;

Transfer_TransferFailure: declare class Transfer_TransferFailure extends Interface_InterfaceError

constructor

ExceptionType(): string;

delete(): void;

[Symbol.dispose](): void;

Transfer_TransferInput: declare class Transfer_TransferInput

constructor

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

delete(): void;

[Symbol.dispose](): void;
