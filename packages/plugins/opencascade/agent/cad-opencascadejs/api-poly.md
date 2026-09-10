# libcascade — Poly

24 top-level symbols. Signatures are verbatim typescript.

// This package provides classes and services to handle
Poly: declare class Poly

constructor

// Computes and stores the link from nodes to triangles and from triangles to neighbouring triangles
static Catenate(lstTri: NCollection_List_handle_Poly_Triangulation): Poly_Triangulation;

// Compute node normals for face triangulation as mean normal of surrounding triangles
static ComputeNormals(Tri: Poly_Triangulation): void;

// Computes parameters of the point P on triangle defined by points P1, P2, and P3, in 2d
static PointOnTriangle(P1: gp_XY, P2: gp_XY, P3: gp_XY, P: gp_XY, UV: gp_XY): number;
// UV: Mutated in place

// Computes the intersection between axis and triangulation
static Intersect(theTri: Poly_Triangulation, theAxis: gp_Ax1, theIsClosest: boolean, theTriangle: Poly_Triangle, theDistance?: number): { returnValue: boolean; theDistance: number };
// theTri: input triangulation
// theAxis: intersecting ray
// theIsClosest: finds the closest intersection when TRUE, finds the farthest otherwise
// theTriangle: intersected triangle Mutated in place
// theDistance: distance along ray to intersection point

// Computes the intersection between a triangle defined by three vertexes and a line
static IntersectTriLine(theStart: gp_XYZ, theDir: gp_Dir, theV0: gp_XYZ, theV1: gp_XYZ, theV2: gp_XYZ, theParam?: number): { returnValue: number; theParam: number };
// theStart: picking ray origin
// theDir: picking ray direction
// theV0: first triangle node
// theV1: second triangle node
// theV2: third triangle node
// theParam: param on line of the intersection point

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an array of 3D nodes of single/double precision configurable at construction time
Poly_ArrayOfNodes: declare class Poly_ArrayOfNodes

constructor

// Returns TRUE if array defines nodes with double precision
IsDoublePrecision(): boolean;

// Sets if array should define nodes with double or single precision
SetDoublePrecision(theIsDouble: boolean): void;

// Copies data of theOther array to this
Assign(theOther: Poly_ArrayOfNodes): Poly_ArrayOfNodes;

// Move assignment
Move(theOther: Poly_ArrayOfNodes): Poly_ArrayOfNodes;
// theOther: Mutated in place

// A generalized accessor to point
Value(theIndex: number): gp_Pnt;

// A generalized setter for point
SetValue(theIndex: number, theValue: gp_Pnt): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines an array of 2D nodes of single/double precision configurable at construction time
Poly_ArrayOfUVNodes: declare class Poly_ArrayOfUVNodes

constructor

// Returns TRUE if array defines nodes with double precision
IsDoublePrecision(): boolean;

// Sets if array should define nodes with double or single precision
SetDoublePrecision(theIsDouble: boolean): void;

// Copies data of theOther array to this
Assign(theOther: Poly_ArrayOfUVNodes): Poly_ArrayOfUVNodes;

// Move assignment
Move(theOther: Poly_ArrayOfUVNodes): Poly_ArrayOfUVNodes;
// theOther: Mutated in place

// A generalized accessor to point
Value(theIndex: number): gp_Pnt2d;

// A generalized setter for point
SetValue(theIndex: number, theValue: gp_Pnt2d): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Link between two mesh nodes that is created by existing triangle(s)
Poly_CoherentLink: declare class Poly_CoherentLink

constructor

// Return the node index in the current triangulation
Node(ind: number): number;
// ind: 0 or 1 making distinction of the two nodes that constitute the Link

// Return the opposite node (belonging to the left or right incident triangle) index in the current triangulation
OppositeNode(ind: number): number;
// ind: 0 or 1 making distinction of the two involved triangles

// Query the status of the link - if it is an invalid one
IsEmpty(): boolean;

