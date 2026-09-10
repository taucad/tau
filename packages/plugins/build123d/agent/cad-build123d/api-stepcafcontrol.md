# build123d — STEPCAFControl

3 top-level symbols. Signatures are verbatim python.

// Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)Extends Controller from STEPControl in order to provide ActorWrite adapted for writing assemblies from DECAF Note that ActorRead from STEPControl is used for reading (inherited automatically)
STEPCAFControl_Controller

// **init**(self
**init**(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Controller) -> None

// Init_s() -> bool
Init_s() -> bool

// get_type_name_s() -> str
get_type_name_s() -> str

// get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

// DynamicType(self
DynamicType(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Controller) -> OCP.OCP.Standard.Standard_Type

// Provides a tool to read STEP file and put it into DECAF document
STEPCAFControl_Reader

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> None
**init**(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, WS: OCP.OCP.XSControl.XSControl_WorkSession, scratch: bool = True) -> None

// Init(self
Init(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, WS: OCP.OCP.XSControl.XSControl_WorkSession, scratch: bool = True) -> None

// ReadFile(*args, \*\*kwargs)
ReadFile(*args, \*\*kwargs)
ReadFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFileName: str) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus
ReadFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFileName: str, theParams: DESTEP_Parameters) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

// ReadStream(self
ReadStream(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theName: str, theIStream: io.BytesIO) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

// NbRootsForTransfer(self
NbRootsForTransfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> int

// TransferOneRoot(self
TransferOneRoot(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, num: int, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f462f70>) -> bool

// Transfer(self
Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f717df0>) -> bool

// Perform(*args, \*\*kwargs)
Perform(*args, \*\*kwargs)
Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: OCP.OCP.TCollection.TCollection_AsciiString, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f7cadb0>) -> bool
Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: OCP.OCP.TCollection.TCollection_AsciiString, doc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f462530>) -> bool
Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: str, doc: OCP.OCP.TDocStd.TDocStd_Document, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f7c8c70>) -> bool
Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, filename: str, doc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88db30>) -> bool

// ExternFile(self
ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, name: str, ef: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool

// SetColorMode(self
SetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, colormode: bool) -> None

// GetColorMode(self
GetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetNameMode(self
SetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, namemode: bool) -> None

// GetNameMode(self
GetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetLayerMode(self
SetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, layermode: bool) -> None

// GetLayerMode(self
GetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetPropsMode(self
SetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, propsmode: bool) -> None

// GetPropsMode(self
GetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetMetaMode(self
SetMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theMetaMode: bool) -> None

// GetMetaMode(self
GetMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetProductMetaMode(self
SetProductMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theProductMetaMode: bool) -> None

// GetProductMetaMode(self
GetProductMetaMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetSHUOMode(self
SetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, shuomode: bool) -> None

// GetSHUOMode(self
GetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetGDTMode(self
SetGDTMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, gdtmode: bool) -> None

// GetGDTMode(self
GetGDTMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetMatMode(self
SetMatMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, matmode: bool) -> None

// GetMatMode(self
GetMatMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetViewMode(self
SetViewMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, viewmode: bool) -> None

// GetViewMode(self
GetViewMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> bool

// SetShapeFixParameters(*args, \*\*kwargs)
SetShapeFixParameters(*args, \*\*kwargs)
SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None
SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theParameters: OCP.OCP.DE.DE_ShapeFixParameters, theAdditionalParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString = <OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString object at 0x10f5bcdf0>) -> None

// SetShapeProcessFlags(self
SetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader, theFlags: std::\_\_1::bitset<18ul>) -> None

// FindInstance_s(NAUO
FindInstance_s(NAUO: OCP.OCP.StepRepr.StepRepr_NextAssemblyUsageOccurrence, STool: OCP.OCP.XCAFDoc.XCAFDoc_ShapeTool, Tool: OCP.OCP.STEPConstruct.STEPConstruct_Tool, ShapeLabelMap: OCP.OCP.XCAFDoc.XCAFDoc_DataMapOfShapeLabel) -> OCP.OCP.TDF.TDF_Label

