# libcascade — BRepGraphInc

46 top-level symbols. Signatures are verbatim typescript.

BRepGraphInc_BitFlags: declare class BRepGraphInc_BitFlags

  // BRepGraphInc_BitFlags.constructor (constructor)
  constructor();

  // BRepGraphInc_BitFlags.Resize (method)
  Resize(theCount: number): void;

  // BRepGraphInc_BitFlags.Set (method)
  Set(theIndex: number): void;

  // BRepGraphInc_BitFlags.Clear (method)
  Clear(theIndex: number): void;

  // BRepGraphInc_BitFlags.Test (method)
  Test(theIndex: number): boolean;

  // BRepGraphInc_BitFlags.SetAll (method)
  SetAll(): void;

  // BRepGraphInc_BitFlags.ClearAll (method)
  ClearAll(): void;

  // BRepGraphInc_BitFlags.HasAnyBitSet (method)
  HasAnyBitSet(): boolean;

  // BRepGraphInc_BitFlags.NbBlocks (method)
  NbBlocks(): number;

  // BRepGraphInc_BitFlags.BitCount (method)
  BitCount(): number;

  // BRepGraphInc_BitFlags.IsValidIndex (method)
  IsValidIndex(theIndex: number): boolean;

  // BRepGraphInc_BitFlags.Blocks (method)
  Blocks(): number;

  // BRepGraphInc_BitFlags.delete (method)
  delete(): void;

  // BRepGraphInc_BitFlags.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_BaseDef: declare class BRepGraphInc_BaseDef

  // BRepGraphInc_BaseDef.constructor (constructor)
  constructor();

  UID: number

  OwnGen: number

  SubtreeGen: number

  LastPropWave: number

  // BRepGraphInc_BaseDef.delete (method)
  delete(): void;

  // BRepGraphInc_BaseDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_CoEdgeDef: declare class BRepGraphInc_CoEdgeDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_CoEdgeDef.constructor (constructor)
  constructor();

  ParentWireId: BRepGraph_WireId

  ChildEdgeId: BRepGraph_EdgeId

  FaceId: BRepGraph_FaceId

  Orientation: BRepGraphInc_ParityOrientation

  Curve2DRepId: BRepGraph_CoEdgeCurve2DRepId

  Polygon2DRepId: BRepGraph_CoEdgePolygon2DRepId

  PolygonOnTriRepId: BRepGraph_CoEdgePolygonOnTriRepId

  // BRepGraphInc_CoEdgeDef.delete (method)
  delete(): void;

  // BRepGraphInc_CoEdgeDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_CompSolidDef: declare class BRepGraphInc_CompSolidDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_CompSolidDef.constructor (constructor)
  constructor();

  // BRepGraphInc_CompSolidDef.delete (method)
  delete(): void;

  // BRepGraphInc_CompSolidDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_CompoundDef: declare class BRepGraphInc_CompoundDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_CompoundDef.constructor (constructor)
  constructor();

  // BRepGraphInc_CompoundDef.delete (method)
  delete(): void;

  // BRepGraphInc_CompoundDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_EdgeDef: declare class BRepGraphInc_EdgeDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_EdgeDef.constructor (constructor)
  constructor();

  Curve3DRepId: BRepGraph_EdgeCurve3DRepId

  Tolerance: number

  StartVertexRefId: BRepGraph_VertexRefId

  EndVertexRefId: BRepGraph_VertexRefId

  Polygon3DRepId: BRepGraph_EdgePolygon3DRepId

  // BRepGraphInc_EdgeDef.delete (method)
  delete(): void;

  // BRepGraphInc_EdgeDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_FaceDef: declare class BRepGraphInc_FaceDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_FaceDef.constructor (constructor)
  constructor();

  SurfaceRepId: BRepGraph_FaceSurfaceRepId

  TriangulationRepId: BRepGraph_FaceTriangulationRepId

  Tolerance: number

  // BRepGraphInc_FaceDef.delete (method)
  delete(): void;

  // BRepGraphInc_FaceDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_OccurrenceDef: declare class BRepGraphInc_OccurrenceDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_OccurrenceDef.constructor (constructor)
  constructor();

  ChildNodeId: BRepGraph_NodeId

  // BRepGraphInc_OccurrenceDef.delete (method)
  delete(): void;

  // BRepGraphInc_OccurrenceDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_ProductDef: declare class BRepGraphInc_ProductDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_ProductDef.constructor (constructor)
  constructor();

  // BRepGraphInc_ProductDef.delete (method)
  delete(): void;

  // BRepGraphInc_ProductDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_ShellDef: declare class BRepGraphInc_ShellDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_ShellDef.constructor (constructor)
  constructor();

  // BRepGraphInc_ShellDef.delete (method)
  delete(): void;

  // BRepGraphInc_ShellDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_SolidDef: declare class BRepGraphInc_SolidDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_SolidDef.constructor (constructor)
  constructor();

  // BRepGraphInc_SolidDef.delete (method)
  delete(): void;

  // BRepGraphInc_SolidDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_VertexDef: declare class BRepGraphInc_VertexDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_VertexDef.constructor (constructor)
  constructor();

  Point: gp_Pnt

  Tolerance: number

  // BRepGraphInc_VertexDef.delete (method)
  delete(): void;

  // BRepGraphInc_VertexDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_WireDef: declare class BRepGraphInc_WireDef extends BRepGraphInc_BaseDef

  // BRepGraphInc_WireDef.constructor (constructor)
  constructor();

  // BRepGraphInc_WireDef.delete (method)
  delete(): void;

  // BRepGraphInc_WireDef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_Load_Counts: declare class BRepGraphInc_Load_Counts

  // BRepGraphInc_Load_Counts.constructor (constructor)
  constructor();

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

  // BRepGraphInc_Load_Counts.delete (method)
  delete(): void;

  // BRepGraphInc_Load_Counts.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_ParityOrientation: declare class BRepGraphInc_ParityOrientation

  // BRepGraphInc_ParityOrientation.constructor (constructor)
  constructor();
  constructor(theOrientation: TopAbs_Orientation);

  IsReversed: boolean

  // BRepGraphInc_ParityOrientation.delete (method)
  delete(): void;

  // BRepGraphInc_ParityOrientation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_Populate: declare class BRepGraphInc_Populate

  // BRepGraphInc_Populate.Perform (method)
  static Perform(theGraph: BRepGraph, theShape: TopoDS_Shape, theParallel: boolean, theOptions?: BRepGraphInc_Populate_Options): BRepGraphInc_Populate_BuildStatus;

  // BRepGraphInc_Populate.AppendFlattened (method)
  static AppendFlattened(theGraph: BRepGraph, theShape: TopoDS_Shape, theParallel: boolean, theAppendedRoots: BRepGraph_NodeId[], theOptions: BRepGraphInc_Populate_Options): BRepGraphInc_Populate_BuildStatus;

  // BRepGraphInc_Populate.Append (method)
  static Append(theGraph: BRepGraph, theShape: TopoDS_Shape, theParallel: boolean, theOptions?: BRepGraphInc_Populate_Options): BRepGraphInc_Populate_BuildStatus;

  // BRepGraphInc_Populate.delete (method)
  delete(): void;

  // BRepGraphInc_Populate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_Populate_BuildStatus: typeof BRepGraphInc_Populate_BuildStatus[keyof typeof BRepGraphInc_Populate_BuildStatus]

  readonly Success: 'Success'

  readonly SuccessWithWarnings: 'SuccessWithWarnings'

  readonly Failed: 'Failed'

