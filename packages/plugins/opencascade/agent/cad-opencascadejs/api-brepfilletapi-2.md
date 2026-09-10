# libcascade — BRepFilletAPI (2)

1 top-level symbols. Signatures are verbatim typescript.

// Describes functions to build fillets and chamfers on the vertices of a planar face
BRepFilletAPI_MakeFillet2d: declare class BRepFilletAPI_MakeFillet2d extends BRepBuilderAPI_MakeShape

constructor

// Initializes this algorithm for constructing fillets or chamfers with the face F
Init(F: TopoDS_Face): void;
Init(RefFace: TopoDS_Face, ModFace: TopoDS_Face): void;
Init(F: TopoDS_Face): void;
Init(RefFace: TopoDS_Face, ModFace: TopoDS_Face): void;

// Adds a fillet of radius Radius between the two edges adjacent to the vertex V on the face modified by this algorithm
AddFillet(V: TopoDS_Vertex, Radius: number): TopoDS_Edge;

// Assigns the radius Radius to the fillet Fillet already built on the face modified by this algorithm
ModifyFillet(Fillet: TopoDS_Edge, Radius: number): TopoDS_Edge;

// Removes the fillet Fillet already built on the face modified by this algorithm
RemoveFillet(Fillet: TopoDS_Edge): TopoDS_Vertex;

// Adds a chamfer on the face modified by this algorithm between the two adjacent edges E1 and E2, where the extremities of the chamfer are on E1 and E2 at distances D1 and D2 respectively In cases where the edges are not rectilinear, distances are measured using the curvilinear abscissa of the edges and the angle is measured with respect to the tangent at the corresponding point
AddChamfer(E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
AddChamfer(E: TopoDS_Edge, V: TopoDS_Vertex, D: number, Ang: number): TopoDS_Edge;
AddChamfer(E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
AddChamfer(E: TopoDS_Edge, V: TopoDS_Vertex, D: number, Ang: number): TopoDS_Edge;

// Modifies the chamfer Chamfer on the face modified by this algorithm, where
ModifyChamfer(Chamfer: TopoDS_Edge, E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
ModifyChamfer(Chamfer: TopoDS_Edge, E: TopoDS_Edge, D: number, Ang: number): TopoDS_Edge;
ModifyChamfer(Chamfer: TopoDS_Edge, E1: TopoDS_Edge, E2: TopoDS_Edge, D1: number, D2: number): TopoDS_Edge;
ModifyChamfer(Chamfer: TopoDS_Edge, E: TopoDS_Edge, D: number, Ang: number): TopoDS_Edge;

// Removes the chamfer Chamfer already built on the face modified by this algorithm
RemoveChamfer(Chamfer: TopoDS_Edge): TopoDS_Vertex;

// Returns true if the edge E on the face modified by this algorithm is chamfered or filleted
IsModified(E: TopoDS_Edge): boolean;

// Returns the table of fillets on the face modified by this algorithm
FilletEdges(): NCollection_Sequence_TopoDS_Shape;

// Returns the number of fillets on the face modified by this algorithm
NbFillet(): number;

// Returns the table of chamfers on the face modified by this algorithm
ChamferEdges(): NCollection_Sequence_TopoDS_Shape;

// Returns the number of chamfers on the face modified by this algorithm
NbChamfer(): number;

// Returns the list of shapes modified from the shape
Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

// returns the number of new curves after the shape creation
NbCurves(): number;

// Return the Edges created for curve I
NewEdges(I: number): NCollection_List_TopoDS_Shape;

HasDescendant(E: TopoDS_Edge): boolean;

// Returns the chamfered or filleted edge built from the edge E on the face modified by this algorithm
DescendantEdge(E: TopoDS_Edge): TopoDS_Edge;

// Returns the basis edge on the face modified by this algorithm from which the chamfered or filleted edge E is built
BasisEdge(E: TopoDS_Edge): TopoDS_Edge;

Status(): ChFi2d_ConstructionError;

// Update the result and set the Done flag
Build(theRange?: Message_ProgressRange): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
