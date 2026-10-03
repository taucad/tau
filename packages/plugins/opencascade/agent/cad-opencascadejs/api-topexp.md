# libcascade — TopExp

2 top-level symbols. Signatures are verbatim typescript.

TopExp: declare class TopExp

  // TopExp.constructor (constructor)
  constructor();

  // TopExp.MapShapes (method)
  static MapShapes(S: TopoDS_Shape, T: TopAbs_ShapeEnum, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher): void;
  static MapShapes(S: TopoDS_Shape, M: NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;
  static MapShapes(S: TopoDS_Shape, M: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, cumOri: boolean, cumLoc: boolean): void;

  // TopExp.MapShapesAndAncestors (method)
  static MapShapesAndAncestors(S: TopoDS_Shape, TS: TopAbs_ShapeEnum, TA: TopAbs_ShapeEnum, M: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher): void;

  // TopExp.MapShapesAndUniqueAncestors (method)
  static MapShapesAndUniqueAncestors(S: TopoDS_Shape, TS: TopAbs_ShapeEnum, TA: TopAbs_ShapeEnum, M: NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, useOrientation: boolean): void;

  // TopExp.FirstVertex (method)
  static FirstVertex(E: TopoDS_Edge, CumOri?: boolean): TopoDS_Vertex;

  // TopExp.LastVertex (method)
  static LastVertex(E: TopoDS_Edge, CumOri?: boolean): TopoDS_Vertex;

  // TopExp.Vertices (method)
  static Vertices(E: TopoDS_Edge, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex, CumOri: boolean): void;
  static Vertices(W: TopoDS_Wire, Vfirst: TopoDS_Vertex, Vlast: TopoDS_Vertex): void;

  // TopExp.CommonVertex (method)
  static CommonVertex(E1: TopoDS_Edge, E2: TopoDS_Edge, V: TopoDS_Vertex): boolean;

  // TopExp.delete (method)
  delete(): void;

  // TopExp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopExp_Explorer: declare class TopExp_Explorer

  // TopExp_Explorer.constructor (constructor)
  constructor();
  constructor(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid?: TopAbs_ShapeEnum);

  // TopExp_Explorer.Init (method)
  Init(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid?: TopAbs_ShapeEnum): void;

  // TopExp_Explorer.More (method)
  More(): boolean;

  // TopExp_Explorer.Next (method)
  Next(): void;

  // TopExp_Explorer.Value (method)
  Value(): TopoDS_Shape;

  // TopExp_Explorer.Current (method)
  Current(): TopoDS_Shape;

  // TopExp_Explorer.ReInit (method)
  ReInit(): void;

  // TopExp_Explorer.ExploredShape (method)
  ExploredShape(): TopoDS_Shape;

  // TopExp_Explorer.Depth (method)
  Depth(): number;

  // TopExp_Explorer.Clear (method)
  Clear(): void;

  // TopExp_Explorer.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // TopExp_Explorer.delete (method)
  delete(): void;

  // TopExp_Explorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
