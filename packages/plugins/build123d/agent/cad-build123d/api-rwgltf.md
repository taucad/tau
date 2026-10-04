# build123d — RWGltf

1 top-level symbols. Signatures are verbatim python.

// Category: RWGltf
// glTF writer context from XCAF document
RWGltf_CafWriter

  // __init__(self
  // OCP.OCP.RWGltf.RWGltf_CafWriter.__init__ (constructor)
  __init__(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFile: OCP.OCP.TCollection.TCollection_AsciiString, theIsBinary: bool) -> None

  // SetCoordinateSystemConverter(self
  // Remarks: Set transformation from OCCT to glTF coordinate system.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetCoordinateSystemConverter (method)
  SetCoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theConverter: OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter) -> None

  // IsBinary(self
  // Remarks: Return flag to write into binary glTF format (.glb), specified within class constructor.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.IsBinary (method)
  IsBinary(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // TransformationFormat(self
  // Remarks: Return preferred transformation format for writing into glTF file; RWGltf_WriterTrsfFormat_Compact by default.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.TransformationFormat (method)
  TransformationFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWGltf.RWGltf_WriterTrsfFormat

  // SetTransformationFormat(self
  // Remarks: Set preferred transformation format for writing into glTF file.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetTransformationFormat (method)
  SetTransformationFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWGltf.RWGltf_WriterTrsfFormat) -> None

  // NodeNameFormat(self
  // Remarks: Return name format for exporting Nodes; RWMesh_NameFormat_InstanceOrProduct by default.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.NodeNameFormat (method)
  NodeNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_NameFormat

  // SetNodeNameFormat(self
  // Remarks: Set name format for exporting Nodes.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetNodeNameFormat (method)
  SetNodeNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWMesh.RWMesh_NameFormat) -> None

  // MeshNameFormat(self
  // Remarks: Return name format for exporting Meshes; RWMesh_NameFormat_Product by default.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.MeshNameFormat (method)
  MeshNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_NameFormat

  // SetMeshNameFormat(self
  // Remarks: Set name format for exporting Meshes.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetMeshNameFormat (method)
  SetMeshNameFormat(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theFormat: OCP.OCP.RWMesh.RWMesh_NameFormat) -> None

  // IsForcedUVExport(self
  // Remarks: Return TRUE to export UV coordinates even if there are no mapped texture; FALSE by default.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.IsForcedUVExport (method)
  IsForcedUVExport(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetForcedUVExport(self
  // Remarks: Set flag to export UV coordinates even if there are no mapped texture; FALSE by default.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetForcedUVExport (method)
  SetForcedUVExport(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToForce: bool) -> None

  // SetDefaultStyle(self
  // Remarks: Set default material definition to be used for nodes with only color defined.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetDefaultStyle (method)
  SetDefaultStyle(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theStyle: OCP.OCP.XCAFPrs.XCAFPrs_Style) -> None

  // ToEmbedTexturesInGlb(self
  // Remarks: Return flag to write image textures into GLB file (binary gltf export); TRUE by default. When set to FALSE, texture images will be written as separate files. Has no effect on writing into non-binary format.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ToEmbedTexturesInGlb (method)
  ToEmbedTexturesInGlb(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetToEmbedTexturesInGlb(self
  // Remarks: Set flag to write image textures into GLB file (binary gltf export).
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetToEmbedTexturesInGlb (method)
  SetToEmbedTexturesInGlb(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToEmbedTexturesInGlb: bool) -> None

  // ToMergeFaces(self
  // Remarks: Return flag to merge faces within a single part; FALSE by default.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ToMergeFaces (method)
  ToMergeFaces(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetMergeFaces(self
  // Remarks: Set flag to merge faces within a single part. May reduce JSON size thanks to smaller number of primitive arrays.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetMergeFaces (method)
  SetMergeFaces(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToMerge: bool) -> None

  // ToSplitIndices16(self
  // Remarks: Return flag to prefer keeping 16-bit indexes while merging face; FALSE by default.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ToSplitIndices16 (method)
  ToSplitIndices16(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetSplitIndices16(self
  // Remarks: Set flag to prefer keeping 16-bit indexes while merging face. Has effect only with ToMergeFaces() option turned ON. May reduce binary data size thanks to smaller triangle indexes.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetSplitIndices16 (method)
  SetSplitIndices16(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToSplit: bool) -> None

  // ToParallel(self
  // Remarks: Return TRUE if multithreaded optimizations are allowed; FALSE by default.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ToParallel (method)
  ToParallel(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> bool

  // SetParallel(self
  // Remarks: Setup multithreaded execution.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetParallel (method)
  SetParallel(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theToParallel: bool) -> None

  // SetCompressionParameters(self
  // Remarks: Set Draco parameters
  // OCP.OCP.RWGltf.RWGltf_CafWriter.SetCompressionParameters (method)
  SetCompressionParameters(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDracoParameters: OCP.OCP.RWGltf.RWGltf_DracoParameters) -> None

  // Perform(*args, **kwargs)
  // Remarks: Overloaded function. 1. Perform(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDocument: OCP.OCP.TDocStd.TDocStd_Document, theRootLabels: OCP.OCP.TDF.TDF_LabelSequence, theLabelFilter: OCP.OCP.TColStd.TColStd_MapOfAsciiString, theFileInfo: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theProgress: OCP.OCP.Message.Message_ProgressRange) -> bool Write glTF file and associated binary file. Triangulation data should be precomputed within shapes! 2. Perform(self: OCP.OCP.RWGltf.RWGltf_CafWriter, theDocument: OCP.OCP.TDocStd.TDocStd_Document, theFileInfo: OCP.OCP.TColStd.TColStd_IndexedDataMapOfStringString, theProgress: OCP.OCP.Message.Message_ProgressRange) -> bool Write glTF file and associated binary file. Triangulation data should be precomputed within shapes!
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
  // Remarks: Return transformation from OCCT to glTF coordinate system.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.CoordinateSystemConverter (method)
  CoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter

  // ChangeCoordinateSystemConverter(self
  // Remarks: Return transformation from OCCT to glTF coordinate system.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.ChangeCoordinateSystemConverter (method)
  ChangeCoordinateSystemConverter(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWMesh.RWMesh_CoordinateSystemConverter

  // DefaultStyle(self
  // Remarks: Return default material definition to be used for nodes with only color defined.
  // OCP.OCP.RWGltf.RWGltf_CafWriter.DefaultStyle (method)
  DefaultStyle(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.XCAFPrs.XCAFPrs_Style

  // CompressionParameters(self
  // Remarks: Return Draco parameters
  // OCP.OCP.RWGltf.RWGltf_CafWriter.CompressionParameters (method)
  CompressionParameters(self: OCP.OCP.RWGltf.RWGltf_CafWriter) -> OCP.OCP.RWGltf.RWGltf_DracoParameters
