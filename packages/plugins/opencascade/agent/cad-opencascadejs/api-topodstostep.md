# libcascade — TopoDSToStep

23 top-level symbols. Signatures are verbatim typescript.

TopoDSToStep: declare class TopoDSToStep

constructor

static DecodeBuilderError(E: TopoDSToStep_BuilderError): TCollection_HAsciiString;

static DecodeFaceError(E: TopoDSToStep_MakeFaceError): TCollection_HAsciiString;

static DecodeWireError(E: TopoDSToStep_MakeWireError): TCollection_HAsciiString;

static DecodeEdgeError(E: TopoDSToStep_MakeEdgeError): TCollection_HAsciiString;

static DecodeVertexError(E: TopoDSToStep_MakeVertexError): TCollection_HAsciiString;

static AddResult(FP: Transfer_FinderProcess, Shape: TopoDS_Shape, entity: Standard_Transient): void;
static AddResult(FP: Transfer_FinderProcess, Tool: TopoDSToStep_Tool): void;
static AddResult(FP: Transfer_FinderProcess, Shape: TopoDS_Shape, entity: Standard_Transient): void;
static AddResult(FP: Transfer_FinderProcess, Tool: TopoDSToStep_Tool): void;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_Builder: declare class TopoDSToStep_Builder extends TopoDSToStep_Root

constructor

Init(S: TopoDS_Shape, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theTessellatedGeomParam: number, theLocalFactors?: StepData_Factors, theProgress?: Message_ProgressRange): void;

Error(): TopoDSToStep_BuilderError;

Value(): StepShape_TopologicalRepresentationItem;

TessellatedValue(): StepVisual_TessellatedItem;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_BuilderError: typeof TopoDSToStep_BuilderError[keyof typeof TopoDSToStep_BuilderError]

TopoDSToStep_FacetedError: typeof TopoDSToStep_FacetedError[keyof typeof TopoDSToStep_FacetedError]

TopoDSToStep_FacetedTool: declare class TopoDSToStep_FacetedTool

constructor

static CheckTopoDSShape(SH: TopoDS_Shape): TopoDSToStep_FacetedError;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeBrepWithVoids: declare class TopoDSToStep_MakeBrepWithVoids extends TopoDSToStep_Root

constructor

Value(): StepShape_BrepWithVoids;

TessellatedValue(): StepVisual_TessellatedItem;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeEdgeError: typeof TopoDSToStep_MakeEdgeError[keyof typeof TopoDSToStep_MakeEdgeError]

TopoDSToStep_MakeFaceError: typeof TopoDSToStep_MakeFaceError[keyof typeof TopoDSToStep_MakeFaceError]

TopoDSToStep_MakeFacetedBrep: declare class TopoDSToStep_MakeFacetedBrep extends TopoDSToStep_Root

constructor

Value(): StepShape_FacetedBrep;

TessellatedValue(): StepVisual_TessellatedItem;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeFacetedBrepAndBrepWithVoids: declare class TopoDSToStep_MakeFacetedBrepAndBrepWithVoids extends TopoDSToStep_Root

constructor

Value(): StepShape_FacetedBrepAndBrepWithVoids;

TessellatedValue(): StepVisual_TessellatedItem;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeGeometricCurveSet: declare class TopoDSToStep_MakeGeometricCurveSet extends TopoDSToStep_Root

constructor

Value(): StepShape_GeometricCurveSet;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeManifoldSolidBrep: declare class TopoDSToStep_MakeManifoldSolidBrep extends TopoDSToStep_Root

constructor

Value(): StepShape_ManifoldSolidBrep;

TessellatedValue(): StepVisual_TessellatedItem;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeShellBasedSurfaceModel: declare class TopoDSToStep_MakeShellBasedSurfaceModel extends TopoDSToStep_Root

constructor

Value(): StepShape_ShellBasedSurfaceModel;

TessellatedValue(): StepVisual_TessellatedItem;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeStepEdge: declare class TopoDSToStep_MakeStepEdge extends TopoDSToStep_Root

constructor

