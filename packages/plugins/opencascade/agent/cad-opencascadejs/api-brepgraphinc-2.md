# libcascade — BRepGraphInc (2)

3 top-level symbols. Signatures are verbatim typescript.

BRepGraphInc_Storage: declare class BRepGraphInc_Storage

  constructor

  Allocator(): NCollection_BaseAllocator;

  RootProductIds(): BRepGraph_ProductId[];

  ChangeRootProductIds(): BRepGraph_ProductId[];

  DeferredModified(): BRepGraph_NodeId[];

  ChangeDeferredModified(): BRepGraph_NodeId[];

  DeferredRefModified(): BRepGraph_RefId[];

  ChangeDeferredRefModified(): BRepGraph_RefId[];

  IsEmpty(): boolean;

  NextNodeUIDCounter(theKind: BRepGraph_NodeId_Kind): number;

  SetNextNodeUIDCounter(theKind: BRepGraph_NodeId_Kind, theCounter: number): void;

  NextRefUIDCounter(theKind: BRepGraph_RefId_Kind): number;

  SetNextRefUIDCounter(theKind: BRepGraph_RefId_Kind, theCounter: number): void;

  AllocateNodeUID(theNodeId: BRepGraph_NodeId): BRepGraph_UID;

  AllocateRefUID(theRefId: BRepGraph_RefId): BRepGraph_RefUID;

  Generation(): number;

  SetGeneration(theGeneration: number): void;

  IncrementGeneration(): void;

  GraphGUID(): Standard_GUID;

  SetGraphGUID(theGuid: Standard_GUID): void;

  DeferredMode(): boolean;

  SetDeferredMode(theEnabled: boolean): void;

  PropagationWave(): number;

  AdvancePropagationWave(): number;

  IncrementPropagationWave(): void;

  RemoveSubgraphDepth(): number;

  IncrementRemoveSubgraphDepth(): void;

  DecrementRemoveSubgraphDepth(): void;

  NbVertices(): number;

  NbEdges(): number;

  NbCoEdges(): number;

  NbWires(): number;

  NbFaces(): number;

  NbShells(): number;

  NbSolids(): number;

  NbCompounds(): number;

  NbCompSolids(): number;

  NbProducts(): number;

  NbOccurrences(): number;

  NbShellRefs(): number;

  NbFaceRefs(): number;

  NbWireRefs(): number;

  NbVertexRefs(): number;

  NbSolidRefs(): number;

  NbChildRefs(): number;

  NbOccurrenceRefs(): number;

  NbActiveVertices(): number;

  NbActiveEdges(): number;

  NbActiveCoEdges(): number;

  NbActiveWires(): number;

  NbActiveFaces(): number;

  NbActiveShells(): number;

  NbActiveSolids(): number;

  NbActiveCompounds(): number;

  NbActiveCompSolids(): number;

  NbActiveProducts(): number;

  NbActiveOccurrences(): number;

  NbActiveShellRefs(): number;

  NbActiveFaceRefs(): number;

  NbActiveWireRefs(): number;

  NbActiveVertexRefs(): number;

  NbActiveSolidRefs(): number;

  NbActiveChildRefs(): number;

  NbActiveOccurrenceRefs(): number;

  MarkRemoved(theNodeId: BRepGraph_NodeId): boolean;
  MarkRemoved(theRepId: BRepGraph_RepId): boolean;
  MarkRemoved(theNodeId: BRepGraph_NodeId): boolean;
  MarkRemoved(theRepId: BRepGraph_RepId): boolean;

  MarkRemovedRef(theRefId: BRepGraph_RefId): boolean;

  NbEdgeCurves3D(): number;

  NbEdgePolygons3D(): number;

  NbCoEdgeCurves2D(): number;

  NbCoEdgePolygons2D(): number;

  NbCoEdgePolygonsOnTri(): number;

  NbFaceSurfaces(): number;

  NbFaceTriangulations(): number;

  NbActiveEdgeCurves3D(): number;

  NbActiveCoEdgeCurves2D(): number;

  NbActiveFaceSurfaces(): number;

  NbActiveFaceTriangulations(): number;

  NbActiveEdgePolygons3D(): number;

  NbActiveCoEdgePolygons2D(): number;

  NbActiveCoEdgePolygonsOnTri(): number;

  EdgeCurve3DRep(theId: BRepGraph_EdgeCurve3DRepId): BRepGraphInc_EdgeCurve3DRep;

  ChangeEdgeCurve3DRep(theId: BRepGraph_EdgeCurve3DRepId): BRepGraphInc_EdgeCurve3DRep;

  EdgePolygon3DRep(theId: BRepGraph_EdgePolygon3DRepId): BRepGraphInc_EdgePolygon3DRep;

  ChangeEdgePolygon3DRep(theId: BRepGraph_EdgePolygon3DRepId): BRepGraphInc_EdgePolygon3DRep;

  CoEdgeCurve2DRep(theId: BRepGraph_CoEdgeCurve2DRepId): BRepGraphInc_CoEdgeCurve2DRep;

  ChangeCoEdgeCurve2DRep(theId: BRepGraph_CoEdgeCurve2DRepId): BRepGraphInc_CoEdgeCurve2DRep;

  CoEdgePolygon2DRep(theId: BRepGraph_CoEdgePolygon2DRepId): BRepGraphInc_CoEdgePolygon2DRep;

  ChangeCoEdgePolygon2DRep(theId: BRepGraph_CoEdgePolygon2DRepId): BRepGraphInc_CoEdgePolygon2DRep;

  CoEdgePolygonOnTriRep(theId: BRepGraph_CoEdgePolygonOnTriRepId): BRepGraphInc_CoEdgePolygonOnTriRep;

  ChangeCoEdgePolygonOnTriRep(theId: BRepGraph_CoEdgePolygonOnTriRepId): BRepGraphInc_CoEdgePolygonOnTriRep;

  FaceSurfaceRep(theId: BRepGraph_FaceSurfaceRepId): BRepGraphInc_FaceSurfaceRep;

  ChangeFaceSurfaceRep(theId: BRepGraph_FaceSurfaceRepId): BRepGraphInc_FaceSurfaceRep;

  FaceTriangulationRep(theId: BRepGraph_FaceTriangulationRepId): BRepGraphInc_FaceTriangulationRep;

  ChangeFaceTriangulationRep(theId: BRepGraph_FaceTriangulationRepId): BRepGraphInc_FaceTriangulationRep;

  AppendEdgeCurve3DRep(): BRepGraph_EdgeCurve3DRepId;

  AppendEdgePolygon3DRep(): BRepGraph_EdgePolygon3DRepId;

  AppendCoEdgeCurve2DRep(): BRepGraph_CoEdgeCurve2DRepId;

  AppendCoEdgePolygon2DRep(): BRepGraph_CoEdgePolygon2DRepId;

  AppendCoEdgePolygonOnTriRep(): BRepGraph_CoEdgePolygonOnTriRepId;

  AppendFaceSurfaceRep(): BRepGraph_FaceSurfaceRepId;

  AppendFaceTriangulationRep(): BRepGraph_FaceTriangulationRepId;

  SetRemoved(theRepId: BRepGraph_RepId, theVal: boolean): void;

  Vertex(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;

  Edge(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;

  CoEdge(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  Wire(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;

  Face(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;

  Shell(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;

  Solid(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;

  Compound(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;

  CompSolid(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;

  Product(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;

  Occurrence(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;

  ShellRef(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  FaceRef(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

  WireRef(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  VertexRef(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

  SolidRef(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  ChildRef(theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

  OccurrenceRef(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  ChangeVertex(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;

  ChangeEdge(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;

  ChangeCoEdge(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  ChangeWire(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;

  ChangeFace(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;

  ChangeShell(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;

  ChangeSolid(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;

  ChangeCompound(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;

  ChangeCompSolid(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;

  ChangeProduct(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;

  ChangeOccurrence(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;

  ChangeShellRef(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  ChangeFaceRef(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

  ChangeWireRef(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  ChangeVertexRef(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

  ChangeSolidRef(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  ChangeChildRef(theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

  ChangeOccurrenceRef(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  FaceRelations(theId: BRepGraph_FaceId): BRepGraphInc_FaceRelations;

  WireRelations(theId: BRepGraph_WireId): BRepGraphInc_WireRelations;

  EdgeRelations(theId: BRepGraph_EdgeId): BRepGraphInc_EdgeRelations;

  ShellRelations(theId: BRepGraph_ShellId): BRepGraphInc_ShellRelations;

  SolidRelations(theId: BRepGraph_SolidId): BRepGraphInc_SolidRelations;

  CompoundRelations(theId: BRepGraph_CompoundId): BRepGraphInc_CompoundRelations;

  CompSolidRelations(theId: BRepGraph_CompSolidId): BRepGraphInc_CompSolidRelations;

  VertexRelations(theId: BRepGraph_VertexId): BRepGraphInc_VertexRelations;

  ProductRelations(theId: BRepGraph_ProductId): BRepGraphInc_ProductRelations;

  OccurrenceRelations(theId: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceRelations;

  CompoundRefsOfNode(theNode: BRepGraph_NodeId): BRepGraph_ChildRefId[];

  OccurrenceRefsOfNode(theNode: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];

  AppendVertex(): BRepGraph_VertexId;

  AppendEdge(): BRepGraph_EdgeId;

  AppendCoEdge(): BRepGraph_CoEdgeId;

  AppendWire(): BRepGraph_WireId;

  AppendFace(): BRepGraph_FaceId;

  AppendShell(): BRepGraph_ShellId;

  AppendSolid(): BRepGraph_SolidId;

  AppendCompound(): BRepGraph_CompoundId;

  AppendCompSolid(): BRepGraph_CompSolidId;

  AppendProduct(): BRepGraph_ProductId;

  AppendOccurrence(): BRepGraph_OccurrenceId;

  AppendShellRef(): BRepGraph_ShellRefId;

  AppendFaceRef(): BRepGraph_FaceRefId;

  AppendWireRef(): BRepGraph_WireRefId;

  AppendVertexRef(): BRepGraph_VertexRefId;

  AppendSolidRef(): BRepGraph_SolidRefId;

  AppendChildRef(): BRepGraph_ChildRefId;

  AppendOccurrenceRef(): BRepGraph_OccurrenceRefId;

  CreateCoEdgeUse(theParentWireId: BRepGraph_WireId, theChildEdgeId: BRepGraph_EdgeId, theFaceId: BRepGraph_FaceId, theOrientation: BRepGraphInc_ParityOrientation): BRepGraph_CoEdgeId;

  AttachEdgeToVertex(theEdgeId: BRepGraph_EdgeId, theVertexId: BRepGraph_VertexId): void;

  AttachWireToFace(theParentFaceId: BRepGraph_FaceId, theChildWireId: BRepGraph_WireId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_WireRefId;

  AttachFaceToShell(theParentShellId: BRepGraph_ShellId, theChildFaceId: BRepGraph_FaceId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_FaceRefId;

  AttachShellToSolid(theParentSolidId: BRepGraph_SolidId, theChildShellId: BRepGraph_ShellId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_ShellRefId;

  AttachSolidToCompSolid(theParentCompSolidId: BRepGraph_CompSolidId, theChildSolidId: BRepGraph_SolidId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_SolidRefId;

  AttachChildToCompound(theParentCompoundId: BRepGraph_CompoundId, theChildNodeId: BRepGraph_NodeId, theLocation?: TopLoc_Location, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_ChildRefId;

  AttachOccurrenceToProduct(theParentProductId: BRepGraph_ProductId, theChildOccurrenceId: BRepGraph_OccurrenceId, theLocation?: TopLoc_Location): BRepGraph_OccurrenceRefId;

  DetachCoEdgeUse(theParentWireId: BRepGraph_WireId, theCoEdgeId: BRepGraph_CoEdgeId): boolean;

  ReplaceCoEdgeUseWithPair(theParentWireId: BRepGraph_WireId, theOldCoEdgeId: BRepGraph_CoEdgeId, theNewFirstCoEdgeId: BRepGraph_CoEdgeId, theNewSecondCoEdgeId: BRepGraph_CoEdgeId): boolean;

  DetachWireFromFace(theParentFaceId: BRepGraph_FaceId, theRefId: BRepGraph_WireRefId): boolean;

  DetachFaceFromShell(theParentShellId: BRepGraph_ShellId, theRefId: BRepGraph_FaceRefId): boolean;

  DetachShellFromSolid(theParentSolidId: BRepGraph_SolidId, theRefId: BRepGraph_ShellRefId): boolean;

  DetachSolidFromCompSolid(theParentCompSolidId: BRepGraph_CompSolidId, theRefId: BRepGraph_SolidRefId): boolean;

  DetachChildFromCompound(theParentCompoundId: BRepGraph_CompoundId, theRefId: BRepGraph_ChildRefId): boolean;

  DetachOccurrenceFromProduct(theParentProductId: BRepGraph_ProductId, theRefId: BRepGraph_OccurrenceRefId): boolean;

  RebindOccurrenceChild(theOccurrence: BRepGraph_OccurrenceId, theOldChild: BRepGraph_NodeId, theNewChild: BRepGraph_NodeId): void;

  RebindVertexEdge(theOldVertex: BRepGraph_VertexId, theNewVertex: BRepGraph_VertexId, theEdge: BRepGraph_EdgeId, theExcludingRef: BRepGraph_VertexRefId): void;

  RebindVertexRef(theRefId: BRepGraph_VertexRefId, theOldVertex: BRepGraph_VertexId, theNewVertex: BRepGraph_VertexId): void;

  RebindCoEdgeEdge(theCoEdge: BRepGraph_CoEdgeId, theOldEdge: BRepGraph_EdgeId, theNewEdge: BRepGraph_EdgeId): void;

  RebindWireRef(theRefId: BRepGraph_WireRefId, theOldWire: BRepGraph_WireId, theNewWire: BRepGraph_WireId): void;

  RebindFaceRef(theRefId: BRepGraph_FaceRefId, theOldFace: BRepGraph_FaceId, theNewFace: BRepGraph_FaceId): void;

  RebindShellRef(theRefId: BRepGraph_ShellRefId, theOldShell: BRepGraph_ShellId, theNewShell: BRepGraph_ShellId): void;

  RebindSolidRef(theRefId: BRepGraph_SolidRefId, theOldSolid: BRepGraph_SolidId, theNewSolid: BRepGraph_SolidId): void;

  RebindChildRef(theRefId: BRepGraph_ChildRefId, theOldChild: BRepGraph_NodeId, theNewChild: BRepGraph_NodeId): void;

  RebindOccurrenceRef(theRefId: BRepGraph_OccurrenceRefId, theOldOccurrence: BRepGraph_OccurrenceId, theNewOccurrence: BRepGraph_OccurrenceId): void;

  ReverseWireCoEdges(theWireId: BRepGraph_WireId): void;

  SetWireCoEdges(theWireId: BRepGraph_WireId, theCoEdgeIds: NCollection_Array1_BRepGraph_CoEdgeId): void;

  SetFaceWireRefs(theFaceId: BRepGraph_FaceId, theWireRefIds: NCollection_Array1_BRepGraph_WireRefId): void;

  SetShellFaceRefs(theShellId: BRepGraph_ShellId, theFaceRefIds: NCollection_Array1_BRepGraph_FaceRefId): void;

  SetSolidShellRefs(theSolidId: BRepGraph_SolidId, theShellRefIds: NCollection_Array1_BRepGraph_ShellRefId): void;

  SetCompSolidSolidRefs(theCompSolidId: BRepGraph_CompSolidId, theSolidRefIds: NCollection_Array1_BRepGraph_SolidRefId): void;

  SetCompoundChildRefs(theCompoundId: BRepGraph_CompoundId, theChildRefIds: NCollection_Array1_BRepGraph_ChildRefId): void;

  SetProductOccurrenceRefs(theProductId: BRepGraph_ProductId, theOccurrenceRefIds: NCollection_Array1_BRepGraph_OccurrenceRefId): void;

  BaseRef(theRefId: BRepGraph_RefId): BRepGraphInc_BaseRef;

  ChangeBaseRef(theRefId: BRepGraph_RefId): BRepGraphInc_BaseRef;

  FindNodeIdByUID(theUID: BRepGraph_UID): BRepGraph_NodeId;

  FindRefIdByUID(theUID: BRepGraph_RefUID): BRepGraph_RefId;

  FindDefinitionByShape(theShape: TopoDS_Shape): BRepGraph_NodeId;

  HasShapeBinding(theShape: TopoDS_Shape): boolean;

  SetDefinitionShapeBinding(theShape: TopoDS_Shape, theNodeId: BRepGraph_NodeId): void;

  RemoveDefinitionShapeBinding(theShape: TopoDS_Shape, theExpectedNodeId: BRepGraph_NodeId): boolean;

  FindOriginal(theNodeId: BRepGraph_NodeId): TopoDS_Shape;

  HasOriginal(theNodeId: BRepGraph_NodeId): boolean;

  BindOriginal(theNodeId: BRepGraph_NodeId, theShape: TopoDS_Shape): void;

  UnBindOriginal(theNodeId: BRepGraph_NodeId): void;

  CopyShapeBindingsFrom(theSource: BRepGraphInc_Storage): void;

  CurrentShapes(): any;

  ChangeCurrentShapes(): any;

  CurrentShapesMutex(): unknown;

  ClearCurrentShapes(): void;

  UnbindCurrentShape(theNode: BRepGraph_NodeId): void;

  ClearDeferredQueues(): void;

  Clear(): void;

  PrepareForLoad(theCounts: BRepGraphInc_Load_Counts): void;

  SetActiveCounts(theCounts: BRepGraphInc_Load_Counts): void;

  Counts(): BRepGraphInc_Load_Counts;

  ActiveCounts(): BRepGraphInc_Load_Counts;

  RecountActiveCounts(): void;

  RebuildDerivedRelations(): void;

  RebuildDerivedRelationsPreservingActiveCounts(): void;

  CopyRemovedFlagsFrom(theSource: BRepGraphInc_Storage): void;

  ValidateRelations(): boolean;

  ValidateWireCoEdgeOrder(theWireId: BRepGraph_WireId): boolean;

  ValidateWireCoEdgeOrders(): boolean;

  CanonicalizeWireCoEdgeOrderStatus(theWireId: BRepGraph_WireId): BRepGraphInc_Storage_WireCoEdgeOrderStatus;

  CanonicalizeWireCoEdgeOrder(theWireId: BRepGraph_WireId): boolean;

  RebuildUIDReverseIndexes(): void;

  MarkUIDReverseIndexesDirty(): void;

  EnsureUIDReverseIndex(): void;

  EnsureRefUIDReverseIndex(): void;

  CopyDerivedRelationsFrom(theSource: BRepGraphInc_Storage): void;

  HasCompoundParent(theNode: BRepGraph_NodeId): boolean;

  HasOccurrenceParent(theNode: BRepGraph_NodeId): boolean;

  IsGuarded(theId: BRepGraph_ItemId): boolean;

  SetGuarded(theId: BRepGraph_ItemId): void;

  ClearGuarded(theId: BRepGraph_ItemId): void;

  HasAnyGuard(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraphInc_Storage_WireCoEdgeOrderStatus: typeof BRepGraphInc_Storage_WireCoEdgeOrderStatus[keyof typeof BRepGraphInc_Storage_WireCoEdgeOrderStatus]

BRepGraphInc_Storage_CachedShape: interface BRepGraphInc_Storage_CachedShape

  Shape: TopoDS_Shape

  StoredSubtreeGen: number
