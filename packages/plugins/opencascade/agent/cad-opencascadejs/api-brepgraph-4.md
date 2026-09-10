# libcascade — BRepGraph (4)

47 top-level symbols. Signatures are verbatim typescript.

BRepGraph_MeshView_EffectiveView: declare class BRepGraph_MeshView_EffectiveView

Faces(): BRepGraph_MeshView_EffectiveView_FaceOps;

Edges(): BRepGraph_MeshView_EffectiveView_EdgeOps;

CoEdges(): BRepGraph_MeshView_EffectiveView_CoEdgeOps;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_CoEdgeOps: declare class BRepGraph_MeshView_EffectiveView_CoEdgeOps

Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

HasPolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): boolean;

PolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): Poly_Polygon2D;

HasPolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): boolean;

PolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): Poly_PolygonOnTriangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_EdgeOps: declare class BRepGraph_MeshView_EffectiveView_EdgeOps

Has(theEdge: BRepGraph_EdgeId): boolean;

Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_EffectiveView_FaceOps: declare class BRepGraph_MeshView_EffectiveView_FaceOps

Has(theFace: BRepGraph_FaceId): boolean;

Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView: declare class BRepGraph_MeshView_PersistentView

Faces(): BRepGraph_MeshView_PersistentView_FaceOps;

Edges(): BRepGraph_MeshView_PersistentView_EdgeOps;

CoEdges(): BRepGraph_MeshView_PersistentView_CoEdgeOps;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView_CoEdgeOps: declare class BRepGraph_MeshView_PersistentView_CoEdgeOps

Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

PolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): Poly_Polygon2D;

HasPolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): boolean;

PolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): Poly_PolygonOnTriangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView_EdgeOps: declare class BRepGraph_MeshView_PersistentView_EdgeOps

Has(theEdge: BRepGraph_EdgeId): boolean;

Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

HasPolygonOnTriangulation(theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): boolean;

PolygonOnTriangulation(theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): Poly_PolygonOnTriangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView_FaceOps: declare class BRepGraph_MeshView_PersistentView_FaceOps

Has(theFace: BRepGraph_FaceId): boolean;

Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_PolyOps: declare class BRepGraph_MeshView_PolyOps

NbFaceTriangulations(): number;

NbEdgePolygons3D(): number;

NbCoEdgePolygons2D(): number;

NbCoEdgePolygonsOnTri(): number;

NbActiveTriangulations(): number;

NbActivePolygons3D(): number;

NbActivePolygons2D(): number;

