# libcascade — RWGltf

24 top-level symbols. Signatures are verbatim typescript.

// The glTF (GL Transmission Format) mesh reader into XDE document
RWGltf_CafReader: declare class RWGltf_CafReader extends RWMesh_CafReader

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return TRUE if multithreaded optimizations are allowed
ToParallel(): boolean;

// Setup multithreaded execution
SetParallel(theToParallel: boolean): void;

// Return TRUE if Nodes without Geometry should be ignored, TRUE by default
ToSkipEmptyNodes(): boolean;

// Set flag to ignore nodes without Geometry
SetSkipEmptyNodes(theToSkip: boolean): void;

// Return TRUE if all scenes in the document should be loaded, FALSE by default which means only main (default) scene will be loaded
ToLoadAllScenes(): boolean;

// Return TRUE if non-uniform scaling should be applied directly to the triangulation
ToApplyScale(): boolean;

// Set flag to flag to load all scenes in the document, FALSE by default which means only main (default) scene will be loaded
SetLoadAllScenes(theToLoadAll: boolean): void;

// Set flag to use Mesh name in case if Node name is empty, TRUE by default
ToUseMeshNameAsFallback(): boolean;

// Set flag to use Mesh name in case if Node name is empty
SetMeshNameAsFallback(theToFallback: boolean): void;

// Return flag to fill in triangulation using double or single precision
IsDoublePrecision(): boolean;

// Set flag to fill in triangulation using double or single precision
SetDoublePrecision(theIsDouble: boolean): void;

// Returns TRUE if data loading should be skipped and can be performed later
ToSkipLateDataLoading(): boolean;

// Sets flag to skip data loading
SetToSkipLateDataLoading(theToSkip: boolean): void;

// Set flag to apply non-uniform scaling directly to the triangulation (modify nodes)
SetToApplyScale(theToApplyScale: boolean): void;

// Returns TRUE if data should be loaded into itself without its transferring to new structure
ToKeepLateData(): boolean;

// Sets flag to keep information about deferred storage to load/unload data later
SetToKeepLateData(theToKeep: boolean): void;

// Returns TRUE if additional debug information should be print
ToPrintDebugMessages(): boolean;

