# libcascade — BRepOffset

13 top-level symbols. Signatures are verbatim typescript.

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

delete(): void;

[Symbol.dispose](): void;

BRepOffset_Error: typeof BRepOffset_Error[keyof typeof BRepOffset_Error]

BRepOffset_Inter2d: declare class BRepOffset_Inter2d

constructor

static Compute(AsDes: BRepAlgo_AsDes, F: TopoDS_Face, NewEdges: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, Tol: number, theEdgeIntEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): void;

static ConnexIntByInt(FI: TopoDS_Face, OFI: BRepOffset_Offset, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, theAsDes: BRepAlgo_AsDes, AsDes2d: BRepAlgo_AsDes, Offset: number, Tol: number, Analyse: BRepOffset_Analyse, FacesWithVerts: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, theImageVV: BRepAlgo_Image, theEdgeIntEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): boolean;

static ConnexIntByIntInVert(FI: TopoDS_Face, OFI: BRepOffset_Offset, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, AsDes: BRepAlgo_AsDes, AsDes2d: BRepAlgo_AsDes, Tol: number, Analyse: BRepOffset_Analyse, theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theRange: Message_ProgressRange): void;

static FuseVertices(theDMVV: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, theAsDes: BRepAlgo_AsDes, theImageVV: BRepAlgo_Image): boolean;

static ExtentEdge(E: TopoDS_Edge, NE: TopoDS_Edge, theOffset: number): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepOffset_Inter3d: declare class BRepOffset_Inter3d

constructor

CompletInt(SetOfFaces: NCollection_List_TopoDS_Shape, InitOffsetFace: BRepAlgo_Image, theRange: Message_ProgressRange): void;

FaceInter(F1: TopoDS_Face, F2: TopoDS_Face, InitOffsetFace: BRepAlgo_Image): void;

ConnexIntByArc(SetOfFaces: NCollection_List_TopoDS_Shape, ShapeInit: TopoDS_Shape, Analyse: BRepOffset_Analyse, InitOffsetFace: BRepAlgo_Image, theRange: Message_ProgressRange): void;

ConnexIntByInt(SI: TopoDS_Shape, MapSF: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher, A: BRepOffset_Analyse, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Failed: NCollection_List_TopoDS_Shape, theRange: Message_ProgressRange, bIsPlanar: boolean): void;

ContextIntByInt(ContextFaces: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, ExtentContext: boolean, MapSF: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher, A: BRepOffset_Analyse, MES: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Build: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, Failed: NCollection_List_TopoDS_Shape, theRange: Message_ProgressRange, bIsPlanar: boolean): void;

ContextIntByArc(ContextFaces: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, ExtentContext: boolean, Analyse: BRepOffset_Analyse, InitOffsetFace: BRepAlgo_Image, InitOffsetEdge: BRepAlgo_Image, theRange: Message_ProgressRange): void;

SetDone(F1: TopoDS_Face, F2: TopoDS_Face): void;

IsDone(F1: TopoDS_Face, F2: TopoDS_Face): boolean;

TouchedFaces(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

AsDes(): BRepAlgo_AsDes;

NewEdges(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

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

delete(): void;

[Symbol.dispose](): void;

BRepOffset_MakeLoops: declare class BRepOffset_MakeLoops

constructor

Build(LF: NCollection_List_TopoDS_Shape, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, theImageVV: BRepAlgo_Image, theRange: Message_ProgressRange): void;

BuildOnContext(LContext: NCollection_List_TopoDS_Shape, Analyse: BRepOffset_Analyse, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, InSide: boolean, theRange: Message_ProgressRange): void;

BuildFaces(LF: NCollection_List_TopoDS_Shape, AsDes: BRepAlgo_AsDes, Image: BRepAlgo_Image, theRange: Message_ProgressRange): void;

delete(): void;

[Symbol.dispose](): void;

BRepOffset_MakeSimpleOffset: declare class BRepOffset_MakeSimpleOffset

constructor

Initialize(theInputShape: TopoDS_Shape, theOffsetValue: number): void;

Perform(): void;

GetErrorMessage(): TCollection_AsciiString;

GetError(): BRepOffsetSimple_Status;

GetBuildSolidFlag(): boolean;

SetBuildSolidFlag(theBuildFlag: boolean): void;

GetOffsetValue(): number;

SetOffsetValue(theOffsetValue: number): void;

GetTolerance(): number;

SetTolerance(theValue: number): void;

IsDone(): boolean;

GetResultShape(): TopoDS_Shape;

GetSafeOffset(theExpectedToler: number): number;

Generated(theShape: TopoDS_Shape): TopoDS_Shape;

Modified(theShape: TopoDS_Shape): TopoDS_Shape;

delete(): void;

[Symbol.dispose](): void;

BRepOffset_Mode: typeof BRepOffset_Mode[keyof typeof BRepOffset_Mode]

BRepOffset_Offset: declare class BRepOffset_Offset

constructor

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

delete(): void;

[Symbol.dispose](): void;

BRepOffset_SimpleOffset: declare class BRepOffset_SimpleOffset extends BRepTools_Modification

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewSurface(F: TopoDS_Face, L: TopLoc_Location, Tol: number, RevWires: boolean, RevFace: boolean): { returnValue: boolean; S: Geom_Surface; Tol: number; RevWires: boolean; RevFace: boolean; [Symbol.dispose](): void };

NewCurve(E: TopoDS_Edge, L: TopLoc_Location, Tol: number): { returnValue: boolean; C: Geom_Curve; Tol: number; [Symbol.dispose](): void };

NewPoint(V: TopoDS_Vertex, P: gp_Pnt, Tol: number): { returnValue: boolean; Tol: number };

NewCurve2d(E: TopoDS_Edge, F: TopoDS_Face, NewE: TopoDS_Edge, NewF: TopoDS_Face, Tol: number): { returnValue: boolean; C: Geom2d_Curve; Tol: number; [Symbol.dispose](): void };

NewParameter(V: TopoDS_Vertex, E: TopoDS_Edge, P: number, Tol: number): { returnValue: boolean; P: number; Tol: number };

Continuity(E: TopoDS_Edge, F1: TopoDS_Face, F2: TopoDS_Face, NewE: TopoDS_Edge, NewF1: TopoDS_Face, NewF2: TopoDS_Face): GeomAbs_Shape;

delete(): void;

[Symbol.dispose](): void;

BRepOffset_Status: typeof BRepOffset_Status[keyof typeof BRepOffset_Status]

BRepOffset_DataMapOfShapeOffset: NCollection_DataMap_TopoDS_Shape_BRepOffset_Offset_TopTools_ShapeMapHasher

BRepOffset_ListOfInterval: NCollection_List_BRepOffset_Interval
