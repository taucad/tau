# libcascade — Message

19 top-level symbols. Signatures are verbatim typescript.

// Base class of the hierarchy of classes describing various situations occurring during execution of some algorithm or procedure
Message_Alert: declare class Message_Alert extends Standard_Transient

constructor

// Return a C string to be used as a key for generating text user messages describing this alert
GetMessageKey(): string;

// Return true if this type of alert can be merged with other of the same type to avoid duplication
SupportsMerge(): boolean;

// If possible, merge data contained in this alert to theTarget
Merge(theTarget: Message_Alert): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Inherited class of {@link Message_Alert`Message_Alert`} with some additional information
Message_AlertExtended: declare class Message_AlertExtended extends Message_Alert

constructor

// Creates new instance of the alert and put it into report with Message_Info gravity
static AddAlert(theReport: Message_Report, theAttribute: Message_Attribute, theGravity: Message_Gravity): Message_Alert;
// theReport: the message report where new alert is placed
// theAttribute: container of additional values of the alert

// Return a C string to be used as a key for generating text user messages describing this alert
GetMessageKey(): string;

// Returns container of the alert attributes
Attribute(): Message_Attribute;

// Sets container of the alert attributes
SetAttribute(theAttribute: Message_Attribute): void;

// Returns class provided hierarchy of alerts if created or create if the parameter is true
CompositeAlerts(theToCreate?: boolean): Message_CompositeAlerts;
// theToCreate: if composite alert has not been created for this alert, it should be created

// Return true if this type of alert can be merged with other of the same type to avoid duplication
SupportsMerge(): boolean;

// If possible, merge data contained in this alert to theTarget
Merge(theTarget: Message_Alert): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class {@link Message_Algorithm`Message_Algorithm`} is intended to be the base class for classes implementing algorithms or any operations that need to provide extended information on its execution to the caller / user
Message_Algorithm: declare class Message_Algorithm extends Standard_Transient

constructor

// Sets status with no parameter
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

// Returns copy of exec status of algorithm
GetStatus(): Message_ExecStatus;

// Returns exec status of algorithm
ChangeStatus(): Message_ExecStatus;

// Clear exec status of algorithm
ClearStatus(): void;

// Print messages for all status flags that have been set during algorithm execution, excluding statuses that are NOT set in theFilter
SendStatusMessages(theFilter: Message_ExecStatus, theTraceLevel?: Message_Gravity, theMaxCount?: number): void;

// Convenient variant of `SendStatusMessages()` with theFilter having defined all WARN, ALARM, and FAIL (but not DONE) status flags
SendMessages(theTraceLevel?: Message_Gravity, theMaxCount?: number): void;

// Add statuses to this algorithm from other algorithm (including messages) Add statuses to this algorithm from other algorithm, but only those items are moved that correspond to statuses set in theStatus
AddStatus(theOther: Message_Algorithm): void;
AddStatus(theStatus: Message_ExecStatus, theOther: Message_Algorithm): void;
AddStatus(theOther: Message_Algorithm): void;
AddStatus(theStatus: Message_ExecStatus, theOther: Message_Algorithm): void;

// Return the numbers associated with the indicated status
GetMessageNumbers(theStatus: Message_Status): TColStd_HPackedMapOfInteger;

// Return the strings associated with the indicated status
GetMessageStrings(theStatus: Message_Status): NCollection_HSequence_handle_TCollection_HExtendedString;

// Prepares a string containing a list of integers contained in theError map, but not more than theMaxCount
static PrepareReport(theError: TColStd_HPackedMapOfInteger, theMaxCount: number): TCollection_ExtendedString;
static PrepareReport(theReportSeq: NCollection_Sequence_handle_TCollection_HExtendedString, theMaxCount: number): TCollection_ExtendedString;
static PrepareReport(theError: TColStd_HPackedMapOfInteger, theMaxCount: number): TCollection_ExtendedString;
static PrepareReport(theReportSeq: NCollection_Sequence_handle_TCollection_HExtendedString, theMaxCount: number): TCollection_ExtendedString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Additional information of extended alert attribute To provide other custom attribute container, it might be redefined
Message_Attribute: declare class Message_Attribute extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return a C string to be used as a key for generating text user messages describing this alert
GetMessageKey(): string;

// Returns custom name of alert if it is set
GetName(): TCollection_AsciiString;

// Sets the custom name of alert
SetName(theName: TCollection_AsciiString): void;
// theName: a name for the alert

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Alert object storing alert metrics values
Message_AttributeMeter: declare class Message_AttributeMeter extends Message_Attribute

constructor

// Returns default value of the metric when it is not defined
static UndefinedMetricValue(): number;

// Checks whether the attribute has values for the metric
HasMetric(theMetric: Message_MetricType): boolean;
// theMetric: metric type

// Returns true when both values of the metric are set
IsMetricValid(theMetric: Message_MetricType): boolean;
// theMetric: metric type

// Returns start value for the metric
StartValue(theMetric: Message_MetricType): number;
// theMetric: metric type

// Sets start values for the metric
SetStartValue(theMetric: Message_MetricType, theValue: number): void;
// theMetric: metric type

// Returns stop value for the metric
StopValue(theMetric: Message_MetricType): number;
// theMetric: metric type

// Sets stop values for the metric
SetStopValue(theMetric: Message_MetricType, theValue: number): void;
// theMetric: metric type

// Sets start values of default report metrics into the alert
static StartAlert(theAlert: Message_AlertExtended): void;
// theAlert: an alert

// Sets stop values of default report metrics into the alert
static StopAlert(theAlert: Message_AlertExtended): void;
// theAlert: an alert

