# libcascade — BRepGraph

50 top-level symbols. Signatures are verbatim typescript.

BRepGraph: declare class BRepGraph

  // BRepGraph.constructor (constructor)
  constructor();

  // BRepGraph.Clear (method)
  Clear(): void;

  // BRepGraph.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepGraph.ValidateRelations (method)
  ValidateRelations(): boolean;

  // BRepGraph.RootProductIds (method)
  RootProductIds(): BRepGraph_ProductId[];

  // BRepGraph.Allocator (method)
  Allocator(): NCollection_BaseAllocator;

  // BRepGraph.IsValid (method)
  IsValid(): boolean;

  // BRepGraph.IsNull (method)
  IsNull(): boolean;

  // BRepGraph.Topo (method)
  Topo(): BRepGraph_TopoView;

  // BRepGraph.UIDs (method)
  UIDs(): BRepGraph_UIDsView;

  // BRepGraph.Refs (method)
  Refs(): BRepGraph_RefsView;

  // BRepGraph.Shapes (method)
  Shapes(): BRepGraph_ShapesView;

  // BRepGraph.Editor (method)
  Editor(): BRepGraph_EditorView;

  // BRepGraph.Mesh (method)
  Mesh(): BRepGraph_MeshView;

  // BRepGraph.LayerRegistry (method)
  LayerRegistry(): BRepGraph_LayerRegistry;

  // BRepGraph.CacheRegistry (method)
  CacheRegistry(): BRepGraph_CacheRegistry;

  // BRepGraph.delete (method)
  delete(): void;

  // BRepGraph.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Cache: declare class BRepGraph_Cache extends Standard_Transient

  // BRepGraph_Cache.ID (method)
  ID(): Standard_GUID;

  // BRepGraph_Cache.Name (method)
  Name(): TCollection_AsciiString;

  // BRepGraph_Cache.Clear (method)
  Clear(): void;

  // BRepGraph_Cache.CopyFreshTo (method)
  CopyFreshTo(theCopy: BRepGraph_CopyRemap): void;

  // BRepGraph_Cache.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_Cache.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_Cache.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_Cache.delete (method)
  delete(): void;

  // BRepGraph_Cache.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheDerivedState: declare class BRepGraph_CacheDerivedState extends BRepGraph_Cache

  // BRepGraph_CacheDerivedState.constructor (constructor)
  constructor();

  // BRepGraph_CacheDerivedState.GetID (method)
  static GetID(): Standard_GUID;

  // BRepGraph_CacheDerivedState.ID (method)
  ID(): Standard_GUID;

  // BRepGraph_CacheDerivedState.Name (method)
  Name(): TCollection_AsciiString;

  // BRepGraph_CacheDerivedState.Clear (method)
  Clear(): void;

  // BRepGraph_CacheDerivedState.CopyFreshTo (method)
  CopyFreshTo(theCopy: BRepGraph_CopyRemap): void;

  // BRepGraph_CacheDerivedState.IsDegenerated (method)
  IsDegenerated(theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_CacheDerivedState.SameParameter (method)
  SameParameter(theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_CacheDerivedState.SameRange (method)
  SameRange(theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_CacheDerivedState.IsClosed (method)
  IsClosed(theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_CacheDerivedState.GetWireIsClosed (method)
  GetWireIsClosed(theWire: BRepGraph_WireId, theClosed?: boolean): { returnValue: boolean; theClosed: boolean };

  // BRepGraph_CacheDerivedState.SetWireIsClosed (method)
  SetWireIsClosed(theWire: BRepGraph_WireId, theClosed: boolean): void;

  // BRepGraph_CacheDerivedState.IsShellClosed (method)
  IsShellClosed(theShell: BRepGraph_ShellId): boolean;

  // BRepGraph_CacheDerivedState.ComputeEdgeProperties (method)
  static ComputeEdgeProperties(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theIsDegenerated?: boolean, theIsClosed?: boolean): { returnValue: boolean; theIsDegenerated: boolean; theIsClosed: boolean };

  // BRepGraph_CacheDerivedState.ComputeShellIsClosed (method)
  static ComputeShellIsClosed(theGraph: BRepGraph, theShell: BRepGraph_ShellId): boolean;

  // BRepGraph_CacheDerivedState.ComputeWireIsClosed (method)
  static ComputeWireIsClosed(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;

  // BRepGraph_CacheDerivedState.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_CacheDerivedState.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_CacheDerivedState.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_CacheDerivedState.delete (method)
  delete(): void;

  // BRepGraph_CacheDerivedState.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheIterator: declare class BRepGraph_CacheIterator

  // BRepGraph_CacheIterator.constructor (constructor)
  constructor(theRegistry: BRepGraph_CacheRegistry);

  // BRepGraph_CacheIterator.More (method)
  More(): boolean;

  // BRepGraph_CacheIterator.Next (method)
  Next(): void;

  // BRepGraph_CacheIterator.Value (method)
  Value(): BRepGraph_Cache;

  // BRepGraph_CacheIterator.Slot (method)
  Slot(): number;

  // BRepGraph_CacheIterator.NbCaches (method)
  NbCaches(): number;

  // BRepGraph_CacheIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_CacheIterator.delete (method)
  delete(): void;

  // BRepGraph_CacheIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheMesh_CoEdgeMeshEntry: declare class BRepGraph_CacheMesh_CoEdgeMeshEntry

  // BRepGraph_CacheMesh_CoEdgeMeshEntry.constructor (constructor)
  constructor();

  CoEdgeStamp: unknown

  FaceTopologyStamp: unknown

  FaceMeshGeneration: number

  BoundFaceId: BRepGraph_FaceId

  SlotStamp: BRepGraph_CacheMesh_EntryStamp

  Polygon2D: Poly_Polygon2D

  PolygonsOnTri: Poly_PolygonOnTriangulation[]

  // BRepGraph_CacheMesh_CoEdgeMeshEntry.IsPresent (method)
  IsPresent(): boolean;

  // BRepGraph_CacheMesh_CoEdgeMeshEntry.Reset (method)
  Reset(): void;

  // BRepGraph_CacheMesh_CoEdgeMeshEntry.delete (method)
  delete(): void;

  // BRepGraph_CacheMesh_CoEdgeMeshEntry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheMesh_DirtySet: declare class BRepGraph_CacheMesh_DirtySet

  // BRepGraph_CacheMesh_DirtySet.constructor (constructor)
  constructor();

  Faces: BRepGraph_FaceId[]

  FreeEdges: BRepGraph_EdgeId[]

  // BRepGraph_CacheMesh_DirtySet.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepGraph_CacheMesh_DirtySet.Clear (method)
  Clear(): void;

  // BRepGraph_CacheMesh_DirtySet.delete (method)
  delete(): void;

  // BRepGraph_CacheMesh_DirtySet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheMesh_Driver: declare class BRepGraph_CacheMesh_Driver extends Standard_Transient

  // BRepGraph_CacheMesh_Driver.ID (method)
  ID(): Standard_GUID;

  // BRepGraph_CacheMesh_Driver.RecipeHash (method)
  RecipeHash(): number;

  // BRepGraph_CacheMesh_Driver.Fill (method)
  Fill(theGraph: BRepGraph, theSlot: number, theDirtySet: BRepGraph_CacheMesh_DirtySet, theRange: Message_ProgressRange): boolean;

  // BRepGraph_CacheMesh_Driver.get_type_name (method)
  static get_type_name(): string;

  // BRepGraph_CacheMesh_Driver.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepGraph_CacheMesh_Driver.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepGraph_CacheMesh_Driver.delete (method)
  delete(): void;

  // BRepGraph_CacheMesh_Driver.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheMesh_EdgeMeshEntry: declare class BRepGraph_CacheMesh_EdgeMeshEntry

  // BRepGraph_CacheMesh_EdgeMeshEntry.constructor (constructor)
  constructor();

  Polygon3D: Poly_Polygon3D

  Stamp: BRepGraph_CacheMesh_EntryStamp

  // BRepGraph_CacheMesh_EdgeMeshEntry.IsPresent (method)
  IsPresent(): boolean;

  // BRepGraph_CacheMesh_EdgeMeshEntry.Reset (method)
  Reset(): void;

  // BRepGraph_CacheMesh_EdgeMeshEntry.delete (method)
  delete(): void;

  // BRepGraph_CacheMesh_EdgeMeshEntry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheMesh_EntryStamp: declare class BRepGraph_CacheMesh_EntryStamp

  // BRepGraph_CacheMesh_EntryStamp.constructor (constructor)
  constructor();

  RecipeHash: number

  SlotGeneration: number

  // BRepGraph_CacheMesh_EntryStamp.Reset (method)
  Reset(): void;

  // BRepGraph_CacheMesh_EntryStamp.delete (method)
  delete(): void;

  // BRepGraph_CacheMesh_EntryStamp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheMesh_FaceMeshEntry: declare class BRepGraph_CacheMesh_FaceMeshEntry

  // BRepGraph_CacheMesh_FaceMeshEntry.constructor (constructor)
  constructor();

  Triangulation: Poly_Triangulation

  Stamp: BRepGraph_CacheMesh_EntryStamp

  MeshGeneration: number

  // BRepGraph_CacheMesh_FaceMeshEntry.IsPresent (method)
  IsPresent(): boolean;

  // BRepGraph_CacheMesh_FaceMeshEntry.ClearRepresentation (method)
  ClearRepresentation(): void;

  // BRepGraph_CacheMesh_FaceMeshEntry.Reset (method)
  Reset(): void;

  // BRepGraph_CacheMesh_FaceMeshEntry.delete (method)
  delete(): void;

  // BRepGraph_CacheMesh_FaceMeshEntry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CacheRegistry: declare class BRepGraph_CacheRegistry

  // BRepGraph_CacheRegistry.constructor (constructor)
  constructor();

  // BRepGraph_CacheRegistry.RegisterCache (method)
  RegisterCache(theCache: BRepGraph_Cache): number;

  // BRepGraph_CacheRegistry.Register (method)
  Register(theCache: BRepGraph_Cache): number;

  // BRepGraph_CacheRegistry.UnregisterCache (method)
  UnregisterCache(theGUID: Standard_GUID): void;

  // BRepGraph_CacheRegistry.FindCache (method)
  FindCache(theGUID: Standard_GUID): BRepGraph_Cache;

  // BRepGraph_CacheRegistry.FindSlot (method)
  FindSlot(theGUID: Standard_GUID, theSlot: number): { returnValue: boolean; theSlot: number };
  FindSlot(theCache: BRepGraph_Cache, theSlot: number): { returnValue: boolean; theSlot: number };

  // BRepGraph_CacheRegistry.Cache (method)
  Cache(theSlot: number): BRepGraph_Cache;

  // BRepGraph_CacheRegistry.NbCaches (method)
  NbCaches(): number;

  // BRepGraph_CacheRegistry.ClearAll (method)
  ClearAll(): void;

  // BRepGraph_CacheRegistry.CopyFreshCachesTo (method)
  CopyFreshCachesTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
  CopyFreshCachesTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;

  // BRepGraph_CacheRegistry.Clear (method)
  Clear(): void;

  // BRepGraph_CacheRegistry.delete (method)
  delete(): void;

  // BRepGraph_CacheRegistry.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ChildExplorer: declare class BRepGraph_ChildExplorer

  // BRepGraph_ChildExplorer.constructor (constructor)
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId);
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId, theConfig: BRepGraph_ChildExplorer_Config);
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId, theMode: BRepGraph_ChildExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId, theTargetKind: BRepGraph_NodeId_Kind);
  constructor(theGraph: BRepGraph, theProduct: BRepGraph_ProductId, theTargetKind: BRepGraph_NodeId_Kind);
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId, theTargetKind: BRepGraph_NodeId_Kind, theMode: BRepGraph_ChildExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theProduct: BRepGraph_ProductId, theTargetKind: BRepGraph_NodeId_Kind, theMode: BRepGraph_ChildExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId, theAvoidKind: BRepGraph_NodeId_Kind | null | undefined, theEmitAvoidKind: boolean, theMode?: BRepGraph_ChildExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId, theTargetKind: BRepGraph_NodeId_Kind, theAvoidKind: BRepGraph_NodeId_Kind | null | undefined, theEmitAvoidKind: boolean, theMode?: BRepGraph_ChildExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId, theTargetKind: BRepGraph_NodeId_Kind, theCumLoc: boolean, theCumOri: boolean, theMode?: BRepGraph_ChildExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theProduct: BRepGraph_ProductId, theTargetKind: BRepGraph_NodeId_Kind, theCumLoc: boolean, theCumOri: boolean, theMode?: BRepGraph_ChildExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theRoot: BRepGraph_NodeId, theTargetKind: BRepGraph_NodeId_Kind, theStartLoc: TopLoc_Location, theStartOri: TopAbs_Orientation, theMode?: BRepGraph_ChildExplorer_TraversalMode);

  // BRepGraph_ChildExplorer.GetConfig (method)
  GetConfig(): BRepGraph_ChildExplorer_Config;

  // BRepGraph_ChildExplorer.More (method)
  More(): boolean;

  // BRepGraph_ChildExplorer.Next (method)
  Next(): void;

  // BRepGraph_ChildExplorer.Current (method)
  Current(): any;

  // BRepGraph_ChildExplorer.CurrentParent (method)
  CurrentParent(): BRepGraph_NodeId;

  // BRepGraph_ChildExplorer.CurrentLinkKind (method)
  CurrentLinkKind(): BRepGraph_ChildExplorer_LinkKind;

  // BRepGraph_ChildExplorer.CurrentRef (method)
  CurrentRef(): BRepGraph_RefId;

  // BRepGraph_ChildExplorer.CurrentUsagePath (method)
  CurrentUsagePath(): BRepGraph_UsagePath;

  // BRepGraph_ChildExplorer.LocationOf (method)
  LocationOf(theKind: BRepGraph_NodeId_Kind): TopLoc_Location;

  // BRepGraph_ChildExplorer.NodeOf (method)
  NodeOf(theKind: BRepGraph_NodeId_Kind): BRepGraph_NodeId;

  // BRepGraph_ChildExplorer.LocationAt (method)
  LocationAt(theLevel: number): TopLoc_Location;

  // BRepGraph_ChildExplorer.NodeAt (method)
  NodeAt(theLevel: number): BRepGraph_NodeId;

  // BRepGraph_ChildExplorer.Depth (method)
  Depth(): number;

  // BRepGraph_ChildExplorer.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_ChildExplorer.delete (method)
  delete(): void;

  // BRepGraph_ChildExplorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ChildExplorer_LinkKind: typeof BRepGraph_ChildExplorer_LinkKind[keyof typeof BRepGraph_ChildExplorer_LinkKind]

  readonly None: 'None'

  readonly Reference: 'Reference'

  readonly Structural: 'Structural'

BRepGraph_ChildExplorer_TraversalMode: typeof BRepGraph_ChildExplorer_TraversalMode[keyof typeof BRepGraph_ChildExplorer_TraversalMode]

  readonly Recursive: 'Recursive'

  readonly DirectChildren: 'DirectChildren'

BRepGraph_Compact: declare class BRepGraph_Compact

  // BRepGraph_Compact.Perform (method)
  static Perform(theGraph: BRepGraph): BRepGraph_Compact_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Compact_Options): BRepGraph_Compact_Result;

  // BRepGraph_Compact.delete (method)
  delete(): void;

  // BRepGraph_Compact.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Compact_Options: declare class BRepGraph_Compact_Options

  // BRepGraph_Compact_Options.constructor (constructor)
  constructor();

  HistoryMode: boolean

  CacheMode: BRepGraph_Compact_Options_CachePolicy

  // BRepGraph_Compact_Options.delete (method)
  delete(): void;

  // BRepGraph_Compact_Options.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Compact_Options_CachePolicy: typeof BRepGraph_Compact_Options_CachePolicy[keyof typeof BRepGraph_Compact_Options_CachePolicy]

  readonly Drop: 'Drop'

  readonly CopyFresh: 'CopyFresh'

