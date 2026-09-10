# libcascade — BRepOffset

13 top-level symbols. Signatures are verbatim typescript.

// Analyses the shape to find the parts of edges connecting the convex, concave or tangent faces
BRepOffset_Analyse: declare class BRepOffset_Analyse

constructor

Perform(theS: TopoDS_Shape, theAngle: number, theRange?: Message_ProgressRange): void;

IsDone(): boolean;

Type(theE: TopoDS_Edge): NCollection_List_BRepOffset_Interval;

Edges(theV: TopoDS_Vertex, theType: ChFiDS_TypeOfConcavity, theL: NCollection_List_TopoDS_Shape): void;
Edges(theF: TopoDS_Face, theType: ChFiDS_TypeOfConcavity, theL: NCollection_List_TopoDS_Shape): void;
Edges(theV: TopoDS_Vertex, theType: ChFiDS_TypeOfConcavity, theL: NCollection_List_TopoDS_Shape): void;
Edges(theF: TopoDS_Face, theType: ChFiDS_TypeOfConcavity, theL: NCollection_List_TopoDS_Shape): void;

TangentEdges(theEdge: TopoDS_Edge, theVertex: TopoDS_Vertex, theEdges: NCollection_List_TopoDS_Shape): void;

HasAncestor(theS: TopoDS_Shape): boolean;

Ancestors(theS: TopoDS_Shape): NCollection_List_TopoDS_Shape;

Explode(theL: NCollection_List_TopoDS_Shape, theType: ChFiDS_TypeOfConcavity): void;
Explode(theL: NCollection_List_TopoDS_Shape, theType1: ChFiDS_TypeOfConcavity, theType2: ChFiDS_TypeOfConcavity): void;
Explode(theL: NCollection_List_TopoDS_Shape, theType: ChFiDS_TypeOfConcavity): void;
Explode(theL: NCollection_List_TopoDS_Shape, theType1: ChFiDS_TypeOfConcavity, theType2: ChFiDS_TypeOfConcavity): void;

AddFaces(theFace: TopoDS_Face, theCo: TopoDS_Compound, theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theType: ChFiDS_TypeOfConcavity): void;
AddFaces(theFace: TopoDS_Face, theCo: TopoDS_Compound, theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theType1: ChFiDS_TypeOfConcavity, theType2: ChFiDS_TypeOfConcavity): void;
AddFaces(theFace: TopoDS_Face, theCo: TopoDS_Compound, theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theType: ChFiDS_TypeOfConcavity): void;
AddFaces(theFace: TopoDS_Face, theCo: TopoDS_Compound, theMap: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, theType1: ChFiDS_TypeOfConcavity, theType2: ChFiDS_TypeOfConcavity): void;

SetOffsetValue(theOffset: number): void;

SetFaceOffsetMap(theMap: NCollection_DataMap_TopoDS_Shape_double_TopTools_ShapeMapHasher): void;

NewFaces(): NCollection_List_TopoDS_Shape;

Generated(theS: TopoDS_Shape): TopoDS_Shape;

HasGenerated(theS: TopoDS_Shape): boolean;

EdgeReplacement(theFace: TopoDS_Face, theEdge: TopoDS_Edge): TopoDS_Edge;

Descendants(theS: TopoDS_Shape, theUpdate?: boolean): NCollection_List_TopoDS_Shape;

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepOffset_Error: typeof BRepOffset_Error[keyof typeof BRepOffset_Error]

// Computes the intersections between edges on a face stores result is SD as AsDes from `BRepOffset`
BRepOffset_Inter2d: declare class BRepOffset_Inter2d

constructor

// Computes the intersections between the edges stored is AsDes as descendants of <F>
static Compute(AsDes: BRepAlgo_AsDes, F: TopoDS_Face, NewEdges: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, Tol: number, theEdgeIntEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): void;
// theDMVV: Mutated in place

// Computes the intersection between the offset edges of the <FI>
static ConnexIntByInt(FI: TopoDS_Face, OFI: BRepOffset_Offset, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theAsDes: BRepAlgo_AsDes, AsDes2d: BRepAlgo_AsDes, Offset: number, Tol: number, Analyse: BRepOffset_Analyse, FacesWithVerts: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theImageVV: BRepAlgo_Image, theEdgeIntEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): boolean;
// OFI: Mutated in place
// MES: Mutated in place
// FacesWithVerts: Mutated in place
// theImageVV: Mutated in place
// theEdgeIntEdges: Mutated in place
// theDMVV: Mutated in place

