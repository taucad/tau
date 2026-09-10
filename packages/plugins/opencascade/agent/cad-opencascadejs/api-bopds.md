# libcascade — BOPDS

17 top-level symbols. Signatures are verbatim typescript.

// The class {@link BOPDS_CommonBlock`BOPDS_CommonBlock`} is to store the information about pave blocks that have geometrical coincidence (in terms of a tolerance) with
BOPDS_CommonBlock: declare class BOPDS_CommonBlock extends Standard_Transient

constructor

// Modifier Adds the pave block <aPB> to the list of pave blocks of the common block
AddPaveBlock(aPB: BOPDS_PaveBlock): void;

// Modifier Sets the list of pave blocks for the common block
SetPaveBlocks(aLPB: NCollection_List_handle_BOPDS_PaveBlock): void;

// Modifier Adds the index of the face <aF> to the list of indices of faces of the common block
AddFace(aF: number): void;

// Modifier Sets the list of indices of faces <aLF> of the common block
SetFaces(aLF: NCollection_List_int): void;

// Modifier Appends the list of indices of faces <aLF> to the list of indices of faces of the common block (the input list is emptied)
AppendFaces(aLF: NCollection_List_int): void;
// aLF: Mutated in place

// Selector Returns the list of pave blocks of the common block
PaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

// Selector Returns the list of indices of faces of the common block
Faces(): NCollection_List_int;

// Selector Returns the first pave block of the common block
PaveBlock1(): BOPDS_PaveBlock;

// Selector Returns the pave block that belongs to the edge with index <theIx>
PaveBlockOnEdge(theIndex: number): BOPDS_PaveBlock;

// Query Returns true if the common block contains a pave block that belongs to the face with index <theIx>
IsPaveBlockOnFace(theIndex: number): boolean;

// Query Returns true if the common block contains a pave block that belongs to the edge with index <theIx>
IsPaveBlockOnEdge(theIndex: number): boolean;

// Query Returns true if the common block contains a pave block that is equal to <thePB> Query Returns true if the common block contains the face with index equal to <theF>
Contains(thePB: BOPDS_PaveBlock): boolean;
Contains(theF: number): boolean;
Contains(thePB: BOPDS_PaveBlock): boolean;
Contains(theF: number): boolean;

// Modifier Assign the index <theEdge> as the edge index to all pave blocks of the common block
SetEdge(theEdge: number): void;

// Selector Returns the index of the edge of all pave blocks of the common block
Edge(): number;

Dump(): void;

// Moves the pave blocks in the list to make the given pave block to be the first
SetRealPaveBlock(thePB: BOPDS_PaveBlock): void;

// Sets the tolerance for the common block
SetTolerance(theTol: number): void;

// Return the tolerance of common block
Tolerance(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores information about two pave blocks and satellite data
BOPDS_CoupleOfPaveBlocks: declare class BOPDS_CoupleOfPaveBlocks

constructor

// Sets the index
SetIndex(theIndex: number): void;
// theIndex: the index

// Returns the index
Index(): number;

// Sets the index of an interference
SetIndexInterf(theIndex: number): void;
// theIndex: index of an interference

// Returns the index of an interference
IndexInterf(): number;

// Sets both pave blocks
SetPaveBlocks(thePB1: BOPDS_PaveBlock, thePB2: BOPDS_PaveBlock): void;
// thePB1: first pave block
// thePB2: second pave block

// DEPRECATED
PaveBlocks(): { thePB1: BOPDS_PaveBlock; thePB2: BOPDS_PaveBlock; [Symbol.dispose](): void };

// Sets the first pave block
SetPaveBlock1(thePB: BOPDS_PaveBlock): void;
// thePB: the first pave block

// Returns the first pave block
PaveBlock1(): BOPDS_PaveBlock;

// Sets the second pave block
SetPaveBlock2(thePB: BOPDS_PaveBlock): void;
// thePB: the second pave block

// Returns the second pave block
PaveBlock2(): BOPDS_PaveBlock;

// Sets the tolerance associated with this couple
SetTolerance(theTol: number): void;
// theTol: the tolerance value

// Returns the tolerance associated with this couple
Tolerance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_Curve`BOPDS_Curve`} is to store the information about intersection curve
BOPDS_Curve: declare class BOPDS_Curve

