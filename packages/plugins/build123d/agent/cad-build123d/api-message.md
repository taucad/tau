# build123d — Message

3 top-level symbols. Signatures are verbatim python.

// Category: Message
// Defines - tools to work with messages - basic tools intended for progress indication
Message

  // __init__(self
  // OCP.OCP.Message.Message.__init__ (constructor)
  __init__(self: OCP.OCP.Message.Message) -> None

  // DefaultMessenger_s() -> OCP.OCP.Message.Message_Messenger
  // Remarks: Defines default messenger for OCCT applications. This is global static instance of the messenger. By default, it contains single printer directed to std::cout. It can be customized according to the application needs.
  // OCP.OCP.Message.Message.DefaultMessenger_s (method)
  DefaultMessenger_s() -> OCP.OCP.Message.Message_Messenger

  // Send_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. Send_s(theGravity: OCP.OCP.Message.Message_Gravity) -> Message_Messenger::StreamBuffer 2. Send_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString, theGravity: OCP.OCP.Message.Message_Gravity) -> None
  // OCP.OCP.Message.Message.Send_s (method)
  Send_s(*args, **kwargs)
  Send_s(theGravity: OCP.OCP.Message.Message_Gravity) -> Message_Messenger::StreamBuffer
  Send_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString, theGravity: OCP.OCP.Message.Message_Gravity) -> None

  // SendFail_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SendFail_s() -> Message_Messenger::StreamBuffer 2. SendFail_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  // OCP.OCP.Message.Message.SendFail_s (method)
  SendFail_s(*args, **kwargs)
  SendFail_s() -> Message_Messenger::StreamBuffer
  SendFail_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // SendAlarm_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SendAlarm_s() -> Message_Messenger::StreamBuffer 2. SendAlarm_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  // OCP.OCP.Message.Message.SendAlarm_s (method)
  SendAlarm_s(*args, **kwargs)
  SendAlarm_s() -> Message_Messenger::StreamBuffer
  SendAlarm_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // SendWarning_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SendWarning_s() -> Message_Messenger::StreamBuffer 2. SendWarning_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  // OCP.OCP.Message.Message.SendWarning_s (method)
  SendWarning_s(*args, **kwargs)
  SendWarning_s() -> Message_Messenger::StreamBuffer
  SendWarning_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // SendInfo_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SendInfo_s() -> Message_Messenger::StreamBuffer 2. SendInfo_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  // OCP.OCP.Message.Message.SendInfo_s (method)
  SendInfo_s(*args, **kwargs)
  SendInfo_s() -> Message_Messenger::StreamBuffer
  SendInfo_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // SendTrace_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. SendTrace_s() -> Message_Messenger::StreamBuffer 2. SendTrace_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None
  // OCP.OCP.Message.Message.SendTrace_s (method)
  SendTrace_s(*args, **kwargs)
  SendTrace_s() -> Message_Messenger::StreamBuffer
  SendTrace_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // FillTime_s(Hour
  // Remarks: Returns the string filled with values of hours, minutes and seconds. Example: 1. (5, 12, 26.3345) returns "05h:12m:26.33s", 2. (0, 6, 34.496 ) returns "06m:34.50s", 3. (0, 0, 4.5 ) returns "4.50s"
  // OCP.OCP.Message.Message.FillTime_s (method)
  FillTime_s(Hour: int, Minute: int, Second: float) -> OCP.OCP.TCollection.TCollection_AsciiString

  // DefaultReport_s(theToCreate
  // Remarks: returns the only one instance of Report When theToCreate is true - automatically creates message report when not exist.
  // OCP.OCP.Message.Message.DefaultReport_s (method)
  DefaultReport_s(theToCreate: bool = False) -> OCP.OCP.Message.Message_Report

  // MetricFromString_s(*args, **kwargs)
  // Remarks: Overloaded function. 1. MetricFromString_s(theString: str, theType: OCP.OCP.Message.Message_MetricType) -> bool Determines the metric from the given string identifier. 2. MetricFromString_s(theString: str) -> OCP.OCP.Message.Message_MetricType Returns the metric type from the given string identifier.
  // OCP.OCP.Message.Message.MetricFromString_s (method)
  MetricFromString_s(*args, **kwargs)
  MetricFromString_s(theString: str, theType: OCP.OCP.Message.Message_MetricType) -> bool
  MetricFromString_s(theString: str) -> OCP.OCP.Message.Message_MetricType

  // MetricToString_s(theType
  // Remarks: Returns the string name for a given metric type.
  // OCP.OCP.Message.Message.MetricToString_s (method)
  MetricToString_s(theType: OCP.OCP.Message.Message_MetricType) -> str

  // ToOSDMetric_s(theMetric
  // Remarks: Converts message metric to OSD memory info type.
  // OCP.OCP.Message.Message.ToOSDMetric_s (method)
  ToOSDMetric_s(theMetric: OCP.OCP.Message.Message_MetricType, theMemInfo: OCP.OCP.OSD.OSD_MemInfo.Counter_e) -> bool

  // ToMessageMetric_s(theMemInfo
  // Remarks: Converts OSD memory info type to message metric.
  // OCP.OCP.Message.Message.ToMessageMetric_s (method)
  ToMessageMetric_s(theMemInfo: OCP.OCP.OSD.OSD_MemInfo.Counter_e, theMetric: OCP.OCP.Message.Message_MetricType) -> bool