// Sets flag to print debug information
SetToPrintDebugMessages(theToPrint: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// glTF writer context from XCAF document
RWGltf_CafWriter: declare class RWGltf_CafWriter extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return transformation from OCCT to glTF coordinate system
CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Return transformation from OCCT to glTF coordinate system
ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Set transformation from OCCT to glTF coordinate system
SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

// Return flag to write into binary glTF format (.glb), specified within class constructor
IsBinary(): boolean;

// Return preferred transformation format for writing into glTF file
TransformationFormat(): RWGltf_WriterTrsfFormat;

// Set preferred transformation format for writing into glTF file
SetTransformationFormat(theFormat: RWGltf_WriterTrsfFormat): void;

// Return name format for exporting Nodes
NodeNameFormat(): RWMesh_NameFormat;

// Set name format for exporting Nodes
SetNodeNameFormat(theFormat: RWMesh_NameFormat): void;

// Return name format for exporting Meshes
MeshNameFormat(): RWMesh_NameFormat;

// Set name format for exporting Meshes
SetMeshNameFormat(theFormat: RWMesh_NameFormat): void;

// Return TRUE to export UV coordinates even if there are no mapped texture
IsForcedUVExport(): boolean;

// Set flag to export UV coordinates even if there are no mapped texture
SetForcedUVExport(theToForce: boolean): void;

// Return default material definition to be used for nodes with only color defined
DefaultStyle(): XCAFPrs_Style;

// Set default material definition to be used for nodes with only color defined
SetDefaultStyle(theStyle: XCAFPrs_Style): void;

// Return flag to write image textures into GLB file (binary gltf export)
ToEmbedTexturesInGlb(): boolean;

// Set flag to write image textures into GLB file (binary gltf export)
SetToEmbedTexturesInGlb(theToEmbedTexturesInGlb: boolean): void;

// Return flag to merge faces within a single part
ToMergeFaces(): boolean;

// Set flag to merge faces within a single part
SetMergeFaces(theToMerge: boolean): void;

// Return flag to prefer keeping 16-bit indexes while merging face
ToSplitIndices16(): boolean;

// Set flag to prefer keeping 16-bit indexes while merging face
SetSplitIndices16(theToSplit: boolean): void;

// Return TRUE if multithreaded optimizations are allowed
ToParallel(): boolean;

// Setup multithreaded execution
SetParallel(theToParallel: boolean): void;

// Return Draco parameters
CompressionParameters(): RWGltf_DracoParameters;

// Set Draco parameters
SetCompressionParameters(theDracoParameters: RWGltf_DracoParameters): void;

// Write glTF file and associated binary file
Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
// theDocument: input document
// theRootLabels: list of root shapes to export
// theLabelFilter: optional filter with document nodes to export, with keys defined by `XCAFPrs_DocumentExplorer::DefineChildId()` and filled recursively (leaves and parent assembly nodes at all levels)
// theFileInfo: map with file metadata to put into glTF header section
// theProgress: optional progress indicator

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Draco compression parameters
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Low-level glTF data structure defining Accessor
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Low-level glTF enumeration defining Accessor component type
RWGltf_GltfAccessorCompType: typeof RWGltf_GltfAccessorCompType[keyof typeof RWGltf_GltfAccessorCompType]

// Low-level glTF enumeration defining Accessor layout
RWGltf_GltfAccessorLayout: typeof RWGltf_GltfAccessorLayout[keyof typeof RWGltf_GltfAccessorLayout]

// Low-level glTF enumeration defining Alpha Mode
RWGltf_GltfAlphaMode: typeof RWGltf_GltfAlphaMode[keyof typeof RWGltf_GltfAlphaMode]

// Low-level glTF enumeration defining Array type
RWGltf_GltfArrayType: typeof RWGltf_GltfArrayType[keyof typeof RWGltf_GltfArrayType]

// Low-level glTF data structure defining BufferView
RWGltf_GltfBufferView: declare class RWGltf_GltfBufferView

constructor

Id: number

ByteOffset: number

ByteLength: number

ByteStride: number

Target: RWGltf_GltfBufferViewTarget

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Low-level glTF enumeration defining BufferView target
RWGltf_GltfBufferViewTarget: typeof RWGltf_GltfBufferViewTarget[keyof typeof RWGltf_GltfBufferViewTarget]

// Low-level glTF data structure holding single Face (one primitive array) definition
RWGltf_GltfFace: declare class RWGltf_GltfFace extends Standard_Transient

constructor

NodePos: RWGltf_GltfAccessor

NodeNorm: RWGltf_GltfAccessor

NodeUV: RWGltf_GltfAccessor

Indices: RWGltf_GltfAccessor

Shape: TopoDS_Shape

Style: XCAFPrs_Style

NbIndexedNodes: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// INTERNAL tool for parsing glTF document (JSON structure)
RWGltf_GltfJsonParser: declare class RWGltf_GltfJsonParser

constructor

// Set file path
SetFilePath(theFilePath: TCollection_AsciiString): void;

// Set flag for probing file without complete reading
SetProbeHeader(theToProbe: boolean): void;

// Return prefix for reporting issues
ErrorPrefix(): TCollection_AsciiString;

// Set prefix for reporting issues
SetErrorPrefix(theErrPrefix: TCollection_AsciiString): void;

// Set map for storing node attributes
SetAttributeMap(theAttribMap: NCollection_DataMap_TopoDS_Shape_RWMesh_NodeAttributes_TopTools_ShapeMapHasher): void;
// theAttribMap: Mutated in place

// Set map for storing non-uniform scalings
SetScaleMap(theScaleMap: NCollection_DataMap_TopoDS_Shape_gp_XYZ_TopTools_ShapeMapHasher): void;
// theScaleMap: Mutated in place

// Set list for storing external files
SetExternalFiles(theExternalFiles: NCollection_IndexedMap_TCollection_AsciiString): void;
// theExternalFiles: Mutated in place

// Set metadata map
SetMetadata(theMetadata: any): void;
// theMetadata: Mutated in place

// Set flag to translate asset.extras into metadata
SetReadAssetExtras(theToRead: boolean): void;

// Return transformation from glTF to OCCT coordinate system
CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Set transformation from glTF to OCCT coordinate system
SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

// Initialize binary format
SetBinaryFormat(theBinBodyOffset: number, theBinBodyLen: number): void;

// Set flag to ignore nodes without Geometry, TRUE by default
SetSkipEmptyNodes(theToSkip: boolean): void;

// Set flag to flag to load all scenes in the document, FALSE by default which means only main (default) scene will be loaded
SetLoadAllScenes(theToLoadAll: boolean): void;

// Set flag to use Mesh name in case if Node name is empty, TRUE by default
SetMeshNameAsFallback(theToFallback: boolean): void;

// Set flag to apply non-uniform scaling directly to the triangulation (modify nodes)
SetToApplyScale(theToApplyScale: boolean): void;

// Parse glTF document
Parse(theProgress: Message_ProgressRange): boolean;

// Return face list for loading triangulation
FaceList(): NCollection_DynamicArray_TopoDS_Face;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Mesh data wrapper for delayed primitive array loading from glTF file
RWGltf_GltfLatePrimitiveArray: declare class RWGltf_GltfLatePrimitiveArray extends RWMesh_TriangulationSource

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Entity id
Id(): TCollection_AsciiString;

// Entity name
Name(): TCollection_AsciiString;

// Assign entity name
SetName(theName: TCollection_AsciiString): void;

// Return type of primitive array
PrimitiveMode(): RWGltf_GltfPrimitiveMode;

// Set type of primitive array
SetPrimitiveMode(theMode: RWGltf_GltfPrimitiveMode): void;

// Return true if primitive array has assigned material
HasStyle(): boolean;

// Return base color
BaseColor(): Quantity_ColorRGBA;

// Return PBR material definition
MaterialPbr(): RWGltf_MaterialMetallicRoughness;

// Set PBR material definition
SetMaterialPbr(theMat: RWGltf_MaterialMetallicRoughness): void;

// Return common (obsolete) material definition
MaterialCommon(): RWGltf_MaterialCommon;

// Set common (obsolete) material definition
SetMaterialCommon(theMat: RWGltf_MaterialCommon): void;

// Return primitive array data elements
Data(): NCollection_Sequence_RWGltf_GltfPrimArrayData;

// Add primitive array data element
AddPrimArrayData(theType: RWGltf_GltfArrayType): RWGltf_GltfPrimArrayData;

// Return TRUE if there is deferred storage and some triangulation data that can be loaded using `LoadDeferredData()`
HasDeferredData(): boolean;

// Load primitive array saved as stream buffer to new triangulation object
LoadStreamData(): Poly_Triangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Material manager for exporting into glTF format
RWGltf_GltfMaterialMap: declare class RWGltf_GltfMaterialMap extends RWMesh_MaterialMap

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Add bufferView's into RWGltf_GltfRootElement_BufferViews section with images collected by AddImagesToGlb()
FlushGlbBufferViews(theWriter: RWGltf_GltfOStreamWriter, theBinDataBufferId: number, theBuffViewId?: number): { theBuffViewId: number };

// Write RWGltf_GltfRootElement_Images section with images collected by AddImagesToGlb()
FlushGlbImages(theWriter: RWGltf_GltfOStreamWriter): void;

// Add material images in case of non-GLB file (an alternative to AddImagesToGlb() + FlushBufferViews() + FlushImagesGlb())
AddImages(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted?: boolean): { theIsStarted: boolean };

// Add material
AddMaterial(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted: boolean): void;
AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;
AddMaterial(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted: boolean): void;
AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

// Add material textures
AddTextures(theWriter: RWGltf_GltfOStreamWriter, theStyle: XCAFPrs_Style, theIsStarted?: boolean): { theIsStarted: boolean };

// Return extent of images map
NbImages(): number;

// Return extent of textures map
NbTextures(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// rapidjson::Writer wrapper for forward declaration
RWGltf_GltfOStreamWriter: declare class RWGltf_GltfOStreamWriter

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An element within primitive array - vertex attribute or element indexes
RWGltf_GltfPrimArrayData: declare class RWGltf_GltfPrimArrayData

constructor

StreamData: NCollection_Buffer

StreamUri: TCollection_AsciiString

StreamOffset: number

StreamLength: number

Accessor: RWGltf_GltfAccessor

Type: RWGltf_GltfArrayType

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Low-level glTF enumeration defining Primitive type
RWGltf_GltfPrimitiveMode: typeof RWGltf_GltfPrimitiveMode[keyof typeof RWGltf_GltfPrimitiveMode]

// Root elements within glTF JSON document
RWGltf_GltfRootElement: typeof RWGltf_GltfRootElement[keyof typeof RWGltf_GltfRootElement]

// Indexed map of scene nodes with custom search algorithm
RWGltf_GltfSceneNodeMap: declare class RWGltf_GltfSceneNodeMap

constructor

// Find index from document node string identifier
FindIndex(theNodeId: TCollection_AsciiString): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// glTF 1.0 format common (obsolete) material definition
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// glTF 2.0 format PBR material definition
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link RWMesh_TriangulationReader`RWMesh_TriangulationReader`} implementation creating {@link Poly_Triangulation`Poly_Triangulation`}
RWGltf_TriangulationReader: declare class RWGltf_TriangulationReader extends RWMesh_TriangulationReader

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Loads only primitive arrays saved as stream buffer (it is primarily glTF data encoded in base64 saved to temporary buffer during glTF file reading)
LoadStreamData(theSourceMesh: RWMesh_TriangulationSource, theDestMesh: Poly_Triangulation): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Transformation format
RWGltf_WriterTrsfFormat: typeof RWGltf_WriterTrsfFormat[keyof typeof RWGltf_WriterTrsfFormat]

RWGltf_CafWriter_Mesh: interface RWGltf_CafWriter_Mesh

NodesVec: [number, number, number][]

NormalsVec: [number, number, number][]

TexCoordsVec: [number, number][]

IndicesVec: Poly_Triangle[]
