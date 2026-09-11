# libcascade — IFSelect (3)

2 top-level symbols. Signatures are verbatim typescript.

IFSelect_WorkSession: declare class IFSelect_WorkSession extends Standard_Transient

constructor

SetErrorHandle(toHandle: boolean): void;

ErrorHandle(): boolean;

ShareOut(): IFSelect_ShareOut;

SetShareOut(shareout: IFSelect_ShareOut): void;

SetModeStat(theMode: boolean): void;

GetModeStat(): boolean;

SetLibrary(theLib: IFSelect_WorkLibrary): void;

WorkLibrary(): IFSelect_WorkLibrary;

SetProtocol(protocol: Interface_Protocol): void;

Protocol(): Interface_Protocol;

SetSignType(signtype: IFSelect_Signature): void;

SignType(): IFSelect_Signature;

HasModel(): boolean;

SetModel(model: Interface_InterfaceModel, clearpointed?: boolean): void;

Model(): Interface_InterfaceModel;

SetLoadedFile(theFileName: string): void;

LoadedFile(): string;

ReadFile(filename: string): IFSelect_ReturnStatus;

NbStartingEntities(): number;

StartingEntity(num: number): Standard_Transient;

StartingNumber(ent: Standard_Transient): number;

NumberFromLabel(val: string, afternum?: number): number;

EntityLabel(ent: Standard_Transient): TCollection_HAsciiString;

EntityName(ent: Standard_Transient): TCollection_HAsciiString;

CategoryNumber(ent: Standard_Transient): number;

CategoryName(ent: Standard_Transient): string;

ValidityName(ent: Standard_Transient): string;

ClearData(mode: number): void;

ComputeGraph(enforce?: boolean): boolean;