constructor

// Modifier Sets the curve <theC>
SetCurve(theC: IntTools_Curve): void;

// Selector Returns the curve
Curve(): IntTools_Curve;

// Modifier Sets the bounding box <theBox> of the curve
SetBox(theBox: Bnd_Box): void;

// Selector Returns the bounding box of the curve
Box(): Bnd_Box;

// Selector/Modifier Returns the bounding box of the curve
ChangeBox(): Bnd_Box;

SetPaveBlocks(theLPB: NCollection_List_handle_BOPDS_PaveBlock): void;

// Selector Returns the list of pave blocks of the curve
PaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

// Selector/Modifier Returns the list of pave blocks of the curve
ChangePaveBlocks(): NCollection_List_handle_BOPDS_PaveBlock;

// Creates initial pave block of the curve
InitPaveBlock1(): void;

// Selector/Modifier Returns initial pave block of the curve
ChangePaveBlock1(): BOPDS_PaveBlock;

// Selector Returns list of indices of technologic vertices of the curve
TechnoVertices(): NCollection_List_int;

// Selector/Modifier Returns list of indices of technologic vertices of the curve
ChangeTechnoVertices(): NCollection_List_int;

// Query Returns true if at least one pave block of the curve has edge
HasEdge(): boolean;

// Sets the tolerance for the curve
SetTolerance(theTol: number): void;

// Returns the tolerance of the curve
Tolerance(): number;

// Returns the tangential tolerance of the curve
TangentialTolerance(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_DS`BOPDS_DS`} provides the control of data structure for the algorithms in the Boolean Component such as General Fuse, Boolean operations, Section, Maker Volume, Splitter and Cells Builder
BOPDS_DS: declare class BOPDS_DS

constructor

// Clears the contents
Clear(): void;

// Selector
Allocator(): NCollection_BaseAllocator;

// Modifier Sets the arguments [theLS] of an operation
SetArguments(theLS: NCollection_List_TopoDS_Shape): void;

// Selector Returns the arguments of an operation
Arguments(): NCollection_List_TopoDS_Shape;

// Initializes the data structure for the arguments
Init(theFuzz?: number): void;

// Selector Returns the total number of shapes stored
NbShapes(): number;

// Selector Returns the total number of source shapes stored
NbSourceShapes(): number;

// Selector Returns the number of index ranges
NbRanges(): number;

// Selector Returns the index range "i"
Range(theIndex: number): BOPDS_IndexRange;

// Selector Returns the rank of the shape of index "i"
Rank(theIndex: number): number;

// Returns true if the shape of index "i" is not the source shape/sub-shape
IsNewShape(theIndex: number): boolean;

// Modifier Appends the information about the shape [theSI] to the data structure Returns the index of theSI in the data structure
Append(theSI: BOPDS_ShapeInfo): number;
Append(theS: TopoDS_Shape): number;
Append(theSI: BOPDS_ShapeInfo): number;
Append(theS: TopoDS_Shape): number;

// Selector Returns the information about the shape with index theIndex
ShapeInfo(theIndex: number): BOPDS_ShapeInfo;

// Selector/Modifier Returns the information about the shape with index theIndex
ChangeShapeInfo(theIndex: number): BOPDS_ShapeInfo;

// Selector Returns the shape with index theIndex
Shape(theIndex: number): TopoDS_Shape;

// Selector Returns the index of the shape theS
Index(theS: TopoDS_Shape): number;

// Selector Returns the information about pave blocks on source edges
PaveBlocksPool(): NCollection_DynamicArray_NCollection_List_handle_BOPDS_PaveBlock;

// Selector/Modifier Returns the information about pave blocks on source edges
ChangePaveBlocksPool(): NCollection_DynamicArray_NCollection_List_handle_BOPDS_PaveBlock;

// Query Returns true if the shape with index theIndex has the information about pave blocks
HasPaveBlocks(theIndex: number): boolean;

