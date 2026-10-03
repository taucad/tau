# libcascade — RWGltf

24 top-level symbols. Signatures are verbatim typescript.

RWGltf_CafReader: declare class RWGltf_CafReader extends RWMesh_CafReader

  // RWGltf_CafReader.constructor (constructor)
  constructor();

  // RWGltf_CafReader.get_type_name (method)
  static get_type_name(): string;

  // RWGltf_CafReader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWGltf_CafReader.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWGltf_CafReader.ToParallel (method)
  ToParallel(): boolean;

  // RWGltf_CafReader.SetParallel (method)
  SetParallel(theToParallel: boolean): void;

  // RWGltf_CafReader.ToSkipEmptyNodes (method)
  ToSkipEmptyNodes(): boolean;

  // RWGltf_CafReader.SetSkipEmptyNodes (method)
  SetSkipEmptyNodes(theToSkip: boolean): void;

  // RWGltf_CafReader.ToLoadAllScenes (method)
  ToLoadAllScenes(): boolean;

  // RWGltf_CafReader.ToApplyScale (method)
  ToApplyScale(): boolean;

  // RWGltf_CafReader.SetLoadAllScenes (method)
  SetLoadAllScenes(theToLoadAll: boolean): void;

  // RWGltf_CafReader.ToUseMeshNameAsFallback (method)
  ToUseMeshNameAsFallback(): boolean;

  // RWGltf_CafReader.SetMeshNameAsFallback (method)
  SetMeshNameAsFallback(theToFallback: boolean): void;

  // RWGltf_CafReader.IsDoublePrecision (method)
  IsDoublePrecision(): boolean;

  // RWGltf_CafReader.SetDoublePrecision (method)
  SetDoublePrecision(theIsDouble: boolean): void;

  // RWGltf_CafReader.ToSkipLateDataLoading (method)
  ToSkipLateDataLoading(): boolean;

  // RWGltf_CafReader.SetToSkipLateDataLoading (method)
  SetToSkipLateDataLoading(theToSkip: boolean): void;

  // RWGltf_CafReader.SetToApplyScale (method)
  SetToApplyScale(theToApplyScale: boolean): void;

  // RWGltf_CafReader.ToKeepLateData (method)
  ToKeepLateData(): boolean;

  // RWGltf_CafReader.SetToKeepLateData (method)
  SetToKeepLateData(theToKeep: boolean): void;

  // RWGltf_CafReader.ToPrintDebugMessages (method)
  ToPrintDebugMessages(): boolean;

  // RWGltf_CafReader.SetToPrintDebugMessages (method)
  SetToPrintDebugMessages(theToPrint: boolean): void;

  // RWGltf_CafReader.delete (method)
  delete(): void;

  // RWGltf_CafReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_CafWriter: declare class RWGltf_CafWriter extends Standard_Transient

  // RWGltf_CafWriter.constructor (constructor)
  constructor(theFile: TCollection_AsciiString, theIsBinary: boolean);

  // RWGltf_CafWriter.get_type_name (method)
  static get_type_name(): string;

  // RWGltf_CafWriter.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWGltf_CafWriter.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWGltf_CafWriter.CoordinateSystemConverter (method)
  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWGltf_CafWriter.ChangeCoordinateSystemConverter (method)
  ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWGltf_CafWriter.SetCoordinateSystemConverter (method)
  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  // RWGltf_CafWriter.IsBinary (method)
  IsBinary(): boolean;

  // RWGltf_CafWriter.TransformationFormat (method)
  TransformationFormat(): RWGltf_WriterTrsfFormat;

  // RWGltf_CafWriter.SetTransformationFormat (method)
  SetTransformationFormat(theFormat: RWGltf_WriterTrsfFormat): void;

  // RWGltf_CafWriter.NodeNameFormat (method)
  NodeNameFormat(): RWMesh_NameFormat;

  // RWGltf_CafWriter.SetNodeNameFormat (method)
  SetNodeNameFormat(theFormat: RWMesh_NameFormat): void;

  // RWGltf_CafWriter.MeshNameFormat (method)
  MeshNameFormat(): RWMesh_NameFormat;

  // RWGltf_CafWriter.SetMeshNameFormat (method)
  SetMeshNameFormat(theFormat: RWMesh_NameFormat): void;

  // RWGltf_CafWriter.IsForcedUVExport (method)
  IsForcedUVExport(): boolean;

  // RWGltf_CafWriter.SetForcedUVExport (method)
  SetForcedUVExport(theToForce: boolean): void;

  // RWGltf_CafWriter.DefaultStyle (method)
  DefaultStyle(): XCAFPrs_Style;

  // RWGltf_CafWriter.SetDefaultStyle (method)
  SetDefaultStyle(theStyle: XCAFPrs_Style): void;

  // RWGltf_CafWriter.ToEmbedTexturesInGlb (method)
  ToEmbedTexturesInGlb(): boolean;

  // RWGltf_CafWriter.SetToEmbedTexturesInGlb (method)
  SetToEmbedTexturesInGlb(theToEmbedTexturesInGlb: boolean): void;

  // RWGltf_CafWriter.ToMergeFaces (method)
  ToMergeFaces(): boolean;

  // RWGltf_CafWriter.SetMergeFaces (method)
  SetMergeFaces(theToMerge: boolean): void;

  // RWGltf_CafWriter.ToSplitIndices16 (method)
  ToSplitIndices16(): boolean;

  // RWGltf_CafWriter.SetSplitIndices16 (method)
  SetSplitIndices16(theToSplit: boolean): void;

  // RWGltf_CafWriter.ToParallel (method)
  ToParallel(): boolean;

  // RWGltf_CafWriter.SetParallel (method)
  SetParallel(theToParallel: boolean): void;

  // RWGltf_CafWriter.CompressionParameters (method)
  CompressionParameters(): RWGltf_DracoParameters;

  // RWGltf_CafWriter.SetCompressionParameters (method)
  SetCompressionParameters(theDracoParameters: RWGltf_DracoParameters): void;

  // RWGltf_CafWriter.Perform (method)
  Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
  Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;

  // RWGltf_CafWriter.delete (method)
  delete(): void;

  // RWGltf_CafWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_DracoParameters: declare class RWGltf_DracoParameters

  // RWGltf_DracoParameters.constructor (constructor)
  constructor();

  DracoCompression: boolean

  CompressionLevel: number

  QuantizePositionBits: number

  QuantizeNormalBits: number

  QuantizeTexcoordBits: number

  QuantizeColorBits: number

  QuantizeGenericBits: number

  UnifiedQuantization: boolean

  // RWGltf_DracoParameters.delete (method)
  delete(): void;

  // RWGltf_DracoParameters.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfAccessor: declare class RWGltf_GltfAccessor

  // RWGltf_GltfAccessor.constructor (constructor)
  constructor();

  Id: number

  ByteOffset: number

  Count: number

  ByteStride: number

  Type: RWGltf_GltfAccessorLayout

  ComponentType: RWGltf_GltfAccessorCompType

  BndBox: any

  IsCompressed: boolean

  // RWGltf_GltfAccessor.delete (method)
  delete(): void;

  // RWGltf_GltfAccessor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfAccessorCompType: typeof RWGltf_GltfAccessorCompType[keyof typeof RWGltf_GltfAccessorCompType]

