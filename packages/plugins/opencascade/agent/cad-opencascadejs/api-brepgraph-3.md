# libcascade — BRepGraph (3)

20 top-level symbols. Signatures are verbatim typescript.

// History layer for {@link BRepGraph`BRepGraph`}
BRepGraph_LayerHistory: declare class BRepGraph_LayerHistory extends BRepGraph_Layer

constructor

// Stable layer GUID
static GetID(): Standard_GUID;

// Layer type identity
ID(): Standard_GUID;

// Layer display name
Name(): TCollection_AsciiString;

// Record a modification
Record(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theKind: BRepGraph_LayerHistory_Kind): void;
Record(theRecordIdx: number): BRepGraph_LayerHistory_Event;
Record(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theKind: BRepGraph_LayerHistory_Kind): void;
Record(theRecordIdx: number): BRepGraph_LayerHistory_Event;
// theOpLabel: human-readable operation name
// theOriginal: node id before the operation
// theReplacements: node ids after the operation
// theKind: classification of this record (default Modified)

// Record a batch of 1-to-1 modifications in a single history event
RecordBatch(theOpLabel: TCollection_AsciiString, theOriginals: NCollection_Array1_BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theExtraInfo?: TCollection_AsciiString, theKind?: BRepGraph_LayerHistory_Kind): void;
// theOpLabel: human-readable operation name
// theOriginals: node ids before the operation
// theReplacements: node ids after the operation (same length)
// theExtraInfo: optional diagnostic info stored on the record
// theKind: classification of this record (default Modified)

// Record that a collection of inputs has been consumed by the operation and has no image in the result
RecordDeleted(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_NodeId): void;
// theOpLabel: human-readable operation name
// theDeleted: node ids that have been removed

// Record replacements
RecordReplaced(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_NodeId, theReplacement: BRepGraph_NodeId): void;

// Record a batch of 1-to-1 replacements in a single history event
RecordReplacedBatch(theOpLabel: TCollection_AsciiString, theOriginals: NCollection_Array1_BRepGraph_NodeId, theReplacements: NCollection_Array1_BRepGraph_NodeId, theExtraInfo?: TCollection_AsciiString): void;

// Record a UID-keyed modification/generation event
RecordUid(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_UID, theReplacements: NCollection_Array1_BRepGraph_UID, theKind?: BRepGraph_LayerHistory_Kind): void;

// Record UID-keyed deletions
RecordDeletedUid(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_UID): void;

// Record an all-domain ItemUID-keyed modification/generation event
RecordItemUid(theOpLabel: TCollection_AsciiString, theOriginal: BRepGraph_ItemUID, theReplacements: NCollection_Array1_BRepGraph_ItemUID, theKind?: BRepGraph_LayerHistory_Kind): void;

// Record ItemUID-keyed deletions
RecordDeletedItemUid(theOpLabel: TCollection_AsciiString, theDeleted: NCollection_Array1_BRepGraph_ItemUID): void;