BRepGraphInc_Populate_Options: declare class BRepGraphInc_Populate_Options

  // BRepGraphInc_Populate_Options.constructor (constructor)
  constructor();

  // BRepGraphInc_Populate_Options.delete (method)
  delete(): void;

  // BRepGraphInc_Populate_Options.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_Reconstruct: declare class BRepGraphInc_Reconstruct

  // BRepGraphInc_Reconstruct.Node (method)
  static Node(theGraph: BRepGraph, theNode: BRepGraph_NodeId): TopoDS_Shape;
  static Node(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theCache: BRepGraphInc_Reconstruct_Cache): TopoDS_Shape;

  // BRepGraphInc_Reconstruct.FaceWithCache (method)
  static FaceWithCache(theGraph: BRepGraph, theFaceId: BRepGraph_FaceId, theCache: BRepGraphInc_Reconstruct_Cache): TopoDS_Shape;

  // BRepGraphInc_Reconstruct.delete (method)
  delete(): void;

  // BRepGraphInc_Reconstruct.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_Reconstruct_Cache: declare class BRepGraphInc_Reconstruct_Cache

  // BRepGraphInc_Reconstruct_Cache.constructor (constructor)
  constructor();

  myAllocator: NCollection_IncAllocator

  myTempAllocator: NCollection_IncAllocator

  myTempScopeDepth: number

  // BRepGraphInc_Reconstruct_Cache.Seek (method)
  Seek(theNode: BRepGraph_NodeId): TopoDS_Shape;

  // BRepGraphInc_Reconstruct_Cache.Bind (method)
  Bind(theNode: BRepGraph_NodeId, theShape: TopoDS_Shape): void;

  // BRepGraphInc_Reconstruct_Cache.IsBound (method)
  IsBound(theNode: BRepGraph_NodeId): boolean;

  // BRepGraphInc_Reconstruct_Cache.delete (method)
  delete(): void;

  // BRepGraphInc_Reconstruct_Cache.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_Reconstruct_Cache_TempScope: interface BRepGraphInc_Reconstruct_Cache_TempScope

  myCache: BRepGraphInc_Reconstruct_Cache

  // BRepGraphInc_Reconstruct_Cache_TempScope.constructor (constructor)
  constructor(theCache: BRepGraphInc_Reconstruct_Cache);

  // BRepGraphInc_Reconstruct_Cache_TempScope.delete (method)
  delete(): void;

  // BRepGraphInc_Reconstruct_Cache_TempScope.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_BaseRef: declare class BRepGraphInc_BaseRef

  // BRepGraphInc_BaseRef.constructor (constructor)
  constructor();

  UID: number

  // BRepGraphInc_BaseRef.delete (method)
  delete(): void;

  // BRepGraphInc_BaseRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_ChildRef: declare class BRepGraphInc_ChildRef extends BRepGraphInc_BaseRef

  // BRepGraphInc_ChildRef.constructor (constructor)
  constructor();

  ParentCompoundId: BRepGraph_CompoundId

  ChildNodeId: BRepGraph_NodeId

  Orientation: BRepGraphInc_ParityOrientation

  LocalLocation: TopLoc_Location

  // BRepGraphInc_ChildRef.delete (method)
  delete(): void;

  // BRepGraphInc_ChildRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_FaceRef: declare class BRepGraphInc_FaceRef extends BRepGraphInc_BaseRef

  // BRepGraphInc_FaceRef.constructor (constructor)
  constructor();

  ParentShellId: BRepGraph_ShellId

  ChildFaceId: BRepGraph_FaceId

  Orientation: BRepGraphInc_ParityOrientation

  // BRepGraphInc_FaceRef.delete (method)
  delete(): void;

  // BRepGraphInc_FaceRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_OccurrenceRef: declare class BRepGraphInc_OccurrenceRef extends BRepGraphInc_BaseRef

  // BRepGraphInc_OccurrenceRef.constructor (constructor)
  constructor();

  ParentProductId: BRepGraph_ProductId

  ChildOccurrenceId: BRepGraph_OccurrenceId

  LocalLocation: TopLoc_Location

  // BRepGraphInc_OccurrenceRef.delete (method)
  delete(): void;

  // BRepGraphInc_OccurrenceRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_ShellRef: declare class BRepGraphInc_ShellRef extends BRepGraphInc_BaseRef

  // BRepGraphInc_ShellRef.constructor (constructor)
  constructor();

  ParentSolidId: BRepGraph_SolidId

  ChildShellId: BRepGraph_ShellId

  Orientation: BRepGraphInc_ParityOrientation

  // BRepGraphInc_ShellRef.delete (method)
  delete(): void;

  // BRepGraphInc_ShellRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_SolidRef: declare class BRepGraphInc_SolidRef extends BRepGraphInc_BaseRef

  // BRepGraphInc_SolidRef.constructor (constructor)
  constructor();

  ParentCompSolidId: BRepGraph_CompSolidId

  ChildSolidId: BRepGraph_SolidId

  Orientation: BRepGraphInc_ParityOrientation

  // BRepGraphInc_SolidRef.delete (method)
  delete(): void;

  // BRepGraphInc_SolidRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_VertexRef: declare class BRepGraphInc_VertexRef extends BRepGraphInc_BaseRef

  // BRepGraphInc_VertexRef.constructor (constructor)
  constructor();

  ChildVertexId: BRepGraph_VertexId

  ParentEdgeId: BRepGraph_EdgeId

  Orientation: BRepGraphInc_ParityOrientation

  // BRepGraphInc_VertexRef.delete (method)
  delete(): void;

  // BRepGraphInc_VertexRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_WireRef: declare class BRepGraphInc_WireRef extends BRepGraphInc_BaseRef

  // BRepGraphInc_WireRef.constructor (constructor)
  constructor();

  ParentFaceId: BRepGraph_FaceId

  ChildWireId: BRepGraph_WireId

  Orientation: BRepGraphInc_ParityOrientation

  // BRepGraphInc_WireRef.delete (method)
  delete(): void;

  // BRepGraphInc_WireRef.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_CompSolidRelations: declare class BRepGraphInc_CompSolidRelations

  // BRepGraphInc_CompSolidRelations.constructor (constructor)
  constructor();

  SolidRefIds: BRepGraph_SolidRefId[]

  // BRepGraphInc_CompSolidRelations.delete (method)
  delete(): void;

  // BRepGraphInc_CompSolidRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_CompoundRelations: declare class BRepGraphInc_CompoundRelations

  // BRepGraphInc_CompoundRelations.constructor (constructor)
  constructor();

  ChildRefIds: BRepGraph_ChildRefId[]

  // BRepGraphInc_CompoundRelations.delete (method)
  delete(): void;

  // BRepGraphInc_CompoundRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_EdgeRelations: declare class BRepGraphInc_EdgeRelations

  // BRepGraphInc_EdgeRelations.constructor (constructor)
  constructor();

  CoEdgeIds: BRepGraph_CoEdgeId[]

  // BRepGraphInc_EdgeRelations.delete (method)
  delete(): void;

  // BRepGraphInc_EdgeRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_FaceRelations: declare class BRepGraphInc_FaceRelations

  // BRepGraphInc_FaceRelations.constructor (constructor)
  constructor();

  WireRefIds: BRepGraph_WireRefId[]

  ParentFaceRefIds: BRepGraph_FaceRefId[]

  // BRepGraphInc_FaceRelations.delete (method)
  delete(): void;

  // BRepGraphInc_FaceRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_OccurrenceRelations: declare class BRepGraphInc_OccurrenceRelations

  // BRepGraphInc_OccurrenceRelations.constructor (constructor)
  constructor();

  ParentOccurrenceRefIds: BRepGraph_OccurrenceRefId[]

  // BRepGraphInc_OccurrenceRelations.delete (method)
  delete(): void;

  // BRepGraphInc_OccurrenceRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_ProductRelations: declare class BRepGraphInc_ProductRelations

  // BRepGraphInc_ProductRelations.constructor (constructor)
  constructor();

  OccurrenceRefIds: BRepGraph_OccurrenceRefId[]

  // BRepGraphInc_ProductRelations.delete (method)
  delete(): void;

  // BRepGraphInc_ProductRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_ShellRelations: declare class BRepGraphInc_ShellRelations

  // BRepGraphInc_ShellRelations.constructor (constructor)
  constructor();

  FaceRefIds: BRepGraph_FaceRefId[]

  ParentShellRefIds: BRepGraph_ShellRefId[]

  // BRepGraphInc_ShellRelations.delete (method)
  delete(): void;

  // BRepGraphInc_ShellRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_SolidRelations: declare class BRepGraphInc_SolidRelations

  // BRepGraphInc_SolidRelations.constructor (constructor)
  constructor();

  ShellRefIds: BRepGraph_ShellRefId[]

  ParentSolidRefIds: BRepGraph_SolidRefId[]

  // BRepGraphInc_SolidRelations.delete (method)
  delete(): void;

  // BRepGraphInc_SolidRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_VertexRelations: declare class BRepGraphInc_VertexRelations

  // BRepGraphInc_VertexRelations.constructor (constructor)
  constructor();

  EdgeIds: BRepGraph_EdgeId[]

  // BRepGraphInc_VertexRelations.delete (method)
  delete(): void;

  // BRepGraphInc_VertexRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_WireRelations: declare class BRepGraphInc_WireRelations

  // BRepGraphInc_WireRelations.constructor (constructor)
  constructor();

  CoEdgeIds: BRepGraph_CoEdgeId[]

  ParentWireRefIds: BRepGraph_WireRefId[]

  // BRepGraphInc_WireRelations.delete (method)
  delete(): void;

  // BRepGraphInc_WireRelations.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_CoEdgeCurve2DRep: declare class BRepGraphInc_CoEdgeCurve2DRep

  // BRepGraphInc_CoEdgeCurve2DRep.constructor (constructor)
  constructor();

  ParentCoEdgeId: BRepGraph_CoEdgeId

  Curve: Geom2d_Curve

  ParamFirst: number

  ParamLast: number

  // BRepGraphInc_CoEdgeCurve2DRep.delete (method)
  delete(): void;

  // BRepGraphInc_CoEdgeCurve2DRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_CoEdgePolygon2DRep: declare class BRepGraphInc_CoEdgePolygon2DRep

  // BRepGraphInc_CoEdgePolygon2DRep.constructor (constructor)
  constructor();

  ParentCoEdgeId: BRepGraph_CoEdgeId

  Polygon: Poly_Polygon2D

  // BRepGraphInc_CoEdgePolygon2DRep.delete (method)
  delete(): void;

  // BRepGraphInc_CoEdgePolygon2DRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_CoEdgePolygonOnTriRep: declare class BRepGraphInc_CoEdgePolygonOnTriRep

  // BRepGraphInc_CoEdgePolygonOnTriRep.constructor (constructor)
  constructor();

  ParentCoEdgeId: BRepGraph_CoEdgeId

  Polygon: Poly_PolygonOnTriangulation

  // BRepGraphInc_CoEdgePolygonOnTriRep.delete (method)
  delete(): void;

  // BRepGraphInc_CoEdgePolygonOnTriRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_EdgeCurve3DRep: declare class BRepGraphInc_EdgeCurve3DRep

  // BRepGraphInc_EdgeCurve3DRep.constructor (constructor)
  constructor();

  ParentEdgeId: BRepGraph_EdgeId

  Curve: Geom_Curve

  ParamFirst: number

  ParamLast: number

  // BRepGraphInc_EdgeCurve3DRep.delete (method)
  delete(): void;

  // BRepGraphInc_EdgeCurve3DRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_EdgePolygon3DRep: declare class BRepGraphInc_EdgePolygon3DRep

  // BRepGraphInc_EdgePolygon3DRep.constructor (constructor)
  constructor();

  ParentEdgeId: BRepGraph_EdgeId

  Polygon: Poly_Polygon3D

  // BRepGraphInc_EdgePolygon3DRep.delete (method)
  delete(): void;

  // BRepGraphInc_EdgePolygon3DRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_FaceSurfaceRep: declare class BRepGraphInc_FaceSurfaceRep

  // BRepGraphInc_FaceSurfaceRep.constructor (constructor)
  constructor();

  ParentFaceId: BRepGraph_FaceId

  Surface: Geom_Surface

  // BRepGraphInc_FaceSurfaceRep.delete (method)
  delete(): void;

  // BRepGraphInc_FaceSurfaceRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_FaceTriangulationRep: declare class BRepGraphInc_FaceTriangulationRep

  // BRepGraphInc_FaceTriangulationRep.constructor (constructor)
  constructor();

  ParentFaceId: BRepGraph_FaceId

  Triangulation: Poly_Triangulation

  // BRepGraphInc_FaceTriangulationRep.delete (method)
  delete(): void;

  // BRepGraphInc_FaceTriangulationRep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
