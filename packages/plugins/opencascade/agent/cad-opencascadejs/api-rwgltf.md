# libcascade — RWGltf

24 top-level symbols. Signatures are verbatim typescript.

RWGltf_CafReader: declare class RWGltf_CafReader extends RWMesh_CafReader

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

ToParallel(): boolean;

SetParallel(theToParallel: boolean): void;

ToSkipEmptyNodes(): boolean;

SetSkipEmptyNodes(theToSkip: boolean): void;

ToLoadAllScenes(): boolean;

ToApplyScale(): boolean;

SetLoadAllScenes(theToLoadAll: boolean): void;

ToUseMeshNameAsFallback(): boolean;

SetMeshNameAsFallback(theToFallback: boolean): void;

IsDoublePrecision(): boolean;

SetDoublePrecision(theIsDouble: boolean): void;

ToSkipLateDataLoading(): boolean;

SetToSkipLateDataLoading(theToSkip: boolean): void;

SetToApplyScale(theToApplyScale: boolean): void;

ToKeepLateData(): boolean;

SetToKeepLateData(theToKeep: boolean): void;

ToPrintDebugMessages(): boolean;

SetToPrintDebugMessages(theToPrint: boolean): void;

delete(): void;

[Symbol.dispose](): void;

RWGltf_CafWriter: declare class RWGltf_CafWriter extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

IsBinary(): boolean;

TransformationFormat(): RWGltf_WriterTrsfFormat;

SetTransformationFormat(theFormat: RWGltf_WriterTrsfFormat): void;

NodeNameFormat(): RWMesh_NameFormat;

SetNodeNameFormat(theFormat: RWMesh_NameFormat): void;

MeshNameFormat(): RWMesh_NameFormat;

SetMeshNameFormat(theFormat: RWMesh_NameFormat): void;

IsForcedUVExport(): boolean;

SetForcedUVExport(theToForce: boolean): void;

DefaultStyle(): XCAFPrs_Style;

SetDefaultStyle(theStyle: XCAFPrs_Style): void;

ToEmbedTexturesInGlb(): boolean;

SetToEmbedTexturesInGlb(theToEmbedTexturesInGlb: boolean): void;

ToMergeFaces(): boolean;

SetMergeFaces(theToMerge: boolean): void;

ToSplitIndices16(): boolean;

SetSplitIndices16(theToSplit: boolean): void;

ToParallel(): boolean;

SetParallel(theToParallel: boolean): void;

CompressionParameters(): RWGltf_DracoParameters;

SetCompressionParameters(theDracoParameters: RWGltf_DracoParameters): void;

Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;

delete(): void;

[Symbol.dispose](): void;

RWGltf_DracoParameters: declare class RWGltf_DracoParameters

constructor

DracoCompression: boolean

CompressionLevel: number

QuantizePositionBits: number

QuantizeNormalBits: number

QuantizeTexcoordBits: number

QuantizeColorBits: number

QuantizeGenericBits: number

UnifiedQuantization: boolean

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfAccessor: declare class RWGltf_GltfAccessor

constructor

Id: number

ByteOffset: number

Count: number

ByteStride: number

Type: RWGltf_GltfAccessorLayout

ComponentType: RWGltf_GltfAccessorCompType

BndBox: any

IsCompressed: boolean

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfAccessorCompType: typeof RWGltf_GltfAccessorCompType[keyof typeof RWGltf_GltfAccessorCompType]

RWGltf_GltfAccessorLayout: typeof RWGltf_GltfAccessorLayout[keyof typeof RWGltf_GltfAccessorLayout]

RWGltf_GltfAlphaMode: typeof RWGltf_GltfAlphaMode[keyof typeof RWGltf_GltfAlphaMode]

RWGltf_GltfArrayType: typeof RWGltf_GltfArrayType[keyof typeof RWGltf_GltfArrayType]

RWGltf_GltfBufferView: declare class RWGltf_GltfBufferView

constructor

Id: number

ByteOffset: number

ByteLength: number

ByteStride: number

Target: RWGltf_GltfBufferViewTarget

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfBufferViewTarget: typeof RWGltf_GltfBufferViewTarget[keyof typeof RWGltf_GltfBufferViewTarget]

RWGltf_GltfFace: declare class RWGltf_GltfFace extends Standard_Transient

constructor

NodePos: RWGltf_GltfAccessor

NodeNorm: RWGltf_GltfAccessor

NodeUV: RWGltf_GltfAccessor

Indices: RWGltf_GltfAccessor

Shape: TopoDS_Shape

Style: XCAFPrs_Style

NbIndexedNodes: number

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfJsonParser: declare class RWGltf_GltfJsonParser

constructor

SetFilePath(theFilePath: TCollection_AsciiString): void;