RWGltf_GltfAccessorLayout: typeof RWGltf_GltfAccessorLayout[keyof typeof RWGltf_GltfAccessorLayout]

RWGltf_GltfAlphaMode: typeof RWGltf_GltfAlphaMode[keyof typeof RWGltf_GltfAlphaMode]

RWGltf_GltfArrayType: typeof RWGltf_GltfArrayType[keyof typeof RWGltf_GltfArrayType]

RWGltf_GltfBufferView: declare class RWGltf_GltfBufferView

  // RWGltf_GltfBufferView.constructor (constructor)
  constructor();

  Id: number

  ByteOffset: number

  ByteLength: number

  ByteStride: number

  Target: RWGltf_GltfBufferViewTarget

  // RWGltf_GltfBufferView.delete (method)
  delete(): void;

  // RWGltf_GltfBufferView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfBufferViewTarget: typeof RWGltf_GltfBufferViewTarget[keyof typeof RWGltf_GltfBufferViewTarget]

RWGltf_GltfFace: declare class RWGltf_GltfFace extends Standard_Transient

  // RWGltf_GltfFace.constructor (constructor)
  constructor();

  NodePos: RWGltf_GltfAccessor

  NodeNorm: RWGltf_GltfAccessor

  NodeUV: RWGltf_GltfAccessor

  Indices: RWGltf_GltfAccessor

  Shape: TopoDS_Shape

  Style: XCAFPrs_Style

  NbIndexedNodes: number

  // RWGltf_GltfFace.delete (method)
  delete(): void;

  // RWGltf_GltfFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfJsonParser: declare class RWGltf_GltfJsonParser

  // RWGltf_GltfJsonParser.constructor (constructor)
  constructor(theRootShapes: NCollection_Sequence_TopoDS_Shape);

  // RWGltf_GltfJsonParser.SetFilePath (method)
  SetFilePath(theFilePath: TCollection_AsciiString): void;

  // RWGltf_GltfJsonParser.SetProbeHeader (method)
  SetProbeHeader(theToProbe: boolean): void;

  // RWGltf_GltfJsonParser.ErrorPrefix (method)
  ErrorPrefix(): TCollection_AsciiString;

  // RWGltf_GltfJsonParser.SetErrorPrefix (method)
  SetErrorPrefix(theErrPrefix: TCollection_AsciiString): void;

  // RWGltf_GltfJsonParser.SetAttributeMap (method)
  SetAttributeMap(theAttribMap: NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher): void;

  // RWGltf_GltfJsonParser.SetScaleMap (method)
  SetScaleMap(theScaleMap: NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher): void;

  // RWGltf_GltfJsonParser.SetExternalFiles (method)
  SetExternalFiles(theExternalFiles: NCollection_IndexedMap_TCollection_AsciiString): void;

  // RWGltf_GltfJsonParser.SetMetadata (method)
  SetMetadata(theMetadata: any): void;

  // RWGltf_GltfJsonParser.SetReadAssetExtras (method)
  SetReadAssetExtras(theToRead: boolean): void;

  // RWGltf_GltfJsonParser.CoordinateSystemConverter (method)
  CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

  // RWGltf_GltfJsonParser.SetCoordinateSystemConverter (method)
  SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

  // RWGltf_GltfJsonParser.SetBinaryFormat (method)
  SetBinaryFormat(theBinBodyOffset: number, theBinBodyLen: number): void;

  // RWGltf_GltfJsonParser.SetSkipEmptyNodes (method)
  SetSkipEmptyNodes(theToSkip: boolean): void;

  // RWGltf_GltfJsonParser.SetLoadAllScenes (method)
  SetLoadAllScenes(theToLoadAll: boolean): void;

  // RWGltf_GltfJsonParser.SetMeshNameAsFallback (method)
  SetMeshNameAsFallback(theToFallback: boolean): void;

  // RWGltf_GltfJsonParser.SetToApplyScale (method)
  SetToApplyScale(theToApplyScale: boolean): void;

  // RWGltf_GltfJsonParser.Parse (method)
  Parse(theProgress: Message_ProgressRange): boolean;

  // RWGltf_GltfJsonParser.FaceList (method)
  FaceList(): NCollection_DynamicArray_TopoDS_Face;

  // RWGltf_GltfJsonParser.delete (method)
  delete(): void;

  // RWGltf_GltfJsonParser.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfLatePrimitiveArray: declare class RWGltf_GltfLatePrimitiveArray extends RWMesh_TriangulationSource

  // RWGltf_GltfLatePrimitiveArray.constructor (constructor)
  constructor(theId: TCollection_AsciiString, theName: TCollection_AsciiString);

  // RWGltf_GltfLatePrimitiveArray.get_type_name (method)
  static get_type_name(): string;

  // RWGltf_GltfLatePrimitiveArray.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWGltf_GltfLatePrimitiveArray.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWGltf_GltfLatePrimitiveArray.Id (method)
  Id(): TCollection_AsciiString;

  // RWGltf_GltfLatePrimitiveArray.Name (method)
  Name(): TCollection_AsciiString;

  // RWGltf_GltfLatePrimitiveArray.SetName (method)
  SetName(theName: TCollection_AsciiString): void;

  // RWGltf_GltfLatePrimitiveArray.PrimitiveMode (method)
  PrimitiveMode(): RWGltf_GltfPrimitiveMode;

  // RWGltf_GltfLatePrimitiveArray.SetPrimitiveMode (method)
  SetPrimitiveMode(theMode: RWGltf_GltfPrimitiveMode): void;

  // RWGltf_GltfLatePrimitiveArray.HasStyle (method)
  HasStyle(): boolean;

  // RWGltf_GltfLatePrimitiveArray.BaseColor (method)
  BaseColor(): Quantity_ColorRGBA;

  // RWGltf_GltfLatePrimitiveArray.MaterialPbr (method)
  MaterialPbr(): RWGltf_MaterialMetallicRoughness;

  // RWGltf_GltfLatePrimitiveArray.SetMaterialPbr (method)
  SetMaterialPbr(theMat: RWGltf_MaterialMetallicRoughness): void;

  // RWGltf_GltfLatePrimitiveArray.MaterialCommon (method)
  MaterialCommon(): RWGltf_MaterialCommon;

  // RWGltf_GltfLatePrimitiveArray.SetMaterialCommon (method)
  SetMaterialCommon(theMat: RWGltf_MaterialCommon): void;

  // RWGltf_GltfLatePrimitiveArray.Data (method)
  Data(): NCollection_Sequence_RWGltf_GltfPrimArrayData;

  // RWGltf_GltfLatePrimitiveArray.AddPrimArrayData (method)
  AddPrimArrayData(theType: RWGltf_GltfArrayType): RWGltf_GltfPrimArrayData;

  // RWGltf_GltfLatePrimitiveArray.HasDeferredData (method)
  HasDeferredData(): boolean;

  // RWGltf_GltfLatePrimitiveArray.LoadStreamData (method)
  LoadStreamData(): Poly_Triangulation;

  // RWGltf_GltfLatePrimitiveArray.delete (method)
  delete(): void;

  // RWGltf_GltfLatePrimitiveArray.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfMaterialMap: declare class RWGltf_GltfMaterialMap extends RWMesh_MaterialMap

  // RWGltf_GltfMaterialMap.constructor (constructor)
  constructor(theFile: TCollection_AsciiString, theDefSamplerId: number);

  // RWGltf_GltfMaterialMap.get_type_name (method)
  static get_type_name(): string;

  // RWGltf_GltfMaterialMap.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWGltf_GltfMaterialMap.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWGltf_GltfMaterialMap.FlushGlbBufferViews (method)
  FlushGlbBufferViews(theWriter: RWGltf_GltfOStreamWriter, theBinDataBufferId: number, theBuffViewId?: number): { theBuffViewId: number };

  // RWGltf_GltfMaterialMap.FlushGlbImages (method)
  FlushGlbImages(theWriter: RWGltf_GltfOStreamWriter): void;

  // RWGltf_GltfMaterialMap.AddImages (method)
  AddImages(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted?: boolean): { theIsStarted: boolean };

  // RWGltf_GltfMaterialMap.AddMaterial (method)
  AddMaterial(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted: boolean): void;
  AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

  // RWGltf_GltfMaterialMap.AddTextures (method)
  AddTextures(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted?: boolean): { theIsStarted: boolean };

  // RWGltf_GltfMaterialMap.NbImages (method)
  NbImages(): number;

  // RWGltf_GltfMaterialMap.NbTextures (method)
  NbTextures(): number;

  // RWGltf_GltfMaterialMap.delete (method)
  delete(): void;

  // RWGltf_GltfMaterialMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfOStreamWriter: declare class RWGltf_GltfOStreamWriter

  // RWGltf_GltfOStreamWriter.delete (method)
  delete(): void;

  // RWGltf_GltfOStreamWriter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfPrimArrayData: declare class RWGltf_GltfPrimArrayData

  // RWGltf_GltfPrimArrayData.constructor (constructor)
  constructor();
  constructor(theType: RWGltf_GltfArrayType);

  StreamData: NCollection_Buffer

  StreamUri: TCollection_AsciiString

  StreamOffset: number

  StreamLength: number

  Accessor: RWGltf_GltfAccessor

  Type: RWGltf_GltfArrayType

  // RWGltf_GltfPrimArrayData.delete (method)
  delete(): void;

  // RWGltf_GltfPrimArrayData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_GltfPrimitiveMode: typeof RWGltf_GltfPrimitiveMode[keyof typeof RWGltf_GltfPrimitiveMode]