// Sets current values of default report metrics into the alert
static SetAlertMetrics(theAlert: Message_AlertExtended, theStartValue: boolean): void;
// theAlert: an alert
// theStartValue: flag, if true, the start value is collected otherwise stop

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Alert object storing a transient object
Message_AttributeObject: declare class Message_AttributeObject extends Message_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns object
Object(): Standard_Transient;

// Sets the object
SetObject(theObject: Standard_Transient): void;
// theObject: an instance

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Alert object storing stream value
Message_AttributeStream: declare class Message_AttributeStream extends Message_Attribute

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class providing container of alerts
Message_CompositeAlerts: declare class Message_CompositeAlerts extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns list of collected alerts with specified gravity
Alerts(theGravity: Message_Gravity): NCollection_List_handle_Message_Alert;

// Add alert with specified gravity
AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;
// theGravity: an alert gravity
// theAlert: an alert to be added as a child alert

// Removes alert with specified gravity
RemoveAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;
// theGravity: an alert gravity
// theAlert: an alert to be removed from the children

// Returns true if the alert belong the list of the child alerts
HasAlert(theAlert: Message_Alert): boolean;
HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;
HasAlert(theAlert: Message_Alert): boolean;
HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;
// theAlert: an alert to be checked as a child alert

// Clears all collected alerts
Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;
Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;
Clear(): void;
Clear(theGravity: Message_Gravity): void;
Clear(theType: Standard_Type): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tiny class for extended handling of error / execution status of algorithm in universal way
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Message_ExecStatus_StatusRange: typeof Message_ExecStatus_StatusRange[keyof typeof Message_ExecStatus_StatusRange]

// Defines gravity level of messages
Message_Gravity: typeof Message_Gravity[keyof typeof Message_Gravity]

// This class is an instance of Sentry to create a level in a message report Constructor of the class add new (active) level in the report, destructor removes it While the level is active in the report, new alerts are added below the level root alert
Message_Level: declare class Message_Level

constructor

// Returns root alert of the level
RootAlert(): Message_AlertExtended;

// Sets the root alert
SetRootAlert(theAlert: Message_AlertExtended, isRequiredToStart: boolean): void;
// theAlert: an alert

// Adds new alert on the level
AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;
// theGravity: an alert gravity
// theAlert: an alert

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Specifies kind of report information to collect
Message_MetricType: typeof Message_MetricType[keyof typeof Message_MetricType]

// This class provides a tool for constructing the parametrized message basing on resources loaded by {@link Message_MsgFile`Message_MsgFile`} tool
Message_Msg: declare class Message_Msg

constructor

// Set a message body text - can be used as alternative to using messages from resource file
Set(theMsg: string): void;
Set(theMsg: TCollection_ExtendedString): void;
Set(theMsg: string): void;
Set(theMsg: TCollection_ExtendedString): void;

// Set a value for %..s conversion
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

// Returns the original message text
Original(): TCollection_ExtendedString;

// Returns current state of the message text with parameters to the moment
Value(): TCollection_ExtendedString;

// Tells if Value differs from Original
IsEdited(): boolean;

// Return the resulting message string with all parameters filled
Get(): TCollection_ExtendedString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A tool providing facility to load definitions of message strings from resource file(s)
Message_MsgFile: declare class Message_MsgFile

constructor

// Load message file <theFileName> from directory <theDirName> or its sub-directory
static Load(theDirName: string, theFileName: string): boolean;

// Load the messages from the given file, additive to any previously loaded messages
static LoadFile(theFName: string): boolean;

static LoadFromEnv(theEnvName: string, theFileName: string, theLangExt?: string): boolean;

static LoadFromString(theContent: string, theLength?: number): boolean;

static AddMsg(key: TCollection_AsciiString, text: TCollection_ExtendedString): boolean;

static HasMsg(key: TCollection_AsciiString): boolean;

static Msg(key: string): TCollection_ExtendedString;
static Msg(key: TCollection_AsciiString): TCollection_ExtendedString;
static Msg(key: string): TCollection_ExtendedString;
static Msg(key: TCollection_AsciiString): TCollection_ExtendedString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Abstract interface class defining printer as output context for text messages
Message_Printer: declare class Message_Printer extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return trace level used for filtering messages
GetTraceLevel(): Message_Gravity;

// Set trace level used for filtering messages
SetTraceLevel(theTraceLevel: Message_Gravity): void;

// Send a string message with specified trace level
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

// Send a string message with specified trace level
SendObject(theObject: Standard_Transient, theGravity: Message_Gravity): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation of a message printer associated with an std::ostream The std::ostream may be either externally defined one (e.g
Message_PrinterOStream: declare class Message_PrinterOStream extends Message_Printer

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Flushes the output stream and destroys it if it has been specified externally with option doFree (or if it is internal file stream)
Close(): void;

// Returns TRUE if text output into console should be colorized depending on message gravity
ToColorize(): boolean;

// Set if text output into console should be colorized depending on message gravity
SetToColorize(theToColorize: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Implementation of a message printer associated with {@link Message_Report`Message_Report`} Send will create a new alert of the report
Message_PrinterToReport: declare class Message_PrinterToReport extends Message_Printer

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns the current or default report
Report(): Message_Report;

// Sets the printer report
SetReport(theReport: Message_Report): void;
// theReport: report for messages processing, if NULL, the default report is used

// Send a string message with specified trace level
SendObject(theObject: Standard_Transient, theGravity: Message_Gravity): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines abstract interface from program to the user
Message_ProgressIndicator: declare class Message_ProgressIndicator extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Start(): Message_ProgressRange;
static Start(theProgress: Message_ProgressIndicator): Message_ProgressRange;

GetPosition(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
