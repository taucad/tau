# libcascade — TopExp

2 top-level symbols. Signatures are verbatim typescript.

// This package provides basic tools to explore the topological data structures
TopExp: declare class TopExp

constructor

// Tool to explore a topological data structure
static MapShapes(S: TopoDS_Shape, T: TopAbs_ShapeEnum, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, T: TopAbs_ShapeEnum, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, T: TopAbs_ShapeEnum, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
static MapShapes(S: TopoDS_Shape, M: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
// M: Mutated in place

// Stores in the map <M> all the subshape of of type <TS> for each one append to the list all the ancestors of type <TA>
static MapShapesAndAncestors(S: TopoDS_Shape, TS: TopAbs_ShapeEnum, TA: TopAbs_ShapeEnum, M: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;
// M: Mutated in place

// Stores in the map <M> all the subshape of of type <TS> for each one append to the list all unique ancestors of type <TA>
static MapShapesAndUniqueAncestors(S: TopoDS_Shape, TS: TopAbs_ShapeEnum, TA: TopAbs_ShapeEnum, M: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, useOrientation: boolean): void;
// M: Mutated in place

// Returns the Vertex of orientation FORWARD in E
static FirstVertex(E: TopoDS_Edge, CumOri?: boolean): TopoDS_Vertex;

// Returns the Vertex of orientation REVERSED in E
static LastVertex(E: TopoDS_Edge, CumOri?: boolean): TopoDS_Vertex;

// Returns in Vfirst, Vlast the FORWARD and REVERSED vertices of the edge <E>
static Vertices(E: TopoDS_Edge, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex, CumOri: boolean): void;
static Vertices(W: TopoDS_Wire, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex): void;
static Vertices(E: TopoDS_Edge, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex, CumOri: boolean): void;
static Vertices(W: TopoDS_Wire, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex): void;
// Vfirst: Mutated in place
// Vlast: Mutated in place

// Finds the vertex <V> common to the two edges <E1,E2>, returns True if this vertex exists
static CommonVertex(E1: TopoDS_Edge, E2: TopoDS_Edge, V: TopoDS_Vertex): boolean;
// V: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An Explorer is a Tool to visit a Topological Data Structure from the `TopoDS` package
TopExp_Explorer: declare class TopExp_Explorer

constructor

// Resets this explorer on the shape S
Init(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid?: TopAbs_ShapeEnum): void;

// Returns True if there are more shapes in the exploration
More(): boolean;

// Moves to the next Shape in the exploration
Next(): void;

// Returns the current shape in the exploration
Value(): TopoDS_Shape;

// Returns the current shape in the exploration
Current(): TopoDS_Shape;

// Reinitialize the exploration with the original arguments
ReInit(): void;

// Return explored shape
ExploredShape(): TopoDS_Shape;

// Returns the current depth of the exploration
Depth(): number;

// Clears the content of the explorer
Clear(): void;

// Returns a sentinel marking the end of iteration
end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