// Import a {@link BRepTools_History`BRepTools_History`} into this graph-native history log
Absorb(theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;
Absorb(theInputGraph: BRepGraph, theOutputGraph: BRepGraph, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;
Absorb(theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;
Absorb(theInputGraph: BRepGraph, theOutputGraph: BRepGraph, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theOutputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theSource: BRepTools_History, theOpLabel: TCollection_AsciiString): void;
// theInputs: {@link TopoDS_Shape`TopoDS_Shape`} -> NodeId for every input subshape that should be tracked
// theOutputs: {@link TopoDS_Shape`TopoDS_Shape`} -> NodeId for every subshape added to the graph by this operation (typically from `BRepGraph::ShapesView::Add` with TrackAddedNodes)
// theSource: {@link BRepTools_History`BRepTools_History`} from the OCCT algorithm
// theOpLabel: record label written into every emitted record

// Walk backwards from a modified node to its original
FindOriginal(theModified: BRepGraph_NodeId): BRepGraph_NodeId;
// theModified: node id to trace back

// Walk forwards from an original node to all derived nodes, including both Modified and Generated descendants
FindDerived(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
// theOriginal: node id to trace forward

// Direct lookup of the Modified images of `theOriginal`, non-recursive
FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
FindModified(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
FindModified(theUID: BRepGraph_UID): BRepGraph_UID[];
FindModified(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
FindModified(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
// theOriginal: node id to query

// Direct lookup of the Generated images of `theOriginal`, non-recursive
FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
FindGenerated(theOriginal: BRepGraph_NodeId): BRepGraph_NodeId[];
FindGenerated(theUID: BRepGraph_UID): BRepGraph_UID[];
FindGenerated(theUID: BRepGraph_ItemUID): BRepGraph_ItemUID[];
FindGenerated(theGraph: BRepGraph, theUID: BRepGraph_UID): BRepGraph_UID[];
// theOriginal: node id to query

// Test whether `theOriginal` was deleted by some recorded operation
IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
IsDeleted(theUID: BRepGraph_UID): boolean;
IsDeleted(theUID: BRepGraph_ItemUID): boolean;
IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;
IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
IsDeleted(theUID: BRepGraph_UID): boolean;
IsDeleted(theUID: BRepGraph_ItemUID): boolean;
IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;
IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
IsDeleted(theUID: BRepGraph_UID): boolean;
IsDeleted(theUID: BRepGraph_ItemUID): boolean;
IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;
IsDeleted(theOriginal: BRepGraph_NodeId): boolean;
IsDeleted(theUID: BRepGraph_UID): boolean;
IsDeleted(theUID: BRepGraph_ItemUID): boolean;
IsDeleted(theGraph: BRepGraph, theUID: BRepGraph_UID): boolean;
// theOriginal: node id to query

// Borrowed access to the full deleted set
DeletedNodes(): any;

// Direct lookup of all immediate node origins of `theDerived`
FindOriginals(theDerived: BRepGraph_NodeId): BRepGraph_NodeId[];

// UID-keyed deleted set stored directly in this history
DeletedUids(): any;
DeletedUids(theGraph: BRepGraph): BRepGraph_UID[];
DeletedUids(): any;
DeletedUids(theGraph: BRepGraph): BRepGraph_UID[];

// Test whether `theUID` was registered as an operation input
HasKnownInput(theUID: BRepGraph_UID): boolean;
HasKnownInput(theUID: BRepGraph_ItemUID): boolean;
HasKnownInput(theUID: BRepGraph_UID): boolean;
HasKnownInput(theUID: BRepGraph_ItemUID): boolean;

// ItemUID-keyed deleted set stored directly in this history
DeletedItemUids(): any;

// Number of recorded history events
NbRecords(): number;

// Enable or disable history recording
SetEnabled(theVal: boolean): void;
// theVal: true to enable, false to disable

// Query whether history recording is enabled
IsEnabled(): boolean;

// Clear all records and lookup maps
Clear(): void;

// Layer removal callback
OnNodeRemoved(theNode: BRepGraph_NodeId): void;

// Copy history records whose source items have copied target items
CopyTo(theCopy: BRepGraph_CopyRemap): void;

// Clear derived caches by dropping collected history
InvalidateAll(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Classification of a history event
BRepGraph_LayerHistory_Kind: typeof BRepGraph_LayerHistory_Kind[keyof typeof BRepGraph_LayerHistory_Kind]

// Iterator over registered layers in a {@link BRepGraph_LayerRegistry`BRepGraph_LayerRegistry`}
BRepGraph_LayerIterator: declare class BRepGraph_LayerIterator

constructor

// True if the iterator has a current element
More(): boolean;

// Advance to the next layer
Next(): void;

// Return the current layer handle
Value(): BRepGraph_Layer;

// Return the current slot index in the registry
Slot(): number;

// Number of layers in the registry
NbLayers(): number;

// Sentinel marking end of iteration
end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Owner metadata layer for owned {@link BRepGraph`BRepGraph`} items
BRepGraph_LayerLock: declare class BRepGraph_LayerLock extends BRepGraph_Layer

constructor

// Return fixed layer type GUID
static GetID(): Standard_GUID;

// Return this layer type GUID
ID(): Standard_GUID;

// Return owner ID for an item
FindOwnerId(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): boolean;
FindOwnerId(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): boolean;
FindOwnerId(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): boolean;
FindOwnerId(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): boolean;
FindOwnerId(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): boolean;
FindOwnerId(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): boolean;
FindOwnerId(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): boolean;
FindOwnerId(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): boolean;
FindOwnerId(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): boolean;
// theOwnerId: Mutated in place

// Return true if an item's IsOwned bit-flag is set
HasOwner(theItem: BRepGraph_ItemId): boolean;
HasOwner(theNode: BRepGraph_NodeId): boolean;
HasOwner(theRef: BRepGraph_RefId): boolean;
HasOwner(theItem: BRepGraph_ItemId): boolean;
HasOwner(theNode: BRepGraph_NodeId): boolean;
HasOwner(theRef: BRepGraph_RefId): boolean;
HasOwner(theItem: BRepGraph_ItemId): boolean;
HasOwner(theNode: BRepGraph_NodeId): boolean;
HasOwner(theRef: BRepGraph_RefId): boolean;

// Register an owner ID and set the graph item's ownership flag
SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;
SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;
SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;
SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
SetOwner(theNode: BRepGraph_NodeId, theOwnerId: Standard_GUID): void;
SetOwner(theRef: BRepGraph_RefId, theOwnerId: Standard_GUID): void;
SetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID, theToUpdateRevision: boolean): boolean;

// Remove an owner and clear the graph item's ownership flag
UnsetOwner(theItem: BRepGraph_ItemId): void;
UnsetOwner(theNode: BRepGraph_NodeId): void;
UnsetOwner(theRef: BRepGraph_RefId): void;
UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
UnsetOwner(theItem: BRepGraph_ItemId): void;
UnsetOwner(theNode: BRepGraph_NodeId): void;
UnsetOwner(theRef: BRepGraph_RefId): void;
UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
UnsetOwner(theItem: BRepGraph_ItemId): void;
UnsetOwner(theNode: BRepGraph_NodeId): void;
UnsetOwner(theRef: BRepGraph_RefId): void;
UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;
UnsetOwner(theItem: BRepGraph_ItemId): void;
UnsetOwner(theNode: BRepGraph_NodeId): void;
UnsetOwner(theRef: BRepGraph_RefId): void;
UnsetOwner(theItem: BRepGraph_ItemId, theOwnerId: Standard_GUID): void;

// Return true if at least one root entry exists
HasOwners(): boolean;

// Reserve owner map buckets for bulk registration
ReserveOwners(theNbOwners: number): void;

// Mark owner metadata changed after a bulk update
TouchOwners(): void;

// Layer identity (unique within a graph)
Name(): TCollection_AsciiString;

// Called when a node is soft-removed without a replacement
OnNodeRemoved(theNode: BRepGraph_NodeId): void;
// theNode: the removed node Layers should discard or archive data associated with it

// Called when a node is soft-removed and replaced by another node
OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;
// theOldNode: the removed node
// theNewNode: the node that replaces theOldNode Layers that store node-keyed data should migrate from theOldNode to theNewNode when the replacement kind is compatible

// Copy this source layer data into another graph
CopyTo(theCopy: BRepGraph_CopyRemap): void;
// theCopy: source graph, target graph, and source item id -> target item id remap

// Called when a reference is soft-deleted via RemoveRef()
OnRefRemoved(theRef: BRepGraph_RefId): void;
// theRef: the removed reference

// Mark all cached values dirty (bulk invalidation)
InvalidateAll(): void;

// Clear all stored data
Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_LayerLock_ScopedOwnerEdit: declare class BRepGraph_LayerLock_ScopedOwnerEdit

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Base layer for graph-owned parametric generators
BRepGraph_LayerParametric: declare class BRepGraph_LayerParametric extends BRepGraph_Layer

// Convert one generation flag into its bit-mask value
static GenerationMask(theFlag: BRepGraph_LayerParametric_GenerationFlag): number;
// theFlag: generation flag to convert

// Return true when the flag mask contains the requested generation flag
static HasGenerationFlag(theFlags: number, theFlag: BRepGraph_LayerParametric_GenerationFlag): boolean;
// theFlags: generation mask built from GenerationFlag bits
// theFlag: generation flag to test

// Select one integer value from a mesh-quality ladder
static MeshQualityValue(theQuality: BRepGraph_LayerParametric_MeshQuality, theVeryCoarse: number, theCoarse: number, theMedium: number, theFine: number, theVeryFine: number): number;
// theQuality: requested shared mesh quality
// theVeryCoarse: value for `MeshQuality::VeryCoarse`
// theCoarse: value for `MeshQuality::Coarse`
// theMedium: value for `MeshQuality::Medium`
// theFine: value for `MeshQuality::Fine`
// theVeryFine: value for `MeshQuality::VeryFine`

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Controls which graph artifacts should be created or refreshed
BRepGraph_LayerParametric_GenerationFlag: typeof BRepGraph_LayerParametric_GenerationFlag[keyof typeof BRepGraph_LayerParametric_GenerationFlag]

// High-level mesh quality hint shared by parametric generators
BRepGraph_LayerParametric_MeshQuality: typeof BRepGraph_LayerParametric_MeshQuality[keyof typeof BRepGraph_LayerParametric_MeshQuality]

// Dense GUID-keyed runtime registry of graph layers
BRepGraph_LayerRegistry: declare class BRepGraph_LayerRegistry

constructor

// Register a layer
RegisterLayer(theLayer: BRepGraph_Layer): number;

// Remove a layer by GUID
UnregisterLayer(theGUID: Standard_GUID): void;

// Find a layer by GUID
FindLayer(theGUID: Standard_GUID): BRepGraph_Layer;

// Return current slot for a GUID
FindSlot(theGUID: Standard_GUID, theSlot?: number): { returnValue: boolean; theSlot: number };

// Return layer by slot index, or null handle if the slot is out of range
Layer(theSlot: number): BRepGraph_Layer;

// Number of registered layers
NbLayers(): number;

// True if any registered layer subscribes to node modification events
HasModificationSubscribers(): boolean;

// Bitwise OR of all registered layer node subscription masks
SubscribedKindsMask(): number;

// Dispatch OnNodeRemoved to all registered layers
DispatchOnNodeRemoved(theNode: BRepGraph_NodeId): void;

// Dispatch generic item removal to all registered layers
DispatchOnItemRemoved(theItem: BRepGraph_ItemId): void;

// Dispatch OnNodeReplaced to all registered layers
DispatchOnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;

// Dispatch OnNodeModified to subscribed layers
DispatchNodeModified(theNode: BRepGraph_NodeId): void;

// Dispatch generic item modification through the matching typed subscription path
DispatchItemModified(theItem: BRepGraph_ItemId): void;

// Dispatch OnNodesModified to subscribed layers
DispatchNodesModified(theModifiedNodes: NCollection_Array1_BRepGraph_NodeId, theModifiedKindsMask: number): void;

// Ask every registered source layer to copy itself into the target graph
CopyLayersTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
CopyLayersTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;
CopyLayersTo(theTargetGraph: BRepGraph, theItemRemap: any, theMode: BRepGraph_CopyRemap_Mode): void;
CopyLayersTo(theTargetGraph: BRepGraph, theMappingKind: BRepGraph_CopyRemap_MappingKind, theMode: BRepGraph_CopyRemap_Mode): void;
// theTargetGraph: target graph to receive layer data
// theItemRemap: source -> target item id mapping
// theMode: Copy or Compact semantics

// True if any registered layer subscribes to reference modification events
HasRefModificationSubscribers(): boolean;

// Bitwise OR of all registered layer reference subscription masks
SubscribedRefKindsMask(): number;

// Dispatch OnRefRemoved to all registered layers (unconditional - not filtered)
DispatchOnRefRemoved(theRef: BRepGraph_RefId): void;

// Dispatch OnRefModified to subscribed layers (immediate mode)
DispatchRefModified(theRef: BRepGraph_RefId): void;

// Dispatch OnRefsModified to subscribed layers (deferred/batch mode)
DispatchRefsModified(theModifiedRefs: NCollection_Array1_BRepGraph_RefId, theModifiedRefKindsMask: number): void;

// Clear all registered layer data without unregistering services
ClearAll(): void;

// Invalidate all registered layer data
InvalidateAll(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Runtime-only storage for supplemental `TopoDS` topology fragments
BRepGraph_LayerTopoSupplement: declare class BRepGraph_LayerTopoSupplement extends BRepGraph_Layer

constructor

// Return the fixed layer type GUID
static GetID(): Standard_GUID;

// Return the runtime type GUID for this layer instance
ID(): Standard_GUID;

// Return a short stable layer name for diagnostics and registry lookup
Name(): TCollection_AsciiString;

// Find one attachment entry by its layer-local uid
FindByUid(theUid: number): BRepGraph_LayerTopoSupplement_Entry;
// theUid: layer-local attachment uid

// Return all attachment uids currently owned by one core node
AttachedTo(theOwner: BRepGraph_NodeId): number[];
// theOwner: core topology owner node

// Add one supplemental shape attachment to a supported core owner node
AddAttachment(theOwner: BRepGraph_NodeId, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): number;
// theOwner: active core topology owner
// theKind: semantic attachment kind
// theShape: attached supplemental shape

// Add one supplemental shape attachment with an explicitly preserved uid
AddAttachmentWithUid(theOwner: BRepGraph_NodeId, theUid: number, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): boolean;
// theOwner: active core topology owner
// theUid: layer-local attachment uid to preserve
// theKind: semantic attachment kind
// theShape: attached supplemental shape

// Remove one supplemental attachment by uid
RemoveAttachment(theUid: number): boolean;
// theUid: layer-local attachment uid

// Validate internal owner/uid bookkeeping invariants
Validate(): void;

// Drop all attachments owned by a removed node
OnNodeRemoved(theNode: BRepGraph_NodeId): void;
// theNode: removed core node

// Migrate attachments from one owner node to another compatible node
OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;
// theOldNode: previous owner node
// theNewNode: replacement owner node

// Copy remapped attachments to the target graph
CopyTo(theCopy: BRepGraph_CopyRemap): void;

// Invalidate all cached state in the layer
InvalidateAll(): void;

// Remove every stored supplemental attachment
Clear(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Semantic role of one supplemental attachment
BRepGraph_LayerTopoSupplement_AttachmentKind: typeof BRepGraph_LayerTopoSupplement_AttachmentKind[keyof typeof BRepGraph_LayerTopoSupplement_AttachmentKind]

BRepGraph_MeshView: declare class BRepGraph_MeshView

Cache(): BRepGraph_MeshView_CacheView;

Persistent(): BRepGraph_MeshView_PersistentView;

Effective(): BRepGraph_MeshView_EffectiveView;

Editor(): BRepGraph_MeshView_EditorView;

Poly(): BRepGraph_MeshView_PolyOps;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_CacheView: declare class BRepGraph_MeshView_CacheView

Faces(): BRepGraph_MeshView_CacheView_FaceOps;

Edges(): BRepGraph_MeshView_CacheView_EdgeOps;

CoEdges(): BRepGraph_MeshView_CacheView_CoEdgeOps;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_CoEdgeOps: declare class BRepGraph_MeshView_CacheView_CoEdgeOps

Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

FindPolygon2D(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

FindPolygonOnTri(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

FindRaw(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CacheMesh_CoEdgeMeshEntry;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_EdgeOps: declare class BRepGraph_MeshView_CacheView_EdgeOps

Has(theEdge: BRepGraph_EdgeId): boolean;

Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

Entry(theEdge: BRepGraph_EdgeId): BRepGraph_CacheMesh_EdgeMeshEntry;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_CacheView_FaceOps: declare class BRepGraph_MeshView_CacheView_FaceOps

Has(theFace: BRepGraph_FaceId): boolean;

Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

Entry(theFace: BRepGraph_FaceId): BRepGraph_CacheMesh_FaceMeshEntry;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_EditorView: declare class BRepGraph_MeshView_EditorView

Faces(): BRepGraph_MeshView_EditorView_FaceOps;

Edges(): BRepGraph_MeshView_EditorView_EdgeOps;

CoEdges(): BRepGraph_MeshView_EditorView_CoEdgeOps;

PromoteToPersistent(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_CoEdgeOps: declare class BRepGraph_MeshView_EditorView_CoEdgeOps

AppendCachedPolygonOnTri(theCoEdge: BRepGraph_CoEdgeId, thePolygonOnTri: Poly_PolygonOnTriangulation): void;

SetCachedPolygon2D(theCoEdge: BRepGraph_CoEdgeId, thePolygon2D: Poly_Polygon2D): void;

Clear(theCoEdge: BRepGraph_CoEdgeId): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_EdgeOps: declare class BRepGraph_MeshView_EditorView_EdgeOps

SetCachedPolygon3D(theEdge: BRepGraph_EdgeId, thePolygon3D: Poly_Polygon3D): void;

Clear(theEdge: BRepGraph_EdgeId): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_EditorView_FaceOps: declare class BRepGraph_MeshView_EditorView_FaceOps

SetCachedTriangulation(theFace: BRepGraph_FaceId, theTriangulation: Poly_Triangulation): void;

Clear(theFace: BRepGraph_FaceId): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
