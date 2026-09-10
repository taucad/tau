# libcascade — BRepGraph

41 top-level symbols. Signatures are verbatim typescript.

// Topology-geometry graph over `TopoDS` / BRep
BRepGraph: declare class BRepGraph

constructor

// Reset the graph to an empty state
Clear(): void;

// Return true when the graph contains no topology definitions
IsEmpty(): boolean;

// Verify relation consistency against entity / reference-entry tables
ValidateRelations(): boolean;

// Return root product identifiers (products not referenced by any active occurrence)
RootProductIds(): BRepGraph_ProductId[];

// Return the current allocator
Allocator(): NCollection_BaseAllocator;

// Return true when this wrapper references graph data
IsValid(): boolean;

// Return true when this wrapper does not reference graph data
IsNull(): boolean;

// Access topology definitions, representation access, adjacency queries, raw Product/Occurrence definition storage, and assembly classification
Topo(): BRepGraph_TopoView;

// Access unique identifiers
UIDs(): BRepGraph_UIDsView;

// Access reference entries and their UIDs
Refs(): BRepGraph_RefsView;

// Access cached and fresh shape reconstruction
Shapes(): BRepGraph_ShapesView;

// Access programmatic graph construction and mutation
Editor(): BRepGraph_EditorView;

// Access mesh data with explicit Cache()/Persistent() sub-views and `Editor()` for cache mutations
Mesh(): BRepGraph_MeshView;

// Access registered graph layers
LayerRegistry(): BRepGraph_LayerRegistry;

// Access registered graph cache services
CacheRegistry(): BRepGraph_CacheRegistry;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lightweight owner-bound base for transient graph cache services
BRepGraph_Cache: declare class BRepGraph_Cache extends Standard_Transient

// Cache service identity, unique within a graph registry
ID(): Standard_GUID;

// Cache service display name
Name(): TCollection_AsciiString;

// Clear all transient data owned by this cache
Clear(): void;

// Copy fresh, remappable cache data into the target graph described by the remap
CopyFreshTo(theCopy: BRepGraph_CopyRemap): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Cache for derived edge, wire, and shell properties
BRepGraph_CacheDerivedState: declare class BRepGraph_CacheDerivedState extends BRepGraph_Cache

constructor

// Returns the unique cache service GUID
static GetID(): Standard_GUID;

// Returns the unique cache service GUID
ID(): Standard_GUID;

// Returns the cache service display name
Name(): TCollection_AsciiString;

// Clears all cached entries
Clear(): void;

// Copy fresh, remappable derived-state entries into the target graph
CopyFreshTo(theCopy: BRepGraph_CopyRemap): void;

// Test if an edge is degenerate (no 3D curve and vertex collapse)
IsDegenerated(theEdge: BRepGraph_EdgeId): boolean;
// theEdge: edge definition identifier

// Test if a single coedge has SameParameter
SameParameter(theCoEdge: BRepGraph_CoEdgeId): boolean;
// theCoEdge: coedge definition identifier

// Test if a single coedge has SameRange
SameRange(theCoEdge: BRepGraph_CoEdgeId): boolean;
// theCoEdge: coedge definition identifier

// Test if an edge is closed (start vertex == end vertex)
IsClosed(theEdge: BRepGraph_EdgeId): boolean;
// theEdge: edge definition identifier

// Return wire closure, computing and storing a fresh entry
GetWireIsClosed(theWire: BRepGraph_WireId, theClosed?: boolean): { returnValue: boolean; theClosed: boolean };
// theWire: wire definition identifier
// theClosed: filled with the fresh derived value

// Store a pre-computed wire closure value
SetWireIsClosed(theWire: BRepGraph_WireId, theClosed: boolean): void;
// theWire: wire definition identifier
// theClosed: pre-computed closure value

// Test if a shell is closed
IsShellClosed(theShell: BRepGraph_ShellId): boolean;
// theShell: shell definition identifier

// Compute edge-own derived state (Status, IsClosed)
static ComputeEdgeProperties(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theIsDegenerated?: boolean, theIsClosed?: boolean): { returnValue: boolean; theIsDegenerated: boolean; theIsClosed: boolean };
// theGraph: source graph
// theEdge: edge definition identifier
// theIsDegenerated: true if edge is degenerate
// theIsClosed: true if edge is closed

// Compute shell closure directly from a {@link BRepGraph`BRepGraph`} without caching
static ComputeShellIsClosed(theGraph: BRepGraph, theShell: BRepGraph_ShellId): boolean;
// theGraph: source graph
// theShell: shell definition identifier

