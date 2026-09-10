# libcascade — BOPDS (2)

21 top-level symbols. Signatures are verbatim typescript.

// The class is to provide the pair of indices of interfering shapes
BOPDS_Pair: declare class BOPDS_Pair

constructor

// Sets the indices
SetIndices(theIndex1: number, theIndex2: number): void;

// Gets the indices
Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

// Returns true if the Pair is equal to <the theOther>
IsEqual(theOther: BOPDS_Pair): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_Pave`BOPDS_Pave`} is to store information about vertex on an edge
BOPDS_Pave: declare class BOPDS_Pave

constructor

// Modifier Sets the index of vertex <theIndex>
SetIndex(theIndex: number): void;

// Selector Returns the index of vertex
Index(): number;

// Modifier Sets the parameter of vertex <theParameter>
SetParameter(theParameter: number): void;

// Selector Returns the parameter of vertex
Parameter(): number;

// Selector Returns the index of vertex <theIndex> Returns the parameter of vertex <theParameter>
Contents(theIndex?: number, theParameter?: number): { theIndex: number; theParameter: number };

// Query Returns true if the parameter of this is less than the parameter of <theOther>
IsLess(theOther: BOPDS_Pave): boolean;

// Query Returns true if the parameter of this is equal to the parameter of <theOther>
IsEqual(theOther: BOPDS_Pave): boolean;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_PaveBlock`BOPDS_PaveBlock`} is to store the information about pave block on an edge
BOPDS_PaveBlock: declare class BOPDS_PaveBlock extends Standard_Transient

constructor

// Modifier Sets the first pave <thePave>
SetPave1(thePave: BOPDS_Pave): void;

// Selector Returns the first pave
Pave1(): BOPDS_Pave;

// Modifier Sets the second pave <thePave>
SetPave2(thePave: BOPDS_Pave): void;

// Selector Returns the second pave
Pave2(): BOPDS_Pave;

// Modifier Sets the index of edge of pave block <theEdge>
SetEdge(theEdge: number): void;

// Selector Returns the index of edge of pave block
Edge(): number;

// Query Returns true if the pave block has edge
HasEdge(): boolean;
HasEdge(theEdge?: number): { returnValue: boolean; theEdge: number };
HasEdge(): boolean;
HasEdge(theEdge?: number): { returnValue: boolean; theEdge: number };

// Modifier Sets the index of original edge of the pave block <theEdge>
SetOriginalEdge(theEdge: number): void;

// Selector Returns the index of original edge of pave block
OriginalEdge(): number;

// Query Returns true if the edge is equal to the original edge of the pave block
IsSplitEdge(): boolean;

// Selector Returns the parametric range <theT1,theT2> of the pave block
Range(theT1?: number, theT2?: number): { theT1: number; theT2: number };

// Query Returns true if the pave block has pave indices that equal to the pave indices of the pave block <theOther>
HasSameBounds(theOther: BOPDS_PaveBlock): boolean;

// Selector Returns the pave indices <theIndex1,theIndex2> of the pave block
Indices(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

// Query Returns true if the pave block contains extra paves
IsToUpdate(): boolean;

// Modifier Appends extra paves <thePave>
AppendExtPave(thePave: BOPDS_Pave): void;

// Modifier Appends extra pave <thePave>
AppendExtPave1(thePave: BOPDS_Pave): void;

// Modifier Removes a pave with the given vertex number from extra paves
RemoveExtPave(theVertNum: number): void;

// Selector Returns the extra paves
ExtPaves(): NCollection_List_BOPDS_Pave;

// Selector / Modifier Returns the extra paves
ChangeExtPaves(): NCollection_List_BOPDS_Pave;

// Modifier Updates the pave block
Update(theLPB: NCollection_List_handle_BOPDS_PaveBlock, theFlag: boolean): void;
// theLPB: Mutated in place

// Query Returns true if the extra paves contain the pave with given value of the parameter <thePrm> <theTol> - the value of the tolerance to compare <theInd> - index of the found pave
ContainsParameter(thePrm: number, theTol: number, theInd?: number): { returnValue: boolean; theInd: number };

// Modifier Sets the shrunk data for the pave block <theTS1>, <theTS2> - shrunk range <theBox> - the bounding box <theIsSplittable> - defines whether the edge can be split
SetShrunkData(theTS1: number, theTS2: number, theBox: Bnd_Box, theIsSplittable: boolean): void;

// Selector Returns the shrunk data for the pave block <theTS1>, <theTS2> - shrunk range <theBox> - the bounding box <theIsSplittable> - defines whether the edge can be split
ShrunkData(theTS1: number, theTS2: number, theBox: Bnd_Box, theIsSplittable?: boolean): { theTS1: number; theTS2: number; theIsSplittable: boolean };
// theBox: Mutated in place

// Query Returns true if the pave block contains the shrunk data
HasShrunkData(): boolean;

Dump(): void;

// Query Returns FALSE if the pave block has a too short shrunk range and cannot be split, otherwise returns TRUE
IsSplittable(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_Point`BOPDS_Point`} is to store the information about intersection point
BOPDS_Point: declare class BOPDS_Point

constructor

// Modifier Sets 3D point <thePnt>
SetPnt(thePnt: gp_Pnt): void;

// Selector Returns 3D point
Pnt(): gp_Pnt;

// Modifier Sets 2D point on the first face <thePnt>
SetPnt2D1(thePnt: gp_Pnt2d): void;

// Selector Returns 2D point on the first face <thePnt>
Pnt2D1(): gp_Pnt2d;

// Modifier Sets 2D point on the second face <thePnt>
SetPnt2D2(thePnt: gp_Pnt2d): void;

// Selector Returns 2D point on the second face <thePnt>
Pnt2D2(): gp_Pnt2d;

// Modifier Sets the index of the vertex <theIndex>
SetIndex(theIndex: number): void;

// Selector Returns index of the vertex
Index(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_ShapeInfo`BOPDS_ShapeInfo`} is to store handy information about shape
BOPDS_ShapeInfo: declare class BOPDS_ShapeInfo

constructor

// Modifier Sets the shape <theS>
SetShape(theS: TopoDS_Shape): void;

// Selector Returns the shape
Shape(): TopoDS_Shape;

// Modifier Sets the type of shape theType
SetShapeType(theType: TopAbs_ShapeEnum): void;

// Selector Returns the type of shape
ShapeType(): TopAbs_ShapeEnum;

// Modifier Sets the boundung box of the shape theBox
SetBox(theBox: Bnd_Box): void;

// Selector Returns the boundung box of the shape
Box(): Bnd_Box;

// Selector/Modifier Returns the boundung box of the shape
ChangeBox(): Bnd_Box;

// Selector Returns the list of indices of sub-shapes
SubShapes(): NCollection_List_int;

// Selector/ Modifier Returns the list of indices of sub-shapes
ChangeSubShapes(): NCollection_List_int;

// Query Returns true if the shape has sub-shape with index theI
HasSubShape(theI: number): boolean;

HasReference(): boolean;

// Modifier Sets the index of a reference information
SetReference(theI: number): void;

// Selector Returns the index of a reference information
Reference(): number;

// Query Returns true if the shape has boundary representation
HasBRep(): boolean;

// Returns true if the shape can be participant of an interference
IsInterfering(): boolean;

// Query Returns true if there is flag
HasFlag(): boolean;
HasFlag(theFlag?: number): { returnValue: boolean; theFlag: number };
HasFlag(): boolean;
HasFlag(theFlag?: number): { returnValue: boolean; theFlag: number };

// Modifier Sets the flag
SetFlag(theI: number): void;

// Returns the flag
Flag(): number;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_SubIterator`BOPDS_SubIterator`} is used to compute intersections between bounding boxes of two sub-sets of BRep sub-shapes of arguments of an operation (see the class {@link BOPDS_DS`BOPDS_DS`})
BOPDS_SubIterator: declare class BOPDS_SubIterator

