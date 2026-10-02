# build123d — XSControl

1 top-level symbols. Signatures are verbatim python.

// Category: XSControl
// This WorkSession completes the basic one, by adding
XSControl_WorkSession

  // __init__(self
  __init__(self: OCP.OCP.XSControl.XSControl_WorkSession) -> None

  // ClearData(self
  // Remarks: In addition to basic ClearData, clears Transfer and Management for interactive use, for mode = 0,1,2 and over 4 Plus : mode = 5 to clear Transfers (both ways) only mode = 6 to clear enforced results mode = 7 to clear transfers, results
  ClearData(self: OCP.OCP.XSControl.XSControl_WorkSession, theMode: int) -> None

  // SelectNorm(self
  // Remarks: Selects a Norm defined by its name. A Norm is described and handled by a Controller Returns True if done, False if <normname> is unknown
  SelectNorm(self: OCP.OCP.XSControl.XSControl_WorkSession, theNormName: str) -> bool

  // SetController(self
  // Remarks: Selects a Norm defined by its Controller itself
  SetController(self: OCP.OCP.XSControl.XSControl_WorkSession, theCtl: OCP.OCP.XSControl.XSControl_Controller) -> None

  // SelectedNorm(self
  // Remarks: Returns the name of the last Selected Norm. If none is defined, returns an empty string By default, returns the complete name of the norm If <rsc> is True, returns the short name used for resource
  SelectedNorm(self: OCP.OCP.XSControl.XSControl_WorkSession, theRsc: bool = False) -> str

  // SetAllContext(self
  // Remarks: Sets the current Context List, as a whole Sets it to the TransferReader
  SetAllContext(self: OCP.OCP.XSControl.XSControl_WorkSession, theContext: NCollection_DataMap<TCollection_AsciiString, opencascade::handle<Standard_Transient>, NCollection_DefaultHasher<TCollection_AsciiString>>) -> None

  // ClearContext(self
  // Remarks: Clears the whole current Context (nullifies it)
  ClearContext(self: OCP.OCP.XSControl.XSControl_WorkSession) -> None

  // PrintTransferStatus(self
  // Remarks: Prints the transfer status of a transferred item, as being the Mapped n0 <num>, from MapWriter if <wri> is True, or from MapReader if <wri> is False Returns True when done, False else (i.e. num out of range)
  PrintTransferStatus(self: OCP.OCP.XSControl.XSControl_WorkSession, theNum: int, theWri: bool, theS: io.BytesIO) -> bool

  // InitTransferReader(self
  // Remarks: Sets a Transfer Reader, by internal ways, according mode : 0 recreates it clear, 1 clears it (does not recreate) 2 aligns Roots of TransientProcess from final Results 3 aligns final Results from Roots of TransientProcess 4 begins a new transfer (by BeginTransfer) 5 recreates TransferReader then begins a new transfer
  InitTransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theMode: int) -> None

  // SetTransferReader(self
  // Remarks: Sets a Transfer Reader, which manages transfers on reading
  SetTransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theTR: OCP.OCP.XSControl.XSControl_TransferReader) -> None

  // MapReader(self
  // Remarks: Returns the TransientProcess(internal data for TransferReader)
  MapReader(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Transfer.Transfer_TransientProcess

  // SetMapReader(self
  // Remarks: Changes the Map Reader, i.e. considers that the new one defines the relevant read results (forgets the former ones) Returns True when done, False in case of bad definition, i.e. if Model from TP differs from that of Session
  SetMapReader(self: OCP.OCP.XSControl.XSControl_WorkSession, theTP: OCP.OCP.Transfer.Transfer_TransientProcess) -> bool

  // Result(self
  // Remarks: Returns the result attached to a starting entity If <mode> = 0, returns Final Result If <mode> = 1, considers Last Result If <mode> = 2, considers Final, else if absent, Last returns it as Transient, if result is not transient returns the Binder <mode> = 10,11,12 idem but returns the Binder itself (if it is not, e.g. Shape, returns the Binder) <mode> = 20, returns the ResultFromModel
  Result(self: OCP.OCP.XSControl.XSControl_WorkSession, theEnt: OCP.OCP.Standard.Standard_Transient, theMode: int) -> OCP.OCP.Standard.Standard_Transient

  // TransferReadOne(self
  // Remarks: Commands the transfer of, either one entity, or a list I.E. calls the TransferReader after having analysed <ents> It is cumulated from the last BeginTransfer <ents> is processed by GiveList, hence : - <ents> a Selection : its SelectionResult - <ents> a HSequenceOfTransient : this list - <ents> the Model : in this specific case, all the roots, with no cumulation of former transfers (TransferReadRoots)
  TransferReadOne(self: OCP.OCP.XSControl.XSControl_WorkSession, theEnts: OCP.OCP.Standard.Standard_Transient, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f39b570>) -> int

  // TransferReadRoots(self
  // Remarks: Commands the transfer of all the root entities of the model i.e. calls TransferRoot from the TransferReader with the Graph No cumulation with former calls to TransferReadOne
  TransferReadRoots(self: OCP.OCP.XSControl.XSControl_WorkSession, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f606930>) -> int

  // NewModel(self
  // Remarks: produces and returns a new Model well conditioned It is produced by the Norm Controller It can be Null (if this function is not implemented)
  NewModel(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Interface.Interface_InterfaceModel

  // SetMapWriter(self
  // Remarks: Changes the Map Reader, i.e. considers that the new one defines the relevant read results (forgets the former ones) Returns True when done, False if <FP> is Null
  SetMapWriter(self: OCP.OCP.XSControl.XSControl_WorkSession, theFP: OCP.OCP.Transfer.Transfer_FinderProcess) -> bool

  // TransferWriteShape(self
  // Remarks: Transfers a Shape from CasCade to a model of current norm, according to the last call to SetModeWriteShape Returns status :Done if OK, Fail if error during transfer, Error if transfer badly initialised
  TransferWriteShape(self: OCP.OCP.XSControl.XSControl_WorkSession, theShape: OCP.OCP.TopoDS.TopoDS_Shape, theCompGraph: bool = True, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f606e70>) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // TransferWriteCheckList(self
  // Remarks: Returns the check-list of last transfer (write) It is recorded in the FinderProcess, but it must be bound with resulting entities (in the resulting file model) rather than with original objects (in fact, their mappers)
  TransferWriteCheckList(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Interface.Interface_CheckIterator

  // SetVars(self
  SetVars(self: OCP.OCP.XSControl.XSControl_WorkSession, theVars: OCP.OCP.XSControl.XSControl_Vars) -> None

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // NormAdaptor(self
  // Remarks: Returns the norm controller itself
  NormAdaptor(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_Controller

  // Context(self
  // Remarks: Returns the current Context List, Null if not defined The Context is given to the TransientProcess for TransferRead
  Context(self: OCP.OCP.XSControl.XSControl_WorkSession) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<Standard_Transient>, NCollection_DefaultHasher<TCollection_AsciiString>>

  // TransferReader(self
  // Remarks: Returns the Transfer Reader, Null if not set
  TransferReader(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_TransferReader

  // TransferWriter(self
  // Remarks: Returns the Transfer Reader, Null if not set
  TransferWriter(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_TransferWriter

  // Vars(self
  Vars(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.XSControl.XSControl_Vars

  // DynamicType(self
  DynamicType(self: OCP.OCP.XSControl.XSControl_WorkSession) -> OCP.OCP.Standard.Standard_Type
