# libcascade — Interface (2)

19 top-level symbols. Signatures are verbatim typescript.

Interface_MSG: declare class Interface_MSG

constructor

Destroy(): void;

Value(): string;

static Read(file: string): number;

static IsKey(mess: string): boolean;

static Translated(key: string): string;

static Record(key: string, item: string): void;

static SetTrace(toprint: boolean, torecord: boolean): void;

static SetMode(running: boolean, raising: boolean): void;

static Intervalled(val: number, order?: number, upper?: boolean): number;

static TDate(text: string, yy: number, mm: number, dd: number, hh: number, mn: number, ss: number, format?: string): void;

static NDate(text: string, yy?: number, mm?: number, dd?: number, hh?: number, mn?: number, ss?: number): { returnValue: boolean; yy: number; mm: number; dd: number; hh: number; mn: number; ss: number };

static CDate(text1: string, text2: string): number;

static Blanks(count: number): string;
static Blanks(val: number, max: number): string;
static Blanks(val: string, max: number): string;
static Blanks(count: number): string;
static Blanks(val: number, max: number): string;
static Blanks(val: string, max: number): string;
static Blanks(count: number): string;
static Blanks(val: number, max: number): string;
static Blanks(val: string, max: number): string;

delete(): void;

[Symbol.dispose](): void;

Interface_NodeOfGeneralLib: declare class Interface_NodeOfGeneralLib extends Standard_Transient

constructor

AddNode(anode: Interface_GlobalNodeOfGeneralLib): void;

Protocol(): Interface_Protocol;

Next(): Interface_NodeOfGeneralLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_NodeOfReaderLib: declare class Interface_NodeOfReaderLib extends Standard_Transient

constructor

AddNode(anode: Interface_GlobalNodeOfReaderLib): void;

Module(): Interface_ReaderModule;

Protocol(): Interface_Protocol;

Next(): Interface_NodeOfReaderLib;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_ParamList: declare class Interface_ParamList extends Standard_Transient

constructor

Length(): number;

Lower(): number;

Upper(): number;

SetValue(Index: number, Value: Interface_FileParameter): void;

Value(Index: number): Interface_FileParameter;

ChangeValue(Index: number): Interface_FileParameter;

Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_ParamSet: declare class Interface_ParamSet extends Standard_Transient

constructor

Append(val: string, lnval: number, typ: Interface_ParamType, nument: number): number;
Append(FP: Interface_FileParameter): number;
Append(val: string, lnval: number, typ: Interface_ParamType, nument: number): number;
Append(FP: Interface_FileParameter): number;

NbParams(): number;

Param(num: number): Interface_FileParameter;

ChangeParam(num: number): Interface_FileParameter;

SetParam(num: number, FP: Interface_FileParameter): void;

Params(num: number, nb: number): Interface_ParamList;

