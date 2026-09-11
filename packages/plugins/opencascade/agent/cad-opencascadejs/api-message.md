# libcascade — Message

27 top-level symbols. Signatures are verbatim typescript.

Message_Alert: declare class Message_Alert extends Standard_Transient

constructor

GetMessageKey(): string;

SupportsMerge(): boolean;

Merge(theTarget: Message_Alert): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Message_AlertExtended: declare class Message_AlertExtended extends Message_Alert

constructor

static AddAlert(theReport: Message_Report, theAttribute: Message_Attribute, theGravity: Message_Gravity): Message_Alert;

GetMessageKey(): string;

Attribute(): Message_Attribute;

SetAttribute(theAttribute: Message_Attribute): void;

CompositeAlerts(theToCreate?: boolean): Message_CompositeAlerts;

SupportsMerge(): boolean;

Merge(theTarget: Message_Alert): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Message_Algorithm: declare class Message_Algorithm extends Standard_Transient

constructor

SetStatus(theStat: Message_Status): void;
SetStatus(theStat: Message_Status, theInt: number): void;
SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status): void;
SetStatus(theStat: Message_Status, theInt: number): void;
SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status): void;
SetStatus(theStat: Message_Status, theInt: number): void;
SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status): void;
SetStatus(theStat: Message_Status, theInt: number): void;
SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status): void;
SetStatus(theStat: Message_Status, theInt: number): void;
SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status): void;
SetStatus(theStat: Message_Status, theInt: number): void;
SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status): void;
SetStatus(theStat: Message_Status, theInt: number): void;
SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status): void;
SetStatus(theStat: Message_Status, theInt: number): void;
SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;

GetStatus(): Message_ExecStatus;

ChangeStatus(): Message_ExecStatus;

ClearStatus(): void;

SendStatusMessages(theFilter: Message_ExecStatus, theTraceLevel?: Message_Gravity, theMaxCount?: number): void;

SendMessages(theTraceLevel?: Message_Gravity, theMaxCount?: number): void;

AddStatus(theOther: Message_Algorithm): void;
AddStatus(theStatus: Message_ExecStatus, theOther: Message_Algorithm): void;
AddStatus(theOther: Message_Algorithm): void;
AddStatus(theStatus: Message_ExecStatus, theOther: Message_Algorithm): void;

GetMessageNumbers(theStatus: Message_Status): TColStd_HPackedMapOfInteger;

GetMessageStrings(theStatus: Message_Status): NCollection_HSequence_handle_TCollection_HExtendedString;

static PrepareReport(theError: TColStd_HPackedMapOfInteger, theMaxCount: number): TCollection_ExtendedString;
static PrepareReport(theReportSeq: NCollection_Sequence_handle_TCollection_HExtendedString, theMaxCount: number): TCollection_ExtendedString;
static PrepareReport(theError: TColStd_HPackedMapOfInteger, theMaxCount: number): TCollection_ExtendedString;
static PrepareReport(theReportSeq: NCollection_Sequence_handle_TCollection_HExtendedString, theMaxCount: number): TCollection_ExtendedString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Message_Attribute: declare class Message_Attribute extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

GetMessageKey(): string;

GetName(): TCollection_AsciiString;

SetName(theName: TCollection_AsciiString): void;

delete(): void;

[Symbol.dispose](): void;

Message_AttributeMeter: declare class Message_AttributeMeter extends Message_Attribute

constructor

static UndefinedMetricValue(): number;

HasMetric(theMetric: Message_MetricType): boolean;

IsMetricValid(theMetric: Message_MetricType): boolean;

StartValue(theMetric: Message_MetricType): number;

SetStartValue(theMetric: Message_MetricType, theValue: number): void;

StopValue(theMetric: Message_MetricType): number;

SetStopValue(theMetric: Message_MetricType, theValue: number): void;

static StartAlert(theAlert: Message_AlertExtended): void;

static StopAlert(theAlert: Message_AlertExtended): void;