// Compute wire closure directly from a {@link BRepGraph`BRepGraph`} without caching
static ComputeWireIsClosed(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
// theGraph: source graph
// theWire: wire definition identifier

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterator over registered cache families in a {@link BRepGraph_CacheRegistry`BRepGraph_CacheRegistry`}
BRepGraph_CacheIterator: declare class BRepGraph_CacheIterator

constructor

// True if the iterator has a current element
More(): boolean;

// Advance to the next cache family
Next(): void;

// Return the current cache family descriptor
Value(): BRepGraph_Cache;

// Return the current slot index in the registry
Slot(): number;

// Number of cache families in the registry
NbCaches(): number;

// Sentinel marking end of iteration
end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CacheMesh_DirtySet: declare class BRepGraph_CacheMesh_DirtySet

constructor

Faces: BRepGraph_FaceId[]

FreeEdges: BRepGraph_EdgeId[]

IsEmpty(): boolean;

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CacheMesh_Driver: declare class BRepGraph_CacheMesh_Driver extends Standard_Transient

ID(): Standard_GUID;

RecipeHash(): number;

Fill(theGraph: BRepGraph, theSlot: number, theDirtySet: BRepGraph_CacheMesh_DirtySet, theRange: Message_ProgressRange): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CacheMesh_EdgeMeshEntry: declare class BRepGraph_CacheMesh_EdgeMeshEntry

constructor

Polygon3D: Poly_Polygon3D

Stamp: BRepGraph_CacheMesh_EntryStamp

IsPresent(): boolean;

Reset(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CacheMesh_EntryStamp: declare class BRepGraph_CacheMesh_EntryStamp

constructor

RecipeHash: number

SlotGeneration: number

Reset(): void;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// GUID-keyed runtime registry of graph cache services
BRepGraph_CacheRegistry: declare class BRepGraph_CacheRegistry

constructor

// Register a cache service
RegisterCache(theCache: BRepGraph_Cache): number;
// theCache: cache service

// Register a cache service
Register(theCache: BRepGraph_Cache): number;
// theCache: cache service

// Remove a cache service by GUID
UnregisterCache(theGUID: Standard_GUID): void;
// theGUID: cache identity

// Find a cache service by GUID
FindCache(theGUID: Standard_GUID): BRepGraph_Cache;
// theGUID: cache identity

// Return current graph-local slot for a GUID
FindSlot(theGUID: Standard_GUID, theSlot: number): { returnValue: boolean; theSlot: number };
FindSlot(theCache: BRepGraph_Cache, theSlot: number): { returnValue: boolean; theSlot: number };
FindSlot(theGUID: Standard_GUID, theSlot: number): { returnValue: boolean; theSlot: number };
FindSlot(theCache: BRepGraph_Cache, theSlot: number): { returnValue: boolean; theSlot: number };
// theGUID: cache family identity
// theSlot: graph-local slot index

// Return cache service by graph-local slot, or null handle if the slot is out of range
Cache(theSlot: number): BRepGraph_Cache;
// theSlot: graph-local cache slot

// Number of registered cache services
NbCaches(): number;

// Clear data in all registered cache services
ClearAll(): void;

// Ask registered cache services to copy fresh, remappable data into the target graph
CopyFreshCachesTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
CopyFreshCachesTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;
CopyFreshCachesTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
CopyFreshCachesTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;

// Unregister all cache services
Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Stack-based lazy downward hierarchy walker for {@link BRepGraph`BRepGraph`} with inline location/orientation accumulation
BRepGraph_ChildExplorer: declare class BRepGraph_ChildExplorer

constructor

// Returns the traversal configuration this explorer was constructed with
GetConfig(): BRepGraph_ChildExplorer_Config;

// True if another matching descendant is available
More(): boolean;

// Advance to the next matching descendant
Next(): void;

// Current matching descendant node with accumulated location and orientation
Current(): any;

// Returns the immediate parent of `Current()` in the explored path
CurrentParent(): BRepGraph_NodeId;

// Returns how `Current()` is linked from `CurrentParent()`
CurrentLinkKind(): BRepGraph_ChildExplorer_LinkKind;

// Returns the exact parent-owned RefId for `Current()`, when the current step is represented by a reference entry
CurrentRef(): BRepGraph_RefId;

// Returns the explicit concrete traversal path from the explorer root to `Current()`
CurrentUsagePath(): BRepGraph_UsagePath;

// Returns the accumulated location at the most recent ancestor of the given kind
LocationOf(theKind: BRepGraph_NodeId_Kind): TopLoc_Location;
// theKind: node kind to search for in the ancestor chain

// Returns the node id of the most recent ancestor of the given kind
NodeOf(theKind: BRepGraph_NodeId_Kind): BRepGraph_NodeId;
// theKind: node kind to search for in the ancestor chain

// Returns the accumulated location at the given stack level
LocationAt(theLevel: number): TopLoc_Location;
// theLevel: zero-based stack depth (0 = root)

// Returns the node id at the given stack level
NodeAt(theLevel: number): BRepGraph_NodeId;
// theLevel: zero-based stack depth (0 = root)

// Number of valid ancestor frames currently on the stack (excluding the sentinel below the root)
Depth(): number;

// Returns a sentinel marking the end of iteration
end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Relationship kind between `Current()` and `CurrentParent()`
BRepGraph_ChildExplorer_LinkKind: typeof BRepGraph_ChildExplorer_LinkKind[keyof typeof BRepGraph_ChildExplorer_LinkKind]

// Downward traversal strategy
BRepGraph_ChildExplorer_TraversalMode: typeof BRepGraph_ChildExplorer_TraversalMode[keyof typeof BRepGraph_ChildExplorer_TraversalMode]

// Graph compaction algorithm that reclaims removed node slots
BRepGraph_Compact: declare class BRepGraph_Compact

// Run compaction with default options
static Perform(theGraph: BRepGraph): BRepGraph_Compact_Result;
static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Compact_Options): BRepGraph_Compact_Result;
static Perform(theGraph: BRepGraph): BRepGraph_Compact_Result;
static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Compact_Options): BRepGraph_Compact_Result;
// theGraph: graph to compact

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Compact_Options: declare class BRepGraph_Compact_Options

