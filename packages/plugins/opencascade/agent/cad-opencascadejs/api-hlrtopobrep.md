# libcascade — HLRTopoBRep

6 top-level symbols. Signatures are verbatim typescript.

HLRTopoBRep_DSFiller: declare class HLRTopoBRep_DSFiller

constructor

static Insert(S: TopoDS_Shape, FO: Contap_Contour, DS: HLRTopoBRep_Data, MST: NCollection_DataMap_TopoDS_Shape_BRepTopAdaptor_Tool_TopTools_ShapeMapHasher, nbIso: number): void;

delete(): void;

[Symbol.dispose](): void;

HLRTopoBRep_Data: declare class HLRTopoBRep_Data

constructor

Clear(): void;

Clean(): void;

EdgeHasSplE(E: TopoDS_Edge): boolean;

FaceHasIntL(F: TopoDS_Face): boolean;

FaceHasOutL(F: TopoDS_Face): boolean;

FaceHasIsoL(F: TopoDS_Face): boolean;

IsSplEEdgeEdge(E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

IsIntLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

IsOutLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

IsIsoLFaceEdge(F: TopoDS_Face, E: TopoDS_Edge): boolean;

NewSOldS(New: TopoDS_Shape): TopoDS_Shape;

EdgeSplE(E: TopoDS_Edge): NCollection_List_TopoDS_Shape;

FaceIntL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

FaceOutL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

FaceIsoL(F: TopoDS_Face): NCollection_List_TopoDS_Shape;

IsOutV(V: TopoDS_Vertex): boolean;

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

InitVertex(E: TopoDS_Edge): void;

MoreVertex(): boolean;

NextVertex(): void;

Vertex(): TopoDS_Vertex;

Parameter(): number;

InsertBefore(V: TopoDS_Vertex, P: number): void;

Append(V: TopoDS_Vertex, P: number): void;

delete(): void;

[Symbol.dispose](): void;

HLRTopoBRep_FaceData: declare class HLRTopoBRep_FaceData

constructor

FaceIntL(): NCollection_List_TopoDS_Shape;

FaceOutL(): NCollection_List_TopoDS_Shape;

FaceIsoL(): NCollection_List_TopoDS_Shape;

AddIntL(): NCollection_List_TopoDS_Shape;

AddOutL(): NCollection_List_TopoDS_Shape;

AddIsoL(): NCollection_List_TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;

HLRTopoBRep_FaceIsoLiner: declare class HLRTopoBRep_FaceIsoLiner

constructor

static Perform(FI: number, F: TopoDS_Face, DS: HLRTopoBRep_Data, nbIsos: number): void;

static MakeVertex(E: TopoDS_Edge, P: gp_Pnt, Par: number, Tol: number, DS: HLRTopoBRep_Data): TopoDS_Vertex;

static MakeIsoLine(F: TopoDS_Face, Iso: Geom2d_Line, V1: TopoDS_Vertex, V2: TopoDS_Vertex, U1: number, U2: number, Tol: number, DS: HLRTopoBRep_Data): void;

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

delete(): void;

[Symbol.dispose](): void;

HLRTopoBRep_VData: declare class HLRTopoBRep_VData

constructor

Parameter(): number;

Vertex(): TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;
