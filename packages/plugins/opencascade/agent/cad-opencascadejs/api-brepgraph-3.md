# libcascade — BRepGraph (3)

50 top-level symbols. Signatures are verbatim typescript.

BRepGraph_NodeId: declare class BRepGraph_NodeId

  // BRepGraph_NodeId.constructor (constructor)
  constructor();
  constructor(theKind: BRepGraph_NodeId_Kind, theIdx: number);

  NodeKind: BRepGraph_NodeId_Kind

  Index: number

  // BRepGraph_NodeId.IsValidKind (method)
  static IsValidKind(theKind: BRepGraph_NodeId_Kind): boolean;

  // BRepGraph_NodeId.IsTopologyKind (method)
  static IsTopologyKind(theKind: BRepGraph_NodeId_Kind): boolean;

  // BRepGraph_NodeId.IsAssemblyKind (method)
  static IsAssemblyKind(theKind: BRepGraph_NodeId_Kind): boolean;

  // BRepGraph_NodeId.Start (method)
  static Start(theKind: BRepGraph_NodeId_Kind): BRepGraph_NodeId;

  // BRepGraph_NodeId.Invalid (method)
  static Invalid(theKind?: BRepGraph_NodeId_Kind): BRepGraph_NodeId;

  // BRepGraph_NodeId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_NodeId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_NodeId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_NodeId.delete (method)
  delete(): void;

  // BRepGraph_NodeId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_NodeId_Kind: typeof BRepGraph_NodeId_Kind[keyof typeof BRepGraph_NodeId_Kind]

  readonly Solid: 'Solid'

  readonly Shell: 'Shell'

  readonly Face: 'Face'

  readonly Wire: 'Wire'

  readonly Edge: 'Edge'

  readonly Vertex: 'Vertex'

  readonly Compound: 'Compound'

  readonly CompSolid: 'CompSolid'

  readonly CoEdge: 'CoEdge'

  readonly Product: 'Product'

  readonly Occurrence: 'Occurrence'