// ExternFiles(self
ExternFiles(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<STEPCAFControl_ExternFile>, NCollection_DefaultHasher<TCollection_AsciiString>>

// ChangeReader(self
ChangeReader(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.STEPControl.STEPControl_Reader

// Reader(self
Reader(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.STEPControl.STEPControl_Reader

// GetShapeLabelMap(self
GetShapeLabelMap(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.XCAFDoc.XCAFDoc_DataMapOfShapeLabel

// GetShapeFixParameters(self
GetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString

// GetShapeProcessFlags(self
GetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Reader) -> tuple[std::__1::bitset<18ul>, bool]

// Provides a tool to write DECAF document to the STEP file
STEPCAFControl_Writer

// **init**(*args, \*\*kwargs)
**init**(*args, \*\*kwargs)
**init**(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> None
**init**(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theWS: OCP.OCP.XSControl.XSControl_WorkSession, theScratch: bool = True) -> None

// Init(self
Init(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theWS: OCP.OCP.XSControl.XSControl_WorkSession, theScratch: bool = True) -> None

// Write(self
Write(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theFileName: str) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

// WriteStream(self
WriteStream(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theStream: io.BytesIO) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

// Transfer(*args, \*\*kwargs)
Transfer(*args, \*\*kwargs)
Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f49a0f0>) -> bool
Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88e130>) -> bool
Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f4c7a30>) -> bool
Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f49bd70>) -> bool
Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabelSeq: OCP.OCP.TDF.TDF_LabelSequence, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f79f670>) -> bool
Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabelSeq: OCP.OCP.TDF.TDF_LabelSequence, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88c130>) -> bool

// Perform(*args, \*\*kwargs)
Perform(*args, \*\*kwargs)
Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: OCP.OCP.TCollection.TCollection_AsciiString, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f678fb0>) -> bool
Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: str, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f6069f0>) -> bool
Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: str, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f2ec530>) -> bool

// ExternFile(*args, \*\*kwargs)
ExternFile(*args, \*\*kwargs)
ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theExtFile: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool
ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theName: str, theExtFile: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool

// SetColorMode(self
SetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theColorMode: bool) -> None

// GetColorMode(self
GetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

// SetNameMode(self
SetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theNameMode: bool) -> None

// GetNameMode(self
GetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

// SetLayerMode(self
SetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLayerMode: bool) -> None

// GetLayerMode(self
GetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

// SetPropsMode(self
SetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, thePropsMode: bool) -> None

// GetPropsMode(self
GetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

// SetSHUOMode(self
SetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theSHUOMode: bool) -> None

// GetSHUOMode(self
GetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

// SetDimTolMode(self
SetDimTolMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDimTolMode: bool) -> None

// GetDimTolMode(self
GetDimTolMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

// SetMaterialMode(self
SetMaterialMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theMaterialMode: bool) -> None

// GetMaterialMode(self
GetMaterialMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

// SetShapeFixParameters(*args, \*\*kwargs)
SetShapeFixParameters(*args, \*\*kwargs)
SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None
SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theParameters: OCP.OCP.DE.DE_ShapeFixParameters, theAdditionalParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString = <OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString object at 0x10f79f2f0>) -> None

// SetShapeProcessFlags(self
SetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theFlags: std::\_\_1::bitset<18ul>) -> None

// ExternFiles(self
ExternFiles(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<STEPCAFControl_ExternFile>, NCollection_DefaultHasher<TCollection_AsciiString>>

// ChangeWriter(self
ChangeWriter(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.STEPControl.STEPControl_Writer

// Writer(self
Writer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.STEPControl.STEPControl_Writer

// GetShapeFixParameters(self
GetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString

// GetShapeProcessFlags(self
GetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> tuple[std::__1::bitset<18ul>, bool]
