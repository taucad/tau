# build123d — Message

3 top-level symbols. Signatures are verbatim python.

// Defines - tools to work with messages - basic tools intended for progress indication
Message

  // __init__(self
  __init__(self: OCP.OCP.Message.Message) -> None

  // DefaultMessenger_s() -> OCP.OCP.Message.Message_Messenger
  DefaultMessenger_s() -> OCP.OCP.Message.Message_Messenger

  // Send_s(*args, **kwargs)
  Send_s(*args, **kwargs)
  Send_s(theGravity: OCP.OCP.Message.Message_Gravity) -> Message_Messenger::StreamBuffer
  Send_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString, theGravity: OCP.OCP.Message.Message_Gravity) -> None

  // SendFail_s(*args, **kwargs)
  SendFail_s(*args, **kwargs)
  SendFail_s() -> Message_Messenger::StreamBuffer
  SendFail_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // SendAlarm_s(*args, **kwargs)
  SendAlarm_s(*args, **kwargs)
  SendAlarm_s() -> Message_Messenger::StreamBuffer
  SendAlarm_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // SendWarning_s(*args, **kwargs)
  SendWarning_s(*args, **kwargs)
  SendWarning_s() -> Message_Messenger::StreamBuffer
  SendWarning_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // SendInfo_s(*args, **kwargs)
  SendInfo_s(*args, **kwargs)
  SendInfo_s() -> Message_Messenger::StreamBuffer
  SendInfo_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // SendTrace_s(*args, **kwargs)
  SendTrace_s(*args, **kwargs)
  SendTrace_s() -> Message_Messenger::StreamBuffer
  SendTrace_s(theMessage: OCP.OCP.TCollection.TCollection_AsciiString) -> None

  // FillTime_s(Hour
  FillTime_s(Hour: int, Minute: int, Second: float) -> OCP.OCP.TCollection.TCollection_AsciiString

  // DefaultReport_s(theToCreate
  DefaultReport_s(theToCreate: bool = False) -> OCP.OCP.Message.Message_Report

  // MetricFromString_s(*args, **kwargs)
  MetricFromString_s(*args, **kwargs)
  MetricFromString_s(theString: str, theType: OCP.OCP.Message.Message_MetricType) -> bool
  MetricFromString_s(theString: str) -> OCP.OCP.Message.Message_MetricType

  // MetricToString_s(theType
  MetricToString_s(theType: OCP.OCP.Message.Message_MetricType) -> str

  // ToOSDMetric_s(theMetric
  ToOSDMetric_s(theMetric: OCP.OCP.Message.Message_MetricType, theMemInfo: OCP.OCP.OSD.OSD_MemInfo.Counter_e) -> bool

  // ToMessageMetric_s(theMemInfo
  ToMessageMetric_s(theMemInfo: OCP.OCP.OSD.OSD_MemInfo.Counter_e, theMetric: OCP.OCP.Message.Message_MetricType) -> bool

// Defines gravity level of messages - Trace
Message_Gravity

  // __init__(self
  __init__(self: OCP.OCP.Message.Message_Gravity, value: int) -> None

  // name(self
  name

  value

// Auxiliary class representing a part of the global progress scale allocated by a step of the progress scope, see Message_ProgressScope::Next()
Message_ProgressRange

  // __init__(*args, **kwargs)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.Message.Message_ProgressRange) -> None
  __init__(self: OCP.OCP.Message.Message_ProgressRange, theOther: OCP.OCP.Message.Message_ProgressRange) -> None

  // UserBreak(*args, **kwargs)
  UserBreak(*args, **kwargs)
  UserBreak(self: OCP.OCP.Message.Message_ProgressRange) -> bool
  UserBreak(self: OCP.OCP.Message.Message_ProgressRange) -> bool

  // More(self
  More(self: OCP.OCP.Message.Message_ProgressRange) -> bool

  // IsActive(*args, **kwargs)
  IsActive(*args, **kwargs)
  IsActive(self: OCP.OCP.Message.Message_ProgressRange) -> bool
  IsActive(self: OCP.OCP.Message.Message_ProgressRange) -> bool

  // Close(*args, **kwargs)
  Close(*args, **kwargs)
  Close(self: OCP.OCP.Message.Message_ProgressRange) -> None
  Close(self: OCP.OCP.Message.Message_ProgressRange) -> None
