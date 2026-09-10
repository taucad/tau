# build123d — XSControl

1 top-level symbols. Signatures are verbatim python.

// This WorkSession completes the basic one, by adding
XSControl_WorkSession

// **init**(self
**init**(self: OCP.OCP.XSControl.XSControl_WorkSession) -> None

// ClearData(self
ClearData(self: OCP.OCP.XSControl.XSControl_WorkSession, theMode: int) -> None

// SelectNorm(self
SelectNorm(self: OCP.OCP.XSControl.XSControl_WorkSession, theNormName: str) -> bool

// SetController(self
SetController(self: OCP.OCP.XSControl.XSControl_WorkSession, theCtl: OCP.OCP.XSControl.XSControl_Controller) -> None

// SelectedNorm(self
SelectedNorm(self: OCP.OCP.XSControl.XSControl_WorkSession, theRsc: bool = False) -> str

// SetAllContext(self
SetAllContext(self: OCP.OCP.XSControl.XSControl_WorkSession, theContext: NCollection_DataMap<TCollection_AsciiString, opencascade::handle<Standard_Transient>, NCollection_DefaultHasher<TCollection_AsciiString>>) -> None

// ClearContext(self
ClearContext(self: OCP.OCP.XSControl.XSControl_WorkSession) -> None

// PrintTransferStatus(self
PrintTransferStatus(self: OCP.OCP.XSControl.XSControl_WorkSession, theNum: int, theWri: bool, theS: io.BytesIO) -> bool

// InitTransferReader(self
InitTransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theMode: int) -> None

// SetTransferReader(self
SetTransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theTR: OCP.OCP.XSControl.XSControl_TransferReader) -> None

// MapReader(self
MapReader(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Transfer.Transfer_TransientProcess

// SetMapReader(self
SetMapReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theTP: OCP.OCP.Transfer.Transfer_TransientProcess) -> bool

// Result(self
Result(self: OCP.OCP.XSControl.XSControl_WorkSession, theEnt: OCP.OCP.Standard.Standard_Transient, theMode: int) -> OCP.OCP.Standard.Standard_Transient

// TransferReadOne(self
TransferReadOne(self: OCP.OCP.XSControl.XSControl_WorkSession, theEnts: OCP.OCP.Standard.Standard_Transient, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f39b570>) -> int

// TransferReadRoots(self
TransferReadRoots(self: OCP.OCP.XSControl.XSControl_WorkSession, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f606930>) -> int

// NewModel(self
NewModel(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Interface.Interface_InterfaceModel

// SetMapWriter(self
SetMapWriter(self: OCP.OCP.XSControl.XSControl_WorkSession, theFP: OCP.OCP.Transfer.Transfer_FinderProcess) -> bool

// TransferWriteShape(self
TransferWriteShape(self: OCP.OCP.XSControl.XSControl_WorkSession, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theCompGraph: bool = True, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f606e70>) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

// TransferWriteCheckList(self
TransferWriteCheckList(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Interface.Interface_CheckIterator

// SetVars(self
SetVars(self: OCP.OCP.XSControl.XSControl_WorkSession, theVars: OCP.OCP.XSControl.XSControl_Vars) -> None

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// NormAdaptor(self
NormAdaptor(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_Controller

// Context(self
Context(self: OCP.OCP.XSControl.XSControl_WorkSession) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<Standard_Transient>, NCollection_DefaultHasher<TCollection_AsciiString>>

// TransferReader(self
TransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_TransferReader

// TransferWriter(self
TransferWriter(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_TransferWriter

// Vars(self
Vars(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_Vars

// DynamicType(self
DynamicType(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Standard.Standard_Type
