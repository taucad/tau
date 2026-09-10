# libcascade — HLRTopoBRep

6 top-level symbols. Signatures are verbatim typescript.

// Provides methods to fill a {@link HLRTopoBRep_Data`HLRTopoBRep_Data`}
HLRTopoBRep_DSFiller: declare class HLRTopoBRep_DSFiller

constructor

// Stores in <DS> the outlines of using the current outliner and stores the isolines in <DS> using a Hatcher
static Insert(S: TopoDS_Shape, FO: Contap_Contour, DS: HLRTopoBRep_Data, MST: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher, nbIso: number): void;
// FO: Mutated in place
// DS: Mutated in place
// MST: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stores the results of the OutLine and IsoLine processes
HLRTopoBRep_Data: declare class HLRTopoBRep_Data

constructor

// Clear of all the maps
Clear(): void;

// Clear of all the data not needed during and after the hiding process
Clean(): void;

// Returns True if the Edge is split
EdgeHasSplE(E: TopoDS_Edge): boolean;

// Returns True if the Face has internal outline
FaceHasIntL(F: TopoDS_Face): boolean;

// Returns True if the Face has outlines on restriction
FaceHasOutL(F: TopoDS_Face): boolean;

// Returns True if the Face has isolines
FaceHasIsoL(F: TopoDS_Face): boolean;

IsSplEEdgeEdge(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

IsIntLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

IsOutLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

IsIsoLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

NewSOldS(New: TopoDS_Shape): TopoDS_Shape;

// Returns the list of the edges
EdgeSplE(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

// Returns the list of the internal OutLines
FaceIntL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

// Returns the list of the OutLines on restriction
FaceOutL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

// Returns the list of the IsoLines
FaceIsoL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

// Returns True if V is an outline vertex on a restriction
IsOutV(V: TopoDS_Vertex): boolean;

// Returns True if V is an internal outline vertex
IsIntV(V: TopoDS_Vertex): boolean;

AddOldS(NewS: TopoDS_Shape, OldS: TopoDS_Shape): void;

AddSplE(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

AddIntL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

AddOutL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

AddIsoL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

AddOutV(V: TopoDS_Vertex): void;

AddIntV(V: TopoDS_Vertex): void;

InitEdge(): void;

MoreEdge(): boolean;

NextEdge(): void;

Edge(): TopoDS_Edge;

// Start an iteration on the vertices of E
InitVertex(E: TopoDS_Edge): void;

MoreVertex(): boolean;

NextVertex(): void;

Vertex(): TopoDS_Vertex;

Parameter(): number;

// Insert before the current position
InsertBefore(V: TopoDS_Vertex, P: number): void;

Append(V: TopoDS_Vertex, P: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contains the 3 ListOfShape of a Face (Internal OutLines, OutLines on restriction and IsoLines)
HLRTopoBRep_FaceData: declare class HLRTopoBRep_FaceData

constructor

FaceIntL(): NCollection_List_TopoDS_Shape;

FaceOutL(): NCollection_List_TopoDS_Shape;

FaceIsoL(): NCollection_List_TopoDS_Shape;

AddIntL(): NCollection_List_TopoDS_Shape;

AddOutL(): NCollection_List_TopoDS_Shape;

AddIsoL(): NCollection_List_TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRTopoBRep_FaceIsoLiner: declare class HLRTopoBRep_FaceIsoLiner

constructor

static Perform(FI: number, F: TopoDS_Face, DS: HLRTopoBRep_Data, nbIsos: number): void;

static MakeVertex(E: TopoDS_Edge, P: gp_Pnt, Par: number, Tol: number, DS: HLRTopoBRep_Data): TopoDS_Vertex;

static MakeIsoLine(F: TopoDS_Face, Iso: Geom2d_Line, V1: TopoDS_Vertex, V2: TopoDS_Vertex, U1: number, U2: number, Tol: number, DS: HLRTopoBRep_Data): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRTopoBRep_OutLiner: declare class HLRTopoBRep_OutLiner extends Standard_Transient

constructor

OriginalShape(OriS: TopoDS_Shape): void;
OriginalShape(): TopoDS_Shape;
OriginalShape(OriS: TopoDS_Shape): void;
OriginalShape(): TopoDS_Shape;

OutLinedShape(OutS: TopoDS_Shape): void;
OutLinedShape(): TopoDS_Shape;
OutLinedShape(OutS: TopoDS_Shape): void;
OutLinedShape(): TopoDS_Shape;

DataStructure(): HLRTopoBRep_Data;

Fill(P: HLRAlgo_Projector, MST: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher, nbIso: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRTopoBRep_VData: declare class HLRTopoBRep_VData

constructor

Parameter(): number;

Vertex(): TopoDS_Shape;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
