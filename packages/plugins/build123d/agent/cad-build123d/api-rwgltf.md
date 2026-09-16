# build123d — RWGltf

1 top-level symbols. Signatures are verbatim python.

// glTF writer context from XCAF document
RWGltf_CafWriter

  // __init__(self
  __init__(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFile: OCP.OCP.TCollection.TCollection_AsciiString, theIsBinary: bool) -> None

  // SetCoordinateSystemConverter(self
  SetCoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theConverter: OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter) -> None

  // IsBinary(self
  IsBinary(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // TransformationFormat(self
  TransformationFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWGltf.RWGltf_WriterTrsfFormat

  // SetTransformationFormat(self
  SetTransformationFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWGltf.RWGltf_WriterTrsfFormat) -> None

  // NodeNameFormat(self
  NodeNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_NameFormat

  // SetNodeNameFormat(self
  SetNodeNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWMesh.RWMesh_NameFormat) -> None

  // MeshNameFormat(self
  MeshNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_NameFormat

  // SetMeshNameFormat(self
  SetMeshNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWMesh.RWMesh_NameFormat) -> None

  // IsForcedUVExport(self
  IsForcedUVExport(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetForcedUVExport(self
  SetForcedUVExport(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToForce: bool) -> None

  // SetDefaultStyle(self
  SetDefaultStyle(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theStyle: OCP.OCP.XCAFPrs.XCAFPrs_Style) -> None

  // ToEmbedTexturesInGlb(self
  ToEmbedTexturesInGlb(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetToEmbedTexturesInGlb(self
  SetToEmbedTexturesInGlb(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToEmbedTexturesInGlb: bool) -> None

  // ToMergeFaces(self
  ToMergeFaces(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetMergeFaces(self
  SetMergeFaces(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToMerge: bool) -> None

  // ToSplitIndices16(self
  ToSplitIndices16(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetSplitIndices16(self
  SetSplitIndices16(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToSplit: bool) -> None

  // ToParallel(self
  ToParallel(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetParallel(self
  SetParallel(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToParallel: bool) -> None

  // SetCompressionParameters(self
  SetCompressionParameters(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDracoParameters: OCP.OCP.RWGltf.RWGltf_DracoParameters) -> None

  // Perform(*args, **kwargs)
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDocument: OCP.OCP.TDocStd.TDocStd_Document, theRootLabels: OCP.OCP.TDF.TDF_LabelSequence, theLabelFilter: OCP.OCP.TColStd.TColStd_MapOfAsciiString, theFileInfo: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theProgress: OCP.OCP.Message.Message_ProgressRange) -> bool
  Perform(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDocument: OCP.OCP.TDocStd.TDocStd_Document, theFileInfo: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theProgress: OCP.OCP.Message.Message_ProgressRange) -> bool

  // get_type_name_s() -> str
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  DynamicType(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.Standard.Standard_Type

  // CoordinateSystemConverter(self
  CoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter

  // ChangeCoordinateSystemConverter(self
  ChangeCoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter

  // DefaultStyle(self
  DefaultStyle(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.XCAFPrs.XCAFPrs_Style

  // CompressionParameters(self
  CompressionParameters(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWGltf.RWGltf_DracoParameters
