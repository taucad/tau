# libcascade — BRepMesh (2)

23 top-level symbols. Signatures are verbatim typescript.

// Factory for creating {@link BRepMesh_IncrementalMesh`BRepMesh_IncrementalMesh`} instances
BRepMesh_IncrementalMeshFactory: declare class BRepMesh_IncrementalMeshFactory extends BRepMesh_DiscretAlgoFactory

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Creates a new {@link BRepMesh_IncrementalMesh`BRepMesh_IncrementalMesh`} instance
CreateAlgorithm(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;
// theShape: shape to be meshed
// theLinDeflection: linear deflection for meshing
// theAngDeflection: angular deflection for meshing

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Default implementation of {@link IMeshTools_MeshAlgoFactory`IMeshTools_MeshAlgoFactory`} providing algorithms of different complexity depending on type of target surface
BRepMesh_MeshAlgoFactory: declare class BRepMesh_MeshAlgoFactory extends IMeshTools_MeshAlgoFactory

constructor

// Creates instance of meshing algorithm for the given type of surface
GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary tool providing API for manipulation with {@link BRepMesh_DataStructureOfDelaun`BRepMesh_DataStructureOfDelaun`}
BRepMesh_MeshTool: declare class BRepMesh_MeshTool extends Standard_Transient

constructor

// Returns data structure manipulated by this tool
GetStructure(): BRepMesh_DataStructureOfDelaun;

// Dumps triangles to specified file
DumpTriangles(theFileName: string, theTriangles: unknown): void;

// Adds new triangle with specified nodes to mesh
AddAndLegalizeTriangle(thePoint1: number, thePoint2: number, thePoint3: number): void;

// Adds new triangle with specified nodes to mesh
AddTriangle(thePoint1: number, thePoint2: number, thePoint3: number, theEdges: [number, number, number]): void;

// Adds new link to mesh
AddLink(theFirstNode: number, theLastNode: number, theLinkIndex?: number, theLinkOri?: boolean): { theLinkIndex: number; theLinkOri: boolean };

// Performs legalization of triangles connected to the specified link
Legalize(theLinkIndex: number): void;

// Erases all elements connected to the specified artificial node
EraseItemsConnectedTo(theNodeIndex: number): void;

// Cleans frontier links from triangles to the right
CleanFrontierLinks(): void;

// Erases the given set of triangles
EraseTriangles(theTriangles: unknown, theLoopEdges: unknown): void;

// Erases triangle with the given index and adds the free edges into the map
EraseTriangle(theTriangleIndex: number, theLoopEdges: unknown): void;

// Erases all links that have no elements connected to them
EraseFreeLinks(): void;
EraseFreeLinks(theLinks: unknown): void;
EraseFreeLinks(): void;
EraseFreeLinks(theLinks: unknown): void;

// Gives the list of edges with type defined by input parameter
GetEdgesByType(theEdgeType: BRepMesh_DegreeOfFreedom): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepMesh_MeshTool_NodeClassifier: declare class BRepMesh_MeshTool_NodeClassifier

constructor

IsAbove(theNodeIndex: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class implements interface representing tool for discrete model building
BRepMesh_ModelBuilder: declare class BRepMesh_ModelBuilder extends IMeshTools_ModelBuilder

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class implements functionality of model healer tool
BRepMesh_ModelHealer: declare class BRepMesh_ModelHealer extends IMeshTools_ModelAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class implements functionality of model post-processing tool
BRepMesh_ModelPostProcessor: declare class BRepMesh_ModelPostProcessor extends IMeshTools_ModelAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class implements functionality of model pre-processing tool
BRepMesh_ModelPreProcessor: declare class BRepMesh_ModelPreProcessor extends IMeshTools_ModelAlgo

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class extending UV range splitter in order to generate internal nodes for NURBS surface
BRepMesh_NURBSRangeSplitter: declare class BRepMesh_NURBSRangeSplitter extends BRepMesh_UVParamRangeSplitter

constructor

// Updates discrete range of surface according to its geometric range
AdjustRange(): void;

// Returns list of nodes generated using surface data and specified parameters
GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Light weighted structure representing simple link
BRepMesh_OrientedEdge: declare class BRepMesh_OrientedEdge

constructor

// Returns index of first node of the Link
FirstNode(): number;

// Returns index of last node of the Link
LastNode(): number;

// Checks this and other edge for equality
IsEqual(theOther: BRepMesh_OrientedEdge): boolean;
// theOther: edge to be checked against this one

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class represents a pair of integer indices to store element indices connected to link
BRepMesh_PairOfIndex: declare class BRepMesh_PairOfIndex

constructor

// Clears indices
Clear(): void;

// Appends index to the pair
Append(theIndex: number): void;

// Prepends index to the pair
Prepend(theIndex: number): void;

// Returns is pair is empty
IsEmpty(): boolean;

// Returns number of initialized indices
Extent(): number;

// Returns first index of pair
FirstIndex(): number;

// Returns last index of pair
LastIndex(): number;

// Returns index corresponding to the given position in the pair
Index(thePairPos: number): number;
// thePairPos: position of index in the pair (1 or 2)

// Sets index corresponding to the given position in the pair
SetIndex(thePairPos: number, theIndex: number): void;
// thePairPos: position of index in the pair (1 or 2)
// theIndex: index to be stored

// Remove index from the given position
RemoveIndex(thePairPos: number): void;
// thePairPos: position of index in the pair (1 or 2)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a selector and an iterator on a selector of components of a mesh
BRepMesh_SelectorOfDataStructureOfDelaun: declare class BRepMesh_SelectorOfDataStructureOfDelaun extends Standard_Transient

constructor

// Initializes selector by the mesh
Initialize(theMesh: BRepMesh_DataStructureOfDelaun): void;

// Selects all neighboring elements of the given node
NeighboursOf(theNode: BRepMesh_Vertex): void;
NeighboursOf(theLink: BRepMesh_Edge): void;
NeighboursOf(argNo0: BRepMesh_SelectorOfDataStructureOfDelaun): void;
NeighboursOf(theNode: BRepMesh_Vertex): void;
NeighboursOf(theLink: BRepMesh_Edge): void;
NeighboursOf(argNo0: BRepMesh_SelectorOfDataStructureOfDelaun): void;
NeighboursOf(theNode: BRepMesh_Vertex): void;
NeighboursOf(theLink: BRepMesh_Edge): void;
NeighboursOf(argNo0: BRepMesh_SelectorOfDataStructureOfDelaun): void;

// Selects all neighboring elements of node with the given index
NeighboursOfNode(theNodeIndex: number): void;

// Selects all neighboring elements of link with the given index
NeighboursOfLink(theLinkIndex: number): void;

// Selects all neighboring elements by nodes of the given element
NeighboursOfElement(theElementIndex: number): void;

// Adds a level of neighbours by edge the selector
AddNeighbours(): void;

// Returns selected nodes
Nodes(): unknown;

// Returns selected links
Links(): unknown;

// Returns selected elements
Elements(): unknown;

// Gives the list of incices of frontier links
FrontierLinks(): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class providing functionality to compute, retrieve and store data to `TopoDS` and model shape
BRepMesh_ShapeTool: declare class BRepMesh_ShapeTool extends Standard_Transient

constructor

// Returns maximum tolerance of the given face
static MaxFaceTolerance(theFace: TopoDS_Face): number;

// Gets the maximum dimension of the given bounding box
static BoxMaxDimension(theBox: Bnd_Box, theMaxDimension?: number): { theMaxDimension: number };
// theBox: bounding box to be processed
// theMaxDimension: maximum dimension of the given box

// Checks same parameter, same range and degenerativity attributes using geometrical data of the given edge and updates edge model by computed parameters in case of worst case - it can drop flags same parameter and same range to False but never to True if it is already set to False
static CheckAndUpdateFlags(theEdge: unknown, thePCurve: unknown): void;

// Stores the given triangulation into the given face
static AddInFace(theFace: TopoDS_Face): { theTriangulation: Poly_Triangulation; [Symbol.dispose](): void };
// theFace: face to be updated by triangulation

// Nullifies triangulation stored in the face
static NullifyFace(theFace: TopoDS_Face): void;
// theFace: face to be updated by null triangulation

// Nullifies polygon on triangulation stored in the edge
static NullifyEdge(theEdge: TopoDS_Edge, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static NullifyEdge(theEdge: TopoDS_Edge, theLocation: TopLoc_Location): void;
static NullifyEdge(theEdge: TopoDS_Edge, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static NullifyEdge(theEdge: TopoDS_Edge, theLocation: TopLoc_Location): void;
// theEdge: edge to be updated by null polygon
// theTriangulation: triangulation the given edge is associated to
// theLocation: face location

// Updates the given edge by the given tessellated representation
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_Polygon3D): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon1: Poly_PolygonOnTriangulation, thePolygon2: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_Polygon3D): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon1: Poly_PolygonOnTriangulation, thePolygon2: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_Polygon3D): void;
static UpdateEdge(theEdge: TopoDS_Edge, thePolygon1: Poly_PolygonOnTriangulation, thePolygon2: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
// theEdge: edge to be updated
// thePolygon: tessellated representation of the edge to be stored
// theTriangulation: triangulation the given edge is associated to
// theLocation: face location

// Applies location to the given point and return result
static UseLocation(thePnt: gp_Pnt, theLoc: TopLoc_Location): gp_Pnt;
// thePnt: point to be transformed
// theLoc: location to be applied

// Gets the strict UV locations of the extremities of the edge using pcurve
static UVPoints(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theFirstPoint2d: gp_Pnt2d, theLastPoint2d: gp_Pnt2d, isConsiderOrientation: boolean): boolean;
// theFirstPoint2d: Mutated in place
// theLastPoint2d: Mutated in place

// Gets the parametric range of the given edge on the given face
static Range(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; thePCurve: Geom2d_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };
static Range(theEdge: TopoDS_Edge, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; theCurve: Geom_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };
static Range(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; thePCurve: Geom2d_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };
static Range(theEdge: TopoDS_Edge, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; theCurve: Geom_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Builds discrete model of a shape by adding faces and free edges
BRepMesh_ShapeVisitor: declare class BRepMesh_ShapeVisitor extends IMeshTools_ShapeVisitor

constructor

// Handles {@link TopoDS_Face`TopoDS_Face`} object
Visit(theFace: TopoDS_Face): void;
Visit(theEdge: TopoDS_Edge): void;
Visit(theFace: TopoDS_Face): void;
Visit(theEdge: TopoDS_Edge): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class extending default range splitter in order to generate internal nodes for spherical surface
BRepMesh_SphereRangeSplitter: declare class BRepMesh_SphereRangeSplitter extends BRepMesh_DefaultRangeSplitter

constructor

// Returns list of nodes generated using surface data and specified parameters
GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class extending UV range splitter in order to generate internal nodes for NURBS surface
BRepMesh_TorusRangeSplitter: declare class BRepMesh_TorusRangeSplitter extends BRepMesh_UVParamRangeSplitter

constructor

// Returns list of nodes generated using surface data and specified parameters
GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

// Registers border point
AddPoint(thePoint: gp_Pnt2d): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary tool to generate triangulation
BRepMesh_Triangulator: declare class BRepMesh_Triangulator

constructor

// Performs conversion of the given list of triangles to {@link Poly_Triangulation`Poly_Triangulation`}
static ToPolyTriangulation(theNodes: NCollection_Array1_gp_Pnt, thePolyTriangles: NCollection_List_Poly_Triangle): Poly_Triangulation;

// Performs triangulation of source wires and stores triangles the output list
Perform(thePolyTriangles: NCollection_List_Poly_Triangle): boolean;
// thePolyTriangles: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Intended to generate internal mesh nodes using UV parameters of boundary discrete points
BRepMesh_UVParamRangeSplitter: declare class BRepMesh_UVParamRangeSplitter extends BRepMesh_DefaultRangeSplitter

constructor

// Resets this splitter
Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

// Returns U parameters
GetParametersU(): unknown;

// Returns V parameters
GetParametersV(): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary class provides safe value for surfaces that looks like NURBS but has no poles or other characteristics
BRepMesh_UndefinedRangeSplitter: declare class BRepMesh_UndefinedRangeSplitter extends BRepMesh_NURBSRangeSplitter

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Light weighted structure representing vertex of the mesh in parametric space
BRepMesh_Vertex: declare class BRepMesh_Vertex

constructor

// Initializes vertex associated with point in 3d space
Initialize(theUV: gp_XY, theLocation3d: number, theMovability: BRepMesh_DegreeOfFreedom): void;
// theUV: position of vertex in parametric space
// theLocation3d: index of 3d point to be associated with vertex
// theMovability: movability of the vertex

// Returns position of the vertex in parametric space
Coord(): gp_XY;

// Returns position of the vertex in parametric space for modification
ChangeCoord(): gp_XY;

// Returns index of 3d point associated with the vertex
Location3d(): number;

// Returns movability of the vertex
Movability(): BRepMesh_DegreeOfFreedom;

// Sets movability of the vertex
SetMovability(theMovability: BRepMesh_DegreeOfFreedom): void;

// Checks for equality with another vertex
IsEqual(theOther: BRepMesh_Vertex): boolean;
// theOther: vertex to be checked against this one

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class intended for fast searching of the coincidence points
BRepMesh_VertexInspector: declare class BRepMesh_VertexInspector

constructor

static Coord(i: number, thePnt: gp_XY): number;

static Shift(thePnt: gp_XY, theTol: number): gp_XY;

// Registers the given vertex
Add(theVertex: BRepMesh_Vertex): number;
// theVertex: vertex to be registered

// Sets the tolerance to be used for identification of coincident vertices equal for both dimensions
SetTolerance(theTolerance: number): void;
SetTolerance(theToleranceX: number, theToleranceY: number): void;
SetTolerance(theTolerance: number): void;
SetTolerance(theToleranceX: number, theToleranceY: number): void;

// Clear inspector's internal data structures
Clear(): void;

// Deletes vertex with the given index
Delete(theIndex: number): void;
// theIndex: index of vertex to be removed

// Returns number of registered vertices
NbVertices(): number;

// Returns vertex with the given index
GetVertex(theIndex: number): BRepMesh_Vertex;

// Set reference point to be checked
SetPoint(thePoint: gp_XY): void;

// Returns index of point coinciding with regerence one
GetCoincidentPoint(): number;

// Returns list with indexes of vertices that have movability attribute equal to BRepMesh_Deleted and can be replaced with another node
GetListOfDelPoints(): unknown;

// Returns set of mesh vertices
Vertices(): VectorOfVertex;

// Returns set of mesh vertices for modification
ChangeVertices(): VectorOfVertex;

// Performs inspection of a point with the given index
Inspect(theTargetIndex: number): NCollection_CellFilter_Action;
// theTargetIndex: index of a circle to be checked

// Checks indices for equality
static IsEqual(theIndex: number, theTargetIndex: number): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes data structure intended to keep mesh nodes defined in UV space and implements functionality providing their uniqueness regarding their position
BRepMesh_VertexTool: declare class BRepMesh_VertexTool extends Standard_Transient

constructor

// Sets new size of cell for cellfilter equal in both directions
SetCellSize(theSize: number): void;
SetCellSize(theSizeX: number, theSizeY: number): void;
SetCellSize(theSize: number): void;
SetCellSize(theSizeX: number, theSizeY: number): void;

// Sets the tolerance to be used for identification of coincident vertices equal for both dimensions
SetTolerance(theTolerance: number): void;
SetTolerance(theToleranceX: number, theToleranceY: number): void;
SetTolerance(theTolerance: number): void;
SetTolerance(theToleranceX: number, theToleranceY: number): void;

// Gets the tolerance to be used for identification of coincident vertices
GetTolerance(theToleranceX?: number, theToleranceY?: number): { theToleranceX: number; theToleranceY: number };
// theToleranceX: tolerance for X dimension
// theToleranceY: tolerance for Y dimension

// Adds vertex with empty data to the tool
Add(theVertex: BRepMesh_Vertex, isForceAdd: boolean): number;
// theVertex: node to be added to the mesh
// isForceAdd: adds the given node to structure without checking on coincidence with other nodes

// Deletes vertex with the given index from the tool
DeleteVertex(theIndex: number): void;

// Returns set of mesh vertices
Vertices(): VectorOfVertex;

// Returns set of mesh vertices
ChangeVertices(): VectorOfVertex;

// Returns vertex by the given index
FindKey(theIndex: number): BRepMesh_Vertex;

// Returns index of the given vertex
FindIndex(theVertex: BRepMesh_Vertex): number;

// Returns a number of vertices
Extent(): number;

// Returns True when the map contains no keys
IsEmpty(): boolean;

// Substitutes vertex with the given by the given vertex with attributes
Substitute(theIndex: number, theVertex: BRepMesh_Vertex): void;
// theIndex: index of vertex to be substituted
// theVertex: replacement vertex

// Remove last node from the structure
RemoveLast(): void;

// Returns the list with indexes of vertices that have movability attribute equal to BRepMesh_Deleted and can be replaced with another node
GetListOfDelNodes(): unknown;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepMesh_FaceChecker_Segment: interface BRepMesh_FaceChecker_Segment

EdgePtr: unknown

Point1: gp_Pnt2d

Point2: gp_Pnt2d
