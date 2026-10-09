# libcascade — BRepGraph (4)

41 top-level symbols. Signatures are verbatim typescript.

BRepGraph_RefsView_SolidOps: declare class BRepGraph_RefsView_SolidOps

  // BRepGraph_RefsView_SolidOps.Nb (method)
  Nb(): number;

  // BRepGraph_RefsView_SolidOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_RefsView_SolidOps.StartId (method)
  StartId(): BRepGraph_SolidRefId;

  // BRepGraph_RefsView_SolidOps.EndId (method)
  EndId(): BRepGraph_SolidRefId;

  // BRepGraph_RefsView_SolidOps.Entry (method)
  Entry(theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  // BRepGraph_RefsView_SolidOps.IdsOf (method)
  IdsOf(theCompSolid: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

  // BRepGraph_RefsView_SolidOps.delete (method)
  delete(): void;

  // BRepGraph_RefsView_SolidOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsView_VertexOps: declare class BRepGraph_RefsView_VertexOps

  // BRepGraph_RefsView_VertexOps.Nb (method)
  Nb(): number;

  // BRepGraph_RefsView_VertexOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_RefsView_VertexOps.StartId (method)
  StartId(): BRepGraph_VertexRefId;

  // BRepGraph_RefsView_VertexOps.EndId (method)
  EndId(): BRepGraph_VertexRefId;

  // BRepGraph_RefsView_VertexOps.Entry (method)
  Entry(theRefId: BRepGraph_VertexRefId): BRepGraphInc_VertexRef;

  // BRepGraph_RefsView_VertexOps.delete (method)
  delete(): void;

  // BRepGraph_RefsView_VertexOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsView_WireOps: declare class BRepGraph_RefsView_WireOps

  // BRepGraph_RefsView_WireOps.Nb (method)
  Nb(): number;

  // BRepGraph_RefsView_WireOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_RefsView_WireOps.StartId (method)
  StartId(): BRepGraph_WireRefId;

  // BRepGraph_RefsView_WireOps.EndId (method)
  EndId(): BRepGraph_WireRefId;

  // BRepGraph_RefsView_WireOps.Entry (method)
  Entry(theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  // BRepGraph_RefsView_WireOps.IdsOf (method)
  IdsOf(theFace: BRepGraph_FaceId): BRepGraph_WireRefId[];

  // BRepGraph_RefsView_WireOps.delete (method)
  delete(): void;

  // BRepGraph_RefsView_WireOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RelatedIterator: declare class BRepGraph_RelatedIterator

  // BRepGraph_RelatedIterator.constructor (constructor)
  constructor(theGraph: BRepGraph, theNode: BRepGraph_NodeId);

  // BRepGraph_RelatedIterator.More (method)
  More(): boolean;

  // BRepGraph_RelatedIterator.Next (method)
  Next(): void;

  // BRepGraph_RelatedIterator.Current (method)
  Current(): BRepGraph_NodeId;

  // BRepGraph_RelatedIterator.CurrentRelation (method)
  CurrentRelation(): BRepGraph_RelatedIterator_RelationKind;

  // BRepGraph_RelatedIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RelatedIterator.delete (method)
  delete(): void;

  // BRepGraph_RelatedIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RelatedIterator_RelationKind: typeof BRepGraph_RelatedIterator_RelationKind[keyof typeof BRepGraph_RelatedIterator_RelationKind]

  readonly BoundaryEdge: 'BoundaryEdge'

  readonly AdjacentFace: 'AdjacentFace'

  readonly OuterWire: 'OuterWire'

  readonly ReferencedByFace: 'ReferencedByFace'

  readonly IncidentVertex: 'IncidentVertex'

  readonly WireCoEdge: 'WireCoEdge'

  readonly OwningFace: 'OwningFace'

  readonly IncidentEdge: 'IncidentEdge'

  readonly ParentEdge: 'ParentEdge'

  readonly SeamPair: 'SeamPair'

BRepGraph_RelatedIterator_Stage: typeof BRepGraph_RelatedIterator_Stage[keyof typeof BRepGraph_RelatedIterator_Stage]

  readonly First: 'First'

  readonly Second: 'Second'

  readonly Third: 'Third'

  readonly Finished: 'Finished'

BRepGraph_CoEdgesOfEdge: declare class BRepGraph_CoEdgesOfEdge

  // BRepGraph_CoEdgesOfEdge.constructor (constructor)
  constructor(theGraph: BRepGraph, theParents: unknown);
  constructor(theGraph: BRepGraph, theParents: unknown, theStartIndex: number);

  // BRepGraph_CoEdgesOfEdge.More (method)
  More(): boolean;

  // BRepGraph_CoEdgesOfEdge.Next (method)
  Next(): void;

  // BRepGraph_CoEdgesOfEdge.CurrentId (method)
  CurrentId(): BRepGraph_CoEdgeId;

  // BRepGraph_CoEdgesOfEdge.Current (method)
  Current(): BRepGraph_CoEdgeId;

  // BRepGraph_CoEdgesOfEdge.Definition (method)
  Definition(): BRepGraphInc_CoEdgeDef;

  // BRepGraph_CoEdgesOfEdge.Index (method)
  Index(): number;

  // BRepGraph_CoEdgesOfEdge.Size (method)
  Size(): number;

  // BRepGraph_CoEdgesOfEdge.Value (method)
  Value(theIndex: number): BRepGraph_CoEdgeId;

  // BRepGraph_CoEdgesOfEdge.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_CoEdgesOfEdge.delete (method)
  delete(): void;

  // BRepGraph_CoEdgesOfEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CompSolidsOfSolid: declare class BRepGraph_CompSolidsOfSolid

  // BRepGraph_CompSolidsOfSolid.constructor (constructor)
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_SolidRefId[]);
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_SolidRefId[], theStartIndex: number);

  // BRepGraph_CompSolidsOfSolid.More (method)
  More(): boolean;

  // BRepGraph_CompSolidsOfSolid.Next (method)
  Next(): void;

  // BRepGraph_CompSolidsOfSolid.CurrentId (method)
  CurrentId(): BRepGraph_CompSolidId;

  // BRepGraph_CompSolidsOfSolid.CurrentParentId (method)
  CurrentParentId(): BRepGraph_CompSolidId;

  // BRepGraph_CompSolidsOfSolid.CurrentRefId (method)
  CurrentRefId(): BRepGraph_SolidRefId;

  // BRepGraph_CompSolidsOfSolid.Current (method)
  Current(): BRepGraph_CompSolidId;

  // BRepGraph_CompSolidsOfSolid.Definition (method)
  Definition(): BRepGraphInc_CompSolidDef;

  // BRepGraph_CompSolidsOfSolid.Index (method)
  Index(): number;

  // BRepGraph_CompSolidsOfSolid.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_CompSolidsOfSolid.delete (method)
  delete(): void;

  // BRepGraph_CompSolidsOfSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CompoundsOfChild: declare class BRepGraph_CompoundsOfChild

  // BRepGraph_CompoundsOfChild.constructor (constructor)
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_ChildRefId[]);
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_ChildRefId[], theStartIndex: number);

  // BRepGraph_CompoundsOfChild.More (method)
  More(): boolean;

  // BRepGraph_CompoundsOfChild.Next (method)
  Next(): void;

  // BRepGraph_CompoundsOfChild.CurrentId (method)
  CurrentId(): BRepGraph_CompoundId;

  // BRepGraph_CompoundsOfChild.CurrentParentId (method)
  CurrentParentId(): BRepGraph_CompoundId;

  // BRepGraph_CompoundsOfChild.CurrentRefId (method)
  CurrentRefId(): BRepGraph_ChildRefId;

  // BRepGraph_CompoundsOfChild.Current (method)
  Current(): BRepGraph_CompoundId;

  // BRepGraph_CompoundsOfChild.Definition (method)
  Definition(): BRepGraphInc_CompoundDef;

  // BRepGraph_CompoundsOfChild.Index (method)
  Index(): number;

  // BRepGraph_CompoundsOfChild.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_CompoundsOfChild.delete (method)
  delete(): void;

  // BRepGraph_CompoundsOfChild.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_EdgesOfVertex: declare class BRepGraph_EdgesOfVertex

  // BRepGraph_EdgesOfVertex.constructor (constructor)
  constructor(theGraph: BRepGraph, theParents: unknown);
  constructor(theGraph: BRepGraph, theParents: unknown, theStartIndex: number);

  // BRepGraph_EdgesOfVertex.More (method)
  More(): boolean;

  // BRepGraph_EdgesOfVertex.Next (method)
  Next(): void;

  // BRepGraph_EdgesOfVertex.CurrentId (method)
  CurrentId(): BRepGraph_EdgeId;

  // BRepGraph_EdgesOfVertex.Current (method)
  Current(): BRepGraph_EdgeId;

  // BRepGraph_EdgesOfVertex.Definition (method)
  Definition(): BRepGraphInc_EdgeDef;

  // BRepGraph_EdgesOfVertex.Index (method)
  Index(): number;

  // BRepGraph_EdgesOfVertex.Size (method)
  Size(): number;

  // BRepGraph_EdgesOfVertex.Value (method)
  Value(theIndex: number): BRepGraph_EdgeId;

  // BRepGraph_EdgesOfVertex.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_EdgesOfVertex.delete (method)
  delete(): void;

  // BRepGraph_EdgesOfVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FacesOfEdge: declare class BRepGraph_FacesOfEdge

  // BRepGraph_FacesOfEdge.constructor (constructor)
  constructor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId);
  constructor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theStartIndex: number);

  // BRepGraph_FacesOfEdge.More (method)
  More(): boolean;

  // BRepGraph_FacesOfEdge.Next (method)
  Next(): void;

  // BRepGraph_FacesOfEdge.CurrentId (method)
  CurrentId(): BRepGraph_FaceId;

  // BRepGraph_FacesOfEdge.Current (method)
  Current(): BRepGraph_FaceId;

  // BRepGraph_FacesOfEdge.Definition (method)
  Definition(): BRepGraphInc_FaceDef;

  // BRepGraph_FacesOfEdge.Index (method)
  Index(): number;

  // BRepGraph_FacesOfEdge.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FacesOfEdge.delete (method)
  delete(): void;

  // BRepGraph_FacesOfEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FacesOfWire: declare class BRepGraph_FacesOfWire

  // BRepGraph_FacesOfWire.constructor (constructor)
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_WireRefId[]);
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_WireRefId[], theStartIndex: number);

  // BRepGraph_FacesOfWire.More (method)
  More(): boolean;

  // BRepGraph_FacesOfWire.Next (method)
  Next(): void;

  // BRepGraph_FacesOfWire.CurrentId (method)
  CurrentId(): BRepGraph_FaceId;

  // BRepGraph_FacesOfWire.CurrentParentId (method)
  CurrentParentId(): BRepGraph_FaceId;

  // BRepGraph_FacesOfWire.CurrentRefId (method)
  CurrentRefId(): BRepGraph_WireRefId;

  // BRepGraph_FacesOfWire.Current (method)
  Current(): BRepGraph_FaceId;

  // BRepGraph_FacesOfWire.Definition (method)
  Definition(): BRepGraphInc_FaceDef;

  // BRepGraph_FacesOfWire.Index (method)
  Index(): number;

  // BRepGraph_FacesOfWire.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FacesOfWire.delete (method)
  delete(): void;

  // BRepGraph_FacesOfWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_OccurrencesOfChild: declare class BRepGraph_OccurrencesOfChild

  // BRepGraph_OccurrencesOfChild.constructor (constructor)
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_OccurrenceRefId[]);
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_OccurrenceRefId[], theStartIndex: number);

  // BRepGraph_OccurrencesOfChild.More (method)
  More(): boolean;

  // BRepGraph_OccurrencesOfChild.Next (method)
  Next(): void;

  // BRepGraph_OccurrencesOfChild.CurrentId (method)
  CurrentId(): BRepGraph_OccurrenceId;

  // BRepGraph_OccurrencesOfChild.CurrentParentId (method)
  CurrentParentId(): BRepGraph_OccurrenceId;

  // BRepGraph_OccurrencesOfChild.CurrentRefId (method)
  CurrentRefId(): BRepGraph_OccurrenceRefId;

  // BRepGraph_OccurrencesOfChild.Current (method)
  Current(): BRepGraph_OccurrenceId;

  // BRepGraph_OccurrencesOfChild.Definition (method)
  Definition(): BRepGraphInc_OccurrenceDef;

  // BRepGraph_OccurrencesOfChild.Index (method)
  Index(): number;

  // BRepGraph_OccurrencesOfChild.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_OccurrencesOfChild.delete (method)
  delete(): void;

  // BRepGraph_OccurrencesOfChild.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ProductsOfOccurrence: declare class BRepGraph_ProductsOfOccurrence

  // BRepGraph_ProductsOfOccurrence.constructor (constructor)
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_OccurrenceRefId[]);
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_OccurrenceRefId[], theStartIndex: number);

  // BRepGraph_ProductsOfOccurrence.More (method)
  More(): boolean;

  // BRepGraph_ProductsOfOccurrence.Next (method)
  Next(): void;

  // BRepGraph_ProductsOfOccurrence.CurrentId (method)
  CurrentId(): BRepGraph_ProductId;

  // BRepGraph_ProductsOfOccurrence.CurrentParentId (method)
  CurrentParentId(): BRepGraph_ProductId;

  // BRepGraph_ProductsOfOccurrence.CurrentRefId (method)
  CurrentRefId(): BRepGraph_OccurrenceRefId;

  // BRepGraph_ProductsOfOccurrence.Current (method)
  Current(): BRepGraph_ProductId;

  // BRepGraph_ProductsOfOccurrence.Definition (method)
  Definition(): BRepGraphInc_ProductDef;

  // BRepGraph_ProductsOfOccurrence.Index (method)
  Index(): number;

  // BRepGraph_ProductsOfOccurrence.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_ProductsOfOccurrence.delete (method)
  delete(): void;

  // BRepGraph_ProductsOfOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsEdgesOfVertex: declare class BRepGraph_RefsEdgesOfVertex

  // BRepGraph_RefsEdgesOfVertex.constructor (constructor)
  constructor(theGraph: BRepGraph, theParents: BRepGraph_EdgeId[], theChild: BRepGraph_VertexId);

  // BRepGraph_RefsEdgesOfVertex.More (method)
  More(): boolean;

  // BRepGraph_RefsEdgesOfVertex.Next (method)
  Next(): void;

  // BRepGraph_RefsEdgesOfVertex.Current (method)
  Current(): any;

  // BRepGraph_RefsEdgesOfVertex.CurrentParentId (method)
  CurrentParentId(): BRepGraph_EdgeId;

  // BRepGraph_RefsEdgesOfVertex.CurrentRefId (method)
  CurrentRefId(): BRepGraph_VertexRefId;

  // BRepGraph_RefsEdgesOfVertex.Index (method)
  Index(): number;

  // BRepGraph_RefsEdgesOfVertex.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsEdgesOfVertex.delete (method)
  delete(): void;

  // BRepGraph_RefsEdgesOfVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsShellsOfFace: declare class BRepGraph_RefsShellsOfFace

  // BRepGraph_RefsShellsOfFace.constructor (constructor)
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_FaceRefId[]);
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_FaceRefId[], theStartIndex: number);

  // BRepGraph_RefsShellsOfFace.More (method)
  More(): boolean;

  // BRepGraph_RefsShellsOfFace.Next (method)
  Next(): void;

  // BRepGraph_RefsShellsOfFace.CurrentId (method)
  CurrentId(): BRepGraph_ShellId;

  // BRepGraph_RefsShellsOfFace.CurrentParentId (method)
  CurrentParentId(): BRepGraph_ShellId;

  // BRepGraph_RefsShellsOfFace.CurrentRefId (method)
  CurrentRefId(): BRepGraph_FaceRefId;

  // BRepGraph_RefsShellsOfFace.Current (method)
  Current(): BRepGraph_ShellId;

  // BRepGraph_RefsShellsOfFace.Definition (method)
  Definition(): BRepGraphInc_ShellDef;

  // BRepGraph_RefsShellsOfFace.Index (method)
  Index(): number;

  // BRepGraph_RefsShellsOfFace.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsShellsOfFace.delete (method)
  delete(): void;

  // BRepGraph_RefsShellsOfFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsSolidsOfShell: declare class BRepGraph_RefsSolidsOfShell

  // BRepGraph_RefsSolidsOfShell.constructor (constructor)
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_ShellRefId[]);
  constructor(theGraph: BRepGraph, theRefs: BRepGraph_ShellRefId[], theStartIndex: number);

  // BRepGraph_RefsSolidsOfShell.More (method)
  More(): boolean;

  // BRepGraph_RefsSolidsOfShell.Next (method)
  Next(): void;

  // BRepGraph_RefsSolidsOfShell.CurrentId (method)
  CurrentId(): BRepGraph_SolidId;

  // BRepGraph_RefsSolidsOfShell.CurrentParentId (method)
  CurrentParentId(): BRepGraph_SolidId;

  // BRepGraph_RefsSolidsOfShell.CurrentRefId (method)
  CurrentRefId(): BRepGraph_ShellRefId;

  // BRepGraph_RefsSolidsOfShell.Current (method)
  Current(): BRepGraph_SolidId;

  // BRepGraph_RefsSolidsOfShell.Definition (method)
  Definition(): BRepGraphInc_SolidDef;

  // BRepGraph_RefsSolidsOfShell.Index (method)
  Index(): number;

  // BRepGraph_RefsSolidsOfShell.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsSolidsOfShell.delete (method)
  delete(): void;

  // BRepGraph_RefsSolidsOfShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsWiresOfCoEdge: declare class BRepGraph_RefsWiresOfCoEdge

  // BRepGraph_RefsWiresOfCoEdge.constructor (constructor)
  constructor(theGraph: BRepGraph, theParents: BRepGraph_WireId[], theChild: BRepGraph_CoEdgeId);

  // BRepGraph_RefsWiresOfCoEdge.More (method)
  More(): boolean;

  // BRepGraph_RefsWiresOfCoEdge.Next (method)
  Next(): void;

  // BRepGraph_RefsWiresOfCoEdge.Current (method)
  Current(): any;

  // BRepGraph_RefsWiresOfCoEdge.CurrentParentId (method)
  CurrentParentId(): BRepGraph_WireId;

  // BRepGraph_RefsWiresOfCoEdge.CurrentRefId (method)
  CurrentRefId(): BRepGraph_CoEdgeId;

  // BRepGraph_RefsWiresOfCoEdge.Index (method)
  Index(): number;

  // BRepGraph_RefsWiresOfCoEdge.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsWiresOfCoEdge.delete (method)
  delete(): void;

  // BRepGraph_RefsWiresOfCoEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits: declare class BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits

  // BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits.Id (method)
  static Id(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraph_CompSolidId;

  // BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_CompSolidFromSolidRefTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_CompoundFromChildRefTraits: declare class BRepGraph_ReverseIterator_CompoundFromChildRefTraits

  // BRepGraph_ReverseIterator_CompoundFromChildRefTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_CompoundFromChildRefTraits.Id (method)
  static Id(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraph_CompoundId;

  // BRepGraph_ReverseIterator_CompoundFromChildRefTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_CompoundFromChildRefTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_EdgeOfVertexRefTraits: declare class BRepGraph_ReverseIterator_EdgeOfVertexRefTraits

  // BRepGraph_ReverseIterator_EdgeOfVertexRefTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_EdgeOfVertexRefTraits.FindRef (method)
  static FindRef(theGraph: BRepGraph, theParent: BRepGraph_EdgeId, theChild: BRepGraph_VertexId): BRepGraph_VertexRefId;

  // BRepGraph_ReverseIterator_EdgeOfVertexRefTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_EdgeOfVertexRefTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits: declare class BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits

  // BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits.ParentIdOf (method)
  static ParentIdOf(theCoEdge: BRepGraphInc_CoEdgeDef): BRepGraph_FaceId;

  // BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits.NbParents (method)
  static NbParents(theGraph: BRepGraph): number;

  // BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_FaceFromEdgeCoEdgeTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_FaceFromWireRefTraits: declare class BRepGraph_ReverseIterator_FaceFromWireRefTraits

  // BRepGraph_ReverseIterator_FaceFromWireRefTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_FaceFromWireRefTraits.Id (method)
  static Id(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraph_FaceId;

  // BRepGraph_ReverseIterator_FaceFromWireRefTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_FaceFromWireRefTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits: declare class BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits

  // BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits.Id (method)
  static Id(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraph_OccurrenceId;

  // BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_OccurrenceFromOccurrenceRefTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits: declare class BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits

  // BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits.Id (method)
  static Id(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraph_ProductId;

  // BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_ProductFromOccurrenceRefTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_ShellFromFaceRefTraits: declare class BRepGraph_ReverseIterator_ShellFromFaceRefTraits

  // BRepGraph_ReverseIterator_ShellFromFaceRefTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_ShellFromFaceRefTraits.Id (method)
  static Id(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraph_ShellId;

  // BRepGraph_ReverseIterator_ShellFromFaceRefTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_ShellFromFaceRefTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_SolidFromShellRefTraits: declare class BRepGraph_ReverseIterator_SolidFromShellRefTraits

  // BRepGraph_ReverseIterator_SolidFromShellRefTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_SolidFromShellRefTraits.Id (method)
  static Id(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraph_SolidId;

  // BRepGraph_ReverseIterator_SolidFromShellRefTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_SolidFromShellRefTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits: declare class BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits

  // BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits.ParentIdOf (method)
  static ParentIdOf(theCoEdge: BRepGraphInc_CoEdgeDef): BRepGraph_WireId;

  // BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits.NbParents (method)
  static NbParents(theGraph: BRepGraph): number;

  // BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_WireFromEdgeCoEdgeTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits: declare class BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits

  // BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits.constructor (constructor)
  constructor();

  // BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits.FindRef (method)
  static FindRef(theGraph: BRepGraph, theParent: BRepGraph_WireId, theChild: BRepGraph_CoEdgeId): BRepGraph_CoEdgeId;

  // BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits.delete (method)
  delete(): void;

  // BRepGraph_ReverseIterator_WireOfCoEdgeUsageTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_WiresOfEdge: declare class BRepGraph_WiresOfEdge

  // BRepGraph_WiresOfEdge.constructor (constructor)
  constructor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId);
  constructor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theStartIndex: number);

  // BRepGraph_WiresOfEdge.More (method)
  More(): boolean;

  // BRepGraph_WiresOfEdge.Next (method)
  Next(): void;

  // BRepGraph_WiresOfEdge.CurrentId (method)
  CurrentId(): BRepGraph_WireId;

  // BRepGraph_WiresOfEdge.Current (method)
  Current(): BRepGraph_WireId;

  // BRepGraph_WiresOfEdge.Definition (method)
  Definition(): BRepGraphInc_WireDef;

  // BRepGraph_WiresOfEdge.Index (method)
  Index(): number;

  // BRepGraph_WiresOfEdge.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_WiresOfEdge.delete (method)
  delete(): void;

  // BRepGraph_WiresOfEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ShapesView: declare class BRepGraph_ShapesView

  // BRepGraph_ShapesView.Add (method)
  Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
  Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;

  // BRepGraph_ShapesView.CollectHistoryInputs (method)
  CollectHistoryInputs(theRoots: NCollection_Array1_BRepGraph_NodeId, theOutInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher): void;

  // BRepGraph_ShapesView.AddWithHistory (method)
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
  AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;

  // BRepGraph_ShapesView.Shape (method)
  Shape(theNode: BRepGraph_NodeId): TopoDS_Shape;

  // BRepGraph_ShapesView.HasOriginal (method)
  HasOriginal(theNode: BRepGraph_NodeId): boolean;

  // BRepGraph_ShapesView.Original (method)
  Original(theNode: BRepGraph_NodeId): TopoDS_Shape;

  // BRepGraph_ShapesView.Reconstruct (method)
  Reconstruct(theRoot: BRepGraph_NodeId): TopoDS_Shape;

  // BRepGraph_ShapesView.ClearCached (method)
  ClearCached(theNode: BRepGraph_NodeId): void;
  ClearCached(theRef: BRepGraph_RefId): void;

  // BRepGraph_ShapesView.FindNode (method)
  FindNode(theShape: TopoDS_Shape): BRepGraph_NodeId;

  // BRepGraph_ShapesView.HasNode (method)
  HasNode(theShape: TopoDS_Shape): boolean;

  // BRepGraph_ShapesView.RemoveShape (method)
  RemoveShape(theShape: TopoDS_Shape): boolean;

  // BRepGraph_ShapesView.delete (method)
  delete(): void;

  // BRepGraph_ShapesView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ShapesView_AddStatus: typeof BRepGraph_ShapesView_AddStatus[keyof typeof BRepGraph_ShapesView_AddStatus]

  readonly Success: 'Success'

  readonly SuccessWithWarnings: 'SuccessWithWarnings'

  readonly Failed: 'Failed'

BRepGraph_ShapesView_Result: declare class BRepGraph_ShapesView_Result

  // BRepGraph_ShapesView_Result.constructor (constructor)
  constructor();

  TopologyRoot: BRepGraph_NodeId

  Product: BRepGraph_ProductId

  Occurrence: BRepGraph_OccurrenceId

  InsertedRef: BRepGraph_RefId

  Status: BRepGraph_ShapesView_AddStatus

  AddedNodes: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher

  // BRepGraph_ShapesView_Result.IsOk (method)
  IsOk(): boolean;

  // BRepGraph_ShapesView_Result.delete (method)
  delete(): void;

  // BRepGraph_ShapesView_Result.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_SupplementEditor: declare class BRepGraph_SupplementEditor

  // BRepGraph_SupplementEditor.constructor (constructor)
  constructor(theGraph: BRepGraph);

  // BRepGraph_SupplementEditor.Attach (method)
  Attach(theOwner: BRepGraph_NodeId, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): number;

  // BRepGraph_SupplementEditor.AttachToVertex (method)
  AttachToVertex(theVertex: BRepGraph_VertexId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  // BRepGraph_SupplementEditor.AttachToEdge (method)
  AttachToEdge(theEdge: BRepGraph_EdgeId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  // BRepGraph_SupplementEditor.AttachToFace (method)
  AttachToFace(theFace: BRepGraph_FaceId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  // BRepGraph_SupplementEditor.AttachToSolid (method)
  AttachToSolid(theSolid: BRepGraph_SolidId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  // BRepGraph_SupplementEditor.AttachToCompSolid (method)
  AttachToCompSolid(theCompSolid: BRepGraph_CompSolidId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  // BRepGraph_SupplementEditor.AttachToShell (method)
  AttachToShell(theShell: BRepGraph_ShellId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  // BRepGraph_SupplementEditor.AttachToCompound (method)
  AttachToCompound(theCompound: BRepGraph_CompoundId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;

  // BRepGraph_SupplementEditor.RemoveAttachment (method)
  RemoveAttachment(theUid: number): boolean;

  // BRepGraph_SupplementEditor.delete (method)
  delete(): void;

  // BRepGraph_SupplementEditor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_SupplementIterator: declare class BRepGraph_SupplementIterator

  // BRepGraph_SupplementIterator.constructor (constructor)
  constructor(theGraph: BRepGraph, theOwner: BRepGraph_NodeId);

  // BRepGraph_SupplementIterator.More (method)
  More(): boolean;

  // BRepGraph_SupplementIterator.Next (method)
  Next(): void;

  // BRepGraph_SupplementIterator.Uid (method)
  Uid(): number;

  // BRepGraph_SupplementIterator.Value (method)
  Value(): BRepGraph_LayerTopoSupplement_Entry;

  // BRepGraph_SupplementIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_SupplementIterator.delete (method)
  delete(): void;

  // BRepGraph_SupplementIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Tool: declare class BRepGraph_Tool

  // BRepGraph_Tool.delete (method)
  delete(): void;

  // BRepGraph_Tool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Tool_CoEdge: declare class BRepGraph_Tool_CoEdge

  // BRepGraph_Tool_CoEdge.constructor (constructor)
  constructor();

  // BRepGraph_Tool_CoEdge.Orientation (method)
  static Orientation(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): TopAbs_Orientation;

  // BRepGraph_Tool_CoEdge.IsReversed (method)
  static IsReversed(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_Tool_CoEdge.EdgeOf (method)
  static EdgeOf(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_EdgeId;

  // BRepGraph_Tool_CoEdge.FaceOf (method)
  static FaceOf(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_FaceId;

  // BRepGraph_Tool_CoEdge.SeamPair (method)
  static SeamPair(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CoEdgeId;

  // BRepGraph_Tool_CoEdge.IsSeam (method)
  static IsSeam(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_Tool_CoEdge.HasPCurve (method)
  static HasPCurve(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_Tool_CoEdge.SameParameter (method)
  static SameParameter(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_Tool_CoEdge.SameRange (method)
  static SameRange(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

  // BRepGraph_Tool_CoEdge.PCurve (method)
  static PCurve(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): Geom2d_Curve;

  // BRepGraph_Tool_CoEdge.PCurveAdaptor (method)
  static PCurveAdaptor(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): Geom2dAdaptor_Curve;
  static PCurveAdaptor(theGraph: BRepGraph, theRef: any): Geom2dAdaptor_Curve;

  // BRepGraph_Tool_CoEdge.UVPoints (method)
  static UVPoints(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): [gp_Pnt2d, gp_Pnt2d];

  // BRepGraph_Tool_CoEdge.Range (method)
  static Range(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): [number, number];

  // BRepGraph_Tool_CoEdge.delete (method)
  delete(): void;

  // BRepGraph_Tool_CoEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Tool_Edge: declare class BRepGraph_Tool_Edge

  // BRepGraph_Tool_Edge.constructor (constructor)
  constructor();

  // BRepGraph_Tool_Edge.Tolerance (method)
  static Tolerance(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): number;

  // BRepGraph_Tool_Edge.Degenerated (method)
  static Degenerated(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_Tool_Edge.IsClosed (method)
  static IsClosed(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_Tool_Edge.Range (method)
  static Range(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): [number, number];

  // BRepGraph_Tool_Edge.StartVertexId (method)
  static StartVertexId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): BRepGraph_VertexRefId;

  // BRepGraph_Tool_Edge.EndVertexId (method)
  static EndVertexId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): BRepGraph_VertexRefId;

  // BRepGraph_Tool_Edge.HasCurve (method)
  static HasCurve(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_Tool_Edge.Curve (method)
  static Curve(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): Geom_Curve;
  static Curve(theGraph: BRepGraph, theRef: any): Geom_Curve;

  // BRepGraph_Tool_Edge.CurveAdaptor (method)
  static CurveAdaptor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): GeomAdaptor_TransformedCurve;
  static CurveAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedCurve;

  // BRepGraph_Tool_Edge.FindByVertices (method)
  static FindByVertices(theGraph: BRepGraph, theStartVertex: BRepGraph_VertexId, theEndVertex: BRepGraph_VertexId, theToIgnoreOrientation?: boolean): BRepGraph_EdgeId;

  // BRepGraph_Tool_Edge.FindPCurveCoEdgeId (method)
  static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
  static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;

  // BRepGraph_Tool_Edge.FindCoEdgeId (method)
  static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
  static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;

  // BRepGraph_Tool_Edge.NbFaces (method)
  static NbFaces(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): number;

  // BRepGraph_Tool_Edge.IsManifold (method)
  static IsManifold(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_Tool_Edge.IsBoundary (method)
  static IsBoundary(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

  // BRepGraph_Tool_Edge.IsSeamOnFace (method)
  static IsSeamOnFace(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): boolean;

  // BRepGraph_Tool_Edge.CurveOnSurface (method)
  static CurveOnSurface(theGraph: BRepGraph, theRef: any, theFace: BRepGraph_FaceId): Adaptor3d_CurveOnSurface;

  // BRepGraph_Tool_Edge.delete (method)
  delete(): void;

  // BRepGraph_Tool_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Tool_Face: declare class BRepGraph_Tool_Face

  // BRepGraph_Tool_Face.constructor (constructor)
  constructor();

  // BRepGraph_Tool_Face.Usage (method)
  static Usage(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): any;

  // BRepGraph_Tool_Face.Tolerance (method)
  static Tolerance(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
  static Tolerance(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;

  // BRepGraph_Tool_Face.HasSurface (method)
  static HasSurface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): boolean;
  static HasSurface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): boolean;

  // BRepGraph_Tool_Face.OuterWire (method)
  static OuterWire(theGraph: BRepGraph, theFace: BRepGraph_FaceId): BRepGraph_WireId;
  static OuterWire(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): BRepGraph_WireId;

  // BRepGraph_Tool_Face.Surface (method)
  static Surface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): Geom_Surface;
  static Surface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): Geom_Surface;

  // BRepGraph_Tool_Face.SurfaceAdaptor (method)
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
  static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;

  // BRepGraph_Tool_Face.NbWires (method)
  static NbWires(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
  static NbWires(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;

  // BRepGraph_Tool_Face.Bounds (method)
  static Bounds(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };
  static Bounds(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };

  // BRepGraph_Tool_Face.delete (method)
  delete(): void;

  // BRepGraph_Tool_Face.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Tool_Shell: declare class BRepGraph_Tool_Shell

  // BRepGraph_Tool_Shell.constructor (constructor)
  constructor();

  // BRepGraph_Tool_Shell.Usage (method)
  static Usage(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): any;

  // BRepGraph_Tool_Shell.IsClosed (method)
  static IsClosed(theGraph: BRepGraph, theShell: BRepGraph_ShellId): boolean;
  static IsClosed(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): boolean;

  // BRepGraph_Tool_Shell.NbFaces (method)
  static NbFaces(theGraph: BRepGraph, theShell: BRepGraph_ShellId): number;
  static NbFaces(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): number;

  // BRepGraph_Tool_Shell.delete (method)
  delete(): void;

  // BRepGraph_Tool_Shell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_Tool_Vertex: declare class BRepGraph_Tool_Vertex

  // BRepGraph_Tool_Vertex.constructor (constructor)
  constructor();

  // BRepGraph_Tool_Vertex.Usage (method)
  static Usage(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): any;

  // BRepGraph_Tool_Vertex.Pnt (method)
  static Pnt(theGraph: BRepGraph, theRef: any): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): gp_Pnt;
  static Pnt(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): gp_Pnt;

  // BRepGraph_Tool_Vertex.Tolerance (method)
  static Tolerance(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): number;
  static Tolerance(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): number;

  // BRepGraph_Tool_Vertex.NbEdges (method)
  static NbEdges(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): number;

  // BRepGraph_Tool_Vertex.delete (method)
  delete(): void;

  // BRepGraph_Tool_Vertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
