# build123d — STEPCAFControl

2 top-level symbols. Signatures are verbatim python.

// Category: STEPCAFControl
// Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)
STEPCAFControl_Controller

  // __init__(self
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Controller) -> None

  // Init_s() -> bool
  // Remarks: Standard Initialisation. It creates a Controller for STEP-XCAF and records it to various names, available to select it later Returns True when done, False if could not be done
  Init_s() -> bool

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Controller) -> OCP.OCP.Standard.Standard_Type

// Category: STEPCAFControl
// Provides a tool to read STEP file and put it into DECAF document
STEPCAFControl_Reader

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> None 2. __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, WS: OCP.OCP.XSControl.XSControl_WorkSession, scratch: bool = True) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> None
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, WS: OCP.OCP.XSControl.XSControl_WorkSession, scratch: bool = True) -> None

  // Init(self
  // Remarks: Clears the internal data structures and attaches to a new session Clears the session if it was not yet set for STEP
  Init(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, WS: OCP.OCP.XSControl.XSControl_WorkSession, scratch: bool = True) -> None

  // ReadFile(*args, **kwargs)
  // Remarks: Overloaded function. 1. ReadFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFileName: str) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus Loads a file and returns the read status Provided for use like single-file reader. 2. ReadFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFileName: str, theParams: DESTEP_Parameters) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus Loads a file and returns the read status Provided for use like single-file reader.
  ReadFile(*args, **kwargs)
  ReadFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFileName: str) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus
  ReadFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFileName: str, theParams: DESTEP_Parameters) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // ReadStream(self
  // Remarks: Loads a file from stream and returns the read status.
  ReadStream(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theName: str, theIStream: io.BytesIO) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // NbRootsForTransfer(self
  // Remarks: Returns number of roots recognized for transfer Shortcut for Reader().NbRootsForTransfer()
  NbRootsForTransfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> int

  // TransferOneRoot(self
  // Remarks: Translates currently loaded STEP file into the document Returns True if succeeded, and False in case of fail Provided for use like single-file reader
  TransferOneRoot(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, num: int, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f462f70>) -> bool

  // Transfer(self
  // Remarks: Translates currently loaded STEP file into the document Returns True if succeeded, and False in case of fail Provided for use like single-file reader
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f717df0>) -> bool

  // Perform(*args, **kwargs)
  // Remarks: Overloaded function. 1. Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: OCP.OCP.TCollection.TCollection_AsciiString, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f7cadb0>) -> bool 2. Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: OCP.OCP.TCollection.TCollection_AsciiString, doc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f462530>) -> bool 3. Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: str, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f7c8c70>) -> bool Translate STEP file given by filename into the document Return True if succeeded, and False in case of fail 4. Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: str, doc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88db30>) -> bool Translate STEP file given by filename into the document Return True if succeeded, and False in case of fail
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: OCP.OCP.TCollection.TCollection_AsciiString, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f7cadb0>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: OCP.OCP.TCollection.TCollection_AsciiString, doc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f462530>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: str, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f7c8c70>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: str, doc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88db30>) -> bool

  // ExternFile(self
  // Remarks: Returns data on external file by its name Returns False if no external file with given name is read
  ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, name: str, ef: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool

  // SetColorMode(self
  // Remarks: Set ColorMode for indicate read Colors or not.
  SetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, colormode: bool) -> None

  // GetColorMode(self
  GetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetNameMode(self
  // Remarks: Set NameMode for indicate read Name or not.
  SetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, namemode: bool) -> None

  // GetNameMode(self
  GetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetLayerMode(self
  // Remarks: Set LayerMode for indicate read Layers or not.
  SetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, layermode: bool) -> None

  // GetLayerMode(self
  GetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetPropsMode(self
  // Remarks: PropsMode for indicate read Validation properties or not.
  SetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, propsmode: bool) -> None

  // GetPropsMode(self
  GetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetMetaMode(self
  // Remarks: MetaMode for indicate read Metadata or not.
  SetMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theMetaMode: bool) -> None

  // GetMetaMode(self
  GetMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetProductMetaMode(self
  // Remarks: MetaMode for indicate whether to read Product Metadata or not.
  SetProductMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theProductMetaMode: bool) -> None

  // GetProductMetaMode(self
  GetProductMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetSHUOMode(self
  // Remarks: Set SHUO mode for indicate write SHUO or not.
  SetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, shuomode: bool) -> None

  // GetSHUOMode(self
  GetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetGDTMode(self
  // Remarks: Set GDT mode for indicate write GDT or not.
  SetGDTMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, gdtmode: bool) -> None

  // GetGDTMode(self
  GetGDTMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetMatMode(self
  // Remarks: Set Material mode
  SetMatMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, matmode: bool) -> None

  // GetMatMode(self
  GetMatMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetViewMode(self
  // Remarks: Set View mode
  SetViewMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, viewmode: bool) -> None

  // GetViewMode(self
  // Remarks: Get View mode
  GetViewMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetShapeFixParameters(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None Sets parameters for shape processing. 2. SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theParameters: OCP.OCP.DE.DE_ShapeFixParameters, theAdditionalParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString = <OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString object at 0x10f5bcdf0>) -> None Sets parameters for shape processing. Parameters from theParameters are copied to the internal map. Parameters from theAdditionalParameters are copied to the internal map if they are not present in theParameters.
  SetShapeFixParameters(*args, **kwargs)
  SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None
  SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theParameters: OCP.OCP.DE.DE_ShapeFixParameters, theAdditionalParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString = <OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString object at 0x10f5bcdf0>) -> None

  // SetShapeProcessFlags(self
  // Remarks: Sets flags defining operations to be performed on shapes.
  SetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFlags: std::__1::bitset<18ul>) -> None

  // FindInstance_s(NAUO
  // Remarks: Returns label of instance of an assembly component corresponding to a given NAUO
  FindInstance_s(NAUO: OCP.OCP.StepRepr.StepRepr_NextAssemblyUsageOccurrence, STool: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Tool: OCP.OCP.STEPConstruct.STEPConstruct_Tool, ShapeLabelMap: OCP.OCP.XCAFDoc.XCAFDoc_DataMapOfShapeLabel) -> OCP.OCP.TDF.TDF_Label

  // ExternFiles(self
  // Remarks: Returns data on external files Returns Null handle if no external files are read
  ExternFiles(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<STEPCAFControl_ExternFile>, NCollection_DefaultHasher<TCollection_AsciiString>>

  // ChangeReader(self
  // Remarks: Returns basic reader
  ChangeReader(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.STEPControl.STEPControl_Reader

  // Reader(self
  // Remarks: Returns basic reader as const
  Reader(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.STEPControl.STEPControl_Reader

  // GetShapeLabelMap(self
  GetShapeLabelMap(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.XCAFDoc.XCAFDoc_DataMapOfShapeLabel

  // GetShapeFixParameters(self
  // Remarks: Returns parameters for shape processing that was set by SetParameters() method.
  GetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString

  // GetShapeProcessFlags(self
  // Remarks: Returns flags defining operations to be performed on shapes.
  GetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> tuple[std::__1::bitset<18ul>, bool]
