# build123d — IGESControl

1 top-level symbols. Signatures are verbatim python.

// Category: IGESControl
// Controller for IGES-5.1Controller for IGES-5.1Controller for IGES-5.1
IGESControl_Controller

  // __init__(self
  __init__(self: OCP.OCP.IGESControl.IGESControl_Controller, modefnes: bool = False) -> None

  // NewModel(self
  // Remarks: Creates a new empty Model ready to receive data of the Norm. It is taken from IGES Template Model
  NewModel(self: OCP.OCP.IGESControl.IGESControl_Controller) -> OCP.OCP.Interface.Interface_InterfaceModel

  // ActorRead(self
  // Remarks: Returns the Actor for Read attached to the pair (norm,appli) It is an Actor from IGESToBRep, adapted from an IGESModel : Unit, tolerances
  ActorRead(self: OCP.OCP.IGESControl.IGESControl_Controller, model: OCP.OCP.Interface.Interface_InterfaceModel) -> OCP.OCP.Transfer.Transfer_ActorOfTransientProcess

  // TransferWriteShape(self
  // Remarks: Takes one Shape and transfers it to the InterfaceModel (already created by NewModel for instance) <modetrans> is to be interpreted by each kind of XstepAdaptor Returns a status : 0 OK 1 No result 2 Fail -1 bad modeshape -2 bad model (requires an IGESModel) modeshape : 0 group of face (version < 5.1) 1 BREP-version 5.1 of IGES
  TransferWriteShape(self: OCP.OCP.IGESControl.IGESControl_Controller, shape: OCP.OCP.TopoDS.TopoDS_Shape, FP: OCP.OCP.Transfer.Transfer_FinderProcess, model: OCP.OCP.Interface.Interface_InterfaceModel, modetrans: int = 0, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f556bf0>) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // Customise(self
  Customise(self: OCP.OCP.IGESControl.IGESControl_Controller, WS: OCP.OCP.XSControl.XSControl_WorkSession) -> tuple[()]

  // Init_s() -> bool
  // Remarks: Standard Initialisation. It creates a Controller for IGES and records it to various names, available to select it later Returns True when done, False if could not be done Also, it creates and records an Adaptor for FNES
  Init_s() -> bool

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.IGESControl.IGESControl_Controller) -> OCP.OCP.Standard.Standard_Type
