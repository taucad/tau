# libcascade — TopExp

2 top-level symbols. Signatures are verbatim typescript.

TopExp: declare class TopExp

constructor

static MapShapes(S: TopoDS_Shape, T: TopAbs_ShapeEnum, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, T: TopAbs_ShapeEnum, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, T: TopAbs_ShapeEnum, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;

static MapShapesAndAncestors(S: TopoDS_Shape, TS: TopAbs_ShapeEnum, TA: TopAbs_ShapeEnum, M: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

static MapShapesAndUniqueAncestors(S: TopoDS_Shape, TS: TopAbs_ShapeEnum, TA: TopAbs_ShapeEnum, M: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, useOrientation: boolean): void;

static FirstVertex(E: TopoDS_Edge, CumOri?: boolean): TopoDS_Vertex;

static LastVertex(E: TopoDS_Edge, CumOri?: boolean): TopoDS_Vertex;

static Vertices(E: TopoDS_Edge, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex, CumOri: boolean): void;
static Vertices(W: TopoDS_Wire, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex): void;
static Vertices(E: TopoDS_Edge, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex, CumOri: boolean): void;
static Vertices(W: TopoDS_Wire, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex): void;

static CommonVertex(E1: TopoDS_Edge, E2: TopoDS_Edge, V: TopoDS_Vertex): boolean;

delete(): void;

[Symbol.dispose](): void;

TopExp_Explorer: declare class TopExp_Explorer

constructor

Init(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid?: TopAbs_ShapeEnum): void;

More(): boolean;

Next(): void;

Value(): TopoDS_Shape;

Current(): TopoDS_Shape;

ReInit(): void;

ExploredShape(): TopoDS_Shape;

Depth(): number;

Clear(): void;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;
