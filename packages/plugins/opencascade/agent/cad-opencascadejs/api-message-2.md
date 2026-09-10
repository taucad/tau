# libcascade — Message (2)

8 top-level symbols. Signatures are verbatim typescript.

// Auxiliary class representing a part of the global progress scale allocated by a step of the progress scope, see `Message_ProgressScope::Next()`
Message_ProgressRange: declare class Message_ProgressRange

constructor

// Returns true if ProgressIndicator signals UserBreak
UserBreak(): boolean;

// Returns false if ProgressIndicator signals UserBreak
More(): boolean;

// Returns true if this progress range is attached to some indicator
IsActive(): boolean;

// Closes the current range and advances indicator
Close(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link Message_ProgressScope`Message_ProgressScope`} class provides convenient way to advance progress indicator in context of complex program organized in hierarchical way, where usually it is difficult (or even not possible) to consider process as linear with fixed step
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Functionality of this class ({@link Message_ProgressSentry`Message_ProgressSentry`}) has been superseded by {@link Message_ProgressScope`Message_ProgressScope`}
Message_ProgressSentry: declare class Message_ProgressSentry extends Message_ProgressScope

constructor

// Method `Relieve()` was replaced by `Close()` in {@link Message_ProgressScope`Message_ProgressScope`}
Relieve(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Container for alert messages, sorted according to their gravity
Message_Report: declare class Message_Report extends Standard_Transient

constructor

// Add alert with specified gravity
AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): void;

// Returns list of collected alerts with specified gravity
GetAlerts(theGravity: Message_Gravity): NCollection_List_handle_Message_Alert;

// Returns true if specific type of alert is recorded
HasAlert(theType: Standard_Type): boolean;
HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;
HasAlert(theType: Standard_Type): boolean;
HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;

// Add new level of alerts
AddLevel(theLevel: Message_Level, theName: TCollection_AsciiString): void;
// theLevel: a level

// Remove level of alerts
RemoveLevel(theLevel: Message_Level): void;

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

// Returns computed metrics when alerts are performed
ActiveMetrics(): NCollection_IndexedMap_Message_MetricType;

// Sets metrics to compute when alerts are performed
SetActiveMetric(theMetricType: Message_MetricType, theActivate: boolean): void;

// Removes all activated metrics
ClearMetrics(): void;

// Returns maximum number of collecting alerts
Limit(): number;

// Sets maximum number of collecting alerts
SetLimit(theLimit: number): void;
// theLimit: limit value

// Merges data from theOther report into this
Merge(theOther: Message_Report): void;
Merge(theOther: Message_Report, theGravity: Message_Gravity): void;
Merge(theOther: Message_Report): void;
Merge(theOther: Message_Report, theGravity: Message_Gravity): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumeration covering all execution statuses supported by the class {@link Message_ExecStatus`Message_ExecStatus`}
Message_Status: typeof Message_Status[keyof typeof Message_Status]

// Definition of types of execution status supported by the class {@link Message_ExecStatus`Message_ExecStatus`}
Message_StatusType: typeof Message_StatusType[keyof typeof Message_StatusType]

Message_ListOfAlert: NCollection_List_handle_Message_Alert

Message_ListOfMsg: NCollection_List_Message_Msg
