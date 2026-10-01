# build123d — RWGltf

1 top-level symbols. Signatures are verbatim python.

// glTF writer context from XCAF document
RWGltf_CafWriter

  // __init__(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.__init__ (constructor)
  __init__(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFile: OCP.OCP.TCollection.TCollection_AsciiString, theIsBinary: bool) -> None

  // SetCoordinateSystemConverter(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetCoordinateSystemConverter (method)
  SetCoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theConverter: OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter) -> None

  // IsBinary(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.IsBinary (method)
  IsBinary(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // TransformationFormat(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.TransformationFormat (method)
  TransformationFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWGltf.RWGltf_WriterTrsfFormat

  // SetTransformationFormat(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetTransformationFormat (method)
  SetTransformationFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWGltf.RWGltf_WriterTrsfFormat) -> None

  // NodeNameFormat(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.NodeNameFormat (method)
  NodeNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_NameFormat

  // SetNodeNameFormat(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetNodeNameFormat (method)
  SetNodeNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWMesh.RWMesh_NameFormat) -> None

  // MeshNameFormat(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.MeshNameFormat (method)
  MeshNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_NameFormat

  // SetMeshNameFormat(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetMeshNameFormat (method)
  SetMeshNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWMesh.RWMesh_NameFormat) -> None

  // IsForcedUVExport(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.IsForcedUVExport (method)
  IsForcedUVExport(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetForcedUVExport(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetForcedUVExport (method)
  SetForcedUVExport(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToForce: bool) -> None

  // SetDefaultStyle(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetDefaultStyle (method)
  SetDefaultStyle(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theStyle: OCP.OCP.XCAFPrs.XCAFPrs_Style) -> None

  // ToEmbedTexturesInGlb(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ToEmbedTexturesInGlb (method)
  ToEmbedTexturesInGlb(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetToEmbedTexturesInGlb(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetToEmbedTexturesInGlb (method)
  SetToEmbedTexturesInGlb(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToEmbedTexturesInGlb: bool) -> None

  // ToMergeFaces(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ToMergeFaces (method)
  ToMergeFaces(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetMergeFaces(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetMergeFaces (method)
  SetMergeFaces(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToMerge: bool) -> None

  // ToSplitIndices16(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ToSplitIndices16 (method)
  ToSplitIndices16(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetSplitIndices16(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetSplitIndices16 (method)
  SetSplitIndices16(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToSplit: bool) -> None

  // ToParallel(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ToParallel (method)
  ToParallel(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetParallel(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetParallel (method)
  SetParallel(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToParallel: bool) -> None

  // SetCompressionParameters(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetCompressionParameters (method)
  SetCompressionParameters(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDracoParameters: OCP.OCP.RWGltf.RWGltf_DracoParameters) -> None

  // Perform(*args, **kwargs)
  // OCP.OCP.RWGltf.RWGltf_CafWriter.Perform (method)
  Perform(*args, **kwargs)
  Perform(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDocument: OCP.OCP.TDocStd.TDocStd_Document, theRootLabels: OCP.OCP.TDF.TDF_LabelSequence, theLabelFilter: OCP.OCP.TColStd.TColStd_MapOfAsciiString, theFileInfo: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theProgress: OCP.OCP.Message.Message_ProgressRange) -> bool
  Perform(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDocument: OCP.OCP.TDocStd.TDocStd_Document, theFileInfo: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theProgress: OCP.OCP.Message.Message_ProgressRange) -> bool

  // get_type_name_s() -> str
  // OCP.OCP.RWGltf.RWGltf_CafWriter.get_type_name_s (method)
  get_type_name_s() -> str

  // get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type
  // OCP.OCP.RWGltf.RWGltf_CafWriter.get_type_descriptor_s (method)
  get_type_descriptor_s() -> OCP.OCP.Standard.Standard_Type

  // DynamicType(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.DynamicType (method)
  DynamicType(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.Standard.Standard_Type

  // CoordinateSystemConverter(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.CoordinateSystemConverter (method)
  CoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter

  // ChangeCoordinateSystemConverter(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ChangeCoordinateSystemConverter (method)
  ChangeCoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter

  // DefaultStyle(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.DefaultStyle (method)
  DefaultStyle(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.XCAFPrs.XCAFPrs_Style

  // CompressionParameters(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.CompressionParameters (method)
  CompressionParameters(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWGltf.RWGltf_DracoParameters