static SetAlertMetrics(theAlert: Message_AlertExtended, theStartValue: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Message_AttributeObject: declare class Message_AttributeObject extends Message_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Object(): Standard_Transient;

SetObject(theObject: Standard_Transient): void;

delete(): void;

[Symbol.dispose](): void;

Message_AttributeStream: declare class Message_AttributeStream extends Message_Attribute

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Message_CompositeAlerts: declare class Message_CompositeAlerts extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Alerts(theGravity: Message_Gravity): NCollection_List_handle_Message_Alert;

AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;

RemoveAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;

HasAlert(theAlert: Message_Alert): boolean;
HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;
HasAlert(theAlert: Message_Alert): boolean;
HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;

Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;
Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;
Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;

delete(): void;

[Symbol.dispose](): void;

Message_ExecStatus: declare class Message_ExecStatus

constructor

Set(theStatus: Message_Status): void;

IsSet(theStatus: Message_Status): boolean;

Clear(theStatus: Message_Status): void;
Clear(): void;
Clear(theStatus: Message_Status): void;
Clear(): void;

IsDone(): boolean;

IsFail(): boolean;

IsWarn(): boolean;

IsAlarm(): boolean;

SetAllDone(): void;

SetAllWarn(): void;

SetAllAlarm(): void;

SetAllFail(): void;

ClearAllDone(): void;

ClearAllWarn(): void;

ClearAllAlarm(): void;

ClearAllFail(): void;

Add(theOther: Message_ExecStatus): void;

And(theOther: Message_ExecStatus): void;

static StatusIndex(theStatus: Message_Status): number;

static LocalStatusIndex(theStatus: Message_Status): number;

static TypeOfStatus(theStatus: Message_Status): Message_StatusType;

static StatusByIndex(theIndex: number): Message_Status;

delete(): void;

[Symbol.dispose](): void;

Message_ExecStatus_StatusRange: typeof Message_ExecStatus_StatusRange[keyof typeof Message_ExecStatus_StatusRange]

Message_Gravity: typeof Message_Gravity[keyof typeof Message_Gravity]

Message_Level: declare class Message_Level

constructor

RootAlert(): Message_AlertExtended;

SetRootAlert(theAlert: Message_AlertExtended, isRequiredToStart: boolean): void;

AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;

delete(): void;

[Symbol.dispose](): void;

Message_MetricType: typeof Message_MetricType[keyof typeof Message_MetricType]

Message_Msg: declare class Message_Msg

constructor

Set(theMsg: string): void;
Set(theMsg: TCollection_ExtendedString): void;
Set(theMsg: string): void;
Set(theMsg: TCollection_ExtendedString): void;

Arg(theString: string): Message_Msg;
Arg(theString: TCollection_AsciiString): Message_Msg;
Arg(theString: TCollection_HAsciiString): Message_Msg;
Arg(theString: TCollection_ExtendedString): Message_Msg;
Arg(theString: TCollection_HExtendedString): Message_Msg;
Arg(theInt: number): Message_Msg;
Arg(theReal: number): Message_Msg;
Arg(theString: string): Message_Msg;
Arg(theString: TCollection_AsciiString): Message_Msg;
Arg(theString: TCollection_HAsciiString): Message_Msg;
Arg(theString: TCollection_ExtendedString): Message_Msg;
Arg(theString: TCollection_HExtendedString): Message_Msg;
Arg(theInt: number): Message_Msg;
Arg(theReal: number): Message_Msg;
Arg(theString: string): Message_Msg;
Arg(theString: TCollection_AsciiString): Message_Msg;
Arg(theString: TCollection_HAsciiString): Message_Msg;
Arg(theString: TCollection_ExtendedString): Message_Msg;
Arg(theString: TCollection_HExtendedString): Message_Msg;
Arg(theInt: number): Message_Msg;
Arg(theReal: number): Message_Msg;
Arg(theString: string): Message_Msg;
Arg(theString: TCollection_AsciiString): Message_Msg;
Arg(theString: TCollection_HAsciiString): Message_Msg;
Arg(theString: TCollection_ExtendedString): Message_Msg;
Arg(theString: TCollection_HExtendedString): Message_Msg;
Arg(theInt: number): Message_Msg;
Arg(theReal: number): Message_Msg;
Arg(theString: string): Message_Msg;
Arg(theString: TCollection_AsciiString): Message_Msg;
Arg(theString: TCollection_HAsciiString): Message_Msg;
Arg(theString: TCollection_ExtendedString): Message_Msg;
Arg(theString: TCollection_HExtendedString): Message_Msg;
Arg(theInt: number): Message_Msg;
Arg(theReal: number): Message_Msg;
Arg(theString: string): Message_Msg;
Arg(theString: TCollection_AsciiString): Message_Msg;
Arg(theString: TCollection_HAsciiString): Message_Msg;
Arg(theString: TCollection_ExtendedString): Message_Msg;
Arg(theString: TCollection_HExtendedString): Message_Msg;
Arg(theInt: number): Message_Msg;
Arg(theReal: number): Message_Msg;
Arg(theString: string): Message_Msg;
Arg(theString: TCollection_AsciiString): Message_Msg;
Arg(theString: TCollection_HAsciiString): Message_Msg;
Arg(theString: TCollection_ExtendedString): Message_Msg;
Arg(theString: TCollection_HExtendedString): Message_Msg;
Arg(theInt: number): Message_Msg;
Arg(theReal: number): Message_Msg;

Original(): TCollection_ExtendedString;

Value(): TCollection_ExtendedString;

IsEdited(): boolean;

Get(): TCollection_ExtendedString;

delete(): void;

[Symbol.dispose](): void;

Message_MsgFile: declare class Message_MsgFile

constructor

static Load(theDirName: string, theFileName: string): boolean;

static LoadFile(theFName: string): boolean;

static LoadFromEnv(theEnvName: string, theFileName: string, theLangExt?: string): boolean;

static LoadFromString(theContent: string, theLength?: number): boolean;

static AddMsg(key: TCollection_AsciiString, text: TCollection_ExtendedString): boolean;

static HasMsg(key: TCollection_AsciiString): boolean;

static Msg(key: string): TCollection_ExtendedString;
static Msg(key: TCollection_AsciiString): TCollection_ExtendedString;
static Msg(key: string): TCollection_ExtendedString;
static Msg(key: TCollection_AsciiString): TCollection_ExtendedString;

delete(): void;

[Symbol.dispose](): void;

Message_Printer: declare class Message_Printer extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

GetTraceLevel(): Message_Gravity;

SetTraceLevel(theTraceLevel: Message_Gravity): void;

// DEPRECATED
Send(theString: TCollection_ExtendedString, theGravity: Message_Gravity): void;
Send(theString: string, theGravity: Message_Gravity): void;
Send(theString: TCollection_AsciiString, theGravity: Message_Gravity): void;
Send(theString: TCollection_ExtendedString, theGravity: Message_Gravity): void;
Send(theString: string, theGravity: Message_Gravity): void;
Send(theString: TCollection_AsciiString, theGravity: Message_Gravity): void;
Send(theString: TCollection_ExtendedString, theGravity: Message_Gravity): void;
Send(theString: string, theGravity: Message_Gravity): void;
Send(theString: TCollection_AsciiString, theGravity: Message_Gravity): void;

SendObject(theObject: Standard_Transient, theGravity: Message_Gravity): void;

delete(): void;

[Symbol.dispose](): void;

Message_PrinterOStream: declare class Message_PrinterOStream extends Message_Printer

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Close(): void;

ToColorize(): boolean;

SetToColorize(theToColorize: boolean): void;

delete(): void;

[Symbol.dispose](): void;

Message_PrinterToReport: declare class Message_PrinterToReport extends Message_Printer

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Report(): Message_Report;

SetReport(theReport: Message_Report): void;

SendObject(theObject: Standard_Transient, theGravity: Message_Gravity): void;

delete(): void;

[Symbol.dispose](): void;

Message_ProgressIndicator: declare class Message_ProgressIndicator extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Start(): Message_ProgressRange;
static Start(theProgress: Message_ProgressIndicator): Message_ProgressRange;

GetPosition(): number;

delete(): void;

[Symbol.dispose](): void;

Message_ProgressRange: declare class Message_ProgressRange

constructor

UserBreak(): boolean;

More(): boolean;

IsActive(): boolean;

Close(): void;

delete(): void;

[Symbol.dispose](): void;

Message_ProgressScope: declare class Message_ProgressScope

constructor

SetName(theName: TCollection_AsciiString): void;

UserBreak(): boolean;

More(): boolean;

Next(theStep?: number): Message_ProgressRange;

Show(): void;

IsActive(): boolean;

Name(): string;

Parent(): Message_ProgressScope;

MaxValue(): number;

Value(): number;

IsInfinite(): boolean;

GetPortion(): number;

Close(): void;

delete(): void;

[Symbol.dispose](): void;

Message_ProgressSentry: declare class Message_ProgressSentry extends Message_ProgressScope

constructor

Relieve(): void;

delete(): void;

[Symbol.dispose](): void;

Message_Report: declare class Message_Report extends Standard_Transient

constructor

AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): void;

GetAlerts(theGravity: Message_Gravity): NCollection_List_handle_Message_Alert;

HasAlert(theType: Standard_Type): boolean;
HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;
HasAlert(theType: Standard_Type): boolean;
HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;

AddLevel(theLevel: Message_Level, theName: TCollection_AsciiString): void;

RemoveLevel(theLevel: Message_Level): void;

Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;
Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;
Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;

ActiveMetrics(): NCollection_IndexedMap_Message_MetricType;

SetActiveMetric(theMetricType: Message_MetricType, theActivate: boolean): void;

ClearMetrics(): void;

Limit(): number;

SetLimit(theLimit: number): void;

Merge(theOther: Message_Report): void;
Merge(theOther: Message_Report, theGravity: Message_Gravity): void;
Merge(theOther: Message_Report): void;
Merge(theOther: Message_Report, theGravity: Message_Gravity): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

Message_Status: typeof Message_Status[keyof typeof Message_Status]

Message_StatusType: typeof Message_StatusType[keyof typeof Message_StatusType]

Message_ListOfAlert: NCollection_List_handle_Message_Alert

Message_ListOfMsg: NCollection_List_Message_Msg