Init(E: TopoDS_Edge, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

Value(): StepShape_TopologicalRepresentationItem;

Error(): TopoDSToStep_MakeEdgeError;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeStepFace: declare class TopoDSToStep_MakeStepFace extends TopoDSToStep_Root

constructor

Init(F: TopoDS_Face, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

Value(): StepShape_TopologicalRepresentationItem;

Error(): TopoDSToStep_MakeFaceError;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeStepVertex: declare class TopoDSToStep_MakeStepVertex extends TopoDSToStep_Root

constructor

Init(V: TopoDS_Vertex, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

Value(): StepShape_TopologicalRepresentationItem;

Error(): TopoDSToStep_MakeVertexError;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeStepWire: declare class TopoDSToStep_MakeStepWire extends TopoDSToStep_Root

constructor

Init(W: TopoDS_Wire, T: TopoDSToStep_Tool, FP: Transfer_FinderProcess, theLocalFactors?: StepData_Factors): void;

Value(): StepShape_TopologicalRepresentationItem;

Error(): TopoDSToStep_MakeWireError;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeTessellatedItem: declare class TopoDSToStep_MakeTessellatedItem extends TopoDSToStep_Root

constructor

Init(theFace: TopoDS_Face, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theToPreferSurfaceSet: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theShell: TopoDS_Shell, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theFace: TopoDS_Face, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theToPreferSurfaceSet: boolean, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;
Init(theShell: TopoDS_Shell, theTool: TopoDSToStep_Tool, theFP: Transfer_FinderProcess, theLocalFactors: StepData_Factors, theProgress: Message_ProgressRange): void;

Value(): StepVisual_TessellatedItem;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_MakeVertexError: typeof TopoDSToStep_MakeVertexError[keyof typeof TopoDSToStep_MakeVertexError]

TopoDSToStep_MakeWireError: typeof TopoDSToStep_MakeWireError[keyof typeof TopoDSToStep_MakeWireError]

TopoDSToStep_Root: declare class TopoDSToStep_Root

Tolerance(): number;

IsDone(): boolean;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_Tool: declare class TopoDSToStep_Tool

constructor

Init(M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, FacetedContext: boolean, theSurfCurveMode: number): void;

IsBound(S: TopoDS_Shape): boolean;

Bind(S: TopoDS_Shape, T: StepShape_TopologicalRepresentationItem): void;

Find(S: TopoDS_Shape): StepShape_TopologicalRepresentationItem;

Faceted(): boolean;

SetCurrentShell(S: TopoDS_Shell): void;

CurrentShell(): TopoDS_Shell;

SetCurrentFace(F: TopoDS_Face): void;

CurrentFace(): TopoDS_Face;

SetCurrentWire(W: TopoDS_Wire): void;

CurrentWire(): TopoDS_Wire;

SetCurrentEdge(E: TopoDS_Edge): void;

CurrentEdge(): TopoDS_Edge;

SetCurrentVertex(V: TopoDS_Vertex): void;

CurrentVertex(): TopoDS_Vertex;

Lowest3DTolerance(): number;

SetSurfaceReversed(B: boolean): void;

SurfaceReversed(): boolean;

Map(): NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher;

PCurveMode(): number;

delete(): void;

[Symbol.dispose](): void;

TopoDSToStep_WireframeBuilder: declare class TopoDSToStep_WireframeBuilder extends TopoDSToStep_Root

constructor

Init(S: TopoDS_Shape, T: TopoDSToStep_Tool, theLocalFactors?: StepData_Factors): void;

Error(): TopoDSToStep_BuilderError;

Value(): NCollection_HSequence_handle_Standard_Transient;

GetTrimmedCurveFromEdge(E: TopoDS_Edge, F: TopoDS_Face, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

GetTrimmedCurveFromFace(F: TopoDS_Face, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

GetTrimmedCurveFromShape(S: TopoDS_Shape, M: NCollection_DataMap_TopoDS_Shape_handle_Standard_Transient_TopTools_ShapeMapHasher, theLocalFactors: StepData_Factors): { returnValue: boolean; L: NCollection_HSequence_handle_Standard_Transient; [Symbol.dispose](): void };

delete(): void;

[Symbol.dispose](): void;