// Selector Returns the pave blocks for the shape with index theIndex
PaveBlocks(theIndex: number): NCollection_List_handle_BOPDS_PaveBlock;

// Selector/Modifier Returns the pave blocks for the shape with index theIndex
ChangePaveBlocks(theIndex: number): NCollection_List_handle_BOPDS_PaveBlock;

// Update the pave blocks for the all shapes in data structure
UpdatePaveBlocks(): void;

// Update the pave block thePB
UpdatePaveBlock(thePB: BOPDS_PaveBlock): void;

// Update the common block theCB
UpdateCommonBlock(theCB: BOPDS_CommonBlock, theFuzz: number): void;

// Query Returns true if the pave block is common block
IsCommonBlock(thePB: BOPDS_PaveBlock): boolean;

// Selector Returns the common block
CommonBlock(thePB: BOPDS_PaveBlock): BOPDS_CommonBlock;

// Modifier Sets the common block <theCB>
SetCommonBlock(thePB: BOPDS_PaveBlock, theCB: BOPDS_CommonBlock): void;

// Selector Returns the real first pave block
RealPaveBlock(thePB: BOPDS_PaveBlock): BOPDS_PaveBlock;

// Query Returns true if common block contains more then one pave block
IsCommonBlockOnEdge(thePB: BOPDS_PaveBlock): boolean;

// Selector Returns the information about state of faces
FaceInfoPool(): NCollection_DynamicArray_BOPDS_FaceInfo;

// Query Returns true if the shape with index theIndex has the information about state of face
HasFaceInfo(theIndex: number): boolean;

// Selector Returns the state of face with index theIndex
FaceInfo(theIndex: number): BOPDS_FaceInfo;

// Selector/Modifier Returns the state of face with index theIndex
ChangeFaceInfo(theIndex: number): BOPDS_FaceInfo;

// Update the state In of face with index theIndex
UpdateFaceInfoIn(theIndex: number): void;
UpdateFaceInfoIn(theFaces: NCollection_Map_int): void;
UpdateFaceInfoIn(theIndex: number): void;
UpdateFaceInfoIn(theFaces: NCollection_Map_int): void;

// Update the state On of face with index theIndex
UpdateFaceInfoOn(theIndex: number): void;
UpdateFaceInfoOn(theFaces: NCollection_Map_int): void;
UpdateFaceInfoOn(theIndex: number): void;
UpdateFaceInfoOn(theFaces: NCollection_Map_int): void;

// Selector Returns the state On [theMPB,theMVP] of face with index theIndex
FaceInfoOn(theIndex: number, theMPB: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theMVP: NCollection_Map_int): void;
// theMPB: Mutated in place
// theMVP: Mutated in place

// Selector Returns the state In [theMPB,theMVP] of face with index theIndex
FaceInfoIn(theIndex: number, theMPB: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theMVP: NCollection_Map_int): void;
// theMPB: Mutated in place
// theMVP: Mutated in place

// Selector Returns the indices of alone vertices for the face with index `theFaceIndex`
AloneVertices(theFaceIndex: number, theVertexList: NCollection_List_int): void;
// theVertexList: Mutated in place

// Refine the state On for the all faces having state information
RefineFaceInfoOn(): void;

// Removes any pave block from list of having IN state if it has also the state ON
RefineFaceInfoIn(): void;

// Returns information about ON/IN sub-shapes of the given faces
SubShapesOnIn(theFaceIndex1: number, theFaceIndex2: number, theMVOnIn: NCollection_Map_int, theMVCommon: NCollection_Map_int, thePBOnIn: NCollection_IndexedMap_handle_BOPDS_PaveBlock, theCommonPaveBlocks: NCollection_Map_handle_BOPDS_PaveBlock): void;
// theFaceIndex1: the index of the first face
// theFaceIndex2: the index of the second face
// theMVOnIn: the indices of ON/IN vertices from both faces Mutated in place
// theMVCommon: the indices of common vertices for both faces Mutated in place
// thePBOnIn: all On/In pave blocks from both faces Mutated in place
// theCommonPaveBlocks: the common pave blocks (that are shared by both faces)

