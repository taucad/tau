# libcascade — BRepGraph (6)

20 top-level symbols. Signatures are verbatim typescript.

BRepGraph_CoEdgePolygon2DRepId: declare class BRepGraph_CoEdgePolygon2DRepId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_CoEdgePolygonOnTriRepId: declare class BRepGraph_CoEdgePolygonOnTriRepId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_EdgeCurve3DRepId: declare class BRepGraph_EdgeCurve3DRepId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_EdgePolygon3DRepId: declare class BRepGraph_EdgePolygon3DRepId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FaceSurfaceRepId: declare class BRepGraph_FaceSurfaceRepId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_FaceTriangulationRepId: declare class BRepGraph_FaceTriangulationRepId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RepId: declare class BRepGraph_RepId

constructor

RepKind: BRepGraph_RepId_Kind

Index: number

static IsValidKind(theKind: BRepGraph_RepId_Kind): boolean;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

delete(): void;

[Symbol.dispose](): void;

BRepGraph_RepId_Kind: typeof BRepGraph_RepId_Kind[keyof typeof BRepGraph_RepId_Kind]

BRepGraph_ChildExplorer_Config: interface BRepGraph_ChildExplorer_Config

Mode: BRepGraph_ChildExplorer_TraversalMode

TargetKind: BRepGraph_NodeId_Kind | null | undefined

AvoidKind: BRepGraph_NodeId_Kind | null | undefined

EmitAvoidKind: boolean

AccumulateLocation: boolean

AccumulateOrientation: boolean

StartLoc: TopLoc_Location

StartOri: TopAbs_Orientation

BRepGraph_Compact_Result: interface BRepGraph_Compact_Result

NbRemovedVertices: number

NbRemovedEdges: number

NbRemovedWires: number

NbRemovedFaces: number

NbRemovedShells: number

NbRemovedSolids: number

NbRemovedCompounds: number

NbRemovedCompSolids: number

NbRemovedSurfaces: number

NbRemovedCurves: number

NbNodesBefore: number

NbNodesAfter: number

NbUnmappedActiveDefs: number

BRepGraph_Deduplicate_Options: interface BRepGraph_Deduplicate_Options

AnalyzeOnly: boolean

HistoryMode: boolean

MergeEntitiesWhenSafe: boolean

CompTolerance: number

HashTolerance: number

BRepGraph_Deduplicate_Result: interface BRepGraph_Deduplicate_Result

NbCanonicalSurfaces: number

NbCanonicalCurves: number

NbSurfaceRewrites: number

NbCurveRewrites: number

NbNullifiedSurfaces: number

NbNullifiedCurves: number

NbHistoryRecords: number

IsEntityMergeApplied: boolean

NbMergedVertices: number

NbMergedEdges: number

NbMergedWires: number

NbMergedFaces: number

NbReorderedWires: number

NbToleranceOrderedWires: number

NbPartialOrderedWires: number

AffectedFaces: BRepGraph_FaceId[]

AffectedEdges: BRepGraph_EdgeId[]

BRepGraph_EditorView_BoundaryIssue: interface BRepGraph_EditorView_BoundaryIssue

NodeId: BRepGraph_NodeId

Description: TCollection_AsciiString

BRepGraph_LayerHistory_Event: interface BRepGraph_LayerHistory_Event

OperationName: TCollection_AsciiString

SequenceNumber: number

RecordKind: BRepGraph_LayerHistory_Kind

Mapping: any

UidMapping: any

ItemUidMapping: any

ExtraInfo: TCollection_AsciiString

BRepGraph_LayerParametric_AddResult: interface BRepGraph_LayerParametric_AddResult

Instance: number

Root: BRepGraph_NodeId

BRepGraph_LayerTopoSupplement_Entry: interface BRepGraph_LayerTopoSupplement_Entry

BaseOwner: BRepGraph_NodeId

LocalUid: number

Kind: BRepGraph_LayerTopoSupplement_AttachmentKind

Shape: TopoDS_Shape

BRepGraph_ParallelPolicy_Workload: interface BRepGraph_ParallelPolicy_Workload

PrimaryItems: number

AuxiliaryItems: number

InteractionCount: number

BRepGraph_ParentExplorer_Config: interface BRepGraph_ParentExplorer_Config

Mode: BRepGraph_ParentExplorer_TraversalMode

TargetKind: BRepGraph_NodeId_Kind | null | undefined

AvoidKind: BRepGraph_NodeId_Kind | null | undefined

EmitAvoidKind: boolean

BRepGraph_ShapesView_Options: interface BRepGraph_ShapesView_Options

Populate: BRepGraphInc_Populate_Options

CreateAutoProduct: boolean

Flatten: boolean

Parallel: boolean

TrackAddedNodes: boolean

BRepGraph_Validate_Issue: interface BRepGraph_Validate_Issue

Sev: BRepGraph_Validate_Severity

NodeId: BRepGraph_NodeId

Description: TCollection_AsciiString
