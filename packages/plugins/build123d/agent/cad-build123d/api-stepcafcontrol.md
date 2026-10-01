# build123d — STEPCAFControl

3 top-level symbols. Signatures are verbatim python.

// Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)
STEPCAFControl_Controller

  // __init__(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Controller.__init__ (constructor)
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Controller) -> None

  // Init_s() -> bool
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Controller.Init_s (method)
  Init_s() -> bool

  // get_type_name_s() -> str
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Controller.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Controller.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Controller.DynamicType (method)
  DynamicType(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Controller) -> OCP.OCP.Standard.Standard_Type

// Provides a tool to read STEP file and put it into DECAF document
STEPCAFControl_Reader

  // __init__(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> None
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, WS: OCP.OCP.XSControl.XSControl_WorkSession, scratch: bool = True) -> None

  // Init(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.Init (method)
  Init(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, WS: OCP.OCP.XSControl.XSControl_WorkSession, scratch: bool = True) -> None

  // ReadFile(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.ReadFile (method)
  ReadFile(*args, **kwargs)
  ReadFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFileName: str) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus
  ReadFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFileName: str, theParams: DESTEP_Parameters) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // ReadStream(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.ReadStream (method)
  ReadStream(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theName: str, theIStream: io.BytesIO) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // NbRootsForTransfer(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.NbRootsForTransfer (method)
  NbRootsForTransfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> int

  // TransferOneRoot(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.TransferOneRoot (method)
  TransferOneRoot(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, num: int, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f462f70>) -> bool

  // Transfer(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.Transfer (method)
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f717df0>) -> bool

  // Perform(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.Perform (method)
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: OCP.OCP.TCollection.TCollection_AsciiString, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f7cadb0>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: OCP.OCP.TCollection.TCollection_AsciiString, doc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f462530>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: str, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f7c8c70>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: str, doc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88db30>) -> bool

  // ExternFile(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.ExternFile (method)
  ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, name: str, ef: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool

  // SetColorMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetColorMode (method)
  SetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, colormode: bool) -> None

  // GetColorMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetColorMode (method)
  GetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetNameMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetNameMode (method)
  SetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, namemode: bool) -> None

  // GetNameMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetNameMode (method)
  GetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetLayerMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetLayerMode (method)
  SetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, layermode: bool) -> None

  // GetLayerMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetLayerMode (method)
  GetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetPropsMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetPropsMode (method)
  SetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, propsmode: bool) -> None

  // GetPropsMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetPropsMode (method)
  GetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetMetaMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetMetaMode (method)
  SetMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theMetaMode: bool) -> None

  // GetMetaMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetMetaMode (method)
  GetMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetProductMetaMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetProductMetaMode (method)
  SetProductMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theProductMetaMode: bool) -> None

  // GetProductMetaMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetProductMetaMode (method)
  GetProductMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetSHUOMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetSHUOMode (method)
  SetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, shuomode: bool) -> None

  // GetSHUOMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetSHUOMode (method)
  GetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetGDTMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetGDTMode (method)
  SetGDTMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, gdtmode: bool) -> None

  // GetGDTMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetGDTMode (method)
  GetGDTMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetMatMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetMatMode (method)
  SetMatMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, matmode: bool) -> None

  // GetMatMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetMatMode (method)
  GetMatMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetViewMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetViewMode (method)
  SetViewMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, viewmode: bool) -> None

  // GetViewMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetViewMode (method)
  GetViewMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

  // SetShapeFixParameters(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetShapeFixParameters (method)
  SetShapeFixParameters(*args, **kwargs)
  SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None
  SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theParameters: OCP.OCP.DE.DE_ShapeFixParameters, theAdditionalParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString = <OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString object at 0x10f5bcdf0>) -> None

  // SetShapeProcessFlags(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.SetShapeProcessFlags (method)
  SetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFlags: std::__1::bitset<18ul>) -> None

  // FindInstance_s(NAUO
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.FindInstance_s (method)
  FindInstance_s(NAUO: OCP.OCP.StepRepr.StepRepr_NextAssemblyUsageOccurrence, STool: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Tool: OCP.OCP.STEPConstruct.STEPConstruct_Tool, ShapeLabelMap: OCP.OCP.XCAFDoc.XCAFDoc_DataMapOfShapeLabel) -> OCP.OCP.TDF.TDF_Label

  // ExternFiles(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.ExternFiles (method)
  ExternFiles(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<STEPCAFControl_ExternFile>, NCollection_DefaultHasher<TCollection_AsciiString>>

  // ChangeReader(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.ChangeReader (method)
  ChangeReader(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.STEPControl.STEPControl_Reader

  // Reader(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.Reader (method)
  Reader(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.STEPControl.STEPControl_Reader

  // GetShapeLabelMap(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetShapeLabelMap (method)
  GetShapeLabelMap(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.XCAFDoc.XCAFDoc_DataMapOfShapeLabel

  // GetShapeFixParameters(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetShapeFixParameters (method)
  GetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString

  // GetShapeProcessFlags(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Reader.GetShapeProcessFlags (method)
  GetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> tuple[std::__1::bitset<18ul>, bool]

// Provides a tool to write DECAF document to the STEP file
STEPCAFControl_Writer

  // __init__(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.__init__ (constructor)
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> None
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theWS: OCP.OCP.XSControl.XSControl_WorkSession, theScratch: bool = True) -> None

  // Init(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.Init (method)
  Init(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theWS: OCP.OCP.XSControl.XSControl_WorkSession, theScratch: bool = True) -> None

  // Write(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.Write (method)
  Write(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theFileName: str) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // WriteStream(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.WriteStream (method)
  WriteStream(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theStream: io.BytesIO) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // Transfer(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.Transfer (method)
  Transfer(*args, **kwargs)
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f49a0f0>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88e130>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f4c7a30>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f49bd70>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabelSeq: OCP.OCP.TDF.TDF_LabelSequence, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f79f670>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabelSeq: OCP.OCP.TDF.TDF_LabelSequence, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88c130>) -> bool

  // Perform(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.Perform (method)
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: OCP.OCP.TCollection.TCollection_AsciiString, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f678fb0>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: str, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f6069f0>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: str, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f2ec530>) -> bool

  // ExternFile(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.ExternFile (method)
  ExternFile(*args, **kwargs)
  ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theExtFile: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool
  ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theName: str, theExtFile: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool

  // SetColorMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetColorMode (method)
  SetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theColorMode: bool) -> None

  // GetColorMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetColorMode (method)
  GetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetNameMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetNameMode (method)
  SetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theNameMode: bool) -> None

  // GetNameMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetNameMode (method)
  GetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetLayerMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetLayerMode (method)
  SetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLayerMode: bool) -> None

  // GetLayerMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetLayerMode (method)
  GetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetPropsMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetPropsMode (method)
  SetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, thePropsMode: bool) -> None

  // GetPropsMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetPropsMode (method)
  GetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetSHUOMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetSHUOMode (method)
  SetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theSHUOMode: bool) -> None

  // GetSHUOMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetSHUOMode (method)
  GetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetDimTolMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetDimTolMode (method)
  SetDimTolMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDimTolMode: bool) -> None

  // GetDimTolMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetDimTolMode (method)
  GetDimTolMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetMaterialMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetMaterialMode (method)
  SetMaterialMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theMaterialMode: bool) -> None

  // GetMaterialMode(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetMaterialMode (method)
  GetMaterialMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetShapeFixParameters(*args, **kwargs)
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetShapeFixParameters (method)
  SetShapeFixParameters(*args, **kwargs)
  SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None
  SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theParameters: OCP.OCP.DE.DE_ShapeFixParameters, theAdditionalParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString = <OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString object at 0x10f79f2f0>) -> None

  // SetShapeProcessFlags(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.SetShapeProcessFlags (method)
  SetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theFlags: std::__1::bitset<18ul>) -> None

  // ExternFiles(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.ExternFiles (method)
  ExternFiles(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<STEPCAFControl_ExternFile>, NCollection_DefaultHasher<TCollection_AsciiString>>

  // ChangeWriter(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.ChangeWriter (method)
  ChangeWriter(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.STEPControl.STEPControl_Writer

  // Writer(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.Writer (method)
  Writer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.STEPControl.STEPControl_Writer

  // GetShapeFixParameters(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetShapeFixParameters (method)
  GetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString

  // GetShapeProcessFlags(self
  // OCP.OCP.STEPCAFControl.STEPCAFControl_Writer.GetShapeProcessFlags (method)
  GetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> tuple[std::__1::bitset<18ul>, bool]