// Returns the indices of edges that are shared for the faces with indices `theFaceIndex1` and `theFaceIndex2`
SharedEdges(theFaceIndex1: number, theFaceIndex2: number, theEdgeList: NCollection_List_int, theAllocator: NCollection_BaseAllocator): void;
// theEdgeList: Mutated in place

// Selector Returns the collection same domain shapes
ShapesSD(): NCollection_DataMap_int_int;

// Modifier Adds the information about same domain shapes with indices theIndex, theIndexSD
AddShapeSD(theIndex: number, theIndexSD: number): void;

// Query Returns true if the shape with index theIndex has the same domain shape
HasShapeSD(theIndex: number, theIndexSD?: number): { returnValue: boolean; theIndexSD: number };

// Returns the index of same domain shape for the shape with index `theIndex`
GetSameDomainIndex(theIndex: number): number;

// Selector/Modifier Returns the collection of interferences Vertex/Vertex
InterfVV(): NCollection_DynamicArray_BOPDS_InterfVV;

// Selector/Modifier Returns the collection of interferences Vertex/Edge
InterfVE(): NCollection_DynamicArray_BOPDS_InterfVE;

// Selector/Modifier Returns the collection of interferences Vertex/Face
InterfVF(): NCollection_DynamicArray_BOPDS_InterfVF;

// Selector/Modifier Returns the collection of interferences Edge/Edge
InterfEE(): NCollection_DynamicArray_BOPDS_InterfEE;

// Selector/Modifier Returns the collection of interferences Edge/Face
InterfEF(): NCollection_DynamicArray_BOPDS_InterfEF;

// Selector/Modifier Returns the collection of interferences Face/Face
InterfFF(): NCollection_DynamicArray_BOPDS_InterfFF;

// Selector/Modifier Returns the collection of interferences Vertex/Solid
InterfVZ(): NCollection_DynamicArray_BOPDS_InterfVZ;

// Selector/Modifier Returns the collection of interferences Edge/Solid
InterfEZ(): NCollection_DynamicArray_BOPDS_InterfEZ;

// Selector/Modifier Returns the collection of interferences Face/Solid
InterfFZ(): NCollection_DynamicArray_BOPDS_InterfFZ;

// Selector/Modifier Returns the collection of interferences Solid/Solid
InterfZZ(): NCollection_DynamicArray_BOPDS_InterfZZ;

// Returns the number of types of the interferences
static NbInterfTypes(): number;

// Modifier Adds the information about an interference between shapes with indices theI1, theI2 to the summary table of interferences
AddInterf(theI1: number, theI2: number): boolean;

// Query Returns true if the shape with index theI is interferred
HasInterf(theI: number): boolean;
HasInterf(theI1: number, theI2: number): boolean;
HasInterf(theI: number): boolean;
HasInterf(theI1: number, theI2: number): boolean;

// Query Returns true if the shape with index theIndex1 is interfered with any sub-shape of the shape with index theIndex2 (theAnyInterference=true) all sub-shapes of the shape with index theIndex2 (theAnyInterference=false)
HasInterfShapeSubShapes(theIndex1: number, theIndex2: number, theAnyInterference?: boolean): boolean;

// Query Returns true if the shapes with indices theIndex1, theIndex2 have interferred sub-shapes
HasInterfSubShapes(theIndex1: number, theIndex2: number): boolean;

// Selector Returns the table of interferences
Interferences(): NCollection_Map_BOPDS_Pair;

Dump(): void;

// Returns true if the shape with index `theCandidate` is a sub-shape of the shape with index `theParent`
IsSubShape(theCandidate: number, theParent: number): boolean;

// Fills theLP with sorted paves of the shape with index theIndex
Paves(theIndex: number, theLP: NCollection_List_BOPDS_Pave): void;
// theLP: Mutated in place

// Update the pave blocks for all shapes in data structure
UpdatePaveBlocksWithSDVertices(): void;

// Update the pave block for all shapes in data structure
UpdatePaveBlockWithSDVertices(thePB: BOPDS_PaveBlock): void;

// Update the pave block of the common block for all shapes in data structure
UpdateCommonBlockWithSDVertices(theCB: BOPDS_CommonBlock): void;

