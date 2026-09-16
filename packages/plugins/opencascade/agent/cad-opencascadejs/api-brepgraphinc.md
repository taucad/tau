# libcascade — BRepGraphInc

46 top-level symbols. Signatures are verbatim typescript.

BRepGraphInc_BitFlags: declare class BRepGraphInc_BitFlags

  constructor

  Resize(theCount: number): void;

  Set(theIndex: number): void;

  Clear(theIndex: number): void;

  Test(theIndex: number): boolean;

  SetAll(): void;

  ClearAll(): void;

  HasAnyBitSet(): boolean;

  NbBlocks(): number;

  BitCount(): number;

  IsValidIndex(theIndex: number): boolean;

  Blocks(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_BaseDef: declare class BRepGraphInc_BaseDef

  constructor

  UID: number

  OwnGen: number

  SubtreeGen: number

  LastPropWave: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_CoEdgeDef: declare class BRepGraphInc_CoEdgeDef extends BRepGraphInc_BaseDef

  constructor

  ParentWireId: BRepGraph_WireId

  ChildEdgeId: BRepGraph_EdgeId

  FaceId: BRepGraph_FaceId

  Orientation: BRepGraphInc_ParityOrientation

  Curve2DRepId: BRepGraph_CoEdgeCurve2DRepId

  Polygon2DRepId: BRepGraph_CoEdgePolygon2DRepId

  PolygonOnTriRepId: BRepGraph_CoEdgePolygonOnTriRepId

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_CompSolidDef: declare class BRepGraphInc_CompSolidDef extends BRepGraphInc_BaseDef

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_CompoundDef: declare class BRepGraphInc_CompoundDef extends BRepGraphInc_BaseDef

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_EdgeDef: declare class BRepGraphInc_EdgeDef extends BRepGraphInc_BaseDef

  constructor

  Curve3DRepId: BRepGraph_EdgeCurve3DRepId

  Tolerance: number

  StartVertexRefId: BRepGraph_VertexRefId

  EndVertexRefId: BRepGraph_VertexRefId

  Polygon3DRepId: BRepGraph_EdgePolygon3DRepId

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_FaceDef: declare class BRepGraphInc_FaceDef extends BRepGraphInc_BaseDef

  constructor

  SurfaceRepId: BRepGraph_FaceSurfaceRepId

  TriangulationRepId: BRepGraph_FaceTriangulationRepId

  Tolerance: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_OccurrenceDef: declare class BRepGraphInc_OccurrenceDef extends BRepGraphInc_BaseDef

  constructor

  ChildNodeId: BRepGraph_NodeId

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_ProductDef: declare class BRepGraphInc_ProductDef extends BRepGraphInc_BaseDef

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_ShellDef: declare class BRepGraphInc_ShellDef extends BRepGraphInc_BaseDef

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_SolidDef: declare class BRepGraphInc_SolidDef extends BRepGraphInc_BaseDef

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_VertexDef: declare class BRepGraphInc_VertexDef extends BRepGraphInc_BaseDef

  constructor

  Point: gp_Pnt

  Tolerance: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_WireDef: declare class BRepGraphInc_WireDef extends BRepGraphInc_BaseDef

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_Load_Counts: declare class BRepGraphInc_Load_Counts

  constructor

  NbVertices: number

  NbEdges: number

  NbCoEdges: number

  NbWires: number

  NbFaces: number

  NbShells: number

  NbSolids: number

  NbCompounds: number

  NbCompSolids: number

  NbProducts: number

  NbOccurrences: number

  NbShellRefs: number

  NbFaceRefs: number

  NbWireRefs: number

  NbVertexRefs: number

  NbSolidRefs: number

  NbChildRefs: number

  NbOccurrenceRefs: number

  NbFaceSurfaceReps: number

  NbEdgeCurve3DReps: number

  NbCoEdgeCurve2DReps: number

  NbFaceTriangulationReps: number

  NbEdgePolygon3DReps: number

  NbCoEdgePolygon2DReps: number

  NbCoEdgePolygonOnTriReps: number

  NbRootProducts: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_ParityOrientation: declare class BRepGraphInc_ParityOrientation

  constructor

  IsReversed: boolean

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_Populate: declare class BRepGraphInc_Populate

  static Perform(theGraph: BRepGraph, theShape: TopoDS_Shape, theParallel: boolean, theOptions?: BRepGraphInc_Populate_Options): BRepGraphInc_Populate_BuildStatus;

  static AppendFlattened(theGraph: BRepGraph, theShape: TopoDS_Shape, theParallel: boolean, theAppendedRoots: BRepGraph_NodeId[], theOptions: BRepGraphInc_Populate_Options): BRepGraphInc_Populate_BuildStatus;

  static Append(theGraph: BRepGraph, theShape: TopoDS_Shape, theParallel: boolean, theOptions?: BRepGraphInc_Populate_Options): BRepGraphInc_Populate_BuildStatus;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_Populate_BuildStatus: typeof BRepGraphInc_Populate_BuildStatus[keyof typeof BRepGraphInc_Populate_BuildStatus]

BRepGraphInc_Populate_Options: declare class BRepGraphInc_Populate_Options

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_Reconstruct: declare class BRepGraphInc_Reconstruct

  static Node(theGraph: BRepGraph, theNode: BRepGraph_NodeId): TopoDS_Shape;
  static Node(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theCache: BRepGraphInc_Reconstruct_Cache): TopoDS_Shape;
  static Node(theGraph: BRepGraph, theNode: BRepGraph_NodeId): TopoDS_Shape;
  static Node(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theCache: BRepGraphInc_Reconstruct_Cache): TopoDS_Shape;

  static FaceWithCache(theGraph: BRepGraph, theFaceId: BRepGraph_FaceId, theCache: BRepGraphInc_Reconstruct_Cache): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_Reconstruct_Cache: declare class BRepGraphInc_Reconstruct_Cache

  constructor

  myAllocator: NCollection_IncAllocator

  myTempAllocator: NCollection_IncAllocator

  myTempScopeDepth: number

  Seek(theNode: BRepGraph_NodeId): TopoDS_Shape;

  Bind(theNode: BRepGraph_NodeId, theShape: TopoDS_Shape): void;

  IsBound(theNode: BRepGraph_NodeId): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_Reconstruct_Cache_TempScope: interface BRepGraphInc_Reconstruct_Cache_TempScope

  myCache: BRepGraphInc_Reconstruct_Cache

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_BaseRef: declare class BRepGraphInc_BaseRef

  constructor

  UID: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_ChildRef: declare class BRepGraphInc_ChildRef extends BRepGraphInc_BaseRef

  constructor

  ParentCompoundId: BRepGraph_CompoundId

  ChildNodeId: BRepGraph_NodeId

  Orientation: BRepGraphInc_ParityOrientation

  LocalLocation: TopLoc_Location

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_FaceRef: declare class BRepGraphInc_FaceRef extends BRepGraphInc_BaseRef

  constructor

  ParentShellId: BRepGraph_ShellId

  ChildFaceId: BRepGraph_FaceId

  Orientation: BRepGraphInc_ParityOrientation

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_OccurrenceRef: declare class BRepGraphInc_OccurrenceRef extends BRepGraphInc_BaseRef

  constructor

  ParentProductId: BRepGraph_ProductId

  ChildOccurrenceId: BRepGraph_OccurrenceId

  LocalLocation: TopLoc_Location

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_ShellRef: declare class BRepGraphInc_ShellRef extends BRepGraphInc_BaseRef

  constructor

  ParentSolidId: BRepGraph_SolidId

  ChildShellId: BRepGraph_ShellId

  Orientation: BRepGraphInc_ParityOrientation

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_SolidRef: declare class BRepGraphInc_SolidRef extends BRepGraphInc_BaseRef

  constructor

  ParentCompSolidId: BRepGraph_CompSolidId

  ChildSolidId: BRepGraph_SolidId

  Orientation: BRepGraphInc_ParityOrientation

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_VertexRef: declare class BRepGraphInc_VertexRef extends BRepGraphInc_BaseRef

  constructor

  ChildVertexId: BRepGraph_VertexId

  ParentEdgeId: BRepGraph_EdgeId

  Orientation: BRepGraphInc_ParityOrientation

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_WireRef: declare class BRepGraphInc_WireRef extends BRepGraphInc_BaseRef

  constructor

  ParentFaceId: BRepGraph_FaceId

  ChildWireId: BRepGraph_WireId

  Orientation: BRepGraphInc_ParityOrientation

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_CompSolidRelations: declare class BRepGraphInc_CompSolidRelations

  constructor

  SolidRefIds: BRepGraph_SolidRefId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_CompoundRelations: declare class BRepGraphInc_CompoundRelations

  constructor

  ChildRefIds: BRepGraph_ChildRefId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_EdgeRelations: declare class BRepGraphInc_EdgeRelations

  constructor

  CoEdgeIds: BRepGraph_CoEdgeId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_FaceRelations: declare class BRepGraphInc_FaceRelations

  constructor

  WireRefIds: BRepGraph_WireRefId[]

  ParentFaceRefIds: BRepGraph_FaceRefId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_OccurrenceRelations: declare class BRepGraphInc_OccurrenceRelations

  constructor

  ParentOccurrenceRefIds: BRepGraph_OccurrenceRefId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_ProductRelations: declare class BRepGraphInc_ProductRelations

  constructor

  OccurrenceRefIds: BRepGraph_OccurrenceRefId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_ShellRelations: declare class BRepGraphInc_ShellRelations

  constructor

  FaceRefIds: BRepGraph_FaceRefId[]

  ParentShellRefIds: BRepGraph_ShellRefId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_SolidRelations: declare class BRepGraphInc_SolidRelations

  constructor

  ShellRefIds: BRepGraph_ShellRefId[]

  ParentSolidRefIds: BRepGraph_SolidRefId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_VertexRelations: declare class BRepGraphInc_VertexRelations

  constructor

  EdgeIds: BRepGraph_EdgeId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_WireRelations: declare class BRepGraphInc_WireRelations

  constructor

  CoEdgeIds: BRepGraph_CoEdgeId[]

  ParentWireRefIds: BRepGraph_WireRefId[]

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_CoEdgeCurve2DRep: declare class BRepGraphInc_CoEdgeCurve2DRep

  constructor

  ParentCoEdgeId: BRepGraph_CoEdgeId

  Curve: Geom2d_Curve

  ParamFirst: number

  ParamLast: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_CoEdgePolygon2DRep: declare class BRepGraphInc_CoEdgePolygon2DRep

  constructor

  ParentCoEdgeId: BRepGraph_CoEdgeId

  Polygon: Poly_Polygon2D

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_CoEdgePolygonOnTriRep: declare class BRepGraphInc_CoEdgePolygonOnTriRep

  constructor

  ParentCoEdgeId: BRepGraph_CoEdgeId

  Polygon: Poly_PolygonOnTriangulation

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_EdgeCurve3DRep: declare class BRepGraphInc_EdgeCurve3DRep

  constructor

  ParentEdgeId: BRepGraph_EdgeId

  Curve: Geom_Curve

  ParamFirst: number

  ParamLast: number

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_EdgePolygon3DRep: declare class BRepGraphInc_EdgePolygon3DRep

  constructor

  ParentEdgeId: BRepGraph_EdgeId

  Polygon: Poly_Polygon3D

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_FaceSurfaceRep: declare class BRepGraphInc_FaceSurfaceRep

  constructor

  ParentFaceId: BRepGraph_FaceId

  Surface: Geom_Surface

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_FaceTriangulationRep: declare class BRepGraphInc_FaceTriangulationRep

  constructor

  ParentFaceId: BRepGraph_FaceId

  Triangulation: Poly_Triangulation

  delete(): void;

  [Symbol.dispose](): void;