// Invalidate this Link
Nullify(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Node of coherent triangulation
Poly_CoherentNode: declare class Poly_CoherentNode extends gp_XYZ

constructor

// Set the UV coordinates of the Node
SetUV(theU: number, theV: number): void;

// Get U coordinate of the Node
GetU(): number;

// Get V coordinate of the Node
GetV(): number;

// Define the normal vector in the Node
SetNormal(theVector: gp_XYZ): void;

// Query if the Node contains a normal vector
HasNormal(): boolean;

// Get the stored normal in the node
GetNormal(): gp_XYZ;

// Set the value of node Index
SetIndex(theIndex: number): void;

// Get the value of node Index
GetIndex(): number;

// Check if this is a free node, i.e., a node without a single incident triangle
IsFreeNode(): boolean;

// Reset the Node to void
Clear(argNo0: NCollection_BaseAllocator): void;

// Connect a triangle to this Node
AddTriangle(theTri: Poly_CoherentTriangle, theA: NCollection_BaseAllocator): void;

// Disconnect a triangle from this Node
RemoveTriangle(theTri: Poly_CoherentTriangle, theA: NCollection_BaseAllocator): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_CoherentTriPtr_Iterator: declare class Poly_CoherentTriPtr_Iterator

constructor

First(): Poly_CoherentTriangle;

More(): boolean;

Next(): void;

Value(): Poly_CoherentTriangle;

ChangeValue(): Poly_CoherentTriangle;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Data class used in Poly_CoherentTriangultion
Poly_CoherentTriangle: declare class Poly_CoherentTriangle

constructor

// Query the node index in the position given by the parameter 'ind'
Node(ind: number): number;

// Query if this is a valid triangle
IsEmpty(): boolean;

// Create connection with another triangle theTri
SetConnection(iConn: number, theTr: Poly_CoherentTriangle): boolean;
SetConnection(theTri: Poly_CoherentTriangle): boolean;
SetConnection(iConn: number, theTr: Poly_CoherentTriangle): boolean;
SetConnection(theTri: Poly_CoherentTriangle): boolean;
// iConn: Can be 0, 1 or 2 - index of the node that is opposite to the connection (shared link)
// theTr: Triangle that is connected on the given link

// Remove the connection with the given index
RemoveConnection(iConn: number): void;
RemoveConnection(theTri: Poly_CoherentTriangle): boolean;
RemoveConnection(iConn: number): void;
RemoveConnection(theTri: Poly_CoherentTriangle): boolean;
// iConn: Can be 0, 1 or 2 - index of the node that is opposite to the connection (shared link)

// Query the number of connected triangles
NConnections(): number;

// Query the connected node on the given side
GetConnectedNode(iConn: number): number;

// Query the connected triangle on the given side
GetConnectedTri(iConn: number): Poly_CoherentTriangle;

// Query the Link associate with the given side of the Triangle
GetLink(iLink: number): Poly_CoherentLink;

// Returns the index of the connection with the given triangle, or -1 if not found
FindConnection(argNo0: Poly_CoherentTriangle): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of HANDLE object using `Standard_DefineHandle.hxx`
Poly_CoherentTriangulation: declare class Poly_CoherentTriangulation extends Standard_Transient

constructor

// Create an instance of {@link Poly_Triangulation`Poly_Triangulation`} from this object
GetTriangulation(): Poly_Triangulation;

// Find and remove degenerated triangles in Triangulation
RemoveDegenerated(theTol: number, pLstRemovedNode?: any): boolean;
// theTol: Tolerance for the degeneration case
// pLstRemovedNode: Optional parameter

// Create a list of free nodes
GetFreeNodes(lstNodes: NCollection_List_int): boolean;
// lstNodes: `[out]` List that receives the indices of free nodes

// Query the index of the last node in the triangulation
MaxNode(): number;

// Query the index of the last triangle in the triangulation
MaxTriangle(): number;

// Set the Deflection value as the parameter of the given triangulation
SetDeflection(theDefl: number): void;

// Query the Deflection parameter (default value 0
Deflection(): number;

// Initialize a node
SetNode(thePnt: gp_XYZ, iN?: number): number;
// iN: Index of the node

// Get the node at the given index 'i'
Node(i: number): Poly_CoherentNode;

// Get the node at the given index 'i'
ChangeNode(i: number): Poly_CoherentNode;

// Query the total number of active nodes (i.e
NNodes(): number;

// Get the triangle at the given index 'i'
Triangle(i: number): Poly_CoherentTriangle;

// Query the total number of active triangles (i.e
NTriangles(): number;

// Query the total number of active Links
NLinks(): number;

// Removal of a single triangle from the triangulation
RemoveTriangle(theTr: Poly_CoherentTriangle): boolean;
// theTr: Mutated in place

// Removal of a single link from the triangulation
RemoveLink(theLink: Poly_CoherentLink): void;
// theLink: Mutated in place

// Add a triangle to the triangulation
AddTriangle(iNode0: number, iNode1: number, iNode2: number): Poly_CoherentTriangle;

// Replace nodes in the given triangle
ReplaceNodes(theTriangle: Poly_CoherentTriangle, iNode0: number, iNode1: number, iNode2: number): boolean;
// theTriangle: Mutated in place

// Add a single link to triangulation, based on a triangle and its side index
AddLink(theTri: Poly_CoherentTriangle, theConn: number): Poly_CoherentLink;
// theTri: Triangle that contains the link to be added
// theConn: Index of the side (i.e., 0, 1 0r 2) defining the added link

// Find one or two triangles that share the given couple of nodes
FindTriangle(theLink: Poly_CoherentLink, pTri: [Poly_CoherentTriangle, Poly_CoherentTriangle]): boolean;
// theLink: Link (in fact, just a couple of nodes) on which the triangle is searched
// pTri: `[out]` Array of two pointers to triangle

// (Re)Calculate all links in this Triangulation
ComputeLinks(): number;

// Clear all Links data from the Triangulation data
ClearLinks(): void;

// Query the allocator of elements, this allocator can be used for other objects
Allocator(): NCollection_BaseAllocator;

// Create a copy of this Triangulation, using the given allocator
Clone(theAlloc: NCollection_BaseAllocator): Poly_CoherentTriangulation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfLink: declare class Poly_CoherentTriangulation_IteratorOfLink

constructor

Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfNode: declare class Poly_CoherentTriangulation_IteratorOfNode

constructor

Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_CoherentTriangulation_IteratorOfTriangle: declare class Poly_CoherentTriangulation_IteratorOfTriangle

constructor

Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides an algorithm to explore, inside a triangulation, the adjacency data for a node or a triangle
Poly_Connect: declare class Poly_Connect

constructor

// Initialize the algorithm to explore the adjacency data of nodes or triangles for the triangulation theTriangulation
Load(theTriangulation: Poly_Triangulation): void;

// Returns the triangulation analyzed by this tool
Triangulation(): Poly_Triangulation;

// Returns the index of a triangle containing the node at index N in the nodes table specific to the triangulation analyzed by this tool
Triangle(N: number): number;

// Returns in t1, t2 and t3, the indices of the 3 triangles adjacent to the triangle at index T in the triangles table specific to the triangulation analyzed by this tool
Triangles(T: number, t1?: number, t2?: number, t3?: number): { t1: number; t2: number; t3: number };

// Returns, in n1, n2 and n3, the indices of the 3 nodes adjacent to the triangle referenced at index T in the triangles table specific to the triangulation analyzed by this tool
Nodes(T: number, n1?: number, n2?: number, n3?: number): { n1: number; n2: number; n3: number };

// Initializes an iterator to search for all the triangles containing the node referenced at index N in the nodes table, for the triangulation analyzed by this tool
Initialize(N: number): void;

// Returns true if there is another element in the iterator defined with the function Initialize (i.e
More(): boolean;

// Advances the iterator defined with the function Initialize to access the next triangle
Next(): void;

// Returns the index of the current triangle to which the iterator, defined with the function Initialize, points
Value(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Make loops from a set of connected links
Poly_MakeLoops: declare class Poly_MakeLoops

// It is to reset the algorithm to the initial state
Reset(theHelper: Poly_MakeLoops_Helper, theAlloc?: NCollection_BaseAllocator): void;

// Adds a link to the set
AddLink(theLink: Poly_MakeLoops_Link): void;

// Replace one link with another (e.g
ReplaceLink(theLink: Poly_MakeLoops_Link, theNewLink: Poly_MakeLoops_Link): void;

// Set a new value of orientation of a link already added earlier
SetLinkOrientation(theLink: Poly_MakeLoops_Link, theOrient: Poly_MakeLoops_LinkFlag): Poly_MakeLoops_LinkFlag;

// Find the link stored in algo by value
FindLink(theLink: Poly_MakeLoops_Link): Poly_MakeLoops_Link;

// Does the work
Perform(): number;

// Returns the number of loops in the result
GetNbLoops(): number;

// Returns the loop of the given index
GetLoop(theIndex: number): any;

// Returns the number of detected hanging chains
GetNbHanging(): number;

// Fills in the list of hanging links
GetHangingLinks(theLinks: any): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Orientation flags that can be attached to a link
Poly_MakeLoops_LinkFlag: typeof Poly_MakeLoops_LinkFlag[keyof typeof Poly_MakeLoops_LinkFlag]

Poly_MakeLoops_ResultCode: typeof Poly_MakeLoops_ResultCode[keyof typeof Poly_MakeLoops_ResultCode]

Poly_MakeLoops2D_Helper: declare class Poly_MakeLoops2D_Helper extends Poly_MakeLoops_Helper

GetFirstTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir2d): boolean;

GetLastTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir2d): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_MakeLoops3D_Helper: declare class Poly_MakeLoops3D_Helper extends Poly_MakeLoops_Helper

GetFirstTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir): boolean;

GetLastTangent(theLink: Poly_MakeLoops_Link, theDir: gp_Dir): boolean;

GetNormal(theNode: number, theDir: gp_Dir): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_MakeLoops_Hasher: declare class Poly_MakeLoops_Hasher

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_MakeLoops_HeapOfInteger: declare class Poly_MakeLoops_HeapOfInteger

constructor

Clear(): void;

Add(theValue: number): void;

Top(): number;

Contains(theValue: number): boolean;

Remove(theValue: number): void;

IsEmpty(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_MakeLoops_Helper: declare class Poly_MakeLoops_Helper

GetAdjacentLinks(theNode: number): any;

OnAddLink(argNo0: number, argNo1: Poly_MakeLoops_Link): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_MakeLoops_Link: declare class Poly_MakeLoops_Link

constructor

node1: number

node2: number

flags: number

Reverse(): void;

IsReversed(): boolean;

Nullify(): void;

IsNull(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Auxiliary tool for merging triangulation nodes for visualization purposes
Poly_MergeNodesTool: declare class Poly_MergeNodesTool extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Merge nodes of existing mesh and return the new mesh
static MergeNodes(theTris: Poly_Triangulation, theTrsf: gp_Trsf, theToReverse: boolean, theSmoothAngle: number, theMergeTolerance?: number, theToForce?: boolean): Poly_Triangulation;
// theTris: triangulation to add
// theTrsf: transformation to apply
// theToReverse: reverse triangle nodes order
// theSmoothAngle: merge angle in radians
// theMergeTolerance: linear merge tolerance
// theToForce: return merged triangulation even if it's statistics is equal to input one

// Return merge tolerance
MergeTolerance(): number;

// Set merge tolerance
SetMergeTolerance(theTolerance: number): void;

// Return merge angle in radians
MergeAngle(): number;

// Set merge angle
SetMergeAngle(theAngleRad: number): void;

// Return TRUE if nodes with opposite normals should be merged
ToMergeOpposite(): boolean;

// Set if nodes with opposite normals should be merged
SetMergeOpposite(theToMerge: boolean): void;

// Setup unit factor
SetUnitFactor(theUnitFactor: number): void;

// Return TRUE if degenerate elements should be discarded
ToDropDegenerative(): boolean;

// Set if degenerate elements should be discarded
SetDropDegenerative(theToDrop: boolean): void;

// Return TRUE if equal elements should be filtered
ToMergeElems(): boolean;

// Set if equal elements should be filtered
SetMergeElems(theToMerge: boolean): void;

// Compute normal for the mesh element
computeTriNormal(): [number, number, number];

// Add another triangulation to created one
AddTriangulation(theTris: Poly_Triangulation, theTrsf?: gp_Trsf, theToReverse?: boolean): void;
// theTris: triangulation to add
// theTrsf: transformation to apply
// theToReverse: reverse triangle nodes order

// Prepare and return result triangulation (temporary data will be truncated to result size)
Result(): Poly_Triangulation;

// Add new triangle
AddTriangle(theElemNodes: [gp_XYZ, gp_XYZ, gp_XYZ]): void;
// theElemNodes: 3 element nodes

// Add new quad
AddQuad(theElemNodes: [gp_XYZ, gp_XYZ, gp_XYZ, gp_XYZ]): void;
// theElemNodes: 4 element nodes

// Add new triangle or quad
AddElement(theElemNodes: gp_XYZ, theNbNodes: number): void;
// theElemNodes: element nodes
// theNbNodes: number of element nodes, should be 3 or 4

// Change node coordinates of element to be pushed
ChangeElementNode(theIndex: number): gp_XYZ;
// theIndex: node index within current element, in 0..3 range

// Add new triangle or quad with nodes specified by `ChangeElementNode()`
PushLastElement(theNbNodes: number): void;

// Add new triangle with nodes specified by `ChangeElementNode()`
PushLastTriangle(): void;

// Add new quad with nodes specified by `ChangeElementNode()`
PushLastQuad(): void;

// Return current element node index defined by `PushLastElement()`
ElementNodeIndex(theIndex: number): number;

// Return number of nodes
NbNodes(): number;

// Return number of elements
NbElements(): number;

// Return number of discarded degenerate elements
NbDegenerativeElems(): number;

// Return number of merged equal elements
NbMergedElems(): number;

// Setup output triangulation for modifications
ChangeOutput(): Poly_Triangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a polygon in 2D space (for example, in the parametric space of a surface)
Poly_Polygon2D: declare class Poly_Polygon2D extends Standard_Transient

constructor

// Creates a copy of current polygon
Copy(): Poly_Polygon2D;

// Returns the deflection of this polygon
Deflection(): number;
Deflection(theDefl: number): void;
Deflection(): number;
Deflection(theDefl: number): void;

// Returns the number of nodes in this polygon
NbNodes(): number;

// Returns the table of nodes for this polygon
Nodes(): NCollection_Array1_gp_Pnt2d;

// Returns the table of nodes for this polygon
ChangeNodes(): NCollection_Array1_gp_Pnt2d;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class Provides a polygon in 3D space
Poly_Polygon3D: declare class Poly_Polygon3D extends Standard_Transient

constructor

// Creates a copy of current polygon
Copy(): Poly_Polygon3D;

// Returns the deflection of this polygon
Deflection(): number;
Deflection(theDefl: number): void;
Deflection(): number;
Deflection(theDefl: number): void;

// Returns the number of nodes in this polygon
NbNodes(): number;

// Returns the table of nodes for this polygon
Nodes(): NCollection_Array1_gp_Pnt;

// Returns the table of nodes for this polygon
ChangeNodes(): NCollection_Array1_gp_Pnt;

// Returns the table of the parameters associated with each node in this polygon
HasParameters(): boolean;

// Returns true if parameters are associated with the nodes in this polygon
Parameters(): NCollection_Array1_double;

// Returns the table of the parameters associated with each node in this polygon
ChangeParameters(): NCollection_Array1_double;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