Shareds(ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

Sharings(ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

IsLoaded(): boolean;

ComputeCheck(enforce?: boolean): boolean;

MaxIdent(): number;

Item(id: number): Standard_Transient;

ItemIdent(item: Standard_Transient): number;

NamedItem(name: string): Standard_Transient;
NamedItem(name: TCollection_HAsciiString): Standard_Transient;
NamedItem(name: string): Standard_Transient;
NamedItem(name: TCollection_HAsciiString): Standard_Transient;

NameIdent(name: string): number;

HasName(item: Standard_Transient): boolean;

Name(item: Standard_Transient): TCollection_HAsciiString;

AddItem(item: Standard_Transient, active?: boolean): number;

AddNamedItem(name: string, item: Standard_Transient, active?: boolean): number;

SetActive(item: Standard_Transient, mode: boolean): boolean;

RemoveNamedItem(name: string): boolean;

RemoveName(name: string): boolean;

RemoveItem(item: Standard_Transient): boolean;

ClearItems(): void;

ItemLabel(id: number): TCollection_HAsciiString;

ItemIdents(type\_: Standard_Type): NCollection_HSequence_int;

ItemNames(type\_: Standard_Type): NCollection_HSequence_handle_TCollection_HAsciiString;

ItemNamesForLabel(label: string): NCollection_HSequence_handle_TCollection_HAsciiString;

NextIdentForLabel(label: string, id: number, mode?: number): number;

NewParamFromStatic(statname: string, name?: string): Standard_Transient;

TextParam(id: number): TCollection_HAsciiString;

TextValue(par: TCollection_HAsciiString): TCollection_AsciiString;

NewTextParam(name?: string): TCollection_HAsciiString;

SetTextValue(par: TCollection_HAsciiString, val: string): boolean;

Signature(id: number): IFSelect_Signature;

SignValue(sign: IFSelect_Signature, ent: Standard_Transient): string;

Selection(id: number): IFSelect_Selection;

SelectionResult(sel: IFSelect_Selection): NCollection_HSequence_handle_Standard_Transient;

SelectionResultFromList(sel: IFSelect_Selection, list: NCollection_HSequence_handle_Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

SetItemSelection(item: Standard_Transient, sel: IFSelect_Selection): boolean;

ResetItemSelection(item: Standard_Transient): boolean;

ItemSelection(item: Standard_Transient): IFSelect_Selection;

SignCounter(id: number): IFSelect_SignCounter;

ComputeCounter(counter: IFSelect_SignCounter, forced?: boolean): boolean;

ComputeCounterFromList(counter: IFSelect_SignCounter, list: NCollection_HSequence_handle_Standard_Transient, clear?: boolean): boolean;

AppliedDispatches(): NCollection_HSequence_int;

ClearShareOut(onlydisp: boolean): void;

Dispatch(id: number): IFSelect_Dispatch;

DispatchRank(disp: IFSelect_Dispatch): number;

ModelCopier(): IFSelect_ModelCopier;

SetModelCopier(copier: IFSelect_ModelCopier): void;

NbFinalModifiers(formodel: boolean): number;

FinalModifierIdents(formodel: boolean): NCollection_HSequence_int;

GeneralModifier(id: number): IFSelect_GeneralModifier;

ModelModifier(id: number): IFSelect_Modifier;

ModifierRank(item: IFSelect_GeneralModifier): number;

ChangeModifierRank(formodel: boolean, before: number, after: number): boolean;

ClearFinalModifiers(): void;

SetAppliedModifier(modif: IFSelect_GeneralModifier, item: Standard_Transient): boolean;

ResetAppliedModifier(modif: IFSelect_GeneralModifier): boolean;

UsesAppliedModifier(modif: IFSelect_GeneralModifier): Standard_Transient;

Transformer(id: number): IFSelect_Transformer;

RunTransformer(transf: IFSelect_Transformer): number;

RunModifier(modif: IFSelect_Modifier, copy: boolean): number;

RunModifierSelected(modif: IFSelect_Modifier, sel: IFSelect_Selection, copy: boolean): number;

NewTransformStandard(copy: boolean, name?: string): IFSelect_Transformer;

SetModelContent(sel: IFSelect_Selection, keep: boolean): boolean;

FilePrefix(): TCollection_HAsciiString;

DefaultFileRoot(): TCollection_HAsciiString;

FileExtension(): TCollection_HAsciiString;

FileRoot(disp: IFSelect_Dispatch): TCollection_HAsciiString;

SetFilePrefix(name: string): void;

SetDefaultFileRoot(name: string): boolean;

SetFileExtension(name: string): void;

SetFileRoot(disp: IFSelect_Dispatch, name: string): boolean;

GiveFileRoot(file: string): string;

GiveFileComplete(file: string): string;

ClearFile(): void;

EvaluateFile(): void;

NbFiles(): number;

FileModel(num: number): Interface_InterfaceModel;

FileName(num: number): TCollection_AsciiString;

BeginSentFiles(record: boolean): void;

SentFiles(): NCollection_HSequence_handle_TCollection_HAsciiString;

SendSplit(): boolean;

EvalSplit(): IFSelect_PacketList;

MaxSendingCount(): number;

SetRemaining(mode: IFSelect_RemainMode): boolean;

SendAll(filename: string, computegraph?: boolean): IFSelect_ReturnStatus;

SendSelected(filename: string, sel: IFSelect_Selection, computegraph?: boolean): IFSelect_ReturnStatus;

WriteFile(filename: string): IFSelect_ReturnStatus;
WriteFile(filename: string, sel: IFSelect_Selection): IFSelect_ReturnStatus;
WriteFile(filename: string): IFSelect_ReturnStatus;
WriteFile(filename: string, sel: IFSelect_Selection): IFSelect_ReturnStatus;

NbSources(sel: IFSelect_Selection): number;

Source(sel: IFSelect_Selection, num?: number): IFSelect_Selection;

IsReversedSelectExtract(sel: IFSelect_Selection): boolean;

ToggleSelectExtract(sel: IFSelect_Selection): boolean;

SetInputSelection(sel: IFSelect_Selection, input: IFSelect_Selection): boolean;

SetControl(sel: IFSelect_Selection, sc: IFSelect_Selection, formain?: boolean): boolean;

CombineAdd(selcomb: IFSelect_Selection, seladd: IFSelect_Selection, atnum?: number): number;

CombineRemove(selcomb: IFSelect_Selection, selrem: IFSelect_Selection): boolean;

NewSelectPointed(list: NCollection_HSequence_handle_Standard_Transient, name: string): IFSelect_Selection;

SetSelectPointed(sel: IFSelect_Selection, list: NCollection_HSequence_handle_Standard_Transient, mode: number): boolean;

GiveSelection(selname: string): IFSelect_Selection;

GiveList(obj: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;
GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;
GiveList(obj: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;
GiveList(first: string, second: string): NCollection_HSequence_handle_Standard_Transient;

GiveListFromList(selname: string, ent: Standard_Transient): NCollection_HSequence_handle_Standard_Transient;

GiveListCombined(l1: NCollection_HSequence_handle_Standard_Transient, l2: NCollection_HSequence_handle_Standard_Transient, mode: number): NCollection_HSequence_handle_Standard_Transient;

QueryCheckStatus(ent: Standard_Transient): number;

QueryParent(entdad: Standard_Transient, entson: Standard_Transient): number;

SetParams(params: NCollection_DynamicArray_handle_Standard_Transient, uselist: NCollection_DynamicArray_int): void;

TraceStatics(use: number, mode?: number): void;

DumpShare(): void;

ListItems(label?: string): void;

ListFinalModifiers(formodel: boolean): void;

DumpSelection(sel: IFSelect_Selection): void;

TraceDumpModel(mode: number): void;

TraceDumpEntity(ent: Standard_Transient, level: number): void;

EvaluateSelection(sel: IFSelect_Selection): void;

EvaluateDispatch(disp: IFSelect_Dispatch, mode?: number): void;

EvaluateComplete(mode?: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

IFSelect_TSeqOfSelection: NCollection_Sequence_handle_IFSelect_Selection