constructor

HistoryMode: boolean

CacheMode: BRepGraph_Compact_Options_CachePolicy

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Compact_Options_CachePolicy: typeof BRepGraph_Compact_Options_CachePolicy[keyof typeof BRepGraph_Compact_Options_CachePolicy]

// Graph-to-graph deep copy
BRepGraph_Copy: declare class BRepGraph_Copy

// Copy the entire source graph into the target graph
static Perform(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy, theCachePolicy?: BRepGraph_Copy_CachePolicy): boolean;
// theSourceGraph: a pre-built {@link BRepGraph`BRepGraph`} (must not be empty)
// theTargetGraph: destination graph (may already contain data)
// theGeomPolicy: geometry handle policy (default
// theMeshPolicy: mesh data policy (default

// Copy a single node sub-graph of any kind (Face, Shell, Solid, Wire, Edge, Vertex, etc.)
static CopyNode(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theNodeId: BRepGraph_NodeId, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy, theCachePolicy?: BRepGraph_Copy_CachePolicy): BRepGraph_NodeId;
// theSourceGraph: a pre-built {@link BRepGraph`BRepGraph`}
// theTargetGraph: destination graph (may already contain data)
// theNodeId: node identifier (any kind)
// theGeomPolicy: geometry handle policy (default
// theMeshPolicy: mesh data policy (default

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Policy for handling geometry handles ({@link Geom_Curve`Geom_Curve`}, {@link Geom_Surface`Geom_Surface`}, {@link Geom2d_Curve`Geom2d_Curve`})
BRepGraph_Copy_GeomPolicy: typeof BRepGraph_Copy_GeomPolicy[keyof typeof BRepGraph_Copy_GeomPolicy]

// Policy for handling mesh data ({@link Poly_Triangulation`Poly_Triangulation`}, {@link Poly_Polygon3D`Poly_Polygon3D`}, {@link Poly_PolygonOnTriangulation`Poly_PolygonOnTriangulation`})
BRepGraph_Copy_MeshPolicy: typeof BRepGraph_Copy_MeshPolicy[keyof typeof BRepGraph_Copy_MeshPolicy]

// Policy for handling transient runtime cache services
BRepGraph_Copy_CachePolicy: typeof BRepGraph_Copy_CachePolicy[keyof typeof BRepGraph_Copy_CachePolicy]

// Immutable context passed to layer copy callbacks
BRepGraph_CopyRemap: declare class BRepGraph_CopyRemap

constructor

// Migration mode of this context
CopyMode(): BRepGraph_CopyRemap_Mode;

// True if this is a compaction migration (not a full copy)
IsCompact(): boolean;

