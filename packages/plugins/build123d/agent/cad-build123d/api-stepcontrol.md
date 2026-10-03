# build123d — STEPControl

2 top-level symbols. Signatures are verbatim python.

// Category: STEPControl
// defines basic controller for STEP processordefines basic controller for STEP processordefines basic controller for STEP processor
STEPControl_Controller

  // __init__(self
  // OCP.OCP.STEPControl.STEPControl_Controller.__init__ (constructor)
  __init__(self: OCP.OCP.STEPControl.STEPControl_Controller) -> None

  // NewModel(self
  // Remarks: Creates a new empty Model ready to receive data of the Norm. It is taken from STEP Template Model
  // OCP.OCP.STEPControl.STEPControl_Controller.NewModel (method)
  NewModel(self: OCP.OCP.STEPControl.STEPControl_Controller) -> OCP.OCP.Interface.Interface_InterfaceModel

  // ActorRead(self
  // Remarks: Returns the Actor for Read attached to the pair (norm,appli)
  // OCP.OCP.STEPControl.STEPControl_Controller.ActorRead (method)
  ActorRead(self: OCP.OCP.STEPControl.STEPControl_Controller, theModel: OCP.OCP.Interface.Interface_InterfaceModel) -> OCP.OCP.Transfer.Transfer_ActorOfTransientProcess

  // TransferWriteShape(self
  // Remarks: Takes one Shape and transfers it to the InterfaceModel (already created by NewModel for instance) <modeshape> is to be interpreted by each kind of XstepAdaptor Returns a status : 0 OK 1 No result 2 Fail -1 bad modeshape -2 bad model (requires a StepModel) modeshape : 1 Facetted BRep, 2 Shell, 3 Manifold Solid
  // OCP.OCP.STEPControl.STEPControl_Controller.TransferWriteShape (method)
  TransferWriteShape(self: OCP.OCP.STEPControl.STEPControl_Controller, shape: OCP.OCP.TopoDS.TopoDS_Shape, FP: OCP.OCP.Transfer.Transfer_FinderProcess, model: OCP.OCP.Interface.Interface_InterfaceModel, modetrans: int = 0, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f6b2f30>) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // Customise(self
  // OCP.OCP.STEPControl.STEPControl_Controller.Customise (method)
  Customise(self: OCP.OCP.STEPControl.STEPControl_Controller, WS: OCP.OCP.XSControl.XSControl_WorkSession) -> tuple[()]

  // Init_s() -> bool
  // Remarks: Standard Initialisation. It creates a Controller for STEP and records it to various names, available to select it later Returns True when done, False if could not be done
  // OCP.OCP.STEPControl.STEPControl_Controller.Init_s (method)
  Init_s() -> bool

  // get_type_name_s() -> str
  // OCP.OCP.STEPControl.STEPControl_Controller.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.STEPControl.STEPControl_Controller.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.STEPControl.STEPControl_Controller.DynamicType (method)
  DynamicType(self: OCP.OCP.STEPControl.STEPControl_Controller) -> OCP.OCP.Standard.Standard_Type

// Category: STEPControl
// Gives you the choice of translation mode for an Open CASCADE shape that is being translated to STEP
// Remarks: Members: STEPControl_AsIs STEPControl_ManifoldSolidBrep STEPControl_BrepWithVoids STEPControl_FacetedBrep STEPControl_FacetedBrepAndBrepWithVoids STEPControl_ShellBasedSurfaceModel STEPControl_GeometricCurveSet STEPControl_Hybrid
STEPControl_StepModelType

  // __init__(self
  // OCP.OCP.STEPControl.STEPControl_StepModelType.__init__ (constructor)
  __init__(self: OCP.OCP.STEPControl.STEPControl_StepModelType, value: int) -> None

  // name(self
  name

  value