RWGltf_GltfRootElement: typeof RWGltf_GltfRootElement[keyof typeof RWGltf_GltfRootElement]

RWGltf_GltfSceneNodeMap: declare class RWGltf_GltfSceneNodeMap

  // RWGltf_GltfSceneNodeMap.constructor (constructor)
  constructor();

  // RWGltf_GltfSceneNodeMap.FindIndex (method)
  FindIndex(theNodeId: TCollection_AsciiString): number;

  // RWGltf_GltfSceneNodeMap.delete (method)
  delete(): void;

  // RWGltf_GltfSceneNodeMap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_MaterialCommon: declare class RWGltf_MaterialCommon extends Standard_Transient

  // RWGltf_MaterialCommon.constructor (constructor)
  constructor();

  AmbientTexture: unknown

  DiffuseTexture: unknown

  SpecularTexture: unknown

  Id: TCollection_AsciiString

  Name: TCollection_AsciiString

  AmbientColor: Quantity_Color

  DiffuseColor: Quantity_Color

  SpecularColor: Quantity_Color

  EmissiveColor: Quantity_Color

  Shininess: number

  Transparency: number

  // RWGltf_MaterialCommon.delete (method)
  delete(): void;

  // RWGltf_MaterialCommon.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_MaterialMetallicRoughness: declare class RWGltf_MaterialMetallicRoughness extends Standard_Transient

  // RWGltf_MaterialMetallicRoughness.constructor (constructor)
  constructor();

  BaseColorTexture: unknown

  MetallicRoughnessTexture: unknown

  EmissiveTexture: unknown

  OcclusionTexture: unknown

  NormalTexture: unknown

  Id: TCollection_AsciiString

  Name: TCollection_AsciiString

  BaseColor: Quantity_ColorRGBA

  EmissiveFactor: [number, number, number]

  Metallic: number

  Roughness: number

  AlphaCutOff: number

  AlphaMode: RWGltf_GltfAlphaMode

  IsDoubleSided: boolean

  // RWGltf_MaterialMetallicRoughness.delete (method)
  delete(): void;

  // RWGltf_MaterialMetallicRoughness.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_TriangulationReader: declare class RWGltf_TriangulationReader extends RWMesh_TriangulationReader

  // RWGltf_TriangulationReader.constructor (constructor)
  constructor();

  // RWGltf_TriangulationReader.get_type_name (method)
  static get_type_name(): string;

  // RWGltf_TriangulationReader.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // RWGltf_TriangulationReader.DynamicType (method)
  DynamicType(): Standard_Type;

  // RWGltf_TriangulationReader.LoadStreamData (method)
  LoadStreamData(theSourceMesh: RWMesh_TriangulationSource, theDestMesh: Poly_Triangulation): boolean;

  // RWGltf_TriangulationReader.delete (method)
  delete(): void;

  // RWGltf_TriangulationReader.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

RWGltf_WriterTrsfFormat: typeof RWGltf_WriterTrsfFormat[keyof typeof RWGltf_WriterTrsfFormat]

RWGltf_CafWriter_Mesh: interface RWGltf_CafWriter_Mesh

  NodesVec: [number, number, number][]

  NormalsVec: [number, number, number][]

  TexCoordsVec: [number, number][]

  IndicesVec: Poly_Triangle[]
