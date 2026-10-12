# libcascade — BRepGraphInc (2)

3 top-level symbols. Signatures are verbatim typescript.

BRepGraphInc_Storage: declare class BRepGraphInc_Storage

  // BRepGraphInc_Storage.constructor (constructor)
  constructor();

  // BRepGraphInc_Storage.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // BRepGraphInc_Storage.RootProductIds (method)
  RootProductIds(): BRepGraph_ProductId[];

  // BRepGraphInc_Storage.ChangeRootProductIds (method)
  ChangeRootProductIds(): BRepGraph_ProductId[];

  // BRepGraphInc_Storage.DeferredModified (method)
  DeferredModified(): BRepGraph_NodeId[];

  // BRepGraphInc_Storage.ChangeDeferredModified (method)
  ChangeDeferredModified(): BRepGraph_NodeId[];

  // BRepGraphInc_Storage.DeferredRefModified (method)
  DeferredRefModified(): BRepGraph_RefId[];

  // BRepGraphInc_Storage.ChangeDeferredRefModified (method)
  ChangeDeferredRefModified(): BRepGraph_RefId[];

  // BRepGraphInc_Storage.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepGraphInc_Storage.NextNodeUIDCounter (method)
  NextNodeUIDCounter(theKind: BRepGraph_NodeId_Kind): number;

  // BRepGraphInc_Storage.SetNextNodeUIDCounter (method)
  SetNextNodeUIDCounter(theKind: BRepGraph_NodeId_Kind, theCounter: number): void;

  // BRepGraphInc_Storage.NextRefUIDCounter (method)
  NextRefUIDCounter(theKind: BRepGraph_RefId_Kind): number;

  // BRepGraphInc_Storage.SetNextRefUIDCounter (method)
  SetNextRefUIDCounter(theKind: BRepGraph_RefId_Kind, theCounter: number): void;

  // BRepGraphInc_Storage.AllocateNodeUID (method)
  AllocateNodeUID(theNodeId: BRepGraph_NodeId): BRepGraph_UID;

  // BRepGraphInc_Storage.AllocateRefUID (method)
  AllocateRefUID(theRefId: BRepGraph_RefId): BRepGraph_RefUID;

  // BRepGraphInc_Storage.Generation (method)
  Generation(): number;

  // BRepGraphInc_Storage.SetGeneration (method)
  SetGeneration(theGeneration: number): void;

  // BRepGraphInc_Storage.IncrementGeneration (method)
  IncrementGeneration(): void;

  // BRepGraphInc_Storage.GraphGUID (method)
  GraphGUID(): Standard_GUID;

  // BRepGraphInc_Storage.SetGraphGUID (method)
  SetGraphGUID(theGuid: Standard_GUID): void;

  // BRepGraphInc_Storage.DeferredMode (method)
  DeferredMode(): boolean;

  // BRepGraphInc_Storage.SetDeferredMode (method)
  SetDeferredMode(theEnabled: boolean): void;

  // BRepGraphInc_Storage.PropagationWave (method)
  PropagationWave(): number;

  // BRepGraphInc_Storage.AdvancePropagationWave (method)
  AdvancePropagationWave(): number;

  // BRepGraphInc_Storage.IncrementPropagationWave (method)
  IncrementPropagationWave(): void;

  // BRepGraphInc_Storage.RemoveSubgraphDepth (method)
  RemoveSubgraphDepth(): number;

  // BRepGraphInc_Storage.IncrementRemoveSubgraphDepth (method)
  IncrementRemoveSubgraphDepth(): void;

  // BRepGraphInc_Storage.DecrementRemoveSubgraphDepth (method)
  DecrementRemoveSubgraphDepth(): void;

  // BRepGraphInc_Storage.NbVertices (method)
  NbVertices(): number;

  // BRepGraphInc_Storage.NbEdges (method)
  NbEdges(): number;

  // BRepGraphInc_Storage.NbCoEdges (method)
  NbCoEdges(): number;

  // BRepGraphInc_Storage.NbWires (method)
  NbWires(): number;

  // BRepGraphInc_Storage.NbFaces (method)
  NbFaces(): number;

  // BRepGraphInc_Storage.NbShells (method)
  NbShells(): number;

  // BRepGraphInc_Storage.NbSolids (method)
  NbSolids(): number;

  // BRepGraphInc_Storage.NbCompounds (method)
  NbCompounds(): number;

  // BRepGraphInc_Storage.NbCompSolids (method)
  NbCompSolids(): number;

  // BRepGraphInc_Storage.NbProducts (method)
  NbProducts(): number;

  // BRepGraphInc_Storage.NbOccurrences (method)
  NbOccurrences(): number;

  // BRepGraphInc_Storage.NbShellRefs (method)
  NbShellRefs(): number;

  // BRepGraphInc_Storage.NbFaceRefs (method)
  NbFaceRefs(): number;

  // BRepGraphInc_Storage.NbWireRefs (method)
  NbWireRefs(): number;

  // BRepGraphInc_Storage.NbVertexRefs (method)
  NbVertexRefs(): number;

  // BRepGraphInc_Storage.NbSolidRefs (method)
  NbSolidRefs(): number;

  // BRepGraphInc_Storage.NbChildRefs (method)
  NbChildRefs(): number;

  // BRepGraphInc_Storage.NbOccurrenceRefs (method)
  NbOccurrenceRefs(): number;

  // BRepGraphInc_Storage.NbActiveVertices (method)
  NbActiveVertices(): number;

  // BRepGraphInc_Storage.NbActiveEdges (method)
  NbActiveEdges(): number;

  // BRepGraphInc_Storage.NbActiveCoEdges (method)
  NbActiveCoEdges(): number;

  // BRepGraphInc_Storage.NbActiveWires (method)
  NbActiveWires(): number;

  // BRepGraphInc_Storage.NbActiveFaces (method)
  NbActiveFaces(): number;

  // BRepGraphInc_Storage.NbActiveShells (method)
  NbActiveShells(): number;

  // BRepGraphInc_Storage.NbActiveSolids (method)
  NbActiveSolids(): number;

  // BRepGraphInc_Storage.NbActiveCompounds (method)
  NbActiveCompounds(): number;

  // BRepGraphInc_Storage.NbActiveCompSolids (method)
  NbActiveCompSolids(): number;

  // BRepGraphInc_Storage.NbActiveProducts (method)
  NbActiveProducts(): number;

  // BRepGraphInc_Storage.NbActiveOccurrences (method)
  NbActiveOccurrences(): number;

  // BRepGraphInc_Storage.NbActiveShellRefs (method)
  NbActiveShellRefs(): number;

  // BRepGraphInc_Storage.NbActiveFaceRefs (method)
  NbActiveFaceRefs(): number;

  // BRepGraphInc_Storage.NbActiveWireRefs (method)
  NbActiveWireRefs(): number;

  // BRepGraphInc_Storage.NbActiveVertexRefs (method)
  NbActiveVertexRefs(): number;

  // BRepGraphInc_Storage.NbActiveSolidRefs (method)
  NbActiveSolidRefs(): number;

  // BRepGraphInc_Storage.NbActiveChildRefs (method)
  NbActiveChildRefs(): number;

  // BRepGraphInc_Storage.NbActiveOccurrenceRefs (method)
  NbActiveOccurrenceRefs(): number;

  // BRepGraphInc_Storage.MarkRemoved (method)
  MarkRemoved(theNodeId: BRepGraph_NodeId): boolean;
  MarkRemoved(theRepId: BRepGraph_RepId): boolean;

  // BRepGraphInc_Storage.MarkRemovedRef (method)
  MarkRemovedRef(theRefId: BRepGraph_RefId): boolean;

  // BRepGraphInc_Storage.NbEdgeCurves3D (method)
  NbEdgeCurves3D(): number;

  // BRepGraphInc_Storage.NbEdgePolygons3D (method)
  NbEdgePolygons3D(): number;

  // BRepGraphInc_Storage.NbCoEdgeCurves2D (method)
  NbCoEdgeCurves2D(): number;

  // BRepGraphInc_Storage.NbCoEdgePolygons2D (method)
  NbCoEdgePolygons2D(): number;

  // BRepGraphInc_Storage.NbCoEdgePolygonsOnTri (method)
  NbCoEdgePolygonsOnTri(): number;

  // BRepGraphInc_Storage.NbFaceSurfaces (method)
  NbFaceSurfaces(): number;

  // BRepGraphInc_Storage.NbFaceTriangulations (method)
  NbFaceTriangulations(): number;

  // BRepGraphInc_Storage.NbActiveEdgeCurves3D (method)
  NbActiveEdgeCurves3D(): number;

  // BRepGraphInc_Storage.NbActiveCoEdgeCurves2D (method)
  NbActiveCoEdgeCurves2D(): number;

  // BRepGraphInc_Storage.NbActiveFaceSurfaces (method)
  NbActiveFaceSurfaces(): number;

  // BRepGraphInc_Storage.NbActiveFaceTriangulations (method)
  NbActiveFaceTriangulations(): number;

  // BRepGraphInc_Storage.NbActiveEdgePolygons3D (method)
  NbActiveEdgePolygons3D(): number;

  // BRepGraphInc_Storage.NbActiveCoEdgePolygons2D (method)
  NbActiveCoEdgePolygons2D(): number;

  // BRepGraphInc_Storage.NbActiveCoEdgePolygonsOnTri (method)
  NbActiveCoEdgePolygonsOnTri(): number;

  // BRepGraphInc_Storage.EdgeCurve3DRep (method)
  EdgeCurve3DRep(theId: BRepGraph_EdgeCurve3DRepId): BRepGraphInc_EdgeCurve3DRep;

  // BRepGraphInc_Storage.ChangeEdgeCurve3DRep (method)
  ChangeEdgeCurve3DRep(theId: BRepGraph_EdgeCurve3DRepId): BRepGraphInc_EdgeCurve3DRep;

  // BRepGraphInc_Storage.EdgePolygon3DRep (method)
  EdgePolygon3DRep(theId: BRepGraph_EdgePolygon3DRepId): BRepGraphInc_EdgePolygon3DRep;

  // BRepGraphInc_Storage.ChangeEdgePolygon3DRep (method)
  ChangeEdgePolygon3DRep(theId: BRepGraph_EdgePolygon3DRepId): BRepGraphInc_EdgePolygon3DRep;

  // BRepGraphInc_Storage.CoEdgeCurve2DRep (method)
  CoEdgeCurve2DRep(theId: BRepGraph_CoEdgeCurve2DRepId): BRepGraphInc_CoEdgeCurve2DRep;

  // BRepGraphInc_Storage.ChangeCoEdgeCurve2DRep (method)
  ChangeCoEdgeCurve2DRep(theId: BRepGraph_CoEdgeCurve2DRepId): BRepGraphInc_CoEdgeCurve2DRep;

  // BRepGraphInc_Storage.CoEdgePolygon2DRep (method)
  CoEdgePolygon2DRep(theId: BRepGraph_CoEdgePolygon2DRepId): BRepGraphInc_CoEdgePolygon2DRep;

  // BRepGraphInc_Storage.ChangeCoEdgePolygon2DRep (method)
  ChangeCoEdgePolygon2DRep(theId: BRepGraph_CoEdgePolygon2DRepId): BRepGraphInc_CoEdgePolygon2DRep;

  // BRepGraphInc_Storage.CoEdgePolygonOnTriRep (method)
  CoEdgePolygonOnTriRep(theId: BRepGraph_CoEdgePolygonOnTriRepId): BRepGraphInc_CoEdgePolygonOnTriRep;

  // BRepGraphInc_Storage.ChangeCoEdgePolygonOnTriRep (method)
  ChangeCoEdgePolygonOnTriRep(theId: BRepGraph_CoEdgePolygonOnTriRepId): BRepGraphInc_CoEdgePolygonOnTriRep;

  // BRepGraphInc_Storage.FaceSurfaceRep (method)
  FaceSurfaceRep(theId: BRepGraph_FaceSurfaceRepId): BRepGraphInc_FaceSurfaceRep;

  // BRepGraphInc_Storage.ChangeFaceSurfaceRep (method)
  ChangeFaceSurfaceRep(theId: BRepGraph_FaceSurfaceRepId): BRepGraphInc_FaceSurfaceRep;

  // BRepGraphInc_Storage.FaceTriangulationRep (method)
  FaceTriangulationRep(theId: BRepGraph_FaceTriangulationRepId): BRepGraphInc_FaceTriangulationRep;

  // BRepGraphInc_Storage.ChangeFaceTriangulationRep (method)
  ChangeFaceTriangulationRep(theId: BRepGraph_FaceTriangulationRepId): BRepGraphInc_FaceTriangulationRep;

  // BRepGraphInc_Storage.AppendEdgeCurve3DRep (method)
  AppendEdgeCurve3DRep(): BRepGraph_EdgeCurve3DRepId;

  // BRepGraphInc_Storage.AppendEdgePolygon3DRep (method)
  AppendEdgePolygon3DRep(): BRepGraph_EdgePolygon3DRepId;

  // BRepGraphInc_Storage.AppendCoEdgeCurve2DRep (method)
  AppendCoEdgeCurve2DRep(): BRepGraph_CoEdgeCurve2DRepId;

  // BRepGraphInc_Storage.AppendCoEdgePolygon2DRep (method)
  AppendCoEdgePolygon2DRep(): BRepGraph_CoEdgePolygon2DRepId;

  // BRepGraphInc_Storage.AppendCoEdgePolygonOnTriRep (method)
  AppendCoEdgePolygonOnTriRep(): BRepGraph_CoEdgePolygonOnTriRepId;

  // BRepGraphInc_Storage.AppendFaceSurfaceRep (method)
  AppendFaceSurfaceRep(): BRepGraph_FaceSurfaceRepId;

  // BRepGraphInc_Storage.AppendFaceTriangulationRep (method)
  AppendFaceTriangulationRep(): BRepGraph_FaceTriangulationRepId;

  // BRepGraphInc_Storage.SetRemoved (method)
  SetRemoved(theRepId: BRepGraph_RepId, theVal: boolean): void;

  // BRepGraphInc_Storage.Vertex (method)
  Vertex(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;

  // BRepGraphInc_Storage.Edge (method)
  Edge(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;

  // BRepGraphInc_Storage.CoEdge (method)
  CoEdge(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  // BRepGraphInc_Storage.Wire (method)
  Wire(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;

  // BRepGraphInc_Storage.Face (method)
  Face(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;

  // BRepGraphInc_Storage.Shell (method)
  Shell(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;

  // BRepGraphInc_Storage.Solid (method)
  Solid(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;

  // BRepGraphInc_Storage.Compound (method)
  Compound(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;

  // BRepGraphInc_Storage.CompSolid (method)
  CompSolid(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;

  // BRepGraphInc_Storage.Product (method)
  Product(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;

  // BRepGraphInc_Storage.Occurrence (method)
  Occurrence(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;

  // BRepGraphInc_Storage.ShellRef (method)
  ShellRef(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  // BRepGraphInc_Storage.FaceRef (method)
  FaceRef(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

  // BRepGraphInc_Storage.WireRef (method)
  WireRef(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  // BRepGraphInc_Storage.VertexRef (method)
  VertexRef(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

  // BRepGraphInc_Storage.SolidRef (method)
  SolidRef(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  // BRepGraphInc_Storage.ChildRef (method)
  ChildRef(theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

  // BRepGraphInc_Storage.OccurrenceRef (method)
  OccurrenceRef(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  // BRepGraphInc_Storage.ChangeVertex (method)
  ChangeVertex(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;

  // BRepGraphInc_Storage.ChangeEdge (method)
  ChangeEdge(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;

  // BRepGraphInc_Storage.ChangeCoEdge (method)
  ChangeCoEdge(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  // BRepGraphInc_Storage.ChangeWire (method)
  ChangeWire(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;

  // BRepGraphInc_Storage.ChangeFace (method)
  ChangeFace(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;

  // BRepGraphInc_Storage.ChangeShell (method)
  ChangeShell(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;

  // BRepGraphInc_Storage.ChangeSolid (method)
  ChangeSolid(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;

  // BRepGraphInc_Storage.ChangeCompound (method)
  ChangeCompound(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;

  // BRepGraphInc_Storage.ChangeCompSolid (method)
  ChangeCompSolid(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;

  // BRepGraphInc_Storage.ChangeProduct (method)
  ChangeProduct(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;

  // BRepGraphInc_Storage.ChangeOccurrence (method)
  ChangeOccurrence(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;

  // BRepGraphInc_Storage.ChangeShellRef (method)
  ChangeShellRef(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  // BRepGraphInc_Storage.ChangeFaceRef (method)
  ChangeFaceRef(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

  // BRepGraphInc_Storage.ChangeWireRef (method)
  ChangeWireRef(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  // BRepGraphInc_Storage.ChangeVertexRef (method)
  ChangeVertexRef(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

  // BRepGraphInc_Storage.ChangeSolidRef (method)
  ChangeSolidRef(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  // BRepGraphInc_Storage.ChangeChildRef (method)
  ChangeChildRef(theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

  // BRepGraphInc_Storage.ChangeOccurrenceRef (method)
  ChangeOccurrenceRef(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  // BRepGraphInc_Storage.FaceRelations (method)
  FaceRelations(theId: BRepGraph_FaceId): BRepGraphInc_FaceRelations;

  // BRepGraphInc_Storage.WireRelations (method)
  WireRelations(theId: BRepGraph_WireId): BRepGraphInc_WireRelations;

  // BRepGraphInc_Storage.EdgeRelations (method)
  EdgeRelations(theId: BRepGraph_EdgeId): BRepGraphInc_EdgeRelations;

  // BRepGraphInc_Storage.ShellRelations (method)
  ShellRelations(theId: BRepGraph_ShellId): BRepGraphInc_ShellRelations;

  // BRepGraphInc_Storage.SolidRelations (method)
  SolidRelations(theId: BRepGraph_SolidId): BRepGraphInc_SolidRelations;

  // BRepGraphInc_Storage.CompoundRelations (method)
  CompoundRelations(theId: BRepGraph_CompoundId): BRepGraphInc_CompoundRelations;

  // BRepGraphInc_Storage.CompSolidRelations (method)
  CompSolidRelations(theId: BRepGraph_CompSolidId): BRepGraphInc_CompSolidRelations;

  // BRepGraphInc_Storage.VertexRelations (method)
  VertexRelations(theId: BRepGraph_VertexId): BRepGraphInc_VertexRelations;

  // BRepGraphInc_Storage.ProductRelations (method)
  ProductRelations(theId: BRepGraph_ProductId): BRepGraphInc_ProductRelations;

  // BRepGraphInc_Storage.OccurrenceRelations (method)
  OccurrenceRelations(theId: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceRelations;

  // BRepGraphInc_Storage.CompoundRefsOfNode (method)
  CompoundRefsOfNode(theNode: BRepGraph_NodeId): BRepGraph_ChildRefId[];

  // BRepGraphInc_Storage.OccurrenceRefsOfNode (method)
  OccurrenceRefsOfNode(theNode: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];

  // BRepGraphInc_Storage.AppendVertex (method)
  AppendVertex(): BRepGraph_VertexId;

  // BRepGraphInc_Storage.AppendEdge (method)
  AppendEdge(): BRepGraph_EdgeId;

  // BRepGraphInc_Storage.AppendCoEdge (method)
  AppendCoEdge(): BRepGraph_CoEdgeId;

  // BRepGraphInc_Storage.AppendWire (method)
  AppendWire(): BRepGraph_WireId;

  // BRepGraphInc_Storage.AppendFace (method)
  AppendFace(): BRepGraph_FaceId;

  // BRepGraphInc_Storage.AppendShell (method)
  AppendShell(): BRepGraph_ShellId;

  // BRepGraphInc_Storage.AppendSolid (method)
  AppendSolid(): BRepGraph_SolidId;

  // BRepGraphInc_Storage.AppendCompound (method)
  AppendCompound(): BRepGraph_CompoundId;

  // BRepGraphInc_Storage.AppendCompSolid (method)
  AppendCompSolid(): BRepGraph_CompSolidId;

  // BRepGraphInc_Storage.AppendProduct (method)
  AppendProduct(): BRepGraph_ProductId;

  // BRepGraphInc_Storage.AppendOccurrence (method)
  AppendOccurrence(): BRepGraph_OccurrenceId;

  // BRepGraphInc_Storage.AppendShellRef (method)
  AppendShellRef(): BRepGraph_ShellRefId;

  // BRepGraphInc_Storage.AppendFaceRef (method)
  AppendFaceRef(): BRepGraph_FaceRefId;

  // BRepGraphInc_Storage.AppendWireRef (method)
  AppendWireRef(): BRepGraph_WireRefId;

  // BRepGraphInc_Storage.AppendVertexRef (method)
  AppendVertexRef(): BRepGraph_VertexRefId;

  // BRepGraphInc_Storage.AppendSolidRef (method)
  AppendSolidRef(): BRepGraph_SolidRefId;

  // BRepGraphInc_Storage.AppendChildRef (method)
  AppendChildRef(): BRepGraph_ChildRefId;

  // BRepGraphInc_Storage.AppendOccurrenceRef (method)
  AppendOccurrenceRef(): BRepGraph_OccurrenceRefId;

  // BRepGraphInc_Storage.CreateCoEdgeUse (method)
  CreateCoEdgeUse(theParentWireId: BRepGraph_WireId, theChildEdgeId: BRepGraph_EdgeId, theFaceId: BRepGraph_FaceId, theOrientation: BRepGraphInc_ParityOrientation): BRepGraph_CoEdgeId;

  // BRepGraphInc_Storage.AttachEdgeToVertex (method)
  AttachEdgeToVertex(theEdgeId: BRepGraph_EdgeId, theVertexId: BRepGraph_VertexId): void;

  // BRepGraphInc_Storage.AttachWireToFace (method)
  AttachWireToFace(theParentFaceId: BRepGraph_FaceId, theChildWireId: BRepGraph_WireId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_WireRefId;

  // BRepGraphInc_Storage.AttachFaceToShell (method)
  AttachFaceToShell(theParentShellId: BRepGraph_ShellId, theChildFaceId: BRepGraph_FaceId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_FaceRefId;

  // BRepGraphInc_Storage.AttachShellToSolid (method)
  AttachShellToSolid(theParentSolidId: BRepGraph_SolidId, theChildShellId: BRepGraph_ShellId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_ShellRefId;

  // BRepGraphInc_Storage.AttachSolidToCompSolid (method)
  AttachSolidToCompSolid(theParentCompSolidId: BRepGraph_CompSolidId, theChildSolidId: BRepGraph_SolidId, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_SolidRefId;

  // BRepGraphInc_Storage.AttachChildToCompound (method)
  AttachChildToCompound(theParentCompoundId: BRepGraph_CompoundId, theChildNodeId: BRepGraph_NodeId, theLocation?: TopLoc_Location, theOrientation?: BRepGraphInc_ParityOrientation): BRepGraph_ChildRefId;

  // BRepGraphInc_Storage.AttachOccurrenceToProduct (method)
  AttachOccurrenceToProduct(theParentProductId: BRepGraph_ProductId, theChildOccurrenceId: BRepGraph_OccurrenceId, theLocation?: TopLoc_Location): BRepGraph_OccurrenceRefId;

  // BRepGraphInc_Storage.DetachCoEdgeUse (method)
  DetachCoEdgeUse(theParentWireId: BRepGraph_WireId, theCoEdgeId: BRepGraph_CoEdgeId): boolean;

  // BRepGraphInc_Storage.ReplaceCoEdgeUseWithPair (method)
  ReplaceCoEdgeUseWithPair(theParentWireId: BRepGraph_WireId, theOldCoEdgeId: BRepGraph_CoEdgeId, theNewFirstCoEdgeId: BRepGraph_CoEdgeId, theNewSecondCoEdgeId: BRepGraph_CoEdgeId): boolean;

  // BRepGraphInc_Storage.DetachWireFromFace (method)
  DetachWireFromFace(theParentFaceId: BRepGraph_FaceId, theRefId: BRepGraph_WireRefId): boolean;

  // BRepGraphInc_Storage.DetachFaceFromShell (method)
  DetachFaceFromShell(theParentShellId: BRepGraph_ShellId, theRefId: BRepGraph_FaceRefId): boolean;

  // BRepGraphInc_Storage.DetachShellFromSolid (method)
  DetachShellFromSolid(theParentSolidId: BRepGraph_SolidId, theRefId: BRepGraph_ShellRefId): boolean;

  // BRepGraphInc_Storage.DetachSolidFromCompSolid (method)
  DetachSolidFromCompSolid(theParentCompSolidId: BRepGraph_CompSolidId, theRefId: BRepGraph_SolidRefId): boolean;

  // BRepGraphInc_Storage.DetachChildFromCompound (method)
  DetachChildFromCompound(theParentCompoundId: BRepGraph_CompoundId, theRefId: BRepGraph_ChildRefId): boolean;

  // BRepGraphInc_Storage.DetachOccurrenceFromProduct (method)
  DetachOccurrenceFromProduct(theParentProductId: BRepGraph_ProductId, theRefId: BRepGraph_OccurrenceRefId): boolean;

  // BRepGraphInc_Storage.RebindOccurrenceChild (method)
  RebindOccurrenceChild(theOccurrence: BRepGraph_OccurrenceId, theOldChild: BRepGraph_NodeId, theNewChild: BRepGraph_NodeId): void;

  // BRepGraphInc_Storage.RebindVertexEdge (method)
  RebindVertexEdge(theOldVertex: BRepGraph_VertexId, theNewVertex: BRepGraph_VertexId, theEdge: BRepGraph_EdgeId, theExcludingRef: BRepGraph_VertexRefId): void;

  // BRepGraphInc_Storage.RebindVertexRef (method)
  RebindVertexRef(theRefId: BRepGraph_VertexRefId, theOldVertex: BRepGraph_VertexId, theNewVertex: BRepGraph_VertexId): void;

  // BRepGraphInc_Storage.RebindCoEdgeEdge (method)
  RebindCoEdgeEdge(theCoEdge: BRepGraph_CoEdgeId, theOldEdge: BRepGraph_EdgeId, theNewEdge: BRepGraph_EdgeId): void;

  // BRepGraphInc_Storage.RebindWireRef (method)
  RebindWireRef(theRefId: BRepGraph_WireRefId, theOldWire: BRepGraph_WireId, theNewWire: BRepGraph_WireId): void;

  // BRepGraphInc_Storage.RebindFaceRef (method)
  RebindFaceRef(theRefId: BRepGraph_FaceRefId, theOldFace: BRepGraph_FaceId, theNewFace: BRepGraph_FaceId): void;

  // BRepGraphInc_Storage.RebindShellRef (method)
  RebindShellRef(theRefId: BRepGraph_ShellRefId, theOldShell: BRepGraph_ShellId, theNewShell: BRepGraph_ShellId): void;

  // BRepGraphInc_Storage.RebindSolidRef (method)
  RebindSolidRef(theRefId: BRepGraph_SolidRefId, theOldSolid: BRepGraph_SolidId, theNewSolid: BRepGraph_SolidId): void;

  // BRepGraphInc_Storage.RebindChildRef (method)
  RebindChildRef(theRefId: BRepGraph_ChildRefId, theOldChild: BRepGraph_NodeId, theNewChild: BRepGraph_NodeId): void;

  // BRepGraphInc_Storage.RebindOccurrenceRef (method)
  RebindOccurrenceRef(theRefId: BRepGraph_OccurrenceRefId, theOldOccurrence: BRepGraph_OccurrenceId, theNewOccurrence: BRepGraph_OccurrenceId): void;

  // BRepGraphInc_Storage.ReverseWireCoEdges (method)
  ReverseWireCoEdges(theWireId: BRepGraph_WireId): void;

  // BRepGraphInc_Storage.SetWireCoEdges (method)
  SetWireCoEdges(theWireId: BRepGraph_WireId, theCoEdgeIds: NCollection_Array1_BRepGraph_CoEdgeId): void;

  // BRepGraphInc_Storage.SetFaceWireRefs (method)
  SetFaceWireRefs(theFaceId: BRepGraph_FaceId, theWireRefIds: NCollection_Array1_BRepGraph_WireRefId): void;

  // BRepGraphInc_Storage.SetShellFaceRefs (method)
  SetShellFaceRefs(theShellId: BRepGraph_ShellId, theFaceRefIds: NCollection_Array1_BRepGraph_FaceRefId): void;

  // BRepGraphInc_Storage.SetSolidShellRefs (method)
  SetSolidShellRefs(theSolidId: BRepGraph_SolidId, theShellRefIds: NCollection_Array1_BRepGraph_ShellRefId): void;

  // BRepGraphInc_Storage.SetCompSolidSolidRefs (method)
  SetCompSolidSolidRefs(theCompSolidId: BRepGraph_CompSolidId, theSolidRefIds: NCollection_Array1_BRepGraph_SolidRefId): void;

  // BRepGraphInc_Storage.SetCompoundChildRefs (method)
  SetCompoundChildRefs(theCompoundId: BRepGraph_CompoundId, theChildRefIds: NCollection_Array1_BRepGraph_ChildRefId): void;

  // BRepGraphInc_Storage.SetProductOccurrenceRefs (method)
  SetProductOccurrenceRefs(theProductId: BRepGraph_ProductId, theOccurrenceRefIds: NCollection_Array1_BRepGraph_OccurrenceRefId): void;

  // BRepGraphInc_Storage.BaseRef (method)
  BaseRef(theRefId: BRepGraph_RefId): BRepGraphInc_BaseRef;

  // BRepGraphInc_Storage.ChangeBaseRef (method)
  ChangeBaseRef(theRefId: BRepGraph_RefId): BRepGraphInc_BaseRef;

  // BRepGraphInc_Storage.FindNodeIdByUID (method)
  FindNodeIdByUID(theUID: BRepGraph_UID): BRepGraph_NodeId;

  // BRepGraphInc_Storage.FindRefIdByUID (method)
  FindRefIdByUID(theUID: BRepGraph_RefUID): BRepGraph_RefId;

  // BRepGraphInc_Storage.FindDefinitionByShape (method)
  FindDefinitionByShape(theShape: TopoDS_Shape): BRepGraph_NodeId;

  // BRepGraphInc_Storage.HasShapeBinding (method)
  HasShapeBinding(theShape: TopoDS_Shape): boolean;

  // BRepGraphInc_Storage.SetDefinitionShapeBinding (method)
  SetDefinitionShapeBinding(theShape: TopoDS_Shape, theNodeId: BRepGraph_NodeId): void;

  // BRepGraphInc_Storage.RemoveDefinitionShapeBinding (method)
  RemoveDefinitionShapeBinding(theShape: TopoDS_Shape, theExpectedNodeId: BRepGraph_NodeId): boolean;

  // BRepGraphInc_Storage.FindOriginal (method)
  FindOriginal(theNodeId: BRepGraph_NodeId): TopoDS_Shape;

  // BRepGraphInc_Storage.HasOriginal (method)
  HasOriginal(theNodeId: BRepGraph_NodeId): boolean;

  // BRepGraphInc_Storage.BindOriginal (method)
  BindOriginal(theNodeId: BRepGraph_NodeId, theShape: TopoDS_Shape): void;

  // BRepGraphInc_Storage.UnBindOriginal (method)
  UnBindOriginal(theNodeId: BRepGraph_NodeId): void;

  // BRepGraphInc_Storage.CopyShapeBindingsFrom (method)
  CopyShapeBindingsFrom(theSource: BRepGraphInc_Storage): void;

  // BRepGraphInc_Storage.CurrentShapes (method)
  CurrentShapes(): any;

  // BRepGraphInc_Storage.ChangeCurrentShapes (method)
  ChangeCurrentShapes(): any;

  // BRepGraphInc_Storage.CurrentShapesMutex (method)
  CurrentShapesMutex(): unknown;

  // BRepGraphInc_Storage.ClearCurrentShapes (method)
  ClearCurrentShapes(): void;

  // BRepGraphInc_Storage.UnbindCurrentShape (method)
  UnbindCurrentShape(theNode: BRepGraph_NodeId): void;

  // BRepGraphInc_Storage.ClearDeferredQueues (method)
  ClearDeferredQueues(): void;

  // BRepGraphInc_Storage.Clear (method)
  Clear(): void;

  // BRepGraphInc_Storage.PrepareForLoad (method)
  PrepareForLoad(theCounts: BRepGraphInc_Load_Counts): void;

  // BRepGraphInc_Storage.SetActiveCounts (method)
  SetActiveCounts(theCounts: BRepGraphInc_Load_Counts): void;

  // BRepGraphInc_Storage.Counts (method)
  Counts(): BRepGraphInc_Load_Counts;

  // BRepGraphInc_Storage.ActiveCounts (method)
  ActiveCounts(): BRepGraphInc_Load_Counts;

  // BRepGraphInc_Storage.RecountActiveCounts (method)
  RecountActiveCounts(): void;

  // BRepGraphInc_Storage.RebuildDerivedRelations (method)
  RebuildDerivedRelations(): void;

  // BRepGraphInc_Storage.RebuildDerivedRelationsPreservingActiveCounts (method)
  RebuildDerivedRelationsPreservingActiveCounts(): void;

  // BRepGraphInc_Storage.CopyRemovedFlagsFrom (method)
  CopyRemovedFlagsFrom(theSource: BRepGraphInc_Storage): void;

  // BRepGraphInc_Storage.ValidateRelations (method)
  ValidateRelations(): boolean;

  // BRepGraphInc_Storage.ValidateWireCoEdgeOrder (method)
  ValidateWireCoEdgeOrder(theWireId: BRepGraph_WireId): boolean;

  // BRepGraphInc_Storage.ValidateWireCoEdgeOrders (method)
  ValidateWireCoEdgeOrders(): boolean;

  // BRepGraphInc_Storage.CanonicalizeWireCoEdgeOrderStatus (method)
  CanonicalizeWireCoEdgeOrderStatus(theWireId: BRepGraph_WireId): BRepGraphInc_Storage_WireCoEdgeOrderStatus;

  // BRepGraphInc_Storage.CanonicalizeWireCoEdgeOrder (method)
  CanonicalizeWireCoEdgeOrder(theWireId: BRepGraph_WireId): boolean;

  // BRepGraphInc_Storage.RebuildUIDReverseIndexes (method)
  RebuildUIDReverseIndexes(): void;

  // BRepGraphInc_Storage.MarkUIDReverseIndexesDirty (method)
  MarkUIDReverseIndexesDirty(): void;

  // BRepGraphInc_Storage.EnsureUIDReverseIndex (method)
  EnsureUIDReverseIndex(): void;

  // BRepGraphInc_Storage.EnsureRefUIDReverseIndex (method)
  EnsureRefUIDReverseIndex(): void;

  // BRepGraphInc_Storage.CopyDerivedRelationsFrom (method)
  CopyDerivedRelationsFrom(theSource: BRepGraphInc_Storage): void;

  // BRepGraphInc_Storage.HasCompoundParent (method)
  HasCompoundParent(theNode: BRepGraph_NodeId): boolean;

  // BRepGraphInc_Storage.HasOccurrenceParent (method)
  HasOccurrenceParent(theNode: BRepGraph_NodeId): boolean;

  // BRepGraphInc_Storage.IsGuarded (method)
  IsGuarded(theId: BRepGraph_ItemId): boolean;

  // BRepGraphInc_Storage.SetGuarded (method)
  SetGuarded(theId: BRepGraph_ItemId): void;

  // BRepGraphInc_Storage.ClearGuarded (method)
  ClearGuarded(theId: BRepGraph_ItemId): void;

  // BRepGraphInc_Storage.HasAnyGuard (method)
  HasAnyGuard(): boolean;

  // BRepGraphInc_Storage.delete (method)
  delete(): void;

  // BRepGraphInc_Storage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraphInc_Storage_WireCoEdgeOrderStatus: typeof BRepGraphInc_Storage_WireCoEdgeOrderStatus[keyof typeof BRepGraphInc_Storage_WireCoEdgeOrderStatus]

  readonly Connected: 'Connected'

  readonly Reordered: 'Reordered'

  readonly ToleranceOrdered: 'ToleranceOrdered'

  readonly Partial: 'Partial'

  readonly InvalidInput: 'InvalidInput'

BRepGraphInc_Storage_CachedShape: interface BRepGraphInc_Storage_CachedShape

  Shape: TopoDS_Shape

  StoredSubtreeGen: number
