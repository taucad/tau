# build123d — STEPControl

2 top-level symbols. Signatures are verbatim python.

// defines basic controller for STEP processordefines basic controller for STEP processordefines basic controller for STEP processor
STEPControl_Controller

  // __init__(self
  __init__(self: OCP.OCP.STEPControl.STEPControl_Controller) -> None

  // NewModel(self
  NewModel(self: OCP.OCP.STEPControl.STEPControl_Controller) -> OCP.OCP.Interface.Interface_InterfaceModel

  // ActorRead(self
  ActorRead(self: OCP.OCP.STEPControl.STEPControl_Controller, theModel: OCP.OCP.Interface.Interface_InterfaceModel) -> OCP.OCP.Transfer.Transfer_ActorOfTransientProcess

  // TransferWriteShape(self
  TransferWriteShape(self: OCP.OCP.STEPControl.STEPControl_Controller, shape: OCP.OCP.TopoDS.TopoDS_Shape, FP: OCP.OCP.Transfer.Transfer_FinderProcess, model: OCP.OCP.Interface.Interface_InterfaceModel, modetrans: int = 0, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f6b2f30>) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // Customise(self
  Customise(self: OCP.OCP.STEPControl.STEPControl_Controller, WS: OCP.OCP.XSControl.XSControl_WorkSession) -> tuple[()]

  // Init_s() -> bool
  Init_s() -> bool

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.STEPControl.STEPControl_Controller) -> OCP.OCP.Standard.Standard_Type

// Gives you the choice of translation mode for an Open CASCADE shape that is being translated to STEP
STEPControl_StepModelType

  // __init__(self
  __init__(self: OCP.OCP.STEPControl.STEPControl_StepModelType, value: int) -> None

  // name(self
  name

  value
