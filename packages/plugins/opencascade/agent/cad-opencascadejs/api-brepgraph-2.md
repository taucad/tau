# libcascade — BRepGraph (2)

15 top-level symbols. Signatures are verbatim typescript.

BRepGraph_DefsShellOfSolid: declare class BRepGraph_DefsShellOfSolid

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

BRepGraph_DefsSolidOfCompSolid: declare class BRepGraph_DefsSolidOfCompSolid

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

BRepGraph_DefsWireOfFace: declare class BRepGraph_DefsWireOfFace

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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Generic {@link BRepGraph`BRepGraph`} item identifier covering definitions and references
BRepGraph_ItemId: declare class BRepGraph_ItemId

constructor

// Return true if this item addresses a graph object
IsValid(): boolean;

// Return the addressed domain
ItemDomain(): BRepGraph_ItemId_Domain;

// Return true if this item addresses a definition node
IsNode(): boolean;

// Return true if this item addresses a reference entry
IsReference(): boolean;

// Convert to node id
NodeId(): BRepGraph_NodeId;

// Convert to reference id
RefId(): BRepGraph_RefId;

// Return node kind
NodeKind(): BRepGraph_NodeId_Kind;

// Return reference kind
RefKind(): BRepGraph_RefId_Kind;

// Return item kind encoded in its own domain enum space
RawKind(): number;

// Return item kind encoded in its own domain enum space
Kind(): number;

