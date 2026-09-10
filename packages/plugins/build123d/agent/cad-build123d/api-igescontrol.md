# build123d — IGESControl

1 top-level symbols. Signatures are verbatim python.

// Controller for IGES-5.1Controller for IGES-5.1Controller for IGES-5.1
IGESControl_Controller

// **init**(self
**init**(self: OCP.OCP.IGESControl.IGESControl_Controller, modefnes: bool = False) -> None

// NewModel(self
NewModel(self: OCP.OCP.IGESControl.IGESControl_Controller) -> OCP.OCP.Interface.Interface_InterfaceModel

// ActorRead(self
ActorRead(self: OCP.OCP.IGESControl.IGESControl_Controller, model: OCP.OCP.Interface.Interface_InterfaceModel) -> OCP.OCP.Transfer.Transfer_ActorOfTransientProcess

// TransferWriteShape(self
TransferWriteShape(self: OCP.OCP.IGESControl.IGESControl_Controller, shape: OCP.OCP.TopoDS.TopoDS_Shape, FP: OCP.OCP.Transfer.Transfer_FinderProcess, model: OCP.OCP.Interface.Interface_InterfaceModel, modetrans: int = 0, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f556bf0>) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

// Customise(self
Customise(self: OCP.OCP.IGESControl.IGESControl_Controller, WS: OCP.OCP.XSControl.XSControl_WorkSession) -> tuple[()]

// Init_s() -> bool
Init_s() -> bool

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// DynamicType(self
DynamicType(self: OCP.OCP.IGESControl.IGESControl_Controller) -> OCP.OCP.Standard.Standard_Type
