# build123d — STEPCAFControl (2)

1 top-level symbols. Signatures are verbatim python.

// Category: STEPCAFControl
// Provides a tool to write DECAF document to the STEP file
STEPCAFControl_Writer

  // __init__(*args, **kwargs)
  // Remarks: Overloaded function. 1. __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> None 2. __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theWS: OCP.OCP.XSControl.XSControl_WorkSession, theScratch: bool = True) -> None
  __init__(*args, **kwargs)
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> None
  __init__(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theWS: OCP.OCP.XSControl.XSControl_WorkSession, theScratch: bool = True) -> None

  // Init(self
  // Remarks: Clears the internal data structures and attaches to a new session Clears the session if it was not yet set for STEP
  Init(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theWS: OCP.OCP.XSControl.XSControl_WorkSession, theScratch: bool = True) -> None

  // Write(self
  // Remarks: Writes all the produced models into file In case of multimodel with extern references, filename will be a name of root file, all other files have names of corresponding parts Provided for use like single-file writer
  Write(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theFileName: str) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // WriteStream(self
  // Remarks: Writes all the produced models into the stream. Provided for use like single-file writer
  WriteStream(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theStream: io.BytesIO) -> OCP.OCP.IFSelect.IFSelect_ReturnStatus

  // Transfer(*args, **kwargs)
  // Remarks: Overloaded function. 1. Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f49a0f0>) -> bool Transfers a document (or single label) to a STEP model The mode of translation of shape is AsIs If multi is not null pointer, it switches to multifile mode (with external refs), and string pointed by <multi> gives prefix for names of extern files (can be empty string) Returns True if translation is OK 2. Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88e130>) -> bool Transfers a document (or single label) to a STEP model This method uses if need to set parameters avoiding initialization from Interface_Static 3. Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f4c7a30>) -> bool Method to transfer part of the document specified by label 4. Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f49bd70>) -> bool Method to transfer part of the document specified by label This method uses if need to set parameters avoiding initialization from Interface_Static 5. Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabelSeq: OCP.OCP.TDF.TDF_LabelSequence, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f79f670>) -> bool Method to writing sequence of root assemblies or part of the file specified by use by one label 6. Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabelSeq: OCP.OCP.TDF.TDF_LabelSequence, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88c130>) -> bool Method to writing sequence of root assemblies or part of the file specified by use by one label. This method is utilized if there's a need to set parameters avoiding initialization from Interface_Static
  Transfer(*args, **kwargs)
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f49a0f0>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88e130>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f4c7a30>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f49bd70>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabelSeq: OCP.OCP.TDF.TDF_LabelSequence, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f79f670>) -> bool
  Transfer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabelSeq: OCP.OCP.TDF.TDF_LabelSequence, theParams: DESTEP_Parameters, theMode: OCP.OCP.STEPControl.STEPControl_StepModelType = <STEPControl_StepModelType.STEPControl_AsIs: 0>, theIsMulti: str = None, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f88c130>) -> bool

  // Perform(*args, **kwargs)
  // Remarks: Overloaded function. 1. Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: OCP.OCP.TCollection.TCollection_AsciiString, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f678fb0>) -> bool 2. Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: str, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f6069f0>) -> bool Transfers a document and writes it to a STEP file Returns True if translation is OK 3. Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: str, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f2ec530>) -> bool Transfers a document and writes it to a STEP file This method is utilized if there's a need to set parameters avoiding initialization from Interface_Static Returns True if translation is OK
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: OCP.OCP.TCollection.TCollection_AsciiString, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f678fb0>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: str, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f6069f0>) -> bool
  Perform(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDoc: OCP.OCP.TDocStd.TDocStd_Document, theFileName: str, theParams: DESTEP_Parameters, theProgress: OCP.OCP.Message.Message_ProgressRange = <OCP.OCP.Message.Message_ProgressRange object at 0x10f2ec530>) -> bool

  // ExternFile(*args, **kwargs)
  // Remarks: Overloaded function. 1. ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theExtFile: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool Returns data on external file by its original label Returns False if no external file with given name is read 2. ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theName: str, theExtFile: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool Returns data on external file by its name Returns False if no external file with given name is read
  ExternFile(*args, **kwargs)
  ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLabel: OCP.OCP.TDF.TDF_Label, theExtFile: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool
  ExternFile(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theName: str, theExtFile: OCP.OCP.STEPCAFControl.STEPCAFControl_ExternFile) -> bool

  // SetColorMode(self
  // Remarks: Set ColorMode for indicate write Colors or not.
  SetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theColorMode: bool) -> None

  // GetColorMode(self
  GetColorMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetNameMode(self
  // Remarks: Set NameMode for indicate write Name or not.
  SetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theNameMode: bool) -> None

  // GetNameMode(self
  GetNameMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetLayerMode(self
  // Remarks: Set LayerMode for indicate write Layers or not.
  SetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theLayerMode: bool) -> None

  // GetLayerMode(self
  GetLayerMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetPropsMode(self
  // Remarks: PropsMode for indicate write Validation properties or not.
  SetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, thePropsMode: bool) -> None

  // GetPropsMode(self
  GetPropsMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetSHUOMode(self
  // Remarks: Set SHUO mode for indicate write SHUO or not.
  SetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theSHUOMode: bool) -> None

  // GetSHUOMode(self
  GetSHUOMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetDimTolMode(self
  // Remarks: Set dimtolmode for indicate write D&GTs or not.
  SetDimTolMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theDimTolMode: bool) -> None

  // GetDimTolMode(self
  GetDimTolMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetMaterialMode(self
  // Remarks: Set dimtolmode for indicate write D&GTs or not.
  SetMaterialMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theMaterialMode: bool) -> None

  // GetMaterialMode(self
  GetMaterialMode(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> bool

  // SetShapeFixParameters(*args, **kwargs)
  // Remarks: Overloaded function. 1. SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None Sets parameters for shape processing. 2. SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theParameters: OCP.OCP.DE.DE_ShapeFixParameters, theAdditionalParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString = <OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString object at 0x10f79f2f0>) -> None Sets parameters for shape processing. Parameters from theParameters are copied to the internal map. Parameters from theAdditionalParameters are copied to the internal map if they are not present in theParameters.
  SetShapeFixParameters(*args, **kwargs)
  SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString) -> None
  SetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theParameters: OCP.OCP.DE.DE_ShapeFixParameters, theAdditionalParameters: OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString = <OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString object at 0x10f79f2f0>) -> None

  // SetShapeProcessFlags(self
  // Remarks: Sets flags defining operations to be performed on shapes.
  SetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer, theFlags: std::__1::bitset<18ul>) -> None

  // ExternFiles(self
  // Remarks: Returns data on external files Returns Null handle if no external files are read
  ExternFiles(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> NCollection_DataMap<TCollection_AsciiString, opencascade::handle<STEPCAFControl_ExternFile>, NCollection_DefaultHasher<TCollection_AsciiString>>

  // ChangeWriter(self
  // Remarks: Returns basic reader for root file
  ChangeWriter(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.STEPControl.STEPControl_Writer

  // Writer(self
  // Remarks: Returns basic reader as const
  Writer(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.STEPControl.STEPControl_Writer

  // GetShapeFixParameters(self
  // Remarks: Returns parameters for shape processing that was set by SetParameters() method.
  GetShapeFixParameters(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> OCP.OCP.Resource.Resource_DataMapOfAsciiStringAsciiString

  // GetShapeProcessFlags(self
  // Remarks: Returns flags defining operations to be performed on shapes.
  GetShapeProcessFlags(self: OCP.OCP.STEPCAFControl.STEPCAFControl_Writer) -> tuple[std::__1::bitset<18ul>, bool]