// Computes the intersection between the offset edges generated from vertices and stored into AsDes as descendants of the <FI>
static ConnexIntByIntInVert(FI: TopoDS_Face, OFI: BRepOffset_Offset, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, AsDes: BRepAlgo_AsDes, AsDes2d: BRepAlgo_AsDes, Tol: number, Analyse: BRepOffset_Analyse, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): void;
// OFI: Mutated in place
// MES: Mutated in place
// theDMVV: Mutated in place

// Fuses the chains of vertices in the theDMVV and updates AsDes by replacing the old vertices with the new ones
static FuseVertices(theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theAsDes: BRepAlgo_AsDes, theImageVV: BRepAlgo_Image): boolean;
// theImageVV: Mutated in place

// extents the edge
static ExtentEdge(E: TopoDS_Edge, NE: TopoDS_Edge, theOffset: number): boolean;
// NE: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the connection of the offset and not offset faces according to the connection type required
BRepOffset_Inter3d: declare class BRepOffset_Inter3d

constructor

CompletInt(SetOfFaces: NCollection_List_TopoDS_Shape, InitOffsetFace: BRepAlgo_Image, theRange: Message_ProgressRange): void;

// Computes intersection of pair of faces
FaceInter(F1: TopoDS_Face, F2: TopoDS_Face, InitOffsetFace: BRepAlgo_Image): void;

// Computes connections of the offset faces that have to be connected by arcs
ConnexIntByArc(SetOfFaces: NCollection_List_TopoDS_Shape, ShapeInit: TopoDS_Shape, Analyse: BRepOffset_Analyse, InitOffsetFace: BRepAlgo_Image, theRange: Message_ProgressRange): void;

// Computes intersection of the offset faces that have to be connected by sharp edges, i.e
ConnexIntByInt(SI: TopoDS_Shape, MapSF: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher, A: BRepOffset_Analyse, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Failed: NCollection_List_TopoDS_Shape, theRange: Message_ProgressRange, bIsPlanar: boolean): void;
// MES: Mutated in place
// Build: Mutated in place
// Failed: Mutated in place

// Computes intersection with not offset faces
ContextIntByInt(ContextFaces: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, ExtentContext: boolean, MapSF: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher, A: BRepOffset_Analyse, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Failed: NCollection_List_TopoDS_Shape, theRange: Message_ProgressRange, bIsPlanar: boolean): void;
// MES: Mutated in place
// Build: Mutated in place
// Failed: Mutated in place

// Computes connections of the not offset faces that have to be connected by arcs
ContextIntByArc(ContextFaces: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, ExtentContext: boolean, Analyse: BRepOffset_Analyse, InitOffsetFace: BRepAlgo_Image, InitOffsetEdge: BRepAlgo_Image, theRange: Message_ProgressRange): void;
// InitOffsetEdge: Mutated in place

// Marks the pair of faces as already intersected
SetDone(F1: TopoDS_Face, F2: TopoDS_Face): void;

// Checks if the pair of faces has already been treated
IsDone(F1: TopoDS_Face, F2: TopoDS_Face): boolean;

