# libcascade — RWMesh

16 top-level symbols. Signatures are verbatim typescript.

// Auxiliary tools for {@link RWMesh`RWMesh`} package
RWMesh: declare class RWMesh

constructor

// Read name attribute from label
static ReadNameAttribute(theLabel: TDF_Label): TCollection_AsciiString;

// Generate name for specified labels
static FormatName(theFormat: RWMesh_NameFormat, theLabel: TDF_Label, theRefLabel: TDF_Label): TCollection_AsciiString;
// theFormat: name format to apply
// theLabel: instance label
// theRefLabel: product label

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The general interface for importing mesh data into XDE document
RWMesh_CafReader: declare class RWMesh_CafReader extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return target document
Document(): TDocStd_Document;

// Set target document
SetDocument(theDoc: TDocStd_Document): void;

// Return prefix for generating root labels names
RootPrefix(): TCollection_AsciiString;

// Set prefix for generating root labels names
SetRootPrefix(theRootPrefix: TCollection_AsciiString): void;

// Flag indicating if partially read file content should be put into the XDE document, TRUE by default
ToFillIncompleteDocument(): boolean;

// Set flag allowing partially read file content to be put into the XDE document
SetFillIncompleteDocument(theToFillIncomplete: boolean): void;

// Return memory usage limit in MiB, -1 by default which means no limit
MemoryLimitMiB(): number;

// Set memory usage limit in MiB
SetMemoryLimitMiB(theLimitMiB: number): void;

// Return coordinate system converter
CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Set coordinate system converter
SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

// Return the length unit to convert into while reading the file, defined as scale factor for m (meters)
SystemLengthUnit(): number;

// Set system length units to convert into while reading the file, defined as scale factor for m (meters)
SetSystemLengthUnit(theUnits: number): void;

// Return TRUE if system coordinate system has been defined
HasSystemCoordinateSystem(): boolean;

// Return system coordinate system
SystemCoordinateSystem(): gp_Ax3;

// Set system origin coordinate system to perform conversion into during read
SetSystemCoordinateSystem(theCS: gp_Ax3): void;
SetSystemCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;
SetSystemCoordinateSystem(theCS: gp_Ax3): void;
SetSystemCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;

// Return the length unit to convert from while reading the file, defined as scale factor for m (meters)
FileLengthUnit(): number;

// Set (override) file length units to convert from while reading the file, defined as scale factor for m (meters)
SetFileLengthUnit(theUnits: number): void;

// Return TRUE if file origin coordinate system has been defined
HasFileCoordinateSystem(): boolean;

// Return file origin coordinate system
FileCoordinateSystem(): gp_Ax3;

// Set (override) file origin coordinate system to perform conversion during read
SetFileCoordinateSystem(theCS: gp_Ax3): void;
SetFileCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;
SetFileCoordinateSystem(theCS: gp_Ax3): void;
SetFileCoordinateSystem(theCS: RWMesh_CoordinateSystem): void;

