# libcascade — BRepGraph (3)

56 top-level symbols. Signatures are verbatim typescript.

BRepGraph_MeshView_PersistentView_CoEdgeOps: declare class BRepGraph_MeshView_PersistentView_CoEdgeOps

Has(theCoEdge: BRepGraph_CoEdgeId): boolean;

PolygonOnSurface(theCoEdge: BRepGraph_CoEdgeId): Poly_Polygon2D;

HasPolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): boolean;

PolygonOnTriangulation(theCoEdge: BRepGraph_CoEdgeId): Poly_PolygonOnTriangulation;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView_EdgeOps: declare class BRepGraph_MeshView_PersistentView_EdgeOps

Has(theEdge: BRepGraph_EdgeId): boolean;

Polygon3D(theEdge: BRepGraph_EdgeId): Poly_Polygon3D;

HasPolygonOnTriangulation(theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): boolean;

PolygonOnTriangulation(theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): Poly_PolygonOnTriangulation;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_MeshView_PersistentView_FaceOps: declare class BRepGraph_MeshView_PersistentView_FaceOps

Has(theFace: BRepGraph_FaceId): boolean;

Triangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

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

delete(): void;

[Symbol.dispose](): void;

BRepGraph_NodeId: declare class BRepGraph_NodeId

constructor

NodeKind: BRepGraph_NodeId_Kind

Index: number

static IsValidKind(theKind: BRepGraph_NodeId_Kind): boolean;

static IsTopologyKind(theKind: BRepGraph_NodeId_Kind): boolean;

static IsAssemblyKind(theKind: BRepGraph_NodeId_Kind): boolean;

static Start(theKind: BRepGraph_NodeId_Kind): BRepGraph_NodeId;

static Invalid(theKind?: BRepGraph_NodeId_Kind): BRepGraph_NodeId;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

BRepGraph_ParallelPolicy: declare class BRepGraph_ParallelPolicy

constructor

static WorkerCount(): number;

static IsParallelAllowed(theAllowParallel: boolean): boolean;

static ShouldRun(theAllowParallel: boolean, theWorkers: number, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;
static ShouldRun(theAllowParallel: boolean, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;
static ShouldRun(theAllowParallel: boolean, theWorkers: number, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;
static ShouldRun(theAllowParallel: boolean, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_ParentExplorer: declare class BRepGraph_ParentExplorer

constructor

GetConfig(): BRepGraph_ParentExplorer_Config;

More(): boolean;

Next(): void;

Current(): any;

CurrentChild(): BRepGraph_NodeId;

CurrentLinkKind(): BRepGraph_ParentExplorer_LinkKind;

CurrentRef(): BRepGraph_RefId;

LeafLocation(): TopLoc_Location;

LeafOrientation(): TopAbs_Orientation;

IsCurrentBranchRoot(): boolean;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_ParentExplorer_LinkKind: typeof BRepGraph_ParentExplorer_LinkKind[keyof typeof BRepGraph_ParentExplorer_LinkKind]

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

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefId: declare class BRepGraph_RefId

constructor

RefKind: BRepGraph_RefId_Kind

Index: number

static IsValidKind(theKind: BRepGraph_RefId_Kind): boolean;

static IsTopologyRefKind(theKind: BRepGraph_RefId_Kind): boolean;

static Start(theKind: BRepGraph_RefId_Kind): BRepGraph_RefId;

static Invalid(theKind?: BRepGraph_RefId_Kind): BRepGraph_RefId;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

IsOwned(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefUID: declare class BRepGraph_RefUID

constructor

Kind: BRepGraph_RefId_Kind

Counter: number

static Invalid(): BRepGraph_RefUID;

IsValid(): boolean;

HashValue(): number;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_CoEdgesOfWire: declare class BRepGraph_CoEdgesOfWire

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullChildRefIterator: declare class BRepGraph_FullChildRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullFaceRefIterator: declare class BRepGraph_FullFaceRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullOccurrenceRefIterator: declare class BRepGraph_FullOccurrenceRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullShellRefIterator: declare class BRepGraph_FullShellRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullSolidRefIterator: declare class BRepGraph_FullSolidRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullVertexRefIterator: declare class BRepGraph_FullVertexRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FullWireRefIterator: declare class BRepGraph_FullWireRefIterator

constructor

More(): boolean;

Next(): void;

Current(): unknown;

CurrentId(): unknown;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsChildOfCompound: declare class BRepGraph_RefsChildOfCompound

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsFaceOfShell: declare class BRepGraph_RefsFaceOfShell

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_ChildOfCompoundTraits: declare class BRepGraph_RefsIterator_ChildOfCompoundTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): BRepGraph_ChildRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ChildRef): BRepGraph_NodeId;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_CoEdgeOfWireTraits: declare class BRepGraph_RefsIterator_CoEdgeOfWireTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_FaceOfShellTraits: declare class BRepGraph_RefsIterator_FaceOfShellTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ShellId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ShellId): BRepGraph_FaceRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_FaceRef): BRepGraph_FaceId;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_OccurrenceOfProductTraits: declare class BRepGraph_RefsIterator_OccurrenceOfProductTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ProductId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_OccurrenceRef): BRepGraph_OccurrenceId;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_RefsVertexOfEdge: declare class BRepGraph_RefsIterator_RefsVertexOfEdge

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_VertexRefId;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_ShellOfSolidTraits: declare class BRepGraph_RefsIterator_ShellOfSolidTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_SolidId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_SolidId): BRepGraph_ShellRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ShellRef): BRepGraph_ShellId;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_SolidOfCompSolidTraits: declare class BRepGraph_RefsIterator_SolidOfCompSolidTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_SolidRef): BRepGraph_SolidId;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_WireOfFaceTraits: declare class BRepGraph_RefsIterator_WireOfFaceTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_FaceId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_FaceId): BRepGraph_WireRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_WireRef): BRepGraph_WireId;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsOccurrenceOfProduct: declare class BRepGraph_RefsOccurrenceOfProduct

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsShellOfSolid: declare class BRepGraph_RefsShellOfSolid

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsSolidOfCompSolid: declare class BRepGraph_RefsSolidOfCompSolid

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsWireOfFace: declare class BRepGraph_RefsWireOfFace

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView: declare class BRepGraph_RefsView

Shells(): BRepGraph_RefsView_ShellOps;

Faces(): BRepGraph_RefsView_FaceOps;

Wires(): BRepGraph_RefsView_WireOps;

Vertices(): BRepGraph_RefsView_VertexOps;

Solids(): BRepGraph_RefsView_SolidOps;

Children(): BRepGraph_RefsView_ChildOps;

Occurrences(): BRepGraph_RefsView_OccurrenceOps;

Gen(): BRepGraph_RefsView_GenOps;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_ChildOps: declare class BRepGraph_RefsView_ChildOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_ChildRefId;

EndId(): BRepGraph_ChildRefId;

Entry(theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

IdsOf(theCompound: BRepGraph_CompoundId): BRepGraph_ChildRefId[];

IdsReferencing(theChild: BRepGraph_NodeId): BRepGraph_ChildRefId[];

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_FaceOps: declare class BRepGraph_RefsView_FaceOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_FaceRefId;

EndId(): BRepGraph_FaceRefId;

Entry(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

IdsOf(theShell: BRepGraph_ShellId): BRepGraph_FaceRefId[];

delete(): void;

[Symbol.dispose](): void;
