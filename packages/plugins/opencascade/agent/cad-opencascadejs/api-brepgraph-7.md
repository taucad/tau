# libcascade — BRepGraph (7)

43 top-level symbols. Signatures are verbatim typescript.

BRepGraph_TopoView_EdgeOps: declare class BRepGraph_TopoView_EdgeOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_EdgeId;

EndId(): BRepGraph_EdgeId;

Definition(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;

Relations(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeRelations;

NbFaces(theEdge: BRepGraph_EdgeId): number;

WiresOf(theEdge: BRepGraph_EdgeId): BRepGraph_WiresOfEdge;
WiresOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_WiresOfEdge;
WiresOf(theEdge: BRepGraph_EdgeId): BRepGraph_WiresOfEdge;
WiresOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_WiresOfEdge;

FacesOf(theEdge: BRepGraph_EdgeId): BRepGraph_FacesOfEdge;
FacesOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_FacesOfEdge;
FacesOf(theEdge: BRepGraph_EdgeId): BRepGraph_FacesOfEdge;
FacesOf(theEdge: BRepGraph_EdgeId, theStartIndex: number): BRepGraph_FacesOfEdge;

CoEdges(theEdge: BRepGraph_EdgeId): BRepGraph_CoEdgeId[];

Curve3D(theEdge: BRepGraph_EdgeId): Geom_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_FaceOps: declare class BRepGraph_TopoView_FaceOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_FaceId;

EndId(): BRepGraph_FaceId;

Definition(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;

Relations(theFace: BRepGraph_FaceId): BRepGraphInc_FaceRelations;

Surface(theFace: BRepGraph_FaceId): Geom_Surface;

ActiveTriangulation(theFace: BRepGraph_FaceId): Poly_Triangulation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_GenOps: declare class BRepGraph_TopoView_GenOps

TopoEntity(theId: BRepGraph_NodeId): BRepGraphInc_BaseDef;

CompoundRefIds(theChild: BRepGraph_NodeId): BRepGraph_ChildRefId[];

OccurrenceRefIds(theChild: BRepGraph_NodeId): BRepGraph_OccurrenceRefId[];

HasCompoundParents(theNode: BRepGraph_NodeId): boolean;

HasOccurrenceParents(theNode: BRepGraph_NodeId): boolean;

NbNodes(): number;

Nb(theKind: BRepGraph_NodeId_Kind): number;

IsValid(theNode: BRepGraph_NodeId): boolean;

IsActive(theNode: BRepGraph_NodeId): boolean;

IsRemoved(theNode: BRepGraph_NodeId): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_GeometryOps: declare class BRepGraph_TopoView_GeometryOps

NbFaceSurfaces(): number;

NbEdgeCurves3D(): number;

NbCoEdgeCurves2D(): number;

NbActiveFaceSurfaces(): number;

NbActiveEdgeCurves3D(): number;

NbActiveCoEdgeCurves2D(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_OccurrenceOps: declare class BRepGraph_TopoView_OccurrenceOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_OccurrenceId;

EndId(): BRepGraph_OccurrenceId;

Definition(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceDef;

Relations(theOccurrence: BRepGraph_OccurrenceId): BRepGraphInc_OccurrenceRelations;

Product(theOccurrence: BRepGraph_OccurrenceId): BRepGraph_ProductId;

ParentProduct(theOccurrence: BRepGraph_OccurrenceId): BRepGraph_ProductId;

OccurrenceLocation(theOccurrence: BRepGraph_OccurrenceId): TopLoc_Location;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_ProductOps: declare class BRepGraph_TopoView_ProductOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_ProductId;

EndId(): BRepGraph_ProductId;

Definition(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductDef;

Relations(theProduct: BRepGraph_ProductId): BRepGraphInc_ProductRelations;

ShapeRoot(theProduct: BRepGraph_ProductId): BRepGraph_NodeId;

IsAssembly(theProduct: BRepGraph_ProductId): boolean;

IsPart(theProduct: BRepGraph_ProductId): boolean;

ShapeRootNode(theProduct: BRepGraph_ProductId): BRepGraph_NodeId;

NbComponents(theProduct: BRepGraph_ProductId): number;

Component(theProduct: BRepGraph_ProductId, theComponentIdx: number): BRepGraph_OccurrenceId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_ShellOps: declare class BRepGraph_TopoView_ShellOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_ShellId;

EndId(): BRepGraph_ShellId;

Definition(theShell: BRepGraph_ShellId): BRepGraphInc_ShellDef;

Relations(theShell: BRepGraph_ShellId): BRepGraphInc_ShellRelations;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_SolidOps: declare class BRepGraph_TopoView_SolidOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_SolidId;

EndId(): BRepGraph_SolidId;

Definition(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidDef;

Relations(theSolid: BRepGraph_SolidId): BRepGraphInc_SolidRelations;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_VertexOps: declare class BRepGraph_TopoView_VertexOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_VertexId;

EndId(): BRepGraph_VertexId;

Definition(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexDef;

Relations(theVertex: BRepGraph_VertexId): BRepGraphInc_VertexRelations;

Edges(theVertex: BRepGraph_VertexId): BRepGraph_EdgeId[];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_WireOps: declare class BRepGraph_TopoView_WireOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_WireId;

EndId(): BRepGraph_WireId;

Definition(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;

Relations(theWire: BRepGraph_WireId): BRepGraphInc_WireRelations;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Graph-to-graph transformation
BRepGraph_Transform: declare class BRepGraph_Transform

// Transform the entire graph into a target graph
static Perform(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theTrsf: gp_Trsf, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy): boolean;
// theSourceGraph: a pre-built {@link BRepGraph`BRepGraph`} (must not be empty)
// theTargetGraph: destination graph (may already contain data)
// theTrsf: the transformation to apply
// theGeomPolicy: geometry handle policy (default
// theMeshPolicy: mesh data policy (default

// Transform a single node sub-graph of any kind
static TransformNode(theSourceGraph: BRepGraph, theTargetGraph: BRepGraph, theNodeId: BRepGraph_NodeId, theTrsf: gp_Trsf, theGeomPolicy?: BRepGraph_Copy_GeomPolicy, theMeshPolicy?: BRepGraph_Copy_MeshPolicy): BRepGraph_NodeId;
// theSourceGraph: a pre-built {@link BRepGraph`BRepGraph`}
// theTargetGraph: destination graph (may already contain data)
// theNodeId: node identifier (any kind)
// theTrsf: the transformation to apply
// theGeomPolicy: geometry handle policy (default
// theMeshPolicy: mesh data policy (default

// Apply an in-place location-only transform to a child reference
static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId, theTrsf: gp_Trsf): boolean;
static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId, theTrsf: gp_Trsf): boolean;
static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_ChildRefId, theTrsf: gp_Trsf): boolean;
static MoveRef(theGraph: BRepGraph, theRefId: BRepGraph_OccurrenceRefId, theTrsf: gp_Trsf): boolean;
// theGraph: the graph containing the reference
// theRefId: child reference to move
// theTrsf: the transformation to compose into the location

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Unique definition-node identifier within a {@link BRepGraph`BRepGraph`}
BRepGraph_UID: declare class BRepGraph_UID

constructor

Kind: BRepGraph_NodeId_Kind

Counter: number

// Factory
static Invalid(): BRepGraph_UID;

// True if this UID has a valid kind and a non-zero counter
IsValid(): boolean;

IsTopology(): boolean;

IsAssembly(): boolean;

// Hash value compatible with operator==
HashValue(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_UIDsView: declare class BRepGraph_UIDsView

Of(theNode: BRepGraph_NodeId): BRepGraph_UID;
Of(theRefId: BRepGraph_RefId): BRepGraph_RefUID;
Of(theItem: BRepGraph_ItemId): BRepGraph_ItemUID;
Of(theNode: BRepGraph_NodeId): BRepGraph_UID;
Of(theRefId: BRepGraph_RefId): BRepGraph_RefUID;
Of(theItem: BRepGraph_ItemId): BRepGraph_ItemUID;
Of(theNode: BRepGraph_NodeId): BRepGraph_UID;
Of(theRefId: BRepGraph_RefId): BRepGraph_RefUID;
Of(theItem: BRepGraph_ItemId): BRepGraph_ItemUID;

NodeIdFrom(theUID: BRepGraph_UID): BRepGraph_NodeId;

RefIdFrom(theUID: BRepGraph_RefUID): BRepGraph_RefId;

ItemIdFrom(theUID: BRepGraph_ItemUID): BRepGraph_ItemId;

Has(theUID: BRepGraph_UID): boolean;
Has(theUID: BRepGraph_RefUID): boolean;
Has(theUID: BRepGraph_ItemUID): boolean;
Has(theUID: BRepGraph_UID): boolean;
Has(theUID: BRepGraph_RefUID): boolean;
Has(theUID: BRepGraph_ItemUID): boolean;
Has(theUID: BRepGraph_UID): boolean;
Has(theUID: BRepGraph_RefUID): boolean;
Has(theUID: BRepGraph_ItemUID): boolean;

Generation(): number;

GraphGUID(): Standard_GUID;

StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;
StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;
StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;
StampOf(theNode: BRepGraph_NodeId): BRepGraph_VersionStamp;
StampOf(theRefId: BRepGraph_RefId): BRepGraph_VersionStamp;
StampOf(theRepId: BRepGraph_RepId): BRepGraph_VersionStamp;
StampOf(theItem: BRepGraph_ItemId): BRepGraph_VersionStamp;

IsStale(theStamp: BRepGraph_VersionStamp): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Explicit identity of a concrete usage from traversal root to selected node
BRepGraph_UsagePath: declare class BRepGraph_UsagePath

constructor

// Returns the number of steps in the path
Size(): number;

// Returns true if the path has no steps
IsEmpty(): boolean;

// Returns the step at the given index
Value(theIdx: number): BRepGraph_UsagePath_Step;
// theIdx: zero-based index

// Returns the first step in the path
First(): BRepGraph_UsagePath_Step;

// Returns the last step in the path
Last(): BRepGraph_UsagePath_Step;

// Appends a step to the end of the path
Append(theStep: BRepGraph_UsagePath_Step): void;
// theStep: step to append

// Inserts a step before the given index
InsertBefore(theIdx: number, theStep: BRepGraph_UsagePath_Step): void;
// theIdx: zero-based index to insert before
// theStep: step to insert

// Removes all steps from the path
Clear(): void;

// Returns true if this path is equal to the other path
IsEqual(theOther: BRepGraph_UsagePath): boolean;
// theOther: path to compare with

// Returns a hash code for this path
HashCode(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_UsagePath_Step: declare class BRepGraph_UsagePath_Step

constructor

Node: BRepGraph_NodeId

Ref: BRepGraph_RefId

StepIndex: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Structural invariant checker for {@link BRepGraph`BRepGraph`}
BRepGraph_Validate: declare class BRepGraph_Validate

// Run default lightweight structural checks on a built graph
static Perform(theGraph: BRepGraph): BRepGraph_Validate_Result;
static Perform(theGraph: BRepGraph, theMode: BRepGraph_Validate_Mode): BRepGraph_Validate_Result;
static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Validate_Options): BRepGraph_Validate_Result;
static Perform(theGraph: BRepGraph): BRepGraph_Validate_Result;
static Perform(theGraph: BRepGraph, theMode: BRepGraph_Validate_Mode): BRepGraph_Validate_Result;
static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Validate_Options): BRepGraph_Validate_Result;
static Perform(theGraph: BRepGraph): BRepGraph_Validate_Result;
static Perform(theGraph: BRepGraph, theMode: BRepGraph_Validate_Mode): BRepGraph_Validate_Result;
static Perform(theGraph: BRepGraph, theOptions: BRepGraph_Validate_Options): BRepGraph_Validate_Result;
// theGraph: graph to validate (const, read-only)

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Severity level for reported issues
BRepGraph_Validate_Severity: typeof BRepGraph_Validate_Severity[keyof typeof BRepGraph_Validate_Severity]

// Validation mode controlling check depth/performance trade-off
BRepGraph_Validate_Mode: typeof BRepGraph_Validate_Mode[keyof typeof BRepGraph_Validate_Mode]

BRepGraph_Validate_Options: declare class BRepGraph_Validate_Options

constructor

ValidationMode: BRepGraph_Validate_Mode

static Lightweight(): BRepGraph_Validate_Options;

static Audit(): BRepGraph_Validate_Options;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Validate_Result: declare class BRepGraph_Validate_Result

constructor

Issues: BRepGraph_Validate_Issue[]

IsValid(): boolean;

NbIssues(theSev: BRepGraph_Validate_Severity): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Snapshot of a graph item identity and its freshness generation
BRepGraph_VersionStamp: declare class BRepGraph_VersionStamp

constructor

myNodeUID: BRepGraph_UID

myRefUID: BRepGraph_RefUID

myMutationGen: number

myGeneration: number

myDomain: BRepGraph_VersionStamp_Domain

// Check if the stamp has a valid identity in its domain
IsValid(): boolean;

// True when this is a definition-node-domain stamp
IsNodeStamp(): boolean;

// True when this is a reference-domain stamp
IsRefStamp(): boolean;

// Return the active generic item identity
ItemUID(): BRepGraph_ItemUID;

// Check if two stamps refer to the same graph item regardless of version
IsSameItem(theOther: BRepGraph_VersionStamp): boolean;
// theOther: stamp to compare with

// Derive a deterministic {@link Standard_GUID`Standard_GUID`} from this stamp
ToGUID(theGraphGUID: Standard_GUID): Standard_GUID;
// theGraphGUID: the owning graph's identity GUID

// Compute hash value consistent with operator==
HashValue(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Identity domain encoded in this stamp
BRepGraph_VersionStamp_Domain: typeof BRepGraph_VersionStamp_Domain[keyof typeof BRepGraph_VersionStamp_Domain]

BRepGraph_CoEdgeCurve2DRepId: declare class BRepGraph_CoEdgeCurve2DRepId

constructor

Index: number

static Start(): unknown;

static Invalid(): unknown;

IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

IsRemoved(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lightweight typed index into a per-kind use-record vector inside {@link BRepGraph`BRepGraph`}
BRepGraph_RepId: declare class BRepGraph_RepId

constructor

RepKind: BRepGraph_RepId_Kind

Index: number

// True if the kind value is one of the supported use-record kinds
static IsValidKind(theKind: BRepGraph_RepId_Kind): boolean;

// True if this id points to an allocated slot
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;
IsValid(): boolean;
IsValid(theMaxCount: number): boolean;

// Return true if this use entry has been soft-removed in the given graph
IsRemoved(theGraph: BRepGraph): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Enumeration of use-record kinds
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