InitPaveBlocksForVertex(theNV: number): void;

// Clears information about PaveBlocks for the untouched edges
ReleasePaveBlocks(): void;

// Checks if the existing shrunk data of the pave block is still valid
IsValidShrunkData(thePB: BOPDS_PaveBlock): boolean;

// Computes bounding box <theBox> for the solid with DS-index <theIndex>
BuildBndBoxSolid(theIndex: number, theBox: Bnd_Box, theCheckInverted: boolean): void;
// theBox: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_FaceInfo`BOPDS_FaceInfo`} is to store handy information about state of face
BOPDS_FaceInfo: declare class BOPDS_FaceInfo

constructor

// Clears the contents
Clear(): void;

// Modifier Sets the index of the face <theI>
SetIndex(theI: number): void;

// Selector Returns the index of the face
Index(): number;

// Selector Returns the pave blocks of the face that have state In
PaveBlocksIn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

// Selector/Modifier Returns the pave blocks of the face that have state In
ChangePaveBlocksIn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

// Selector Returns the list of indices for vertices of the face that have state In
VerticesIn(): NCollection_Map_int;

// Selector/Modifier Returns the list of indices for vertices of the face that have state In
ChangeVerticesIn(): NCollection_Map_int;

// Selector Returns the pave blocks of the face that have state On
PaveBlocksOn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

// Selector/Modifier Returns the pave blocks of the face that have state On
ChangePaveBlocksOn(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

// Selector Returns the list of indices for vertices of the face that have state On
VerticesOn(): NCollection_Map_int;

// Selector/Modifier Returns the list of indices for vertices of the face that have state On
ChangeVerticesOn(): NCollection_Map_int;

// Selector Returns the pave blocks of the face that are pave blocks of section edges
PaveBlocksSc(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

ChangePaveBlocksSc(): NCollection_IndexedMap_handle_BOPDS_PaveBlock;

// Selector Returns the list of indices for section vertices of the face
VerticesSc(): NCollection_Map_int;

// Selector/Modifier Returns the list of indices for section vertices of the face
ChangeVerticesSc(): NCollection_Map_int;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_IndexRange`BOPDS_IndexRange`} is to store the information about range of two indices
BOPDS_IndexRange: declare class BOPDS_IndexRange

constructor

// Modifier Sets the first index <theI1> of the range
SetFirst(theI1: number): void;

// Modifier Sets the second index <theI2> of the range
SetLast(theI2: number): void;

// Selector Returns the first index of the range
First(): number;

// Selector Returns the second index of the range
Last(): number;

// Modifier Sets the first index of the range <theI1> Sets the second index of the range <theI2>
SetIndices(theI1: number, theI2: number): void;

// Selector Returns the first index of the range <theI1> Returns the second index of the range <theI2>
Indices(theI1?: number, theI2?: number): { theI1: number; theI2: number };

// Query Returns true if the range contains <theIndex>
Contains(theIndex: number): boolean;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_Interf`BOPDS_Interf`} stores the information about the interference between two shapes
BOPDS_Interf: declare class BOPDS_Interf

// Sets the indices of interferred shapes
SetIndices(theIndex1: number, theIndex2: number): void;
// theIndex1: index of the first shape
// theIndex2: index of the second shape

// Returns the indices of interferred shapes
Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };
// theIndex1: index of the first shape
// theIndex2: index of the second shape

// Sets the index of the first interferred shape
SetIndex1(theIndex: number): void;
// theIndex: index of the first shape

// Sets the index of the second interferred shape
SetIndex2(theIndex: number): void;
// theIndex: index of the second shape

// Returns the index of the first interferred shape
Index1(): number;

// Returns the index of the second interferred shape
Index2(): number;

// Returns the index of that are opposite to the given index
OppositeIndex(theI: number): number;
// theI: the index

// Returns true if the interference contains given index
Contains(theIndex: number): boolean;
// theIndex: the index

// Sets the index of new shape
SetIndexNew(theIndex: number): void;
// theIndex: the index

// Returns the index of new shape
IndexNew(): number;

