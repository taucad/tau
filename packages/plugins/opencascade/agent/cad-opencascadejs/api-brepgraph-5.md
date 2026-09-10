# libcascade — BRepGraph (5)

47 top-level symbols. Signatures are verbatim typescript.

BRepGraph_RefsIterator_CoEdgeOfWireTraits: declare class BRepGraph_RefsIterator_CoEdgeOfWireTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_FaceOfShellTraits: declare class BRepGraph_RefsIterator_FaceOfShellTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ShellId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ShellId): BRepGraph_FaceRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_FaceRef): BRepGraph_FaceId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_OccurrenceOfProductTraits: declare class BRepGraph_RefsIterator_OccurrenceOfProductTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ProductId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_OccurrenceRef): BRepGraph_OccurrenceId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_RefsVertexOfEdge: declare class BRepGraph_RefsIterator_RefsVertexOfEdge

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_VertexRefId;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_ShellOfSolidTraits: declare class BRepGraph_RefsIterator_ShellOfSolidTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_SolidId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_SolidId): BRepGraph_ShellRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ShellRef): BRepGraph_ShellId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_SolidOfCompSolidTraits: declare class BRepGraph_RefsIterator_SolidOfCompSolidTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_SolidRef): BRepGraph_SolidId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsIterator_WireOfFaceTraits: declare class BRepGraph_RefsIterator_WireOfFaceTraits

constructor

static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_FaceId): boolean;

static RefIds(theGraph: BRepGraph, theParent: BRepGraph_FaceId): BRepGraph_WireRefId[];

static Ref(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_WireRef): BRepGraph_WireId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsOccurrenceOfProduct: declare class BRepGraph_RefsOccurrenceOfProduct

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsShellOfSolid: declare class BRepGraph_RefsShellOfSolid

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsSolidOfCompSolid: declare class BRepGraph_RefsSolidOfCompSolid

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsWireOfFace: declare class BRepGraph_RefsWireOfFace

constructor

More(): boolean;

Next(): void;

CurrentId(): unknown;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_FaceOps: declare class BRepGraph_RefsView_FaceOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_FaceRefId;

EndId(): BRepGraph_FaceRefId;