// Return item per-kind index
Index(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Addressed graph item domain
BRepGraph_ItemId_Domain: typeof BRepGraph_ItemId_Domain[keyof typeof BRepGraph_ItemId_Domain]

// Durable {@link BRepGraph`BRepGraph`} item identity covering definition nodes and reference entries
BRepGraph_ItemUID: declare class BRepGraph_ItemUID

constructor

// Construct a node UID
static Node(theKind: BRepGraph_NodeId_Kind, theCounter: number): BRepGraph_ItemUID;

// Construct a reference UID
static Reference(theKind: BRepGraph_RefId_Kind, theCounter: number): BRepGraph_ItemUID;

// Return an invalid sentinel UID
static Invalid(): BRepGraph_ItemUID;

// Return true if this UID has a non-sentinel counter and a valid domain/kind pair
IsValid(): boolean;

// Return the addressed identity domain
ItemDomain(): BRepGraph_ItemUID_Domain;

IsNode(): boolean;

IsReference(): boolean;

// Return node kind
NodeKind(): BRepGraph_NodeId_Kind;

// Return reference kind
RefKind(): BRepGraph_RefId_Kind;

// Return item kind encoded in its own domain enum space
RawKind(): number;

// Return the graph-wide monotonic UID counter
Counter(): number;

// Compute a hash value compatible with operator==
HashValue(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Addressed persistent identity domain
BRepGraph_ItemUID_Domain: typeof BRepGraph_ItemUID_Domain[keyof typeof BRepGraph_ItemUID_Domain]

// Allocation-free iterator over root product identifiers
BRepGraph_RootProductIterator: declare class BRepGraph_RootProductIterator

constructor

More(): boolean;

Next(): void;

Current(): BRepGraph_ProductId;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Abstract base class for named attribute layers
BRepGraph_Layer: declare class BRepGraph_Layer extends Standard_Transient

// Layer type identity (unique within a graph)
ID(): Standard_GUID;

// Layer identity (unique within a graph)
Name(): TCollection_AsciiString;

// Called when a node is soft-removed without a replacement
OnNodeRemoved(theNode: BRepGraph_NodeId): void;
// theNode: the removed node Layers should discard or archive data associated with it

// Dispatch a generic item removal to the matching typed removal callback
OnItemRemoved(theItem: BRepGraph_ItemId): void;
// theItem: the removed definition or reference

// Called when a node is soft-removed and replaced by another node
OnNodeReplaced(theOldNode: BRepGraph_NodeId, theNewNode: BRepGraph_NodeId): void;
// theOldNode: the removed node
// theNewNode: the node that replaces theOldNode Layers that store node-keyed data should migrate from theOldNode to theNewNode when the replacement kind is compatible

// Copy this source layer data into another graph
CopyTo(theCopy: BRepGraph_CopyRemap): void;
// theCopy: source graph, target graph, and source item id -> target item id remap

// Mark all cached values dirty (bulk invalidation)
InvalidateAll(): void;

// Clear all stored data
Clear(): void;

// Return a bitmask of `BRepGraph_NodeId::Kind` values this layer subscribes to
SubscribedKinds(): number;

// Called in immediate (non-deferred) mode after a single node is modified
OnNodeModified(theNode: BRepGraph_NodeId): void;
// theNode: the modified node

// Dispatch a generic item modification to the matching typed modification callback
OnItemModified(theItem: BRepGraph_ItemId): void;
// theItem: the modified definition or reference

// Called after EndDeferredInvalidation() with all nodes modified during the deferred scope
OnNodesModified(theModifiedNodes: NCollection_Array1_BRepGraph_NodeId): void;
// theModifiedNodes: all modified, non-removed nodes

// Convenience
static KindBit(theKind: BRepGraph_NodeId_Kind): number;

// Return a bitmask of `BRepGraph_RefId::Kind` values this layer subscribes to
SubscribedRefKinds(): number;

// Called when a reference is soft-deleted via RemoveRef()
OnRefRemoved(theRef: BRepGraph_RefId): void;
// theRef: the removed reference

// Called in immediate (non-deferred) mode after a single ref is mutated
OnRefModified(theRef: BRepGraph_RefId): void;
// theRef: the modified reference

// Called after EndDeferredInvalidation() with all refs modified during the deferred scope
OnRefsModified(theModifiedRefs: NCollection_Array1_BRepGraph_RefId): void;
// theModifiedRefs: all modified, non-removed refs

// Convenience
static RefKindBit(theKind: BRepGraph_RefId_Kind): number;

// Monotonic revision counter incremented by `touch()` on every observable state change
Revision(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Base layer for postponed graph item loading
BRepGraph_LayerDeferred: declare class BRepGraph_LayerDeferred extends BRepGraph_Layer

constructor

// Return fixed layer type GUID
static GetID(): Standard_GUID;

// Return this layer type GUID
ID(): Standard_GUID;

// Return deferred entry for an item, or null if none exists
FindDeferred(theItem: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;
FindDeferred(theNode: BRepGraph_NodeId): BRepGraph_LayerDeferred_Entry;
FindDeferred(theRef: BRepGraph_RefId): BRepGraph_LayerDeferred_Entry;
FindDeferred(theItem: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;
FindDeferred(theNode: BRepGraph_NodeId): BRepGraph_LayerDeferred_Entry;
FindDeferred(theRef: BRepGraph_RefId): BRepGraph_LayerDeferred_Entry;
FindDeferred(theItem: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;
FindDeferred(theNode: BRepGraph_NodeId): BRepGraph_LayerDeferred_Entry;
FindDeferred(theRef: BRepGraph_RefId): BRepGraph_LayerDeferred_Entry;

// Return true if an item has deferred representations
HasDeferred(theItem: BRepGraph_ItemId): boolean;
HasDeferred(theNode: BRepGraph_NodeId): boolean;
HasDeferred(theRef: BRepGraph_RefId): boolean;
HasDeferred(theItem: BRepGraph_ItemId): boolean;
HasDeferred(theNode: BRepGraph_NodeId): boolean;
HasDeferred(theRef: BRepGraph_RefId): boolean;
HasDeferred(theItem: BRepGraph_ItemId): boolean;
HasDeferred(theNode: BRepGraph_NodeId): boolean;
HasDeferred(theRef: BRepGraph_RefId): boolean;

// Register one postponed representation and lock the item
RegisterDeferred(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
RegisterDeferred(theNode: BRepGraph_NodeId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
RegisterDeferred(theRef: BRepGraph_RefId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
RegisterDeferred(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
RegisterDeferred(theNode: BRepGraph_NodeId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
RegisterDeferred(theRef: BRepGraph_RefId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
RegisterDeferred(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
RegisterDeferred(theNode: BRepGraph_NodeId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;
RegisterDeferred(theRef: BRepGraph_RefId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentationKind: BRepGraph_LayerDeferred_RepresentationKind, theRepresentationName: TCollection_AsciiString, theSourceIndex: number): void;

// Register postponed representations for one item and lock the item once
RegisterDeferredRepresentations(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentations: BRepGraph_LayerDeferred_Representation, theNbRepresentations: number): void;

// Register postponed representations for a new item and lock it once
RegisterDeferredRepresentationsDirect(theItem: BRepGraph_ItemId, theProvider: TCollection_AsciiString, theSourceKey: TCollection_AsciiString, theRepresentations: BRepGraph_LayerDeferred_Representation, theNbRepresentations: number): void;

// Remove all deferred representations for an item and unlock it
UnregisterDeferred(theItem: BRepGraph_ItemId): void;
UnregisterDeferred(theNode: BRepGraph_NodeId): void;
UnregisterDeferred(theRef: BRepGraph_RefId): void;
UnregisterDeferred(theItem: BRepGraph_ItemId): void;
UnregisterDeferred(theNode: BRepGraph_NodeId): void;
UnregisterDeferred(theRef: BRepGraph_RefId): void;
UnregisterDeferred(theItem: BRepGraph_ItemId): void;
UnregisterDeferred(theNode: BRepGraph_NodeId): void;
UnregisterDeferred(theRef: BRepGraph_RefId): void;

// Return true if at least one item has deferred representations
HasDeferredItems(): boolean;

// Return first deferred entry with at least one representation of the requested kind, or null
FindFirstDeferred(theKind: BRepGraph_LayerDeferred_RepresentationKind, theItem?: BRepGraph_ItemId): BRepGraph_LayerDeferred_Entry;

// Reserve deferred and lock layer buckets for bulk registration
ReserveDeferredItems(theNbItems: number): void;

// Begin bulk deferred registration
BeginBulkRegistration(): void;

// Finish bulk deferred registration and publish one revision update if anything changed
EndBulkRegistration(): void;

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

// {@link Representation `Representation`} category
BRepGraph_LayerDeferred_RepresentationKind: typeof BRepGraph_LayerDeferred_RepresentationKind[keyof typeof BRepGraph_LayerDeferred_RepresentationKind]

BRepGraph_LayerDeferred_Entry: declare class BRepGraph_LayerDeferred_Entry

constructor

Provider: TCollection_AsciiString

SourceKey: TCollection_AsciiString

Representations: BRepGraph_LayerDeferred_Entry_RepresentationStorage

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_LayerDeferred_Entry_RepresentationStorage: declare class BRepGraph_LayerDeferred_Entry_RepresentationStorage

constructor

Size(): number;

IsEmpty(): boolean;

ContainsKind(theKind: BRepGraph_LayerDeferred_RepresentationKind): boolean;

Value(theIndex: number): BRepGraph_LayerDeferred_Representation;

ChangeValue(theIndex: number): BRepGraph_LayerDeferred_Representation;

First(): BRepGraph_LayerDeferred_Representation;

Append(theRepresentation: BRepGraph_LayerDeferred_Representation): void;

Clear(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_LayerDeferred_Representation: declare class BRepGraph_LayerDeferred_Representation

constructor

Kind: BRepGraph_LayerDeferred_RepresentationKind

Role: number

Name: TCollection_AsciiString

SourceIndex: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