// Returns true if the interference has index of new shape that is equal to the given index Returns true if the interference has index of new shape the index
HasIndexNew(theIndex?: number): { returnValue: boolean; theIndex: number };
HasIndexNew(): boolean;
HasIndexNew(theIndex?: number): { returnValue: boolean; theIndex: number };
HasIndexNew(): boolean;
// theIndex: the index

// Returns the index of new shape
GetIndexNew(): number | null | undefined;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfEE`BOPDS_InterfEE`} stores the information about the interference of the type edge/edge
BOPDS_InterfEE: declare class BOPDS_InterfEE extends BOPDS_Interf

constructor

// Modifier Sets the info of common part
SetCommonPart(theCP: IntTools_CommonPrt): void;
// theCP: common part

// Selector Returns the info of common part
CommonPart(): IntTools_CommonPrt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfEF`BOPDS_InterfEF`} stores the information about the interference of the type edge/face.The class {@link BOPDS_InterfFF`BOPDS_InterfFF`} stores the information about the interference of the type face/face
BOPDS_InterfEF: declare class BOPDS_InterfEF extends BOPDS_Interf

constructor

// Modifier Sets the info of common part
SetCommonPart(theCP: IntTools_CommonPrt): void;
// theCP: common part

// Selector Returns the info of common part
CommonPart(): IntTools_CommonPrt;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfEZ`BOPDS_InterfEZ`} stores the information about the interference of the type edge/solid
BOPDS_InterfEZ: declare class BOPDS_InterfEZ extends BOPDS_Interf

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPDS_InterfFF: declare class BOPDS_InterfFF extends BOPDS_Interf

constructor

// Initializer
Init(theNbCurves: number, theNbPoints: number): void;
// theNbCurves: number of intersection curves
// theNbPoints: number of intersection points

// Modifier Sets the flag of whether the faces are tangent
SetTangentFaces(theFlag: boolean): void;
// theFlag: the flag

// Selector Returns the flag whether the faces are tangent
TangentFaces(): boolean;

// Selector Returns the intersection curves
Curves(): NCollection_DynamicArray_BOPDS_Curve;

// Selector/Modifier Returns the intersection curves
ChangeCurves(): NCollection_DynamicArray_BOPDS_Curve;

// Selector Returns the intersection points
Points(): NCollection_DynamicArray_BOPDS_Point;

// Selector/Modifier Returns the intersection points
ChangePoints(): NCollection_DynamicArray_BOPDS_Point;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfFZ`BOPDS_InterfFZ`} stores the information about the interference of the type face/solid
BOPDS_InterfFZ: declare class BOPDS_InterfFZ extends BOPDS_Interf

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfVE`BOPDS_InterfVE`} stores the information about the interference of the type vertex/edge
BOPDS_InterfVE: declare class BOPDS_InterfVE extends BOPDS_Interf

constructor

// Modifier Sets the value of parameter of the point of the vertex on the curve of the edge
SetParameter(theT: number): void;
// theT: value of parameter

// Selector Returrns the value of parameter of the point of the vertex on the curve of the edge
Parameter(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfVF`BOPDS_InterfVF`} stores the information about the interference of the type vertex/face
BOPDS_InterfVF: declare class BOPDS_InterfVF extends BOPDS_Interf

constructor

// Modifier Sets the value of parameters of the point of the vertex on the surface of of the face
SetUV(theU: number, theV: number): void;
// theU: value of U parameter
// theV: value of U parameter

// Selector Returns the value of parameters of the point of the vertex on the surface of of the face
UV(theU?: number, theV?: number): { theU: number; theV: number };
// theU: value of U parameter
// theV: value of U parameter

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfVV`BOPDS_InterfVV`} stores the information about the interference of the type vertex/vertex
BOPDS_InterfVV: declare class BOPDS_InterfVV extends BOPDS_Interf

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfVZ`BOPDS_InterfVZ`} stores the information about the interference of the type vertex/solid
BOPDS_InterfVZ: declare class BOPDS_InterfVZ extends BOPDS_Interf

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_InterfZZ`BOPDS_InterfZZ`} stores the information about the interference of the type solid/solid
BOPDS_InterfZZ: declare class BOPDS_InterfZZ extends BOPDS_Interf

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