constructor

// Sets the data structure <pDS> to process
SetDS(pDS: BOPDS_DS): void;

// Returns the data structure
DS(): BOPDS_DS;

// Sets the first set of indices <theLI> to process
SetSubSet1(theLI: NCollection_List_int): void;

// Returns the first set of indices to process
SubSet1(): NCollection_List_int;

// Sets the second set of indices <theLI> to process
SetSubSet2(theLI: NCollection_List_int): void;

// Returns the second set of indices to process
SubSet2(): NCollection_List_int;

// Initializes the iterator
Initialize(): void;

// Returns true if there are more pairs of intersected shapes
More(): boolean;

// Moves iterations ahead
Next(): void;

// Returns indices (DS) of intersected shapes theIndex1 - the index of the first shape theIndex2 - the index of the second shape
Value(theIndex1?: number, theIndex2?: number): { theIndex1: number; theIndex2: number };

// Perform the intersection algorithm and prepare the results to be used
Prepare(): void;

// Returns the number of interfering pairs
ExpectedLength(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class {@link BOPDS_Tools`BOPDS_Tools`} contains a set auxiliary static functions of the package BOPDS
BOPDS_Tools: declare class BOPDS_Tools

constructor

// Converts the conmbination of two types of shape <theT1>,<theT2> to the one integer value, that is returned
static TypeToInteger(theT1: TopAbs_ShapeEnum, theT2: TopAbs_ShapeEnum): number;
static TypeToInteger(theT: TopAbs_ShapeEnum): number;
static TypeToInteger(theT1: TopAbs_ShapeEnum, theT2: TopAbs_ShapeEnum): number;
static TypeToInteger(theT: TopAbs_ShapeEnum): number;

// Returns true if the type <theT> correspond to a shape having boundary representation
static HasBRep(theT: TopAbs_ShapeEnum): boolean;

// Returns true if the type <theT> can be participant of an interference
static IsInterfering(theT: TopAbs_ShapeEnum): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BOPDS_ListOfPave: NCollection_List_BOPDS_Pave

BOPDS_VectorOfCurve: NCollection_DynamicArray_BOPDS_Curve

BOPDS_VectorOfFaceInfo: NCollection_DynamicArray_BOPDS_FaceInfo

BOPDS_VectorOfInterfEE: NCollection_DynamicArray_BOPDS_InterfEE

BOPDS_VectorOfInterfEF: NCollection_DynamicArray_BOPDS_InterfEF

BOPDS_VectorOfInterfEZ: NCollection_DynamicArray_BOPDS_InterfEZ

BOPDS_VectorOfInterfFF: NCollection_DynamicArray_BOPDS_InterfFF

BOPDS_VectorOfInterfFZ: NCollection_DynamicArray_BOPDS_InterfFZ

BOPDS_VectorOfInterfVE: NCollection_DynamicArray_BOPDS_InterfVE

BOPDS_VectorOfInterfVF: NCollection_DynamicArray_BOPDS_InterfVF

BOPDS_VectorOfInterfVV: NCollection_DynamicArray_BOPDS_InterfVV

BOPDS_VectorOfInterfVZ: NCollection_DynamicArray_BOPDS_InterfVZ

BOPDS_VectorOfInterfZZ: NCollection_DynamicArray_BOPDS_InterfZZ

BOPDS_VectorOfPoint: NCollection_DynamicArray_BOPDS_Point