// Source graph the copied layer is attached to
SourceGraph(): BRepGraph;

// Target graph whose structural contents have already been copied
TargetGraph(): BRepGraph;

// Target graph as const
TargetGraphConst(): BRepGraph;

// Source item id -> target item id map for copied definitions, refs, and reps
Items(): any;

// Return the target item for a source item, or an invalid item if not copied
TargetItem(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemId;

// Return the target item for a source item, or an invalid item id
TargetItemOrInvalid(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemId;

// Return true if the source item has a valid copied target item
HasTargetItem(theSourceItem: BRepGraph_ItemId): boolean;

// Return source UID for a source item
SourceUID(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemUID;

// Return target UID for a target item
TargetUID(theTargetItem: BRepGraph_ItemId): BRepGraph_ItemUID;

// Return target UID for a source item by source->target remap
TargetUIDFromSource(theSourceItem: BRepGraph_ItemId): BRepGraph_ItemUID;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Distinguishes copy vs
BRepGraph_CopyRemap_Mode: typeof BRepGraph_CopyRemap_Mode[keyof typeof BRepGraph_CopyRemap_Mode]

// Distinguishes explicit item map vs
BRepGraph_CopyRemap_MappingKind: typeof BRepGraph_CopyRemap_MappingKind[keyof typeof BRepGraph_CopyRemap_MappingKind]

// Internal storage for {@link BRepGraph`BRepGraph`} (PIMPL)
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Deep geometry deduplication algorithm over an existing {@link BRepGraph`BRepGraph`}
BRepGraph_Deduplicate: declare class BRepGraph_Deduplicate

// Run deduplication on a built graph
static Perform(theGraph: BRepGraph): BRepGraph_Deduplicate_Result;
static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Deduplicate_Options): BRepGraph_Deduplicate_Result;
static Perform(theGraph: BRepGraph): BRepGraph_Deduplicate_Result;
static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Deduplicate_Options): BRepGraph_Deduplicate_Result;
// theGraph: graph to update

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// RAII guard for batch mutation scopes with deferred invalidation
BRepGraph_DeferredScope: declare class BRepGraph_DeferredScope

constructor

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_DefsIterator_ChildOfCompoundTraits: declare class BRepGraph_DefsIterator_ChildOfCompoundTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): BRepGraph_ChildRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ChildRef): BRepGraph_NodeId;

static Child(theGraph: BRepGraph, theChildId: BRepGraph_NodeId): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_DefsIterator_CoEdgeOfWireTraits: declare class BRepGraph_DefsIterator_CoEdgeOfWireTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

static Child(theGraph: BRepGraph, theChildId: BRepGraph_CoEdgeId): unknown;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_DefsIterator_EdgeOfWireTraits: declare class BRepGraph_DefsIterator_EdgeOfWireTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

static ChildIdOf(theGraph: BRepGraph, theRef: BRepGraphInc_CoEdgeDef): BRepGraph_EdgeId;

static Child(theGraph: BRepGraph, theChildId: BRepGraph_EdgeId): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_DefsIterator_FaceOfShellTraits: declare class BRepGraph_DefsIterator_FaceOfShellTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ShellId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ShellId): BRepGraph_FaceRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_FaceRef): BRepGraph_FaceId;

static Child(theGraph: BRepGraph, theChildId: BRepGraph_FaceId): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_DefsIterator_OccurrenceOfProductTraits: declare class BRepGraph_DefsIterator_OccurrenceOfProductTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ProductId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_OccurrenceRef): BRepGraph_OccurrenceId;

static Child(theGraph: BRepGraph, theChildId: BRepGraph_OccurrenceId): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_DefsIterator_ShellOfSolidTraits: declare class BRepGraph_DefsIterator_ShellOfSolidTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_SolidId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_SolidId): BRepGraph_ShellRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ShellRef): BRepGraph_ShellId;

static Child(theGraph: BRepGraph, theChildId: BRepGraph_ShellId): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_DefsIterator_SolidOfCompSolidTraits: declare class BRepGraph_DefsIterator_SolidOfCompSolidTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_SolidRef): BRepGraph_SolidId;

static Child(theGraph: BRepGraph, theChildId: BRepGraph_SolidId): unknown;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_DefsIterator_WireOfFaceTraits: declare class BRepGraph_DefsIterator_WireOfFaceTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_FaceId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_FaceId): BRepGraph_WireRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_WireRef): BRepGraph_WireId;

static Child(theGraph: BRepGraph, theChildId: BRepGraph_WireId): unknown;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