// Returns touched faces
TouchedFaces(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

// Returns AsDes tool
AsDes(): BRepAlgo_AsDes;

// Returns new edges
NewEdges(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepOffset_Interval: declare class BRepOffset_Interval

constructor

First(U: number): void;
First(): number;
First(U: number): void;
First(): number;

Last(U: number): void;
Last(): number;
Last(U: number): void;
Last(): number;

Type(T: ChFiDS_TypeOfConcavity): void;
Type(): ChFiDS_TypeOfConcavity;
Type(T: ChFiDS_TypeOfConcavity): void;
Type(): ChFiDS_TypeOfConcavity;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepOffset_MakeLoops: declare class BRepOffset_MakeLoops

constructor

Build(LF: NCollection_List_TopoDS_Shape, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, theImageVV: BRepAlgo_Image, theRange: Message_ProgressRange): void;

BuildOnContext(LContext: NCollection_List_TopoDS_Shape, Analyse: BRepOffset_Analyse, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, InSide: boolean, theRange: Message_ProgressRange): void;

BuildFaces(LF: NCollection_List_TopoDS_Shape, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, theRange: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class represents simple offset algorithm itself
BRepOffset_MakeSimpleOffset: declare class BRepOffset_MakeSimpleOffset

constructor

// Initialise shape for modifications
Initialize(theInputShape: TopoDS_Shape, theOffsetValue: number): void;

// Computes offset shape
Perform(): void;

// Gets error message
GetErrorMessage(): TCollection_AsciiString;

// Gets error code
GetError(): BRepOffsetSimple_Status;

// Gets solid building flag
GetBuildSolidFlag(): boolean;

// Sets solid building flag
SetBuildSolidFlag(theBuildFlag: boolean): void;

// Gets offset value
GetOffsetValue(): number;

// Sets offset value
SetOffsetValue(theOffsetValue: number): void;

// Gets tolerance (used for handling singularities)
GetTolerance(): number;

// Sets tolerance (used for handling singularities)
SetTolerance(theValue: number): void;

// Gets done state
IsDone(): boolean;

// Returns result shape
GetResultShape(): TopoDS_Shape;

// Computes max safe offset value for the given tolerance
GetSafeOffset(theExpectedToler: number): number;

// Returns result shape for the given one (if exists)
Generated(theShape: TopoDS_Shape): TopoDS_Shape;

// Returns modified shape for the given one (if exists)
Modified(theShape: TopoDS_Shape): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lists the offset modes
BRepOffset_Mode: typeof BRepOffset_Mode[keyof typeof BRepOffset_Mode]

// This class compute elemenary offset surface
BRepOffset_Offset: declare class BRepOffset_Offset

constructor

// Tol and Conti are only used if Polynomial is True (Used to perform the approximation) Only used in Rolling Ball
Init(Face: TopoDS_Face, Offset: number, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Face: TopoDS_Face, Offset: number, Created: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, FirstEdge: TopoDS_Edge, LastEdge: TopoDS_Edge, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Vertex: TopoDS_Vertex, LEdge: NCollection_List_TopoDS_Shape, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Edge: TopoDS_Edge, Offset: number): void;
Init(Face: TopoDS_Face, Offset: number, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Face: TopoDS_Face, Offset: number, Created: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, FirstEdge: TopoDS_Edge, LastEdge: TopoDS_Edge, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Vertex: TopoDS_Vertex, LEdge: NCollection_List_TopoDS_Shape, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Edge: TopoDS_Edge, Offset: number): void;
Init(Face: TopoDS_Face, Offset: number, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Face: TopoDS_Face, Offset: number, Created: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, FirstEdge: TopoDS_Edge, LastEdge: TopoDS_Edge, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Vertex: TopoDS_Vertex, LEdge: NCollection_List_TopoDS_Shape, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Edge: TopoDS_Edge, Offset: number): void;
Init(Face: TopoDS_Face, Offset: number, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Face: TopoDS_Face, Offset: number, Created: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, FirstEdge: TopoDS_Edge, LastEdge: TopoDS_Edge, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Vertex: TopoDS_Vertex, LEdge: NCollection_List_TopoDS_Shape, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Edge: TopoDS_Edge, Offset: number): void;
Init(Face: TopoDS_Face, Offset: number, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Face: TopoDS_Face, Offset: number, Created: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, FirstEdge: TopoDS_Edge, LastEdge: TopoDS_Edge, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Vertex: TopoDS_Vertex, LEdge: NCollection_List_TopoDS_Shape, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Edge: TopoDS_Edge, Offset: number): void;
Init(Face: TopoDS_Face, Offset: number, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Face: TopoDS_Face, Offset: number, Created: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, OffsetOutside: boolean, JoinType: GeomAbs_JoinType): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Path: TopoDS_Edge, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Offset: number, FirstEdge: TopoDS_Edge, LastEdge: TopoDS_Edge, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Vertex: TopoDS_Vertex, LEdge: NCollection_List_TopoDS_Shape, Offset: number, Polynomial: boolean, Tol: number, Conti: GeomAbs_Shape): void;
Init(Edge: TopoDS_Edge, Offset: number): void;

InitialShape(): TopoDS_Shape;

Face(): TopoDS_Face;

Generated(Shape: TopoDS_Shape): TopoDS_Shape;

Status(): BRepOffset_Status;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class represents mechanism of simple offset algorithm i.e
BRepOffset_SimpleOffset: declare class BRepOffset_SimpleOffset extends BRepTools_Modification

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns true if the face <F> has been modified
NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the edge <E> has been modified
NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };
// L: Mutated in place

// Returns true if the vertex <V> has been modified
NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };
// P: Mutated in place

// Returns true if the edge <E> has a new curve on surface on the face <F>
NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

// Returns true if the Vertex <V> has a new parameter on the edge <E>
NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

// Returns the continuity of <NewE> between <NewF1> and <NewF2>
Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// status of an offset face Good
BRepOffset_Status: typeof BRepOffset_Status[keyof typeof BRepOffset_Status]

BRepOffset_DataMapOfShapeOffset: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher

BRepOffset_ListOfInterval: NCollection_List_BRepOffset_Interval