Entry(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

IdsOf(theShell: BRepGraph_ShellId): BRepGraph_FaceRefId[];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_GenOps: declare class BRepGraph_RefsView_GenOps

Nb(theKind: BRepGraph_RefId_Kind): number;

IsValid(theRef: BRepGraph_RefId): boolean;

IsActive(theRef: BRepGraph_RefId): boolean;

IsRemoved(theRef: BRepGraph_RefId): boolean;

RefAtStep(theParent: BRepGraph_NodeId, theStep: number): BRepGraph_RefId;

ChildNode(theRef: BRepGraph_RefId): BRepGraph_NodeId;

LocalLocation(theRef: BRepGraph_RefId): TopLoc_Location;

Orientation(theRef: BRepGraph_RefId): TopAbs_Orientation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_OccurrenceOps: declare class BRepGraph_RefsView_OccurrenceOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_OccurrenceRefId;

EndId(): BRepGraph_OccurrenceRefId;

Entry(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

IdsOf(theProduct: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

IdsReferencing(theChild: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_ShellOps: declare class BRepGraph_RefsView_ShellOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_ShellRefId;

EndId(): BRepGraph_ShellRefId;

Entry(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

IdsOf(theSolid: BRepGraph_SolidId): BRepGraph_ShellRefId[];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_SolidOps: declare class BRepGraph_RefsView_SolidOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_SolidRefId;

EndId(): BRepGraph_SolidRefId;

Entry(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

IdsOf(theCompSolid: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_VertexOps: declare class BRepGraph_RefsView_VertexOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_VertexRefId;

EndId(): BRepGraph_VertexRefId;

Entry(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsView_WireOps: declare class BRepGraph_RefsView_WireOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_WireRefId;

EndId(): BRepGraph_WireRefId;

Entry(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

IdsOf(theFace: BRepGraph_FaceId): BRepGraph_WireRefId[];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Single-level iterator over semantically related topology nodes
BRepGraph_RelatedIterator: declare class BRepGraph_RelatedIterator

constructor

// True if another related node is available
More(): boolean;

// Advance to the next related node
Next(): void;

// Return the current related node id
Current(): BRepGraph_NodeId;

// Return the relation kind explaining why the current node is related
CurrentRelation(): BRepGraph_RelatedIterator_RelationKind;

// Returns a sentinel marking the end of iteration
end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Topological relation kinds yielded by the iterator
BRepGraph_RelatedIterator_RelationKind: typeof BRepGraph_RelatedIterator_RelationKind[keyof typeof BRepGraph_RelatedIterator_RelationKind]

// Internal traversal stage tracking which sub-iteration is active
BRepGraph_RelatedIterator_Stage: typeof BRepGraph_RelatedIterator_Stage[keyof typeof BRepGraph_RelatedIterator_Stage]

BRepGraph_CoEdgesOfEdge: declare class BRepGraph_CoEdgesOfEdge

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_CoEdgeId;

Current(): BRepGraph_CoEdgeId;

Definition(): BRepGraphInc_CoEdgeDef;

Index(): number;

Size(): number;

Value(theIndex: number): BRepGraph_CoEdgeId;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CompSolidsOfSolid: declare class BRepGraph_CompSolidsOfSolid

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_CompSolidId;

CurrentParentId(): BRepGraph_CompSolidId;

CurrentRefId(): BRepGraph_SolidRefId;

Current(): BRepGraph_CompSolidId;

Definition(): BRepGraphInc_CompSolidDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_CompoundsOfChild: declare class BRepGraph_CompoundsOfChild

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_CompoundId;

CurrentParentId(): BRepGraph_CompoundId;

CurrentRefId(): BRepGraph_ChildRefId;

Current(): BRepGraph_CompoundId;

Definition(): BRepGraphInc_CompoundDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_EdgesOfVertex: declare class BRepGraph_EdgesOfVertex

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_EdgeId;

Current(): BRepGraph_EdgeId;

Definition(): BRepGraphInc_EdgeDef;

Index(): number;

Size(): number;

Value(theIndex: number): BRepGraph_EdgeId;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FacesOfEdge: declare class BRepGraph_FacesOfEdge

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_FaceId;

Current(): BRepGraph_FaceId;

Definition(): BRepGraphInc_FaceDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_FacesOfWire: declare class BRepGraph_FacesOfWire

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_FaceId;

CurrentParentId(): BRepGraph_FaceId;

CurrentRefId(): BRepGraph_WireRefId;

Current(): BRepGraph_FaceId;

Definition(): BRepGraphInc_FaceDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_OccurrencesOfChild: declare class BRepGraph_OccurrencesOfChild

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_OccurrenceId;

CurrentParentId(): BRepGraph_OccurrenceId;

CurrentRefId(): BRepGraph_OccurrenceRefId;

Current(): BRepGraph_OccurrenceId;

Definition(): BRepGraphInc_OccurrenceDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ProductsOfOccurrence: declare class BRepGraph_ProductsOfOccurrence

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_ProductId;

CurrentParentId(): BRepGraph_ProductId;

CurrentRefId(): BRepGraph_OccurrenceRefId;

Current(): BRepGraph_ProductId;

Definition(): BRepGraphInc_ProductDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsEdgesOfVertex: declare class BRepGraph_RefsEdgesOfVertex

constructor

More(): boolean;

Next(): void;

Current(): any;

CurrentParentId(): BRepGraph_EdgeId;

CurrentRefId(): BRepGraph_VertexRefId;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsShellsOfFace: declare class BRepGraph_RefsShellsOfFace

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_ShellId;

CurrentParentId(): BRepGraph_ShellId;

CurrentRefId(): BRepGraph_FaceRefId;

Current(): BRepGraph_ShellId;

Definition(): BRepGraphInc_ShellDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsSolidsOfShell: declare class BRepGraph_RefsSolidsOfShell

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_SolidId;

CurrentParentId(): BRepGraph_SolidId;

CurrentRefId(): BRepGraph_ShellRefId;

Current(): BRepGraph_SolidId;

Definition(): BRepGraphInc_SolidDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_RefsWiresOfCoEdge: declare class BRepGraph_RefsWiresOfCoEdge

constructor

More(): boolean;

Next(): void;

Current(): any;

CurrentParentId(): BRepGraph_WireId;

CurrentRefId(): BRepGraph_CoEdgeId;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits: declare class BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits

constructor

static Id(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraph_CompSolidId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_CompoundFromChildRefTraits: declare class BRepGraph_ReverseIterator_CompoundFromChildRefTraits

constructor

static Id(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraph_CompoundId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_EdgeOfVertexRefTraits: declare class BRepGraph_ReverseIterator_EdgeOfVertexRefTraits

constructor

static FindRef(theGraph: BRepGraph, theParent: BRepGraph_EdgeId, theChild: BRepGraph_VertexId): BRepGraph_VertexRefId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits: declare class BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits

constructor

static ParentIdOf(theCoEdge: BRepGraphInc_CoEdgeDef): BRepGraph_FaceId;

static NbParents(theGraph: BRepGraph): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_FaceFromWireRefTraits: declare class BRepGraph_ReverseIterator_FaceFromWireRefTraits

constructor

static Id(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraph_FaceId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits: declare class BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits

constructor

static Id(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraph_OccurrenceId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits: declare class BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits

constructor

static Id(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraph_ProductId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_ShellFromFaceRefTraits: declare class BRepGraph_ReverseIterator_ShellFromFaceRefTraits

constructor

static Id(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraph_ShellId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_SolidFromShellRefTraits: declare class BRepGraph_ReverseIterator_SolidFromShellRefTraits

constructor

static Id(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraph_SolidId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits: declare class BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits

constructor

static ParentIdOf(theCoEdge: BRepGraphInc_CoEdgeDef): BRepGraph_WireId;

static NbParents(theGraph: BRepGraph): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits: declare class BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits

constructor

static FindRef(theGraph: BRepGraph, theParent: BRepGraph_WireId, theChild: BRepGraph_CoEdgeId): BRepGraph_CoEdgeId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_WiresOfEdge: declare class BRepGraph_WiresOfEdge

constructor

More(): boolean;

Next(): void;

CurrentId(): BRepGraph_WireId;

Current(): BRepGraph_WireId;

Definition(): BRepGraphInc_WireDef;

Index(): number;

end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