// Category: Message
// Defines gravity level of messages - Trace
// Remarks: Members: Message_Trace Message_Info Message_Warning Message_Alarm Message_Fail
Message_Gravity

  // __init__(self
  // OCP.OCP.Message.Message_Gravity.__init__ (constructor)
  __init__(self: OCP.OCP.Message.Message_Gravity, value: int) -> None

  // name(self
  name

  value

// Category: Message
// Auxiliary class representing a part of the global progress scale allocated by a step of the progress scope, see Message_ProgressScope::Next()
Message_ProgressRange

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.Message.Message_ProgressRange) -> None 2. __init__(self: OCP.OCP.Message.Message_ProgressRange, theOther: OCP.OCP.Message.Message_ProgressRange) -> None
  // OCP.OCP.Message.Message_ProgressRange.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Message.Message_ProgressRange) -> None
  __init__(self: OCP.OCP.Message.Message_ProgressRange, theOther: OCP.OCP.Message.Message_ProgressRange) -> None

  // UserBreak(*args, **kwargs)
  // Remarks: Overloaded function. 1. UserBreak(self: OCP.OCP.Message.Message_ProgressRange) -> bool Returns true if ProgressIndicator signals UserBreak 2. UserBreak(self: OCP.OCP.Message.Message_ProgressRange) -> bool Returns true if ProgressIndicator signals UserBreak
  // OCP.OCP.Message.Message_ProgressRange.UserBreak (method)
  UserBreak(*args, **kwargs)
  UserBreak(self: OCP.OCP.Message.Message_ProgressRange) -> bool
  UserBreak(self: OCP.OCP.Message.Message_ProgressRange) -> bool

  // More(self
  // Remarks: Returns false if ProgressIndicator signals UserBreak
  // OCP.OCP.Message.Message_ProgressRange.More (method)
  More(self: OCP.OCP.Message.Message_ProgressRange) -> bool

  // IsActive(*args, **kwargs)
  // Remarks: Overloaded function. 1. IsActive(self: OCP.OCP.Message.Message_ProgressRange) -> bool Returns true if this progress range is attached to some indicator. 2. IsActive(self: OCP.OCP.Message.Message_ProgressRange) -> bool Returns true if this progress range is attached to some indicator.
  // OCP.OCP.Message.Message_ProgressRange.IsActive (method)
  IsActive(*args, **kwargs)
  IsActive(self: OCP.OCP.Message.Message_ProgressRange) -> bool
  IsActive(self: OCP.OCP.Message.Message_ProgressRange) -> bool

  // Close(*args, **kwargs)
  // Remarks: Overloaded function. 1. Close(self: OCP.OCP.Message.Message_ProgressRange) -> None Closes the current range and advances indicator 2. Close(self: OCP.OCP.Message.Message_ProgressRange) -> None Closes the current range and advances indicator
  // OCP.OCP.Message.Message_ProgressRange.Close (method)
  Close(*args, **kwargs)
  Close(self: OCP.OCP.Message.Message_ProgressRange) -> None
  Close(self: OCP.OCP.Message.Message_ProgressRange) -> None
