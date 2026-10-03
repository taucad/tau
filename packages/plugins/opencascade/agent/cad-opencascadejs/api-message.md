# libcascade — Message

27 top-level symbols. Signatures are verbatim typescript.

Message_Alert: declare class Message_Alert extends Standard_Transient

  // Message_Alert.constructor (constructor)
  constructor();

  // Message_Alert.GetMessageKey (method)
  GetMessageKey(): string;

  // Message_Alert.SupportsMerge (method)
  SupportsMerge(): boolean;

  // Message_Alert.Merge (method)
  Merge(theTarget: Message_Alert): boolean;

  // Message_Alert.get_type_name (method)
  static get_type_name(): string;

  // Message_Alert.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_Alert.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_Alert.delete (method)
  delete(): void;

  // Message_Alert.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_AlertExtended: declare class Message_AlertExtended extends Message_Alert

  // Message_AlertExtended.constructor (constructor)
  constructor();

  // Message_AlertExtended.AddAlert (method)
  static AddAlert(theReport: Message_Report, theAttribute: Message_Attribute, theGravity: Message_Gravity): Message_Alert;

  // Message_AlertExtended.GetMessageKey (method)
  GetMessageKey(): string;

  // Message_AlertExtended.Attribute (method)
  Attribute(): Message_Attribute;

  // Message_AlertExtended.SetAttribute (method)
  SetAttribute(theAttribute: Message_Attribute): void;

  // Message_AlertExtended.CompositeAlerts (method)
  CompositeAlerts(theToCreate?: boolean): Message_CompositeAlerts;

  // Message_AlertExtended.SupportsMerge (method)
  SupportsMerge(): boolean;

  // Message_AlertExtended.Merge (method)
  Merge(theTarget: Message_Alert): boolean;

  // Message_AlertExtended.get_type_name (method)
  static get_type_name(): string;

  // Message_AlertExtended.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_AlertExtended.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_AlertExtended.delete (method)
  delete(): void;

  // Message_AlertExtended.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_Algorithm: declare class Message_Algorithm extends Standard_Transient

  // Message_Algorithm.constructor (constructor)
  constructor();

  // Message_Algorithm.SetStatus (method)
  SetStatus(theStat: Message_Status): void;
  SetStatus(theStat: Message_Status, theInt: number): void;
  SetStatus(theStat: Message_Status, theMsg: Message_Msg): void;
  SetStatus(theStat: Message_Status, theStr: string, noRepetitions: boolean): void;
  SetStatus(theStat: Message_Status, theStr: TCollection_AsciiString, noRepetitions: boolean): void;
  SetStatus(theStat: Message_Status, theStr: TCollection_HAsciiString, noRepetitions: boolean): void;
  SetStatus(theStat: Message_Status, theStr: TCollection_ExtendedString, noRepetitions: boolean): void;
  SetStatus(theStat: Message_Status, theStr: TCollection_HExtendedString, noRepetitions: boolean): void;

  // Message_Algorithm.GetStatus (method)
  GetStatus(): Message_ExecStatus;

  // Message_Algorithm.ChangeStatus (method)
  ChangeStatus(): Message_ExecStatus;

  // Message_Algorithm.ClearStatus (method)
  ClearStatus(): void;

  // Message_Algorithm.SendStatusMessages (method)
  SendStatusMessages(theFilter: Message_ExecStatus, theTraceLevel?: Message_Gravity, theMaxCount?: number): void;

  // Message_Algorithm.SendMessages (method)
  SendMessages(theTraceLevel?: Message_Gravity, theMaxCount?: number): void;

  // Message_Algorithm.AddStatus (method)
  AddStatus(theOther: Message_Algorithm): void;
  AddStatus(theStatus: Message_ExecStatus, theOther: Message_Algorithm): void;

  // Message_Algorithm.GetMessageNumbers (method)
  GetMessageNumbers(theStatus: Message_Status): TColStd_HPackedMapOfInteger;

  // Message_Algorithm.GetMessageStrings (method)
  GetMessageStrings(theStatus: Message_Status): NCollection_HSequence_handle_TCollection_HExtendedString;

  // Message_Algorithm.PrepareReport (method)
  static PrepareReport(theError: TColStd_HPackedMapOfInteger, theMaxCount: number): TCollection_ExtendedString;
  static PrepareReport(theReportSeq: NCollection_Sequence_handle_TCollection_HExtendedString, theMaxCount: number): TCollection_ExtendedString;

  // Message_Algorithm.get_type_name (method)
  static get_type_name(): string;

  // Message_Algorithm.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_Algorithm.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_Algorithm.delete (method)
  delete(): void;

  // Message_Algorithm.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_Attribute: declare class Message_Attribute extends Standard_Transient

  // Message_Attribute.constructor (constructor)
  constructor(theName?: TCollection_AsciiString);

  // Message_Attribute.get_type_name (method)
  static get_type_name(): string;

  // Message_Attribute.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_Attribute.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_Attribute.GetMessageKey (method)
  GetMessageKey(): string;

  // Message_Attribute.GetName (method)
  GetName(): TCollection_AsciiString;

  // Message_Attribute.SetName (method)
  SetName(theName: TCollection_AsciiString): void;

  // Message_Attribute.delete (method)
  delete(): void;

  // Message_Attribute.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_AttributeMeter: declare class Message_AttributeMeter extends Message_Attribute

  // Message_AttributeMeter.constructor (constructor)
  constructor(theName?: TCollection_AsciiString);

  // Message_AttributeMeter.UndefinedMetricValue (method)
  static UndefinedMetricValue(): number;

  // Message_AttributeMeter.HasMetric (method)
  HasMetric(theMetric: Message_MetricType): boolean;

  // Message_AttributeMeter.IsMetricValid (method)
  IsMetricValid(theMetric: Message_MetricType): boolean;

  // Message_AttributeMeter.StartValue (method)
  StartValue(theMetric: Message_MetricType): number;

  // Message_AttributeMeter.SetStartValue (method)
  SetStartValue(theMetric: Message_MetricType, theValue: number): void;

  // Message_AttributeMeter.StopValue (method)
  StopValue(theMetric: Message_MetricType): number;

  // Message_AttributeMeter.SetStopValue (method)
  SetStopValue(theMetric: Message_MetricType, theValue: number): void;

  // Message_AttributeMeter.StartAlert (method)
  static StartAlert(theAlert: Message_AlertExtended): void;

  // Message_AttributeMeter.StopAlert (method)
  static StopAlert(theAlert: Message_AlertExtended): void;

  // Message_AttributeMeter.SetAlertMetrics (method)
  static SetAlertMetrics(theAlert: Message_AlertExtended, theStartValue: boolean): void;

  // Message_AttributeMeter.get_type_name (method)
  static get_type_name(): string;

  // Message_AttributeMeter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_AttributeMeter.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_AttributeMeter.delete (method)
  delete(): void;

  // Message_AttributeMeter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_AttributeObject: declare class Message_AttributeObject extends Message_Attribute

  // Message_AttributeObject.constructor (constructor)
  constructor(theObject: Standard_Transient, theName?: TCollection_AsciiString);

  // Message_AttributeObject.get_type_name (method)
  static get_type_name(): string;

  // Message_AttributeObject.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_AttributeObject.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_AttributeObject.Object (method)
  Object(): Standard_Transient;

  // Message_AttributeObject.SetObject (method)
  SetObject(theObject: Standard_Transient): void;

  // Message_AttributeObject.delete (method)
  delete(): void;

  // Message_AttributeObject.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_AttributeStream: declare class Message_AttributeStream extends Message_Attribute

  // Message_AttributeStream.get_type_name (method)
  static get_type_name(): string;

  // Message_AttributeStream.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_AttributeStream.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_AttributeStream.delete (method)
  delete(): void;

  // Message_AttributeStream.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_CompositeAlerts: declare class Message_CompositeAlerts extends Standard_Transient

  // Message_CompositeAlerts.constructor (constructor)
  constructor();

  // Message_CompositeAlerts.get_type_name (method)
  static get_type_name(): string;

  // Message_CompositeAlerts.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_CompositeAlerts.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_CompositeAlerts.Alerts (method)
  Alerts(theGravity: Message_Gravity): NCollection_List_handle_Message_Alert;

  // Message_CompositeAlerts.AddAlert (method)
  AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;

  // Message_CompositeAlerts.RemoveAlert (method)
  RemoveAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;

  // Message_CompositeAlerts.HasAlert (method)
  HasAlert(theAlert: Message_Alert): boolean;
  HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;

  // Message_CompositeAlerts.Clear (method)
  Clear(): void;
  Clear(theGravity: Message_Gravity): void;
  Clear(theType: Standard_Type): void;

  // Message_CompositeAlerts.delete (method)
  delete(): void;

  // Message_CompositeAlerts.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_ExecStatus: declare class Message_ExecStatus

  // Message_ExecStatus.constructor (constructor)
  constructor();
  constructor(theStatus: Message_Status);

  // Message_ExecStatus.Set (method)
  Set(theStatus: Message_Status): void;

  // Message_ExecStatus.IsSet (method)
  IsSet(theStatus: Message_Status): boolean;

  // Message_ExecStatus.Clear (method)
  Clear(theStatus: Message_Status): void;
  Clear(): void;

  // Message_ExecStatus.IsDone (method)
  IsDone(): boolean;

  // Message_ExecStatus.IsFail (method)
  IsFail(): boolean;

  // Message_ExecStatus.IsWarn (method)
  IsWarn(): boolean;

  // Message_ExecStatus.IsAlarm (method)
  IsAlarm(): boolean;

  // Message_ExecStatus.SetAllDone (method)
  SetAllDone(): void;

  // Message_ExecStatus.SetAllWarn (method)
  SetAllWarn(): void;

  // Message_ExecStatus.SetAllAlarm (method)
  SetAllAlarm(): void;

  // Message_ExecStatus.SetAllFail (method)
  SetAllFail(): void;

  // Message_ExecStatus.ClearAllDone (method)
  ClearAllDone(): void;

  // Message_ExecStatus.ClearAllWarn (method)
  ClearAllWarn(): void;

  // Message_ExecStatus.ClearAllAlarm (method)
  ClearAllAlarm(): void;

  // Message_ExecStatus.ClearAllFail (method)
  ClearAllFail(): void;

  // Message_ExecStatus.Add (method)
  Add(theOther: Message_ExecStatus): void;

  // Message_ExecStatus.And (method)
  And(theOther: Message_ExecStatus): void;

  // Message_ExecStatus.StatusIndex (method)
  static StatusIndex(theStatus: Message_Status): number;

  // Message_ExecStatus.LocalStatusIndex (method)
  static LocalStatusIndex(theStatus: Message_Status): number;

  // Message_ExecStatus.TypeOfStatus (method)
  static TypeOfStatus(theStatus: Message_Status): Message_StatusType;

  // Message_ExecStatus.StatusByIndex (method)
  static StatusByIndex(theIndex: number): Message_Status;

  // Message_ExecStatus.delete (method)
  delete(): void;

  // Message_ExecStatus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_ExecStatus_StatusRange: typeof Message_ExecStatus_StatusRange[keyof typeof Message_ExecStatus_StatusRange]