BRepGraph_OccurrenceId: declare class BRepGraph_OccurrenceId

  // BRepGraph_OccurrenceId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_OccurrenceId.Start (method)
  static Start(): unknown;

  // BRepGraph_OccurrenceId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_OccurrenceId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_OccurrenceId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_OccurrenceId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_OccurrenceId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_OccurrenceId.delete (method)
  delete(): void;

  // BRepGraph_OccurrenceId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ProductId: declare class BRepGraph_ProductId

  // BRepGraph_ProductId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_ProductId.Start (method)
  static Start(): unknown;

  // BRepGraph_ProductId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_ProductId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_ProductId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_ProductId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_ProductId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_ProductId.delete (method)
  delete(): void;

  // BRepGraph_ProductId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ShellId: declare class BRepGraph_ShellId

  // BRepGraph_ShellId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_ShellId.Start (method)
  static Start(): unknown;

  // BRepGraph_ShellId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_ShellId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_ShellId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_ShellId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_ShellId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_ShellId.delete (method)
  delete(): void;

  // BRepGraph_ShellId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_SolidId: declare class BRepGraph_SolidId

  // BRepGraph_SolidId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_SolidId.Start (method)
  static Start(): unknown;

  // BRepGraph_SolidId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_SolidId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_SolidId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_SolidId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_SolidId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_SolidId.delete (method)
  delete(): void;

  // BRepGraph_SolidId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_VertexId: declare class BRepGraph_VertexId

  // BRepGraph_VertexId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_VertexId.Start (method)
  static Start(): unknown;

  // BRepGraph_VertexId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_VertexId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_VertexId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_VertexId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_VertexId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_VertexId.delete (method)
  delete(): void;

  // BRepGraph_VertexId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_WireId: declare class BRepGraph_WireId

  // BRepGraph_WireId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theId: BRepGraph_NodeId);

  Index: number

  // BRepGraph_WireId.Start (method)
  static Start(): unknown;

  // BRepGraph_WireId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_WireId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_WireId.FromNodeId (method)
  static FromNodeId(theId: BRepGraph_NodeId): unknown;

  // BRepGraph_WireId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_WireId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_WireId.delete (method)
  delete(): void;

  // BRepGraph_WireId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ParallelPolicy: declare class BRepGraph_ParallelPolicy

  // BRepGraph_ParallelPolicy.constructor (constructor)
  constructor();

  // BRepGraph_ParallelPolicy.WorkerCount (method)
  static WorkerCount(): number;

  // BRepGraph_ParallelPolicy.IsParallelAllowed (method)
  static IsParallelAllowed(theAllowParallel: boolean): boolean;

  // BRepGraph_ParallelPolicy.ShouldRun (method)
  static ShouldRun(theAllowParallel: boolean, theWorkers: number, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;
  static ShouldRun(theAllowParallel: boolean, theWorkload: BRepGraph_ParallelPolicy_Workload): boolean;

  // BRepGraph_ParallelPolicy.delete (method)
  delete(): void;

  // BRepGraph_ParallelPolicy.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ParentExplorer: declare class BRepGraph_ParentExplorer

  // BRepGraph_ParentExplorer.constructor (constructor)
  constructor(theGraph: BRepGraph, theNode: BRepGraph_NodeId);
  constructor(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theConfig: BRepGraph_ParentExplorer_Config);
  constructor(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theMode: BRepGraph_ParentExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theTargetKind: BRepGraph_NodeId_Kind);
  constructor(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theTargetKind: BRepGraph_NodeId_Kind, theMode: BRepGraph_ParentExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theAvoidKind: BRepGraph_NodeId_Kind | null | undefined, theEmitAvoidKind: boolean, theMode?: BRepGraph_ParentExplorer_TraversalMode);
  constructor(theGraph: BRepGraph, theNode: BRepGraph_NodeId, theTargetKind: BRepGraph_NodeId_Kind, theAvoidKind: BRepGraph_NodeId_Kind | null | undefined, theEmitAvoidKind: boolean, theMode?: BRepGraph_ParentExplorer_TraversalMode);

  // BRepGraph_ParentExplorer.GetConfig (method)
  GetConfig(): BRepGraph_ParentExplorer_Config;

  // BRepGraph_ParentExplorer.More (method)
  More(): boolean;

  // BRepGraph_ParentExplorer.Next (method)
  Next(): void;

  // BRepGraph_ParentExplorer.Current (method)
  Current(): any;

  // BRepGraph_ParentExplorer.CurrentChild (method)
  CurrentChild(): BRepGraph_NodeId;

  // BRepGraph_ParentExplorer.CurrentLinkKind (method)
  CurrentLinkKind(): BRepGraph_ParentExplorer_LinkKind;

  // BRepGraph_ParentExplorer.CurrentRef (method)
  CurrentRef(): BRepGraph_RefId;

  // BRepGraph_ParentExplorer.LeafLocation (method)
  LeafLocation(): TopLoc_Location;

  // BRepGraph_ParentExplorer.LeafOrientation (method)
  LeafOrientation(): TopAbs_Orientation;

  // BRepGraph_ParentExplorer.IsCurrentBranchRoot (method)
  IsCurrentBranchRoot(): boolean;

  // BRepGraph_ParentExplorer.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_ParentExplorer.delete (method)
  delete(): void;

  // BRepGraph_ParentExplorer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_ParentExplorer_LinkKind: typeof BRepGraph_ParentExplorer_LinkKind[keyof typeof BRepGraph_ParentExplorer_LinkKind]

  readonly None: 'None'

  readonly Reference: 'Reference'

  readonly Structural: 'Structural'

BRepGraph_ParentExplorer_TraversalMode: typeof BRepGraph_ParentExplorer_TraversalMode[keyof typeof BRepGraph_ParentExplorer_TraversalMode]

  readonly Recursive: 'Recursive'

  readonly DirectParents: 'DirectParents'

BRepGraph_ChildRefId: declare class BRepGraph_ChildRefId

  // BRepGraph_ChildRefId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theRefId: BRepGraph_RefId);

  Index: number

  // BRepGraph_ChildRefId.Start (method)
  static Start(): unknown;

  // BRepGraph_ChildRefId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_ChildRefId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_ChildRefId.FromRefId (method)
  static FromRefId(theRefId: BRepGraph_RefId): unknown;

  // BRepGraph_ChildRefId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_ChildRefId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_ChildRefId.delete (method)
  delete(): void;

  // BRepGraph_ChildRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FaceRefId: declare class BRepGraph_FaceRefId

  // BRepGraph_FaceRefId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theRefId: BRepGraph_RefId);

  Index: number

  // BRepGraph_FaceRefId.Start (method)
  static Start(): unknown;

  // BRepGraph_FaceRefId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_FaceRefId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_FaceRefId.FromRefId (method)
  static FromRefId(theRefId: BRepGraph_RefId): unknown;

  // BRepGraph_FaceRefId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_FaceRefId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_FaceRefId.delete (method)
  delete(): void;

  // BRepGraph_FaceRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_OccurrenceRefId: declare class BRepGraph_OccurrenceRefId

  // BRepGraph_OccurrenceRefId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theRefId: BRepGraph_RefId);

  Index: number

  // BRepGraph_OccurrenceRefId.Start (method)
  static Start(): unknown;

  // BRepGraph_OccurrenceRefId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_OccurrenceRefId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_OccurrenceRefId.FromRefId (method)
  static FromRefId(theRefId: BRepGraph_RefId): unknown;

  // BRepGraph_OccurrenceRefId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_OccurrenceRefId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_OccurrenceRefId.delete (method)
  delete(): void;

  // BRepGraph_OccurrenceRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefId: declare class BRepGraph_RefId

  // BRepGraph_RefId.constructor (constructor)
  constructor();
  constructor(theKind: BRepGraph_RefId_Kind, theIdx: number);

  RefKind: BRepGraph_RefId_Kind

  Index: number

  // BRepGraph_RefId.IsValidKind (method)
  static IsValidKind(theKind: BRepGraph_RefId_Kind): boolean;

  // BRepGraph_RefId.IsTopologyRefKind (method)
  static IsTopologyRefKind(theKind: BRepGraph_RefId_Kind): boolean;

  // BRepGraph_RefId.Start (method)
  static Start(theKind: BRepGraph_RefId_Kind): BRepGraph_RefId;

  // BRepGraph_RefId.Invalid (method)
  static Invalid(theKind?: BRepGraph_RefId_Kind): BRepGraph_RefId;

  // BRepGraph_RefId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_RefId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_RefId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_RefId.delete (method)
  delete(): void;

  // BRepGraph_RefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefId_Kind: typeof BRepGraph_RefId_Kind[keyof typeof BRepGraph_RefId_Kind]

  readonly Shell: 'Shell'

  readonly Face: 'Face'

  readonly Wire: 'Wire'

  readonly Vertex: 'Vertex'

  readonly Solid: 'Solid'

  readonly Child: 'Child'

  readonly Occurrence: 'Occurrence'

BRepGraph_ShellRefId: declare class BRepGraph_ShellRefId

  // BRepGraph_ShellRefId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theRefId: BRepGraph_RefId);

  Index: number

  // BRepGraph_ShellRefId.Start (method)
  static Start(): unknown;

  // BRepGraph_ShellRefId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_ShellRefId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_ShellRefId.FromRefId (method)
  static FromRefId(theRefId: BRepGraph_RefId): unknown;

  // BRepGraph_ShellRefId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_ShellRefId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_ShellRefId.delete (method)
  delete(): void;

  // BRepGraph_ShellRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_SolidRefId: declare class BRepGraph_SolidRefId

  // BRepGraph_SolidRefId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theRefId: BRepGraph_RefId);

  Index: number

  // BRepGraph_SolidRefId.Start (method)
  static Start(): unknown;

  // BRepGraph_SolidRefId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_SolidRefId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_SolidRefId.FromRefId (method)
  static FromRefId(theRefId: BRepGraph_RefId): unknown;

  // BRepGraph_SolidRefId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_SolidRefId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_SolidRefId.delete (method)
  delete(): void;

  // BRepGraph_SolidRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_VertexRefId: declare class BRepGraph_VertexRefId

  // BRepGraph_VertexRefId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theRefId: BRepGraph_RefId);

  Index: number

  // BRepGraph_VertexRefId.Start (method)
  static Start(): unknown;

  // BRepGraph_VertexRefId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_VertexRefId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_VertexRefId.FromRefId (method)
  static FromRefId(theRefId: BRepGraph_RefId): unknown;

  // BRepGraph_VertexRefId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_VertexRefId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_VertexRefId.delete (method)
  delete(): void;

  // BRepGraph_VertexRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_WireRefId: declare class BRepGraph_WireRefId

  // BRepGraph_WireRefId.constructor (constructor)
  constructor();
  constructor(theIdx: number);
  constructor(theRefId: BRepGraph_RefId);

  Index: number

  // BRepGraph_WireRefId.Start (method)
  static Start(): unknown;

  // BRepGraph_WireRefId.Invalid (method)
  static Invalid(): unknown;

  // BRepGraph_WireRefId.IsValid (method)
  IsValid(): boolean;
  IsValid(theMaxCount: number): boolean;

  // BRepGraph_WireRefId.FromRefId (method)
  static FromRefId(theRefId: BRepGraph_RefId): unknown;

  // BRepGraph_WireRefId.IsRemoved (method)
  IsRemoved(theGraph: BRepGraph): boolean;

  // BRepGraph_WireRefId.IsOwned (method)
  IsOwned(theGraph: BRepGraph): boolean;

  // BRepGraph_WireRefId.delete (method)
  delete(): void;

  // BRepGraph_WireRefId.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefUID: declare class BRepGraph_RefUID

  // BRepGraph_RefUID.constructor (constructor)
  constructor();
  constructor(theKind: BRepGraph_RefId_Kind, theCounter: number);

  Kind: BRepGraph_RefId_Kind

  Counter: number

  // BRepGraph_RefUID.Invalid (method)
  static Invalid(): BRepGraph_RefUID;

  // BRepGraph_RefUID.IsValid (method)
  IsValid(): boolean;

  // BRepGraph_RefUID.HashValue (method)
  HashValue(): number;

  // BRepGraph_RefUID.delete (method)
  delete(): void;

  // BRepGraph_RefUID.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_CoEdgesOfWire: declare class BRepGraph_CoEdgesOfWire

  // BRepGraph_CoEdgesOfWire.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_CoEdgesOfWire.More (method)
  More(): boolean;

  // BRepGraph_CoEdgesOfWire.Next (method)
  Next(): void;

  // BRepGraph_CoEdgesOfWire.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_CoEdgesOfWire.Index (method)
  Index(): number;

  // BRepGraph_CoEdgesOfWire.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_CoEdgesOfWire.delete (method)
  delete(): void;

  // BRepGraph_CoEdgesOfWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FullChildRefIterator: declare class BRepGraph_FullChildRefIterator

  // BRepGraph_FullChildRefIterator.constructor (constructor)
  constructor(theGraph: BRepGraph);
  constructor(theGraph: BRepGraph, theStartId: unknown);

  // BRepGraph_FullChildRefIterator.More (method)
  More(): boolean;

  // BRepGraph_FullChildRefIterator.Next (method)
  Next(): void;

  // BRepGraph_FullChildRefIterator.Current (method)
  Current(): unknown;

  // BRepGraph_FullChildRefIterator.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_FullChildRefIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FullChildRefIterator.delete (method)
  delete(): void;

  // BRepGraph_FullChildRefIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FullFaceRefIterator: declare class BRepGraph_FullFaceRefIterator

  // BRepGraph_FullFaceRefIterator.constructor (constructor)
  constructor(theGraph: BRepGraph);
  constructor(theGraph: BRepGraph, theStartId: unknown);

  // BRepGraph_FullFaceRefIterator.More (method)
  More(): boolean;

  // BRepGraph_FullFaceRefIterator.Next (method)
  Next(): void;

  // BRepGraph_FullFaceRefIterator.Current (method)
  Current(): unknown;

  // BRepGraph_FullFaceRefIterator.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_FullFaceRefIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FullFaceRefIterator.delete (method)
  delete(): void;

  // BRepGraph_FullFaceRefIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FullOccurrenceRefIterator: declare class BRepGraph_FullOccurrenceRefIterator

  // BRepGraph_FullOccurrenceRefIterator.constructor (constructor)
  constructor(theGraph: BRepGraph);
  constructor(theGraph: BRepGraph, theStartId: unknown);

  // BRepGraph_FullOccurrenceRefIterator.More (method)
  More(): boolean;

  // BRepGraph_FullOccurrenceRefIterator.Next (method)
  Next(): void;

  // BRepGraph_FullOccurrenceRefIterator.Current (method)
  Current(): unknown;

  // BRepGraph_FullOccurrenceRefIterator.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_FullOccurrenceRefIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FullOccurrenceRefIterator.delete (method)
  delete(): void;

  // BRepGraph_FullOccurrenceRefIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FullShellRefIterator: declare class BRepGraph_FullShellRefIterator

  // BRepGraph_FullShellRefIterator.constructor (constructor)
  constructor(theGraph: BRepGraph);
  constructor(theGraph: BRepGraph, theStartId: unknown);

  // BRepGraph_FullShellRefIterator.More (method)
  More(): boolean;

  // BRepGraph_FullShellRefIterator.Next (method)
  Next(): void;

  // BRepGraph_FullShellRefIterator.Current (method)
  Current(): unknown;

  // BRepGraph_FullShellRefIterator.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_FullShellRefIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FullShellRefIterator.delete (method)
  delete(): void;

  // BRepGraph_FullShellRefIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FullSolidRefIterator: declare class BRepGraph_FullSolidRefIterator

  // BRepGraph_FullSolidRefIterator.constructor (constructor)
  constructor(theGraph: BRepGraph);
  constructor(theGraph: BRepGraph, theStartId: unknown);

  // BRepGraph_FullSolidRefIterator.More (method)
  More(): boolean;

  // BRepGraph_FullSolidRefIterator.Next (method)
  Next(): void;

  // BRepGraph_FullSolidRefIterator.Current (method)
  Current(): unknown;

  // BRepGraph_FullSolidRefIterator.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_FullSolidRefIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FullSolidRefIterator.delete (method)
  delete(): void;

  // BRepGraph_FullSolidRefIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FullVertexRefIterator: declare class BRepGraph_FullVertexRefIterator

  // BRepGraph_FullVertexRefIterator.constructor (constructor)
  constructor(theGraph: BRepGraph);
  constructor(theGraph: BRepGraph, theStartId: unknown);

  // BRepGraph_FullVertexRefIterator.More (method)
  More(): boolean;

  // BRepGraph_FullVertexRefIterator.Next (method)
  Next(): void;

  // BRepGraph_FullVertexRefIterator.Current (method)
  Current(): unknown;

  // BRepGraph_FullVertexRefIterator.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_FullVertexRefIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FullVertexRefIterator.delete (method)
  delete(): void;

  // BRepGraph_FullVertexRefIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_FullWireRefIterator: declare class BRepGraph_FullWireRefIterator

  // BRepGraph_FullWireRefIterator.constructor (constructor)
  constructor(theGraph: BRepGraph);
  constructor(theGraph: BRepGraph, theStartId: unknown);

  // BRepGraph_FullWireRefIterator.More (method)
  More(): boolean;

  // BRepGraph_FullWireRefIterator.Next (method)
  Next(): void;

  // BRepGraph_FullWireRefIterator.Current (method)
  Current(): unknown;

  // BRepGraph_FullWireRefIterator.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_FullWireRefIterator.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_FullWireRefIterator.delete (method)
  delete(): void;

  // BRepGraph_FullWireRefIterator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsChildOfCompound: declare class BRepGraph_RefsChildOfCompound

  // BRepGraph_RefsChildOfCompound.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_RefsChildOfCompound.More (method)
  More(): boolean;

  // BRepGraph_RefsChildOfCompound.Next (method)
  Next(): void;

  // BRepGraph_RefsChildOfCompound.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_RefsChildOfCompound.Index (method)
  Index(): number;

  // BRepGraph_RefsChildOfCompound.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsChildOfCompound.delete (method)
  delete(): void;

  // BRepGraph_RefsChildOfCompound.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsFaceOfShell: declare class BRepGraph_RefsFaceOfShell

  // BRepGraph_RefsFaceOfShell.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_RefsFaceOfShell.More (method)
  More(): boolean;

  // BRepGraph_RefsFaceOfShell.Next (method)
  Next(): void;

  // BRepGraph_RefsFaceOfShell.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_RefsFaceOfShell.Index (method)
  Index(): number;

  // BRepGraph_RefsFaceOfShell.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsFaceOfShell.delete (method)
  delete(): void;

  // BRepGraph_RefsFaceOfShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsIterator_ChildOfCompoundTraits: declare class BRepGraph_RefsIterator_ChildOfCompoundTraits

  // BRepGraph_RefsIterator_ChildOfCompoundTraits.constructor (constructor)
  constructor();

  // BRepGraph_RefsIterator_ChildOfCompoundTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): boolean;

  // BRepGraph_RefsIterator_ChildOfCompoundTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompoundId): BRepGraph_ChildRefId[];

  // BRepGraph_RefsIterator_ChildOfCompoundTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

  // BRepGraph_RefsIterator_ChildOfCompoundTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ChildRef): BRepGraph_NodeId;

  // BRepGraph_RefsIterator_ChildOfCompoundTraits.delete (method)
  delete(): void;

  // BRepGraph_RefsIterator_ChildOfCompoundTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsIterator_CoEdgeOfWireTraits: declare class BRepGraph_RefsIterator_CoEdgeOfWireTraits

  // BRepGraph_RefsIterator_CoEdgeOfWireTraits.constructor (constructor)
  constructor();

  // BRepGraph_RefsIterator_CoEdgeOfWireTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_WireId): boolean;

  // BRepGraph_RefsIterator_CoEdgeOfWireTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_WireId): BRepGraph_CoEdgeId[];

  // BRepGraph_RefsIterator_CoEdgeOfWireTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

  // BRepGraph_RefsIterator_CoEdgeOfWireTraits.delete (method)
  delete(): void;

  // BRepGraph_RefsIterator_CoEdgeOfWireTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsIterator_FaceOfShellTraits: declare class BRepGraph_RefsIterator_FaceOfShellTraits

  // BRepGraph_RefsIterator_FaceOfShellTraits.constructor (constructor)
  constructor();

  // BRepGraph_RefsIterator_FaceOfShellTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ShellId): boolean;

  // BRepGraph_RefsIterator_FaceOfShellTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ShellId): BRepGraph_FaceRefId[];

  // BRepGraph_RefsIterator_FaceOfShellTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

  // BRepGraph_RefsIterator_FaceOfShellTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_FaceRef): BRepGraph_FaceId;

  // BRepGraph_RefsIterator_FaceOfShellTraits.delete (method)
  delete(): void;

  // BRepGraph_RefsIterator_FaceOfShellTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsIterator_OccurrenceOfProductTraits: declare class BRepGraph_RefsIterator_OccurrenceOfProductTraits

  // BRepGraph_RefsIterator_OccurrenceOfProductTraits.constructor (constructor)
  constructor();

  // BRepGraph_RefsIterator_OccurrenceOfProductTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_ProductId): boolean;

  // BRepGraph_RefsIterator_OccurrenceOfProductTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

  // BRepGraph_RefsIterator_OccurrenceOfProductTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  // BRepGraph_RefsIterator_OccurrenceOfProductTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_OccurrenceRef): BRepGraph_OccurrenceId;

  // BRepGraph_RefsIterator_OccurrenceOfProductTraits.delete (method)
  delete(): void;

  // BRepGraph_RefsIterator_OccurrenceOfProductTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsIterator_RefsVertexOfEdge: declare class BRepGraph_RefsIterator_RefsVertexOfEdge

  // BRepGraph_RefsIterator_RefsVertexOfEdge.constructor (constructor)
  constructor(theGraph: BRepGraph, theEdgeId: BRepGraph_EdgeId);

  // BRepGraph_RefsIterator_RefsVertexOfEdge.More (method)
  More(): boolean;

  // BRepGraph_RefsIterator_RefsVertexOfEdge.Next (method)
  Next(): void;

  // BRepGraph_RefsIterator_RefsVertexOfEdge.CurrentId (method)
  CurrentId(): BRepGraph_VertexRefId;

  // BRepGraph_RefsIterator_RefsVertexOfEdge.Index (method)
  Index(): number;

  // BRepGraph_RefsIterator_RefsVertexOfEdge.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsIterator_RefsVertexOfEdge.delete (method)
  delete(): void;

  // BRepGraph_RefsIterator_RefsVertexOfEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsIterator_ShellOfSolidTraits: declare class BRepGraph_RefsIterator_ShellOfSolidTraits

  // BRepGraph_RefsIterator_ShellOfSolidTraits.constructor (constructor)
  constructor();

  // BRepGraph_RefsIterator_ShellOfSolidTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_SolidId): boolean;

  // BRepGraph_RefsIterator_ShellOfSolidTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_SolidId): BRepGraph_ShellRefId[];

  // BRepGraph_RefsIterator_ShellOfSolidTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  // BRepGraph_RefsIterator_ShellOfSolidTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_ShellRef): BRepGraph_ShellId;

  // BRepGraph_RefsIterator_ShellOfSolidTraits.delete (method)
  delete(): void;

  // BRepGraph_RefsIterator_ShellOfSolidTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsIterator_SolidOfCompSolidTraits: declare class BRepGraph_RefsIterator_SolidOfCompSolidTraits

  // BRepGraph_RefsIterator_SolidOfCompSolidTraits.constructor (constructor)
  constructor();

  // BRepGraph_RefsIterator_SolidOfCompSolidTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): boolean;

  // BRepGraph_RefsIterator_SolidOfCompSolidTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_CompSolidId): BRepGraph_SolidRefId[];

  // BRepGraph_RefsIterator_SolidOfCompSolidTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_SolidRefId): BRepGraphInc_SolidRef;

  // BRepGraph_RefsIterator_SolidOfCompSolidTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_SolidRef): BRepGraph_SolidId;

  // BRepGraph_RefsIterator_SolidOfCompSolidTraits.delete (method)
  delete(): void;

  // BRepGraph_RefsIterator_SolidOfCompSolidTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsIterator_WireOfFaceTraits: declare class BRepGraph_RefsIterator_WireOfFaceTraits

  // BRepGraph_RefsIterator_WireOfFaceTraits.constructor (constructor)
  constructor();

  // BRepGraph_RefsIterator_WireOfFaceTraits.IsParentValid (method)
  static IsParentValid(theGraph: BRepGraph, theParent: BRepGraph_FaceId): boolean;

  // BRepGraph_RefsIterator_WireOfFaceTraits.RefIds (method)
  static RefIds(theGraph: BRepGraph, theParent: BRepGraph_FaceId): BRepGraph_WireRefId[];

  // BRepGraph_RefsIterator_WireOfFaceTraits.Ref (method)
  static Ref(theGraph: BRepGraph, theRefId: BRepGraph_WireRefId): BRepGraphInc_WireRef;

  // BRepGraph_RefsIterator_WireOfFaceTraits.ChildIdOf (method)
  static ChildIdOf(argNo0: BRepGraph, theRef: BRepGraphInc_WireRef): BRepGraph_WireId;

  // BRepGraph_RefsIterator_WireOfFaceTraits.delete (method)
  delete(): void;

  // BRepGraph_RefsIterator_WireOfFaceTraits.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsOccurrenceOfProduct: declare class BRepGraph_RefsOccurrenceOfProduct

  // BRepGraph_RefsOccurrenceOfProduct.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_RefsOccurrenceOfProduct.More (method)
  More(): boolean;

  // BRepGraph_RefsOccurrenceOfProduct.Next (method)
  Next(): void;

  // BRepGraph_RefsOccurrenceOfProduct.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_RefsOccurrenceOfProduct.Index (method)
  Index(): number;

  // BRepGraph_RefsOccurrenceOfProduct.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsOccurrenceOfProduct.delete (method)
  delete(): void;

  // BRepGraph_RefsOccurrenceOfProduct.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsShellOfSolid: declare class BRepGraph_RefsShellOfSolid

  // BRepGraph_RefsShellOfSolid.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_RefsShellOfSolid.More (method)
  More(): boolean;

  // BRepGraph_RefsShellOfSolid.Next (method)
  Next(): void;

  // BRepGraph_RefsShellOfSolid.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_RefsShellOfSolid.Index (method)
  Index(): number;

  // BRepGraph_RefsShellOfSolid.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsShellOfSolid.delete (method)
  delete(): void;

  // BRepGraph_RefsShellOfSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsSolidOfCompSolid: declare class BRepGraph_RefsSolidOfCompSolid

  // BRepGraph_RefsSolidOfCompSolid.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_RefsSolidOfCompSolid.More (method)
  More(): boolean;

  // BRepGraph_RefsSolidOfCompSolid.Next (method)
  Next(): void;

  // BRepGraph_RefsSolidOfCompSolid.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_RefsSolidOfCompSolid.Index (method)
  Index(): number;

  // BRepGraph_RefsSolidOfCompSolid.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsSolidOfCompSolid.delete (method)
  delete(): void;

  // BRepGraph_RefsSolidOfCompSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsWireOfFace: declare class BRepGraph_RefsWireOfFace

  // BRepGraph_RefsWireOfFace.constructor (constructor)
  constructor(theGraph: BRepGraph, theParent: unknown);

  // BRepGraph_RefsWireOfFace.More (method)
  More(): boolean;

  // BRepGraph_RefsWireOfFace.Next (method)
  Next(): void;

  // BRepGraph_RefsWireOfFace.CurrentId (method)
  CurrentId(): unknown;

  // BRepGraph_RefsWireOfFace.Index (method)
  Index(): number;

  // BRepGraph_RefsWireOfFace.end (method)
  end(): NCollection_ForwardRangeSentinel;

  // BRepGraph_RefsWireOfFace.delete (method)
  delete(): void;

  // BRepGraph_RefsWireOfFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsView: declare class BRepGraph_RefsView

  // BRepGraph_RefsView.Shells (method)
  Shells(): BRepGraph_RefsView_ShellOps;

  // BRepGraph_RefsView.Faces (method)
  Faces(): BRepGraph_RefsView_FaceOps;

  // BRepGraph_RefsView.Wires (method)
  Wires(): BRepGraph_RefsView_WireOps;

  // BRepGraph_RefsView.Vertices (method)
  Vertices(): BRepGraph_RefsView_VertexOps;

  // BRepGraph_RefsView.Solids (method)
  Solids(): BRepGraph_RefsView_SolidOps;

  // BRepGraph_RefsView.Children (method)
  Children(): BRepGraph_RefsView_ChildOps;

  // BRepGraph_RefsView.Occurrences (method)
  Occurrences(): BRepGraph_RefsView_OccurrenceOps;

  // BRepGraph_RefsView.Gen (method)
  Gen(): BRepGraph_RefsView_GenOps;

  // BRepGraph_RefsView.delete (method)
  delete(): void;

  // BRepGraph_RefsView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsView_ChildOps: declare class BRepGraph_RefsView_ChildOps

  // BRepGraph_RefsView_ChildOps.Nb (method)
  Nb(): number;

  // BRepGraph_RefsView_ChildOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_RefsView_ChildOps.StartId (method)
  StartId(): BRepGraph_ChildRefId;

  // BRepGraph_RefsView_ChildOps.EndId (method)
  EndId(): BRepGraph_ChildRefId;

  // BRepGraph_RefsView_ChildOps.Entry (method)
  Entry(theRefId: BRepGraph_ChildRefId): BRepGraphInc_ChildRef;

  // BRepGraph_RefsView_ChildOps.IdsOf (method)
  IdsOf(theCompound: BRepGraph_CompoundId): BRepGraph_ChildRefId[];

  // BRepGraph_RefsView_ChildOps.IdsReferencing (method)
  IdsReferencing(theChild: BRepGraph_NodeId): BRepGraph_ChildRefId[];

  // BRepGraph_RefsView_ChildOps.delete (method)
  delete(): void;

  // BRepGraph_RefsView_ChildOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsView_FaceOps: declare class BRepGraph_RefsView_FaceOps

  // BRepGraph_RefsView_FaceOps.Nb (method)
  Nb(): number;

  // BRepGraph_RefsView_FaceOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_RefsView_FaceOps.StartId (method)
  StartId(): BRepGraph_FaceRefId;

  // BRepGraph_RefsView_FaceOps.EndId (method)
  EndId(): BRepGraph_FaceRefId;

  // BRepGraph_RefsView_FaceOps.Entry (method)
  Entry(theRefId: BRepGraph_FaceRefId): BRepGraphInc_FaceRef;

  // BRepGraph_RefsView_FaceOps.IdsOf (method)
  IdsOf(theShell: BRepGraph_ShellId): BRepGraph_FaceRefId[];

  // BRepGraph_RefsView_FaceOps.delete (method)
  delete(): void;

  // BRepGraph_RefsView_FaceOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsView_GenOps: declare class BRepGraph_RefsView_GenOps

  // BRepGraph_RefsView_GenOps.Nb (method)
  Nb(theKind: BRepGraph_RefId_Kind): number;

  // BRepGraph_RefsView_GenOps.IsValid (method)
  IsValid(theRef: BRepGraph_RefId): boolean;

  // BRepGraph_RefsView_GenOps.IsActive (method)
  IsActive(theRef: BRepGraph_RefId): boolean;

  // BRepGraph_RefsView_GenOps.IsRemoved (method)
  IsRemoved(theRef: BRepGraph_RefId): boolean;

  // BRepGraph_RefsView_GenOps.RefAtStep (method)
  RefAtStep(theParent: BRepGraph_NodeId, theStep: number): BRepGraph_RefId;

  // BRepGraph_RefsView_GenOps.ChildNode (method)
  ChildNode(theRef: BRepGraph_RefId): BRepGraph_NodeId;

  // BRepGraph_RefsView_GenOps.LocalLocation (method)
  LocalLocation(theRef: BRepGraph_RefId): TopLoc_Location;

  // BRepGraph_RefsView_GenOps.Orientation (method)
  Orientation(theRef: BRepGraph_RefId): TopAbs_Orientation;

  // BRepGraph_RefsView_GenOps.delete (method)
  delete(): void;

  // BRepGraph_RefsView_GenOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsView_OccurrenceOps: declare class BRepGraph_RefsView_OccurrenceOps

  // BRepGraph_RefsView_OccurrenceOps.Nb (method)
  Nb(): number;

  // BRepGraph_RefsView_OccurrenceOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_RefsView_OccurrenceOps.StartId (method)
  StartId(): BRepGraph_OccurrenceRefId;

  // BRepGraph_RefsView_OccurrenceOps.EndId (method)
  EndId(): BRepGraph_OccurrenceRefId;

  // BRepGraph_RefsView_OccurrenceOps.Entry (method)
  Entry(theRefId: BRepGraph_OccurrenceRefId): BRepGraphInc_OccurrenceRef;

  // BRepGraph_RefsView_OccurrenceOps.IdsOf (method)
  IdsOf(theProduct: BRepGraph_ProductId): BRepGraph_OccurrenceRefId[];

  // BRepGraph_RefsView_OccurrenceOps.IdsReferencing (method)
  IdsReferencing(theChild: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];

  // BRepGraph_RefsView_OccurrenceOps.delete (method)
  delete(): void;

  // BRepGraph_RefsView_OccurrenceOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGraph_RefsView_ShellOps: declare class BRepGraph_RefsView_ShellOps

  // BRepGraph_RefsView_ShellOps.Nb (method)
  Nb(): number;

  // BRepGraph_RefsView_ShellOps.NbActive (method)
  NbActive(): number;

  // BRepGraph_RefsView_ShellOps.StartId (method)
  StartId(): BRepGraph_ShellRefId;

  // BRepGraph_RefsView_ShellOps.EndId (method)
  EndId(): BRepGraph_ShellRefId;

  // BRepGraph_RefsView_ShellOps.Entry (method)
  Entry(theRefId: BRepGraph_ShellRefId): BRepGraphInc_ShellRef;

  // BRepGraph_RefsView_ShellOps.IdsOf (method)
  IdsOf(theSolid: BRepGraph_SolidId): BRepGraph_ShellRefId[];

  // BRepGraph_RefsView_ShellOps.delete (method)
  delete(): void;

  // BRepGraph_RefsView_ShellOps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
