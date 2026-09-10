# libcascade — RWObj

12 top-level symbols. Signatures are verbatim typescript.

// This class provides methods to read and write triangulation from / to the OBJ files
RWObj: declare class RWObj

constructor

// Read specified OBJ file and returns its content as triangulation
static ReadFile(theFile: string, aProgress?: Message_ProgressRange): Poly_Triangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The OBJ mesh reader into XDE document
RWObj_CafReader: declare class RWObj_CafReader extends RWMesh_CafReader

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return single precision flag for reading vertex data (coordinates)
IsSinglePrecision(): boolean;

// Setup single/double precision flag for reading vertex data (coordinates)
SetSinglePrecision(theIsSinglePrecision: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// OBJ writer context from XCAF document
RWObj_CafWriter: declare class RWObj_CafWriter extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return transformation from OCCT to OBJ coordinate system
CoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Return transformation from OCCT to OBJ coordinate system
ChangeCoordinateSystemConverter(): RWMesh_CoordinateSystemConverter;

// Set transformation from OCCT to OBJ coordinate system
SetCoordinateSystemConverter(theConverter: RWMesh_CoordinateSystemConverter): void;

// Return default material definition to be used for nodes with only color defined
DefaultStyle(): XCAFPrs_Style;

// Set default material definition to be used for nodes with only color defined
SetDefaultStyle(theStyle: XCAFPrs_Style): void;

// Write OBJ file and associated MTL material file
Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theRootLabels: NCollection_Sequence_TDF_Label, theLabelFilter: NCollection_Map_TCollection_AsciiString, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
Perform(theDocument: TDocStd_Document, theFileInfo: any, theProgress: Message_ProgressRange): boolean;
// theDocument: input document
// theRootLabels: list of root shapes to export
// theLabelFilter: optional filter with document nodes to export, with keys defined by `XCAFPrs_DocumentExplorer::DefineChildId()` and filled recursively (leaves and parent assembly nodes at all levels)
// theFileInfo: map with file metadata to put into OBJ header section
// theProgress: optional progress indicator

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Material definition for OBJ file format
RWObj_Material: declare class RWObj_Material

constructor

Name: TCollection_AsciiString

DiffuseTexture: TCollection_AsciiString

SpecularTexture: TCollection_AsciiString

BumpTexture: TCollection_AsciiString

AmbientColor: Quantity_Color

DiffuseColor: Quantity_Color

SpecularColor: Quantity_Color

Shininess: number

Transparency: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Reader of mtl files
RWObj_MtlReader: declare class RWObj_MtlReader

constructor

// Read the file
Read(theFolder: TCollection_AsciiString, theFile: TCollection_AsciiString): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Material MTL file writer for OBJ export
RWObj_ObjMaterialMap: declare class RWObj_ObjMaterialMap extends RWMesh_MaterialMap

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Add material
AddMaterial(theStyle: XCAFPrs_Style): TCollection_AsciiString;

// Virtual method actually defining the material (e.g
DefineMaterial(theStyle: XCAFPrs_Style, theKey: TCollection_AsciiString, theName: TCollection_AsciiString): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary low-level tool writing OBJ file
RWObj_ObjWriterContext: declare class RWObj_ObjWriterContext

constructor

NbFaces: number

// Return true if file has been opened
IsOpened(): boolean;

// Correctly close the file
Close(): boolean;

// Return true if normals are defined
HasNormals(): boolean;

// Set if normals are defined
SetNormals(theHasNormals: boolean): void;

// Return true if normals are defined
HasTexCoords(): boolean;

// Set if normals are defined
SetTexCoords(theHasTexCoords: boolean): void;

// Write the header
WriteHeader(theNbNodes: number, theNbElems: number, theMatLib: TCollection_AsciiString, theFileInfo: any): boolean;

// Return active material or empty string if not set
ActiveMaterial(): TCollection_AsciiString;

// Set active material
WriteActiveMaterial(theMaterial: TCollection_AsciiString): boolean;

// Writing a group name
WriteGroup(theValue: TCollection_AsciiString): boolean;

// Increment indices shift
FlushFace(theNbNodes: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An abstract class implementing procedure to read OBJ file
RWObj_Reader: declare class RWObj_Reader extends Standard_Transient

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Open stream and pass it to Read method Returns true if success, false on error
Read(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;

// Open stream and pass it to Probe method
Probe(theFile: TCollection_AsciiString, theProgress: Message_ProgressRange): boolean;
// theFile: path to the file
// theProgress: progress indicator

// Returns file comments (lines starting with # at the beginning of file)
FileComments(): TCollection_AsciiString;

// Return the list of external file references
ExternalFiles(): NCollection_IndexedMap_TCollection_AsciiString;

// Number of probed nodes
NbProbeNodes(): number;

NbProbeElems(): number;

// Returns memory limit in bytes
MemoryLimit(): number;

// Specify memory limit in bytes, so that import will be aborted by specified limit before memory allocation error occurs
SetMemoryLimit(theMemLimit: number): void;

// Return transformation from one coordinate system to another
Transformation(): RWMesh_CoordinateSystemConverter;

// Setup transformation from one coordinate system to another
SetTransformation(theCSConverter: RWMesh_CoordinateSystemConverter): void;

// Return single precision flag for reading vertex data (coordinates)
IsSinglePrecision(): boolean;

// Setup single/double precision flag for reading vertex data (coordinates)
SetSinglePrecision(theIsSinglePrecision: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Sub-mesh definition for OBJ reader
RWObj_SubMesh: declare class RWObj_SubMesh

constructor

Object: TCollection_AsciiString

Group: TCollection_AsciiString

SmoothGroup: TCollection_AsciiString

Material: TCollection_AsciiString

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Reason for creating a new group within OBJ reader
RWObj_SubMeshReason: typeof RWObj_SubMeshReason[keyof typeof RWObj_SubMeshReason]

// Interface to store shape attributes into document
RWObj_IShapeReceiver: declare class RWObj_IShapeReceiver

BindNamedShape(theShape: TopoDS_Shape, theName: TCollection_AsciiString, theMaterial: RWObj_Material, theIsRootShape: boolean): void;
// theShape: shape to register
// theName: shape name
// theMaterial: shape material
// theIsRootShape: indicates that this is a root object (free shape)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// {@link RWObj_Reader`RWObj_Reader`} implementation dumping OBJ file into {@link Poly_Triangulation`Poly_Triangulation`}
RWObj_TriangulationReader: declare class RWObj_TriangulationReader extends RWObj_Reader

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Set flag to create shapes
SetCreateShapes(theToCreateShapes: boolean): void;

// Set shape receiver callback
SetShapeReceiver(theReceiver: RWObj_IShapeReceiver): void;

// Create {@link Poly_Triangulation`Poly_Triangulation`} from collected data
GetTriangulation(): Poly_Triangulation;

// Return result shape
ResultShape(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
