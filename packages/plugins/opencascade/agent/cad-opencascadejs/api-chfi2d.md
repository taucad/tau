# libcascade — ChFi2d

7 top-level symbols. Signatures are verbatim typescript.

// This package contains the algorithms used to build fillets or chamfers on planar wire
ChFi2d: declare class ChFi2d

constructor

static CommonVertex(E1: TopoDS_Edge, E2: TopoDS_Edge, V: TopoDS_Vertex): boolean;

static FindConnectedEdges(F: TopoDS_Face, V: TopoDS_Vertex, E1: TopoDS_Edge, E2: TopoDS_Edge): ChFi2d_ConstructionError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An analytical algorithm for calculation of the fillets
ChFi2d_AnaFilletAlgo: declare class ChFi2d_AnaFilletAlgo

constructor

// Initializes the class by a wire consisting of two edges
Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;
Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

// Calculates a fillet
Perform(radius: number): boolean;

// Retrieves a result (fillet and shrinked neighbours)
Result(e1: TopoDS_Edge, e2: TopoDS_Edge): TopoDS_Edge;
// e1: Mutated in place
// e2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class contains the algorithm used to build fillet on planar wire
ChFi2d_Builder: declare class ChFi2d_Builder

constructor

Init(F: TopoDS_Face): void;
Init(RefFace: TopoDS_Face, ModFace: TopoDS_Face): void;
Init(F: TopoDS_Face): void;
Init(RefFace: TopoDS_Face, ModFace: TopoDS_Face): void;

// Add a fillet of radius <Radius> on the wire between the two edges connected to the vertex <V>
AddFillet(V: TopoDS_Vertex, Radius: number): TopoDS_Edge;

// modify the fillet radius and return the new fillet edge
ModifyFillet(Fillet: TopoDS_Edge, Radius: number): TopoDS_Edge;

// removes the fillet <Fillet> and returns the vertex connecting the two adjacent edges to this fillet
RemoveFillet(Fillet: TopoDS_Edge): TopoDS_Vertex;

// Add a chamfer on the wire between the two edges connected <E1> and <E2>
AddChamfer(E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
AddChamfer(E: TopoDS_Edge, V: TopoDS_Vertex, D: number, Ang: number): TopoDS_Edge;
AddChamfer(E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
AddChamfer(E: TopoDS_Edge, V: TopoDS_Vertex, D: number, Ang: number): TopoDS_Edge;

// modify the chamfer <Chamfer> and returns the new chamfer edge
ModifyChamfer(Chamfer: TopoDS_Edge, E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
ModifyChamfer(Chamfer: TopoDS_Edge, E: TopoDS_Edge, D: number, Ang: number): TopoDS_Edge;
ModifyChamfer(Chamfer: TopoDS_Edge, E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
ModifyChamfer(Chamfer: TopoDS_Edge, E: TopoDS_Edge, D: number, Ang: number): TopoDS_Edge;

// removes the chamfer <Chamfer> and returns the vertex connecting the two adjacent edges to this chamfer
RemoveChamfer(Chamfer: TopoDS_Edge): TopoDS_Vertex;

// returns the modified face
Result(): TopoDS_Face;

IsModified(E: TopoDS_Edge): boolean;

// returns the list of new edges
FilletEdges(): NCollection_Sequence_TopoDS_Shape;

NbFillet(): number;

// returns the list of new edges
ChamferEdges(): NCollection_Sequence_TopoDS_Shape;

NbChamfer(): number;

HasDescendant(E: TopoDS_Edge): boolean;

// returns the modified edge if <E> has descendant or <E> in the other case
DescendantEdge(E: TopoDS_Edge): TopoDS_Edge;

// Returns the parent edge of <E> Warning
BasisEdge(E: TopoDS_Edge): TopoDS_Edge;

Status(): ChFi2d_ConstructionError;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A class making a chamfer between two linear edges
ChFi2d_ChamferAPI: declare class ChFi2d_ChamferAPI

constructor

// Initializes the class by a wire consisting of two libear edges
Init(theWire: TopoDS_Wire): void;
Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge): void;
Init(theWire: TopoDS_Wire): void;
Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge): void;

// Constructs a chamfer edge
Perform(): boolean;

Result(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theLength1: number, theLength2: number): TopoDS_Edge;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Error that can occur during the fillet construction on planar wire
ChFi2d_ConstructionError: typeof ChFi2d_ConstructionError[keyof typeof ChFi2d_ConstructionError]

// An interface class for 2D fillets
ChFi2d_FilletAPI: declare class ChFi2d_FilletAPI

constructor

// Initializes a fillet algorithm
Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;
Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

// Constructs a fillet edge
Perform(theRadius: number): boolean;

// Returns number of possible solutions
NbResults(thePoint: gp_Pnt): number;

// Returns result (fillet edge, modified edge1, modified edge2), nearest to the given point <thePoint> if iSolution == -1 <thePoint> chooses a particular fillet in case of several fillets may be constructed (for example, a circle intersecting a segment in 2 points)
Result(thePoint: gp_Pnt, theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, iSolution: number): TopoDS_Edge;
// theEdge1: Mutated in place
// theEdge2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Algorithm that creates fillet edge
ChFi2d_FilletAlgo: declare class ChFi2d_FilletAlgo

constructor

// Initializes a fillet algorithm
Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;
Init(theWire: TopoDS_Wire, thePlane: gp_Pln): void;
Init(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, thePlane: gp_Pln): void;

// Constructs a fillet edge
Perform(theRadius: number): boolean;

// Returns number of possible solutions
NbResults(thePoint: gp_Pnt): number;

// Returns result (fillet edge, modified edge1, modified edge2), nearest to the given point <thePoint> if iSolution == -1
Result(thePoint: gp_Pnt, theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, iSolution: number): TopoDS_Edge;
// theEdge1: Mutated in place
// theEdge2: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