SetProbeHeader(theToProbe: boolean): void;

ErrorPrefix(): TCollection_AsciiString;

SetErrorPrefix(theErrPrefix: TCollection_AsciiString): void;

SetAttributeMap(theAttribMap: NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher): void;

SetScaleMap(theScaleMap: NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher): void;

SetExternalFiles(theExternalFiles: NCollection_IndexedMap_TCollection_AsciiString): void;

SetMetadata(theMetadata: any): void;

SetReadAssetExtras(theToRead: boolean): void;

CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

SetBinaryFormat(theBinBodyOffset: number, theBinBodyLen: number): void;

SetSkipEmptyNodes(theToSkip: boolean): void;

SetLoadAllScenes(theToLoadAll: boolean): void;

SetMeshNameAsFallback(theToFallback: boolean): void;

SetToApplyScale(theToApplyScale: boolean): void;

Parse(theProgress: Message_ProgressRange): boolean;

FaceList(): NCollection_DynamicArray_TopoDS_Face;

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfLatePrimitiveArray: declare class RWGltf_GltfLatePrimitiveArray extends RWMesh_TriangulationSource

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

Id(): TCollection_AsciiString;

Name(): TCollection_AsciiString;

SetName(theName: TCollection_AsciiString): void;

PrimitiveMode(): RWGltf_GltfPrimitiveMode;

SetPrimitiveMode(theMode: RWGltf_GltfPrimitiveMode): void;

HasStyle(): boolean;

BaseColor(): Quantity_ColorRGBA;

MaterialPbr(): RWGltf_MaterialMetallicRoughness;

SetMaterialPbr(theMat: RWGltf_MaterialMetallicRoughness): void;

MaterialCommon(): RWGltf_MaterialCommon;

SetMaterialCommon(theMat: RWGltf_MaterialCommon): void;

Data(): NCollection_Sequence_RWGltf_GltfPrimArrayData;

AddPrimArrayData(theType: RWGltf_GltfArrayType): RWGltf_GltfPrimArrayData;

HasDeferredData(): boolean;

LoadStreamData(): Poly_Triangulation;

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfMaterialMap: declare class RWGltf_GltfMaterialMap extends RWMesh_MaterialMap

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

FlushGlbBufferViews(theWriter: RWGltf_GltfOStreamWriter, theBinDataBufferId: number, theBuffViewId?: number): { theBuffViewId: number };

FlushGlbImages(theWriter: RWGltf_GltfOStreamWriter): void;

AddImages(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted?: boolean): { theIsStarted: boolean };

AddMaterial(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted: boolean): void;
AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;
AddMaterial(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted: boolean): void;
AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

AddTextures(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted?: boolean): { theIsStarted: boolean };

NbImages(): number;

NbTextures(): number;

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfOStreamWriter: declare class RWGltf_GltfOStreamWriter

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfPrimArrayData: declare class RWGltf_GltfPrimArrayData

constructor

StreamData: NCollection_Buffer

StreamUri: TCollection_AsciiString

StreamOffset: number

StreamLength: number

Accessor: RWGltf_GltfAccessor

Type: RWGltf_GltfArrayType

delete(): void;

[Symbol.dispose](): void;

RWGltf_GltfPrimitiveMode: typeof RWGltf_GltfPrimitiveMode[keyof typeof RWGltf_GltfPrimitiveMode]

RWGltf_GltfRootElement: typeof RWGltf_GltfRootElement[keyof typeof RWGltf_GltfRootElement]

RWGltf_GltfSceneNodeMap: declare class RWGltf_GltfSceneNodeMap

constructor

FindIndex(theNodeId: TCollection_AsciiString): number;

delete(): void;

[Symbol.dispose](): void;

RWGltf_MaterialCommon: declare class RWGltf_MaterialCommon extends Standard_Transient

constructor

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

delete(): void;

[Symbol.dispose](): void;

RWGltf_MaterialMetallicRoughness: declare class RWGltf_MaterialMetallicRoughness extends Standard_Transient

constructor

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

delete(): void;

[Symbol.dispose](): void;

RWGltf_TriangulationReader: declare class RWGltf_TriangulationReader extends RWMesh_TriangulationReader

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

LoadStreamData(theSourceMesh: RWMesh_TriangulationSource, theDestMesh: Poly_Triangulation): boolean;

delete(): void;

[Symbol.dispose](): void;

RWGltf_WriterTrsfFormat: typeof RWGltf_WriterTrsfFormat[keyof typeof RWGltf_WriterTrsfFormat]

RWGltf_CafWriter_Mesh: interface RWGltf_CafWriter_Mesh

NodesVec: [number, number, number][]

NormalsVec: [number, number, number][]

TexCoordsVec: [number, number][]

IndicesVec: Poly_Triangle[]