// Open stream and pass it to Perform method
Perform(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

// Return extended status flags
ExtraStatus(): number;

// Return result as a single shape
SingleShape(): TopoDS_Shape;

// Return the list of complementary files - external references (textures, data, etc.)
ExternalFiles(): NCollection_IndexedMap_TCollection_AsciiString;

// Return metadata map
Metadata(): any;

// Open stream and pass it to ProbeHeader method
ProbeHeader(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Extended status bits
RWMesh_CafReaderStatusEx: typeof RWMesh_CafReaderStatusEx[keyof typeof RWMesh_CafReaderStatusEx]

// {@link Standard `Standard`} coordinate system definition
RWMesh_CoordinateSystem: typeof RWMesh_CoordinateSystem[keyof typeof RWMesh_CoordinateSystem]

// Coordinate system converter defining the following tools
RWMesh_CoordinateSystemConverter: declare class RWMesh_CoordinateSystemConverter

constructor

// Return a standard coordinate system definition
static StandardCoordinateSystem(theSys: RWMesh_CoordinateSystem): gp_Ax3;

// Return TRUE if there is no transformation (target and current coordinates systems are same)
IsEmpty(): boolean;

// Return source length units, defined as scale factor to m (meters)
InputLengthUnit(): number;

// Set source length units as scale factor to m (meters)
SetInputLengthUnit(theInputScale: number): void;

// Return destination length units, defined as scale factor to m (meters)
OutputLengthUnit(): number;

// Set destination length units as scale factor to m (meters)
SetOutputLengthUnit(theOutputScale: number): void;

// Return TRUE if source coordinate system has been set
HasInputCoordinateSystem(): boolean;

// Source coordinate system
InputCoordinateSystem(): gp_Ax3;

// Set source coordinate system
SetInputCoordinateSystem(theSysFrom: gp_Ax3): void;
SetInputCoordinateSystem(theSysFrom: RWMesh_CoordinateSystem): void;
SetInputCoordinateSystem(theSysFrom: gp_Ax3): void;
SetInputCoordinateSystem(theSysFrom: RWMesh_CoordinateSystem): void;

// Return TRUE if destination coordinate system has been set
HasOutputCoordinateSystem(): boolean;

// Destination coordinate system
OutputCoordinateSystem(): gp_Ax3;

// Set destination coordinate system
SetOutputCoordinateSystem(theSysTo: gp_Ax3): void;
SetOutputCoordinateSystem(theSysTo: RWMesh_CoordinateSystem): void;
SetOutputCoordinateSystem(theSysTo: gp_Ax3): void;
SetOutputCoordinateSystem(theSysTo: RWMesh_CoordinateSystem): void;

// Initialize transformation
Init(theInputSystem: gp_Ax3, theInputLengthUnit: number, theOutputSystem: gp_Ax3, theOutputLengthUnit: number): void;

// Transform transformation
TransformTransformation(theTrsf: gp_Trsf): void;
// theTrsf: Mutated in place

// Transform position
TransformPosition(thePos: gp_XYZ): void;
// thePos: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class to iterate through edges
RWMesh_EdgeIterator: declare class RWMesh_EdgeIterator extends RWMesh_ShapeIterator

constructor

// Return true if iterator points to the valid triangulation
More(): boolean;

// Find next value
Next(): void;

// Return current edge
Edge(): TopoDS_Edge;

// Return current edge
Shape(): TopoDS_Shape;

// Return current edge data
Polygon3D(): Poly_Polygon3D;

// Return true if geometry data is defined
IsEmpty(): boolean;

// Lower element index in current triangulation
ElemLower(): number;

// Upper element index in current triangulation
ElemUpper(): number;

// Return number of nodes for the current edge
NbNodes(): number;

// Lower node index in current triangulation
NodeLower(): number;

// Upper node index in current triangulation
NodeUpper(): number;

// Return the node with specified index with applied transformation
node(theNode: number): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class to iterate through triangulated faces
RWMesh_FaceIterator: declare class RWMesh_FaceIterator extends RWMesh_ShapeIterator

constructor

// Return true if iterator points to the valid triangulation
More(): boolean;

// Find next value
Next(): void;

// Return current face
Face(): TopoDS_Face;

// Return current face
Shape(): TopoDS_Shape;

// Return current face triangulation
Triangulation(): Poly_Triangulation;

// Return true if mesh data is defined
IsEmptyMesh(): boolean;

// Return true if mesh data is defined
IsEmpty(): boolean;

// Return face material
FaceStyle(): XCAFPrs_Style;

// Return TRUE if face color is set
HasFaceColor(): boolean;

// Return face color
FaceColor(): Quantity_ColorRGBA;

// Return number of elements of specific type for the current face
NbTriangles(): number;

// Lower element index in current triangulation
ElemLower(): number;

// Upper element index in current triangulation
ElemUpper(): number;

// Return triangle with specified index with applied Face orientation
TriangleOriented(theElemIndex: number): Poly_Triangle;

// Return true if triangulation has defined normals
HasNormals(): boolean;

// Return true if triangulation has defined normals
HasTexCoords(): boolean;

// Return normal at specified node index with face transformation applied and face orientation applied
NormalTransformed(theNode: number): gp_Dir;

// Return number of nodes for the current face
NbNodes(): number;

// Lower node index in current triangulation
NodeLower(): number;

// Upper node index in current triangulation
NodeUpper(): number;

// Return texture coordinates for the node
NodeTexCoord(theNode: number): gp_Pnt2d;

// Return the node with specified index with applied transformation
node(theNode: number): gp_Pnt;

// Return normal at specified node index without face transformation applied
normal(theNode: number): gp_Dir;

// Return triangle with specified index
triangle(theElemIndex: number): Poly_Triangle;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Material manager
RWMesh_MaterialMap: declare class RWMesh_MaterialMap extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return default material definition to be used for nodes with only color defined
DefaultStyle(): XCAFPrs_Style;

// Set default material definition to be used for nodes with only color defined
SetDefaultStyle(theStyle: XCAFPrs_Style): void;

// Find already registered material
FindMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

// Register material and return its name identifier
AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

// Create texture folder "modelName/textures"
CreateTextureFolder(): boolean;

// Virtual method actually defining the material (e.g
DefineMaterial(theStyle: XCAFPrs_Style, theKey: TCollection_AsciiString, theName: TCollection_AsciiString): void;

// Return failed flag
IsFailed(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Name format preference for XCAF shape labels
RWMesh_NameFormat: typeof RWMesh_NameFormat[keyof typeof RWMesh_NameFormat]

// Attributes of the node
RWMesh_NodeAttributes: declare class RWMesh_NodeAttributes

constructor

Name: TCollection_AsciiString

RawName: TCollection_AsciiString

NamedData: TDataStd_NamedData

Style: XCAFPrs_Style

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This is a virtual base class for other shape iterators
RWMesh_ShapeIterator: declare class RWMesh_ShapeIterator

// Return explored shape
ExploredShape(): TopoDS_Shape;

// Return shape
Shape(): TopoDS_Shape;

// Return true if iterator points to the valid triangulation
More(): boolean;

// Find next value
Next(): void;

// Return true if mesh data is defined
IsEmpty(): boolean;

// Return shape material
Style(): XCAFPrs_Style;

// Return TRUE if shape color is set
HasColor(): boolean;

// Return shape color
Color(): Quantity_ColorRGBA;

// Lower element index in current triangulation
ElemLower(): number;

// Upper element index in current triangulation
ElemUpper(): number;

// Return number of nodes for the current shape
NbNodes(): number;

// Lower node index in current shape
NodeLower(): number;

// Upper node index in current shape
NodeUpper(): number;

// Return the node with specified index with applied transformation
NodeTransformed(theNode: number): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Interface for reading primitive array from the buffer
RWMesh_TriangulationReader: declare class RWMesh_TriangulationReader extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns file name for reporting issues
FileName(): TCollection_AsciiString;

// Sets file name for reporting issues
SetFileName(theFileName: TCollection_AsciiString): void;

// Returns coordinate system converter using for correct data loading
CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Sets coordinate system converter
SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

// Returns flag to fill in triangulation using double or single precision
IsDoublePrecision(): boolean;

// Sets flag to fill in triangulation using double or single precision
SetDoublePrecision(theIsDouble: boolean): void;

// Returns TRUE if degenerated triangles should be skipped during mesh loading (only indexes will be checked)
ToSkipDegenerates(): boolean;

// Sets flag to skip degenerated triangles during mesh loading (only indexes will be checked)
SetToSkipDegenerates(theToSkip: boolean): void;

// Returns TRUE if additional debug information should be print
ToPrintDebugMessages(): boolean;

// Sets flag to print debug information
SetToPrintDebugMessages(theToPrint: boolean): void;

// Starts and reset internal object that accumulates nodes/triangles statistic during data reading
StartStatistic(): void;

// Stops and nullify internal object that accumulates nodes/triangles statistic during data reading
StopStatistic(): void;

// Prints loading statistic
PrintStatistic(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

RWMesh_TriangulationReader_LoadingStatistic: declare class RWMesh_TriangulationReader_LoadingStatistic

constructor

ExpectedNodesNb: number

LoadedNodesNb: number

ExpectedTrianglesNb: number

DegeneratedTrianglesNb: number

LoadedTrianglesNb: number

Reset(): void;

PrintStatistic(thePrefix?: TCollection_AsciiString): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Mesh data wrapper for delayed triangulation loading
RWMesh_TriangulationSource: declare class RWMesh_TriangulationSource extends Poly_Triangulation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns reader allowing to read data from the buffer
Reader(): RWMesh_TriangulationReader;

// Sets reader allowing to read data from the buffer
SetReader(theReader: RWMesh_TriangulationReader): void;

// Returns number of degenerated triangles collected during data reading
DegeneratedTriNb(): number;

// Gets access to number of degenerated triangles to collect them during data reading
ChangeDegeneratedTriNb(): number;

// Returns TRUE if triangulation has some geometry
HasGeometry(): boolean;

// Returns the number of edges for this triangulation
NbEdges(): number;

// Returns edge at the given index
Edge(theIndex: number): number;
// theIndex: edge index within [1, `NbEdges()`] range

// Sets an edge
SetEdge(theIndex: number, theEdge: number): void;
// theIndex: edge index within [1, `NbEdges()`] range
// theEdge: edge node indices, with each node defined within [1, `NbNodes()`] range

NbDeferredNodes(): number;

SetNbDeferredNodes(theNbNodes: number): void;

NbDeferredTriangles(): number;

SetNbDeferredTriangles(theNbTris: number): void;

InternalEdges(): NCollection_Array1_int;

ResizeEdges(theNbEdges: number, theToCopyOld: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class to iterate through vertices
RWMesh_VertexIterator: declare class RWMesh_VertexIterator extends RWMesh_ShapeIterator

constructor

// Return true if iterator points to the valid triangulation
More(): boolean;

// Find next value
Next(): void;

// Return current edge
Vertex(): TopoDS_Vertex;

// Return current vertex
Shape(): TopoDS_Shape;

// Return current vertex data
Point(): gp_Pnt;

// Return true if geometry data is defined
IsEmpty(): boolean;

// Lower element index in current triangulation
ElemLower(): number;

// Upper element index in current triangulation
ElemUpper(): number;

// Return number of nodes for the current edge
NbNodes(): number;

// Lower node index in current triangulation
NodeLower(): number;

// Upper node index in current triangulation
NodeUpper(): number;

// Return the node with specified index with applied transformation
node(argNo0: number): gp_Pnt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

RWMesh_CafReader_CafDocumentTools: interface RWMesh_CafReader_CafDocumentTools

ShapeTool: XCAFDoc_ShapeTool

ColorTool: XCAFDoc_ColorTool

VisMaterialTool: XCAFDoc_VisMaterialTool

ComponentMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher

OriginalShapeMap: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher
