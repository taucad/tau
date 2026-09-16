# libcascade — BRepGraph

51 top-level symbols. Signatures are verbatim typescript.

BRepGraph: declare class BRepGraph

  constructor

  Clear(): void;

  IsEmpty(): boolean;

  ValidateRelations(): boolean;

  RootProductIds(): BRepGraph_ProductId[];

  Allocator(): NCollection_BaseAllocator;

  IsValid(): boolean;

  IsNull(): boolean;

  Topo(): BRepGraph_TopoView;

  UIDs(): BRepGraph_UIDsView;

  Refs(): BRepGraph_RefsView;

  Shapes(): BRepGraph_ShapesView;

  Editor(): BRepGraph_EditorView;

  Mesh(): BRepGraph_MeshView;

  LayerRegistry(): BRepGraph_LayerRegistry;

  CacheRegistry(): BRepGraph_CacheRegistry;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Cache: declare class BRepGraph_Cache extends Standard_Transient

  ID(): Standard_GUID;

  Name(): TCollection_AsciiString;

  Clear(): void;

  CopyFreshTo(theCopy: BRepGraph_CopyRemap): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheDerivedState: declare class BRepGraph_CacheDerivedState extends BRepGraph_Cache

  constructor

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  Name(): TCollection_AsciiString;

  Clear(): void;

  CopyFreshTo(theCopy: BRepGraph_CopyRemap): void;

  IsDegenerated(theEdge: BRepGraph_EdgeId): boolean;

  SameParameter(theCoEdge: BRepGraph_CoEdgeId): boolean;

  SameRange(theCoEdge: BRepGraph_CoEdgeId): boolean;

  IsClosed(theEdge: BRepGraph_EdgeId): boolean;

  GetWireIsClosed(theWire: BRepGraph_WireId, theClosed?: boolean): { returnValue: boolean; theClosed: boolean };

  SetWireIsClosed(theWire: BRepGraph_WireId, theClosed: boolean): void;

  IsShellClosed(theShell: BRepGraph_ShellId): boolean;

  static ComputeEdgeProperties(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theIsDegenerated?: boolean, theIsClosed?: boolean): { returnValue: boolean; theIsDegenerated: boolean; theIsClosed: boolean };

  static ComputeShellIsClosed(theGraph: BRepGraph, theShell: BRepGraph_ShellId): boolean;

  static ComputeWireIsClosed(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheIterator: declare class BRepGraph_CacheIterator

  constructor

  More(): boolean;

  Next(): void;

  Value(): BRepGraph_Cache;

  Slot(): number;

  NbCaches(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheMesh_CoEdgeMeshEntry: declare class BRepGraph_CacheMesh_CoEdgeMeshEntry

  constructor

  CoEdgeStamp: unknown

  FaceTopologyStamp: unknown

  FaceMeshGeneration: number

  BoundFaceId: BRepGraph_FaceId

  SlotStamp: BRepGraph_CacheMesh_EntryStamp

  Polygon2D: Poly_Polygon2D

  PolygonsOnTri: Poly_PolygonOnTriangulation[]

  IsPresent(): boolean;

  Reset(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheMesh_DirtySet: declare class BRepGraph_CacheMesh_DirtySet

  constructor

  Faces: BRepGraph_FaceId[]

  FreeEdges: BRepGraph_EdgeId[]

  IsEmpty(): boolean;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheMesh_Driver: declare class BRepGraph_CacheMesh_Driver extends Standard_Transient

  ID(): Standard_GUID;

  RecipeHash(): number;

  Fill(theGraph: BRepGraph, theSlot: number, theDirtySet: BRepGraph_CacheMesh_DirtySet, theRange: Message_ProgressRange): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheMesh_EdgeMeshEntry: declare class BRepGraph_CacheMesh_EdgeMeshEntry

  constructor

  Polygon3D: Poly_Polygon3D

  Stamp: BRepGraph_CacheMesh_EntryStamp

  IsPresent(): boolean;

  Reset(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheMesh_EntryStamp: declare class BRepGraph_CacheMesh_EntryStamp

  constructor

  RecipeHash: number

  SlotGeneration: number

  Reset(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheMesh_FaceMeshEntry: declare class BRepGraph_CacheMesh_FaceMeshEntry

  constructor

  Triangulation: Poly_Triangulation

  Stamp: BRepGraph_CacheMesh_EntryStamp

  MeshGeneration: number

  IsPresent(): boolean;

  ClearRepresentation(): void;

  Reset(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CacheRegistry: declare class BRepGraph_CacheRegistry

  constructor

  RegisterCache(theCache: BRepGraph_Cache): number;

  Register(theCache: BRepGraph_Cache): number;

  UnregisterCache(theGUID: Standard_GUID): void;

  FindCache(theGUID: Standard_GUID): BRepGraph_Cache;

  FindSlot(theGUID: Standard_GUID, theSlot: number): { returnValue: boolean; theSlot: number };
  FindSlot(theCache: BRepGraph_Cache, theSlot: number): { returnValue: boolean; theSlot: number };
  FindSlot(theGUID: Standard_GUID, theSlot: number): { returnValue: boolean; theSlot: number };
  FindSlot(theCache: BRepGraph_Cache, theSlot: number): { returnValue: boolean; theSlot: number };

  Cache(theSlot: number): BRepGraph_Cache;

  NbCaches(): number;

  ClearAll(): void;

  CopyFreshCachesTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
  CopyFreshCachesTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;
  CopyFreshCachesTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
  CopyFreshCachesTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;

  Clear(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ChildExplorer: declare class BRepGraph_ChildExplorer

  constructor

  GetConfig(): BRepGraph_ChildExplorer_Config;

  More(): boolean;

  Next(): void;

  Current(): any;

  CurrentParent(): BRepGraph_NodeId;

  CurrentLinkKind(): BRepGraph_ChildExplorer_LinkKind;

  CurrentRef(): BRepGraph_RefId;

  CurrentUsagePath(): BRepGraph_UsagePath;

  LocationOf(theKind: BRepGraph_NodeId_Kind): TopLoc_Location;

  NodeOf(theKind: BRepGraph_NodeId_Kind): BRepGraph_NodeId;

  LocationAt(theLevel: number): TopLoc_Location;

  NodeAt(theLevel: number): BRepGraph_NodeId;

  Depth(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ChildExplorer_LinkKind: typeof BRepGraph_ChildExplorer_LinkKind[keyof typeof BRepGraph_ChildExplorer_LinkKind]

BRepGraph_ChildExplorer_TraversalMode: typeof BRepGraph_ChildExplorer_TraversalMode[keyof typeof BRepGraph_ChildExplorer_TraversalMode]

BRepGraph_Compact: declare class BRepGraph_Compact

  static Perform(theGraph: BRepGraph): BRepGraph_Compact_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Compact_Options): BRepGraph_Compact_Result;
  static Perform(theGraph: BRepGraph): BRepGraph_Compact_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Compact_Options): BRepGraph_Compact_Result;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Compact_Options: declare class BRepGraph_Compact_Options

  constructor

  HistoryMode: boolean

  CacheMode: BRepGraph_Compact_Options_CachePolicy

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Compact_Options_CachePolicy: typeof BRepGraph_Compact_Options_CachePolicy[keyof typeof BRepGraph_Compact_Options_CachePolicy]

BRepGraph_Copy: declare class BRepGraph_Copy

  static Perform(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy, theCachePolicy?: BRepGraph_Copy_CachePolicy): boolean;

  static CopyNode(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theNodeId: BRepGraph_NodeId, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy, theCachePolicy?: BRepGraph_Copy_CachePolicy): BRepGraph_NodeId;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Copy_GeomPolicy: typeof BRepGraph_Copy_GeomPolicy[keyof typeof BRepGraph_Copy_GeomPolicy]

BRepGraph_Copy_MeshPolicy: typeof BRepGraph_Copy_MeshPolicy[keyof typeof BRepGraph_Copy_MeshPolicy]

BRepGraph_Copy_CachePolicy: typeof BRepGraph_Copy_CachePolicy[keyof typeof BRepGraph_Copy_CachePolicy]

BRepGraph_CopyRemap: declare class BRepGraph_CopyRemap

  constructor

  CopyMode(): BRepGraph_CopyRemap_Mode;

  IsCompact(): boolean;

  SourceGraph(): BRepGraph;

  TargetGraph(): BRepGraph;

  TargetGraphConst(): BRepGraph;

  Items(): any;

  TargetItem(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemId;

  TargetItemOrInvalid(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemId;

  HasTargetItem(theSourceItem: BRepGraph_ItemId): boolean;

  SourceUID(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemUID;

  TargetUID(theTargetItem: BRepGraph_ItemId): BRepGraph_ItemUID;

  TargetUIDFromSource(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemUID;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_CopyRemap_Mode: typeof BRepGraph_CopyRemap_Mode[keyof typeof BRepGraph_CopyRemap_Mode]

BRepGraph_CopyRemap_MappingKind: typeof BRepGraph_CopyRemap_MappingKind[keyof typeof BRepGraph_CopyRemap_MappingKind]

BRepGraph_Data: declare class BRepGraph_Data

  constructor

  myIncStorage: BRepGraphInc_Storage

  myLayerRegistry: BRepGraph_LayerRegistry

  myCacheRegistry: BRepGraph_CacheRegistry

  myTopoView: BRepGraph_TopoView

  myUIDsView: BRepGraph_UIDsView

  myRefsView: BRepGraph_RefsView

  myShapesView: BRepGraph_ShapesView

  myEditorView: BRepGraph_EditorView

  myMeshView: BRepGraph_MeshView

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Deduplicate: declare class BRepGraph_Deduplicate

  static Perform(theGraph: BRepGraph): BRepGraph_Deduplicate_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Deduplicate_Options): BRepGraph_Deduplicate_Result;
  static Perform(theGraph: BRepGraph): BRepGraph_Deduplicate_Result;
  static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Deduplicate_Options): BRepGraph_Deduplicate_Result;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DeferredScope: declare class BRepGraph_DeferredScope

  constructor

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsChildOfCompound: declare class BRepGraph_DefsChildOfCompound

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): unknown;

  Current(): unknown;

  CurrentRefId(): unknown;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsCoEdgeOfWire: declare class BRepGraph_DefsCoEdgeOfWire

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): unknown;

  Current(): unknown;

  CurrentRefId(): unknown;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsEdgeOfWire: declare class BRepGraph_DefsEdgeOfWire

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): unknown;

  Current(): unknown;

  CurrentRefId(): unknown;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsFaceOfShell: declare class BRepGraph_DefsFaceOfShell

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): unknown;

  Current(): unknown;

  CurrentRefId(): unknown;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_ChildOfCompoundTraits: declare class BRepGraph_DefsIterator_ChildOfCompoundTraits

  constructor

  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): boolean;

  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): BRepGraph_ChildRefId[];

  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ChildRef): BRepGraph_NodeId;

  static Child(theGraph: BRepGraph, theChildId: BRepGraph_NodeId): unknown;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_CoEdgeOfWireTraits: declare class BRepGraph_DefsIterator_CoEdgeOfWireTraits

  constructor

  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  static Child(theGraph: BRepGraph, theChildId: BRepGraph_CoEdgeId): unknown;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_DefsVertexOfEdge: declare class BRepGraph_DefsIterator_DefsVertexOfEdge

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): BRepGraph_VertexId;

  Current(): BRepGraphInc_VertexDef;

  CurrentRefId(): BRepGraph_VertexRefId;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_EdgeOfWireTraits: declare class BRepGraph_DefsIterator_EdgeOfWireTraits

  constructor

  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  static ChildIdOf(theGraph: BRepGraph, theRef: BRepGraphInc_CoEdgeDef): BRepGraph_EdgeId;

  static Child(theGraph: BRepGraph, theChildId: BRepGraph_EdgeId): unknown;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_FaceOfShellTraits: declare class BRepGraph_DefsIterator_FaceOfShellTraits

  constructor

  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ShellId): boolean;

  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ShellId): BRepGraph_FaceRefId[];

  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_FaceRef): BRepGraph_FaceId;

  static Child(theGraph: BRepGraph, theChildId: BRepGraph_FaceId): unknown;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_OccurrenceOfProductTraits: declare class BRepGraph_DefsIterator_OccurrenceOfProductTraits

  constructor

  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ProductId): boolean;

  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_OccurrenceRef): BRepGraph_OccurrenceId;

  static Child(theGraph: BRepGraph, theChildId: BRepGraph_OccurrenceId): unknown;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_ShellOfSolidTraits: declare class BRepGraph_DefsIterator_ShellOfSolidTraits

  constructor

  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_SolidId): boolean;

  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_SolidId): BRepGraph_ShellRefId[];

  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ShellRef): BRepGraph_ShellId;

  static Child(theGraph: BRepGraph, theChildId: BRepGraph_ShellId): unknown;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_SolidOfCompSolidTraits: declare class BRepGraph_DefsIterator_SolidOfCompSolidTraits

  constructor

  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): boolean;

  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_SolidRef): BRepGraph_SolidId;

  static Child(theGraph: BRepGraph, theChildId: BRepGraph_SolidId): unknown;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsIterator_WireOfFaceTraits: declare class BRepGraph_DefsIterator_WireOfFaceTraits

  constructor

  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_FaceId): boolean;

  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_FaceId): BRepGraph_WireRefId[];

  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_WireRef): BRepGraph_WireId;

  static Child(theGraph: BRepGraph, theChildId: BRepGraph_WireId): unknown;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsOccurrenceOfProduct: declare class BRepGraph_DefsOccurrenceOfProduct

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): unknown;

  Current(): unknown;

  CurrentRefId(): unknown;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsShellOfSolid: declare class BRepGraph_DefsShellOfSolid

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): unknown;

  Current(): unknown;

  CurrentRefId(): unknown;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsSolidOfCompSolid: declare class BRepGraph_DefsSolidOfCompSolid

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): unknown;

  Current(): unknown;

  CurrentRefId(): unknown;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_DefsWireOfFace: declare class BRepGraph_DefsWireOfFace

  constructor

  More(): boolean;

  Next(): void;

  CurrentId(): unknown;

  Current(): unknown;

  CurrentRefId(): unknown;

  Index(): number;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_EditorView: declare class BRepGraph_EditorView

  Vertices(): unknown;

  Edges(): unknown;

  CoEdges(): unknown;

  Wires(): unknown;

  Faces(): unknown;

  Shells(): unknown;

  Solids(): unknown;

  Compounds(): unknown;

  CompSolids(): unknown;

  Products(): unknown;

  Occurrences(): unknown;

  Gen(): unknown;

  Supplement(): BRepGraph_SupplementEditor;

  BeginDeferredInvalidation(): void;

  EndDeferredInvalidation(): void;

  IsDeferredMode(): boolean;

  CommitMutation(): void;

  ValidateMutationBoundary(theIssues?: BRepGraph_EditorView_BoundaryIssue[]): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ItemId: declare class BRepGraph_ItemId

  constructor

  IsValid(): boolean;

  ItemDomain(): BRepGraph_ItemId_Domain;

  IsNode(): boolean;

  IsReference(): boolean;

  NodeId(): BRepGraph_NodeId;

  RefId(): BRepGraph_RefId;

  NodeKind(): BRepGraph_NodeId_Kind;

  RefKind(): BRepGraph_RefId_Kind;

  RawKind(): number;

  Kind(): number;

  Index(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ItemId_Domain: typeof BRepGraph_ItemId_Domain[keyof typeof BRepGraph_ItemId_Domain]

BRepGraph_ItemUID: declare class BRepGraph_ItemUID

  constructor

  static Node(theKind: BRepGraph_NodeId_Kind, theCounter: number): BRepGraph_ItemUID;

  static Reference(theKind: BRepGraph_RefId_Kind, theCounter: number): BRepGraph_ItemUID;

  static Invalid(): BRepGraph_ItemUID;

  IsValid(): boolean;

  ItemDomain(): BRepGraph_ItemUID_Domain;

  IsNode(): boolean;

  IsReference(): boolean;

  NodeKind(): BRepGraph_NodeId_Kind;

  RefKind(): BRepGraph_RefId_Kind;

  RawKind(): number;

  Counter(): number;

  HashValue(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_ItemUID_Domain: typeof BRepGraph_ItemUID_Domain[keyof typeof BRepGraph_ItemUID_Domain]

BRepGraph_RootProductIterator: declare class BRepGraph_RootProductIterator

  constructor

  More(): boolean;

  Next(): void;

  Current(): BRepGraph_ProductId;

  end(): NCollection_ForwardRangeSentinel;

  delete(): void;

  [Symbol.dispose](): void;

BRepGraph_Layer: declare class BRepGraph_Layer extends Standard_Transient

  ID(): Standard_GUID;

  Name(): TCollection_AsciiString;

  OnNodeRemoved(theNode: BRepGraph_NodeId): void;

  OnItemRemoved(theItem: BRepGraph_ItemId): void;

  OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

  CopyTo(theCopy: BRepGraph_CopyRemap): void;

  InvalidateAll(): void;

  Clear(): void;

  SubscribedKinds(): number;

  OnNodeModified(theNode: BRepGraph_NodeId): void;

  OnItemModified(theItem: BRepGraph_ItemId): void;

  OnNodesModified(theModifiedNodes: NCollection_Array1_BRepGraph_NodeId): void;

  static KindBit(theKind: BRepGraph_NodeId_Kind): number;

  SubscribedRefKinds(): number;

  OnRefRemoved(theRef: BRepGraph_RefId): void;

  OnRefModified(theRef: BRepGraph_RefId): void;

  OnRefsModified(theModifiedRefs: NCollection_Array1_BRepGraph_RefId): void;

  static RefKindBit(theKind: BRepGraph_RefId_Kind): number;

  Revision(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