Destroy(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_ParamType: typeof Interface_ParamType[keyof typeof Interface_ParamType]

Interface_Protocol: declare class Interface_Protocol extends Standard_Transient

static Active(): Interface_Protocol;

static SetActive(aprotocol: Interface_Protocol): void;

static ClearActive(): void;

NbResources(): number;

Resource(num: number): Interface_Protocol;

CaseNumber(obj: Standard_Transient): number;

IsDynamicType(obj: Standard_Transient): boolean;

NbTypes(obj: Standard_Transient): number;

Type(obj: Standard_Transient, nt?: number): Standard_Type;

TypeNumber(atype: Standard_Type): number;

NewModel(): Interface_InterfaceModel;

IsSuitableModel(model: Interface_InterfaceModel): boolean;

UnknownEntity(): Standard_Transient;

IsUnknownEntity(ent: Standard_Transient): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_ReaderLib: declare class Interface_ReaderLib

constructor

static SetGlobal(amodule: Interface_ReaderModule, aprotocol: Interface_Protocol): void;

AddProtocol(aprotocol: Standard_Transient): void;

Clear(): void;

SetComplete(): void;

Select(obj: Standard*Transient, CN?: number): { returnValue: boolean; module*: Interface_ReaderModule; CN: number; [Symbol.dispose](): void };

Start(): void;

More(): boolean;

Next(): void;

Module(): Interface_ReaderModule;

Protocol(): Interface_Protocol;

delete(): void;

[Symbol.dispose](): void;

Interface_ReaderModule: declare class Interface_ReaderModule extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_ReportEntity: declare class Interface_ReportEntity extends Standard_Transient

constructor

SetContent(content: Standard_Transient): void;

Check(): Interface_Check;

CCheck(): Interface_Check;

Concerned(): Standard_Transient;

HasContent(): boolean;

HasNewContent(): boolean;

Content(): Standard_Transient;

IsError(): boolean;

IsUnknown(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_STAT: declare class Interface_STAT

constructor

Internals(total?: number): { tit: TCollection_HAsciiString; total: number; phn: NCollection_HSequence_TCollection_AsciiString; phw: NCollection_HSequence_double; phdeb: NCollection_HSequence_int; phfin: NCollection_HSequence_int; stw: NCollection_HSequence_double; [Symbol.dispose](): void };

AddPhase(weight: number, name?: string): void;

AddStep(weight?: number): void;

Step(num: number): number;

Start(items: number, cycles?: number): void;

static StartCount(items: number, title?: string): void;

static NextPhase(items: number, cycles?: number): void;

static SetPhase(items: number, cycles?: number): void;

static NextCycle(items: number): void;

static NextStep(): void;

static NextItem(nbitems?: number): void;

static End(): void;

static Where(phase: boolean): string;

static Percent(phase?: boolean): number;

delete(): void;

[Symbol.dispose](): void;

Interface_ShareFlags: declare class Interface_ShareFlags

constructor

Model(): Interface_InterfaceModel;

IsShared(ent: Standard_Transient): boolean;

NbRoots(): number;

Root(num?: number): Standard_Transient;

delete(): void;

[Symbol.dispose](): void;

Interface_ShareTool: declare class Interface_ShareTool

constructor

Model(): Interface_InterfaceModel;

IsShared(ent: Standard_Transient): boolean;

NbTypedSharings(ent: Standard_Transient, atype: Standard_Type): number;

TypedSharing(ent: Standard_Transient, atype: Standard_Type): Standard_Transient;

delete(): void;

[Symbol.dispose](): void;

Interface_SignLabel: declare class Interface_SignLabel extends MoniTool_SignText

constructor

Name(): string;

Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_SignType: declare class Interface_SignType extends MoniTool_SignText

Text(ent: Standard_Transient, context: Standard_Transient): TCollection_AsciiString;

Value(ent: Standard_Transient, model: Interface_InterfaceModel): string;

static ClassName(typnam: string): string;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_Static: declare class Interface_Static extends Interface_TypedValue

constructor

Family(): string;

SetWild(wildcard: Interface_Static): void;

Wild(): Interface_Static;

SetUptodate(): void;

UpdatedStatus(): boolean;

static Init(family: string, name: string, type*: Interface_ParamType, init: string): boolean;
static Init(family: string, name: string, type*: string, init: string): boolean;
static Init(family: string, name: string, type*: Interface_ParamType, init: string): boolean;
static Init(family: string, name: string, type*: string, init: string): boolean;

static Static(name: string): Interface_Static;

static IsPresent(name: string): boolean;

static CDef(name: string, part: string): string;

static IDef(name: string, part: string): number;

static IsSet(name: string, proper?: boolean): boolean;

static CVal(name: string): string;

static IVal(name: string): number;

static RVal(name: string): number;

static SetCVal(name: string, val: string): boolean;

static SetIVal(name: string, val: number): boolean;

static SetRVal(name: string, val: number): boolean;

static Update(name: string): boolean;

static IsUpdated(name: string): boolean;

static Items(mode?: number, criter?: string): NCollection_HSequence_handle_TCollection_HAsciiString;

static Standards(): void;

static FillMap(theMap: NCollection_DataMap_TCollection_AsciiString_TCollection_AsciiString): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_TypedValue: declare class Interface_TypedValue extends MoniTool_TypedValue

constructor

Type(): Interface_ParamType;

static ParamTypeToValueType(typ: Interface_ParamType): MoniTool_ValueType;

static ValueTypeToParamType(typ: MoniTool_ValueType): Interface_ParamType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Interface_Array1OfHAsciiString: NCollection_Array1_handle_TCollection_HAsciiString

Interface_HArray1OfHAsciiString: NCollection_HArray1_handle_TCollection_HAsciiString