BRepGraph_Copy: declare class BRepGraph_Copy

  // BRepGraph_Copy.Perform (method)
  static Perform(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy, theCachePolicy?: BRepGraph_Copy_CachePolicy): boolean;

  // BRepGraph_Copy.CopyNode (method)
  static CopyNode(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theNodeId: BRepGraph_NodeId, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy, theCachePolicy?: BRepGraph_Copy_CachePolicy): BRepGraph_NodeId;

  // BRepGraph_Copy.delete (method)
  delete(): void;

  // BRepGraph_Copy.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Copy_GeomPolicy: typeof BRepGraph_Copy_GeomPolicy[keyof typeof BRepGraph_Copy_GeomPolicy]

  readonly Copy: 'Copy'

  readonly Share: 'Share'

  readonly Drop: 'Drop'

BRepGraph_Copy_MeshPolicy: typeof BRepGraph_Copy_MeshPolicy[keyof typeof BRepGraph_Copy_MeshPolicy]

  readonly Copy: 'Copy'

  readonly Share: 'Share'

  readonly Drop: 'Drop'

BRepGraph_Copy_CachePolicy: typeof BRepGraph_Copy_CachePolicy[keyof typeof BRepGraph_Copy_CachePolicy]

  readonly Drop: 'Drop'

  readonly CopyFresh: 'CopyFresh'

BRepGraph_CopyRemap: declare class BRepGraph_CopyRemap

  // BRepGraph_CopyRemap.constructor (constructor)
  constructor(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode);
  constructor(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode);

  // BRepGraph_CopyRemap.CopyMode (method)
  CopyMode(): BRepGraph_CopyRemap_Mode;

  // BRepGraph_CopyRemap.IsCompact (method)
  IsCompact(): boolean;

  // BRepGraph_CopyRemap.SourceGraph (method)
  SourceGraph(): BRepGraph;

  // BRepGraph_CopyRemap.TargetGraph (method)
  TargetGraph(): BRepGraph;

  // BRepGraph_CopyRemap.TargetGraphConst (method)
  TargetGraphConst(): BRepGraph;

  // BRepGraph_CopyRemap.Items (method)
  Items(): any;

  // BRepGraph_CopyRemap.TargetItem (method)
  TargetItem(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemId;

  // BRepGraph_CopyRemap.TargetItemOrInvalid (method)
  TargetItemOrInvalid(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemId;

  // BRepGraph_CopyRemap.HasTargetItem (method)
  HasTargetItem(theSourceItem: BRepGraph_ItemId): boolean;

  // BRepGraph_CopyRemap.SourceUID (method)
  SourceUID(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemUID;

  // BRepGraph_CopyRemap.TargetUID (method)
  TargetUID(theTargetItem: BRepGraph_ItemId): BRepGraph_ItemUID;

  // BRepGraph_CopyRemap.TargetUIDFromSource (method)
  TargetUIDFromSource(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemUID;

  // BRepGraph_CopyRemap.delete (method)
  delete(): void;

  // BRepGraph_CopyRemap.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CopyRemap_Mode: typeof BRepGraph_CopyRemap_Mode[keyof typeof BRepGraph_CopyRemap_Mode]

  readonly Copy: 'Copy'

  readonly Compact: 'Compact'

BRepGraph_CopyRemap_MappingKind: typeof BRepGraph_CopyRemap_MappingKind[keyof typeof BRepGraph_CopyRemap_MappingKind]

  readonly Explicit: 'Explicit'

  readonly Identity: 'Identity'

BRepGraph_Data: declare class BRepGraph_Data

  // BRepGraph_Data.constructor (constructor)
  constructor();

  myIncStorage: BRepGraphInc_Storage

  myLayerRegistry: BRepGraph_LayerRegistry

  myCacheRegistry: BRepGraph_CacheRegistry

  myTopoView: BRepGraph_TopoView

  myUIDsView: BRepGraph_UIDsView

  myRefsView: BRepGraph_RefsView

  myShapesView: BRepGraph_ShapesView

  myEditorView: BRepGraph_EditorView

  myMeshView: BRepGraph_MeshView

  // BRepGraph_Data.delete (method)
  delete(): void;

  // BRepGraph_Data.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Deduplicate: declare class BRepGraph_Deduplicate

  // BRepGraph_Deduplicate.Perform (method)
  static Perform(theGraph: BRepGraph): BRepGraph_Deduplicate_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Deduplicate_Options): BRepGraph_Deduplicate_Result;

  // BRepGraph_Deduplicate.delete (method)
  delete(): void;

  // BRepGraph_Deduplicate.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DeferredScope: declare class BRepGraph_DeferredScope

  // BRepGraph_DeferredScope.constructor (constructor)
  constructor(theGraph: BRepGraph);

  // BRepGraph_DeferredScope.delete (method)
  delete(): void;

  // BRepGraph_DeferredScope.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsChildOfCompound: declare class BRepGraph_DefsChildOfCompound

  // BRepGraph_DefsChildOfCompound.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_DefsChildOfCompound.More (method)
  More(): boolean;

  // BRepGraph_DefsChildOfCompound.Next (method)
  Next(): void;

  // BRepGraph_DefsChildOfCompound.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_DefsChildOfCompound.Current (method)
  Current(): unknown;

  // BRepGraph_DefsChildOfCompound.CurrentRefId (method)
  CurrentRefId(): unknown;

  // BRepGraph_DefsChildOfCompound.Index (method)
  Index(): number;

  // BRepGraph_DefsChildOfCompound.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsChildOfCompound.delete (method)
  delete(): void;

  // BRepGraph_DefsChildOfCompound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsCoEdgeOfWire: declare class BRepGraph_DefsCoEdgeOfWire

  // BRepGraph_DefsCoEdgeOfWire.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_DefsCoEdgeOfWire.More (method)
  More(): boolean;

  // BRepGraph_DefsCoEdgeOfWire.Next (method)
  Next(): void;

  // BRepGraph_DefsCoEdgeOfWire.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_DefsCoEdgeOfWire.Current (method)
  Current(): unknown;

  // BRepGraph_DefsCoEdgeOfWire.CurrentRefId (method)
  CurrentRefId(): unknown;

  // BRepGraph_DefsCoEdgeOfWire.Index (method)
  Index(): number;

  // BRepGraph_DefsCoEdgeOfWire.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsCoEdgeOfWire.delete (method)
  delete(): void;

  // BRepGraph_DefsCoEdgeOfWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsEdgeOfWire: declare class BRepGraph_DefsEdgeOfWire

  // BRepGraph_DefsEdgeOfWire.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_DefsEdgeOfWire.More (method)
  More(): boolean;

  // BRepGraph_DefsEdgeOfWire.Next (method)
  Next(): void;

  // BRepGraph_DefsEdgeOfWire.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_DefsEdgeOfWire.Current (method)
  Current(): unknown;

  // BRepGraph_DefsEdgeOfWire.CurrentRefId (method)
  CurrentRefId(): unknown;

  // BRepGraph_DefsEdgeOfWire.Index (method)
  Index(): number;

  // BRepGraph_DefsEdgeOfWire.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsEdgeOfWire.delete (method)
  delete(): void;

  // BRepGraph_DefsEdgeOfWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsFaceOfShell: declare class BRepGraph_DefsFaceOfShell

  // BRepGraph_DefsFaceOfShell.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_DefsFaceOfShell.More (method)
  More(): boolean;

  // BRepGraph_DefsFaceOfShell.Next (method)
  Next(): void;

  // BRepGraph_DefsFaceOfShell.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_DefsFaceOfShell.Current (method)
  Current(): unknown;

  // BRepGraph_DefsFaceOfShell.CurrentRefId (method)
  CurrentRefId(): unknown;

  // BRepGraph_DefsFaceOfShell.Index (method)
  Index(): number;

  // BRepGraph_DefsFaceOfShell.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsFaceOfShell.delete (method)
  delete(): void;

  // BRepGraph_DefsFaceOfShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_ChildOfCompoundTraits: declare class BRepGraph_DefsIterator_ChildOfCompoundTraits

  // BRepGraph_DefsIterator_ChildOfCompoundTraits.constructor (constructor)
  constructor();

  // BRepGraph_DefsIterator_ChildOfCompoundTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): boolean;

  // BRepGraph_DefsIterator_ChildOfCompoundTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): BRepGraph_ChildRefId[];

  // BRepGraph_DefsIterator_ChildOfCompoundTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

  // BRepGraph_DefsIterator_ChildOfCompoundTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ChildRef): BRepGraph_NodeId;

  // BRepGraph_DefsIterator_ChildOfCompoundTraits.Child (method)
  static Child(theGraph: BRepGraph, theChildId: BRepGraph_NodeId): unknown;

  // BRepGraph_DefsIterator_ChildOfCompoundTraits.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_ChildOfCompoundTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_CoEdgeOfWireTraits: declare class BRepGraph_DefsIterator_CoEdgeOfWireTraits

  // BRepGraph_DefsIterator_CoEdgeOfWireTraits.constructor (constructor)
  constructor();

  // BRepGraph_DefsIterator_CoEdgeOfWireTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

  // BRepGraph_DefsIterator_CoEdgeOfWireTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

  // BRepGraph_DefsIterator_CoEdgeOfWireTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  // BRepGraph_DefsIterator_CoEdgeOfWireTraits.Child (method)
  static Child(theGraph: BRepGraph, theChildId: BRepGraph_CoEdgeId): unknown;

  // BRepGraph_DefsIterator_CoEdgeOfWireTraits.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_CoEdgeOfWireTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_DefsVertexOfEdge: declare class BRepGraph_DefsIterator_DefsVertexOfEdge

  // BRepGraph_DefsIterator_DefsVertexOfEdge.constructor (constructor)
  constructor(theGraph: BRepGraph, theEdgeId: BRepGraph_EdgeId);

  // BRepGraph_DefsIterator_DefsVertexOfEdge.More (method)
  More(): boolean;

  // BRepGraph_DefsIterator_DefsVertexOfEdge.Next (method)
  Next(): void;

  // BRepGraph_DefsIterator_DefsVertexOfEdge.CurrentId (method)
  CurrentId(): BRepGraph_VertexId;

  // BRepGraph_DefsIterator_DefsVertexOfEdge.Current (method)
  Current(): BRepGraphInc_VertexDef;

  // BRepGraph_DefsIterator_DefsVertexOfEdge.CurrentRefId (method)
  CurrentRefId(): BRepGraph_VertexRefId;

  // BRepGraph_DefsIterator_DefsVertexOfEdge.Index (method)
  Index(): number;

  // BRepGraph_DefsIterator_DefsVertexOfEdge.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsIterator_DefsVertexOfEdge.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_DefsVertexOfEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_EdgeOfWireTraits: declare class BRepGraph_DefsIterator_EdgeOfWireTraits

  // BRepGraph_DefsIterator_EdgeOfWireTraits.constructor (constructor)
  constructor();

  // BRepGraph_DefsIterator_EdgeOfWireTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

  // BRepGraph_DefsIterator_EdgeOfWireTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

  // BRepGraph_DefsIterator_EdgeOfWireTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  // BRepGraph_DefsIterator_EdgeOfWireTraits.ChildIdOf (method)
  static ChildIdOf(theGraph: BRepGraph, theRef: BRepGraphInc_CoEdgeDef): BRepGraph_EdgeId;

  // BRepGraph_DefsIterator_EdgeOfWireTraits.Child (method)
  static Child(theGraph: BRepGraph, theChildId: BRepGraph_EdgeId): unknown;

  // BRepGraph_DefsIterator_EdgeOfWireTraits.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_EdgeOfWireTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_FaceOfShellTraits: declare class BRepGraph_DefsIterator_FaceOfShellTraits

  // BRepGraph_DefsIterator_FaceOfShellTraits.constructor (constructor)
  constructor();

  // BRepGraph_DefsIterator_FaceOfShellTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ShellId): boolean;

  // BRepGraph_DefsIterator_FaceOfShellTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ShellId): BRepGraph_FaceRefId[];

  // BRepGraph_DefsIterator_FaceOfShellTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

  // BRepGraph_DefsIterator_FaceOfShellTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_FaceRef): BRepGraph_FaceId;

  // BRepGraph_DefsIterator_FaceOfShellTraits.Child (method)
  static Child(theGraph: BRepGraph, theChildId: BRepGraph_FaceId): unknown;

  // BRepGraph_DefsIterator_FaceOfShellTraits.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_FaceOfShellTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_OccurrenceOfProductTraits: declare class BRepGraph_DefsIterator_OccurrenceOfProductTraits

  // BRepGraph_DefsIterator_OccurrenceOfProductTraits.constructor (constructor)
  constructor();

  // BRepGraph_DefsIterator_OccurrenceOfProductTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ProductId): boolean;

  // BRepGraph_DefsIterator_OccurrenceOfProductTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

  // BRepGraph_DefsIterator_OccurrenceOfProductTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  // BRepGraph_DefsIterator_OccurrenceOfProductTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_OccurrenceRef): BRepGraph_OccurrenceId;

  // BRepGraph_DefsIterator_OccurrenceOfProductTraits.Child (method)
  static Child(theGraph: BRepGraph, theChildId: BRepGraph_OccurrenceId): unknown;

  // BRepGraph_DefsIterator_OccurrenceOfProductTraits.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_OccurrenceOfProductTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_ShellOfSolidTraits: declare class BRepGraph_DefsIterator_ShellOfSolidTraits

  // BRepGraph_DefsIterator_ShellOfSolidTraits.constructor (constructor)
  constructor();

  // BRepGraph_DefsIterator_ShellOfSolidTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_SolidId): boolean;

  // BRepGraph_DefsIterator_ShellOfSolidTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_SolidId): BRepGraph_ShellRefId[];

  // BRepGraph_DefsIterator_ShellOfSolidTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  // BRepGraph_DefsIterator_ShellOfSolidTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ShellRef): BRepGraph_ShellId;

  // BRepGraph_DefsIterator_ShellOfSolidTraits.Child (method)
  static Child(theGraph: BRepGraph, theChildId: BRepGraph_ShellId): unknown;

  // BRepGraph_DefsIterator_ShellOfSolidTraits.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_ShellOfSolidTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_SolidOfCompSolidTraits: declare class BRepGraph_DefsIterator_SolidOfCompSolidTraits

  // BRepGraph_DefsIterator_SolidOfCompSolidTraits.constructor (constructor)
  constructor();

  // BRepGraph_DefsIterator_SolidOfCompSolidTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): boolean;

  // BRepGraph_DefsIterator_SolidOfCompSolidTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

  // BRepGraph_DefsIterator_SolidOfCompSolidTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  // BRepGraph_DefsIterator_SolidOfCompSolidTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_SolidRef): BRepGraph_SolidId;

  // BRepGraph_DefsIterator_SolidOfCompSolidTraits.Child (method)
  static Child(theGraph: BRepGraph, theChildId: BRepGraph_SolidId): unknown;

  // BRepGraph_DefsIterator_SolidOfCompSolidTraits.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_SolidOfCompSolidTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsIterator_WireOfFaceTraits: declare class BRepGraph_DefsIterator_WireOfFaceTraits

  // BRepGraph_DefsIterator_WireOfFaceTraits.constructor (constructor)
  constructor();

  // BRepGraph_DefsIterator_WireOfFaceTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_FaceId): boolean;

  // BRepGraph_DefsIterator_WireOfFaceTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_FaceId): BRepGraph_WireRefId[];

  // BRepGraph_DefsIterator_WireOfFaceTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  // BRepGraph_DefsIterator_WireOfFaceTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_WireRef): BRepGraph_WireId;

  // BRepGraph_DefsIterator_WireOfFaceTraits.Child (method)
  static Child(theGraph: BRepGraph, theChildId: BRepGraph_WireId): unknown;

  // BRepGraph_DefsIterator_WireOfFaceTraits.delete (method)
  delete(): void;

  // BRepGraph_DefsIterator_WireOfFaceTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsOccurrenceOfProduct: declare class BRepGraph_DefsOccurrenceOfProduct

  // BRepGraph_DefsOccurrenceOfProduct.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_DefsOccurrenceOfProduct.More (method)
  More(): boolean;

  // BRepGraph_DefsOccurrenceOfProduct.Next (method)
  Next(): void;

  // BRepGraph_DefsOccurrenceOfProduct.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_DefsOccurrenceOfProduct.Current (method)
  Current(): unknown;

  // BRepGraph_DefsOccurrenceOfProduct.CurrentRefId (method)
  CurrentRefId(): unknown;

  // BRepGraph_DefsOccurrenceOfProduct.Index (method)
  Index(): number;

  // BRepGraph_DefsOccurrenceOfProduct.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsOccurrenceOfProduct.delete (method)
  delete(): void;

  // BRepGraph_DefsOccurrenceOfProduct.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsShellOfSolid: declare class BRepGraph_DefsShellOfSolid

  // BRepGraph_DefsShellOfSolid.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_DefsShellOfSolid.More (method)
  More(): boolean;

  // BRepGraph_DefsShellOfSolid.Next (method)
  Next(): void;

  // BRepGraph_DefsShellOfSolid.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_DefsShellOfSolid.Current (method)
  Current(): unknown;

  // BRepGraph_DefsShellOfSolid.CurrentRefId (method)
  CurrentRefId(): unknown;

  // BRepGraph_DefsShellOfSolid.Index (method)
  Index(): number;

  // BRepGraph_DefsShellOfSolid.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsShellOfSolid.delete (method)
  delete(): void;

  // BRepGraph_DefsShellOfSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsSolidOfCompSolid: declare class BRepGraph_DefsSolidOfCompSolid

  // BRepGraph_DefsSolidOfCompSolid.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_DefsSolidOfCompSolid.More (method)
  More(): boolean;

  // BRepGraph_DefsSolidOfCompSolid.Next (method)
  Next(): void;

  // BRepGraph_DefsSolidOfCompSolid.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_DefsSolidOfCompSolid.Current (method)
  Current(): unknown;

  // BRepGraph_DefsSolidOfCompSolid.CurrentRefId (method)
  CurrentRefId(): unknown;

  // BRepGraph_DefsSolidOfCompSolid.Index (method)
  Index(): number;

  // BRepGraph_DefsSolidOfCompSolid.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsSolidOfCompSolid.delete (method)
  delete(): void;

  // BRepGraph_DefsSolidOfCompSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_DefsWireOfFace: declare class BRepGraph_DefsWireOfFace

  // BRepGraph_DefsWireOfFace.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_DefsWireOfFace.More (method)
  More(): boolean;

  // BRepGraph_DefsWireOfFace.Next (method)
  Next(): void;

  // BRepGraph_DefsWireOfFace.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_DefsWireOfFace.Current (method)
  Current(): unknown;

  // BRepGraph_DefsWireOfFace.CurrentRefId (method)
  CurrentRefId(): unknown;

  // BRepGraph_DefsWireOfFace.Index (method)
  Index(): number;

  // BRepGraph_DefsWireOfFace.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_DefsWireOfFace.delete (method)
  delete(): void;

  // BRepGraph_DefsWireOfFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_EditorView: declare class BRepGraph_EditorView

  // BRepGraph_EditorView.Vertices (method)
  Vertices(): unknown;

  // BRepGraph_EditorView.Edges (method)
  Edges(): unknown;

  // BRepGraph_EditorView.CoEdges (method)
  CoEdges(): unknown;

  // BRepGraph_EditorView.Wires (method)
  Wires(): unknown;

  // BRepGraph_EditorView.Faces (method)
  Faces(): unknown;

  // BRepGraph_EditorView.Shells (method)
  Shells(): unknown;

  // BRepGraph_EditorView.Solids (method)
  Solids(): unknown;

  // BRepGraph_EditorView.Compounds (method)
  Compounds(): unknown;

  // BRepGraph_EditorView.CompSolids (method)
  CompSolids(): unknown;

  // BRepGraph_EditorView.Products (method)
  Products(): unknown;

  // BRepGraph_EditorView.Occurrences (method)
  Occurrences(): unknown;

  // BRepGraph_EditorView.Gen (method)
  Gen(): unknown;

  // BRepGraph_EditorView.Supplement (method)
  Supplement(): BRepGraph_SupplementEditor;

  // BRepGraph_EditorView.BeginDeferredInvalidation (method)
  BeginDeferredInvalidation(): void;

  // BRepGraph_EditorView.EndDeferredInvalidation (method)
  EndDeferredInvalidation(): void;

  // BRepGraph_EditorView.IsDeferredMode (method)
  IsDeferredMode(): boolean;

  // BRepGraph_EditorView.CommitMutation (method)
  CommitMutation(): void;

  // BRepGraph_EditorView.ValidateMutationBoundary (method)
  ValidateMutationBoundary(theIssues?: BRepGraph_EditorView_BoundaryIssue[]): boolean;

  // BRepGraph_EditorView.delete (method)
  delete(): void;

  // BRepGraph_EditorView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ItemId: declare class BRepGraph_ItemId

  // BRepGraph_ItemId.constructor (constructor)
  constructor();
  constructor(theNode: BRepGraph_NodeId);
  constructor(theRef: BRepGraph_RefId);

  // BRepGraph_ItemId.IsValid (method)
  IsValid(): boolean;

  // BRepGraph_ItemId.ItemDomain (method)
  ItemDomain(): BRepGraph_ItemId_Domain;

  // BRepGraph_ItemId.IsNode (method)
  IsNode(): boolean;

  // BRepGraph_ItemId.IsReference (method)
  IsReference(): boolean;

  // BRepGraph_ItemId.NodeId (method)
  NodeId(): BRepGraph_NodeId;

  // BRepGraph_ItemId.RefId (method)
  RefId(): BRepGraph_RefId;

  // BRepGraph_ItemId.NodeKind (method)
  NodeKind(): BRepGraph_NodeId_Kind;

  // BRepGraph_ItemId.RefKind (method)
  RefKind(): BRepGraph_RefId_Kind;

  // BRepGraph_ItemId.RawKind (method)
  RawKind(): number;

  // BRepGraph_ItemId.Kind (method)
  Kind(): number;

  // BRepGraph_ItemId.Index (method)
  Index(): number;

  // BRepGraph_ItemId.delete (method)
  delete(): void;

  // BRepGraph_ItemId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ItemId_Domain: typeof BRepGraph_ItemId_Domain[keyof typeof BRepGraph_ItemId_Domain]

  readonly None: 'None'

  readonly Node: 'Node'

  readonly Reference: 'Reference'

BRepGraph_ItemUID: declare class BRepGraph_ItemUID

  // BRepGraph_ItemUID.constructor (constructor)
  constructor();

  // BRepGraph_ItemUID.Node (method)
  static Node(theKind: BRepGraph_NodeId_Kind, theCounter: number): BRepGraph_ItemUID;

  // BRepGraph_ItemUID.Reference (method)
  static Reference(theKind: BRepGraph_RefId_Kind, theCounter: number): BRepGraph_ItemUID;

  // BRepGraph_ItemUID.Invalid (method)
  static Invalid(): BRepGraph_ItemUID;

  // BRepGraph_ItemUID.IsValid (method)
  IsValid(): boolean;

  // BRepGraph_ItemUID.ItemDomain (method)
  ItemDomain(): BRepGraph_ItemUID_Domain;

  // BRepGraph_ItemUID.IsNode (method)
  IsNode(): boolean;

  // BRepGraph_ItemUID.IsReference (method)
  IsReference(): boolean;

  // BRepGraph_ItemUID.NodeKind (method)
  NodeKind(): BRepGraph_NodeId_Kind;

  // BRepGraph_ItemUID.RefKind (method)
  RefKind(): BRepGraph_RefId_Kind;

  // BRepGraph_ItemUID.RawKind (method)
  RawKind(): number;

  // BRepGraph_ItemUID.Counter (method)
  Counter(): number;

  // BRepGraph_ItemUID.HashValue (method)
  HashValue(): number;

  // BRepGraph_ItemUID.delete (method)
  delete(): void;

  // BRepGraph_ItemUID.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ItemUID_Domain: typeof BRepGraph_ItemUID_Domain[keyof typeof BRepGraph_ItemUID_Domain]

  readonly None: 'None'

  readonly Node: 'Node'

  readonly Reference: 'Reference'

BRepGraph_RootProductIterator: declare class BRepGraph_RootProductIterator

  // BRepGraph_RootProductIterator.constructor (constructor)
  constructor(theGraph: BRepGraph);

  // BRepGraph_RootProductIterator.More (method)
  More(): boolean;

  // BRepGraph_RootProductIterator.Next (method)
  Next(): void;

  // BRepGraph_RootProductIterator.Current (method)
  Current(): BRepGraph_ProductId;

  // BRepGraph_RootProductIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RootProductIterator.delete (method)
  delete(): void;

  // BRepGraph_RootProductIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