NbActivePolygonsOnTri(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CoEdgeId: declare class BRepGraph_CoEdgeId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CompSolidId: declare class BRepGraph_CompSolidId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CompoundId: declare class BRepGraph_CompoundId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_EdgeId: declare class BRepGraph_EdgeId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FaceId: declare class BRepGraph_FaceId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lightweight typed index into a per-kind node vector inside {@link BRepGraph`BRepGraph`}
BRepGraph_NodeId: declare class BRepGraph_NodeId

constructor

NodeKind: BRepGraph_NodeId_Kind

Index: number

// True if the kind value is one of the supported node kinds
static IsValidKind(theKind: BRepGraph_NodeId_Kind): boolean;

// True if the kind is a core topology kind (Solid..CoEdge)
static IsTopologyKind(theKind: BRepGraph_NodeId_Kind): boolean;

// True if the kind is an assembly kind (Product or Occurrence)
static IsAssemblyKind(theKind: BRepGraph_NodeId_Kind): boolean;

// First valid id in a dense sequence for the specified kind
static Start(theKind: BRepGraph_NodeId_Kind): BRepGraph_NodeId;

// Invalid sentinel id for the specified kind
static Invalid(theKind?: BRepGraph_NodeId_Kind): BRepGraph_NodeId;

// True if this id points to an allocated node slot
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

// Return true if this node has been soft-removed in the given graph
IsRemoved(theGraph: BRepGraph): boolean;

// Return true if this node has an active owner in the given graph
IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumeration of node kinds within a {@link BRepGraph`BRepGraph`}
BRepGraph_NodeId_Kind: typeof BRepGraph_NodeId_Kind[keyof typeof BRepGraph_NodeId_Kind]

BRepGraph_OccurrenceId: declare class BRepGraph_OccurrenceId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ProductId: declare class BRepGraph_ProductId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ShellId: declare class BRepGraph_ShellId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_SolidId: declare class BRepGraph_SolidId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_VertexId: declare class BRepGraph_VertexId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_WireId: declare class BRepGraph_WireId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromNodeId(theId: BRepGraph_NodeId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lightweight workload-aware policy for deciding whether an internal phase should actually launch parallel work when parallel mode is allowed
BRepGraph_ParallelPolicy: declare class BRepGraph_ParallelPolicy

constructor

// Return the effective logical worker count reported by {@link OSD_Parallel `OSD_Parallel`}
static WorkerCount(): number;

// Check whether parallel execution is allowed and meaningful at all
static IsParallelAllowed(theAllowParallel: boolean): boolean;

// Decide whether the estimated workload is large enough to amortize thread-pool launch and synchronization overhead
static ShouldRun(theAllowParallel: boolean, theWorkers: number, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;
static ShouldRun(theAllowParallel: boolean, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;
static ShouldRun(theAllowParallel: boolean, theWorkers: number, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;
static ShouldRun(theAllowParallel: boolean, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;
// theAllowParallel: whether parallel mode is allowed by the caller
// theWorkers: effective logical worker count
// theWorkload: estimated workload for the phase

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Upward occurrence-aware parent traversal for {@link BRepGraph`BRepGraph`}
BRepGraph_ParentExplorer: declare class BRepGraph_ParentExplorer

constructor

// Returns the traversal configuration this explorer was constructed with
GetConfig(): BRepGraph_ParentExplorer_Config;

// True if another matching parent is available
More(): boolean;

// Advance to the next matching parent
Next(): void;

// Current matching ancestor node with accumulated location and orientation
Current(): any;

// Returns the immediate child of `Current()` on the currently emitted branch
CurrentChild(): BRepGraph_NodeId;

// Returns how `Current()` is linked to `CurrentChild()`
CurrentLinkKind(): BRepGraph_ParentExplorer_LinkKind;

// Returns the exact parent-owned RefId linking `Current()` to `CurrentChild()`, when that branch step is represented by a reference entry
CurrentRef(): BRepGraph_RefId;

// Accumulated location at the starting node of the current branch
LeafLocation(): TopLoc_Location;

// Accumulated orientation at the starting node of the current branch
LeafOrientation(): TopAbs_Orientation;

// True if `Current()` is the explicit root node of the current branch
IsCurrentBranchRoot(): boolean;

// Returns a sentinel marking the end of iteration
end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Relationship kind between `Current()` and `CurrentChild()`
BRepGraph_ParentExplorer_LinkKind: typeof BRepGraph_ParentExplorer_LinkKind[keyof typeof BRepGraph_ParentExplorer_LinkKind]

// Upward traversal strategy
BRepGraph_ParentExplorer_TraversalMode: typeof BRepGraph_ParentExplorer_TraversalMode[keyof typeof BRepGraph_ParentExplorer_TraversalMode]

BRepGraph_ChildRefId: declare class BRepGraph_ChildRefId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromRefId(theRefId: BRepGraph_RefId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FaceRefId: declare class BRepGraph_FaceRefId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromRefId(theRefId: BRepGraph_RefId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_OccurrenceRefId: declare class BRepGraph_OccurrenceRefId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromRefId(theRefId: BRepGraph_RefId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lightweight typed index into a per-kind reference vector inside {@link BRepGraph`BRepGraph`}
BRepGraph_RefId: declare class BRepGraph_RefId

constructor

RefKind: BRepGraph_RefId_Kind

Index: number

// True if the kind value is one of the supported reference kinds
static IsValidKind(theKind: BRepGraph_RefId_Kind): boolean;

static IsTopologyRefKind(theKind: BRepGraph_RefId_Kind): boolean;

// First valid id in a dense sequence for the specified kind
static Start(theKind: BRepGraph_RefId_Kind): BRepGraph_RefId;

// Invalid sentinel id for the specified kind
static Invalid(theKind?: BRepGraph_RefId_Kind): BRepGraph_RefId;

// True if this id points to an allocated slot within [0, theMaxCount)
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

// Return true if this reference entry has been soft-removed in the given graph
IsRemoved(theGraph: BRepGraph): boolean;

// Return true if this reference entry has an active owner in the given graph
IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumeration of supported topology reference kinds
BRepGraph_RefId_Kind: typeof BRepGraph_RefId_Kind[keyof typeof BRepGraph_RefId_Kind]

BRepGraph_ShellRefId: declare class BRepGraph_ShellRefId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromRefId(theRefId: BRepGraph_RefId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_SolidRefId: declare class BRepGraph_SolidRefId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromRefId(theRefId: BRepGraph_RefId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_VertexRefId: declare class BRepGraph_VertexRefId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromRefId(theRefId: BRepGraph_RefId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_WireRefId: declare class BRepGraph_WireRefId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

static FromRefId(theRefId: BRepGraph_RefId): unknown;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Unique reference-entry identifier within a {@link BRepGraph`BRepGraph`}
BRepGraph_RefUID: declare class BRepGraph_RefUID

constructor

Kind: BRepGraph_RefId_Kind

Counter: number

static Invalid(): BRepGraph_RefUID;

// True if this UID has a valid kind and a non-zero counter
IsValid(): boolean;

HashValue(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CoEdgesOfWire: declare class BRepGraph_CoEdgesOfWire

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullChildRefIterator: declare class BRepGraph_FullChildRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullFaceRefIterator: declare class BRepGraph_FullFaceRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullOccurrenceRefIterator: declare class BRepGraph_FullOccurrenceRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullShellRefIterator: declare class BRepGraph_FullShellRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullSolidRefIterator: declare class BRepGraph_FullSolidRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullVertexRefIterator: declare class BRepGraph_FullVertexRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullWireRefIterator: declare class BRepGraph_FullWireRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsChildOfCompound: declare class BRepGraph_RefsChildOfCompound

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsFaceOfShell: declare class BRepGraph_RefsFaceOfShell

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_ChildOfCompoundTraits: declare class BRepGraph_RefsIterator_ChildOfCompoundTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): BRepGraph_ChildRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ChildRef): BRepGraph_NodeId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