Message_Gravity: typeof Message_Gravity[keyof typeof Message_Gravity]

Message_Level: declare class Message_Level

  // Message_Level.constructor (constructor)
  constructor(theName?: TCollection_AsciiString);

  // Message_Level.RootAlert (method)
  RootAlert(): Message_AlertExtended;

  // Message_Level.SetRootAlert (method)
  SetRootAlert(theAlert: Message_AlertExtended, isRequiredToStart: boolean): void;

  // Message_Level.AddAlert (method)
  AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): boolean;

  // Message_Level.delete (method)
  delete(): void;

  // Message_Level.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_MetricType: typeof Message_MetricType[keyof typeof Message_MetricType]

Message_Msg: declare class Message_Msg

  // Message_Msg.constructor (constructor)
  constructor();
  constructor(theMsg: Message_Msg);
  constructor(theKey: string);
  constructor(theKey: TCollection_ExtendedString);

  // Message_Msg.Set (method)
  Set(theMsg: string): void;
  Set(theMsg: TCollection_ExtendedString): void;

  // Message_Msg.Arg (method)
  Arg(theString: string): Message_Msg;
  Arg(theString: TCollection_AsciiString): Message_Msg;
  Arg(theString: TCollection_HAsciiString): Message_Msg;
  Arg(theString: TCollection_ExtendedString): Message_Msg;
  Arg(theString: TCollection_HExtendedString): Message_Msg;
  Arg(theInt: number): Message_Msg;
  Arg(theReal: number): Message_Msg;

  // Message_Msg.Original (method)
  Original(): TCollection_ExtendedString;

  // Message_Msg.Value (method)
  Value(): TCollection_ExtendedString;

  // Message_Msg.IsEdited (method)
  IsEdited(): boolean;

  // Message_Msg.Get (method)
  Get(): TCollection_ExtendedString;

  // Message_Msg.delete (method)
  delete(): void;

  // Message_Msg.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_MsgFile: declare class Message_MsgFile

  // Message_MsgFile.constructor (constructor)
  constructor();

  // Message_MsgFile.Load (method)
  static Load(theDirName: string, theFileName: string): boolean;

  // Message_MsgFile.LoadFile (method)
  static LoadFile(theFName: string): boolean;

  // Message_MsgFile.LoadFromEnv (method)
  static LoadFromEnv(theEnvName: string, theFileName: string, theLangExt?: string): boolean;

  // Message_MsgFile.LoadFromString (method)
  static LoadFromString(theContent: string, theLength?: number): boolean;

  // Message_MsgFile.AddMsg (method)
  static AddMsg(key: TCollection_AsciiString, text: TCollection_ExtendedString): boolean;

  // Message_MsgFile.HasMsg (method)
  static HasMsg(key: TCollection_AsciiString): boolean;

  // Message_MsgFile.Msg (method)
  static Msg(key: string): TCollection_ExtendedString;
  static Msg(key: TCollection_AsciiString): TCollection_ExtendedString;

  // Message_MsgFile.delete (method)
  delete(): void;

  // Message_MsgFile.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_Printer: declare class Message_Printer extends Standard_Transient

  // Message_Printer.get_type_name (method)
  static get_type_name(): string;

  // Message_Printer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_Printer.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_Printer.GetTraceLevel (method)
  GetTraceLevel(): Message_Gravity;

  // Message_Printer.SetTraceLevel (method)
  SetTraceLevel(theTraceLevel: Message_Gravity): void;

  // DEPRECATED
  // Message_Printer.Send (method)
  Send(theString: TCollection_ExtendedString, theGravity: Message_Gravity): void;
  Send(theString: string, theGravity: Message_Gravity): void;
  Send(theString: TCollection_AsciiString, theGravity: Message_Gravity): void;

  // Message_Printer.SendObject (method)
  SendObject(theObject: Standard_Transient, theGravity: Message_Gravity): void;

  // Message_Printer.delete (method)
  delete(): void;

  // Message_Printer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_PrinterOStream: declare class Message_PrinterOStream extends Message_Printer

  // Message_PrinterOStream.constructor (constructor)
  constructor(theTraceLevel?: Message_Gravity);
  constructor(theFileName: string, theDoAppend: boolean, theTraceLevel?: Message_Gravity);

  // Message_PrinterOStream.get_type_name (method)
  static get_type_name(): string;

  // Message_PrinterOStream.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_PrinterOStream.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_PrinterOStream.Close (method)
  Close(): void;

  // Message_PrinterOStream.ToColorize (method)
  ToColorize(): boolean;

  // Message_PrinterOStream.SetToColorize (method)
  SetToColorize(theToColorize: boolean): void;

  // Message_PrinterOStream.delete (method)
  delete(): void;

  // Message_PrinterOStream.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_PrinterToReport: declare class Message_PrinterToReport extends Message_Printer

  // Message_PrinterToReport.constructor (constructor)
  constructor();

  // Message_PrinterToReport.get_type_name (method)
  static get_type_name(): string;

  // Message_PrinterToReport.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_PrinterToReport.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_PrinterToReport.Report (method)
  Report(): Message_Report;

  // Message_PrinterToReport.SetReport (method)
  SetReport(theReport: Message_Report): void;

  // Message_PrinterToReport.SendObject (method)
  SendObject(theObject: Standard_Transient, theGravity: Message_Gravity): void;

  // Message_PrinterToReport.delete (method)
  delete(): void;

  // Message_PrinterToReport.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_ProgressIndicator: declare class Message_ProgressIndicator extends Standard_Transient

  // Message_ProgressIndicator.get_type_name (method)
  static get_type_name(): string;

  // Message_ProgressIndicator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_ProgressIndicator.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_ProgressIndicator.Start (method)
  Start(): Message_ProgressRange;
  static Start(theProgress: Message_ProgressIndicator): Message_ProgressRange;

  // Message_ProgressIndicator.GetPosition (method)
  GetPosition(): number;

  // Message_ProgressIndicator.delete (method)
  delete(): void;

  // Message_ProgressIndicator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_ProgressRange: declare class Message_ProgressRange

  // Message_ProgressRange.constructor (constructor)
  constructor();
  constructor(theOther: Message_ProgressRange);

  // Message_ProgressRange.UserBreak (method)
  UserBreak(): boolean;

  // Message_ProgressRange.More (method)
  More(): boolean;

  // Message_ProgressRange.IsActive (method)
  IsActive(): boolean;

  // Message_ProgressRange.Close (method)
  Close(): void;

  // Message_ProgressRange.delete (method)
  delete(): void;

  // Message_ProgressRange.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_ProgressScope: declare class Message_ProgressScope

  // Message_ProgressScope.constructor (constructor)
  constructor();
  constructor(theRange: Message_ProgressRange, theName: TCollection_AsciiString, theMax: number, isInfinite?: boolean);
  constructor(theRange: Message_ProgressRange, theName: unknown, theMax: number, isInfinite?: boolean);

  // Message_ProgressScope.SetName (method)
  SetName(theName: TCollection_AsciiString): void;

  // Message_ProgressScope.UserBreak (method)
  UserBreak(): boolean;

  // Message_ProgressScope.More (method)
  More(): boolean;

  // Message_ProgressScope.Next (method)
  Next(theStep?: number): Message_ProgressRange;

  // Message_ProgressScope.Show (method)
  Show(): void;

  // Message_ProgressScope.IsActive (method)
  IsActive(): boolean;

  // Message_ProgressScope.Name (method)
  Name(): string;

  // Message_ProgressScope.Parent (method)
  Parent(): Message_ProgressScope;

  // Message_ProgressScope.MaxValue (method)
  MaxValue(): number;

  // Message_ProgressScope.Value (method)
  Value(): number;

  // Message_ProgressScope.IsInfinite (method)
  IsInfinite(): boolean;

  // Message_ProgressScope.GetPortion (method)
  GetPortion(): number;

  // Message_ProgressScope.Close (method)
  Close(): void;

  // Message_ProgressScope.delete (method)
  delete(): void;

  // Message_ProgressScope.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_ProgressSentry: declare class Message_ProgressSentry extends Message_ProgressScope

  // Message_ProgressSentry.constructor (constructor)
  constructor(theRange: Message_ProgressRange, theName: string, theMin: number, theMax: number, theStep: number, theIsInf?: boolean, theNewScopeSpan?: number);

  // Message_ProgressSentry.Relieve (method)
  Relieve(): void;

  // Message_ProgressSentry.delete (method)
  delete(): void;

  // Message_ProgressSentry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_Report: declare class Message_Report extends Standard_Transient

  // Message_Report.constructor (constructor)
  constructor();

  // Message_Report.AddAlert (method)
  AddAlert(theGravity: Message_Gravity, theAlert: Message_Alert): void;

  // Message_Report.GetAlerts (method)
  GetAlerts(theGravity: Message_Gravity): NCollection_List_handle_Message_Alert;

  // Message_Report.HasAlert (method)
  HasAlert(theType: Standard_Type): boolean;
  HasAlert(theType: Standard_Type, theGravity: Message_Gravity): boolean;

  // Message_Report.AddLevel (method)
  AddLevel(theLevel: Message_Level, theName: TCollection_AsciiString): void;

  // Message_Report.RemoveLevel (method)
  RemoveLevel(theLevel: Message_Level): void;

  // Message_Report.Clear (method)
  Clear(): void;
  Clear(theGravity: Message_Gravity): void;
  Clear(theType: Standard_Type): void;

  // Message_Report.ActiveMetrics (method)
  ActiveMetrics(): NCollection_IndexedMap_Message_MetricType;

  // Message_Report.SetActiveMetric (method)
  SetActiveMetric(theMetricType: Message_MetricType, theActivate: boolean): void;

  // Message_Report.ClearMetrics (method)
  ClearMetrics(): void;

  // Message_Report.Limit (method)
  Limit(): number;

  // Message_Report.SetLimit (method)
  SetLimit(theLimit: number): void;

  // Message_Report.Merge (method)
  Merge(theOther: Message_Report): void;
  Merge(theOther: Message_Report, theGravity: Message_Gravity): void;

  // Message_Report.get_type_name (method)
  static get_type_name(): string;

  // Message_Report.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // Message_Report.DynamicType (method)
  DynamicType(): Standard_Type;

  // Message_Report.delete (method)
  delete(): void;

  // Message_Report.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Message_Status: typeof Message_Status[keyof typeof Message_Status]

Message_StatusType: typeof Message_StatusType[keyof typeof Message_StatusType]

Message_ListOfAlert: NCollection_List_handle_Message_Alert

Message_ListOfMsg: NCollection_List_Message_Msg
