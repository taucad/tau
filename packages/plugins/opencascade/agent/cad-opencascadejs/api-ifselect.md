# libcascade — IFSelect

47 top-level symbols. Signatures are verbatim typescript.

IFSelect: declare class IFSelect

constructor

static SaveSession(WS: IFSelect_WorkSession, file: string): boolean;

static RestoreSession(WS: IFSelect_WorkSession, file: string): boolean;

delete(): void;

[Symbol.dispose](): void;

IFSelect_Act: declare class IFSelect_Act extends IFSelect_Activator

constructor

Do(number\_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

Help(number\_: number): string;

static SetGroup(group: string, file?: string): void;

static AddFunc(name: string, help: string, func: ((arg0: IFSelect_SessionPilot) => IFSelect_ReturnStatus)): void;

static AddFSet(name: string, help: string, func: ((arg0: IFSelect_SessionPilot) => IFSelect_ReturnStatus)): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_Activator: declare class IFSelect_Activator extends Standard_Transient

static Adding(actor: IFSelect*Activator, number*: number, command: string, mode: number): void;

Add(number\_: number, command: string): void;

AddSet(number\_: number, command: string): void;

static Remove(command: string): void;

static Select(command: string, number*?: number): { returnValue: boolean; number*: number; actor: IFSelect_Activator; [Symbol.dispose](): void };

static Mode(command: string): number;

static Commands(mode?: number, command?: string): NCollection_HSequence_TCollection_AsciiString;

Do(number\_: number, pilot: IFSelect_SessionPilot): IFSelect_ReturnStatus;

Help(number\_: number): string;

Group(): string;

File(): string;

SetForGroup(group: string, file?: string): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_AppliedModifiers: declare class IFSelect_AppliedModifiers extends Standard_Transient

constructor

AddModif(modif: IFSelect_GeneralModifier): boolean;

AddNum(nument: number): boolean;

Count(): number;

Item(num: number, entcount?: number): { returnValue: boolean; modif: IFSelect_GeneralModifier; entcount: number; [Symbol.dispose](): void };

ItemNum(nument: number): number;

ItemList(): NCollection_HSequence_int;

IsForAll(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_BasicDumper: declare class IFSelect_BasicDumper extends IFSelect_SessionDumper

constructor

WriteOwn(file: IFSelect_SessionFile, item: Standard_Transient): boolean;

ReadOwn(file: IFSelect*SessionFile, type*: TCollection_AsciiString): { returnValue: boolean; item: Standard_Transient; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_CheckCounter: declare class IFSelect_CheckCounter extends IFSelect_SignatureList

constructor

SetSignature(sign: MoniTool_SignText): void;

Signature(): MoniTool_SignText;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_ContextWrite: declare class IFSelect_ContextWrite

constructor

Model(): Interface_InterfaceModel;

Protocol(): Interface_Protocol;

FileName(): string;

AppliedModifiers(): IFSelect_AppliedModifiers;

NbModifiers(): number;

SetModifier(numod: number): boolean;

FileModifier(): IFSelect_GeneralModifier;

IsForNone(): boolean;

IsForAll(): boolean;

NbEntities(): number;

Start(): void;

More(): boolean;

Next(): void;

Value(): Standard_Transient;

AddCheck(check: Interface_Check): void;

AddWarning(start: Standard_Transient, mess: string, orig?: string): void;

AddFail(start: Standard_Transient, mess: string, orig?: string): void;

CCheck(num: number): Interface_Check;
CCheck(start: Standard_Transient): Interface_Check;
CCheck(num: number): Interface_Check;
CCheck(start: Standard_Transient): Interface_Check;

delete(): void;

[Symbol.dispose](): void;

IFSelect_DispGlobal: declare class IFSelect_DispGlobal extends IFSelect_Dispatch

constructor

Label(): TCollection_AsciiString;

LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_DispPerCount: declare class IFSelect_DispPerCount extends IFSelect_Dispatch

constructor

CountValue(): number;

Label(): TCollection_AsciiString;

LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_DispPerFiles: declare class IFSelect_DispPerFiles extends IFSelect_Dispatch

constructor

CountValue(): number;

Label(): TCollection_AsciiString;

LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_DispPerOne: declare class IFSelect_DispPerOne extends IFSelect_Dispatch

constructor

Label(): TCollection_AsciiString;

LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_DispPerSignature: declare class IFSelect_DispPerSignature extends IFSelect_Dispatch

constructor

SignCounter(): IFSelect_SignCounter;

SetSignCounter(sign: IFSelect_SignCounter): void;

SignName(): string;

Label(): TCollection_AsciiString;

LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_Dispatch: declare class IFSelect_Dispatch extends Standard_Transient

SetRootName(name: TCollection_HAsciiString): void;

HasRootName(): boolean;

RootName(): TCollection_HAsciiString;

SetFinalSelection(sel: IFSelect_Selection): void;

FinalSelection(): IFSelect_Selection;

CanHaveRemainder(): boolean;

LimitedMax(nbent: number, max: number): { returnValue: boolean; max: number };

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_EditValue: typeof IFSelect_EditValue[keyof typeof IFSelect_EditValue]

IFSelect_Editor: declare class IFSelect_Editor extends Standard_Transient

SetValue(num: number, typval: Interface_TypedValue, shortname?: string, accessmode?: IFSelect_EditValue): void;

SetList(num: number, max?: number): void;

NbValues(): number;

TypedValue(num: number): Interface_TypedValue;

IsList(num: number): boolean;

MaxList(num: number): number;

Name(num: number, isshort: boolean): string;

EditMode(num: number): IFSelect_EditValue;

NameNumber(name: string): number;

MaxNameLength(what: number): number;

Label(): TCollection_AsciiString;

ListEditor(num: number): IFSelect_ListEditor;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_Functions: declare class IFSelect_Functions

constructor

static GiveEntity(WS: IFSelect_WorkSession, name?: string): Standard_Transient;

static GiveEntityNumber(WS: IFSelect_WorkSession, name?: string): number;

static GiveList(WS: IFSelect_WorkSession, first?: string, second?: string): NCollection_HSequence_handle_Standard_Transient;

static GiveDispatch(WS: IFSelect_WorkSession, name: string, mode?: boolean): IFSelect_Dispatch;

static Init(): void;

delete(): void;

[Symbol.dispose](): void;

IFSelect_GeneralModifier: declare class IFSelect_GeneralModifier extends Standard_Transient

MayChangeGraph(): boolean;

SetDispatch(disp: IFSelect_Dispatch): void;

Dispatch(): IFSelect_Dispatch;

Applies(disp: IFSelect_Dispatch): boolean;

SetSelection(sel: IFSelect_Selection): void;

ResetSelection(): void;

HasSelection(): boolean;

Selection(): IFSelect_Selection;

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_GraphCounter: declare class IFSelect_GraphCounter extends IFSelect_SignCounter

constructor

Applied(): IFSelect_SelectDeduct;

SetApplied(sel: IFSelect_SelectDeduct): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_ListEditor: declare class IFSelect_ListEditor extends Standard_Transient

constructor

LoadModel(model: Interface_InterfaceModel): void;

LoadValues(vals: NCollection_HSequence_handle_TCollection_HAsciiString): void;

SetTouched(): void;

ClearEdit(): void;

LoadEdited(list: NCollection_HSequence_handle_TCollection_HAsciiString): boolean;

SetValue(num: number, val: TCollection_HAsciiString): boolean;

AddValue(val: TCollection_HAsciiString, atnum?: number): boolean;

Remove(num?: number, howmany?: number): boolean;

OriginalValues(): NCollection_HSequence_handle_TCollection_HAsciiString;

EditedValues(): NCollection_HSequence_handle_TCollection_HAsciiString;

NbValues(edited?: boolean): number;

Value(num: number, edited?: boolean): TCollection_HAsciiString;

IsChanged(num: number): boolean;

IsModified(num: number): boolean;

IsAdded(num: number): boolean;

IsTouched(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_ModelCopier: declare class IFSelect_ModelCopier extends Standard_Transient

constructor

SetShareOut(sho: IFSelect_ShareOut): void;

ClearResult(): void;

AddFile(filename: TCollection_AsciiString, content: Interface_InterfaceModel): boolean;

NameFile(num: number, filename: TCollection_AsciiString): boolean;

ClearFile(num: number): boolean;

SetAppliedModifiers(num: number, applied: IFSelect_AppliedModifiers): boolean;

ClearAppliedModifiers(num: number): boolean;

NbFiles(): number;

FileName(num: number): TCollection_AsciiString;

FileModel(num: number): Interface_InterfaceModel;

AppliedModifiers(num: number): IFSelect_AppliedModifiers;

BeginSentFiles(sho: IFSelect_ShareOut, record: boolean): void;

AddSentFile(filename: string): void;

SentFiles(): NCollection_HSequence_handle_TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_ModifEditForm: declare class IFSelect_ModifEditForm extends IFSelect_Modifier

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_ModifReorder: declare class IFSelect_ModifReorder extends IFSelect_Modifier

constructor

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_Modifier: declare class IFSelect_Modifier extends IFSelect_GeneralModifier

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_PacketList: declare class IFSelect_PacketList extends Standard_Transient

constructor

SetName(name: string): void;

Name(): string;

Model(): Interface_InterfaceModel;

AddPacket(): void;

Add(ent: Standard_Transient): void;

AddList(list: NCollection_HSequence_handle_Standard_Transient): void;

NbPackets(): number;

NbEntities(numpack: number): number;

HighestDuplicationCount(): number;

NbDuplicated(count: number, andmore: boolean): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_ParamEditor: declare class IFSelect_ParamEditor extends IFSelect_Editor

constructor

AddValue(val: Interface_TypedValue, shortname?: string): void;

AddConstantText(val: string, shortname: string, completename?: string): void;

Label(): TCollection_AsciiString;

static StaticEditor(list: NCollection_HSequence_handle_TCollection_HAsciiString, label?: string): IFSelect_ParamEditor;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_PrintCount: typeof IFSelect_PrintCount[keyof typeof IFSelect_PrintCount]

IFSelect_PrintFail: typeof IFSelect_PrintFail[keyof typeof IFSelect_PrintFail]

IFSelect_RemainMode: typeof IFSelect_RemainMode[keyof typeof IFSelect_RemainMode]

IFSelect_ReturnStatus: typeof IFSelect_ReturnStatus[keyof typeof IFSelect_ReturnStatus]

IFSelect_SelectAnyList: declare class IFSelect_SelectAnyList extends IFSelect_SelectDeduct

NbItems(ent: Standard_Transient): number;

HasLower(): boolean;

LowerValue(): number;

HasUpper(): boolean;

UpperValue(): number;

Label(): TCollection_AsciiString;

ListLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectAnyType: declare class IFSelect_SelectAnyType extends IFSelect_SelectExtract

TypeForMatch(): Standard_Type;

Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectBase: declare class IFSelect_SelectBase extends IFSelect_Selection

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectCombine: declare class IFSelect_SelectCombine extends IFSelect_Selection

NbInputs(): number;

Input(num: number): IFSelect_Selection;

InputRank(sel: IFSelect_Selection): number;

Add(sel: IFSelect_Selection, atnum?: number): void;

Remove(sel: IFSelect_Selection): boolean;
Remove(num: number): boolean;
Remove(sel: IFSelect_Selection): boolean;
Remove(num: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectControl: declare class IFSelect_SelectControl extends IFSelect_Selection

MainInput(): IFSelect_Selection;

HasSecondInput(): boolean;

SecondInput(): IFSelect_Selection;

SetMainInput(sel: IFSelect_Selection): void;

SetSecondInput(sel: IFSelect_Selection): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectDeduct: declare class IFSelect_SelectDeduct extends IFSelect_Selection

SetInput(sel: IFSelect_Selection): void;

Input(): IFSelect_Selection;

HasInput(): boolean;

HasAlternate(): boolean;

Alternate(): IFSelect_SelectPointed;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectDiff: declare class IFSelect_SelectDiff extends IFSelect_SelectControl

constructor

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectEntityNumber: declare class IFSelect_SelectEntityNumber extends IFSelect_SelectBase

constructor

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectErrorEntities: declare class IFSelect_SelectErrorEntities extends IFSelect_SelectExtract

constructor

Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectExplore: declare class IFSelect_SelectExplore extends IFSelect_SelectDeduct

Level(): number;

Label(): TCollection_AsciiString;

ExploreLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectExtract: declare class IFSelect_SelectExtract extends IFSelect_SelectDeduct

IsDirect(): boolean;

SetDirect(direct: boolean): void;

Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

Label(): TCollection_AsciiString;

ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectFlag: declare class IFSelect_SelectFlag extends IFSelect_SelectExtract

constructor

FlagName(): string;

Sort(rank: number, ent: Standard_Transient, model: Interface_InterfaceModel): boolean;

ExtractLabel(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectInList: declare class IFSelect_SelectInList extends IFSelect_SelectAnyList

ListedEntity(num: number, ent: Standard_Transient): Standard_Transient;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectIncorrectEntities: declare class IFSelect_SelectIncorrectEntities extends IFSelect_SelectFlag

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectIntersection: declare class IFSelect_SelectIntersection extends IFSelect_SelectCombine

constructor

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectModelEntities: declare class IFSelect_SelectModelEntities extends IFSelect_SelectBase

constructor

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectModelRoots: declare class IFSelect_SelectModelRoots extends IFSelect_SelectBase

constructor

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_SelectPointed: declare class IFSelect_SelectPointed extends IFSelect_SelectBase

constructor

Clear(): void;

IsSet(): boolean;

SetEntity(item: Standard_Transient): void;

SetList(list: NCollection_HSequence_handle_Standard_Transient): void;

Add(item: Standard_Transient): boolean;

Remove(item: Standard_Transient): boolean;

Toggle(item: Standard_Transient): boolean;

AddList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

RemoveList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

ToggleList(list: NCollection_HSequence_handle_Standard_Transient): boolean;

Rank(item: Standard_Transient): number;

NbItems(): number;

Item(num: number): Standard_Transient;

Update(control: Interface_CopyControl): void;
Update(trf: IFSelect_Transformer): void;
Update(control: Interface_CopyControl): void;
Update(trf: IFSelect_Transformer): void;

Label(): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;
