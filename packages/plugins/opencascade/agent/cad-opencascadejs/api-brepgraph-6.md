# libcascade — BRepGraph (6)

16 top-level symbols. Signatures are verbatim typescript.

BRepGraph_ShapesView: declare class BRepGraph_ShapesView

Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId): BRepGraph_ShapesView_Result;
Add(theShape: TopoDS_Shape, theParent: BRepGraph_NodeId, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;

CollectHistoryInputs(theRoots: NCollection_Array1_BRepGraph_NodeId, theOutInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher): void;

AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputs: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;
AddWithHistory(theResultShape: TopoDS_Shape, theInputRoots: NCollection_Array1_BRepGraph_NodeId, theHistory: BRepTools_History, theOpLabel: TCollection_AsciiString, theOptions: BRepGraph_ShapesView_Options): BRepGraph_ShapesView_Result;

Shape(theNode: BRepGraph_NodeId): TopoDS_Shape;

HasOriginal(theNode: BRepGraph_NodeId): boolean;

Original(theNode: BRepGraph_NodeId): TopoDS_Shape;

Reconstruct(theRoot: BRepGraph_NodeId): TopoDS_Shape;

ClearCached(theNode: BRepGraph_NodeId): void;
ClearCached(theRef: BRepGraph_RefId): void;
ClearCached(theNode: BRepGraph_NodeId): void;
ClearCached(theRef: BRepGraph_RefId): void;

FindNode(theShape: TopoDS_Shape): BRepGraph_NodeId;

HasNode(theShape: TopoDS_Shape): boolean;

RemoveShape(theShape: TopoDS_Shape): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_ShapesView_AddStatus: typeof BRepGraph_ShapesView_AddStatus[keyof typeof BRepGraph_ShapesView_AddStatus]

BRepGraph_ShapesView_Result: declare class BRepGraph_ShapesView_Result

constructor

TopologyRoot: BRepGraph_NodeId

Product: BRepGraph_ProductId

Occurrence: BRepGraph_OccurrenceId

InsertedRef: BRepGraph_RefId

Status: BRepGraph_ShapesView_AddStatus

AddedNodes: NCollection_DataMap_TopoDS_Shape_BRepGraph_NodeId_TopTools_ShapeMapHasher

IsOk(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Lightweight mutation facade for runtime supplement attachments
BRepGraph_SupplementEditor: declare class BRepGraph_SupplementEditor

constructor

// Attach one supplemental shape to an arbitrary supported core owner
Attach(theOwner: BRepGraph_NodeId, theKind: BRepGraph_LayerTopoSupplement_AttachmentKind, theShape: TopoDS_Shape): number;
// theOwner: active owner node
// theKind: semantic attachment kind
// theShape: supplemental shape to attach

// Attach a supplemental shape to a vertex owner
AttachToVertex(theVertex: BRepGraph_VertexId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;
// theVertex: active vertex owner
// theShape: supplemental shape to attach
// theKind: semantic attachment kind

// Attach a supplemental shape to an edge owner
AttachToEdge(theEdge: BRepGraph_EdgeId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;
// theEdge: active edge owner
// theShape: supplemental shape to attach
// theKind: semantic attachment kind

// Attach a supplemental shape to a face owner
AttachToFace(theFace: BRepGraph_FaceId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;
// theFace: active face owner
// theShape: supplemental shape to attach
// theKind: semantic attachment kind

// Attach a supplemental shape to a solid owner
AttachToSolid(theSolid: BRepGraph_SolidId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;
// theSolid: active solid owner
// theShape: supplemental shape to attach
// theKind: semantic attachment kind

// Attach a supplemental shape to a compsolid owner
AttachToCompSolid(theCompSolid: BRepGraph_CompSolidId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;
// theCompSolid: active compsolid owner
// theShape: supplemental shape to attach
// theKind: semantic attachment kind

// Attach a supplemental shape to a shell owner
AttachToShell(theShell: BRepGraph_ShellId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;
// theShell: active shell owner
// theShape: supplemental shape to attach
// theKind: semantic attachment kind

// Attach a supplemental shape to a compound owner
AttachToCompound(theCompound: BRepGraph_CompoundId, theShape: TopoDS_Shape, theKind?: BRepGraph_LayerTopoSupplement_AttachmentKind): number;
// theCompound: active compound owner
// theShape: supplemental shape to attach
// theKind: semantic attachment kind

// Remove one attachment by uid
RemoveAttachment(theUid: number): boolean;
// theUid: layer-local attachment uid

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterator over supplemental `TopoDS` attachments owned by one core node
BRepGraph_SupplementIterator: declare class BRepGraph_SupplementIterator

constructor

// Return true when the iterator currently points to an attachment
More(): boolean;

// Advance to the next attachment
Next(): void;

// Return the current layer-local attachment uid
Uid(): number;

// Return the current attachment entry
Value(): BRepGraph_LayerTopoSupplement_Entry;

// Sentinel marking end of iteration
end(): NCollection_ForwardRangeSentinel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Centralized geometry access for {@link BRepGraph`BRepGraph`} - analogue of {@link BRep_Tool `BRep_Tool`}
BRepGraph_Tool: declare class BRepGraph_Tool

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Tool_CoEdge: declare class BRepGraph_Tool_CoEdge

constructor

static Orientation(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): TopAbs_Orientation;

static IsReversed(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

static EdgeOf(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_EdgeId;

static FaceOf(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_FaceId;

static SeamPair(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): BRepGraph_CoEdgeId;

static IsSeam(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

static HasPCurve(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

static SameParameter(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

static SameRange(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): boolean;

static PCurve(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): Geom2d_Curve;

static PCurveAdaptor(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): Geom2dAdaptor_Curve;
static PCurveAdaptor(theGraph: BRepGraph, theRef: any): Geom2dAdaptor_Curve;
static PCurveAdaptor(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): Geom2dAdaptor_Curve;
static PCurveAdaptor(theGraph: BRepGraph, theRef: any): Geom2dAdaptor_Curve;

static UVPoints(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): [gp_Pnt2d, gp_Pnt2d];

static Range(theGraph: BRepGraph, theCoEdge: BRepGraph_CoEdgeId): [number, number];

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Tool_Edge: declare class BRepGraph_Tool_Edge

constructor

static Tolerance(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): number;

static Degenerated(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

static IsClosed(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

static Range(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): [number, number];

static StartVertexId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): BRepGraph_VertexRefId;

static EndVertexId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): BRepGraph_VertexRefId;

static HasCurve(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

static Curve(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): Geom_Curve;
static Curve(theGraph: BRepGraph, theRef: any): Geom_Curve;
static Curve(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): Geom_Curve;
static Curve(theGraph: BRepGraph, theRef: any): Geom_Curve;

static CurveAdaptor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): GeomAdaptor_TransformedCurve;
static CurveAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedCurve;
static CurveAdaptor(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): GeomAdaptor_TransformedCurve;
static CurveAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedCurve;

static FindByVertices(theGraph: BRepGraph, theStartVertex: BRepGraph_VertexId, theEndVertex: BRepGraph_VertexId, theToIgnoreOrientation?: boolean): BRepGraph_EdgeId;

static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;
static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
static FindPCurveCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;

static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;
static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): BRepGraph_CoEdgeId;
static FindCoEdgeId(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId, theOrientation: TopAbs_Orientation): BRepGraph_CoEdgeId;

static NbFaces(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): number;

static IsManifold(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

static IsBoundary(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId): boolean;

static IsSeamOnFace(theGraph: BRepGraph, theEdge: BRepGraph_EdgeId, theFace: BRepGraph_FaceId): boolean;

static CurveOnSurface(theGraph: BRepGraph, theRef: any, theFace: BRepGraph_FaceId): Adaptor3d_CurveOnSurface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Tool_Face: declare class BRepGraph_Tool_Face

constructor

static Usage(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): any;

static Tolerance(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
static Tolerance(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;
static Tolerance(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
static Tolerance(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;

static HasSurface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): boolean;
static HasSurface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): boolean;
static HasSurface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): boolean;
static HasSurface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): boolean;

static OuterWire(theGraph: BRepGraph, theFace: BRepGraph_FaceId): BRepGraph_WireId;
static OuterWire(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): BRepGraph_WireId;
static OuterWire(theGraph: BRepGraph, theFace: BRepGraph_FaceId): BRepGraph_WireId;
static OuterWire(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): BRepGraph_WireId;

static Surface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): Geom_Surface;
static Surface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): Geom_Surface;
static Surface(theGraph: BRepGraph, theFace: BRepGraph_FaceId): Geom_Surface;
static Surface(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): Geom_Surface;

static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theRef: any, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;
static SurfaceAdaptor(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUFirst: number, theULast: number, theVFirst: number, theVLast: number): GeomAdaptor_TransformedSurface;

static NbWires(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
static NbWires(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;
static NbWires(theGraph: BRepGraph, theFace: BRepGraph_FaceId): number;
static NbWires(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId): number;

static Bounds(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };
static Bounds(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };
static Bounds(theGraph: BRepGraph, theFace: BRepGraph_FaceId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };
static Bounds(theGraph: BRepGraph, theFaceRef: BRepGraph_FaceRefId, theUMin: number, theUMax: number, theVMin: number, theVMax: number): { theUMin: number; theUMax: number; theVMin: number; theVMax: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Tool_Shell: declare class BRepGraph_Tool_Shell

constructor

static Usage(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): any;

static IsClosed(theGraph: BRepGraph, theShell: BRepGraph_ShellId): boolean;
static IsClosed(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): boolean;
static IsClosed(theGraph: BRepGraph, theShell: BRepGraph_ShellId): boolean;
static IsClosed(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): boolean;

static NbFaces(theGraph: BRepGraph, theShell: BRepGraph_ShellId): number;
static NbFaces(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): number;
static NbFaces(theGraph: BRepGraph, theShell: BRepGraph_ShellId): number;
static NbFaces(theGraph: BRepGraph, theShellRef: BRepGraph_ShellRefId): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Tool_Vertex: declare class BRepGraph_Tool_Vertex

constructor

static Usage(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): any;

static Pnt(theGraph: BRepGraph, theRef: any): gp_Pnt;
static Pnt(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): gp_Pnt;
static Pnt(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): gp_Pnt;
static Pnt(theGraph: BRepGraph, theRef: any): gp_Pnt;
static Pnt(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): gp_Pnt;
static Pnt(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): gp_Pnt;
static Pnt(theGraph: BRepGraph, theRef: any): gp_Pnt;
static Pnt(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): gp_Pnt;
static Pnt(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): gp_Pnt;

static Tolerance(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): number;
static Tolerance(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): number;
static Tolerance(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): number;
static Tolerance(theGraph: BRepGraph, theVertexRef: BRepGraph_VertexRefId): number;

static NbEdges(theGraph: BRepGraph, theVertex: BRepGraph_VertexId): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_Tool_Wire: declare class BRepGraph_Tool_Wire

constructor

static Usage(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): any;

static IsClosed(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
static IsClosed(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;
static IsClosed(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
static IsClosed(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;

static NbCoEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
static NbCoEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;
static NbCoEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
static NbCoEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;

static NbDistinctEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
static NbDistinctEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;
static NbDistinctEdges(theGraph: BRepGraph, theWire: BRepGraph_WireId): number;
static NbDistinctEdges(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): number;

static FaceOf(theGraph: BRepGraph, theWire: BRepGraph_WireId): BRepGraph_FaceId;
static FaceOf(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): BRepGraph_FaceId;
static FaceOf(theGraph: BRepGraph, theWire: BRepGraph_WireId): BRepGraph_FaceId;
static FaceOf(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): BRepGraph_FaceId;

static IsOuter(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
static IsOuter(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;
static IsOuter(theGraph: BRepGraph, theWire: BRepGraph_WireId): boolean;
static IsOuter(theGraph: BRepGraph, theWireRef: BRepGraph_WireRefId): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView: declare class BRepGraph_TopoView

Faces(): BRepGraph_TopoView_FaceOps;

Edges(): BRepGraph_TopoView_EdgeOps;

Vertices(): BRepGraph_TopoView_VertexOps;

Wires(): BRepGraph_TopoView_WireOps;

Shells(): BRepGraph_TopoView_ShellOps;

Solids(): BRepGraph_TopoView_SolidOps;

CoEdges(): BRepGraph_TopoView_CoEdgeOps;

Compounds(): BRepGraph_TopoView_CompoundOps;

CompSolids(): BRepGraph_TopoView_CompSolidOps;

Products(): BRepGraph_TopoView_ProductOps;

Occurrences(): BRepGraph_TopoView_OccurrenceOps;

Gen(): BRepGraph_TopoView_GenOps;

Geometry(): BRepGraph_TopoView_GeometryOps;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_CoEdgeOps: declare class BRepGraph_TopoView_CoEdgeOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_CoEdgeId;

EndId(): BRepGraph_CoEdgeId;

Definition(theCoEdge: BRepGraph_CoEdgeId): BRepGraphInc_CoEdgeDef;

Edge(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_EdgeId;

Face(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_FaceId;

Wire(theCoEdge: BRepGraph_CoEdgeId): BRepGraph_WireId;

Curve2D(theCoEdge: BRepGraph_CoEdgeId): Geom2d_Curve;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_CompSolidOps: declare class BRepGraph_TopoView_CompSolidOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_CompSolidId;

EndId(): BRepGraph_CompSolidId;

Definition(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidDef;

Relations(theCompSolid: BRepGraph_CompSolidId): BRepGraphInc_CompSolidRelations;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

BRepGraph_TopoView_CompoundOps: declare class BRepGraph_TopoView_CompoundOps

Nb(): number;

NbActive(): number;

StartId(): BRepGraph_CompoundId;

EndId(): BRepGraph_CompoundId;

Definition(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundDef;

Relations(theCompound: BRepGraph_CompoundId): BRepGraphInc_CompoundRelations;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
