# build123d — XSControl

1 top-level symbols. Signatures are verbatim python.

// This WorkSession completes the basic one, by adding
XSControl_WorkSession

  // __init__(self
  // OCP.OCP.XSControl.XSControl_WorkSession.__init__ (constructor)
  __init__(self: OCP.OCP.XSControl.XSControl_WorkSession) -> None

  // ClearData(self
  // OCP.OCP.XSControl.XSControl_WorkSession.ClearData (method)
  ClearData(self: OCP.OCP.XSControl.XSControl_WorkSession, theMode: int) -> None

  // SelectNorm(self
  // OCP.OCP.XSControl.XSControl_WorkSession.SelectNorm (method)
  SelectNorm(self: OCP.OCP.XSControl.XSControl_WorkSession, theNormName: str) -> bool

  // SetController(self
  // OCP.OCP.XSControl.XSControl_WorkSession.SetController (method)
  SetController(self: OCP.OCP.XSControl.XSControl_WorkSession, theCtl: OCP.OCP.XSControl.XSControl_Controller) -> None

  // SelectedNorm(self
  // OCP.OCP.XSControl.XSControl_WorkSession.SelectedNorm (method)
  SelectedNorm(self: OCP.OCP.XSControl.XSControl_WorkSession, theRsc: bool = False) -> str

  // SetAllContext(self
  // OCP.OCP.XSControl.XSControl_WorkSession.SetAllContext (method)
  SetAllContext(self: OCP.OCP.XSControl.XSControl_WorkSession, theContext: NCollection_DataMap<TCollection_AsciiString, opencascade::handle<Standard_Transient>, NCollection_DefaultHasher<TCollection_AsciiString>>) -> None

  // ClearContext(self
  // OCP.OCP.XSControl.XSControl_WorkSession.ClearContext (method)
  ClearContext(self: OCP.OCP.XSControl.XSControl_WorkSession) -> None

  // PrintTransferStatus(self
  // OCP.OCP.XSControl.XSControl_WorkSession.PrintTransferStatus (method)
  PrintTransferStatus(self: OCP.OCP.XSControl.XSControl_WorkSession, theNum: int, theWri: bool, theS: io.BytesIO) -> bool

  // InitTransferReader(self
  // OCP.OCP.XSControl.XSControl_WorkSession.InitTransferReader (method)
  InitTransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theMode: int) -> None

  // SetTransferReader(self
  // OCP.OCP.XSControl.XSControl_WorkSession.SetTransferReader (method)
  SetTransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theTR: OCP.OCP.XSControl.XSControl_TransferReader) -> None

  // MapReader(self
  // OCP.OCP.XSControl.XSControl_WorkSession.MapReader (method)
  MapReader(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Transfer.Transfer_TransientProcess

  // SetMapReader(self
  // OCP.OCP.XSControl.XSControl_WorkSession.SetMapReader (method)
  SetMapReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theTP: OCP.OCP.Transfer.Transfer_TransientProcess) -> bool

  // Result(self
  // OCP.OCP.XSControl.XSControl_WorkSession.Result (method)
  Result(self: OCP.OCP.XSControl.XSControl_WorkSession, theEnt: OCP.OCP.Standard.Standard_Transient, theMode: int) -> OCP.OCP.Standard.Standard_Transient

  // TransferReadOne(self
  // OCP.OCP.XSControl.XSControl_WorkSession.TransferReadOne (method)
  TransferReadOne(self: OCP.OCP.XSControl.XSControl_WorkSession, theEnts: OCP.OCP.Standard.Standard_Transient, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f39b570>) -> int

  // TransferReadRoots(self
  // OCP.OCP.XSControl.XSControl_WorkSession.TransferReadRoots (method)
  TransferReadRoots(self: OCP.OCP.XSControl.XSControl_WorkSession, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f606930>) -> int

  // NewModel(self
  // OCP.OCP.XSControl.XSControl_WorkSession.NewModel (method)
  NewModel(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Interface.Interface_InterfaceModel

  // SetMapWriter(self
  // OCP.OCP.XSControl.XSControl_WorkSession.SetMapWriter (method)
  SetMapWriter(self: OCP.OCP.XSControl.XSControl_WorkSession, theFP: OCP.OCP.Transfer.Transfer_FinderProcess) -> bool

  // TransferWriteShape(self
  // OCP.OCP.XSControl.XSControl_WorkSession.TransferWriteShape (method)
  TransferWriteShape(self: OCP.OCP.XSControl.XSControl_WorkSession, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theCompGraph: bool = True, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f606e70>) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // TransferWriteCheckList(self
  // OCP.OCP.XSControl.XSControl_WorkSession.TransferWriteCheckList (method)
  TransferWriteCheckList(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Interface.Interface_CheckIterator

  // SetVars(self
  // OCP.OCP.XSControl.XSControl_WorkSession.SetVars (method)
  SetVars(self: OCP.OCP.XSControl.XSControl_WorkSession, theVars: OCP.OCP.XSControl.XSControl_Vars) -> None

  // get_type_name_s() -> str
  // OCP.OCP.XSControl.XSControl_WorkSession.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.XSControl.XSControl_WorkSession.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // NormAdaptor(self
  // OCP.OCP.XSControl.XSControl_WorkSession.NormAdaptor (method)
  NormAdaptor(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_Controller

  // Context(self
  // OCP.OCP.XSControl.XSControl_WorkSession.Context (method)
  Context(self: OCP.OCP.XSControl.XSControl_WorkSession) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<Standard_Transient>, NCollection_DefaultHasher<TCollection_AsciiString>>

  // TransferReader(self
  // OCP.OCP.XSControl.XSControl_WorkSession.TransferReader (method)
  TransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_TransferReader

  // TransferWriter(self
  // OCP.OCP.XSControl.XSControl_WorkSession.TransferWriter (method)
  TransferWriter(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_TransferWriter

  // Vars(self
  // OCP.OCP.XSControl.XSControl_WorkSession.Vars (method)
  Vars(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_Vars

  // DynamicType(self
  // OCP.OCP.XSControl.XSControl_WorkSession.DynamicType (method)
  DynamicType(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Standard.Standard_Type
